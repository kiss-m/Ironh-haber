extends GutTest
## M4 "done when" (GAME_DESIGN.md section 16): upgrades persist after killing the app and visibly
## change gameplay. Also the wave-break run snapshot, continuing a run, recording finished runs
## and the meta screens.

const TICK := 1.0 / 60.0


func before_each() -> void:
	GameState.reset()
	GameState.save_game()


func _battle(configure := Callable()) -> Battle:
	var battle: Battle = (load(Battle.SCENE_PATH) as PackedScene).instantiate()
	battle.run_seed = 42
	battle.leave_on_end = false
	if configure.is_valid():
		configure.call(battle)
	add_child_autofree(battle)
	battle.set_physics_process(false)
	return battle


## What an app kill leaves behind: only the save file. Memory is wiped and the save read back.
func _kill_and_relaunch() -> void:
	GameState.data = {}
	GameState.load_game()


func test_upgrades_persist_after_an_app_kill_and_change_gameplay() -> void:
	GameState.data["resources"] = { "credits": 5000, "steel": 500, "electronics": 50, "cores": 0 }
	for key in ["fortress.hull", "fortress.hull", "weapon.machine_gun.dmg", "salvage.hold", "fortress.slots"]:
		assert_true(GameState.purchase(key), key)
	assert_true(GameState.set_loadout_slot(2, "machine_gun"))
	var credits_left := GameState.resource("credits")

	_kill_and_relaunch()

	assert_eq(GameState.upgrade_level("fortress.hull"), 2)
	assert_eq(GameState.upgrade_level("weapon.machine_gun.dmg"), 1)
	assert_eq(GameState.resource("credits"), credits_left, "spent resources stay spent")
	var battle := _battle()
	assert_almost_eq(battle.run_state.max_hp, 100.0 * 1.08 * 1.08, 0.001, "Hull raised base HP")
	assert_almost_eq(battle.turrets[0].damage, 6.0 * 1.12, 0.001, "Damage raised the machine gun")
	assert_eq(battle.salvage_system.capacity(), 9, "Hold added a cargo slot")
	assert_eq(battle.turrets.size(), 3, "the third slot holds a second machine gun")
	assert_eq(battle.turrets[2].weapon_id, "machine_gun")


func test_armor_and_repair_crews_change_base_damage() -> void:
	GameState.set_upgrade_level("fortress.armor", 20)
	GameState.set_upgrade_level("fortress.repair", 2)
	var battle := _battle()
	battle.wave_director.enabled = false
	battle.run_state.damage_base(10.0)
	assert_almost_eq(battle.run_state.base_hp, 100.0 - 8.0, 0.001, "20 levels block 20 %")
	for i in 60:
		battle.step(TICK)
	assert_almost_eq(battle.run_state.base_hp, 92.0 + 1.0, 0.01, "0.5 + 2 × 0.25 HP per second")


func test_wave_break_snapshot_and_continue() -> void:
	var battle := _battle()
	var kill := func(enemy: Node2D) -> void: battle.enemy_system.apply_damage(enemy, 1.0e9)
	EventBus.enemy_spawned.connect(kill)
	battle.run_state.damage_base(30.0)
	while battle.wave_director.phase != WaveDirector.Phase.BREAK:
		battle.step(TICK)
	EventBus.enemy_spawned.disconnect(kill)
	var snapshot := GameState.active_run()
	assert_eq(int(snapshot["wave"]), 2, "continues from the start of the next wave")
	assert_eq(int(snapshot["seed"]), 42)
	assert_almost_eq(float(snapshot["base_hp"]), battle.run_state.base_hp, 0.001)
	assert_eq(snapshot["sector"], "coastal")

	_kill_and_relaunch()
	assert_eq(int(GameState.active_run()["wave"]), 2, "the snapshot survived the app kill")

	GameState.pending_run = GameState.active_run()
	var resumed := _battle(func(b: Battle) -> void: b.run_seed = -1)
	assert_eq(resumed.run_state.run_seed, 42)
	assert_eq(resumed.wave_director.wave, 2)
	assert_almost_eq(resumed.run_state.base_hp, float(snapshot["base_hp"]), 0.001)
	assert_eq(resumed.run_state.kills, int(snapshot["kills"]))


func test_finished_run_records_best_wave_and_clears_the_snapshot() -> void:
	GameState.snapshot_run({ "wave": 4, "seed": 1 })
	var summary := GameState.finish_run({ "sector": "coastal", "wave": 7, "kills": 30, "time": 300.0 })
	assert_true(summary["new_best"])
	assert_eq(GameState.best_wave("coastal"), 7)
	assert_eq(GameState.active_run(), {})
	assert_eq(int(GameState.data["stats"]["kills"]), 30)
	assert_false(GameState.finish_run({ "sector": "coastal", "wave": 5 })["new_best"])
	assert_eq(GameState.best_wave("coastal"), 7)


func test_abandoning_a_run_ends_it() -> void:
	var battle := _battle()
	battle.abandon()
	assert_eq(battle.phase, Battle.Phase.ENDING)
	await wait_for_signal(EventBus.run_ended, 5.0)
	assert_eq(int(GameState.data["stats"]["runs"]), 1)


func test_meta_screens_build() -> void:
	GameState.last_run = { "sector": "coastal", "wave": 6, "kills": 20, "time": 200.0, "new_best": true,
			"banked": { "credits": 40, "steel": 2, "electronics": 0 } }
	GameState.snapshot_run({ "wave": 3, "seed": 5, "sector": "coastal" })
	for path in [SceneRouter.MAIN_MENU, SceneRouter.SECTOR_SELECT, SceneRouter.SHIPYARD, SceneRouter.RESULTS]:
		var screen: Control = add_child_autofree((load(path) as PackedScene).instantiate())
		assert_not_null(screen, path)
	var menu: Control = add_child_autofree((load(SceneRouter.MAIN_MENU) as PackedScene).instantiate())
	assert_not_null(menu.find_child("Continue", true, false), "continue button for the saved run")


func test_shipyard_buy_button_purchases() -> void:
	GameState.data["resources"]["credits"] = 100
	var shipyard: Shipyard = add_child_autofree((load(SceneRouter.SHIPYARD) as PackedScene).instantiate())
	shipyard.show_tab(Shipyard.Tab.FORTRESS)
	var card := shipyard.find_child("Card_fortress_hull", true, false)
	var button: Button = card.find_child("Buy", true, false)
	assert_false(button.disabled)
	button.pressed.emit()
	assert_eq(GameState.upgrade_level("fortress.hull"), 1)
	shipyard.show_tab(Shipyard.Tab.FORTRESS)
	var slots_button: Button = shipyard.find_child("Card_fortress_slots", true, false).find_child("Buy", true, false)
	assert_true(slots_button.disabled, "cannot afford turret slots")


func test_upgrade_effect_text_shows_now_and_next() -> void:
	assert_eq(UpgradeEffects.describe("fortress.hull", 0), "100 HP")
	assert_eq(UpgradeEffects.describe("fortress.hull", 1), "108 HP")
	assert_eq(UpgradeEffects.describe("weapon.machine_gun.rate", 10), "11.20/s")
	assert_eq(UpgradeEffects.describe("fortress.armor", 5), "−5 %")
	assert_eq(UpgradeEffects.describe("weapon.machine_gun.rate", 38), "20.00/s", "capped at ×2.5")
