extends Node
## Loads the JSON files under res://data/ once at startup (GAME_DESIGN.md section 10).
##
## Entity files (weapons, enemies) are arrays of definitions with unique "id"s and are indexed by
## id. Other files are single objects. M1 reports parse errors and duplicate or missing ids; full
## reference validation and the remaining files arrive in M2.

const DATA_DIR := "res://data/"

var weapons: Dictionary = {}
var enemies: Dictionary = {}
var balance: Dictionary = {}
var waves: Dictionary = {}
## Problems found by the last load_all(); each one is also reported with push_error().
var errors: PackedStringArray = []


func _ready() -> void:
	load_all()


func load_all() -> void:
	errors.clear()
	weapons = _load_definitions("weapons.json")
	enemies = _load_definitions("enemies.json")
	balance = _load_object("balance.json")
	waves = _load_object("waves.json")
	for message in errors:
		push_error(message)


func weapon(id: String) -> Dictionary:
	if not weapons.has(id):
		push_error("Unknown weapon id '%s'" % id)
		return {}
	return weapons[id]


func enemy(id: String) -> Dictionary:
	if not enemies.has(id):
		push_error("Unknown enemy id '%s'" % id)
		return {}
	return enemies[id]


## Parses one JSON file. Returns null and appends a readable message to `problems` on failure.
static func read_json(path: String, problems: PackedStringArray) -> Variant:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		problems.append("%s: cannot open (%s)" % [path, error_string(FileAccess.get_open_error())])
		return null
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		problems.append("%s:%d: %s" % [path, json.get_error_line(), json.get_error_message()])
		return null
	return json.data


func _load_object(file_name: String) -> Dictionary:
	var data: Variant = read_json(DATA_DIR + file_name, errors)
	if data == null:
		return {}
	if not data is Dictionary:
		errors.append("%s: expected a JSON object" % file_name)
		return {}
	return data


func _load_definitions(file_name: String) -> Dictionary:
	var data: Variant = read_json(DATA_DIR + file_name, errors)
	if data == null:
		return {}
	if not data is Array:
		errors.append("%s: expected a JSON array of definitions" % file_name)
		return {}
	var by_id := {}
	for entry: Variant in data:
		if not entry is Dictionary or not (entry as Dictionary).has("id"):
			errors.append("%s: every definition needs an \"id\"" % file_name)
			continue
		var id := str(entry["id"])
		if by_id.has(id):
			errors.append("%s: duplicate id '%s'" % [file_name, id])
		by_id[id] = entry
	return by_id
