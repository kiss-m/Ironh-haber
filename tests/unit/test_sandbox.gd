extends GutTest
## Sandbox (test build) gifts and starting a run at a later wave.


func test_apply_tops_up_and_unlocks_without_lowering_anything() -> void:
	var config: Dictionary = DataRegistry.balance["sandbox"]
	var data := SaveMigrator.defaults()
	data["resources"]["cores"] = 999
	Sandbox.apply(data, config, DataRegistry.weapons.keys(), "coastal")
	assert_eq(data["resources"]["credits"], int(config["resources"]["credits"]))
	assert_eq(data["resources"]["cores"], 999, "never lowered")
	assert_eq(data["unlocked_weapons"].size(), 7)
	assert_eq(int(data["sectors"]["coastal"]["best_wave"]), 50)
	assert_eq(int(data["stats"]["bosses"]), 1)
	Sandbox.apply(data, config, DataRegistry.weapons.keys(), "coastal")
	assert_eq(data["unlocked_weapons"].size(), 7, "applying twice adds nothing twice")


func test_not_enabled_outside_the_test_build() -> void:
	assert_false(Sandbox.enabled())


func test_a_run_can_start_at_a_later_wave() -> void:
	GameState.reset()
	GameState.pending_run = {"sector": "coastal", "start_wave": 15}
	var battle: Battle = (load(Battle.SCENE_PATH) as PackedScene).instantiate()
	battle.leave_on_end = false
	add_child_autofree(battle)
	battle.set_physics_process(false)
	assert_eq(battle.wave_director.wave, 15)
