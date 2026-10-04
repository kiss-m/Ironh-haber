extends GutTest
## Steering helpers used by enemy movement (GAME_DESIGN.md section 5).


func test_weave_heading_without_weave_points_at_target() -> void:
	var heading := Steering.weave_heading(Vector2(500, 0), Vector2.ZERO, 0.0)
	assert_almost_eq(heading.x, -1.0, 0.0001)
	assert_almost_eq(heading.y, 0.0, 0.0001)


func test_weave_heading_is_unit_length_and_bends_sideways() -> void:
	var heading := Steering.weave_heading(Vector2(500, 0), Vector2.ZERO, 0.5)
	assert_almost_eq(heading.length(), 1.0, 0.0001)
	assert_true(heading.x < 0.0, "still moves toward the target")
	assert_true(absf(heading.y) > 0.1, "bent sideways")


func test_separation_pushes_away_and_fades_with_distance() -> void:
	var near := Steering.separation_from(Vector2(10, 0), Vector2.ZERO, 60.0)
	var far := Steering.separation_from(Vector2(50, 0), Vector2.ZERO, 60.0)
	assert_true(near.x > far.x and far.x > 0.0, "stronger when closer, always away")
	assert_eq(Steering.separation_from(Vector2(60, 0), Vector2.ZERO, 60.0), Vector2.ZERO)
	assert_eq(Steering.separation_from(Vector2.ZERO, Vector2.ZERO, 60.0), Vector2.ZERO)
