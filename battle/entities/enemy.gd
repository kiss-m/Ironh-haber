class_name Enemy
extends Node2D
## Thin enemy entity (GAME_DESIGN.md sections 5 and 9): definition values, already scaled for its
## wave, copied into typed fields, plus position and state. Its behavior strategy steers it;
## EnemySystem moves it, runs its attacks, applies damage and returns it to the pool.

enum State { SPAWN, APPROACH, ENGAGE, RAM, EXIT, DEAD }
enum AttackType { CONTACT, GUN, CANNON, TORPEDO }

const OUTLINE_COLOR := Color("1b2b38")
const FLASH_COLOR := Color.WHITE
const FLASH_TIME := 0.06
const ATTACK_TYPES := { "contact": AttackType.CONTACT, "gun": AttackType.GUN,
		"cannon": AttackType.CANNON, "torpedo": AttackType.TORPEDO }

var enemy_id := ""
var visual := ""
var wave := 1
var state := State.DEAD
var alive := false
var counts_as_kill := true
var hp := 0.0
var max_hp := 0.0
var radius := 0.0
var speed := 0.0
var domain := 0
var armor := 0
## Damage when it touches the fortress (rammers; ranged enemies stop before that).
var contact_damage := 0.0
var attack_type := AttackType.CONTACT
var attack_damage := 0.0
var attack_interval := 0.0
## Counts down to the next ranged attack; the behavior sets attack_ready when it reaches 0.
var attack_timer := 0.0
var attack_ready := false
var projectile_id := ""
var projectile_hp := 0.0
## Damage to the salvage boat on contact (hunters); 0 means the enemy ignores the boat.
var boat_damage := 0.0
var loot_table := ""
var velocity := Vector2.ZERO
var behavior: EnemyBehavior
## Per-enemy movement state rolled by the behavior on spawn.
var weave_amplitude := 0.0
var weave_omega := 0.0
var weave_phase := 0.0
var orbit_direction := 1.0

var _flash := 0.0
var _hull := PackedVector2Array()
var _outline := PackedVector2Array()
var _color := Color.WHITE


## `hp_scale`, `damage_scale` and `speed_scale` are H(w), A(w) and S(w) for the enemy's wave.
func setup(def: Dictionary, p_behavior: EnemyBehavior, p_wave: int, hp_scale: float,
		damage_scale: float, speed_scale: float) -> void:
	enemy_id = str(def["id"])
	visual = str(def["visual"])
	wave = p_wave
	counts_as_kill = bool(def.get("counts_as_kill", true))
	max_hp = float(def["hp"]) * hp_scale
	hp = max_hp
	radius = float(def["radius"])
	speed = float(def["speed"]) * speed_scale
	domain = CombatTypes.domain_from_name(str(def["domain"]))
	armor = CombatTypes.armor_from_name(str(def["armor"]))
	var attack: Dictionary = def["attack"]
	attack_type = ATTACK_TYPES[str(attack["type"])]
	attack_damage = float(attack["damage"]) * damage_scale
	attack_interval = float(attack.get("interval", 0.0))
	projectile_id = str(attack.get("projectile", ""))
	projectile_hp = float(attack.get("projectile_hp", 0.0)) * hp_scale
	contact_damage = attack_damage
	boat_damage = float(attack.get("boat_damage", 0.0)) * damage_scale
	loot_table = str(def.get("loot_table", ""))
	behavior = p_behavior
	state = State.SPAWN
	alive = true
	attack_ready = false
	_build_shape()
	queue_redraw()


func reset() -> void:
	enemy_id = ""
	state = State.DEAD
	alive = false
	hp = 0.0
	velocity = Vector2.ZERO
	behavior = null
	attack_ready = false
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
	_hull = EnemyShapes.hull(visual, radius)
	_outline = _hull.duplicate()
	_outline.append(_hull[0])
	_color = EnemyShapes.domain_color(domain)


func _draw() -> void:
	draw_colored_polygon(_hull, FLASH_COLOR if _flash > 0.0 else _color)
	draw_polyline(_outline, OUTLINE_COLOR, 3.0, true)
	var accent := EnemyShapes.accent(visual)
	draw_circle(Vector2(float(accent[0]) * radius, 0.0), float(accent[1]) * radius, accent[2])
