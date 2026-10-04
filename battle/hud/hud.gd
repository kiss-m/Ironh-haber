class_name Hud
extends CanvasLayer
## Battle HUD (GAME_DESIGN.md section 12). M1 has the top bar with base HP and kills, plus a game
## over overlay with a retry button; the results screen replaces the overlay in M4. Listens to
## EventBus and never reads the systems directly.

const TOP_BAR_HEIGHT := 132.0
const SIDE_MARGIN := 32.0
const FONT_SIZE := 40
const TITLE_FONT_SIZE := 76
const BUTTON_SIZE := Vector2(520, 150)
const PANEL_COLOR := Color(0.043, 0.165, 0.247, 0.88)
const BAR_BACK_COLOR := Color("23394a")
const BAR_FILL_COLOR := Color("5fbf7f")
const BAR_LOW_COLOR := Color("e0664f")
const LOW_HP_FRACTION := 0.3
const DIM_COLOR := Color(0.0, 0.0, 0.0, 0.6)
const TEXT_COLOR := Color("e8eef2")

var _max_hp := 1.0
var _kills := 0
var _hp_bar: ProgressBar
var _hp_fill: StyleBoxFlat
var _hp_label: Label
var _kills_label: Label
var _game_over: Control
var _summary_label: Label


func _ready() -> void:
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_build_top_bar(root)
	_build_game_over(root)
	EventBus.base_damaged.connect(_on_base_damaged)
	EventBus.enemy_killed.connect(_on_enemy_killed)
	EventBus.run_ended.connect(_on_run_ended)


func setup(max_hp: float) -> void:
	_max_hp = max_hp
	_kills = 0
	_hp_bar.max_value = max_hp
	_set_hp(max_hp)
	_set_kills(0)
	_game_over.visible = false


func _build_top_bar(root: Control) -> void:
	var insets := SafeArea.vertical_insets(get_viewport())
	var bar := PanelContainer.new()
	bar.name = "TopBar"
	bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	bar.offset_bottom = insets.x + TOP_BAR_HEIGHT
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = PANEL_COLOR
	panel_style.content_margin_left = SIDE_MARGIN
	panel_style.content_margin_right = SIDE_MARGIN
	panel_style.content_margin_top = insets.x + 24.0
	panel_style.content_margin_bottom = 24.0
	bar.add_theme_stylebox_override("panel", panel_style)
	root.add_child(bar)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 32)
	bar.add_child(row)

	_hp_bar = ProgressBar.new()
	_hp_bar.name = "BaseHp"
	_hp_bar.show_percentage = false
	_hp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hp_bar.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var back := StyleBoxFlat.new()
	back.bg_color = BAR_BACK_COLOR
	back.set_corner_radius_all(12)
	_hp_fill = StyleBoxFlat.new()
	_hp_fill.bg_color = BAR_FILL_COLOR
	_hp_fill.set_corner_radius_all(12)
	_hp_bar.add_theme_stylebox_override("background", back)
	_hp_bar.add_theme_stylebox_override("fill", _hp_fill)
	row.add_child(_hp_bar)

	_hp_label = _make_label("BaseHpValue", FONT_SIZE)
	_hp_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_hp_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_hp_bar.add_child(_hp_label)

	_kills_label = _make_label("Kills", FONT_SIZE)
	_kills_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_kills_label.custom_minimum_size.x = 300.0
	_kills_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(_kills_label)


func _build_game_over(root: Control) -> void:
	_game_over = ColorRect.new()
	_game_over.name = "GameOver"
	(_game_over as ColorRect).color = DIM_COLOR
	_game_over.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_game_over.mouse_filter = Control.MOUSE_FILTER_STOP
	_game_over.visible = false
	root.add_child(_game_over)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_game_over.add_child(center)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 48)
	center.add_child(column)

	column.add_child(_make_label("Title", TITLE_FONT_SIZE, tr("GAME_OVER_TITLE")))
	_summary_label = _make_label("Summary", FONT_SIZE)
	column.add_child(_summary_label)

	var retry := Button.new()
	retry.name = "Retry"
	retry.text = tr("BUTTON_RETRY")
	retry.custom_minimum_size = BUTTON_SIZE
	retry.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	retry.add_theme_font_size_override("font_size", FONT_SIZE)
	retry.pressed.connect(_on_retry_pressed)
	column.add_child(retry)


func _make_label(node_name: String, font_size: int, text := "") -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", TEXT_COLOR)
	return label


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


func _on_run_ended(summary: Dictionary) -> void:
	var seconds := int(summary.get("time", 0.0))
	var time_text := "%d:%02d" % [floori(seconds / 60.0), seconds % 60]
	_summary_label.text = tr("GAME_OVER_SUMMARY") % [int(summary.get("kills", 0)), time_text]
	_game_over.visible = true


func _on_retry_pressed() -> void:
	SceneRouter.goto(Battle.SCENE_PATH)
