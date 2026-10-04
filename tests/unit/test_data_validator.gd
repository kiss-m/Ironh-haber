extends GutTest
## DataValidator catches broken definitions with readable messages (section 10).


func _data() -> Dictionary:
	return {
		"weapons": DataRegistry.weapons.duplicate(true),
		"enemies": DataRegistry.enemies.duplicate(true),
		"balance": DataRegistry.balance.duplicate(true),
		"waves": DataRegistry.waves.duplicate(true),
	}


func _problems(data: Dictionary) -> String:
	return "\n".join(DataValidator.validate(data["weapons"], data["enemies"], data["balance"], data["waves"]))


func test_shipped_data_is_valid() -> void:
	assert_eq(_problems(_data()), "")


func test_unknown_behavior() -> void:
	var data := _data()
	data["enemies"]["patrol_boat"]["behavior"] = "teleport"
	assert_string_contains(_problems(data), "unknown behavior 'teleport'")


func test_negative_number() -> void:
	var data := _data()
	data["enemies"]["raider_skiff"]["hp"] = -5
	assert_string_contains(_problems(data), "enemies.json.raider_skiff.hp: negative number")


func test_unknown_torpedo_reference() -> void:
	var data := _data()
	data["enemies"].erase("enemy_torpedo")
	assert_string_contains(_problems(data), "references unknown enemy 'enemy_torpedo'")


func test_missing_field_and_bad_group_size() -> void:
	var data := _data()
	data["enemies"]["attack_drone"].erase("radius")
	data["enemies"]["attack_drone"]["group_size"] = [5, 2]
	var problems := _problems(data)
	assert_string_contains(problems, "'attack_drone': missing \"radius\"")
	assert_string_contains(problems, "group_size must be [min, max]")


func test_unknown_loadout_weapon() -> void:
	var data := _data()
	data["balance"]["starting_loadout"] = ["railgun"]
	assert_string_contains(_problems(data), "unknown weapon 'railgun'")


func test_formations_keep_groups_behind_their_anchor() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	for formation: String in DataRegistry.waves["formations"]:
		var offsets := Formations.offsets(formation, 5, DataRegistry.waves["formations"][formation], rng)
		assert_eq(offsets.size(), 5, formation)
		for offset in offsets:
			assert_true(offset.x <= 0.0, "%s offset %s" % [formation, offset])
	var line := Formations.offsets("line", 3, {"spacing": 60}, rng)
	assert_eq(line[0].distance_to(line[1]), 60.0)
