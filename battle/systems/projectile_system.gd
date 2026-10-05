class_name ProjectileSystem
extends Node
## Pooled projectiles stored as flat arrays (GAME_DESIGN.md sections 4 and 14): no node and no
## physics body per shot. Every shot moves each physics tick and is tested as a swept segment
## against nearby enemies from SpatialGrid, hitting only domains its weapon can hit.
##
## - Bullets and shells travel straight for range ÷ speed seconds; a splash radius damages every
##   enemy of the shot's domains around the impact.
## - Missiles home in with a capped turn rate and pick a new target when theirs dies.
## - Torpedoes run along the water (Surface and Submerged) and pierce a number of enemies.
## - Lobs (depth charges) fly to their aim point without touching anything and explode there.
## The laser (beam) and the railgun (rail) are not projectiles: turrets call first_hit() and
## hit_line() for them.

enum Kind { BULLET, SHELL, MISSILE, TORPEDO, LOB, BEAM, RAIL }

## Added to query radii so the largest enemy hit circle is always covered.
const HIT_QUERY_PADDING := 64.0
## Missiles look for a new target within this distance.
const MISSILE_SEEK_RADIUS := 450.0
const SPLASH_COLOR := Color("ffcf7a")
const KINDS := { "bullet": Kind.BULLET, "shell": Kind.SHELL, "missile": Kind.MISSILE,
		"torpedo": Kind.TORPEDO, "lob": Kind.LOB, "beam": Kind.BEAM, "rail": Kind.RAIL }

## Shots alive now; every array below is valid for indices 0 .. count - 1.
var count := 0
var kinds := PackedInt32Array()
var positions := PackedVector2Array()
var velocities := PackedVector2Array()
var lifetimes := PackedFloat32Array()
## Total flight time of lobs, for drawing their arc.
var flight_times := PackedFloat32Array()
var damages := PackedFloat32Array()
var damage_types := PackedInt32Array()
var domain_masks := PackedInt32Array()
var splash_radii := PackedFloat32Array()
## Missile turn rate (radians per second).
var turn_rates := PackedFloat32Array()
## Torpedo hits left after the current one (pierce).
var pierces := PackedInt32Array()
## Missile targets and enemies a torpedo already hit (instance ids), one entry per shot.
var targets: Array = []
var hit_ids: Array = []

var grid: SpatialGrid
var enemies: EnemySystem
var damage_calc: DamageCalc
var fx: FxLayer
var rng: RandomNumberGenerator


static func kind_from_name(projectile: String) -> Kind:
	return KINDS.get(projectile, Kind.BULLET)


func reserve(capacity: int) -> void:
	if capacity <= positions.size():
		return
	for array in [kinds, positions, velocities, lifetimes, flight_times, damages, damage_types,
			domain_masks, splash_radii, turn_rates, pierces]:
		array.resize(capacity)
	targets.resize(capacity)
	hit_ids.resize(capacity)


## Fires one shot that lives for `lifetime` seconds. `extra` carries the kind's settings:
## "splash" (radius), "turn_rate" (missiles, rad/s), "pierce" (torpedoes), "target" (missiles).
func fire(kind: Kind, origin: Vector2, direction: Vector2, speed: float, lifetime: float,
		damage: float, damage_type: int, domain_mask: int, splash_radius := 0.0, extra := {}) -> void:
	if count == positions.size():
		reserve(maxi(count * 2, 64))
	kinds[count] = kind
	positions[count] = origin
	velocities[count] = direction * speed
	lifetimes[count] = lifetime
	flight_times[count] = lifetime
	damages[count] = damage
	damage_types[count] = damage_type
	domain_masks[count] = domain_mask
	splash_radii[count] = splash_radius
	turn_rates[count] = float(extra.get("turn_rate", 0.0))
	pierces[count] = int(extra.get("pierce", 0))
	targets[count] = extra.get("target")
	hit_ids[count] = [] if kind == Kind.TORPEDO else null
	count += 1


func clear() -> void:
	count = 0


func tick(delta: float) -> void:
	var i := 0
	while i < count:
		if kinds[i] == Kind.MISSILE:
			_steer_missile(i, delta)
		var from := positions[i]
		var to := from + velocities[i] * delta
		positions[i] = to
		lifetimes[i] -= delta
		var done := false
		if kinds[i] == Kind.LOB:
			if lifetimes[i] <= 0.0:
				_splash(i, to, damage_calc.roll_crit(rng))
				done = true
		else:
			done = _try_hit(i, from, to) or lifetimes[i] <= 0.0
		if done:
			_remove(i)
		else:
			i += 1


## The first enemy of `domain_mask` the segment touches, or null (laser).
func first_hit(from: Vector2, to: Vector2, domain_mask: int) -> Enemy:
	var target: Enemy = null
	var best := INF
	var candidates := grid.query((from + to) * 0.5, from.distance_to(to) * 0.5 + HIT_QUERY_PADDING)
	for k in candidates:
		var enemy: Enemy = grid.results[k]
		if not enemy.alive or (enemy.domain & domain_mask) == 0:
			continue
		var t := _segment_hit(from, to, enemy)
		if t >= 0.0 and t < best:
			best = t
			target = enemy
	return target


