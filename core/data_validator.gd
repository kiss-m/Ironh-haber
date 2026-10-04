class_name DataValidator
extends RefCounted
## Checks the loaded data files (GAME_DESIGN.md section 10: missing ids, unknown references,
## negative numbers) and returns readable messages. An empty result means the data is valid.

const BEHAVIORS: PackedStringArray = ["ram", "ranged_stop", "hunter"]
const ATTACK_TYPES: PackedStringArray = ["contact", "gun", "cannon", "torpedo"]
const RANGED_ATTACKS: PackedStringArray = ["gun", "cannon", "torpedo"]
const PROJECTILES: PackedStringArray = ["bullet", "shell"]
const VISUALS: PackedStringArray = ["skiff", "patrol_boat", "drone", "torpedo_boat", "gunboat", "torpedo", "hunter"]
const WEAPON_STATS: PackedStringArray = ["damage", "fire_rate", "range", "turn_speed", "projectile_speed"]
const WAVE_SECTIONS: PackedStringArray = ["scaling", "featured", "edges", "timeline", "formations", "lifecycle", "spawn"]


static func validate(weapons: Dictionary, enemies: Dictionary, balance: Dictionary, waves: Dictionary,
		loot_tables: Dictionary) -> PackedStringArray:
	var problems := PackedStringArray()
	_check_negative(loot_tables, "loot_tables.json", problems)
	for table_id: String in loot_tables:
		_check_loot_table(table_id, loot_tables[table_id], problems)
	_check_negative(weapons, "weapons.json", problems)
	_check_negative(enemies, "enemies.json", problems)
	_check_negative(balance, "balance.json", problems)
	_check_negative(waves, "waves.json", problems)
	for id: String in weapons:
		_check_weapon(id, weapons[id], problems)
	for id: String in enemies:
		_check_enemy(id, enemies[id], enemies, loot_tables, problems)
	for weapon_id: Variant in balance.get("starting_loadout", []):
		if not weapons.has(str(weapon_id)):
			problems.append("balance.json: starting_loadout references unknown weapon '%s'" % weapon_id)
	for section in WAVE_SECTIONS:
		if not waves.has(section):
			problems.append("waves.json: missing section '%s'" % section)
	return problems


## Checks upgrades.json and sectors.json.
static func validate_meta(upgrades: Dictionary, sectors: Dictionary, weapons: Dictionary) -> PackedStringArray:
	var problems := PackedStringArray()
	_check_negative(sectors, "sectors.json", problems)
	for section in ["weapon_tracks", "weapon_specials", "tracks"]:
		if not upgrades.has(section):
			problems.append("upgrades.json: missing section '%s'" % section)
			return problems
	for id: String in upgrades["weapon_tracks"]:
		_check_track("upgrades.json weapon_tracks.%s" % id, upgrades["weapon_tracks"][id], false, problems)
	for id: String in upgrades["weapon_specials"]:
		if not weapons.has(id):
			problems.append("upgrades.json: weapon_specials references unknown weapon '%s'" % id)
		_check_track("upgrades.json weapon_specials.%s" % id, upgrades["weapon_specials"][id], false, problems)
	for key: String in upgrades["tracks"]:
		_check_track("upgrades.json tracks.%s" % key, upgrades["tracks"][key], true, problems)
	if not sectors.has("coastal"):
		problems.append("sectors.json: the first sector 'coastal' is missing")
	for id: String in sectors:
		var unlock: Dictionary = sectors[id].get("unlock", {})
		var after := str(unlock.get("sector", ""))
		if after != "" and not sectors.has(after):
			problems.append("sectors.json '%s': unlock references unknown sector '%s'" % [id, after])
	return problems


static func _check_track(where: String, def: Dictionary, needs_tab: bool, problems: PackedStringArray) -> void:
	_require(def, ["name_key", "max_level", "modifiers"], where, problems)
	if needs_tab and not str(def.get("tab", "")) in ["fortress", "salvage"]:
		problems.append("%s: tab must be fortress or salvage" % where)
	if int(def.get("max_level", 0)) < 1:
		problems.append("%s: max_level must be at least 1" % where)
	if not def.has("costs") and not def.has("costs_by_level"):
		problems.append("%s: needs costs or costs_by_level" % where)
	if def.has("costs_by_level") and (def["costs_by_level"] as Array).size() < int(def.get("max_level", 0)):
		problems.append("%s: costs_by_level needs one entry per level" % where)
	for resource: String in def.get("costs", {}):
		if LootRoller.resource_from_name(resource) < 0:
			problems.append("%s: unknown resource '%s'" % [where, resource])
	for modifier: Dictionary in def.get("modifiers", []):
		if not str(modifier.get("op", "")) in ["add", "mul"] or not modifier.has("stat") or not modifier.has("per_level"):
			problems.append("%s: modifiers need stat, op (add or mul) and per_level" % where)


