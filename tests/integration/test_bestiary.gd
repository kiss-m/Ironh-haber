extends GutTest
## The rest of the bestiary (GAME_DESIGN.md section 5): submarines, bombers, minelayers, shield
## frigates, landing craft, missile corvettes, shields and elites.

const TICK := 1.0 / 60.0
const SURFACE := CombatTypes.DOMAIN_SURFACE
const AIR := CombatTypes.DOMAIN_AIR
const SUBMERGED := CombatTypes.DOMAIN_SUBMERGED

var battle: Battle


func before_each() -> void:
	GameState.reset()
	battle = (load(Battle.SCENE_PATH) as PackedScene).instantiate()
	battle.run_seed = 42
	battle.leave_on_end = false
	add_child_autofree(battle)
	battle.set_physics_process(false)
	battle.wave_director.enabled = false
	battle.run_state.regen = 0.0


func _ticks(count: int) -> void:
	for i in count:
		battle.step(TICK)


func _until(condition: Callable, max_ticks: int) -> bool:
	for i in max_ticks:
		if condition.call():
			return true
		battle.step(TICK)
	return condition.call()


## Fires one bullet at `enemy` with the given domain mask; returns the damage it took.
func _shoot(enemy: Enemy, mask: int, damage := 10.0) -> float:
	var before := enemy.hp + enemy.shield
	battle.grid.rebuild(battle.enemy_system.active)
	var from := enemy.position + Vector2(0, -80)
	battle.projectile_system.fire(ProjectileSystem.Kind.BULLET, from, Vector2.DOWN, 1400.0, 0.2, damage,
			CombatTypes.DamageType.ENERGY, mask)
	for i in 10:
		battle.projectile_system.tick(TICK)
	return before - (enemy.hp + enemy.shield)


func _all_twelve() -> PackedStringArray:
	var ids := PackedStringArray()
	for id: String in DataRegistry.enemies:
		if DataRegistry.enemies[id].has("first_wave"):
			ids.append(id)
	return ids


func test_twelve_wave_enemies_match_the_design_table() -> void:
	# [domain, armor, hp, shield, speed, budget cost, first wave] from section 5
	var expected := {
		"raider_skiff": ["surface", "light", 20, 0, 120, 1, 1],
		"patrol_boat": ["surface", "light", 60, 0, 70, 3, 3],
		"attack_drone": ["air", "light", 12, 0, 200, 0.4, 5],
		"torpedo_boat": ["surface", "light", 80, 0, 90, 5, 8],
		"salvage_hunter": ["surface", "light", 90, 0, 170, 6, 10],
		"armored_gunboat": ["surface", "armored", 200, 0, 50, 8, 12],
		"submarine": ["submerged", "armored", 150, 0, 60, 9, 15],
		"bomber": ["air", "light", 120, 0, 110, 8, 18],
		"minelayer": ["surface", "armored", 180, 0, 60, 10, 22],
		"shield_frigate": ["surface", "shield", 250, 200, 45, 15, 28],
		"landing_craft": ["surface", "armored", 300, 0, 55, 12, 32],
		"missile_corvette": ["surface", "shield", 220, 120, 80, 14, 38],
	}
	assert_eq(_all_twelve().size(), 12)
	for id: String in expected:
		var def := DataRegistry.enemy(id)
		var row: Array = expected[id]
		assert_eq([def["domain"], def["armor"], float(def["hp"]), float(def["shield"]), float(def["speed"]),
				float(def["budget_cost"]), int(def["first_wave"])],
				[row[0], row[1], float(row[2]), float(row[3]), float(row[4]), float(row[5]), int(row[6])], id)


func test_shields_absorb_damage_first_and_regenerate_after_a_pause() -> void:
	var frigate := battle.enemy_system.spawn("shield_frigate", Vector2(900, 0))
	battle.enemy_system.apply_damage(frigate, 150.0)
	assert_eq(frigate.shield, 50.0)
	assert_eq(frigate.hp, 250.0, "hull untouched while the shield holds")
	battle.enemy_system.apply_damage(frigate, 80.0)
	assert_eq(frigate.shield, 0.0)
	assert_eq(frigate.hp, 220.0)
	_ticks(60 * 2)
	assert_eq(frigate.shield, 0.0, "no regeneration within 3 s of a hit")
	_ticks(60 * 2)
	assert_almost_eq(frigate.shield, 200.0 * 0.1 * 1.0, 1.0, "10 % per second after 3 s")


func test_shield_frigate_pulses_shield_onto_allies() -> void:
	var frigate := battle.enemy_system.spawn("shield_frigate", Vector2(450, 0))
	var near := battle.enemy_system.spawn("patrol_boat", Vector2(450, 120))
	var far := battle.enemy_system.spawn("patrol_boat", Vector2(-450, 0))
	near.speed = 1.0
	_ticks(1)
	frigate.aura_timer = 0.001
	_ticks(1)
	assert_eq(near.shield, 50.0, "+50 shield within 200 px")
	assert_eq(far.shield, 0.0)


