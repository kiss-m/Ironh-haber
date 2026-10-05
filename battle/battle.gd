class_name Battle
extends Node2D
## Battle root (GAME_DESIGN.md section 9). Builds the world, systems and HUD in _ready(), injects
## their dependencies and steps the systems in a fixed order every physics tick. The camera is
## centered on the fortress, so world (0, 0) is the fortress center.
##
## A battle starts from GameState: the loadout and upgrades of the save, and either a new run
## (GameState.pending_run = {"sector": id}) or a run snapshot to continue. It saves a snapshot at
## every wave break, records the run in GameState when it ends and then opens the results screen.

const SCENE_PATH := "res://battle/battle.tscn"
const OCEAN_COLOR := Color("11425f")
## Extra world space around the visible area that the grid and ocean cover.
const WORLD_MARGIN := 320.0
const END_SLOW_MOTION_SCALE := 0.3
const END_SLOW_MOTION_SECONDS := 1.2
const BASE_EXPLOSION_COLOR := Color("ff8a4c")

enum Phase { RUNNING, ENDING, ENDED }

## Seed for the next run; -1 picks a random one. Tests set it before adding the battle to the tree.
var run_seed := -1
## Wave the run starts at; tests and the debug menu (M7) can jump ahead.
var first_wave := 1
var sector_id := GameState.DEFAULT_SECTOR
## Open the results screen when the run ends. Tests turn this off.
var leave_on_end := true
var phase := Phase.RUNNING
var paused := false
## Visible world rectangle, centered on the fortress.
var play_area := Rect2()

var world: Node2D
var camera: Camera2D
var ocean: ColorRect
var fortress: Fortress
var turrets: Array[Turret] = []
var enemy_layer: Node2D
var loot_layer: Node2D
var boat_layer: Node2D
var projectile_layer: ProjectileLayer
var fx_layer: FxLayer
var systems: Node
var run_state: RunState
var stats: StatResolver
var input_controller: InputController
var wave_director: WaveDirector
var enemy_system: EnemySystem
var projectile_system: ProjectileSystem
var loot_system: LootSystem
var salvage_system: SalvageSystem
var targeting_system: TargetingSystem
## Radar upgrade level: 1+ shows edge warnings and the next wave preview (section 8).
var radar_level := 0
var grid: SpatialGrid
var hud: Hud


func _ready() -> void:
	Engine.time_scale = 1.0
	DisplayServer.screen_set_keep_on(true)
	var balance := DataRegistry.balance
	stats = StatResolver.new(balance["stat_caps"])
	stats.set_modifiers(GameState.upgrades.modifiers(GameState.upgrade_levels()))
	var resume := _take_pending_run()
	_build_world(balance)
	_build_systems(balance)
	_build_hud()
	_layout()
	get_viewport().size_changed.connect(_layout)
	var max_hp := stats.resolve("fortress.max_hp", float(balance["fortress"]["base_hp"]))
	run_state.start(run_seed if run_seed >= 0 else randi(), max_hp)
	run_state.damage_taken = stats.resolve("fortress.damage_taken", 1.0)
	run_state.regen = stats.resolve("fortress.regen", float(balance["fortress"]["regen"]))
	run_state.shield_regen_delay = float(balance["shields"]["regen_delay"])
	run_state.shield_regen_rate = float(balance["shields"]["regen_rate"])
	run_state.set_max_shield(max_hp * stats.resolve("fortress.shield", 0.0))
	targeting_system.auto_share = AutoTargeting.share(int(stats.resolve("fortress.auto_targeting", 0.0)),
			balance["auto_targeting"])
	var settings: Dictionary = GameState.data["settings"]
	if bool(settings.get("aim_assist", true)):
		targeting_system.assist_angle = deg_to_rad(float(balance["aim"]["assist_deg"]))
	input_controller.dual_command = stats.resolve("fortress.dual_command", 0.0) >= 1.0
	radar_level = int(stats.resolve("fortress.radar", 0.0))
	if not resume.is_empty():
		run_state.base_hp = clampf(float(resume.get("base_hp", max_hp)), 1.0, max_hp)
		run_state.kills = int(resume.get("kills", 0))
		run_state.elapsed = float(resume.get("time", 0.0))
		run_state.add_banked(resume.get("banked", {}))
	EventBus.wave_cleared.connect(_on_wave_cleared)
	EventBus.turret_disable_requested.connect(_on_turret_disable_requested)
	EventBus.wave_phase_changed.connect(_on_wave_phase_changed)
	var slot_names := PackedStringArray()
	for turret in turrets:
		slot_names.append(tr(turret.name_key))
	hud.setup(run_state.max_hp, slot_names)
	hud.show_state(run_state.base_hp, run_state.kills, run_state.banked)
	hud.set_shield(run_state.shield, run_state.max_shield)
	salvage_system.refresh_status()
	input_controller.select(clampi(int(resume.get("selected_slot", 0)), 0, maxi(turrets.size() - 1, 0)))
	wave_director.start(first_wave)


