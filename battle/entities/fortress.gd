class_name Fortress
extends Node2D
## The naval fortress in the center of the ocean (GAME_DESIGN.md sections 1 and 3). Placeholder art
## drawn in code; base HP lives in RunState. Turrets sit on TurretMount children.

const FILL_COLOR := Color("5d7486")
const RIM_COLOR := Color("9fb3c3")
const INNER_COLOR := Color("4b6072")
const DESTROYED_FILL_COLOR := Color("3b3434")
const DESTROYED_RIM_COLOR := Color("6b5a55")
const BASTION_COUNT := 8
const DOCK_COLOR := Color("8d6e52")
const DOCK_SIZE := Vector2(110, 60)

var radius := 140.0
var destroyed := false


func setup(p_radius: float) -> void:
	radius = p_radius
	queue_redraw()


func add_mount(offset: Vector2) -> Node2D:
	var mount := Node2D.new()
	mount.name = "TurretMount%d" % get_child_count()
	mount.position = offset
	add_child(mount)
	return mount


func set_destroyed(value: bool) -> void:
	destroyed = value
	queue_redraw()


func _draw() -> void:
	# Dock on the bottom side, where the salvage boat moors (section 7).
	draw_rect(Rect2(-DOCK_SIZE.x * 0.5, radius - 10.0, DOCK_SIZE.x, DOCK_SIZE.y), DOCK_COLOR)
	var fill := DESTROYED_FILL_COLOR if destroyed else FILL_COLOR
	var rim := DESTROYED_RIM_COLOR if destroyed else RIM_COLOR
	for i in BASTION_COUNT:
		draw_circle(Vector2.from_angle(TAU * i / BASTION_COUNT) * radius, radius * 0.16, rim)
	draw_circle(Vector2.ZERO, radius, fill)
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 96, rim, 8.0, true)
	draw_circle(Vector2.ZERO, radius * 0.62, INNER_COLOR)
