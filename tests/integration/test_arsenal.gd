extends GutTest
## The full arsenal (GAME_DESIGN.md section 4), Auto-Targeting, aim assist and Dual Command
## (section 3), Radar and the Shield Generator (section 8) and weapon unlocks in the Shipyard.

const TICK := 1.0 / 60.0
const SURFACE := CombatTypes.DOMAIN_SURFACE
const AIR := CombatTypes.DOMAIN_AIR
const SUBMERGED := CombatTypes.DOMAIN_SUBMERGED
const ALL_WEAPONS: PackedStringArray = ["machine_gun", "naval_cannon", "missile_launcher", "torpedo_tube",
		"depth_charge_mortar", "laser", "railgun"]

var battle: Battle


func before_each() -> void:
	GameState.reset()


## Starts a battle with `loadout` mounted and the given upgrade levels owned.
func _start(loadout: Array, levels := {}, aim_assist := false) -> void:
	GameState.data["unlocked_weapons"] = Array(ALL_WEAPONS)
	GameState.data["settings"]["aim_assist"] = aim_assist
	for key: String in levels:
		GameState.set_upgrade_level(key, int(levels[key]))
	GameState.data["loadout"] = loadout
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


## Points turret `slot` at `point` and holds the finger there for `ticks` ticks.
func _aim(slot: int, point: Vector2, ticks: int) -> void:
	var turret := battle.turrets[slot]
	battle.input_controller.select(slot)
	turret.rotation = (point - turret.aim_origin).angle()
	battle.input_controller.press(0, point)
	_ticks(ticks)


## A point straight up from the first turret: its shots fly along x = turret x when the finger
## aims straight up from the fortress center.
func _line(y: float) -> Vector2:
	return Vector2(battle.turrets[0].global_position.x, y)


## A dummy target that barely moves.
func _dummy(enemy_id: String, at: Vector2) -> Enemy:
	var enemy := battle.enemy_system.spawn(enemy_id, at)
	enemy.speed = 1.0
	return enemy


func test_seven_weapons_match_the_design_table() -> void:
	# [domains, damage type, damage, fire rate, range, turn, unlock wave] from section 4
	var expected := {
		"machine_gun": [["surface", "air"], "kinetic", 6, 8, 550, 360, 0],
		"naval_cannon": [["surface"], "explosive", 45, 0.8, 800, 90, 0],
		"missile_launcher": [["surface", "air"], "explosive", 30, 0.6, 900, 180, 8],
		"torpedo_tube": [["surface", "submerged"], "explosive", 80, 0.35, 1000, 60, 15],
		"depth_charge_mortar": [["submerged", "surface"], "explosive", 60, 0.5, 450, 120, 20],
		"laser": [["surface", "air"], "energy", 40, 0, 700, 200, 30],
		"railgun": [["surface", "air"], "energy", 220, 0.25, 1400, 45, 45],
	}
	assert_eq(DataRegistry.weapons.size(), 7)
	for id: String in expected:
		var def := DataRegistry.weapon(id)
		var row: Array = expected[id]
		var base: Dictionary = def["base"]
		assert_eq([def["domains"], def["damage_type"], float(base["damage"]), float(base.get("fire_rate", 0)),
				float(base["range"]), float(base["turn_speed"]), int(def["unlock"]["best_wave"])],
				[row[0], row[1], float(row[2]), float(row[3]), float(row[4]), float(row[5]), int(row[6])], id)
	assert_eq(DataRegistry.weapon("missile_launcher")["base"]["salvo"], 2.0, "salvo of 2")
	assert_eq(DataRegistry.weapon("torpedo_tube")["base"]["pierce"], 2.0, "pierces 2")
	assert_eq(DataRegistry.weapon("depth_charge_mortar")["base"]["splash_radius"], 90.0)
	assert_eq(DataRegistry.weapon("laser")["base"]["heat_capacity"], 5.0)
	assert_eq(DataRegistry.weapon("laser")["base"]["cooldown"], 3.0)
	assert_eq(DataRegistry.weapon("railgun")["base"]["charge_time"], 1.0)


func test_missiles_fire_in_salvos_and_home_in() -> void:
	_start(["missile_launcher", "machine_gun"])
	var drone := _dummy("attack_drone", Vector2(0, -600))
	_aim(0, Vector2(150, -600), 1)
	assert_eq(battle.projectile_system.count, 2, "a salvo of two missiles")
	assert_eq(battle.projectile_system.kinds[0], ProjectileSystem.Kind.MISSILE)
	assert_true(_until(func() -> bool: return not drone.alive, 120), "missiles steer onto the drone off the aim line")


func test_missiles_retarget_when_their_target_dies() -> void:
	_start(["missile_launcher", "machine_gun"])
	var first := _dummy("patrol_boat", Vector2(0, -700))
	var second := _dummy("patrol_boat", Vector2(150, -700))
	_aim(0, Vector2(0, -700), 1)
	battle.input_controller.cancel()
	battle.enemy_system.apply_damage(first, 1000.0)
	_ticks(120)
	assert_lt(second.hp, 60.0, "the salvo picks the next enemy")