func _exit_tree() -> void:
	Engine.time_scale = 1.0
	DisplayServer.screen_set_keep_on(false)
	if paused:
		get_tree().paused = false


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_WM_GO_BACK_REQUEST:
			# Android back: closes the pause overlay or opens it (section 14).
			set_paused(not paused)
		NOTIFICATION_APPLICATION_PAUSED:
			# Home button or a call: pause now and save; the player resumes from the pause menu.
			set_paused(true)
			GameState.save_game()


func _physics_process(delta: float) -> void:
	step(delta)


## Advances the battle by one physics tick. Order matters: spawn, move enemies, re-bucket the
## grid, turn and fire turrets, move projectiles and resolve hits against the fresh grid (kills
## drop loot), then drift loot and run the salvage boat.
func step(delta: float) -> void:
	if phase == Phase.ENDED:
		return
	if phase == Phase.RUNNING:
		run_state.elapsed += delta
		run_state.tick_regen(delta)
	wave_director.tick(delta)
	enemy_system.tick(delta)
	grid.rebuild(enemy_system.active)
	targeting_system.tick(delta)
	for turret in turrets:
		turret.tick(delta)
	projectile_system.tick(delta)
	loot_system.tick(delta)
	salvage_system.tick(delta)
	fx_layer.tick(delta)
	projectile_layer.queue_redraw()
	if radar_level > 0:
		_update_radar()
	if phase == Phase.RUNNING and run_state.base_hp <= 0.0:
		_begin_end()


func set_paused(value: bool) -> void:
	if phase != Phase.RUNNING or not is_inside_tree():
		return
	paused = value
	input_controller.cancel()
	get_tree().paused = value
	hud.set_paused(value)


func _build_world(balance: Dictionary) -> void:
	world = Node2D.new()
	world.name = "World"
	add_child(world)

	camera = Camera2D.new()
	camera.name = "Camera"
	world.add_child(camera)

	ocean = ColorRect.new()
	ocean.name = "Ocean"
	ocean.color = OCEAN_COLOR
	ocean.mouse_filter = Control.MOUSE_FILTER_IGNORE
	world.add_child(ocean)

	loot_layer = Node2D.new()
	loot_layer.name = "LootLayer"
	world.add_child(loot_layer)

	fortress = Fortress.new()
	fortress.name = "Fortress"
	fortress.setup(float(balance["fortress"]["radius"]))
	world.add_child(fortress)

	var loadout := GameState.loadout()
	var mount_radius := float(balance["fortress"]["mount_radius"])
	for mount in loadout.size():
		if loadout[mount] == "":
			continue
		var turret := Turret.new()
		turret.slot = turrets.size()
		turret.name = "Turret%d" % turret.slot
		turret.rotation = -PI / 2.0
		turret.setup(DataRegistry.weapon(loadout[mount]), stats, float(balance["aim"]["fire_tolerance_deg"]))
		fortress.add_mount(mount_offset(mount, loadout.size(), mount_radius)).add_child(turret)
		turrets.append(turret)

	boat_layer = Node2D.new()
	boat_layer.name = "BoatLayer"
	world.add_child(boat_layer)
	enemy_layer = Node2D.new()
	enemy_layer.name = "EnemyLayer"
	world.add_child(enemy_layer)
	projectile_layer = ProjectileLayer.new()
	projectile_layer.name = "ProjectileLayer"
	world.add_child(projectile_layer)
	fx_layer = FxLayer.new()
	fx_layer.name = "FxLayer"
	world.add_child(fx_layer)


