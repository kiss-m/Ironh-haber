extends GutTest
## M3 "done when" (GAME_DESIGN.md section 16): resources only increase when the boat unloads.
## Also floating, sinking, merging and marking loot, the boat's state machine and the Salvage Hunter.

const TICK := 1.0 / 60.0
const CREDITS := LootRoller.ResourceType.CREDITS
const STEEL := LootRoller.ResourceType.STEEL

var battle: Battle


func before_each() -> void:
	battle = (load(Battle.SCENE_PATH) as PackedScene).instantiate()
	battle.run_seed = 42
	add_child_autofree(battle)
	battle.set_physics_process(false)
	battle.wave_director.enabled = false


func _ticks(count: int) -> void:
	for i in count:
		battle.step(TICK)


func _boat() -> SalvageBoat:
	return battle.salvage_system.boat


func _credits() -> int:
	return int(GameState.resources["credits"])


func _step_until(condition: Callable, max_ticks: int) -> bool:
	for i in max_ticks:
		if condition.call():
			return true
		battle.step(TICK)
	return condition.call()


func test_killed_enemy_drops_loot_but_banks_nothing() -> void:
	var before := _credits()
	var skiff := battle.enemy_system.spawn("raider_skiff", Vector2(400, 0))
	battle.enemy_system.apply_damage(skiff, 1000.0)
	assert_gt(battle.loot_system.active.size(), 0, "loot floats where the skiff sank")
	var crate := battle.loot_system.active[0]
	assert_lt(crate.position.distance_to(Vector2(400, 0)), 45.0)
	assert_eq(crate.resource_type, CREDITS)
	assert_eq(crate.amount, 2)
	_ticks(60)
	assert_eq(_credits(), before, "floating loot is worth nothing yet")


func test_unmarked_loot_drifts_and_sinks_without_banking() -> void:
	var before := _credits()
	var crate := battle.loot_system.spawn(CREDITS, 5, Vector2(300, -300), 10.0)
	var start := crate.position
	_ticks(60)
	var drift := crate.position.distance_to(start)
	assert_between(drift, 7.9, 15.1, "drifts 8–15 px/s with the current")
	_ticks(60 * 9 + 2)
	assert_eq(battle.loot_system.active.size(), 0, "sank after 10 s")
	assert_eq(_credits(), before)
	assert_eq(_boat().state, SalvageBoat.State.DOCKED, "unmarked loot never sends the boat")


func test_same_type_crates_merge_but_different_types_do_not() -> void:
	battle.loot_system.spawn(CREDITS, 3, Vector2(300, 0), 10.0)
	battle.loot_system.spawn(CREDITS, 4, Vector2(320, 0), 10.0)
	battle.loot_system.spawn(STEEL, 1, Vector2(310, 0), 10.0)
	_ticks(1)
	assert_eq(battle.loot_system.active.size(), 2)
	var amounts := {}
	for crate in battle.loot_system.active:
		amounts[crate.resource_type] = crate.amount
	assert_eq(amounts, {CREDITS: 7, STEEL: 1})


func test_tap_marks_nearby_loot_instead_of_aiming() -> void:
	var near := battle.loot_system.spawn(CREDITS, 3, Vector2(300, -300), 10.0)
	var also_near := battle.loot_system.spawn(STEEL, 1, Vector2(360, -300), 10.0)
	var far := battle.loot_system.spawn(CREDITS, 3, Vector2(-300, 300), 10.0)
	assert_true(battle.input_controller.press(0, Vector2(310, -300)))
	assert_true(near.marked)
	assert_true(also_near.marked, "every crate within the mark radius")
	assert_false(far.marked)
	assert_false(battle.turrets[0].aiming, "a loot tap never aims")


func test_boat_collects_marked_loot_and_banks_it_on_unload() -> void:
	watch_signals(EventBus)
	var before := _credits()
	var banked_before := int(battle.run_state.banked["credits"])
	var crate := battle.loot_system.spawn(CREDITS, 9, Vector2(250, 300), 10.0)
	battle.loot_system.mark_near(crate.position, 10.0)
	battle.step(TICK)
	assert_eq(_boat().state, SalvageBoat.State.OUTBOUND)
	assert_true(_step_until(func() -> bool: return _boat().state == SalvageBoat.State.RETURNING, 600))
	assert_eq(_boat().cargo.size(), 1)
	assert_eq(_credits(), before, "cargo is not banked yet")
	assert_true(_step_until(func() -> bool: return _boat().state == SalvageBoat.State.UNLOADING, 600))
	assert_eq(_credits(), before, "unloading takes 0.8 s")
	assert_true(_step_until(func() -> bool: return _boat().state == SalvageBoat.State.DOCKED, 120))
	assert_eq(_credits(), before + 9, "banked when the boat unloads")
	assert_eq(int(battle.run_state.banked["credits"]), banked_before + 9)
	assert_signal_emitted_with_parameters(EventBus, "resources_banked", [{"credits": 9}])


