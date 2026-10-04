class_name SaveStore
extends RefCounted
## Atomic, versioned JSON save file (GAME_DESIGN.md section 11):
##
## - write to <path>.tmp, move the current file to <path>.bak, then rename the .tmp over <path>;
## - on load, fall back to the .bak if the main file is missing or does not parse;
## - SaveMigrator upgrades older versions step by step.

var path := ""


func _init(p_path: String) -> void:
	path = p_path


func backup_path() -> String:
	return path.get_basename() + ".bak"


func temp_path() -> String:
	return path.get_basename() + ".tmp"


## Writes `data` atomically. Returns OK or the first error.
func write(data: Dictionary) -> Error:
	var tmp := FileAccess.open(temp_path(), FileAccess.WRITE)
	if tmp == null:
		return FileAccess.get_open_error()
	tmp.store_string(JSON.stringify(data, "  "))
	tmp.close()
	var dir := DirAccess.open(path.get_base_dir())
	if dir == null:
		return DirAccess.get_open_error()
	if FileAccess.file_exists(path):
		if FileAccess.file_exists(backup_path()):
			dir.remove(backup_path())
		var err := dir.rename(path, backup_path())
		if err != OK:
			return err
	return dir.rename(temp_path(), path)


## Reads the save, migrated to the current version. Returns {} when there is no usable save.
func read() -> Dictionary:
	for candidate in [path, backup_path()]:
		var data := _parse(candidate)
		if not data.is_empty():
			return SaveMigrator.migrate(data)
	return {}


func delete_all() -> void:
	for candidate in [path, backup_path(), temp_path()]:
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(candidate)


static func _parse(file_path: String) -> Dictionary:
	if not FileAccess.file_exists(file_path):
		return {}
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(file_path)) != OK:
		return {}
	var parsed: Variant = json.data
	if parsed is Dictionary and (parsed as Dictionary).has("version"):
		return parsed
	return {}
