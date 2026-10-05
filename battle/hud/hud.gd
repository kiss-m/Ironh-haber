class_name Hud
extends CanvasLayer
## Battle HUD (GAME_DESIGN.md section 12): top bar with base HP, wave, kills and the resources
## banked this run; a center banner for the wave countdown and cleared waves; bottom bar with one
## button per turret slot, the salvage boat status and a pause button; the pause overlay
## (resume, abandon run). The results screen follows a finished run. Gameplay
## state comes from EventBus; button presses leave through the signals below, which the Battle root
## wires up. Runs while the tree is paused so the pause overlay works.

signal slot_pressed(slot: int)
signal pause_pressed
signal resume_pressed
signal abandon_pressed

const TOP_BAR_HEIGHT := 240.0
const RESOURCE_ICON_SIZE := Vector2(26, 26)
## Banked resources shown in the top bar, in this order (cores join with bosses in M6).
const SHOWN_RESOURCES: PackedStringArray = ["credits", "steel", "electronics"]
const BOTTOM_BAR_HEIGHT := 200.0
const SIDE_MARGIN := 32.0
const FONT_SIZE := 40
const SMALL_FONT_SIZE := 34
const TITLE_FONT_SIZE := 76
const BANNER_FONT_SIZE := 72
const BUTTON_SIZE := Vector2(520, 150)
const SLOT_BUTTON_SIZE := Vector2(130, 150)
const PAUSE_BUTTON_SIZE := Vector2(150, 150)
const PANEL_COLOR := Color(0.043, 0.165, 0.247, 0.88)
const BAR_BACK_COLOR := Color("23394a")
const BAR_FILL_COLOR := Color("5fbf7f")
const BAR_LOW_COLOR := Color("e0664f")
const LOW_HP_FRACTION := 0.3
const DIM_COLOR := Color(0.0, 0.0, 0.0, 0.6)
const TEXT_COLOR := Color("e8eef2")
const BUTTON_COLOR := Color("23394a")
const BUTTON_PRESSED_COLOR := Color("31506a")
const SELECTED_COLOR := Color("ffd36b")

var _max_hp := 1.0
var _kills := 0
var _hp_bar: ProgressBar
var _hp_fill: StyleBoxFlat
var _hp_label: Label
var _wave_label: Label
var _kills_label: Label
var _banner: Label
var _resource_labels: Dictionary = {}
var _banked: Dictionary = {}
var _boat_label: Label
var _shield_bar: ProgressBar
var _radar: RadarOverlay
var _preview := ""
var _heat_bars: Array[ProgressBar] = []
var _slot_row: HBoxContainer
var _slot_buttons: Array[Button] = []
var _pause_overlay: Control


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var insets := SafeArea.vertical_insets(get_viewport())
	_build_top_bar(root, insets.x)
	_build_banner(root)
	_build_bottom_bar(root, insets.y)
	_radar = RadarOverlay.new()
	_radar.name = "Radar"
	_radar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_radar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_radar.top_margin = insets.x + TOP_BAR_HEIGHT
	_radar.bottom_margin = insets.y + BOTTOM_BAR_HEIGHT
	root.add_child(_radar)
	_pause_overlay = _build_overlay(root, "Pause", tr("PAUSE_TITLE"), [
		[tr("BUTTON_RESUME"), resume_pressed.emit],
		[tr("BUTTON_ABANDON"), abandon_pressed.emit],
	])
	EventBus.base_damaged.connect(_on_base_damaged)
	EventBus.base_repaired.connect(_set_hp)
	EventBus.enemy_killed.connect(_on_enemy_killed)
	EventBus.run_ended.connect(_on_run_ended)
	EventBus.wave_phase_changed.connect(_on_wave_phase_changed)
	EventBus.wave_countdown.connect(_on_wave_countdown)
	EventBus.turret_selected.connect(_on_turret_selected)
	EventBus.resources_banked.connect(_on_resources_banked)
	EventBus.boat_status.connect(_on_boat_status)
	EventBus.base_shield_changed.connect(set_shield)
	EventBus.turret_status.connect(_on_turret_status)