## Turret mounts sit on a ring inside the fortress, the first one on the left.
static func mount_offset(slot: int, slot_count: int, radius: float) -> Vector2:
	if slot_count <= 1:
		return Vector2.ZERO
	return Vector2.from_angle(PI + TAU * slot / slot_count) * radius


func _build_systems(balance: Dictionary) -> void:
	systems = Node.new()
	systems.name = "Systems"
	add_child(systems)

	run_state = RunState.new()
	run_state.name = "RunState"
	systems.add_child(run_state)

	grid = SpatialGrid.new(Rect2(), float(balance["spatial_grid"]["cell_size"]))
	var generator := WaveGenerator.new(DataRegistry.enemies, DataRegistry.waves)

	loot_system = LootSystem.new()
	loot_system.name = "LootSystem"
	loot_system.run_state = run_state
	loot_system.scaling = generator.scaling
	loot_system.stats = stats
	loot_system.setup(loot_layer, DataRegistry.loot_tables, balance["loot"])
	loot_system.elite_loot_multiplier = float(balance["elites"]["loot_multiplier"])
	systems.add_child(loot_system)

	salvage_system = SalvageSystem.new()
	salvage_system.name = "SalvageSystem"
	salvage_system.loot = loot_system
	salvage_system.run_state = run_state
	salvage_system.stats = stats
	salvage_system.fx = fx_layer
	salvage_system.setup(boat_layer, balance["salvage_boat"], fortress.radius, float(balance["loot"]["spill_float_time"]))
	systems.add_child(salvage_system)

	enemy_system = EnemySystem.new()
	enemy_system.name = "EnemySystem"
	enemy_system.grid = grid
	enemy_system.run_state = run_state
	enemy_system.fx = fx_layer
	enemy_system.scaling = generator.scaling
	enemy_system.salvage = salvage_system
	enemy_system.setup(enemy_layer, DataRegistry.enemies, balance, int(balance["pools"]["enemies"]))
	systems.add_child(enemy_system)

	projectile_system = ProjectileSystem.new()
	projectile_system.name = "ProjectileSystem"
	projectile_system.grid = grid
	projectile_system.enemies = enemy_system
	projectile_system.fx = fx_layer
	projectile_system.damage_calc = DamageCalc.new(balance["armor_multipliers"], balance["crit"])
	projectile_system.rng = run_state.rng_combat
	projectile_system.reserve(int(balance["pools"]["projectiles"]))
	systems.add_child(projectile_system)
	projectile_layer.system = projectile_system

	for turret in turrets:
		turret.projectiles = projectile_system
		turret.fx = fx_layer
		turret.rng = run_state.rng_combat
		turret.aim_origin = fortress.position

	targeting_system = TargetingSystem.new()
	targeting_system.name = "TargetingSystem"
	targeting_system.turrets = turrets
	targeting_system.grid = grid
	targeting_system.fortress_center = fortress.position
	systems.add_child(targeting_system)

	wave_director = WaveDirector.new()
	wave_director.name = "WaveDirector"
	wave_director.enemies = enemy_system
	wave_director.run_state = run_state
	wave_director.setup(generator, DataRegistry.waves)
	systems.add_child(wave_director)

	input_controller = InputController.new()
	input_controller.name = "InputController"
	input_controller.turrets = turrets
	input_controller.loot = loot_system
	input_controller.salvage = salvage_system
	systems.add_child(input_controller)


func _build_hud() -> void:
	hud = Hud.new()
	hud.name = "HUD"
	add_child(hud)
	hud.slot_pressed.connect(input_controller.select)
	hud.pause_pressed.connect(set_paused.bind(true))
	hud.resume_pressed.connect(set_paused.bind(false))
	hud.abandon_pressed.connect(abandon)


