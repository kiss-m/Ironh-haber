extends GutHookScript
## Runs before the suite: points GameState at a throwaway save file and starts from a fresh
## player, so tests never read or overwrite a real save.

const TEST_SAVE_PATH := "user://test_save.json"


func run() -> void:
	GameState.save_path = TEST_SAVE_PATH
	SaveStore.new(TEST_SAVE_PATH).delete_all()
	GameState.reset()
