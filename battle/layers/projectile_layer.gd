class_name ProjectileLayer
extends Node2D
## Draws ProjectileSystem's shots in one pass (placeholder art, GAME_DESIGN.md section 13).

const BULLET_COLOR := Color("ffd36b")
const BULLET_WIDTH := 4.0
## Streak length expressed as seconds of travel.
const STREAK_TIME := 0.025

var system: ProjectileSystem


func _draw() -> void:
	for i in system.count:
		var head := system.positions[i]
		draw_line(head - system.velocities[i] * STREAK_TIME, head, BULLET_COLOR, BULLET_WIDTH)