## Sizes everything that depends on the visible area (portrait phones differ in aspect ratio).
func _layout() -> void:
	var size := get_viewport().get_visible_rect().size
	play_area = Rect2(-size * 0.5, size)
	var world_area := play_area.grow(WORLD_MARGIN)
	ocean.position = world_area.position
	ocean.size = world_area.size
	grid.configure(world_area, grid.cell_size)
	wave_director.play_area = play_area


## Ends the run from the pause menu ("abandon run"): it counts like losing the base.
func abandon() -> void:
	if phase != Phase.RUNNING:
		return
	set_paused(false)
	_begin_end()


## Snapshot at every wave break, so an app kill never costs more than one wave (section 11).
## The run continues from the start of the next wave.
func _on_wave_cleared(wave: int) -> void:
	if phase != Phase.RUNNING:
		return
	GameState.snapshot_run({
		"seed": run_state.run_seed,
		"sector": sector_id,
		"wave": wave + 1,
		"base_hp": run_state.base_hp,
		"kills": run_state.kills,
		"time": run_state.elapsed,
		"banked": run_state.banked.duplicate(),
		"perks": [],
		"selected_slot": input_controller.selected_slot,
	})


## Radar: edge warnings for groups about to spawn, and the next wave's lineup during the break.
func _update_radar() -> void:
	var contacts: Array[Vector2i] = []
	var lookahead := float(DataRegistry.balance["radar"]["lookahead"])
	for group in wave_director.upcoming(lookahead):
		contacts.append(Vector2i(group.edge, roundi(group.edge_offset * 1000.0)))
	hud.set_radar_contacts(contacts)


func _on_wave_phase_changed(wave: int, wave_phase: int) -> void:
	if radar_level <= 0 or wave_phase != WaveDirector.Phase.BREAK:
		return
	var counts := {}
	for group in wave_director.generator.generate(wave + 1, run_state.run_seed):
		counts[group.enemy_id] = int(counts.get(group.enemy_id, 0)) + group.count
	var parts := PackedStringArray()
	for id: String in counts:
		parts.append("%s ×%d" % [tr(str(DataRegistry.enemy(id)["name_key"])), counts[id]])
	hud.show_preview(", ".join(parts))


## A Landing Craft reached the base: a random working turret stops for `seconds`.
func _on_turret_disable_requested(seconds: float) -> void:
	var working: Array[Turret] = []
	for turret in turrets:
		if not turret.is_disabled():
			working.append(turret)
	if not working.is_empty():
		working[run_state.rng_combat.randi() % working.size()].disable_for(seconds)


## Applies GameState.pending_run (and clears it). Returns the snapshot to continue, or {}.
func _take_pending_run() -> Dictionary:
	var pending := GameState.pending_run
	GameState.pending_run = {}
	sector_id = str(pending.get("sector", sector_id))
	if not pending.has("wave"):
		return {}
	run_seed = int(pending["seed"])
	first_wave = int(pending["wave"])
	return pending


func _begin_end() -> void:
	phase = Phase.ENDING
	run_state.is_over = true
	wave_director.enabled = false
	for turret in turrets:
		turret.enabled = false
	input_controller.enabled = false
	input_controller.cancel()
	fortress.set_destroyed(true)
	fx_layer.burst(fortress.position, fortress.radius * 1.8, BASE_EXPLOSION_COLOR, 0.9)
	Engine.time_scale = END_SLOW_MOTION_SCALE
	get_tree().create_timer(END_SLOW_MOTION_SECONDS, true, false, true).timeout.connect(_finish_end)


func _finish_end() -> void:
	Engine.time_scale = 1.0
	phase = Phase.ENDED
	var summary := run_state.summary()
	summary["sector"] = sector_id
	summary = GameState.finish_run(summary)
	EventBus.run_ended.emit(summary)
	if leave_on_end and is_inside_tree():
		SceneRouter.goto(SceneRouter.RESULTS)
