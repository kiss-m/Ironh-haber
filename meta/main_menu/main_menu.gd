class_name MainMenu
extends Control
## Main menu (GAME_DESIGN.md section 12): continue a saved run, play, Shipyard, language toggle
## SK/EN. Android back asks before quitting (section 14).

var _quit_overlay: Control


func _ready() -> void:
	var column := UiKit.screen(self)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(UiKit.label("Iron Harbor", 128, UiKit.TEXT_COLOR, HORIZONTAL_ALIGNMENT_CENTER))
	var best := GameState.best_wave(GameState.DEFAULT_SECTOR)
	if best > 0:
		column.add_child(UiKit.label(tr("MENU_BEST_WAVE") % best, UiKit.TEXT_SIZE, UiKit.MUTED_COLOR,
				HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_spacer(60))
	var run := GameState.active_run()
	if not run.is_empty():
		var resume := UiKit.button(tr("MENU_CONTINUE") % int(run.get("wave", 1)),
				SceneRouter.start_battle.bind(str(run.get("sector", GameState.DEFAULT_SECTOR)), true),
				UiKit.HEADING_SIZE, true)
		resume.name = "Continue"
		column.add_child(resume)
	var play := UiKit.button(tr("MENU_PLAY"), SceneRouter.goto.bind(SceneRouter.SECTOR_SELECT),
			UiKit.HEADING_SIZE, run.is_empty())
	play.name = "Play"
	column.add_child(play)
	var shipyard := UiKit.button(tr("MENU_SHIPYARD"), SceneRouter.goto.bind(SceneRouter.SHIPYARD), UiKit.HEADING_SIZE)
	shipyard.name = "Shipyard"
	column.add_child(shipyard)
	var language := UiKit.button(tr("MENU_LANGUAGE"), _toggle_language)
	language.name = "Language"
	column.add_child(language)
	_quit_overlay = _build_quit_overlay()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST and _quit_overlay != null:
		_quit_overlay.visible = not _quit_overlay.visible


func _toggle_language() -> void:
	GameState.set_language("en" if GameState.language() == "sk" else "sk")
	SceneRouter.goto(SceneRouter.MAIN_MENU)


func _build_quit_overlay() -> Control:
	var overlay := ColorRect.new()
	overlay.name = "QuitOverlay"
	overlay.color = Color(0, 0, 0, 0.7)
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.visible = false
	add_child(overlay)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(center)
	var box := VBoxContainer.new()
	box.custom_minimum_size.x = 700.0
	box.add_theme_constant_override("separation", 32)
	center.add_child(box)
	box.add_child(UiKit.label(tr("MENU_QUIT_QUESTION"), UiKit.HEADING_SIZE, UiKit.TEXT_COLOR, HORIZONTAL_ALIGNMENT_CENTER))
	box.add_child(UiKit.button(tr("BUTTON_QUIT"), get_tree().quit))
	box.add_child(UiKit.button(tr("BUTTON_CANCEL"), func() -> void: overlay.visible = false))
	return overlay


static func _spacer(height: float) -> Control:
	var spacer := Control.new()
	spacer.custom_minimum_size.y = height
	return spacer
