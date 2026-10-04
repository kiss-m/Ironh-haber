class_name Splash
extends Control
## First screen (GAME_DESIGN.md section 12): shows the title in portrait and opens the main menu
## after a short delay or a tap.

const BACKGROUND_COLOR := Color("0b2a3f")
const TITLE_COLOR := Color("e8eef2")
const SUBTITLE_COLOR := Color("8fa9ba")
const TITLE_FONT_SIZE := 128
const SUBTITLE_FONT_SIZE := 40
const AUTO_ADVANCE_SECONDS := 1.5

var _advanced := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var background := ColorRect.new()
	background.name = "Background"
	background.color = BACKGROUND_COLOR
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)

	var column := VBoxContainer.new()
	column.name = "Column"
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(column)

	var title := _make_label("Title", "Iron Harbor", TITLE_FONT_SIZE, TITLE_COLOR)
	column.add_child(title)

	var version: String = ProjectSettings.get_setting("application/config/version", "")
	var subtitle := _make_label("Version", "v%s" % version, SUBTITLE_FONT_SIZE, SUBTITLE_COLOR)
	column.add_child(subtitle)

	var timer := Timer.new()
	timer.name = "AdvanceTimer"
	timer.one_shot = true
	timer.wait_time = AUTO_ADVANCE_SECONDS
	timer.timeout.connect(_advance)
	add_child(timer)
	timer.start()


func _gui_input(event: InputEvent) -> void:
	if (event is InputEventScreenTouch or event is InputEventMouseButton) and event.is_pressed():
		_advance()


func _advance() -> void:
	if _advanced:
		return
	_advanced = true
	SceneRouter.goto(SceneRouter.MAIN_MENU)


func _make_label(node_name: String, text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label
