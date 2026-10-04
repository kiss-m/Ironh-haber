class_name StatResolver
extends RefCounted
## Final stats from base values plus modifiers (GAME_DESIGN.md section 10). Upgrades (M4) and perks
## (M6) are lists of modifiers in the shared format:
##
##   { "stat": "weapon.damage", "op": "mul", "value": 1.15, "filter": { "weapon": "machine_gun" } }
##
## A stat resolves to (base + Σ add) × Π mul. A "set" modifier replaces that result (the last one
## wins). Caps from balance.json ("max_mul" relative to base, "max" and "min" absolute) apply last.
## Results are cached and the cache is cleared whenever the modifiers change.

signal changed

var _modifiers: Array[Dictionary] = []
var _caps: Dictionary = {}
var _cache: Dictionary = {}


func _init(caps: Dictionary = {}) -> void:
	_caps = caps


func set_modifiers(modifiers: Array[Dictionary]) -> void:
	_modifiers = modifiers.duplicate()
	_cache.clear()
	changed.emit()


func add_modifier(modifier: Dictionary) -> void:
	_modifiers.append(modifier)
	_cache.clear()
	changed.emit()


## `context` describes what is asking, e.g. {"weapon": "naval_cannon"}; a modifier applies when
## every key in its filter matches the context.
func resolve(stat: String, base: float, context: Dictionary = {}) -> float:
	var key := "%s|%s|%s" % [stat, base, context]
	if _cache.has(key):
		return _cache[key]
	var add := 0.0
	var mul := 1.0
	var has_set := false
	var set_value := 0.0
	for modifier in _modifiers:
		if modifier["stat"] != stat or not _matches(modifier.get("filter", {}), context):
			continue
		var value := float(modifier["value"])
		match modifier["op"]:
			"add":
				add += value
			"mul":
				mul *= value
			"set":
				has_set = true
				set_value = value
			_:
				push_error("Unknown modifier op '%s'" % modifier["op"])
	var result := set_value if has_set else (base + add) * mul
	result = _apply_cap(stat, base, result)
	_cache[key] = result
	return result


func _apply_cap(stat: String, base: float, value: float) -> float:
	if not _caps.has(stat):
		return value
	var cap: Dictionary = _caps[stat]
	if cap.has("max_mul"):
		value = minf(value, base * float(cap["max_mul"]))
	if cap.has("max"):
		value = minf(value, float(cap["max"]))
	if cap.has("min"):
		value = maxf(value, float(cap["min"]))
	return value


static func _matches(filter: Dictionary, context: Dictionary) -> bool:
	for key: String in filter:
		if not context.has(key) or context[key] != filter[key]:
			return false
	return true
