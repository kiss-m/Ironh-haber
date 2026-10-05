class_name Turret
extends Node2D
## Fortress turret entity (GAME_DESIGN.md sections 3, 4 and 9). Holds its weapon definition and
## aim state, asks StatResolver for its final stats, turns toward its aim point at its turn speed
## and fires while the barrel is within the fire tolerance.
##
## A finger aims the selected turret (and, with Dual Command, the previously selected one).
## Other turrets are idle unless Auto-Targeting drives them, at a share of their fire rate.
## Range is measured from the fortress center, like every distance in the design.
##
## Firing by projectile kind: bullets, shells, torpedoes and lobs go through ProjectileSystem one
## per shot; missiles in salvos; the laser is a continuous beam that heats up and overheats; the
## railgun charges for its charge time and then hits everything along its line.

const BASE_RADIUS := 40.0
const BASE_COLOR := Color("2b3d4b")
const RIM_COLOR := Color("c9d6df")
const SELECTED_COLOR := Color("ffd36b")
const DISABLED_COLOR := Color("e0664f")
const BARREL_COLOR := Color("c9d6df")
const AIM_LINE_COLOR := Color(1.0, 1.0, 1.0, 0.45)
const AUTO_LINE_COLOR := Color(1.0, 1.0, 1.0, 0.18)
const BEAM_COLOR := Color(1.0, 0.3, 0.35, 0.9)
const OVERHEAT_COLOR := Color("ff6b57")
const RAIL_COLOR := Color(0.5, 0.95, 1.0, 1.0)
const AIM_LINE_WIDTH := 4.0
const AIM_LINE_DASH := 18.0
## Barrel [length, width] per projectile kind.
const BARRELS := {
	ProjectileSystem.Kind.BULLET: Vector2(104, 20), ProjectileSystem.Kind.SHELL: Vector2(96, 34),
	ProjectileSystem.Kind.MISSILE: Vector2(70, 50), ProjectileSystem.Kind.TORPEDO: Vector2(112, 26),
	ProjectileSystem.Kind.LOB: Vector2(60, 42), ProjectileSystem.Kind.BEAM: Vector2(120, 14),
	ProjectileSystem.Kind.RAIL: Vector2(140, 18),
}
## Missile lifetime relative to straight flight to the range circle (homing curves).
const MISSILE_LIFETIME_FACTOR := 1.6
## Missiles fired at a finger pick the nearest enemy within this distance of it.
const MISSILE_LOCK_RADIUS := 300.0

var slot := 0
var weapon_id := ""
var name_key := ""
var projectile_kind := ProjectileSystem.Kind.BULLET
var damage := 0.0
var fire_interval := 1.0
var range_px := 0.0
var turn_speed := 0.0
var projectile_speed := 0.0
var spread := 0.0
var splash_radius := 0.0
var salvo := 1
var pierce := 0
var projectile_turn := 0.0
var heat_capacity := 0.0
var cooldown := 0.0
var charge_time := 0.0
var damage_type := 0
var domain_mask := 0
var fire_tolerance := 0.0
var selected := false
## True while a finger aims this turret (the selected one, or the Dual Command one).
var controlled := false
## Share of the fire rate while Auto-Targeting drives this turret (0 = off).
var auto_share := 0.0
var auto_active := false
## World position the aim angle is measured from: the fortress center (section 3, "Aim feel").
var aim_origin := Vector2.ZERO
var aiming := false
var aim_point := Vector2.ZERO
## Aim assist: an enemy near the finger's line to aim at instead, or null.
var assist_point: Variant = null
var enabled := true
## Seconds left knocked out by a Landing Craft (section 5): no turning, no firing.
var disabled_time := 0.0
var heat := 0.0
var overheated := false
var charge := 0.0
var projectiles: ProjectileSystem
var fx: FxLayer
var rng: RandomNumberGenerator

var _cadence := FireCadence.new()
var _weapon: Dictionary = {}
var _stats: StatResolver
var _cooldown_left := 0.0
var _beam_end: Variant = null
var _last_status := Vector2i(-1, -1)


## Reads the weapon definition and resolves its stats. Angles in data are degrees, in code radians.
func setup(weapon: Dictionary, stats: StatResolver, fire_tolerance_deg: float) -> void:
	_weapon = weapon
	_stats = stats
	weapon_id = str(weapon["id"])
	name_key = str(weapon["name_key"])
	projectile_kind = ProjectileSystem.kind_from_name(str(weapon["projectile"]))
	damage_type = CombatTypes.damage_type_from_name(str(weapon["damage_type"]))
	domain_mask = CombatTypes.domain_mask(weapon["domains"])
	fire_tolerance = deg_to_rad(fire_tolerance_deg)
	if not stats.changed.is_connected(refresh_stats):
		stats.changed.connect(refresh_stats)
	refresh_stats()
	_cadence.reset()


