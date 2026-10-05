class_name EnemySystem
extends Node
## Spawns enemies from the pool, runs their behaviors and attacks, applies damage and fortress
## contact (GAME_DESIGN.md sections 5 and 9). Any enemy touching the fortress radius deals its
## contact damage and is destroyed; enemies destroyed by weapons count as kills unless their
## definition says otherwise (launched torpedoes, missiles, mines). Gun and cannon attacks cannot
## be dodged and hit the base directly; launch attacks spawn a projectile enemy that can be shot
## down; bombs hit the base and anything near them. Enemies with boat damage (Salvage Hunters,
## mines) also ram the salvage boat while it is on the water. Landing Craft knock out a turret.
##
## Shields absorb damage before hull HP and regenerate after a delay without hits; Shield
## Frigates pulse shield onto nearby allies; elites regenerate or split according to their
## modifier (section 5).

const KILL_BURST_COLOR := Color("ffb347")
const RAM_BURST_COLOR := Color("ff6b57")
const GUN_TRACER_COLOR := Color(1.0, 0.85, 0.5, 0.9)
const CANNON_TRACER_COLOR := Color(1.0, 0.55, 0.3, 0.95)

## Enemies currently in the world.
var active: Array[Enemy] = []
var grid: SpatialGrid
var run_state: RunState
var fx: FxLayer
var scaling: WaveScaling
var salvage: SalvageSystem
var fortress_center := Vector2.ZERO
var fortress_radius := 0.0
var separation_radius := 0.0
var separation_strength := 0.0
var shield_regen_delay := 0.0
var shield_regen_rate := 0.0
var elite_config: Dictionary = {}

var _pool: ObjectPool
var _defs: Dictionary = {}
## One behavior instance per enemy type, built once in setup().
var _behaviors: Dictionary = {}
## Enemies spawned while tick() iterates `active` (launched torpedoes); appended after it.
var _pending: Array[Enemy] = []
var _ticking := false


func setup(layer: Node2D, defs: Dictionary, balance: Dictionary, prewarm: int) -> void:
	_defs = defs
	fortress_radius = float(balance["fortress"]["radius"])
	separation_radius = float(balance["steering"]["separation_radius"])
	separation_strength = float(balance["steering"]["separation_strength"])
	shield_regen_delay = float(balance["shields"]["regen_delay"])
	shield_regen_rate = float(balance["shields"]["regen_rate"])
	elite_config = balance["elites"]
	_behaviors.clear()
	for id: String in defs:
		var def: Dictionary = defs[id]
		var behavior := _make_behavior(str(def["behavior"]), def.get("behavior_params", {}))
		if behavior == null:
			push_error("Enemy '%s' has unknown behavior '%s'" % [id, def["behavior"]])
			continue
		_behaviors[id] = behavior
	_pool = ObjectPool.new(func() -> Enemy: return Enemy.new(), layer)
	_pool.prewarm(prewarm)


## Spawns an enemy scaled for `wave` (H, A and S from section 6).
func spawn(enemy_id: String, at: Vector2, wave := 1) -> Enemy:
	if not _behaviors.has(enemy_id):
		push_error("Cannot spawn unknown enemy '%s'" % enemy_id)
		return null
	var enemy: Enemy = _pool.acquire()
	enemy.setup(_defs[enemy_id], _behaviors[enemy_id], wave, scaling.hp_multiplier(wave),
			scaling.damage_multiplier(wave), scaling.speed_multiplier(wave))
	enemy.position = at
	enemy.rotation = (fortress_center - at).angle()
	enemy.behavior.on_spawn(enemy, run_state.rng_waves)
	if _ticking:
		_pending.append(enemy)
	else:
		active.append(enemy)
	EventBus.enemy_spawned.emit(enemy)
	return enemy


func alive_count() -> int:
	return active.size() + _pending.size()


## Damage after armor and crits; the shield absorbs it first.
func apply_damage(enemy: Enemy, amount: float) -> void:
	if not enemy.alive:
		return
	var absorbed := minf(enemy.shield, amount)
	enemy.shield -= absorbed
	enemy.hp -= amount - absorbed
	enemy.since_hit = 0.0
	enemy.flash()
	if enemy.hp > 0.0:
		return
	fx.burst(enemy.position, enemy.radius * 1.8, KILL_BURST_COLOR)
	_remove(enemy)
	if enemy.counts_as_kill:
		run_state.kills += 1
		EventBus.enemy_killed.emit(enemy, enemy.position)
	if enemy.elite == Enemy.Elite.SPLITTING:
		for i in int(elite_config["split_count"]):
			var offset := Vector2.from_angle(TAU * i / float(elite_config["split_count"])) * enemy.radius
			spawn(str(elite_config["split_into"]), enemy.position + offset, enemy.wave)


func tick(delta: float) -> void:
	_ticking = true
	var write := 0
	for i in active.size():
		var enemy := active[i]
		if enemy.alive:
			_move(enemy, delta)
		if enemy.alive and enemy.attack_ready:
			enemy.attack_ready = false
			_attack(enemy)
		if enemy.alive:
			active[write] = enemy
			write += 1
		else:
			_pool.release(enemy)
	active.resize(write)
	_ticking = false
	if not _pending.is_empty():
		active.append_array(_pending)
		_pending.clear()


