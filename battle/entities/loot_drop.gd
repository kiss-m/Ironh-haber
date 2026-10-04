class_name LootDrop
extends Node2D
## Floating loot crate (GAME_DESIGN.md section 7): one resource type and amount, drifting with the
## current until its float time runs out, then it sinks. LootSystem moves, merges and removes it;
## the salvage boat picks it up. A shrinking ring shows the time left (section 12), the crate
## blinks during its last seconds and a marked crate gets a highlight.

const COLORS: Array[Color] = [Color("f2c94c"), Color("b0bec5"), Color("4dd0e1"), Color("b388ff")]
const OUTLINE_COLOR := Color("1b2b38")
const MARK_COLOR := Color("ffffff")
const TIMER_COLOR := Color(1.0, 1.0, 1.0, 0.55)
const SIZE := 26.0
const BLINK_RATE := 8.0

var resource_type := 0
var amount := 0
var velocity := Vector2.ZERO
var age := 0.0
var float_time := 0.0
var blink_time := 0.0
var marked := false
var alive := false


func setup(p_type: int, p_amount: int, p_velocity: Vector2, p_float_time: float, p_blink_time: float) -> void:
	resource_type = p_type
	amount = p_amount
	velocity = p_velocity
	age = 0.0
	float_time = p_float_time
	blink_time = p_blink_time
	marked = false
	alive = true
	modulate.a = 1.0
	queue_redraw()


func reset() -> void:
	alive = false
	marked = false
	amount = 0


func time_left() -> float:
	return float_time - age


func set_marked(value: bool) -> void:
	marked = value
	queue_redraw()


## Advances drift and age; returns false once the crate has sunk.
func tick(delta: float) -> bool:
	age += delta
	position += velocity * delta
	var left := time_left()
	modulate.a = 0.35 if left < blink_time and fmod(age * BLINK_RATE, 2.0) < 1.0 else 1.0
	queue_redraw()
	return left > 0.0


func _draw() -> void:
	var half := SIZE * 0.5 * (1.0 + minf(amount, 20) * 0.02)
	if marked:
		draw_arc(Vector2.ZERO, half * 1.9, 0.0, TAU, 32, MARK_COLOR, 5.0, true)
	var fraction := clampf(time_left() / float_time, 0.0, 1.0) if float_time > 0.0 else 0.0
	draw_arc(Vector2.ZERO, half * 1.5, -PI / 2.0, -PI / 2.0 + TAU * fraction, 32, TIMER_COLOR, 3.0, true)
	var rect := Rect2(-half, -half, half * 2.0, half * 2.0)
	draw_rect(rect, COLORS[resource_type])
	draw_rect(rect, OUTLINE_COLOR, false, 3.0)
