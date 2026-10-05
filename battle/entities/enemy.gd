class_name Enemy
extends Node2D
## Thin enemy entity (GAME_DESIGN.md sections 5 and 9): definition values, already scaled for its
## wave, copied into typed fields, plus position and state. Its behavior strategy steers it;
## EnemySystem moves it, runs its attacks, applies damage and returns it to the pool.
##
## Shields are a separate HP pool on top of hull HP. Elites carry one modifier and glow.
## Submerged enemies show only a ripple outline until they surface; while surfaced they are in the
## Surface domain as well. An HP bar appears once the enemy has been hit (section 12).

enum State { SPAWN, APPROACH, ENGAGE, RAM, EXIT, DEAD }
enum AttackType { CONTACT, GUN, CANNON, LAUNCH, BOMB, NONE }
enum Elite { NONE, ARMORED, FAST, REGENERATING, SHIELDED, SPLITTING }

const OUTLINE_COLOR := Color("1b2b38")
const FLASH_COLOR := Color.WHITE
const FLASH_TIME := 0.06
const ELITE_GLOW_COLOR := Color(1.0, 0.85, 0.3, 0.8)
const RIPPLE_COLOR := Color(0.55, 0.85, 0.85, 0.55)
const HP_BACK_COLOR := Color(0.0, 0.0, 0.0, 0.55)
const HP_COLOR := Color("e0664f")
const SHIELD_COLOR := Color("4dd0e1")
const ATTACK_TYPES := {
	"contact": AttackType.CONTACT, "gun": AttackType.GUN, "cannon": AttackType.CANNON,
	"torpedo": AttackType.LAUNCH, "missile": AttackType.LAUNCH, "mine": AttackType.LAUNCH,
	"bomb": AttackType.BOMB, "none": AttackType.NONE,
}

var enemy_id := ""
var visual := ""
var wave := 1
var state := State.DEAD
var alive := false
var counts_as_kill := true
var hp := 0.0
var max_hp := 0.0
var shield := 0.0
var max_shield := 0.0
## Seconds since the last hit; shields regenerate after the delay in balance.json → shields.
var since_hit := 0.0
var radius := 0.0
var speed := 0.0
## Current domain flags; a surfaced submarine has Submerged | Surface.
var domain := 0
var base_domain := 0
var surfaced := false
var armor := 0
## Damage when it touches the fortress (rammers; ranged enemies stop before that).
var contact_damage := 0.0
var attack_type := AttackType.CONTACT
var attack_damage := 0.0
var attack_interval := 0.0
## Splash radius of a bomb; also how close the salvage boat must be to get hurt.
var attack_radius := 0.0
## Counts down to the next ranged attack; the behavior sets attack_ready when it is due.
var attack_timer := 0.0
var attack_ready := false
var projectile_id := ""
var projectile_hp := 0.0
## Seconds a turret is knocked out when this enemy reaches the base (Landing Craft).
var disable_turret := 0.0
## Damage to the salvage boat on contact (hunters, mines); 0 means the enemy ignores the boat.
var boat_damage := 0.0
## Flies over the fortress instead of ramming it (Bomber).
var ignores_contact := false
## Shield aura for allies (Shield Frigate): radius, shield per pulse and pulse interval.
var aura_radius := 0.0
var aura_shield := 0.0
var aura_interval := 0.0
var aura_timer := 0.0
var elite := Elite.NONE
## Elite Regenerating: share of max HP healed per second.
var regen_fraction := 0.0
var loot_table := ""
var velocity := Vector2.ZERO
var behavior: EnemyBehavior
## Per-enemy movement state rolled or kept by the behavior.
var weave_amplitude := 0.0
var weave_omega := 0.0
var weave_phase := 0.0
var orbit_direction := 1.0
var phase_timer := 0.0
var exit_distance := 0.0

