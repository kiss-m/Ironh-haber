extends Node
## Permanent player data and the save file (GAME_DESIGN.md section 11): resources, upgrade levels,
## unlocked weapons, loadout, sectors, stats, settings and the run snapshot. Run-only data lives in
## RunState. Resources are only added by SalvageSystem (when the boat unloads); the Shipyard spends
## them through purchase().
##
## The game saves after every purchase, at every wave break (run snapshot), when a run ends and
## when the app is paused or closed. Tests point `save_path` at their own file (tests/pre_run.gd).

const DEFAULT_SAVE_PATH := "user://save.json"
const DEFAULT_SECTOR := "coastal"

var save_path := DEFAULT_SAVE_PATH
## The whole save file, laid out as in section 11 (see SaveMigrator.defaults()).
var data: Dictionary = {}
var upgrades: Upgrades
## Summary of the last finished run, for the results screen.
var last_run: Dictionary = {}
## What the next battle starts from: {} for a new run in the default sector, or a run snapshot.
var pending_run: Dictionary = {}

var _stats: StatResolver


func _ready() -> void:
	upgrades = Upgrades.new(DataRegistry.upgrades, DataRegistry.weapons)
	load_game()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_WM_CLOSE_REQUEST:
		save_game()


func load_game() -> void:
	data = SaveStore.new(save_path).read()
	if data.is_empty():
		data = SaveMigrator.defaults()
	_apply_language()
	_refresh_stats()


func save_game() -> Error:
	var err := SaveStore.new(save_path).write(data)
	if err != OK:
		push_error("Saving failed: %s" % error_string(err))
	return err


## Back to a fresh player (the debug menu's "reset save" in M7, and tests).
func reset() -> void:
	data = SaveMigrator.defaults()
	last_run = {}
	pending_run = {}
	_apply_language()
	_refresh_stats()


# --- Resources -----------------------------------------------------------------------------

var resources: Dictionary:
	get:
		return data["resources"]


func resource(resource_name: String) -> int:
	return int(data["resources"].get(resource_name, 0))


## Adds banked resources. Only SalvageSystem calls this, when the boat unloads.
func add_resources(delta: Dictionary) -> void:
	for resource_name: String in delta:
		data["resources"][resource_name] = resource(resource_name) + int(delta[resource_name])


# --- Upgrades ------------------------------------------------------------------------------

func upgrade_level(key: String) -> int:
	return int(data["upgrades"].get(key, 0))


func upgrade_levels() -> Dictionary:
	return data["upgrades"]


func best_wave_overall() -> int:
	var best := 0
	for sector_id: String in data["sectors"]:
		best = maxi(best, int(data["sectors"][sector_id].get("best_wave", 0)))
	return best


func purchase_block(key: String) -> Upgrades.Block:
	return upgrades.block(key, upgrade_levels(), data["resources"], best_wave_overall())


## Buys the next level of `key`. Returns true on success; saves immediately.
func purchase(key: String) -> bool:
	if purchase_block(key) != Upgrades.Block.NONE:
		return false
	var level := upgrade_level(key)
	var price := upgrades.cost(key, level)
	for resource_name: String in price:
		data["resources"][resource_name] = resource(resource_name) - int(price[resource_name])
	data["upgrades"][key] = level + 1
	_refresh_stats()
	EventBus.upgrade_purchased.emit(StringName(key), level + 1)
	save_game()
	return true


## Sets a level directly, without paying (debug menu in M7, tests).
func set_upgrade_level(key: String, level: int) -> void:
	data["upgrades"][key] = clampi(level, 0, upgrades.track(key).max_level)
	_refresh_stats()


## A StatResolver loaded with every owned upgrade (perks join it during runs in M6).
func stats() -> StatResolver:
	return _stats


func _refresh_stats() -> void:
	if _stats == null:
		_stats = StatResolver.new(DataRegistry.balance["stat_caps"])
	_stats.set_modifiers(upgrades.modifiers(upgrade_levels()))


