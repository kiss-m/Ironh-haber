extends Node
## Swaps screens: Splash → Main Menu → Sector Select → Battle → Results → Shipyard
## (GAME_DESIGN.md section 12). Stub for M0; transitions arrive with the meta screens in M4.


func goto(scene_path: String) -> void:
	get_tree().change_scene_to_file.call_deferred(scene_path)