## Damages every enemy of `domain_mask` the segment touches (railgun). Returns how many it hit.
func hit_line(from: Vector2, to: Vector2, damage: float, damage_type: int, domain_mask: int) -> int:
	var hits := 0
	var crit := damage_calc.roll_crit(rng)
	var candidates := grid.query((from + to) * 0.5, from.distance_to(to) * 0.5 + HIT_QUERY_PADDING)
	var victims: Array[Enemy] = []
	for k in candidates:
		var enemy: Enemy = grid.results[k]
		if enemy.alive and (enemy.domain & domain_mask) != 0 and _segment_hit(from, to, enemy) >= 0.0:
			victims.append(enemy)
	for enemy in victims:
		enemies.apply_damage(enemy, damage_calc.final_damage(damage, damage_type, enemy.armor, crit))
		hits += 1
	return hits


## Applies `damage` to one enemy with armor and a crit roll (laser ticks).
func damage_enemy(enemy: Enemy, damage: float, damage_type: int) -> void:
	enemies.apply_damage(enemy, damage_calc.final_damage(damage, damage_type, enemy.armor, damage_calc.roll_crit(rng)))


func _try_hit(i: int, from: Vector2, to: Vector2) -> bool:
	var reach := from.distance_to(to) * 0.5 + HIT_QUERY_PADDING
	var candidates := grid.query((from + to) * 0.5, reach)
	var target: Enemy = null
	var best := INF
	var already: Variant = hit_ids[i]
	for k in candidates:
		var enemy: Enemy = grid.results[k]
		if not enemy.alive or (enemy.domain & domain_masks[i]) == 0:
			continue
		if already != null and (already as Array).has(enemy.get_instance_id()):
			continue
		var t := _segment_hit(from, to, enemy)
		if t >= 0.0 and t < best:
			best = t
			target = enemy
	if target == null:
		return false
	var crit := damage_calc.roll_crit(rng)
	if splash_radii[i] > 0.0:
		_splash(i, from.lerp(to, best), crit)
		return true
	enemies.apply_damage(target, damage_calc.final_damage(damages[i], damage_types[i], target.armor, crit))
	if kinds[i] == Kind.TORPEDO and pierces[i] > 0:
		pierces[i] -= 1
		(already as Array).append(target.get_instance_id())
		return false
	return true


## Fraction along the segment where it first touches the enemy's hit circle, or -1.
static func _segment_hit(from: Vector2, to: Vector2, enemy: Enemy) -> float:
	var t := Geometry2D.segment_intersects_circle(from, to, enemy.position, enemy.radius)
	if t < 0.0 and from.distance_squared_to(enemy.position) <= enemy.radius * enemy.radius:
		return 0.0
	return t


func _steer_missile(i: int, delta: float) -> void:
	var target: Variant = targets[i]
	if not _valid_target(target, domain_masks[i]):
		target = nearest(positions[i], MISSILE_SEEK_RADIUS, domain_masks[i])
		targets[i] = target
	if target == null:
		return
	var velocity := velocities[i]
	var wanted := (target as Enemy).position - positions[i]
	var angle := rotate_toward(velocity.angle(), wanted.angle(), turn_rates[i] * delta)
	velocities[i] = Vector2.from_angle(angle) * velocity.length()


func _valid_target(target: Variant, mask: int) -> bool:
	return target != null and is_instance_valid(target) and (target as Enemy).alive \
			and ((target as Enemy).domain & mask) != 0


## Nearest living enemy of `mask` within `radius` of `at`, or null.
func nearest(at: Vector2, radius: float, mask: int) -> Enemy:
	var best: Enemy = null
	var best_distance := radius * radius
	var candidates := grid.query(at, radius)
	for k in candidates:
		var enemy: Enemy = grid.results[k]
		if enemy.alive and (enemy.domain & mask) != 0:
			var distance := enemy.position.distance_squared_to(at)
			if distance < best_distance:
				best_distance = distance
				best = enemy
	return best


## Damages every enemy of the shot's domains whose hit circle overlaps the splash.
func _splash(i: int, center: Vector2, crit: bool) -> void:
	var radius := splash_radii[i]
	fx.burst(center, radius, SPLASH_COLOR, 0.3)
	var candidates := grid.query(center, radius + HIT_QUERY_PADDING)
	var victims: Array[Enemy] = []
	for k in candidates:
		var enemy: Enemy = grid.results[k]
		if not enemy.alive or (enemy.domain & domain_masks[i]) == 0:
			continue
		var reach := radius + enemy.radius
		if center.distance_squared_to(enemy.position) <= reach * reach:
			victims.append(enemy)
	for enemy in victims:
		enemies.apply_damage(enemy, damage_calc.final_damage(damages[i], damage_types[i], enemy.armor, crit))


func _remove(i: int) -> void:
	count -= 1
	kinds[i] = kinds[count]
	positions[i] = positions[count]
	velocities[i] = velocities[count]
	lifetimes[i] = lifetimes[count]
	flight_times[i] = flight_times[count]
	damages[i] = damages[count]
	damage_types[i] = damage_types[count]
	domain_masks[i] = domain_masks[count]
	splash_radii[i] = splash_radii[count]
	turn_rates[i] = turn_rates[count]
	pierces[i] = pierces[count]
	targets[i] = targets[count]
	hit_ids[i] = hit_ids[count]
	targets[count] = null
	hit_ids[count] = null
