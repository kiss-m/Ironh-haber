extends Node
## Permanent player data: resources, upgrades, unlocks, settings and the save file
## (GAME_DESIGN.md section 11). Run-only data lives in RunState, and only SalvageSystem
## writes resources here. Saving and the save format arrive in M4.

const SAVE_PATH := "user://save.json"
## Slovak is the default language (section 12); the saved setting overrides it from M4.
const DEFAULT_LANGUAGE := "sk"


func _ready() -> void:
	TranslationServer.set_locale(DEFAULT_LANGUAGE)
