class_name ProjectileSystem
extends Node
## Pooled projectiles stored as flat arrays (GAME_DESIGN.md sections 4 and 14): no node and no
## physics body per shot. Moves every shot each physics tick and tests the swept segment against
## nearby enemies from SpatialGrid, hitting only domains the weapon can hit. M1 has bullets only.

## Added to the query radius so the largest enemy hit circle is always covered.
const HIT_QUERY_PADDING := 64.0

## Shots alive now; every array below is valid for indices 0 .. count - 1.
var count := 0
var positions := PackedVector2Array()
var velocities := PackedVector2Array()
var lifetimes := PackedFloat32Array()
var damages := PackedFloat32Array()
var damage_types := PackedInt32Array()
var domain_masks := PackedInt32Array()

var grid: SpatialGrid
var enemies: EnemySystem
var damage_calc: DamageCalc
var rng: RandomNumberGenerator


func reserve(capacity: int) -> void:
	if capacity <= positions.size():
		return
	positions.resize(capacity)
	velocities.resize(capacity)
	lifetimes.resize(capacity)
	damages.resize(capacity)
	damage_types.resize(capacity)
	domain_masks.resize(capacity)


## Straight-line bullet that lives for `lifetime` seconds (range ÷ speed).
func fire_bullet(origin: Vector2, direction: Vector2, speed: float, lifetime: float, damage: float,
		damage_type: int, domain_mask: int) -> void:
	if count == positions.size():
		reserve(maxi(count * 2, 64))
	positions[count] = origin
	velocities[count] = direction * speed
	lifetimes[count] = lifetime
	damages[count] = damage
	damage_types[count] = damage_type
	domain_masks[count] = domain_mask
	count += 1


func clear() -> void:
	count = 0


func tick(delta: float) -> void:
	var i := 0
	while i < count:
		var from := positions[i]
		var to := from + velocities[i] * delta
		positions[i] = to
		lifetimes[i] -= delta
		if _try_hit(i, from, to) or lifetimes[i] <= 0.0:
			_remove(i)
		else:
			i += 1


func _try_hit(i: int, from: Vector2, to: Vector2) -> bool:
	var reach := from.distance_to(to) * 0.5 + HIT_QUERY_PADDING
	var candidates := grid.query((from + to) * 0.5, reach)
	var target: Enemy = null
	var best := INF
	for k in candidates:
		var enemy: Enemy = grid.results[k]
		if not enemy.alive or (enemy.domain & domain_masks[i]) == 0:
			continue
		var t := Geometry2D.segment_intersects_circle(from, to, enemy.position, enemy.radius)
		if t < 0.0 and from.distance_squared_to(enemy.position) <= enemy.radius * enemy.radius:
			t = 0.0
		if t >= 0.0 and t < best:
			best = t
			target = enemy
	if target == null:
		return false
	var crit := damage_calc.roll_crit(rng)
	enemies.apply_damage(target, damage_calc.final_damage(damages[i], damage_types[i], target.armor, crit))
	return true


func _remove(i: int) -> void:
	count -= 1
	positions[i] = positions[count]
	velocities[i] = velocities[count]
	lifetimes[i] = lifetimes[count]
	damages[i] = damages[count]
	damage_types[i] = damage_types[count]
	domain_masks[i] = domain_masks[count]
