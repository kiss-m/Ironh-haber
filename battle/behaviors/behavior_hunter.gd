class_name BehaviorHunter
extends BehaviorRam
## "hunter": goes for the salvage boat while it is on the water, otherwise rams the fortress
## (Salvage Hunter, GAME_DESIGN.md section 7). EnemySystem applies the boat or base damage on contact.

## Returns the boat's position while it can be hunted, or null.
var boat_position: Callable


func _init(params: Dictionary, p_target: Vector2, p_boat_position: Callable) -> void:
	super(params, p_target)
	boat_position = p_boat_position


func tick(enemy: Enemy, delta: float) -> void:
	var prey: Variant = boat_position.call()
	var fortress := target
	if prey != null:
		target = prey
	super(enemy, delta)
	target = fortress