## `slot_names` are the translated weapon names of the turret slots, in slot order.
func setup(max_hp: float, slot_names: PackedStringArray) -> void:
	_max_hp = max_hp
	_hp_bar.max_value = max_hp
	_set_hp(max_hp)
	_set_kills(0)
	_banked.clear()
	for resource_name: String in _resource_labels:
		(_resource_labels[resource_name] as Label).text = "0"
	_wave_label.text = ""
	_banner.visible = false
	_pause_overlay.visible = false
	for button in _slot_buttons:
		button.queue_free()
	_slot_buttons.clear()
	_heat_bars.clear()
	for slot in slot_names.size():
		var button := Button.new()
		button.name = "Slot%d" % slot
		button.text = slot_names[slot]
		button.custom_minimum_size = SLOT_BUTTON_SIZE
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.add_theme_font_size_override("font_size", SMALL_FONT_SIZE if slot_names.size() <= 2 else 28)
		button.pressed.connect(slot_pressed.emit.bind(slot))
		_slot_row.add_child(button)
		_slot_buttons.append(button)
		var heat := ProgressBar.new()
		heat.name = "Heat"
		heat.show_percentage = false
		heat.max_value = 1.0
		heat.mouse_filter = Control.MOUSE_FILTER_IGNORE
		heat.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
		heat.offset_top = -14.0
		heat.offset_left = 12.0
		heat.offset_right = -12.0
		heat.offset_bottom = -6.0
		var heat_fill := StyleBoxFlat.new()
		heat_fill.bg_color = BAR_LOW_COLOR
		heat.add_theme_stylebox_override("fill", heat_fill)
		heat.add_theme_stylebox_override("background", StyleBoxEmpty.new())
		heat.visible = false
		button.add_child(heat)
		_heat_bars.append(heat)
		_style_button(button, false)


## Shows a continued run's state: base HP, kills and resources banked so far.
func show_state(hp: float, kills: int, banked: Dictionary) -> void:
	_set_hp(hp)
	_set_kills(kills)
	_on_resources_banked(banked)


func set_paused(paused: bool) -> void:
	_pause_overlay.visible = paused


func _build_top_bar(root: Control, top_inset: float) -> void:
	var bar := _make_panel("TopBar", top_inset + 20.0, 20.0)
	bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	bar.offset_bottom = top_inset + TOP_BAR_HEIGHT
	root.add_child(bar)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	bar.add_child(column)

	_hp_bar = ProgressBar.new()
	_hp_bar.name = "BaseHp"
	_hp_bar.show_percentage = false
	_hp_bar.custom_minimum_size.y = 72.0
	var back := StyleBoxFlat.new()
	back.bg_color = BAR_BACK_COLOR
	back.set_corner_radius_all(12)
	_hp_fill = StyleBoxFlat.new()
	_hp_fill.bg_color = BAR_FILL_COLOR
	_hp_fill.set_corner_radius_all(12)
	_hp_bar.add_theme_stylebox_override("background", back)
	_hp_bar.add_theme_stylebox_override("fill", _hp_fill)
	column.add_child(_hp_bar)
	_shield_bar = ProgressBar.new()
	_shield_bar.name = "BaseShield"
	_shield_bar.show_percentage = false
	_shield_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shield_bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	_shield_bar.offset_bottom = 12.0
	var shield_fill := StyleBoxFlat.new()
	shield_fill.bg_color = Color("4dd0e1")
	shield_fill.set_corner_radius_all(6)
	_shield_bar.add_theme_stylebox_override("fill", shield_fill)
	_shield_bar.add_theme_stylebox_override("background", StyleBoxEmpty.new())
	_shield_bar.visible = false
	_hp_bar.add_child(_shield_bar)

	_hp_label = _make_label("BaseHpValue", FONT_SIZE)
	_hp_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_hp_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_hp_bar.add_child(_hp_label)

	var row := HBoxContainer.new()
	column.add_child(row)
	_wave_label = _make_label("Wave", SMALL_FONT_SIZE)
	_wave_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_wave_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_wave_label)
	_kills_label = _make_label("Kills", SMALL_FONT_SIZE)
	_kills_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_kills_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_kills_label)

	var resources := HBoxContainer.new()
	resources.name = "Resources"
	resources.add_theme_constant_override("separation", 14)
	column.add_child(resources)
	for resource_name in SHOWN_RESOURCES:
		var icon := ColorRect.new()
		icon.color = LootDrop.COLORS[LootRoller.resource_from_name(resource_name)]
		icon.custom_minimum_size = RESOURCE_ICON_SIZE
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		resources.add_child(icon)
		var label := _make_label("Resource_" + resource_name, SMALL_FONT_SIZE, "0")
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		label.custom_minimum_size.x = 120.0
		resources.add_child(label)
		_resource_labels[resource_name] = label


