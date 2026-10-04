class_name UiKit
extends RefCounted
## Shared look for the meta screens (GAME_DESIGN.md section 12) until the shared Theme resource
## arrives in M7: colors, font sizes and small widget builders. Touch targets stay at least
## 48 dp (about 120 design px tall buttons).

const BACKGROUND_COLOR := Color("0b2a3f")
const PANEL_COLOR := Color("123a55")
const PANEL_LOCKED_COLOR := Color("0f2f45")
const TEXT_COLOR := Color("e8eef2")
const MUTED_COLOR := Color("8fa9ba")
const ACCENT_COLOR := Color("ffd36b")
const GOOD_COLOR := Color("5fbf7f")
const BAD_COLOR := Color("e0664f")
const BUTTON_COLOR := Color("23394a")
const BUTTON_PRESSED_COLOR := Color("31506a")
const BUTTON_DISABLED_COLOR := Color("1a2d3b")
const TITLE_SIZE := 76
const HEADING_SIZE := 48
const TEXT_SIZE := 38
const SMALL_SIZE := 32
const BUTTON_HEIGHT := 130.0
const MARGIN := 40


## Full-screen root for a meta screen: background plus a safe-area padded column.
static func screen(owner: Control) -> VBoxContainer:
	owner.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var background := ColorRect.new()
	background.color = BACKGROUND_COLOR
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	owner.add_child(background)
	var insets := SafeArea.vertical_insets(owner.get_viewport())
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", MARGIN)
	margin.add_theme_constant_override("margin_right", MARGIN)
	margin.add_theme_constant_override("margin_top", MARGIN + int(insets.x))
	margin.add_theme_constant_override("margin_bottom", MARGIN + int(insets.y))
	owner.add_child(margin)
	var column := VBoxContainer.new()
	column.name = "Column"
	column.add_theme_constant_override("separation", 28)
	margin.add_child(column)
	return column


static func label(text: String, size := TEXT_SIZE, color := TEXT_COLOR, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var result := Label.new()
	result.text = text
	result.horizontal_alignment = align
	result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result.add_theme_font_size_override("font_size", size)
	result.add_theme_color_override("font_color", color)
	return result


static func button(text: String, on_pressed: Callable, size := TEXT_SIZE, highlighted := false) -> Button:
	var result := Button.new()
	result.text = text
	result.custom_minimum_size.y = BUTTON_HEIGHT
	result.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	result.add_theme_font_size_override("font_size", size)
	style_button(result, highlighted)
	result.pressed.connect(on_pressed)
	return result


static func style_button(target: Button, highlighted := false) -> void:
	for state in ["normal", "hover", "pressed", "focus", "hover_pressed", "disabled"]:
		var style := StyleBoxFlat.new()
		style.set_corner_radius_all(18)
		style.content_margin_left = 24.0
		style.content_margin_right = 24.0
		if state == "disabled":
			style.bg_color = BUTTON_DISABLED_COLOR
		elif state.contains("pressed"):
			style.bg_color = BUTTON_PRESSED_COLOR
		else:
			style.bg_color = BUTTON_COLOR
		if highlighted:
			style.set_border_width_all(6)
			style.border_color = ACCENT_COLOR
		elif state == "focus":
			style.draw_center = false
		target.add_theme_stylebox_override(state, style)
	target.add_theme_color_override("font_color", ACCENT_COLOR if highlighted else TEXT_COLOR)
	target.add_theme_color_override("font_disabled_color", MUTED_COLOR)


static func panel(color := PANEL_COLOR) -> PanelContainer:
	var result := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(20)
	style.set_content_margin_all(28.0)
	result.add_theme_stylebox_override("panel", style)
	return result


## A row of colored squares and amounts for the given resources ({name: amount}).
static func resource_row(amounts: Dictionary, size := TEXT_SIZE) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	for resource_name: String in amounts:
		var icon := ColorRect.new()
		icon.color = LootDrop.COLORS[LootRoller.resource_from_name(resource_name)]
		icon.custom_minimum_size = Vector2(size * 0.7, size * 0.7)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(icon)
		var amount := label(str(int(amounts[resource_name])), size)
		amount.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(amount)
		var spacer := Control.new()
		spacer.custom_minimum_size.x = 18.0
		row.add_child(spacer)
	return row
