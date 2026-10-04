extends GutTest
## M2 "done when" (GAME_DESIGN.md section 16): waves 1–15 play out from data only. Every enemy is
## destroyed as it spawns, so the wave lifecycle runs on its own timeline:
## PREPARE → ACTIVE → CLEANUP → BREAK → next wave.

const TICK := 1.0 / 60.0

var battle: Battle
var spawned_by_wave: Dictionary = {}


func before_each() -> void:
	battle = (load(Battle.SCENE_PATH) as PackedScene).instantiate()
	battle.run_seed = 42
	add_child_autofree(battle)
	battle.set_physics_process(false)
	spawned_by_wave.clear()


func after_each() -> void:
	if EventBus.enemy_spawned.is_connected(_destroy_on_spawn):
		EventBus.enemy_spawned.disconnect(_destroy_on_spawn)


func _destroy_on_spawn(enemy: Node2D) -> void:
	var wave := battle.wave_director.wave
	if not spawned_by_wave.has(wave):
		spawned_by_wave[wave] = []
	spawned_by_wave[wave].append((enemy as Enemy).enemy_id)
	battle.enemy_system.apply_damage(enemy, 1.0e9)


func test_waves_1_to_15_play_out_from_data() -> void:
	watch_signals(EventBus)
	EventBus.enemy_spawned.connect(_destroy_on_spawn)
	var ticks := 0
	while battle.wave_director.wave <= 15 and ticks < 60 * 60 * 15:
		battle.step(TICK)
		ticks += 1
	assert_eq(battle.wave_director.wave, 16, "reached the PREPARE of wave 16")
	assert_signal_emit_count(EventBus, "wave_started", 15)
	assert_signal_emit_count(EventBus, "wave_cleared", 15)
	assert_eq(battle.run_state.base_hp, battle.run_state.max_hp)

	var seen := {}
	for wave: int in spawned_by_wave:
		for id: String in spawned_by_wave[wave]:
			seen[id] = true
			var first_wave := int(DataRegistry.enemy(id)["first_wave"])
			assert_true(first_wave <= wave, "%s spawned in wave %d before its first wave %d" % [id, wave, first_wave])
	for id in ["raider_skiff", "patrol_boat", "attack_drone", "torpedo_boat", "armored_gunboat"]:
		assert_true(seen.has(id), "%s appeared in waves 1–15" % id)
	assert_eq(spawned_by_wave.size(), 15, "every wave spawned enemies")


func test_wave_spawns_match_the_generated_plan() -> void:
	EventBus.enemy_spawned.connect(_destroy_on_spawn)
	var planned := 0
	for group in battle.wave_director.groups():
		planned += group.count
	while battle.wave_director.wave == 1 and battle.wave_director.phase != WaveDirector.Phase.BREAK:
		battle.step(TICK)
	assert_eq(spawned_by_wave.get(1, []).size(), planned)


func test_cleanup_waits_for_the_last_enemy() -> void:
	while battle.wave_director.phase != WaveDirector.Phase.CLEANUP:
		battle.step(TICK)
	assert_gt(battle.enemy_system.alive_count(), 0)
	for i in 10:
		battle.step(TICK)
	assert_eq(battle.wave_director.phase, WaveDirector.Phase.CLEANUP, "still enemies on the water")
	for enemy in battle.enemy_system.active:
		battle.enemy_system.apply_damage(enemy, 1.0e9)
	battle.step(TICK)
	battle.step(TICK)
	assert_eq(battle.wave_director.phase, WaveDirector.Phase.BREAK)


func test_groups_spawn_outside_the_visible_area() -> void:
	var positions: Array[Vector2] = []
	var record := func(enemy: Node2D) -> void: positions.append(enemy.position)
	EventBus.enemy_spawned.connect(record)
	while battle.wave_director.phase != WaveDirector.Phase.CLEANUP:
		battle.step(TICK)
	EventBus.enemy_spawned.disconnect(record)
	assert_gt(positions.size(), 0)
	for at in positions:
		assert_false(battle.play_area.has_point(at), "%s is off screen" % at)
