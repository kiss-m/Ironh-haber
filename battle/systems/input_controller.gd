class_name InputController
extends Node
## Classifies every touch on touch-down (GAME_DESIGN.md section 3), in this order:
## UI controls handle their own touches (those never reach _unhandled_input, and the bottom-bar
## buttons select turrets through select()); a touch on a turret on the fortress selects it, with
## no firing; anything else becomes the aim touch for the selected turret. Only the first aim
## touch is tracked, because Dual Command arrives in M5. On desktop, the mouse arrives as touch.

const NO_TOUCH := -1

var turrets: Array[Turret] = []
var selected_slot := -1
## A touch-down within this world distance of a turret selects it instead of aiming.
var select_radius := Turret.BASE_RADIUS + 14.0
var enabled := true

var _aim_index := NO_TOUCH


## Touch-down goes through _unhandled_input so UI controls get the first chance at it.
func _unhandled_input(event: InputEvent) -> void:
	var touch := event as InputEventScreenTouch
	if touch != null and touch.pressed and press(touch.index, _to_world(touch.position)):
		get_viewport().set_input_as_handled()


## Drag and release of the aim finger are read in _input, because the finger may end over UI.
func _input(event: InputEvent) -> void:
	var touch := event as InputEventScreenTouch
	if touch != null and not touch.pressed:
		release(touch.index)
		return
	var drag := event as InputEventScreenDrag
	if drag != null:
		drag_to(drag.index, _to_world(drag.position))


func selected_turret() -> Turret:
	return turrets[selected_slot] if selected_slot >= 0 and selected_slot < turrets.size() else null


## Makes `slot` the selected turret; any aim in progress ends.
func select(slot: int) -> void:
	if slot < 0 or slot >= turrets.size():
		return
	cancel()
	selected_slot = slot
	for turret in turrets:
		turret.set_selected(turret.slot == slot)
	EventBus.turret_selected.emit(slot)


## Handles a touch-down at a world position. Returns true if it was used.
func press(index: int, world_point: Vector2) -> bool:
	if not enabled:
		return false
	for turret in turrets:
		if world_point.distance_to(turret.global_position) <= select_radius:
			if _aim_index == NO_TOUCH:
				select(turret.slot)
			return true
	var turret := selected_turret()
	if _aim_index != NO_TOUCH or turret == null:
		return false
	_aim_index = index
	turret.aim_at(world_point)
	return true


func drag_to(index: int, world_point: Vector2) -> void:
	var turret := selected_turret()
	if enabled and index == _aim_index and turret != null:
		turret.aim_at(world_point)


func release(index: int) -> void:
	if index == _aim_index:
		cancel()


func cancel() -> void:
	_aim_index = NO_TOUCH
	var turret := selected_turret()
	if turret != null:
		turret.release_aim()


func _to_world(screen_point: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * screen_point