## Re-reads every stat from the StatResolver (upgrades and perks change them).
func refresh_stats() -> void:
	damage = _stat("damage")
	var rate := _stat("fire_rate")
	fire_interval = 1.0 / rate if rate > 0.0 else 1.0
	range_px = _stat("range")
	turn_speed = deg_to_rad(_stat("turn_speed"))
	projectile_speed = _stat("projectile_speed")
	spread = deg_to_rad(_stat("spread"))
	splash_radius = _stat("splash_radius")
	salvo = maxi(1, int(_stat("salvo")))
	pierce = int(_stat("pierce"))
	projectile_turn = deg_to_rad(_stat("projectile_turn"))
	heat_capacity = _stat("heat_capacity")
	cooldown = _stat("cooldown")
	charge_time = _stat("charge_time")
	queue_redraw()


func set_selected(value: bool) -> void:
	selected = value
	if not selected and controlled:
		release_aim()
	queue_redraw()


## A finger aims the turret at `world_point`.
func aim_at(world_point: Vector2) -> void:
	controlled = true
	auto_active = false
	aim_point = world_point
	if not aiming:
		aiming = true
		queue_redraw()


func release_aim() -> void:
	controlled = false
	assist_point = null
	if aiming:
		aiming = false
		queue_redraw()


## Auto-Targeting aims the turret at an enemy, or stops it with null.
func auto_aim(world_point: Variant) -> void:
	if controlled:
		return
	auto_active = world_point != null
	aiming = auto_active
	if auto_active:
		aim_point = world_point
	queue_redraw()


## A finger's aim is measured from the fortress center; enemies picked by aim assist or
## Auto-Targeting are aimed at from the turret itself, so its shots actually pass through them.
func target_angle() -> float:
	if assist_point != null:
		return (assist_point - global_position).angle()
	if auto_active and not controlled:
		return (aim_point - global_position).angle()
	return (aim_point - aim_origin).angle()


func is_on_target() -> bool:
	return aiming and absf(angle_difference(global_rotation, target_angle())) <= fire_tolerance


## Distance from `from` along `direction` to the range circle around the fortress center.
func reach(from: Vector2, direction: Vector2) -> float:
	var offset := from - aim_origin
	var along := offset.dot(direction)
	var outside := offset.length_squared() - range_px * range_px
	return maxf(-along + sqrt(maxf(along * along - outside, 0.0)), 0.0)


## Knocks the turret out for `seconds` (Landing Craft contact).
func disable_for(seconds: float) -> void:
	disabled_time = maxf(disabled_time, seconds)
	queue_redraw()


func is_disabled() -> bool:
	return disabled_time > 0.0


## Laser heat for the HUD: 0 .. 1, 1 while overheated.
func heat_fraction() -> float:
	if projectile_kind != ProjectileSystem.Kind.BEAM:
		return 0.0
	return 1.0 if overheated else clampf(heat / maxf(heat_capacity, 0.001), 0.0, 1.0)


func tick(delta: float) -> void:
	_beam_end = null
	if disabled_time > 0.0:
		disabled_time -= delta
		if disabled_time <= 0.0:
			queue_redraw()
		_cadence.tick(delta, false, fire_interval)
		charge = 0.0
		_cool(delta)
		_emit_status()
		return
	if aiming and enabled:
		rotation = wrapf(rotate_toward(rotation, target_angle(), turn_speed * delta), -PI, PI)
		queue_redraw()
	var trigger := enabled and is_on_target()
	var share := auto_share if auto_active and not controlled else 1.0
	match projectile_kind:
		ProjectileSystem.Kind.BEAM:
			_tick_beam(delta, trigger, share)
		ProjectileSystem.Kind.RAIL:
			charge = charge + delta if trigger else 0.0
			if _cadence.tick(delta, trigger and charge >= charge_time, fire_interval / share) > 0:
				_fire_rail()
				charge = 0.0
		_:
			for i in _cadence.tick(delta, trigger, fire_interval / share):
				_fire()
	_emit_status()


func _tick_beam(delta: float, trigger: bool, share: float) -> void:
	if overheated or not trigger:
		_cool(delta)
		return
	heat += delta
	if heat >= heat_capacity:
		overheated = true
		_cooldown_left = cooldown
		queue_redraw()
		return
	var direction := Vector2.from_angle(global_rotation)
	var muzzle := _muzzle(direction)
	var end := muzzle + direction * reach(muzzle, direction)
	var target := projectiles.first_hit(muzzle, end, domain_mask)
	if target != null:
		projectiles.damage_enemy(target, damage * share * delta, damage_type)
		end = target.position
	_beam_end = end
	queue_redraw()


