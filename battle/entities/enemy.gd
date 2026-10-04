class_name Enemy
extends Node2D
## Thin enemy entity (GAME_DESIGN.md sections 5 and 9): definition values copied into typed
## fields, position and state. Its behavior strategy steers it; EnemySystem moves it, applies
## damage and returns it to the pool. Placeholder art is drawn in code (section 13).

enum State { SPAWN, APPROACH, ENGAGE, RAM, EXIT, DEAD }

const HULL_COLOR := Color("a9bccb")
const OUTLINE_COLOR := Color("1b2b38")
const CABIN_COLOR := Color("e0664f")
const FLASH_COLOR := Color.WHITE
const FLASH_TIME := 0.06
## Hull outline in units of the hit radius, bow pointing along +x.
const HULL_SHAPE: Array[Vector2] = [
	Vector2(1.3, 0.0), Vector2(0.55, -0.5), Vector2(-1.0, -0.5),
	Vector2(-1.1, 0.0), Vector2(-1.0, 0.5), Vector2(0.55, 0.5),
]

var enemy_id := ""
var state := State.DEAD
var alive := false
var hp := 0.0
var max_hp := 0.0
var radius := 0.0
var speed := 0.0
var domain := 0
var armor := 0
var contact_damage := 0.0
var velocity := Vector2.ZERO
var behavior: EnemyBehavior
## Per-enemy weave state rolled by the behavior on spawn.
var weave_amplitude := 0.0
var weave_omega := 0.0
var weave_phase := 0.0

var _flash := 0.0
var _hull := PackedVector2Array()
var _outline := PackedVector2Array()


func setup(def: Dictionary, p_behavior: EnemyBehavior) -> void:
	enemy_id = str(def["id"])
	max_hp = float(def["hp"])
	hp = max_hp
	radius = float(def["radius"])
	speed = float(def["speed"])
	domain = CombatTypes.domain_from_name(str(def["domain"]))
	armor = CombatTypes.armor_from_name(str(def["armor"]))
	contact_damage = float(def["attack"]["damage"])
	behavior = p_behavior
	state = State.SPAWN
	alive = true
	_build_shape()
	queue_redraw()


func reset() -> void:
	enemy_id = ""
	state = State.DEAD
	alive = false
	hp = 0.0
	velocity = Vector2.ZERO
	behavior = null
	rotation = 0.0
	_flash = 0.0


func flash() -> void:
	_flash = FLASH_TIME
	queue_redraw()


func tick_visual(delta: float) -> void:
	if _flash > 0.0:
		_flash -= delta
		if _flash <= 0.0:
			queue_redraw()


func _build_shape() -> void:
	_hull.resize(HULL_SHAPE.size())
	for i in HULL_SHAPE.size():
		_hull[i] = HULL_SHAPE[i] * radius
	_outline = _hull.duplicate()
	_outline.append(_hull[0])


func _draw() -> void:
	draw_colored_polygon(_hull, FLASH_COLOR if _flash > 0.0 else HULL_COLOR)
	draw_polyline(_outline, OUTLINE_COLOR, 3.0, true)
	draw_circle(Vector2(-0.25 * radius, 0.0), 0.28 * radius, CABIN_COLOR)
