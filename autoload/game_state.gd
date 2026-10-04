extends Node
## Permanent player data: resources, upgrades, unlocks, settings and the save file
## (GAME_DESIGN.md section 11). Run-only data lives in RunState, and only SalvageSystem
## writes resources here, when the boat unloads. Saving and the save format arrive in M4; until
## then resources last for the app session.

const SAVE_PATH := "user://save.json"
## Slovak is the default language (section 12); the saved setting overrides it from M4.
const DEFAULT_LANGUAGE := "sk"

## Banked resources by name: credits, steel, electronics, cores.
var resources: Dictionary = { "credits": 0, "steel": 0, "electronics": 0, "cores": 0 }


func _ready() -> void:
	TranslationServer.set_locale(DEFAULT_LANGUAGE)


## Adds banked resources. `delta` maps resource names to amounts.
func add_resources(delta: Dictionary) -> void:
	for resource_name: String in delta:
		resources[resource_name] = int(resources.get(resource_name, 0)) + int(delta[resource_name])