func _cool(delta: float) -> void:
	if overheated:
		_cooldown_left -= delta
		if _cooldown_left <= 0.0:
			overheated = false
			heat = 0.0
			queue_redraw()
	else:
		heat = maxf(heat - delta, 0.0)


func _emit_status() -> void:
	var status := Vector2i(roundi(heat_fraction() * 20.0), 1 if is_disabled() else 0)
	if status != _last_status:
		_last_status = status
		EventBus.turret_status.emit(slot, status.x / 20.0, status.y == 1)


func _stat(stat: String) -> float:
	var base: Dictionary = _weapon["base"]
	return _stats.resolve("weapon." + stat, float(base.get(stat, 0.0)), {"weapon": weapon_id})


func _barrel() -> Vector2:
	return BARRELS[projectile_kind]


func _muzzle(direction: Vector2) -> Vector2:
	return global_position + direction * _barrel().x


func _fire() -> void:
	match projectile_kind:
		ProjectileSystem.Kind.MISSILE:
			var target := projectiles.nearest(aim_point, MISSILE_LOCK_RADIUS, domain_mask)
			for i in salvo:
				var offset := (i - (salvo - 1) * 0.5) * spread
				var direction := Vector2.from_angle(global_rotation + offset)
				var muzzle := _muzzle(direction)
				var lifetime := reach(muzzle, direction) * MISSILE_LIFETIME_FACTOR / projectile_speed
				projectiles.fire(projectile_kind, muzzle, direction, projectile_speed, lifetime, damage,
						damage_type, domain_mask, splash_radius, {"turn_rate": projectile_turn, "target": target})
		ProjectileSystem.Kind.LOB:
			var direction := Vector2.from_angle(global_rotation)
			var muzzle := _muzzle(direction)
			var wanted: Vector2 = assist_point if assist_point != null else aim_point
			var distance := minf(muzzle.distance_to(wanted), reach(muzzle, direction))
			projectiles.fire(projectile_kind, muzzle, direction, projectile_speed, distance / projectile_speed,
					damage, damage_type, domain_mask, splash_radius)
		_:
			var direction := Vector2.from_angle(global_rotation + rng.randf_range(-spread, spread) * 0.5)
			var muzzle := _muzzle(direction)
			projectiles.fire(projectile_kind, muzzle, direction, projectile_speed,
					reach(muzzle, direction) / projectile_speed, damage, damage_type, domain_mask, splash_radius,
					{"pierce": pierce})


func _fire_rail() -> void:
	var direction := Vector2.from_angle(global_rotation)
	var muzzle := _muzzle(direction)
	var end := muzzle + direction * reach(muzzle, direction)
	projectiles.hit_line(muzzle, end, damage, damage_type, domain_mask)
	if fx != null:
		fx.tracer(muzzle, end, RAIL_COLOR, 10.0)


func _draw() -> void:
	var direction := Vector2.from_angle(global_rotation)
	if aiming:
		var length := reach(global_position, direction)
		if projectile_kind == ProjectileSystem.Kind.LOB:
			length = minf(length, global_position.distance_to(aim_point))
		draw_dashed_line(Vector2.ZERO, Vector2(length, 0.0), AIM_LINE_COLOR if controlled else AUTO_LINE_COLOR,
				AIM_LINE_WIDTH, AIM_LINE_DASH)
	if _beam_end != null:
		draw_line(Vector2(_barrel().x, 0.0), to_local(_beam_end), BEAM_COLOR, 8.0)
	var barrel := _barrel()
	var barrel_color := BARREL_COLOR
	if overheated:
		barrel_color = OVERHEAT_COLOR
	elif charge > 0.0 and charge_time > 0.0:
		barrel_color = BARREL_COLOR.lerp(RAIL_COLOR, clampf(charge / charge_time, 0.0, 1.0))
	draw_rect(Rect2(0.0, -barrel.y * 0.5, barrel.x, barrel.y), barrel_color)
	draw_circle(Vector2.ZERO, BASE_RADIUS, BASE_COLOR)
	draw_arc(Vector2.ZERO, BASE_RADIUS, 0.0, TAU, 48, SELECTED_COLOR if selected else RIM_COLOR,
			8.0 if selected else 4.0, true)
	if disabled_time > 0.0:
		var x := BASE_RADIUS * 0.6
		draw_line(Vector2(-x, -x), Vector2(x, x), DISABLED_COLOR, 8.0)
		draw_line(Vector2(-x, x), Vector2(x, -x), DISABLED_COLOR, 8.0)