func test_boat_visits_marked_crates_and_returns_when_the_hold_is_full() -> void:
	for i in 10:
		var crate := battle.loot_system.spawn(i % 2, 1, Vector2(-450 + i * 100, 450), 20.0)
		crate.set_marked(true)
	assert_true(_step_until(func() -> bool: return _boat().state == SalvageBoat.State.RETURNING, 60 * 20))
	assert_eq(_boat().cargo.size(), 8, "cargo holds 8 items")
	assert_eq(battle.loot_system.active.size(), 2, "two crates left on the water")


func test_tapping_the_dock_recalls_the_boat() -> void:
	var crate := battle.loot_system.spawn(CREDITS, 2, Vector2(0, 900), 20.0)
	crate.set_marked(true)
	_ticks(30)
	assert_true(_boat().is_out())
	assert_true(battle.input_controller.press(0, battle.salvage_system.dock_position))
	assert_eq(_boat().state, SalvageBoat.State.RETURNING)
	assert_true(_step_until(func() -> bool: return _boat().state == SalvageBoat.State.DOCKED, 600))
	assert_true(crate.alive, "the recalled boat left the crate")


func test_boat_steers_around_the_fortress() -> void:
	var crate := battle.loot_system.spawn(CREDITS, 2, Vector2(0, -500), 30.0)
	crate.set_marked(true)
	var closest := INF
	for i in 60 * 10:
		battle.step(TICK)
		closest = minf(closest, _boat().position.length())
		if _boat().state == SalvageBoat.State.RETURNING:
			break
	assert_eq(_boat().state, SalvageBoat.State.RETURNING, "reached the crate behind the fortress")
	assert_gt(closest, battle.fortress.radius, "never sailed through the wall")


func test_destroyed_boat_spills_cargo_and_respawns() -> void:
	var crate := battle.loot_system.spawn(STEEL, 4, Vector2(300, 400), 20.0)
	crate.set_marked(true)
	_step_until(func() -> bool: return _boat().cargo.size() == 1, 600)
	_ticks(5)
	battle.salvage_system.damage_boat(1000.0)
	assert_eq(_boat().state, SalvageBoat.State.DESTROYED)
	assert_eq(battle.loot_system.active.size(), 1, "cargo spilled back into the water")
	var spilled := battle.loot_system.active[0]
	assert_eq(spilled.amount, 4)
	assert_almost_eq(spilled.time_left(), 4.0, 0.01, "spilled loot floats only 4 s")
	_ticks(60 * 12 + 2)
	assert_eq(_boat().state, SalvageBoat.State.DOCKED, "a new boat after 12 s")
	assert_eq(_boat().hp, _boat().max_hp)


func test_salvage_hunter_goes_for_the_boat_on_the_water() -> void:
	var crate := battle.loot_system.spawn(CREDITS, 2, Vector2(0, 800), 30.0)
	crate.set_marked(true)
	_ticks(60)
	var hunter := battle.enemy_system.spawn("salvage_hunter", Vector2(500, 700))
	var boat_hp := _boat().hp
	_step_until(func() -> bool: return not hunter.alive, 60 * 10)
	assert_false(hunter.alive)
	assert_eq(_boat().hp, boat_hp - 25.0, "rammed the boat for its boat damage")
	assert_eq(battle.run_state.base_hp, battle.run_state.max_hp, "and not the base")


func test_salvage_hunter_rams_the_base_while_the_boat_is_docked() -> void:
	var hunter := battle.enemy_system.spawn("salvage_hunter", Vector2(600, 0))
	_step_until(func() -> bool: return not hunter.alive, 60 * 10)
	assert_lt(battle.run_state.base_hp, battle.run_state.max_hp)
	assert_eq(_boat().hp, _boat().max_hp)
