class_name Turret
extends Node2D
## Fortress turret entity (GAME_DESIGN.md sections 3, 4 and 9). Holds its weapon definition and
## aim state, asks StatResolver for its final stats, turns toward the finger at its turn speed and
## fires through ProjectileSystem while the finger is down and the barrel is within the fire
## tolerance. Only the selected turret is aimed; the others stay idle (Auto-Targeting is M5).
## Range is measured from the fortress center, like every distance in the design, so a turret
## mounted off center reaches equally far on both sides; shots and the aim line end on that circle.

const BASE_RADIUS := 40.0
const BASE_COLOR := Color("2b3d4b")
const RIM_COLOR := Color("c9d6df")
const SELECTED_COLOR := Color("ffd36b")
const DISABLED_COLOR := Color("e0664f")
const BARREL_COLOR := Color("c9d6df")
const AIM_LINE_COLOR := Color(1.0, 1.0, 1.0, 0.45)
const AIM_LINE_WIDTH := 4.0
const AIM_LINE_DASH := 18.0
## Barrel [length, width] per projectile kind.
const BARRELS := { ProjectileSystem.Kind.BULLET: Vector2(104, 20), ProjectileSystem.Kind.SHELL: Vector2(96, 34) }

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
var damage_type := 0
var domain_mask := 0
var fire_tolerance := 0.0
var selected := false
## World position the aim angle is measured from: the fortress center (section 3, "Aim feel").
var aim_origin := Vector2.ZERO
var aiming := false
var aim_point := Vector2.ZERO
var enabled := true
## Seconds left knocked out by a Landing Craft (section 5): no turning, no firing.
var disabled_time := 0.0
var projectiles: ProjectileSystem
var rng: RandomNumberGenerator

var _cadence := FireCadence.new()
var _weapon: Dictionary = {}
var _stats: StatResolver


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
	fire_interval = 1.0 / _stat("fire_rate")
	range_px = _stat("range")
	turn_speed = deg_to_rad(_stat("turn_speed"))
	projectile_speed = _stat("projectile_speed")
	spread = deg_to_rad(_stat("spread"))
	splash_radius = _stat("splash_radius")
	queue_redraw()


func set_selected(value: bool) -> void:
	selected = value
	if not selected:
		release_aim()
	queue_redraw()


func aim_at(world_point: Vector2) -> void:
	aim_point = world_point
	if not aiming:
		aiming = true
		queue_redraw()


func release_aim() -> void:
	if aiming:
		aiming = false
		queue_redraw()


func target_angle() -> float:
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


func tick(delta: float) -> void:
	if disabled_time > 0.0:
		disabled_time -= delta
		if disabled_time <= 0.0:
			queue_redraw()
		_cadence.tick(delta, false, fire_interval)
		return
	if aiming and enabled:
		rotation = wrapf(rotate_toward(rotation, target_angle(), turn_speed * delta), -PI, PI)
		queue_redraw()
	var shots := _cadence.tick(delta, enabled and is_on_target(), fire_interval)
	for i in shots:
		_fire()


func _stat(stat: String) -> float:
	var base: Dictionary = _weapon["base"]
	return _stats.resolve("weapon." + stat, float(base.get(stat, 0.0)), {"weapon": weapon_id})


func _barrel() -> Vector2:
	return BARRELS[projectile_kind]


func _fire() -> void:
	var direction := Vector2.from_angle(global_rotation + rng.randf_range(-spread, spread) * 0.5)
	var barrel_length := _barrel().x
	var muzzle := global_position + direction * barrel_length
	var lifetime := reach(muzzle, direction) / projectile_speed
	projectiles.fire(projectile_kind, muzzle, direction, projectile_speed, lifetime, damage,
			damage_type, domain_mask, splash_radius)


func _draw() -> void:
	if aiming:
		var length := reach(global_position, Vector2.from_angle(global_rotation))
		draw_dashed_line(Vector2.ZERO, Vector2(length, 0.0), AIM_LINE_COLOR, AIM_LINE_WIDTH, AIM_LINE_DASH)
	var barrel := _barrel()
	draw_rect(Rect2(0.0, -barrel.y * 0.5, barrel.x, barrel.y), BARREL_COLOR)
	draw_circle(Vector2.ZERO, BASE_RADIUS, BASE_COLOR)
	draw_arc(Vector2.ZERO, BASE_RADIUS, 0.0, TAU, 48, SELECTED_COLOR if selected else RIM_COLOR,
			8.0 if selected else 4.0, true)
	if disabled_time > 0.0:
		var x := BASE_RADIUS * 0.6
		draw_line(Vector2(-x, -x), Vector2(x, x), DISABLED_COLOR, 8.0)
		draw_line(Vector2(-x, x), Vector2(x, -x), DISABLED_COLOR, 8.0)
