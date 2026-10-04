extends GutTest
## Save system (GAME_DESIGN.md section 11): atomic writes with a backup, fallback, migration
## and the GameState rules for purchases and the loadout.

const PATH := "user://unit_save.json"

var store: SaveStore


func before_each() -> void:
	store = SaveStore.new(PATH)
	store.delete_all()
	GameState.reset()


func after_each() -> void:
	store.delete_all()


func test_round_trip() -> void:
	var data := SaveMigrator.defaults()
	data["resources"]["credits"] = 123
	data["upgrades"]["fortress.hull"] = 4
	assert_eq(store.write(data), OK)
	var loaded := store.read()
	assert_eq(int(loaded["resources"]["credits"]), 123)
	assert_eq(int(loaded["upgrades"]["fortress.hull"]), 4)
	assert_false(FileAccess.file_exists(store.temp_path()), "no temp file left behind")


func test_second_write_keeps_the_previous_file_as_backup() -> void:
	var first := SaveMigrator.defaults()
	first["resources"]["credits"] = 1
	store.write(first)
	var second := SaveMigrator.defaults()
	second["resources"]["credits"] = 2
	store.write(second)
	assert_true(FileAccess.file_exists(store.backup_path()))
	assert_eq(int(SaveStore._parse(store.backup_path())["resources"]["credits"]), 1)


func test_corrupt_save_falls_back_to_the_backup() -> void:
	var good := SaveMigrator.defaults()
	good["resources"]["credits"] = 77
	store.write(good)
	store.write(good)
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	file.store_string("{ not json")
	file.close()
	assert_eq(int(store.read()["resources"]["credits"]), 77)


func test_missing_save_reads_empty() -> void:
	assert_eq(store.read(), {})


func test_migration_fills_missing_fields() -> void:
	var old := { "version": 1, "resources": { "credits": 5 } }
	var migrated := SaveMigrator.migrate(old)
	assert_eq(migrated["version"], SaveMigrator.CURRENT_VERSION)
	assert_eq(int(migrated["resources"]["credits"]), 5)
	assert_eq(int(migrated["resources"]["steel"]), 0)
	assert_eq(migrated["loadout"], ["machine_gun", "naval_cannon"])
	assert_true(migrated["sectors"]["coastal"]["unlocked"])


func test_purchase_spends_resources_and_raises_the_level() -> void:
	watch_signals(EventBus)
	GameState.data["resources"]["credits"] = 100
	assert_true(GameState.purchase("fortress.hull"))
	assert_eq(GameState.upgrade_level("fortress.hull"), 1)
	assert_eq(GameState.resource("credits"), 70)
	assert_signal_emitted_with_parameters(EventBus, "upgrade_purchased", [&"fortress.hull", 1])
	assert_false(GameState.purchase("fortress.slots"), "150 credits and 10 steel are not there")
	assert_eq(GameState.upgrade_level("fortress.slots"), 0)


func test_loadout_limits() -> void:
	assert_eq(GameState.turret_slots(), 2)
	assert_false(GameState.set_loadout_slot(2, "machine_gun"), "only two slots without the upgrade")
	GameState.set_upgrade_level("fortress.slots", 1)
	assert_eq(GameState.turret_slots(), 3)
	assert_true(GameState.set_loadout_slot(2, "machine_gun"), "second machine gun")
	assert_false(GameState.set_loadout_slot(1, "machine_gun"), "a third one is over the limit of two")
	assert_false(GameState.set_loadout_slot(5, "machine_gun"), "no such slot")
	assert_true(GameState.set_loadout_slot(0, ""))
	assert_eq(GameState.loadout(), PackedStringArray(["", "naval_cannon", "machine_gun"]))


func test_last_armed_slot_cannot_be_emptied() -> void:
	assert_true(GameState.set_loadout_slot(0, ""))
	assert_false(GameState.set_loadout_slot(1, ""))
