class_name BehaviorFlyOver
extends EnemyBehavior
## "fly_over": flies straight across the screen over the fortress, drops its bombs once it is
## above the base, and leaves on the far side (Bomber, GAME_DESIGN.md section 5). It never rams
## the fortress; EnemySystem drops the bomb when `attack_ready` is set and removes the bomber
## without a kill once it reaches its exit distance.

var target := Vector2.ZERO
## Bombs fall once the bomber is this close to the fortress center.
var bomb_distance := 0.0


func _init(params: Dictionary, p_target: Vector2) -> void:
	target = p_target
	bomb_distance = float(params["bomb_distance"])


func on_spawn(enemy: Enemy, _rng: RandomNumberGenerator) -> void:
	enemy.state = Enemy.State.APPROACH
	enemy.ignores_contact = true
	enemy.velocity = enemy.position.direction_to(target) * enemy.speed
	enemy.exit_distance = enemy.position.distance_to(target)


func tick(enemy: Enemy, _delta: float) -> void:
	var distance := enemy.position.distance_to(target)
	if enemy.state == Enemy.State.APPROACH and distance <= bomb_distance:
		enemy.state = Enemy.State.ENGAGE
		enemy.attack_ready = true
	elif enemy.state == Enemy.State.ENGAGE and distance > bomb_distance:
		enemy.state = Enemy.State.EXIT
	if enemy.state == Enemy.State.EXIT and distance >= enemy.exit_distance:
		enemy.state = Enemy.State.DEAD