static func _check_weapon(id: String, def: Dictionary, problems: PackedStringArray) -> void:
	var where := "weapons.json '%s'" % id
	_require(def, ["name_key", "domains", "damage_type", "base", "projectile"], where, problems)
	if CombatTypes.DamageType.has(str(def.get("damage_type", "")).to_upper()) == false:
		problems.append("%s: unknown damage_type '%s'" % [where, def.get("damage_type")])
	for domain: Variant in def.get("domains", []):
		if not str(domain) in ["surface", "submerged", "air"]:
			problems.append("%s: unknown domain '%s'" % [where, domain])
	if not str(def.get("projectile", "")) in PROJECTILES:
		problems.append("%s: unknown projectile '%s'" % [where, def.get("projectile")])
	var base: Dictionary = def.get("base", {})
	for stat in WEAPON_STATS:
		if float(base.get(stat, 0.0)) <= 0.0:
			problems.append("%s: base.%s must be greater than 0" % [where, stat])


static func _check_enemy(id: String, def: Dictionary, enemies: Dictionary, loot_tables: Dictionary,
		problems: PackedStringArray) -> void:
	var where := "enemies.json '%s'" % id
	_require(def, ["name_key", "visual", "domain", "armor", "hp", "speed", "radius", "behavior", "attack"], where, problems)
	if not str(def.get("visual", "")) in VISUALS:
		problems.append("%s: unknown visual '%s'" % [where, def.get("visual")])
	if not str(def.get("domain", "")) in ["surface", "submerged", "air"]:
		problems.append("%s: unknown domain '%s'" % [where, def.get("domain")])
	if not CombatTypes.Armor.has(str(def.get("armor", "")).to_upper()):
		problems.append("%s: unknown armor '%s'" % [where, def.get("armor")])
	for stat in ["hp", "speed", "radius"]:
		if def.has(stat) and float(def[stat]) <= 0.0:
			problems.append("%s: %s must be greater than 0" % [where, stat])
	if not str(def.get("behavior", "")) in BEHAVIORS:
		problems.append("%s: unknown behavior '%s'" % [where, def.get("behavior")])
	var attack: Dictionary = def.get("attack", {})
	var attack_type := str(attack.get("type", ""))
	if not attack_type in ATTACK_TYPES:
		problems.append("%s: unknown attack type '%s'" % [where, attack_type])
	if not attack.has("damage"):
		problems.append("%s: attack needs a damage" % where)
	if attack_type in RANGED_ATTACKS and float(attack.get("interval", 0.0)) <= 0.0:
		problems.append("%s: a %s attack needs an interval greater than 0" % [where, attack_type])
	if attack_type == "torpedo" and not enemies.has(str(attack.get("projectile", ""))):
		problems.append("%s: torpedo attack references unknown enemy '%s'" % [where, attack.get("projectile")])
	if def.has("first_wave") != def.has("budget_cost"):
		problems.append("%s: wave enemies need both first_wave and budget_cost" % where)
	if def.has("loot_table") and not loot_tables.has(str(def["loot_table"])):
		problems.append("%s: unknown loot_table '%s'" % [where, def["loot_table"]])
	if def.has("first_wave"):
		if not def.has("loot_table"):
			problems.append("%s: wave enemies need a loot_table" % where)
		if float(def["budget_cost"]) <= 0.0 or int(def["first_wave"]) < 1:
			problems.append("%s: budget_cost must be > 0 and first_wave ≥ 1" % where)
		var size: Variant = def.get("group_size")
		if not size is Array or (size as Array).size() != 2 or int(size[0]) < 1 or int(size[0]) > int(size[1]):
			problems.append("%s: group_size must be [min, max] with 1 ≤ min ≤ max" % where)


static func _check_loot_table(table_id: String, table: Dictionary, problems: PackedStringArray) -> void:
	var where := "loot_tables.json '%s'" % table_id
	if not table.has("credits"):
		problems.append("%s: missing \"credits\"" % where)
	for key: String in table:
		if LootRoller.resource_from_name(key) < 0:
			problems.append("%s: unknown resource '%s'" % [where, key])
		elif table[key] is Dictionary and float(table[key].get("chance", 1.0)) > 1.0:
			problems.append("%s: %s chance must be at most 1" % [where, key])


static func _require(def: Dictionary, keys: Array, where: String, problems: PackedStringArray) -> void:
	for key: String in keys:
		if not def.has(key):
			problems.append("%s: missing \"%s\"" % [where, key])


static func _check_negative(value: Variant, path: String, problems: PackedStringArray) -> void:
	if value is Dictionary:
		for key: Variant in value:
			_check_negative(value[key], "%s.%s" % [path, key], problems)
	elif value is Array:
		for i in (value as Array).size():
			_check_negative(value[i], "%s[%d]" % [path, i], problems)
	elif (value is float or value is int) and value < 0:
		problems.append("%s: negative number %s" % [path, value])