func test_torpedoes_pierce_two_and_hit_submerged() -> void:
	_start(["torpedo_tube", "machine_gun"])
	var sub := _dummy("submarine", _line(-350))
	sub.phase_timer = 99.0
	var boats: Array[Enemy] = [_dummy("armored_gunboat", _line(-500)), _dummy("armored_gunboat", _line(-650))]
	_ticks(1)
	assert_false(sub.surfaced)
	_aim(0, Vector2(0, -900), 1)
	battle.input_controller.cancel()
	_ticks(120)
	assert_lt(sub.hp, sub.max_hp, "hits the submerged sub")
	assert_lt(boats[0].hp, 200.0, "pierces to the second target")
	assert_lt(boats[1].hp, 200.0, "and the third")


func test_depth_charges_explode_at_the_aim_point() -> void:
	_start(["depth_charge_mortar", "machine_gun"])
	var sub := _dummy("submarine", Vector2(0, -400))
	sub.phase_timer = 99.0
	var between := _dummy("raider_skiff", Vector2(0, -250))
	_aim(0, Vector2(0, -400), 1)
	battle.input_controller.cancel()
	assert_eq(battle.projectile_system.kinds[0], ProjectileSystem.Kind.LOB)
	_ticks(90)
	assert_lt(sub.hp, sub.max_hp, "the splash reaches the submarine")
	assert_eq(between.hp, 20.0, "lobbed over the skiff on the way")


func test_laser_burns_continuously_then_overheats() -> void:
	_start(["laser", "machine_gun"])
	var gunboat := _dummy("armored_gunboat", _line(-500))
	gunboat.max_hp = 100000.0
	gunboat.hp = 100000.0
	var laser := battle.turrets[0]
	_aim(0, Vector2(0, -500), 60)
	assert_eq(battle.projectile_system.count, 0, "the beam is not a projectile")
	assert_almost_eq(100000.0 - gunboat.hp, 40.0, 6.0, "about 40 damage per second (crits aside)")
	assert_gt(laser.heat_fraction(), 0.1)
	_ticks(60 * 4 + 10)
	assert_true(laser.overheated, "overheats after 5 s of firing")
	var hp := gunboat.hp
	_ticks(60 * 2)
	assert_eq(gunboat.hp, hp, "no damage while overheated")
	_ticks(60 * 1 + 10)
	assert_false(laser.overheated, "back after a 3 s cooldown")


func test_railgun_charges_then_hits_everything_in_line() -> void:
	_start(["railgun", "machine_gun"])
	var targets: Array[Enemy] = []
	for y in [-300, -500, -700, -900]:
		targets.append(_dummy("raider_skiff", _line(y)))
	var drone := _dummy("attack_drone", _line(-1100))
	_aim(0, Vector2(0, -600), 50)
	for enemy in targets:
		assert_true(enemy.alive, "nothing before the 1 s charge")
	_ticks(15)
	for enemy in targets:
		assert_false(enemy.alive, "one shot through the whole line")
	assert_false(drone.alive, "air too")


func test_auto_targeting_drives_the_unselected_turret_at_a_share_of_its_rate() -> void:
	_start(["machine_gun", "machine_gun"], {"fortress.auto_targeting": 1})
	assert_almost_eq(battle.targeting_system.auto_share, 0.2, 0.0001, "20 % at level 1")
	var skiff := _dummy("raider_skiff", Vector2(0, -400))
	skiff.max_hp = 100000.0
	skiff.hp = 100000.0
	battle.input_controller.select(0)
	var auto := battle.turrets[1]
	_ticks(60 * 3)
	assert_true(auto.auto_active, "the unselected turret takes over")
	var dealt := 100000.0 - skiff.hp
	# 8 shots/s × 20 % = 1.6 shots/s of 6 damage for the 2.5–3 s it is on target (crits double one)
	assert_between(dealt, 6.0 * 3.0, 6.0 * 8.0, "about 1.6 shots per second, not 8")
	assert_false(battle.turrets[0].aiming, "the selected turret waits for a finger")


func test_no_auto_targeting_without_the_upgrade() -> void:
	_start(["machine_gun", "naval_cannon"])
	_dummy("raider_skiff", Vector2(0, -400))
	_ticks(60)
	assert_false(battle.turrets[1].aiming)
	assert_eq(battle.projectile_system.count, 0)


func test_auto_targeting_share_rises_to_70_percent() -> void:
	var config: Dictionary = DataRegistry.balance["auto_targeting"]
	assert_eq(AutoTargeting.share(0, config), 0.0)
	assert_almost_eq(AutoTargeting.share(1, config), 0.2, 0.0001)
	assert_almost_eq(AutoTargeting.share(10, config), 0.7, 0.0001)
	assert_almost_eq(AutoTargeting.share(99, config), 0.7, 0.0001, "never above manual")


