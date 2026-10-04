extends GutTest
## Combat in the stepped battle: aiming and turret selection (section 3), weapons and domains
## (section 4), enemy behaviors and attacks (section 5) and the game over flow. The wave director
## is off so each test places its own enemies.

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


func _gun() -> Turret:
	return battle.turrets[0]


func _cannon() -> Turret:
	return battle.turrets[1]


func test_starting_loadout_is_machine_gun_and_cannon() -> void:
	assert_eq(battle.turrets.size(), 2)
	assert_eq(_gun().weapon_id, "machine_gun")
	assert_eq(_cannon().weapon_id, "naval_cannon")
	assert_eq(battle.input_controller.selected_slot, 0)
	assert_true(_gun().selected)


func test_turret_turns_at_turn_speed_and_fires_only_on_target() -> void:
	_gun().rotation = -PI / 2.0
	assert_true(battle.input_controller.press(0, Vector2(400, 0)), "aim at angle 0, a 90° turn")
	_ticks(6)
	assert_almost_eq(_gun().rotation, -0.3 * PI, 0.001, "360°/s for 0.1 s turns 36°")
	assert_eq(battle.projectile_system.count, 0, "no shots while more than 4° off target")
	_ticks(12)
	assert_almost_eq(_gun().rotation, 0.0, 0.001)
	assert_gt(battle.projectile_system.count, 0, "fires once on target")


func test_only_the_selected_turret_aims() -> void:
	battle.input_controller.press(0, Vector2(400, 0))
	assert_true(_gun().aiming)
	assert_false(_cannon().aiming)


func test_touching_a_turret_selects_it_without_aiming() -> void:
	assert_true(battle.input_controller.press(0, _cannon().global_position + Vector2(5, 5)))
	assert_eq(battle.input_controller.selected_slot, 1)
	assert_true(_cannon().selected)
	assert_false(_gun().selected)
	assert_false(_cannon().aiming)
	battle.input_controller.press(1, Vector2(300, 300))
	assert_true(_cannon().aiming)
	battle.input_controller.release(1)
	assert_false(_cannon().aiming)


func test_bottom_bar_button_selects_the_turret() -> void:
	battle.input_controller.press(0, Vector2(400, 0))
	battle.hud.slot_pressed.emit(1)
	assert_eq(battle.input_controller.selected_slot, 1)
	assert_false(_gun().aiming, "switching turrets ends the aim")


func test_second_finger_does_not_take_over_the_aim() -> void:
	battle.input_controller.press(0, Vector2(300, 0))
	assert_false(battle.input_controller.press(1, Vector2(-300, 0)))
	battle.input_controller.drag_to(1, Vector2(-300, 0))
	assert_eq(_gun().aim_point, Vector2(300, 0))


func test_bullets_expire_at_weapon_range_from_the_fortress_center() -> void:
	_gun().rotation = 0.0
	battle.input_controller.press(0, Vector2(400, 0))
	var farthest := 0.0
	for i in 60:
		battle.step(TICK)
		for k in battle.projectile_system.count:
			farthest = maxf(farthest, battle.projectile_system.positions[k].length())
	var per_tick := _gun().projectile_speed * TICK
	assert_gt(farthest, _gun().range_px - per_tick)
	assert_lt(farthest, _gun().range_px + per_tick)


func test_projectiles_only_hit_their_domains() -> void:
	var skiff := battle.enemy_system.spawn("raider_skiff", Vector2(300, 0))
	battle.projectile_system.fire(ProjectileSystem.Kind.BULLET, Vector2(200, 0), Vector2.RIGHT, 1400.0, 0.3,
			100.0, CombatTypes.DamageType.KINETIC, CombatTypes.DOMAIN_SUBMERGED)
	_ticks(20)
	assert_true(skiff.alive, "a submerged-only shot passes a surface boat")
	assert_eq(skiff.hp, skiff.max_hp)


func test_cannon_cannot_hit_air_but_machine_gun_can() -> void:
	var drone := battle.enemy_system.spawn("attack_drone", Vector2(400, 0))
	battle.grid.rebuild(battle.enemy_system.active)
	for turret in [_cannon(), _gun()]:
		battle.projectile_system.fire(turret.projectile_kind, Vector2(300, 0), Vector2.RIGHT, 900.0, 0.3,
				100.0, turret.damage_type, turret.domain_mask)
	for i in 20:
		battle.projectile_system.tick(TICK)
	assert_false(drone.alive, "the machine gun bullet hits Air")
	assert_eq(battle.projectile_system.count, 0, "the shell flew through the drone and expired")
	assert_eq(_cannon().domain_mask, CombatTypes.DOMAIN_SURFACE, "naval cannon only hits Surface")


