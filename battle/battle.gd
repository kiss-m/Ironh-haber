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
var phase := Phase.RUNNING
## Visible world rectangle, centered on the fortress.
var play_area := Rect2()

var world: Node2D
var camera: Camera2D
var ocean: ColorRect
var fortress: Fortress
var turret: Turret
var enemy_layer: Node2D
var projectile_layer: ProjectileLayer
var fx_layer: FxLayer
var systems: Node
var run_state: RunState
var input_controller: InputController
var wave_director: WaveDirector
var enemy_system: EnemySystem
var projectile_system: ProjectileSystem
var grid: SpatialGrid
var hud: Hud


func _ready() -> void:
	Engine.time_scale = 1.0
	DisplayServer.screen_set_keep_on(true)
	var balance := DataRegistry.balance
	_build_world(balance)
	_build_systems(balance)
	hud = Hud.new()
	hud.name = "HUD"
	add_child(hud)
	_layout()
	get_viewport().size_changed.connect(_layout)
	run_state.start(run_seed if run_seed >= 0 else randi(), float(balance["fortress"]["base_hp"]))
	hud.setup(run_state.max_hp)


func _exit_tree() -> void:
	Engine.time_scale = 1.0
	DisplayServer.screen_set_keep_on(false)


func _physics_process(delta: float) -> void:
	step(delta)


## Advances the battle by one physics tick. Order matters: spawn, move enemies, re-bucket the
## grid, turn and fire turrets, then move projectiles and resolve hits against the fresh grid.
func step(delta: float) -> void:
	if phase == Phase.ENDED:
		return
	if phase == Phase.RUNNING:
		run_state.elapsed += delta
	wave_director.tick(delta)
	enemy_system.tick(delta)
	grid.rebuild(enemy_system.active)
	turret.tick(delta)
	projectile_system.tick(delta)
	fx_layer.tick(delta)
	projectile_layer.queue_redraw()
	if phase == Phase.RUNNING and run_state.base_hp <= 0.0:
		_begin_end()


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

	fortress = Fortress.new()
	fortress.name = "Fortress"
	fortress.setup(float(balance["fortress"]["radius"]))
	world.add_child(fortress)

	turret = Turret.new()
	turret.name = "Turret"
	turret.rotation = -PI / 2.0
	turret.setup(DataRegistry.weapon("machine_gun"), float(balance["aim"]["fire_tolerance_deg"]))
	fortress.add_mount(Vector2.ZERO).add_child(turret)

	enemy_layer = _add_layer("EnemyLayer")
	projectile_layer = ProjectileLayer.new()
	projectile_layer.name = "ProjectileLayer"
	world.add_child(projectile_layer)
	fx_layer = FxLayer.new()
	fx_layer.name = "FxLayer"
	world.add_child(fx_layer)


func _add_layer(layer_name: String) -> Node2D:
	var layer := Node2D.new()
	layer.name = layer_name
	world.add_child(layer)
	return layer


func _build_systems(balance: Dictionary) -> void:
	systems = Node.new()
	systems.name = "Systems"
	add_child(systems)

	run_state = RunState.new()
	run_state.name = "RunState"
	systems.add_child(run_state)

	grid = SpatialGrid.new(Rect2(), float(balance["spatial_grid"]["cell_size"]))

	enemy_system = EnemySystem.new()
	enemy_system.name = "EnemySystem"
	enemy_system.grid = grid
	enemy_system.run_state = run_state
	enemy_system.fx = fx_layer
	enemy_system.setup(enemy_layer, DataRegistry.enemies, balance, int(balance["pools"]["enemies"]))
	systems.add_child(enemy_system)

	projectile_system = ProjectileSystem.new()
	projectile_system.name = "ProjectileSystem"
	projectile_system.grid = grid
	projectile_system.enemies = enemy_system
	projectile_system.damage_calc = DamageCalc.new(balance["armor_multipliers"], balance["crit"])
	projectile_system.rng = run_state.rng_combat
	projectile_system.reserve(int(balance["pools"]["projectiles"]))
	systems.add_child(projectile_system)
	projectile_layer.system = projectile_system

	turret.projectiles = projectile_system
	turret.rng = run_state.rng_combat
	turret.aim_origin = fortress.position

	wave_director = WaveDirector.new()
	wave_director.name = "WaveDirector"
	wave_director.enemies = enemy_system
	wave_director.rng = run_state.rng_waves
	wave_director.setup(DataRegistry.waves["trickle"])
	systems.add_child(wave_director)

	input_controller = InputController.new()
	input_controller.name = "InputController"
	input_controller.turret = turret
	systems.add_child(input_controller)


## Sizes everything that depends on the visible area (portrait phones differ in aspect ratio).
func _layout() -> void:
	var size := get_viewport().get_visible_rect().size
	play_area = Rect2(-size * 0.5, size)
	var world_area := play_area.grow(WORLD_MARGIN)
	ocean.position = world_area.position
	ocean.size = world_area.size
	grid.configure(world_area, grid.cell_size)
	wave_director.play_area = play_area


func _begin_end() -> void:
	phase = Phase.ENDING
	run_state.is_over = true
	wave_director.enabled = false
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