var _flash := 0.0
var _hit_once := false
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
	max_shield = float(def.get("shield", 0.0)) * hp_scale
	shield = max_shield
	since_hit = 0.0
	radius = float(def["radius"])
	speed = float(def["speed"]) * speed_scale
	base_domain = CombatTypes.domain_from_name(str(def["domain"]))
	domain = base_domain
	surfaced = false
	armor = CombatTypes.armor_from_name(str(def["armor"]))
	var attack: Dictionary = def["attack"]
	attack_type = ATTACK_TYPES[str(attack["type"])]
	attack_damage = float(attack["damage"]) * damage_scale
	attack_interval = float(attack.get("interval", 0.0))
	attack_radius = float(attack.get("radius", 0.0))
	projectile_id = str(attack.get("projectile", ""))
	projectile_hp = float(attack.get("projectile_hp", 0.0)) * hp_scale
	disable_turret = float(attack.get("disable_turret", 0.0))
	contact_damage = attack_damage
	boat_damage = float(attack.get("boat_damage", 0.0)) * damage_scale
	ignores_contact = false
	var aura: Dictionary = def.get("aura", {})
	aura_radius = float(aura.get("radius", 0.0))
	aura_shield = float(aura.get("shield", 0.0)) * hp_scale
	aura_interval = float(aura.get("interval", 0.0))
	aura_timer = aura_interval
	elite = Elite.NONE
	regen_fraction = 0.0
	loot_table = str(def.get("loot_table", ""))
	behavior = p_behavior
	state = State.SPAWN
	alive = true
	attack_ready = false
	phase_timer = 0.0
	_hit_once = false
	_build_shape()
	queue_redraw()


## Applies an elite modifier (section 5). `config` is balance.json → elites.
func make_elite(modifier: Elite, config: Dictionary) -> void:
	elite = modifier
	match modifier:
		Elite.ARMORED:
			armor = mini(armor + 1, CombatTypes.Armor.SHIELD)
		Elite.FAST:
			speed *= float(config["fast_speed"])
		Elite.REGENERATING:
			regen_fraction = float(config["regen_per_second"])
		Elite.SHIELDED:
			max_shield += max_hp * float(config["shield_fraction"])
			shield = max_shield
	queue_redraw()


func set_surfaced(value: bool) -> void:
	surfaced = value
	domain = base_domain | (CombatTypes.DOMAIN_SURFACE if value else 0)
	queue_redraw()


func reset() -> void:
	enemy_id = ""
	state = State.DEAD
	alive = false
	hp = 0.0
	shield = 0.0
	velocity = Vector2.ZERO
	behavior = null
	attack_ready = false
	elite = Elite.NONE
	rotation = 0.0
	_flash = 0.0


func flash() -> void:
	_flash = FLASH_TIME
	_hit_once = true
	queue_redraw()


func tick_visual(delta: float) -> void:
	if _flash > 0.0:
		_flash -= delta
		if _flash <= 0.0:
			queue_redraw()
	elif _hit_once and (hp < max_hp or shield < max_shield):
		queue_redraw()


func _build_shape() -> void:
	_hull = EnemyShapes.hull(visual, radius)
	_outline = _hull.duplicate()
	_outline.append(_hull[0])
	_color = EnemyShapes.domain_color(base_domain)


func _draw() -> void:
	var submerged := base_domain == CombatTypes.DOMAIN_SUBMERGED and not surfaced
	if submerged:
		draw_polyline(_outline, RIPPLE_COLOR, 3.0, true)
		draw_arc(Vector2.ZERO, radius * 1.3, 0.0, TAU, 32, RIPPLE_COLOR, 2.0, true)
	else:
		if elite != Elite.NONE:
			draw_arc(Vector2.ZERO, radius * 1.45, 0.0, TAU, 32, ELITE_GLOW_COLOR, 6.0, true)
		draw_colored_polygon(_hull, FLASH_COLOR if _flash > 0.0 else _color)
		draw_polyline(_outline, OUTLINE_COLOR, 3.0, true)
		var accent := EnemyShapes.accent(visual)
		draw_circle(Vector2(float(accent[0]) * radius, 0.0), float(accent[1]) * radius, accent[2])
		if max_shield > 0.0 and shield > 0.0:
			draw_arc(Vector2.ZERO, radius * 1.25, 0.0, TAU, 32, Color(SHIELD_COLOR, 0.6), 3.0, true)
	if _hit_once and alive:
		_draw_bars()


func _draw_bars() -> void:
	draw_set_transform(Vector2.ZERO, -rotation)
	var width := radius * 2.2
	var top := -radius * 1.8
	draw_rect(Rect2(-width * 0.5, top, width, 7.0), HP_BACK_COLOR)
	draw_rect(Rect2(-width * 0.5, top, width * clampf(hp / max_hp, 0.0, 1.0), 7.0), HP_COLOR)
	if max_shield > 0.0:
		draw_rect(Rect2(-width * 0.5, top - 9.0, width * clampf(shield / max_shield, 0.0, 1.0), 6.0), SHIELD_COLOR)
	draw_set_transform(Vector2.ZERO, 0.0)