func test_cannon_splash_hits_every_boat_in_radius() -> void:
	var first := battle.enemy_system.spawn("raider_skiff", Vector2(400, -20))
	var second := battle.enemy_system.spawn("raider_skiff", Vector2(400, 30))
	var far := battle.enemy_system.spawn("raider_skiff", Vector2(400, 300))
	battle.grid.rebuild(battle.enemy_system.active)
	battle.projectile_system.fire(ProjectileSystem.Kind.SHELL, Vector2(300, 0), Vector2.RIGHT, 900.0, 1.0,
			45.0, CombatTypes.DamageType.EXPLOSIVE, CombatTypes.DOMAIN_SURFACE, 60.0)
	for i in 10:
		battle.projectile_system.tick(TICK)
	assert_false(first.alive)
	assert_false(second.alive)
	assert_true(far.alive)
	assert_eq(battle.run_state.kills, 2)


func test_explosive_shells_do_extra_damage_to_armor() -> void:
	var gunboat := battle.enemy_system.spawn("armored_gunboat", Vector2(400, 0))
	battle.grid.rebuild(battle.enemy_system.active)
	battle.projectile_system.fire(ProjectileSystem.Kind.SHELL, Vector2(300, 0), Vector2.RIGHT, 900.0, 1.0,
			40.0, CombatTypes.DamageType.EXPLOSIVE, CombatTypes.DOMAIN_SURFACE, 60.0)
	for i in 10:
		battle.projectile_system.tick(TICK)
	var damage_taken := gunboat.max_hp - gunboat.hp
	assert_true(is_equal_approx(damage_taken, 50.0) or is_equal_approx(damage_taken, 100.0),
			"40 × 1.25 armor bonus (or a crit): took %s" % damage_taken)


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


func test_off_center_turret_reaches_a_patrol_boat_on_the_far_side() -> void:
	assert_lt(_gun().global_position.x, 0.0, "the machine gun sits left of center")
	var boat := battle.enemy_system.spawn("patrol_boat", Vector2(540, 0))
	boat.speed = 1.0
	battle.input_controller.press(0, boat.position)
	for i in 60 * 6:
		battle.input_controller.drag_to(0, boat.position)
		battle.step(TICK)
	assert_false(boat.alive, "550 px range from the center covers a boat 540 px away on the right")


func test_patrol_boat_stops_at_range_and_shoots_the_base() -> void:
	var boat := battle.enemy_system.spawn("patrol_boat", Vector2(900, 0))
	_ticks(60 * 12)
	assert_true(boat.alive)
	assert_eq(boat.state, Enemy.State.ENGAGE)
	assert_almost_eq(boat.position.length(), 500.0, 25.0, "orbits at its engage distance")
	assert_lt(battle.run_state.base_hp, battle.run_state.max_hp, "its gun hits the base")


func test_torpedo_boat_launches_torpedoes_that_can_be_shot_down() -> void:
	battle.enemy_system.spawn("torpedo_boat", Vector2(900, 0))
	var torpedo: Enemy = null
	for i in 60 * 20:
		battle.step(TICK)
		for enemy in battle.enemy_system.active:
			if enemy.enemy_id == "enemy_torpedo":
				torpedo = enemy
		if torpedo != null:
			break
	assert_not_null(torpedo, "a torpedo was launched")
	if torpedo == null:
		return
	assert_eq(torpedo.hp, 10.0)
	assert_eq(torpedo.contact_damage, 15.0)
	battle.enemy_system.apply_damage(torpedo, 10.0)
	assert_false(torpedo.alive)
	assert_eq(battle.run_state.kills, 0, "shot-down torpedoes are not kills")


func test_enemies_scale_with_their_wave() -> void:
	var skiff := battle.enemy_system.spawn("raider_skiff", Vector2(900, 0), 10)
	assert_almost_eq(skiff.max_hp, 20.0 * pow(1.085, 9), 0.001)
	assert_almost_eq(skiff.contact_damage, 5.0 * 1.36, 0.001)
	assert_almost_eq(skiff.speed, 120.0 * 1.036, 0.001)


func test_pause_freezes_the_tree_and_shows_the_overlay() -> void:
	battle.set_paused(true)
	var paused := get_tree().paused
	var overlay_visible: bool = battle.hud.get_node("Root/Pause").visible
	battle.set_paused(false)
	assert_true(paused)
	assert_true(overlay_visible)
	assert_false(get_tree().paused)


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

	await wait_for_signal(EventBus.run_ended, 5.0)
	assert_eq(battle.phase, Battle.Phase.ENDED)
	assert_eq(Engine.time_scale, 1.0, "slow motion is over")
	assert_true(battle.hud.get_node("Root/GameOver").visible, "game over overlay is shown")
