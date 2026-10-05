extends Node
## Swaps screens (GAME_DESIGN.md section 12). Flow: Splash → Main Menu → Sector Select → Battle →
## Results → Shipyard → Sector Select, with the Shipyard as the hub after every run.

const MAIN_MENU := "res://meta/main_menu/main_menu.tscn"
const SECTOR_SELECT := "res://meta/sector_select/sector_select.tscn"
const SHIPYARD := "res://meta/shipyard/shipyard.tscn"
const RESULTS := "res://meta/results/results.tscn"
const BATTLE := "res://battle/battle.tscn"


func goto(scene_path: String) -> void:
	get_tree().paused = false
	get_tree().change_scene_to_file.call_deferred(scene_path)


## Starts a battle: a new run in `sector_id`, or the saved run snapshot when `resume` is set.
func start_battle(sector_id: String, resume := false) -> void:
	GameState.pending_run = GameState.active_run() if resume else { "sector": sector_id }
	if not resume:
		GameState.data["active_run"] = null
	goto(BATTLE)


## Starts a new run at `wave` instead of wave 1 (test build only, see Sandbox).
func start_battle_at(sector_id: String, wave: int) -> void:
	start_battle(sector_id)
	GameState.pending_run["start_wave"] = wave