func _build_banner(root: Control) -> void:
	_banner = _make_label("Banner", BANNER_FONT_SIZE)
	_banner.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_banner.anchor_top = 0.24
	_banner.anchor_bottom = 0.24
	_banner.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_banner.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	_banner.add_theme_constant_override("outline_size", 12)
	_banner.visible = false
	root.add_child(_banner)


func _build_bottom_bar(root: Control, bottom_inset: float) -> void:
	var bar := _make_panel("BottomBar", 24.0, bottom_inset + 24.0)
	bar.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bar.offset_top = -(bottom_inset + BOTTOM_BAR_HEIGHT)
	root.add_child(bar)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	bar.add_child(row)
	_slot_row = HBoxContainer.new()
	_slot_row.name = "Slots"
	_slot_row.add_theme_constant_override("separation", 20)
	_slot_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_slot_row)

	_boat_label = _make_label("BoatStatus", SMALL_FONT_SIZE)
	_boat_label.custom_minimum_size.x = 210.0
	_boat_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_boat_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(_boat_label)

	var pause := Button.new()
	pause.name = "PauseButton"
	pause.text = "II"
	pause.custom_minimum_size = PAUSE_BUTTON_SIZE
	pause.add_theme_font_size_override("font_size", FONT_SIZE)
	pause.pressed.connect(pause_pressed.emit)
	_style_button(pause, false)
	row.add_child(pause)


func _build_overlay(root: Control, node_name: String, title: String, buttons: Array) -> Control:
	var overlay := ColorRect.new()
	overlay.name = node_name
	overlay.color = DIM_COLOR
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	overlay.visible = false
	root.add_child(overlay)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(center)

	var column := VBoxContainer.new()
	column.name = "Column"
	column.add_theme_constant_override("separation", 48)
	center.add_child(column)
	column.add_child(_make_label("Title", TITLE_FONT_SIZE, title))

	for entry: Array in buttons:
		var button := Button.new()
		button.text = entry[0]
		button.custom_minimum_size = BUTTON_SIZE
		button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		button.add_theme_font_size_override("font_size", FONT_SIZE)
		button.pressed.connect(entry[1])
		_style_button(button, false)
		column.add_child(button)
	return overlay


func _make_panel(node_name: String, margin_top: float, margin_bottom: float) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = node_name
	var style := StyleBoxFlat.new()
	style.bg_color = PANEL_COLOR
	style.content_margin_left = SIDE_MARGIN
	style.content_margin_right = SIDE_MARGIN
	style.content_margin_top = margin_top
	style.content_margin_bottom = margin_bottom
	panel.add_theme_stylebox_override("panel", style)
	return panel


func _make_label(node_name: String, font_size: int, text := "") -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", TEXT_COLOR)
	return label


