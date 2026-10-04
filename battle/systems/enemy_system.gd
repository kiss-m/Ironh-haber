class_name EnemySystem
extends Node
## Spawns enemies from the pool, runs their behaviors, applies damage and fortress contact
## (GAME_DESIGN.md sections 5 and 9). Any enemy touching the fortress radius deals its contact
## damage and is destroyed; enemies destroyed by weapons count as kills.

const KILL_BURST_COLOR := Color("ffb347")
const RAM_BURST_COLOR := Color("ff6b57")

## Enemies currently in the world, alive this tick.
var active: Array[Enemy] = []
var grid: SpatialGrid
var run_state: RunState
var fx: FxLayer
var fortress_center := Vector2.ZERO
var fortress_radius := 0.0
var separation_radius := 0.0
var separation_strength := 0.0

var _pool: ObjectPool
var _defs: Dictionary = {}
## One behavior instance per enemy type, built once in setup().
var _behaviors: Dictionary = {}


func setup(layer: Node2D, defs: Dictionary, balance: Dictionary, prewarm: int) -> void:
	_defs = defs
	fortress_radius = float(balance["fortress"]["radius"])
	separation_radius = float(balance["steering"]["separation_radius"])
	separation_strength = float(balance["steering"]["separation_strength"])
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


func spawn(enemy_id: String, at: Vector2) -> Enemy:
	if not _behaviors.has(enemy_id):
		push_error("Cannot spawn unknown enemy '%s'" % enemy_id)
		return null
	var enemy: Enemy = _pool.acquire()
	enemy.setup(_defs[enemy_id], _behaviors[enemy_id])
	enemy.position = at
	enemy.behavior.on_spawn(enemy, run_state.rng_waves)
	active.append(enemy)
	EventBus.enemy_spawned.emit(enemy)
	return enemy


func apply_damage(enemy: Enemy, amount: float) -> void:
	if not enemy.alive:
		return
	enemy.hp -= amount
	enemy.flash()
	if enemy.hp <= 0.0:
		run_state.kills += 1
		fx.burst(enemy.position, enemy.radius * 1.8, KILL_BURST_COLOR)
		_remove(enemy)
		EventBus.enemy_killed.emit(enemy, enemy.position)


func tick(delta: float) -> void:
	var write := 0
	for i in active.size():
		var enemy := active[i]
		if enemy.alive:
			_move(enemy, delta)
		if enemy.alive:
			active[write] = enemy
			write += 1
		else:
			_pool.release(enemy)
	active.resize(write)


func _move(enemy: Enemy, delta: float) -> void:
	enemy.behavior.tick(enemy, delta)
	var push := Vector2.ZERO
	var count := grid.query(enemy.position, separation_radius)
	for k in count:
		var other: Enemy = grid.results[k]
		if other != enemy and other.alive:
			push += Steering.separation_from(enemy.position, other.position, separation_radius)
	enemy.velocity = (enemy.velocity + push * enemy.speed * separation_strength).limit_length(enemy.speed * 1.25)
	enemy.position += enemy.velocity * delta
	if not enemy.velocity.is_zero_approx():
		enemy.rotation = enemy.velocity.angle()
	enemy.tick_visual(delta)
	if enemy.position.distance_to(fortress_center) <= fortress_radius + enemy.radius:
		enemy.state = Enemy.State.RAM
		run_state.damage_base(enemy.contact_damage)
		fx.burst(enemy.position, enemy.radius * 2.2, RAM_BURST_COLOR)
		_remove(enemy)


## Maps the "behavior" id from enemies.json to its strategy class.
func _make_behavior(behavior_id: String, params: Dictionary) -> EnemyBehavior:
	match behavior_id:
		"ram":
			return BehaviorRam.new(params, fortress_center)
	return null


## Takes the enemy out of play now; tick() returns it to the pool.
func _remove(enemy: Enemy) -> void:
	enemy.alive = false
	enemy.state = Enemy.State.DEAD
	enemy.visible = false
