class_name RadarOverlay
extends Control
## Radar edge warnings (GAME_DESIGN.md section 12): arrows on the screen edges where the next
## groups will spawn. `contacts` holds Vector2i(WaveGenerator.Edge, offset × 1000), with the offset
## running -1 .. 1 along the edge.

const ARROW_COLOR := Color(1.0, 0.42, 0.34, 0.9)
const ARROW_SIZE := 34.0
const EDGE_MARGIN := 18.0

var contacts: Array[Vector2i] = []
## Vertical space taken by the top and bottom bars, so arrows stay visible.
var top_margin := 0.0
var bottom_margin := 0.0


func set_contacts(value: Array[Vector2i]) -> void:
	if value != contacts:
		contacts = value
		queue_redraw()


func _draw() -> void:
	var area := Rect2(Vector2(0.0, top_margin), size - Vector2(0.0, top_margin + bottom_margin))
	var center := area.get_center()
	var half := area.size * 0.5
	for contact in contacts:
		var offset := contact.y / 1000.0
		var at := center
		var direction := Vector2.ZERO
		match contact.x:
			WaveGenerator.Edge.LEFT:
				at = Vector2(EDGE_MARGIN, center.y + offset * half.y)
				direction = Vector2.LEFT
			WaveGenerator.Edge.RIGHT:
				at = Vector2(size.x - EDGE_MARGIN, center.y + offset * half.y)
				direction = Vector2.RIGHT
			WaveGenerator.Edge.TOP:
				at = Vector2(center.x + offset * half.x, area.position.y + EDGE_MARGIN)
				direction = Vector2.UP
			_:
				at = Vector2(center.x + offset * half.x, area.end.y - EDGE_MARGIN)
				direction = Vector2.DOWN
		var side := direction.orthogonal() * ARROW_SIZE * 0.6
		draw_colored_polygon(PackedVector2Array([at, at - direction * ARROW_SIZE + side,
				at - direction * ARROW_SIZE - side]), ARROW_COLOR)