func _style_button(button: Button, selected: bool) -> void:
	for state in ["normal", "hover", "pressed", "focus", "hover_pressed"]:
		var style := StyleBoxFlat.new()
		style.bg_color = BUTTON_PRESSED_COLOR if state.contains("pressed") else BUTTON_COLOR
		style.set_corner_radius_all(16)
		if selected:
			style.set_border_width_all(6)
			style.border_color = SELECTED_COLOR
		elif state == "focus":
			style.draw_center = false
		button.add_theme_stylebox_override(state, style)
	button.add_theme_color_override("font_color", SELECTED_COLOR if selected else TEXT_COLOR)


## Base shield overlay on the HP bar (Shield Generator).
func set_shield(shield: float, max_shield: float) -> void:
	_shield_bar.visible = max_shield > 0.0
	_shield_bar.max_value = maxf(max_shield, 0.001)
	_shield_bar.value = shield


## Radar arrows; see RadarOverlay.
func set_radar_contacts(contacts: Array[Vector2i]) -> void:
	_radar.set_contacts(contacts)


## Radar preview of the next wave, shown under the "wave cleared" banner.
func show_preview(text: String) -> void:
	_preview = text
	if _banner.visible:
		_banner.text += "\n" + tr("BANNER_NEXT_WAVE") % text


func _on_turret_status(slot: int, heat: float, disabled: bool) -> void:
	if slot >= _slot_buttons.size():
		return
	_heat_bars[slot].visible = heat > 0.0
	_heat_bars[slot].value = heat
	_slot_buttons[slot].modulate = Color(1, 0.55, 0.55) if disabled else Color.WHITE


func _set_hp(hp: float) -> void:
	_hp_bar.value = hp
	_hp_label.text = "%d / %d" % [ceili(hp), ceili(_max_hp)]
	_hp_fill.bg_color = BAR_LOW_COLOR if hp <= _max_hp * LOW_HP_FRACTION else BAR_FILL_COLOR


func _set_kills(kills: int) -> void:
	_kills = kills
	_kills_label.text = tr("HUD_KILLS") % kills


func _on_base_damaged(_amount: float, hp_left: float) -> void:
	_set_hp(hp_left)


func _on_enemy_killed(_enemy: Node2D, _position: Vector2) -> void:
	_set_kills(_kills + 1)


func _on_wave_phase_changed(wave: int, phase: int) -> void:
	_wave_label.text = tr("HUD_WAVE") % wave
	match phase:
		WaveDirector.Phase.PREPARE:
			_banner.visible = true
		WaveDirector.Phase.BREAK:
			_banner.text = tr("BANNER_WAVE_CLEARED") % wave
			_preview = ""
			_banner.visible = true
		_:
			_banner.visible = false


func _on_wave_countdown(wave: int, seconds_left: int) -> void:
	_banner.text = tr("BANNER_WAVE_INCOMING") % [wave, seconds_left]


func _on_turret_selected(slot: int) -> void:
	for i in _slot_buttons.size():
		_style_button(_slot_buttons[i], i == slot)


func _on_resources_banked(delta: Dictionary) -> void:
	for resource_name: String in delta:
		_banked[resource_name] = int(_banked.get(resource_name, 0)) + int(delta[resource_name])
		if _resource_labels.has(resource_name):
			(_resource_labels[resource_name] as Label).text = str(_banked[resource_name])


func _on_boat_status(state: int, cargo: int, capacity: int, respawn_left: int) -> void:
	match state:
		SalvageBoat.State.DOCKED:
			_boat_label.text = tr("HUD_BOAT_DOCKED")
		SalvageBoat.State.UNLOADING:
			_boat_label.text = tr("HUD_BOAT_UNLOADING")
		SalvageBoat.State.DESTROYED:
			_boat_label.text = tr("HUD_BOAT_RESPAWN") % respawn_left
		_:
			_boat_label.text = tr("HUD_BOAT_CARGO") % [cargo, capacity]


func _on_run_ended(_summary: Dictionary) -> void:
	_banner.visible = false
	_pause_overlay.visible = false
