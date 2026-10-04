extends GutTest
## M0 smoke tests: the project settings fixed by GAME_DESIGN.md sections 2–3, the autoload
## stubs and the splash scene.

const AUTOLOADS: Array[String] = ["EventBus", "DataRegistry", "GameState", "SceneRouter", "AudioManager"]

const EVENT_BUS_SIGNALS: Array[String] = [
	"enemy_spawned", "enemy_killed", "base_damaged", "loot_dropped", "loot_marked",
	"loot_sunk", "boat_state_changed", "resources_banked", "wave_started", "wave_cleared",
	"perk_offered", "perk_picked", "run_ended", "upgrade_purchased",
]


func test_design_resolution_is_1080x2400() -> void:
	assert_eq(ProjectSettings.get_setting("display/window/size/viewport_width"), 1080)
	assert_eq(ProjectSettings.get_setting("display/window/size/viewport_height"), 2400)


func test_stretch_is_canvas_items_with_expand_aspect() -> void:
	assert_eq(ProjectSettings.get_setting("display/window/stretch/mode"), "canvas_items")
	assert_eq(ProjectSettings.get_setting("display/window/stretch/aspect"), "expand")


func test_orientation_is_locked_to_portrait() -> void:
	assert_eq(ProjectSettings.get_setting("display/window/handheld/orientation"), DisplayServer.SCREEN_PORTRAIT)


func test_renderer_is_mobile_with_compatibility_fallback() -> void:
	assert_eq(ProjectSettings.get_setting("rendering/renderer/rendering_method"), "mobile")
	assert_true(ProjectSettings.get_setting("rendering/rendering_device/fallback_to_opengl3"))


func test_autoloads_are_registered() -> void:
	for autoload_name in AUTOLOADS:
		assert_not_null(get_tree().root.get_node_or_null(autoload_name), "%s autoload is missing" % autoload_name)


func test_event_bus_declares_core_signal_set() -> void:
	var bus: Node = get_tree().root.get_node("EventBus")
	for signal_name in EVENT_BUS_SIGNALS:
		assert_true(bus.has_signal(signal_name), "EventBus is missing signal %s" % signal_name)


func test_splash_shows_game_title() -> void:
	var scene: PackedScene = load(ProjectSettings.get_setting("application/run/main_scene"))
	var splash: Control = add_child_autofree(scene.instantiate())
	var title: Label = splash.get_node_or_null("Column/Title")
	assert_not_null(title, "Splash builds a Title label in _ready()")
	if title != null:
		assert_eq(title.text, "Iron Harbor")
