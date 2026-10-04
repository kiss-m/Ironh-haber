class_name Splash
extends Control
## First screen (GAME_DESIGN.md section 12). In M0 it only shows the title in portrait;
## from M4 it routes to the main menu.

const BACKGROUND_COLOR := Color("0b2a3f")
const TITLE_COLOR := Color("e8eef2")
const SUBTITLE_COLOR := Color("8fa9ba")
const TITLE_FONT_SIZE := 128
const SUBTITLE_FONT_SIZE := 40


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


func _make_label(node_name: String, text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label
