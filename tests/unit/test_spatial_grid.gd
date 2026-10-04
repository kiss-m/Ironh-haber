extends GutTest
## SpatialGrid bucketing and queries.

const AREA := Rect2(-640, -1280, 1280, 2560)


func _point(at: Vector2) -> Node2D:
	var node: Node2D = autofree(Node2D.new())
	node.position = at
	return node


func _query(grid: SpatialGrid, center: Vector2, radius: float) -> Array:
	var found := []
	for i in grid.query(center, radius):
		found.append(grid.results[i])
	return found


func test_query_finds_nearby_items_only() -> void:
	var grid := SpatialGrid.new(AREA, 128.0)
	var near := _point(Vector2(100, 100))
	var far := _point(Vector2(-500, 900))
	grid.rebuild([near, far])
	var found := _query(grid, Vector2(90, 110), 40.0)
	assert_has(found, near)
	assert_does_not_have(found, far)


func test_items_outside_the_area_land_in_edge_cells() -> void:
	var grid := SpatialGrid.new(AREA, 128.0)
	var outside := _point(Vector2(5000, 0))
	grid.rebuild([outside])
	assert_has(_query(grid, Vector2(630, 0), 10.0), outside)


func test_rebuild_replaces_previous_contents() -> void:
	var grid := SpatialGrid.new(AREA, 128.0)
	var item := _point(Vector2.ZERO)
	grid.rebuild([item])
	grid.rebuild([])
	assert_eq(grid.query(Vector2.ZERO, 100.0), 0)


func test_many_items_in_one_cell() -> void:
	var grid := SpatialGrid.new(AREA, 128.0)
	var items := []
	for i in 50:
		items.append(_point(Vector2(i * 0.5, 0)))
	grid.rebuild(items)
	assert_eq(grid.query(Vector2.ZERO, 1.0), 50)
