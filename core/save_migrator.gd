class_name SaveMigrator
extends RefCounted
## Upgrades old save files step by step, v1 → v2 → … (GAME_DESIGN.md section 11). Each step is a
## static function from version n to n + 1 with its own unit test. Missing keys are filled from
## the defaults, so older saves gain new fields without a migration of their own.

const CURRENT_VERSION := 1


## The save file layout of section 11 with a fresh player's values.
static func defaults() -> Dictionary:
	return {
		"version": CURRENT_VERSION,
		"resources": { "credits": 0, "steel": 0, "electronics": 0, "cores": 0 },
		"upgrades": {},
		"unlocked_weapons": ["machine_gun", "naval_cannon"],
		"loadout": ["machine_gun", "naval_cannon"],
		"sectors": { "coastal": { "unlocked": true, "best_wave": 0 } },
		"milestones_claimed": [],
		"stats": { "runs": 0, "kills": 0, "bosses": 0, "play_time_s": 0 },
		"settings": { "language": "sk", "music": 0.7, "sfx": 0.9, "haptics": true, "aim_assist": true },
		"tutorial_done": false,
		"active_run": null,
	}


static func migrate(data: Dictionary) -> Dictionary:
	var result := data.duplicate(true)
	var version := int(result.get("version", 1))
	# Future steps go here: if version == 1: result = _v1_to_v2(result); version = 2
	if version > CURRENT_VERSION:
		push_warning("Save version %d is newer than this build (%d)" % [version, CURRENT_VERSION])
	result["version"] = CURRENT_VERSION
	return _fill_defaults(result, defaults())


static func _fill_defaults(data: Dictionary, template: Dictionary) -> Dictionary:
	for key: String in template:
		if not data.has(key):
			data[key] = template[key] if not template[key] is Dictionary else (template[key] as Dictionary).duplicate(true)
		elif data[key] is Dictionary and template[key] is Dictionary and not (template[key] as Dictionary).is_empty():
			_fill_defaults(data[key], template[key])
	return data
