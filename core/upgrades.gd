class_name Upgrades
extends RefCounted
## Permanent upgrade tracks bought in the Shipyard (GAME_DESIGN.md sections 4, 7 and 8).
##
## Cost of the next level, n = current level of the track:
##
##   Cost_r(n) = ⌈C0_r · g_r^n⌉   for each resource r the track uses, from level start_r on
##
## A few tracks list explicit costs per level instead ("costs_by_level", e.g. turret slots).
## Each level adds stat modifiers in the StatResolver format: "mul" multiplies by per_level^n when
## "compound" is set and by 1 + (per_level − 1)·n otherwise; "add" adds per_level·n.
## Weapon tracks are built per weapon from "weapon_tracks" plus its "weapon_specials" entry, keyed
## "weapon.<weapon id>.<track>". The Damage track is gated by Tier-ups: every levels_per_tier
## Damage levels need one more Tier level.

enum Block { NONE, MAX_LEVEL, LOCKED, NEEDS_TIER, TOO_EXPENSIVE }

class Track:
	extends RefCounted
	var key := ""
	var name_key := ""
	## "arsenal", "fortress" or "salvage".
	var tab := ""
	var weapon_id := ""
	var max_level := 0
	## [{ "resource", "c0", "g", "start" }]
	var costs: Array[Dictionary] = []
	## Explicit cost per level (index = current level), or empty.
	var costs_by_level: Array = []
	## [{ "stat", "op", "per_level", "compound" }]
	var modifiers: Array[Dictionary] = []
	var unlock_wave := 0
	var gate_track := ""
	var levels_per_tier := 0

## Track keys in Shipyard display order.
var order: PackedStringArray = []
var tracks: Dictionary = {}


func _init(upgrades: Dictionary, weapons: Dictionary) -> void:
	for weapon_id: String in weapons:
		for track_id: String in upgrades["weapon_tracks"]:
			_add("weapon.%s.%s" % [weapon_id, track_id], upgrades["weapon_tracks"][track_id], "arsenal", weapon_id)
		var specials: Dictionary = upgrades.get("weapon_specials", {})
		if specials.has(weapon_id):
			_add("weapon.%s.special" % weapon_id, specials[weapon_id], "arsenal", weapon_id)
	for key: String in upgrades["tracks"]:
		var def: Dictionary = upgrades["tracks"][key]
		_add(key, def, str(def["tab"]), "")


static func formula_cost(c0: float, g: float, level: int) -> int:
	return ceili(c0 * pow(g, level) - 0.000001)


func track(key: String) -> Track:
	return tracks.get(key)


## Resources needed to go from `level` to `level + 1`, as {resource name: amount}.
func cost(key: String, level: int) -> Dictionary:
	var t := track(key)
	var result := {}
	if not t.costs_by_level.is_empty():
		if level < t.costs_by_level.size():
			for resource: String in t.costs_by_level[level]:
				result[resource] = int(t.costs_by_level[level][resource])
		return result
	for entry in t.costs:
		if level >= int(entry["start"]):
			result[entry["resource"]] = formula_cost(entry["c0"], entry["g"], level)
	return result


## Why the next level of `key` cannot be bought now, or Block.NONE.
## `levels` maps track keys to owned levels; `resources` maps resource names to amounts.
func block(key: String, levels: Dictionary, resources: Dictionary, best_wave: int) -> Block:
	var t := track(key)
	var level := int(levels.get(key, 0))
	if level >= t.max_level:
		return Block.MAX_LEVEL
	if best_wave < t.unlock_wave:
		return Block.LOCKED
	if t.gate_track != "":
		var tier_key := "weapon.%s.%s" % [t.weapon_id, t.gate_track]
		if level >= (int(levels.get(tier_key, 0)) + 1) * t.levels_per_tier:
			return Block.NEEDS_TIER
	var price := cost(key, level)
	for resource: String in price:
		if int(resources.get(resource, 0)) < int(price[resource]):
			return Block.TOO_EXPENSIVE
	return Block.NONE


## Stat modifiers for owning `level` levels of `key`.
func track_modifiers(key: String, level: int) -> Array[Dictionary]:
	var t := track(key)
	var result: Array[Dictionary] = []
	if level <= 0:
		return result
	for spec in t.modifiers:
		var per_level := float(spec["per_level"])
		var value := 0.0
		var op := str(spec["op"])
		if op == "mul":
			value = pow(per_level, level) if spec.get("compound", false) else 1.0 + (per_level - 1.0) * level
		else:
			value = per_level * level
		var modifier := { "stat": spec["stat"], "op": op, "value": value }
		if t.weapon_id != "":
			modifier["filter"] = { "weapon": t.weapon_id }
		result.append(modifier)
	return result


## All modifiers for a save's upgrade levels.
func modifiers(levels: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for key: String in levels:
		if tracks.has(key):
			result.append_array(track_modifiers(key, int(levels[key])))
	return result


func _add(key: String, def: Dictionary, tab: String, weapon_id: String) -> void:
	var t := Track.new()
	t.key = key
	t.name_key = str(def["name_key"])
	t.tab = tab
	t.weapon_id = weapon_id
	t.max_level = int(def["max_level"])
	for resource: String in def.get("costs", {}):
		var entry: Dictionary = def["costs"][resource]
		t.costs.append({ "resource": resource, "c0": float(entry["c0"]), "g": float(entry["g"]),
				"start": int(entry.get("start", 0)) })
	t.costs_by_level = def.get("costs_by_level", [])
	for spec: Dictionary in def["modifiers"]:
		t.modifiers.append(spec)
	t.unlock_wave = int(def.get("unlock", {}).get("best_wave", 0))
	if def.has("gate"):
		t.gate_track = str(def["gate"]["track"])
		t.levels_per_tier = int(def["gate"]["levels_per_tier"])
	tracks[key] = t
	order.append(key)