func test_submarine_is_hidden_below_and_hittable_when_surfaced() -> void:
	var sub := battle.enemy_system.spawn("submarine", Vector2(700, 0))
	sub.phase_timer = 10.0
	_ticks(2)
	assert_false(sub.surfaced)
	assert_eq(_shoot(sub, SURFACE | AIR), 0.0, "surface weapons cannot reach it submerged")
	assert_gt(_shoot(sub, SURFACE | SUBMERGED), 0.0, "torpedoes and depth charges can")
	watch_signals(EventBus)
	sub.phase_timer = 0.0
	_ticks(1)
	assert_true(sub.surfaced, "surfaces after its submerged time")
	assert_signal_emit_count(EventBus, "enemy_spawned", 1, "fires a torpedo as it surfaces")
	assert_gt(_shoot(sub, SURFACE | AIR), 0.0, "surfaced it counts as Surface")
	_ticks(60 * 3 + 2)
	assert_false(sub.surfaced, "dives again after 3 s")


func test_bomber_bombs_the_base_in_passing_and_leaves_without_a_kill() -> void:
	var bomber := battle.enemy_system.spawn("bomber", Vector2(-700, 0))
	assert_true(_until(func() -> bool: return not bomber.alive, 60 * 20))
	assert_almost_eq(battle.run_state.base_hp, battle.run_state.max_hp - 20.0, 0.001, "one 20 dmg bomb")
	assert_eq(battle.run_state.kills, 0)
	assert_eq(battle.loot_system.active.size(), 0, "no loot for a bomber that got away")


func test_minelayer_lays_drifting_mines_that_hit_the_base() -> void:
	battle.enemy_system.spawn("minelayer", Vector2(650, 0))
	var mine: Enemy = null
	for i in 60 * 5:
		battle.step(TICK)
		for enemy in battle.enemy_system.active:
			if enemy.enemy_id == "enemy_mine":
				mine = enemy
		if mine != null:
			break
	assert_not_null(mine, "a mine within 5 s")
	if mine == null:
		return
	assert_eq(mine.hp, 15.0)
	assert_eq(mine.contact_damage, 25.0)
	assert_eq(mine.boat_damage, 25.0, "mines hurt the salvage boat too")
	mine.position = Vector2(0, 150)
	_ticks(2)
	assert_almost_eq(battle.run_state.base_hp, battle.run_state.max_hp - 25.0, 0.001)


func test_landing_craft_knocks_out_a_turret() -> void:
	var craft := battle.enemy_system.spawn("landing_craft", Vector2(200, 0))
	_until(func() -> bool: return not craft.alive, 60 * 5)
	assert_almost_eq(battle.run_state.base_hp, battle.run_state.max_hp - 40.0, 0.001)
	var disabled := battle.turrets.filter(func(t: Turret) -> bool: return t.is_disabled())
	assert_eq(disabled.size(), 1, "one turret down")
	var turret: Turret = disabled[0]
	turret.rotation = 0.0
	battle.input_controller.select(turret.slot)
	battle.input_controller.press(0, Vector2(400, 0))
	_ticks(30)
	assert_eq(battle.projectile_system.count, 0, "a knocked-out turret does not fire")
	_ticks(60 * 8)
	assert_false(turret.is_disabled(), "back after 8 s")


func test_missile_corvette_fires_air_missiles() -> void:
	battle.enemy_system.spawn("missile_corvette", Vector2(1000, 0))
	var missile: Enemy = null
	for i in 60 * 5:
		battle.step(TICK)
		for enemy in battle.enemy_system.active:
			if enemy.enemy_id == "enemy_missile":
				missile = enemy
		if missile != null:
			break
	assert_not_null(missile)
	if missile == null:
		return
	assert_eq(missile.domain, AIR, "missiles are Air targets")
	assert_eq(missile.contact_damage, 12.0)
	assert_false(missile.counts_as_kill)


func test_elite_modifiers() -> void:
	var config: Dictionary = DataRegistry.balance["elites"]
	var armored := battle.enemy_system.spawn("raider_skiff", Vector2(900, 0))
	armored.make_elite(Enemy.Elite.ARMORED, config)
	assert_eq(armored.armor, CombatTypes.Armor.ARMORED, "one armor class up")
	var fast := battle.enemy_system.spawn("raider_skiff", Vector2(900, 100))
	fast.make_elite(Enemy.Elite.FAST, config)
	assert_almost_eq(fast.speed, 120.0 * 1.4, 0.001)
	var shielded := battle.enemy_system.spawn("patrol_boat", Vector2(900, 200))
	shielded.make_elite(Enemy.Elite.SHIELDED, config)
	assert_eq(shielded.shield, 30.0, "+50 % HP as shield")
	var splitting := battle.enemy_system.spawn("patrol_boat", Vector2(900, 300))
	splitting.make_elite(Enemy.Elite.SPLITTING, config)
	var before := battle.enemy_system.alive_count()
	battle.enemy_system.apply_damage(splitting, 1000.0)
	battle.step(TICK)
	assert_eq(battle.enemy_system.alive_count(), before - 1 + 2, "two skiffs instead of one patrol boat")


func test_elites_drop_triple_loot_and_electronics() -> void:
	var elite := battle.enemy_system.spawn("raider_skiff", Vector2(400, 0))
	elite.make_elite(Enemy.Elite.FAST, DataRegistry.balance["elites"])
	battle.enemy_system.apply_damage(elite, 1000.0)
	var amounts := {}
	for crate in battle.loot_system.active:
		amounts[crate.resource_type] = int(amounts.get(crate.resource_type, 0)) + crate.amount
	assert_eq(amounts[LootRoller.ResourceType.CREDITS], 6, "3 × 2 credits")
	assert_true(amounts.has(LootRoller.ResourceType.ELECTRONICS), "always electronics")
