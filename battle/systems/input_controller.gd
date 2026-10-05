class_name InputController
extends Node
## Classifies every touch on touch-down (GAME_DESIGN.md section 3), in this order:
## 1. UI controls handle their own touches (those never reach _unhandled_input; the bottom-bar
##    buttons select turrets through select()).
## 2. A touch near floating loot marks it, and all loot near it, for salvage.
## 3. A touch on the dock recalls the salvage boat (section 3, "Other input").
## 4. A touch on a turret on the fortress selects it, with no firing.
## 5. Anything else becomes the aim touch for the selected turret. With Dual Command a second
##    simultaneous aim touch controls the turret selected before it; otherwise only the first
##    aim touch counts. Touches are tracked by index. On desktop, the mouse arrives as touch.

const NO_TOUCH := -1

var turrets: Array[Turret] = []
var loot: LootSystem
var salvage: SalvageSystem
var selected_slot := -1
## The slot selected before the current one: the Dual Command turret.
var previous_slot := -1
var dual_command := false
## A touch-down within this world distance of a turret selects it instead of aiming.
var select_radius := Turret.BASE_RADIUS + 14.0
var enabled := true

var _aim_index := NO_TOUCH
var _second_index := NO_TOUCH


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
	if slot != selected_slot:
		previous_slot = selected_slot
	selected_slot = slot
	for turret in turrets:
		turret.set_selected(turret.slot == slot)
	EventBus.turret_selected.emit(slot)


## Handles a touch-down at a world position. Returns true if it was used.
func press(index: int, world_point: Vector2) -> bool:
	if not enabled:
		return false
	if loot != null and loot.is_near_loot(world_point, loot.mark_radius):
		loot.mark_near(world_point, loot.mark_radius)
		return true
	if salvage != null and salvage.tap(world_point):
		return true
	for turret in turrets:
		if world_point.distance_to(turret.global_position) <= select_radius:
			if _aim_index == NO_TOUCH:
				select(turret.slot)
			return true
	var turret := selected_turret()
	if turret == null:
		return false
	if _aim_index == NO_TOUCH:
		_aim_index = index
		turret.aim_at(world_point)
		return true
	var second := second_turret()
	if dual_command and _second_index == NO_TOUCH and second != null:
		_second_index = index
		second.aim_at(world_point)
		return true
	return false


## The Dual Command turret: the previously selected one, if it still exists.
func second_turret() -> Turret:
	if previous_slot < 0 or previous_slot >= turrets.size() or previous_slot == selected_slot:
		return null
	return turrets[previous_slot]


func drag_to(index: int, world_point: Vector2) -> void:
	if not enabled:
		return
	if index == _aim_index and selected_turret() != null:
		selected_turret().aim_at(world_point)
	elif index == _second_index and second_turret() != null:
		second_turret().aim_at(world_point)


func release(index: int) -> void:
	if index == _aim_index:
		_aim_index = NO_TOUCH
		if selected_turret() != null:
			selected_turret().release_aim()
	elif index == _second_index:
		_second_index = NO_TOUCH
		if second_turret() != null:
			second_turret().release_aim()


func cancel() -> void:
	release(_aim_index)
	release(_second_index)
	_aim_index = NO_TOUCH
	_second_index = NO_TOUCH


func _to_world(screen_point: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * screen_point
