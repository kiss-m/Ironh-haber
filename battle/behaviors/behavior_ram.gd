class_name BehaviorRam
extends EnemyBehavior
## "ram": heads straight for the fortress with a slight sine weave (Raider Skiff,
## GAME_DESIGN.md section 5). EnemySystem applies the contact damage when it touches the fortress.

var target := Vector2.ZERO
var amplitude_min := 0.0
var amplitude_max := 0.0
var frequency := 0.0


func _init(params: Dictionary, p_target: Vector2) -> void:
	target = p_target
	var amplitude: Array = params.get("weave_amplitude", [0, 0])
	amplitude_min = float(amplitude[0])
	amplitude_max = float(amplitude[1])
	frequency = float(params.get("weave_frequency", 0.0))


func on_spawn(enemy: Enemy, rng: RandomNumberGenerator) -> void:
	enemy.state = Enemy.State.APPROACH
	enemy.weave_amplitude = rng.randf_range(amplitude_min, amplitude_max)
	enemy.weave_omega = TAU * frequency
	enemy.weave_phase = rng.randf() * TAU


func tick(enemy: Enemy, delta: float) -> void:
	enemy.weave_phase = fmod(enemy.weave_phase + enemy.weave_omega * delta, TAU)
	var lateral_rate := enemy.weave_amplitude * enemy.weave_omega * cos(enemy.weave_phase) / enemy.speed
	enemy.velocity = Steering.weave_heading(enemy.position, target, lateral_rate) * enemy.speed
