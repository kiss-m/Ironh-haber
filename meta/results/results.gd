class_name Results
extends Control
## Results after a run (GAME_DESIGN.md section 12): wave reached, new best, kills, time and the
## resources banked per type, with buttons to the Shipyard and to retry the sector. Milestone
## rewards join in M6.


func _ready() -> void:
	var summary := GameState.last_run
	var column := UiKit.screen(self)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(UiKit.label(tr("RESULTS_TITLE"), UiKit.TITLE_SIZE, UiKit.TEXT_COLOR, HORIZONTAL_ALIGNMENT_CENTER))
	var wave := UiKit.label(tr("RESULTS_WAVE") % int(summary.get("wave", 0)), UiKit.HEADING_SIZE,
			UiKit.TEXT_COLOR, HORIZONTAL_ALIGNMENT_CENTER)
	wave.name = "Wave"
	column.add_child(wave)
	if summary.get("new_best", false):
		column.add_child(UiKit.label(tr("RESULTS_NEW_BEST"), UiKit.HEADING_SIZE, UiKit.ACCENT_COLOR,
				HORIZONTAL_ALIGNMENT_CENTER))
	var seconds := int(summary.get("time", 0.0))
	column.add_child(UiKit.label(tr("RESULTS_KILLS_TIME") % [int(summary.get("kills", 0)),
			"%d:%02d" % [floori(seconds / 60.0), seconds % 60]], UiKit.TEXT_SIZE, UiKit.MUTED_COLOR,
			HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(UiKit.label(tr("RESULTS_BANKED"), UiKit.TEXT_SIZE, UiKit.TEXT_COLOR, HORIZONTAL_ALIGNMENT_CENTER))
	var banked: Dictionary = summary.get("banked", {})
	var row := UiKit.resource_row({
		"credits": banked.get("credits", 0),
		"steel": banked.get("steel", 0),
		"electronics": banked.get("electronics", 0),
	}, UiKit.HEADING_SIZE)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(row)
	var spacer := Control.new()
	spacer.custom_minimum_size.y = 60.0
	column.add_child(spacer)
	var shipyard := UiKit.button(tr("MENU_SHIPYARD"), SceneRouter.goto.bind(SceneRouter.SHIPYARD), UiKit.HEADING_SIZE, true)
	shipyard.name = "Shipyard"
	column.add_child(shipyard)
	var retry := UiKit.button(tr("BUTTON_RETRY"),
			SceneRouter.start_battle.bind(str(summary.get("sector", GameState.DEFAULT_SECTOR))), UiKit.HEADING_SIZE)
	retry.name = "Retry"
	column.add_child(retry)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		SceneRouter.goto(SceneRouter.SHIPYARD)
