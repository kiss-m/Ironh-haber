class_name SectorSelect
extends Control
## Sector select (GAME_DESIGN.md sections 8 and 12): one card per sector with best wave,
## multipliers, twist and the lock reason. Starting a sector begins a new run (any saved run
## snapshot is dropped). Sector twists and multipliers take effect in M6.


func _ready() -> void:
	var column := UiKit.screen(self)
	column.add_child(UiKit.label(tr("SECTOR_SELECT_TITLE"), UiKit.TITLE_SIZE))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	var cards := VBoxContainer.new()
	cards.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cards.add_theme_constant_override("separation", 24)
	scroll.add_child(cards)
	for id: String in DataRegistry.sectors:
		cards.add_child(_card(id, DataRegistry.sectors[id]))
	column.add_child(UiKit.button(tr("BUTTON_BACK"), SceneRouter.goto.bind(SceneRouter.MAIN_MENU)))


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		SceneRouter.goto(SceneRouter.MAIN_MENU)


## Test build: buttons to start a run at a later wave.
func _start_waves(id: String) -> Control:
	var grid := GridContainer.new()
	grid.name = "StartWaves"
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	for wave: Variant in DataRegistry.balance["sandbox"]["start_waves"]:
		var button := UiKit.button(tr("SANDBOX_START_WAVE") % int(wave),
				SceneRouter.start_battle_at.bind(id, int(wave)), UiKit.SMALL_SIZE)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(button)
	return grid


func _card(id: String, sector: Dictionary) -> Control:
	var unlocked := GameState.sector_unlocked(id)
	var card := UiKit.panel(UiKit.PANEL_COLOR if unlocked else UiKit.PANEL_LOCKED_COLOR)
	card.name = "Sector_" + id
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	card.add_child(box)
	box.add_child(UiKit.label(tr(str(sector["name_key"])), UiKit.HEADING_SIZE,
			UiKit.TEXT_COLOR if unlocked else UiKit.MUTED_COLOR))
	box.add_child(UiKit.label(tr("SECTOR_MULTIPLIERS") % [float(sector["enemy_hp"]), float(sector["loot"])],
			UiKit.SMALL_SIZE, UiKit.MUTED_COLOR))
	box.add_child(UiKit.label(tr(str(sector["twist_key"])), UiKit.SMALL_SIZE, UiKit.MUTED_COLOR))
	if unlocked:
		box.add_child(UiKit.label(tr("SECTOR_BEST_WAVE") % GameState.best_wave(id), UiKit.TEXT_SIZE))
		var play := UiKit.button(tr("MENU_PLAY"), SceneRouter.start_battle.bind(id), UiKit.HEADING_SIZE, true)
		play.name = "Play"
		box.add_child(play)
		if Sandbox.enabled():
			box.add_child(_start_waves(id))
	else:
		var unlock: Dictionary = sector["unlock"]
		var after: Dictionary = DataRegistry.sectors[str(unlock["sector"])]
		box.add_child(UiKit.label(tr("SECTOR_LOCKED") % [int(unlock["wave"]), tr(str(after["name_key"]))],
				UiKit.TEXT_SIZE, UiKit.BAD_COLOR))
	return card
