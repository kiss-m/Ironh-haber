class_name SalvageBoat
extends Node2D
## The salvage boat entity (GAME_DESIGN.md section 7): state, HP and cargo. SalvageSystem runs its
## state machine and movement; this node only stores the data and draws the placeholder hull.

enum State { DOCKED, OUTBOUND, COLLECTING, RETURNING, UNLOADING, DESTROYED }

const HULL_COLOR := Color("ffd36b")
const CABIN_COLOR := Color("2b3d4b")
const OUTLINE_COLOR := Color("1b2b38")
const HP_BACK_COLOR := Color(0.0, 0.0, 0.0, 0.5)
const HP_COLOR := Color("5fbf7f")
const HULL: Array[Vector2] = [Vector2(1.3, 0.0), Vector2(0.7, -0.55), Vector2(-1.0, -0.55),
		Vector2(-1.0, 0.55), Vector2(0.7, 0.55)]

var state := State.DOCKED
var hp := 0.0
var max_hp := 0.0
var radius := 24.0
## One entry per picked-up crate: Vector2i(resource type, amount).
var cargo: Array[Vector2i] = []


func is_out() -> bool:
	return state in [State.OUTBOUND, State.COLLECTING, State.RETURNING]


func _draw() -> void:
	if state == State.DESTROYED:
		return
	var points := PackedVector2Array()
	for point in HULL:
		points.append(point * radius)
	draw_colored_polygon(points, HULL_COLOR)
	points.append(points[0])
	draw_polyline(points, OUTLINE_COLOR, 3.0, true)
	draw_rect(Rect2(-0.6 * radius, -0.3 * radius, 0.7 * radius, 0.6 * radius), CABIN_COLOR)
	for i in cargo.size():
		draw_rect(Rect2(-0.95 * radius + i * 0.2 * radius, 0.15 * radius, 0.15 * radius, 0.25 * radius),
				LootDrop.COLORS[cargo[i].x])
	if hp < max_hp:
		var width := radius * 2.0
		draw_set_transform(Vector2.ZERO, -rotation)
		draw_rect(Rect2(-width * 0.5, -radius * 1.6, width, 8.0), HP_BACK_COLOR)
		draw_rect(Rect2(-width * 0.5, -radius * 1.6, width * hp / max_hp, 8.0), HP_COLOR)
