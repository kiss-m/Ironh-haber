class_name SpatialGrid
extends RefCounted
## Uniform grid for neighbor queries (GAME_DESIGN.md sections 9 and 14). Rebuilt from the active
## enemies every physics tick with a counting sort into flat arrays, so it does not allocate per
## frame once its buffers have grown. Positions outside `area` count as being in the edge cells.

var area := Rect2()
var cell_size := 128.0
var cols := 1
var rows := 1
## After query(), the first `result_count` entries are the items in the overlapping cells.
var results: Array = []
var result_count := 0

var _cell_start := PackedInt32Array()
var _cell_cursor := PackedInt32Array()
var _item_cell := PackedInt32Array()
var _sorted: Array = []


func _init(p_area: Rect2, p_cell_size: float) -> void:
	configure(p_area, p_cell_size)


func configure(p_area: Rect2, p_cell_size: float) -> void:
	area = p_area
	cell_size = p_cell_size
	cols = maxi(1, ceili(area.size.x / cell_size))
	rows = maxi(1, ceili(area.size.y / cell_size))
	_cell_start.resize(cols * rows + 1)
	_cell_cursor.resize(cols * rows)
	_cell_start.fill(0)


## Re-buckets `items` (Node2D-like objects with a `position`) by cell.
func rebuild(items: Array) -> void:
	var count := items.size()
	if _item_cell.size() < count:
		_item_cell.resize(count)
		_sorted.resize(count)
		results.resize(count)
	_cell_start.fill(0)
	for i in count:
		var cell := cell_index(items[i].position)
		_item_cell[i] = cell
		_cell_start[cell + 1] += 1
	for cell in cols * rows:
		_cell_start[cell + 1] += _cell_start[cell]
		_cell_cursor[cell] = _cell_start[cell]
	for i in count:
		var cell := _item_cell[i]
		_sorted[_cell_cursor[cell]] = items[i]
		_cell_cursor[cell] += 1


## Collects the items in every cell overlapping the square around `center`. Callers do the exact
## distance or shape test. Returns `result_count`.
func query(center: Vector2, radius: float) -> int:
	var low := _cell_coords(center - Vector2(radius, radius))
	var high := _cell_coords(center + Vector2(radius, radius))
	result_count = 0
	for y in range(low.y, high.y + 1):
		for x in range(low.x, high.x + 1):
			var cell := y * cols + x
			for k in range(_cell_start[cell], _cell_start[cell + 1]):
				results[result_count] = _sorted[k]
				result_count += 1
	return result_count


func cell_index(point: Vector2) -> int:
	var coords := _cell_coords(point)
	return coords.y * cols + coords.x


func _cell_coords(point: Vector2) -> Vector2i:
	var local := (point - area.position) / cell_size
	return Vector2i(clampi(floori(local.x), 0, cols - 1), clampi(floori(local.y), 0, rows - 1))
