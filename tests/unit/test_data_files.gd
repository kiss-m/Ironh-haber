extends GutTest
## Every data file parses (catches broken JSON before export, GAME_DESIGN.md section 10), and the
## M1 definitions match the design tables.


func test_every_data_file_parses() -> void:
	var files := DirAccess.get_files_at("res://data/")
	assert_true(files.size() > 0, "data files exist")
	for file_name in files:
		if not file_name.ends_with(".json"):
			continue
		var problems := PackedStringArray()
		assert_not_null(DataRegistry.read_json("res://data/" + file_name, problems), file_name)
		assert_eq(problems.size(), 0, "\n".join(problems))


func test_registry_loaded_without_errors() -> void:
	assert_eq(DataRegistry.errors.size(), 0, "\n".join(DataRegistry.errors))


func test_machine_gun_matches_design() -> void:
	var gun := DataRegistry.weapon("machine_gun")
	var base: Dictionary = gun["base"]
	assert_eq(gun["damage_type"], "kinetic")
	assert_eq(gun["domains"], ["surface", "air"])
	assert_eq(float(base["damage"]), 6.0)
	assert_eq(float(base["fire_rate"]), 8.0)
	assert_eq(float(base["range"]), 550.0)
	assert_eq(float(base["turn_speed"]), 360.0)
	assert_eq(float(base["spread"]), 4.0)


func test_raider_skiff_matches_design() -> void:
	var skiff := DataRegistry.enemy("raider_skiff")
	assert_eq(skiff["domain"], "surface")
	assert_eq(skiff["armor"], "light")
	assert_eq(float(skiff["hp"]), 20.0)
	assert_eq(float(skiff["speed"]), 120.0)
	assert_eq(float(skiff["attack"]["damage"]), 5.0)
	assert_eq(skiff["behavior"], "ram")


func test_naval_cannon_matches_design() -> void:
	var cannon := DataRegistry.weapon("naval_cannon")
	var base: Dictionary = cannon["base"]
	assert_eq(cannon["damage_type"], "explosive")
	assert_eq(cannon["domains"], ["surface"])
	assert_eq(float(base["damage"]), 45.0)
	assert_eq(float(base["fire_rate"]), 0.8)
	assert_eq(float(base["range"]), 800.0)
	assert_eq(float(base["turn_speed"]), 90.0)
	assert_eq(float(base["splash_radius"]), 60.0)


func test_first_enemy_types_match_design() -> void:
	# [domain, armor, hp, speed, budget cost, first wave] from the section 5 table
	var expected := {
		"raider_skiff": ["surface", "light", 20, 120, 1, 1],
		"patrol_boat": ["surface", "light", 60, 70, 3, 3],
		"attack_drone": ["air", "light", 12, 200, 0.4, 5],
		"torpedo_boat": ["surface", "light", 80, 90, 5, 8],
		"armored_gunboat": ["surface", "armored", 200, 50, 8, 12],
	}
	for id: String in expected:
		var row: Array = expected[id]
		var def := DataRegistry.enemy(id)
		assert_eq([def["domain"], def["armor"], float(def["hp"]), float(def["speed"]),
				float(def["budget_cost"]), int(def["first_wave"])],
				[row[0], row[1], float(row[2]), float(row[3]), float(row[4]), int(row[5])], id)


func test_fortress_matches_design() -> void:
	var fortress: Dictionary = DataRegistry.balance["fortress"]
	assert_eq(float(fortress["radius"]), 140.0)
	assert_eq(float(fortress["base_hp"]), 100.0)


func test_translations_exist_in_both_languages() -> void:
	for locale in ["sk", "en"]:
		var translation := TranslationServer.get_translation_object(locale)
		assert_not_null(translation, locale)
		if translation != null:
			assert_ne(translation.get_message("BUTTON_RETRY"), "", "%s has BUTTON_RETRY" % locale)
