extends GutTest
## M1 "done when" (GAME_DESIGN.md section 16): Raider Skiffs can be shot and can destroy the base.
## The battle is stepped manually at the physics rate, and the trickle spawner is off so each
## test places its own enemies.

const TICK := 1.0 / 60.0

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


func test_turret_turns_at_turn_speed_and_fires_only_on_target() -> void:
	battle.turret.rotation = -PI / 2.0
	assert_true(battle.input_controller.press(0, Vector2(400, 0)), "aim at angle 0, a 90° turn")
	_ticks(6)
	assert_almost_eq(battle.turret.rotation, -0.3 * PI, 0.001, "360°/s for 0.1 s turns 36°")
	assert_eq(battle.projectile_system.count, 0, "no shots while more than 4° off target")
	_ticks(12)
	assert_almost_eq(battle.turret.rotation, 0.0, 0.001)
	assert_gt(battle.projectile_system.count, 0, "fires once on target")


func test_touch_on_turret_selects_without_aiming() -> void:
	assert_false(battle.input_controller.press(0, Vector2(10, 10)))
	assert_false(battle.turret.aiming)
	assert_true(battle.input_controller.press(0, Vector2(300, 300)))
	assert_true(battle.turret.aiming)
	battle.input_controller.release(0)
	assert_false(battle.turret.aiming)


func test_second_finger_does_not_take_over_the_aim() -> void:
	battle.input_controller.press(0, Vector2(300, 0))
	assert_false(battle.input_controller.press(1, Vector2(-300, 0)))
	battle.input_controller.drag_to(1, Vector2(-300, 0))
	assert_eq(battle.turret.aim_point, Vector2(300, 0))


func test_bullets_expire_at_weapon_range() -> void:
	battle.turret.rotation = 0.0
	battle.input_controller.press(0, Vector2(400, 0))
	var farthest := 0.0
	for i in 60:
		battle.step(TICK)
		for k in battle.projectile_system.count:
			farthest = maxf(farthest, battle.projectile_system.positions[k].length())
	var per_tick := battle.turret.projectile_speed * TICK
	assert_gt(farthest, battle.turret.range_px - per_tick)
	assert_lt(farthest, battle.turret.range_px + per_tick)


func test_projectiles_only_hit_their_domains() -> void:
	var skiff := battle.enemy_system.spawn("raider_skiff", Vector2(300, 0))
	battle.projectile_system.fire_bullet(Vector2(200, 0), Vector2.RIGHT, 1400.0, 0.3, 100.0,
			CombatTypes.DamageType.KINETIC, CombatTypes.DOMAIN_SUBMERGED)
	_ticks(20)
	assert_true(skiff.alive, "a submerged-only shot passes a surface boat")
	assert_eq(skiff.hp, skiff.max_hp)


func test_machine_gun_sinks_a_raider_skiff() -> void:
	watch_signals(EventBus)
	var skiff := battle.enemy_system.spawn("raider_skiff", Vector2(450, 0))
	battle.input_controller.press(0, skiff.position)
	for i in 180:
		if battle.run_state.kills > 0:
			break
		battle.input_controller.drag_to(0, skiff.position)
		battle.step(TICK)
	assert_eq(battle.run_state.kills, 1)
	assert_signal_emitted(EventBus, "enemy_killed")
	assert_eq(battle.run_state.base_hp, battle.run_state.max_hp, "it never reached the base")


func test_raider_skiffs_destroy_the_base_and_end_the_run() -> void:
	watch_signals(EventBus)
	var contact_damage := float(DataRegistry.enemy("raider_skiff")["attack"]["damage"])
	var needed := ceili(battle.run_state.max_hp / contact_damage)
	for i in needed:
		battle.enemy_system.spawn("raider_skiff", Vector2.from_angle(TAU * i / needed) * 420.0)
	_ticks(600)
	assert_eq(battle.run_state.base_hp, 0.0)
	assert_signal_emit_count(EventBus, "base_damaged", needed)
	assert_eq(battle.run_state.kills, 0, "rams are not kills")
	assert_eq(battle.phase, Battle.Phase.ENDING)
	assert_false(battle.turret.enabled)

	await wait_for_signal(EventBus.run_ended, 5.0)
	assert_eq(battle.phase, Battle.Phase.ENDED)
	assert_eq(Engine.time_scale, 1.0, "slow motion is over")
	assert_true(battle.hud.get_node("Root/GameOver").visible, "game over overlay is shown")
