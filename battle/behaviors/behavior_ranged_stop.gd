class_name BehaviorRangedStop
extends EnemyBehavior
## "ranged_stop": approaches the fortress, stops at its engage distance and orbits slowly while
## attacking on an interval (Patrol Boat, Torpedo Boat, Armored Gunboat, Minelayer, Shield Frigate,
## Missile Corvette; GAME_DESIGN.md section 5).
## EnemySystem carries out the attack when `attack_ready` is set.

## How strongly an orbiting enemy is pulled back to its engage distance (per second).
const RADIUS_CORRECTION := 1.5

var target := Vector2.ZERO
var engage_distance := 0.0
var orbit_speed := 0.0


func _init(params: Dictionary, p_target: Vector2) -> void:
	target = p_target
	engage_distance = float(params["engage_distance"])
	orbit_speed = float(params.get("orbit_speed", 0.0))


func on_spawn(enemy: Enemy, rng: RandomNumberGenerator) -> void:
	enemy.state = Enemy.State.APPROACH
	enemy.orbit_direction = -1.0 if rng.randf() < 0.5 else 1.0
	enemy.attack_timer = enemy.attack_interval * rng.randf_range(0.5, 1.0)


func tick(enemy: Enemy, delta: float) -> void:
	_steer(enemy)
	if enemy.state != Enemy.State.ENGAGE:
		return
	enemy.attack_timer -= delta
	if enemy.attack_timer <= 0.0:
		enemy.attack_timer += enemy.attack_interval
		enemy.attack_ready = true


## Approach until the engage distance, then orbit at it.
func _steer(enemy: Enemy) -> void:
	var offset := enemy.position - target
	var distance := offset.length()
	var outward := offset / distance if distance > 0.0 else Vector2.RIGHT
	if enemy.state == Enemy.State.APPROACH:
		if distance > engage_distance:
			enemy.velocity = -outward * enemy.speed
			return
		enemy.state = Enemy.State.ENGAGE
	var tangent := outward.orthogonal() * enemy.orbit_direction * orbit_speed
	var correction := -outward * (distance - engage_distance) * RADIUS_CORRECTION
	enemy.velocity = (tangent + correction).limit_length(enemy.speed)
