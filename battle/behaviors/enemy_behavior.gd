class_name EnemyBehavior
extends RefCounted
## Base class for enemy AI strategies, selected by the "behavior" id in enemies.json and
## configured from its "behavior_params" (GAME_DESIGN.md section 9). There is one instance per
## enemy type; per-enemy state lives on the Enemy.


## Called when an enemy of this type spawns, to set its state and roll per-enemy parameters.
func on_spawn(_enemy: Enemy, _rng: RandomNumberGenerator) -> void:
	pass


## Sets the enemy's desired velocity for this tick. EnemySystem adds separation and moves it.
func tick(_enemy: Enemy, _delta: float) -> void:
	pass