func _move(enemy: Enemy, delta: float) -> void:
	enemy.behavior.tick(enemy, delta)
	if enemy.state == Enemy.State.DEAD:
		# Left the battle (a bomber past its exit distance): gone without a kill.
		_remove(enemy)
		return
	_tick_pools(enemy, delta)
	var push := Vector2.ZERO
	var count := grid.query(enemy.position, separation_radius)
	for k in count:
		var other: Enemy = grid.results[k]
		if other != enemy and other.alive and other.domain == enemy.domain:
			push += Steering.separation_from(enemy.position, other.position, separation_radius)
	enemy.velocity = (enemy.velocity + push * enemy.speed * separation_strength).limit_length(enemy.speed * 1.25)
	enemy.position += enemy.velocity * delta
	if enemy.velocity.length_squared() > 1.0:
		enemy.rotation = enemy.velocity.angle()
	enemy.tick_visual(delta)
	if enemy.boat_damage > 0.0 and salvage != null and salvage.boat_hittable() \
			and enemy.position.distance_to(salvage.boat.position) <= salvage.boat.radius + enemy.radius:
		salvage.damage_boat(enemy.boat_damage)
		fx.burst(enemy.position, enemy.radius * 2.2, RAM_BURST_COLOR)
		_remove(enemy)
		return
	if not enemy.ignores_contact and enemy.position.distance_to(fortress_center) <= fortress_radius + enemy.radius:
		enemy.state = Enemy.State.RAM
		run_state.damage_base(enemy.contact_damage)
		if enemy.disable_turret > 0.0:
			EventBus.turret_disable_requested.emit(enemy.disable_turret)
		fx.burst(enemy.position, enemy.radius * 2.2, RAM_BURST_COLOR)
		_remove(enemy)


## Shield regeneration, elite regeneration and shield aura pulses.
func _tick_pools(enemy: Enemy, delta: float) -> void:
	enemy.since_hit += delta
	if enemy.max_shield > 0.0 and enemy.shield < enemy.max_shield and enemy.since_hit >= shield_regen_delay:
		enemy.shield = minf(enemy.shield + enemy.max_shield * shield_regen_rate * delta, enemy.max_shield)
	if enemy.regen_fraction > 0.0 and enemy.hp < enemy.max_hp:
		enemy.hp = minf(enemy.hp + enemy.max_hp * enemy.regen_fraction * delta, enemy.max_hp)
	if enemy.aura_interval > 0.0:
		enemy.aura_timer -= delta
		if enemy.aura_timer <= 0.0:
			enemy.aura_timer += enemy.aura_interval
			_pulse_shield(enemy)


## Shield Frigate: every ally within the aura gains shield, up to its own maximum or the pulse
## amount, whichever is larger.
func _pulse_shield(source: Enemy) -> void:
	fx.burst(source.position, source.aura_radius, Enemy.SHIELD_COLOR, 0.5)
	var count := grid.query(source.position, source.aura_radius)
	for k in count:
		var ally: Enemy = grid.results[k]
		if ally == source or not ally.alive or ally.position.distance_to(source.position) > source.aura_radius:
			continue
		var cap := maxf(ally.max_shield, source.aura_shield)
		ally.shield = minf(ally.shield + source.aura_shield, cap)
		ally.max_shield = cap
		ally.queue_redraw()


func _attack(enemy: Enemy) -> void:
	var toward := enemy.position.direction_to(fortress_center)
	match enemy.attack_type:
		Enemy.AttackType.GUN, Enemy.AttackType.CANNON:
			var impact := fortress_center - toward * fortress_radius
			var cannon := enemy.attack_type == Enemy.AttackType.CANNON
			fx.tracer(enemy.position, impact, CANNON_TRACER_COLOR if cannon else GUN_TRACER_COLOR, 6.0 if cannon else 3.0)
			fx.burst(impact, 26.0 if cannon else 14.0, RAM_BURST_COLOR, 0.25)
			run_state.damage_base(enemy.attack_damage)
		Enemy.AttackType.LAUNCH:
			var projectile := spawn(enemy.projectile_id, enemy.position + toward * enemy.radius, enemy.wave)
			if projectile != null:
				projectile.max_hp = enemy.projectile_hp
				projectile.hp = enemy.projectile_hp
				projectile.contact_damage = enemy.attack_damage
		Enemy.AttackType.BOMB:
			fx.burst(enemy.position, enemy.attack_radius, CANNON_TRACER_COLOR, 0.5)
			run_state.damage_base(enemy.attack_damage)
			if salvage != null and salvage.boat_hittable() \
					and salvage.boat.position.distance_to(enemy.position) <= enemy.attack_radius:
				salvage.damage_boat(enemy.attack_damage)


## Maps the "behavior" id from enemies.json to its strategy class (keep in sync with
## DataValidator.BEHAVIORS).
func _make_behavior(behavior_id: String, params: Dictionary) -> EnemyBehavior:
	match behavior_id:
		"ram":
			return BehaviorRam.new(params, fortress_center)
		"ranged_stop":
			return BehaviorRangedStop.new(params, fortress_center)
		"hunter":
			return BehaviorHunter.new(params, fortress_center, _hunted_boat_position)
		"fly_over":
			return BehaviorFlyOver.new(params, fortress_center)
		"submarine":
			return BehaviorSubmarine.new(params, fortress_center)
	return null


## The salvage boat's position while hunters can go for it, else null.
func _hunted_boat_position() -> Variant:
	return salvage.boat.position if salvage != null and salvage.boat_hittable() else null


## Takes the enemy out of play now; tick() returns it to the pool.
func _remove(enemy: Enemy) -> void:
	enemy.alive = false
	enemy.state = Enemy.State.DEAD
	enemy.visible = false
