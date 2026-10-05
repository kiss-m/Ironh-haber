class_name Sandbox
extends RefCounted
## Test build ("Iron Harbor TEST", export preset "Android Sandbox" with the `sandbox` feature tag):
## a separate app with its own save that tops up resources, unlocks every weapon and counts a best
## wave and a boss kill, so later content can be tried on a phone before the M7 debug menu exists.
## The sector screen also offers starting at later waves. Numbers live in balance.json → sandbox.
## This is the one place besides SalvageSystem that adds resources, and only in the test build.

const FEATURE := "sandbox"


static func enabled() -> bool:
	return OS.has_feature(FEATURE)


## Applies the sandbox gifts to a save layout (SaveMigrator.defaults()) in place.
static func apply(data: Dictionary, config: Dictionary, weapon_ids: Array, sector_id: String) -> void:
	for resource_name: String in config["resources"]:
		data["resources"][resource_name] = maxi(int(data["resources"].get(resource_name, 0)),
				int(config["resources"][resource_name]))
	for weapon_id: String in weapon_ids:
		if not weapon_id in data["unlocked_weapons"]:
			data["unlocked_weapons"].append(weapon_id)
	var sector: Dictionary = data["sectors"].get(sector_id, {})
	sector["best_wave"] = maxi(int(sector.get("best_wave", 0)), int(config["best_wave"]))
	data["sectors"][sector_id] = sector
	data["stats"]["bosses"] = maxi(int(data["stats"].get("bosses", 0)), int(config["bosses"]))