# --- Loadout -------------------------------------------------------------------------------

func turret_slots() -> int:
	return int(_stats.resolve("fortress.turret_slots", float(DataRegistry.balance["fortress"]["turret_slots"])))


func unlocked_weapons() -> Array:
	return data["unlocked_weapons"]


## Weapon id per slot ("" for an empty slot), sized to the current slot count.
func loadout() -> PackedStringArray:
	var result := PackedStringArray()
	var saved: Array = data["loadout"]
	for slot in turret_slots():
		result.append(str(saved[slot]) if slot < saved.size() and saved[slot] != null else "")
	return result


## Puts `weapon_id` ("" to empty it) in `slot`. Each weapon type can be mounted at most
## balance.max_mounts_per_weapon times (section 4), and at least one slot stays armed.
## Returns true on success; saves.
func set_loadout_slot(slot: int, weapon_id: String) -> bool:
	if slot < 0 or slot >= turret_slots():
		return false
	if weapon_id != "" and not weapon_id in unlocked_weapons():
		return false
	var current := loadout()
	var mounted := 0
	var others := 0
	for i in current.size():
		if i != slot and current[i] != "":
			others += 1
		if i != slot and current[i] == weapon_id:
			mounted += 1
	if weapon_id == "" and others == 0:
		return false
	if weapon_id != "" and mounted >= int(DataRegistry.balance["max_mounts_per_weapon"]):
		return false
	current[slot] = weapon_id
	data["loadout"] = Array(current)
	save_game()
	return true


# --- Runs ----------------------------------------------------------------------------------

func best_wave(sector_id: String) -> int:
	return int(data["sectors"].get(sector_id, {}).get("best_wave", 0))


func sector_unlocked(sector_id: String) -> bool:
	return bool(data["sectors"].get(sector_id, {}).get("unlocked", false))


func active_run() -> Dictionary:
	var run: Variant = data.get("active_run")
	return run if run is Dictionary else {}


## Snapshot taken at every wave break: the run continues from the start of `snapshot.wave`.
func snapshot_run(snapshot: Dictionary) -> void:
	data["active_run"] = snapshot
	save_game()


## Records a finished run: stats, best wave per sector, clears the snapshot, saves.
## Returns the summary with "new_best" added.
func finish_run(summary: Dictionary) -> Dictionary:
	var result := summary.duplicate(true)
	var sector_id := str(summary.get("sector", DEFAULT_SECTOR))
	var wave := int(summary.get("wave", 0))
	var sector: Dictionary = data["sectors"].get(sector_id, { "unlocked": true, "best_wave": 0 })
	result["new_best"] = wave > int(sector.get("best_wave", 0))
	if result["new_best"]:
		sector["best_wave"] = wave
	data["sectors"][sector_id] = sector
	_unlock_sectors()
	var run_stats: Dictionary = data["stats"]
	run_stats["runs"] = int(run_stats["runs"]) + 1
	run_stats["kills"] = int(run_stats["kills"]) + int(summary.get("kills", 0))
	run_stats["play_time_s"] = int(run_stats["play_time_s"]) + int(summary.get("time", 0.0))
	data["active_run"] = null
	last_run = result
	save_game()
	return result


# --- Settings ------------------------------------------------------------------------------

func language() -> String:
	return str(data["settings"].get("language", "sk"))


func set_language(code: String) -> void:
	data["settings"]["language"] = code
	_apply_language()
	save_game()


func _apply_language() -> void:
	TranslationServer.set_locale(str(data.get("settings", {}).get("language", "sk")))


func _unlock_sectors() -> void:
	for id: String in DataRegistry.sectors:
		var unlock: Dictionary = DataRegistry.sectors[id]["unlock"]
		if str(unlock["sector"]) != "" and best_wave(str(unlock["sector"])) >= int(unlock["wave"]):
			var entry: Dictionary = data["sectors"].get(id, { "best_wave": 0 })
			entry["unlocked"] = true
			data["sectors"][id] = entry
