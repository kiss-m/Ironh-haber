class_name Turret
extends Node2D
## Fortress turret entity (GAME_DESIGN.md sections 3, 4 and 9). Holds its weapon definition and
## aim state, turns toward the finger at the weapon's turn speed and fires through
## ProjectileSystem while the finger is down and the barrel is within the fire tolerance.
## Stats are the weapon's base values until StatResolver arrives in M2.

const BASE_RADIUS := 40.0
const BARREL_LENGTH := 104.0
const BARREL_WIDTH := 20.0
const BASE_COLOR := Color("2b3d4b")
const RIM_COLOR := Color("c9d6df")
const BARREL_COLOR := Color("c9d6df")
const AIM_LINE_COLOR := Color(1.0, 1.0, 1.0, 0.45)
const AIM_LINE_WIDTH := 4.0
const AIM_LINE_DASH := 18.0

var weapon_id := ""
var damage := 0.0
var fire_interval := 1.0
var range_px := 0.0
var turn_speed := 0.0
var projectile_speed := 0.0
var spread := 0.0
var damage_type := 0
var domain_mask := 0
var fire_tolerance := 0.0
## World position the aim angle is measured from: the fortress center (section 3, "Aim feel").
var aim_origin := Vector2.ZERO
var aiming := false
var aim_point := Vector2.ZERO
var enabled := true
var projectiles: ProjectileSystem
var rng: RandomNumberGenerator

var _cadence := FireCadence.new()


## Reads the weapon definition; angles in data are degrees, in code radians.
func setup(weapon: Dictionary, fire_tolerance_deg: float) -> void:
	var base: Dictionary = weapon["base"]
	weapon_id = str(weapon["id"])
	damage = float(base["damage"])
	fire_interval = 1.0 / float(base["fire_rate"])
	range_px = float(base["range"])
	turn_speed = deg_to_rad(float(base["turn_speed"]))
	projectile_speed = float(base["projectile_speed"])
	spread = deg_to_rad(float(base.get("spread", 0.0)))
	damage_type = CombatTypes.damage_type_from_name(str(weapon["damage_type"]))
	domain_mask = CombatTypes.domain_mask(weapon["domains"])
	fire_tolerance = deg_to_rad(fire_tolerance_deg)
	_cadence.reset()
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
	return aiming and absf(angle_difference(rotation, target_angle())) <= fire_tolerance


func tick(delta: float) -> void:
	if aiming and enabled:
		rotation = wrapf(rotate_toward(rotation, target_angle(), turn_speed * delta), -PI, PI)
	var shots := _cadence.tick(delta, enabled and is_on_target(), fire_interval)
	for i in shots:
		_fire()


func _fire() -> void:
	var direction := Vector2.from_angle(rotation + rng.randf_range(-spread, spread) * 0.5)
	var muzzle := global_position + direction * BARREL_LENGTH
	var lifetime := maxf(range_px - BARREL_LENGTH, 0.0) / projectile_speed
	projectiles.fire_bullet(muzzle, direction, projectile_speed, lifetime, damage, damage_type, domain_mask)


func _draw() -> void:
	if aiming:
		draw_dashed_line(Vector2.ZERO, Vector2(range_px, 0.0), AIM_LINE_COLOR, AIM_LINE_WIDTH, AIM_LINE_DASH)
	draw_rect(Rect2(0.0, -BARREL_WIDTH * 0.5, BARREL_LENGTH, BARREL_WIDTH), BARREL_COLOR)
	draw_circle(Vector2.ZERO, BASE_RADIUS, BASE_COLOR)
	draw_arc(Vector2.ZERO, BASE_RADIUS, 0.0, TAU, 48, RIM_COLOR, 4.0, true)
