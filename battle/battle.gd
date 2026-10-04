class_name Battle
extends Node2D
## Battle root (GAME_DESIGN.md section 9). Builds the world, systems and HUD in _ready(), injects
## their dependencies and steps the systems in a fixed order every physics tick. The camera is
## centered on the fortress, so world (0, 0) is the fortress center.

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
var grid: SpatialGrid
var hud: Hud


func _ready() -> void:
	Engine.time_scale = 1.0
	DisplayServer.screen_set_keep_on(true)
	var balance := DataRegistry.balance
	stats = StatResolver.new(balance["stat_caps"])
	_build_world(balance)
	_build_systems(balance)
	_build_hud()
	_layout()
	get_viewport().size_changed.connect(_layout)
	run_state.start(run_seed if run_seed >= 0 else randi(), float(balance["fortress"]["base_hp"]))
	var slot_names := PackedStringArray()
	for turret in turrets:
		slot_names.append(tr(turret.name_key))
	hud.setup(run_state.max_hp, slot_names)
	salvage_system.refresh_status()
	input_controller.select(0)
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
			# Home button or a call: pause now; the player resumes from the pause menu.
			set_paused(true)


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
	wave_director.tick(delta)
	enemy_system.tick(delta)
	grid.rebuild(enemy_system.active)
	for turret in turrets:
		turret.tick(delta)
	projectile_system.tick(delta)
	loot_system.tick(delta)
	salvage_system.tick(delta)
	fx_layer.tick(delta)
	projectile_layer.queue_redraw()
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

	var loadout: Array = balance["starting_loadout"]
	var mount_radius := float(balance["fortress"]["mount_radius"])
	for slot in loadout.size():
		var turret := Turret.new()
		turret.name = "Turret%d" % slot
		turret.slot = slot
		turret.rotation = -PI / 2.0
		turret.setup(DataRegistry.weapon(str(loadout[slot])), stats, float(balance["aim"]["fire_tolerance_deg"]))
		fortress.add_mount(mount_offset(slot, loadout.size(), mount_radius)).add_child(turret)
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
		turret.rng = run_state.rng_combat
		turret.aim_origin = fortress.position

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
	hud.restart_pressed.connect(_restart)


## Sizes everything that depends on the visible area (portrait phones differ in aspect ratio).
func _layout() -> void:
	var size := get_viewport().get_visible_rect().size
	play_area = Rect2(-size * 0.5, size)
	var world_area := play_area.grow(WORLD_MARGIN)
	ocean.position = world_area.position
	ocean.size = world_area.size
	grid.configure(world_area, grid.cell_size)
	wave_director.play_area = play_area


func _restart() -> void:
	get_tree().paused = false
	SceneRouter.goto(SCENE_PATH)


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
	EventBus.run_ended.emit(run_state.summary())
