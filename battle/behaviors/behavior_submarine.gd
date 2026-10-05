class_name BehaviorSubmarine
extends BehaviorRangedStop
## "submarine": approaches submerged, stops at its engage distance and then cycles: stays down
## for `submerged_time`, surfaces for `surfaced_time` and fires its torpedo as it surfaces
## (Submarine, GAME_DESIGN.md section 5). Submerged it can only be hit by weapons that reach the
## Submerged domain; surfaced it counts as Surface too.

var submerged_time := 0.0
var surfaced_time := 0.0


func _init(params: Dictionary, p_target: Vector2) -> void:
	super(params, p_target)
	submerged_time = float(params["submerged_time"])
	surfaced_time = float(params["surfaced_time"])


func on_spawn(enemy: Enemy, rng: RandomNumberGenerator) -> void:
	super(enemy, rng)
	enemy.phase_timer = submerged_time * rng.randf_range(0.3, 1.0)
	enemy.set_surfaced(false)


func tick(enemy: Enemy, delta: float) -> void:
	var was_engaged := enemy.state == Enemy.State.ENGAGE
	_steer(enemy)
	if not was_engaged:
		return
	enemy.phase_timer -= delta
	if enemy.phase_timer > 0.0:
		return
	if enemy.surfaced:
		enemy.set_surfaced(false)
		enemy.phase_timer = submerged_time
	else:
		enemy.set_surfaced(true)
		enemy.phase_timer = surfaced_time
		enemy.attack_ready = true
