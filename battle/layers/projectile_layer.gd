class_name ProjectileLayer
extends Node2D
## Draws ProjectileSystem's shots in one pass (placeholder art, GAME_DESIGN.md section 13):
## bullets as short streaks, shells as round slugs.

const BULLET_COLOR := Color("ffd36b")
const BULLET_WIDTH := 4.0
## Bullet streak length expressed as seconds of travel.
const STREAK_TIME := 0.025
const SHELL_COLOR := Color("2a2a2a")
const SHELL_RIM_COLOR := Color("ffb347")
const SHELL_RADIUS := 9.0

var system: ProjectileSystem


func _draw() -> void:
	for i in system.count:
		var head := system.positions[i]
		if system.kinds[i] == ProjectileSystem.Kind.SHELL:
			draw_circle(head, SHELL_RADIUS + 3.0, SHELL_RIM_COLOR)
			draw_circle(head, SHELL_RADIUS, SHELL_COLOR)
		else:
			draw_line(head - system.velocities[i] * STREAK_TIME, head, BULLET_COLOR, BULLET_WIDTH)
