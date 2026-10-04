class_name SafeArea
extends RefCounted
## Converts the Android display cutout and gesture navigation area into canvas margins
## (GAME_DESIGN.md sections 12 and 14). Desktop builds get no margins.


## Returns (top, bottom) insets in canvas units for UI that sits at the screen edges.
static func vertical_insets(viewport: Viewport) -> Vector2:
	if not OS.has_feature("mobile"):
		return Vector2.ZERO
	var window_height := float(DisplayServer.window_get_size().y)
	if window_height <= 0.0:
		return Vector2.ZERO
	var safe := DisplayServer.get_display_safe_area()
	var scale := viewport.get_visible_rect().size.y / window_height
	var top := maxf(0.0, float(safe.position.y)) * scale
	var bottom := maxf(0.0, window_height - float(safe.end.y)) * scale
	return Vector2(top, bottom)