func test_aim_assist_snaps_to_an_enemy_near_the_finger() -> void:
	_start(["naval_cannon", "machine_gun"], {}, true)
	var boat := _dummy("patrol_boat", Vector2(0, -500))
	var off_line := Vector2(0, -500).rotated(deg_to_rad(4.0))
	_aim(0, off_line, 2)
	assert_not_null(battle.turrets[0].assist_point)
	assert_almost_eq(battle.turrets[0].target_angle(),
			(boat.position - battle.turrets[0].global_position).angle(), 0.001, "aimed from the turret")
	battle.input_controller.cancel()
	_aim(0, Vector2(0, -500).rotated(deg_to_rad(20.0)), 2)
	assert_null(battle.turrets[0].assist_point, "too far off the line")


func test_dual_command_aims_two_turrets_with_two_fingers() -> void:
	_start(["machine_gun", "naval_cannon"], {"fortress.dual_command": 1})
	assert_true(battle.input_controller.dual_command)
	battle.input_controller.select(1)
	battle.input_controller.select(0)
	battle.input_controller.press(0, Vector2(300, -300))
	battle.input_controller.press(1, Vector2(-300, -300))
	assert_true(battle.turrets[0].controlled)
	assert_true(battle.turrets[1].controlled, "the second finger aims the previous turret")
	assert_eq(battle.turrets[1].aim_point, Vector2(-300, -300))
	battle.input_controller.release(1)
	assert_false(battle.turrets[1].controlled)
	assert_true(battle.turrets[0].controlled)


func test_without_dual_command_a_second_finger_does_nothing() -> void:
	_start(["machine_gun", "naval_cannon"])
	battle.input_controller.select(1)
	battle.input_controller.select(0)
	battle.input_controller.press(0, Vector2(300, -300))
	assert_false(battle.input_controller.press(1, Vector2(-300, -300)))
	assert_false(battle.turrets[1].controlled)


func test_shield_generator_absorbs_base_damage_and_regenerates() -> void:
	_start(["machine_gun", "naval_cannon"], {"fortress.shield": 2})
	var max_hp := battle.run_state.max_hp
	assert_almost_eq(battle.run_state.max_shield, max_hp * 0.1, 0.001, "5 % of max HP per level")
	battle.run_state.damage_base(battle.run_state.max_shield + 5.0)
	assert_eq(battle.run_state.shield, 0.0)
	assert_almost_eq(battle.run_state.base_hp, max_hp - 5.0, 0.001, "the hull takes the rest")
	_ticks(60 * 4)
	assert_gt(battle.run_state.shield, 0.0, "regenerates after 3 s without damage")


func test_radar_lists_the_edges_of_coming_enemies() -> void:
	_start(["machine_gun", "naval_cannon"], {"fortress.radar": 1})
	assert_eq(battle.radar_level, 1)
	battle.wave_director.enabled = true
	battle.wave_director.start(3)
	var groups := battle.wave_director.upcoming(60.0)
	assert_gt(groups.size(), 0, "the whole coming wave within a minute")


func test_weapons_unlock_with_best_wave_and_resources() -> void:
	assert_false("missile_launcher" in GameState.unlocked_weapons())
	assert_eq(GameState.weapon_unlock_block("missile_launcher"), Upgrades.Block.LOCKED)
	GameState.data["sectors"][GameState.DEFAULT_SECTOR]["best_wave"] = 8
	assert_eq(GameState.weapon_unlock_block("missile_launcher"), Upgrades.Block.TOO_EXPENSIVE)
	GameState.data["resources"]["credits"] = 350
	GameState.data["resources"]["steel"] = 20
	assert_true(GameState.unlock_weapon("missile_launcher"))
	assert_true("missile_launcher" in GameState.unlocked_weapons())
	assert_eq(GameState.resource("credits"), 50)
	assert_eq(GameState.resource("steel"), 0)
	assert_eq(GameState.weapon_unlock_block("missile_launcher"), Upgrades.Block.MAX_LEVEL)
	assert_true(GameState.set_loadout_slot(1, "missile_launcher"), "now mountable")


func test_shipyard_lists_locked_weapons_with_an_unlock_button() -> void:
	GameState.data["sectors"][GameState.DEFAULT_SECTOR]["best_wave"] = 8
	GameState.data["resources"]["credits"] = 300
	GameState.data["resources"]["steel"] = 20
	var shipyard: Shipyard = (load(SceneRouter.SHIPYARD) as PackedScene).instantiate()
	add_child_autofree(shipyard)
	var card := shipyard.find_child("Unlock_missile_launcher", true, false)
	assert_not_null(card)
	assert_not_null(shipyard.find_child("Unlock_railgun", true, false))
	var button: Button = card.find_child("Unlock", true, false)
	assert_false(button.disabled)
	button.pressed.emit()
	assert_true("missile_launcher" in GameState.unlocked_weapons())
	assert_not_null(shipyard.find_child("Card_weapon_missile_launcher_dmg", true, false), "its tracks appear")
	var railgun: Button = shipyard.find_child("Unlock_railgun", true, false).find_child("Unlock", true, false)
	assert_true(railgun.disabled, "wave 45 needed")


func _until(condition: Callable, max_ticks: int) -> bool:
	for i in max_ticks:
		if condition.call():
			return true
		battle.step(TICK)
	return condition.call()
