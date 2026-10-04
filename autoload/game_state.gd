extends Node
## Permanent player data: resources, upgrades, unlocks, settings and the save file
## (GAME_DESIGN.md section 11). Run-only data lives in RunState, and only SalvageSystem
## writes resources here. Stub for M0; saving and the save format arrive in M4.

const SAVE_PATH := "user://save.json"
