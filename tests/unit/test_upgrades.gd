extends GutTest
## Upgrade tracks against GAME_DESIGN.md sections 4, 7 and 8.

var upgrades: Upgrades


func before_each() -> void:
	upgrades = Upgrades.new(DataRegistry.upgrades, DataRegistry.weapons)


func _value(key: String, level: int) -> float:
	return float(upgrades.track_modifiers(key, level)[0]["value"])


func test_cost_formula_rounds_up() -> void:
	assert_eq(Upgrades.formula_cost(30, 1.17, 0), 30)
	assert_eq(Upgrades.formula_cost(30, 1.17, 1), 36, "35.1 rounds up")
	assert_eq(Upgrades.formula_cost(20, 1.17, 10), ceili(20 * pow(1.17, 10)))


func test_steel_from_level_5_and_electronics_from_level_15() -> void:
	var key := "weapon.machine_gun.dmg"
	assert_eq(upgrades.cost(key, 0), {"credits": 20})
	assert_eq(upgrades.cost(key, 4).keys(), ["credits"])
	assert_eq(upgrades.cost(key, 5).keys(), ["credits", "steel"])
	assert_eq(upgrades.cost(key, 15).keys(), ["credits", "steel", "electronics"])


func test_turret_slots_use_listed_costs_and_cores() -> void:
	assert_eq(upgrades.cost("fortress.slots", 0), {"credits": 150, "steel": 10})
	assert_eq(upgrades.cost("fortress.slots", 2), {"cores": 1})
	assert_eq(upgrades.cost("fortress.slots", 5), {"cores": 4})


func test_modifier_values_follow_the_design() -> void:
	assert_almost_eq(_value("weapon.machine_gun.dmg", 3), pow(1.12, 3), 0.0001, "+12 % compounding")
	assert_almost_eq(_value("weapon.machine_gun.rate", 10), 1.4, 0.0001, "+4 % per level")
	assert_almost_eq(_value("fortress.hull", 2), 1.08 * 1.08, 0.0001, "+8 % compounding")
	assert_almost_eq(_value("fortress.armor", 7), -0.07, 0.0001, "−1 % incoming damage per level")
	assert_almost_eq(_value("salvage.flotation", 4), 4.0, 0.0001, "+1 s per level")
	assert_eq(upgrades.track_modifiers("fortress.hull", 0), [])
	assert_eq(upgrades.track_modifiers("weapon.naval_cannon.dmg", 1)[0]["filter"], {"weapon": "naval_cannon"})


func test_damage_needs_a_tier_up_every_ten_levels() -> void:
	var rich := {"credits": 1000000, "steel": 1000000, "electronics": 1000000}
	var key := "weapon.machine_gun.dmg"
	assert_eq(upgrades.block(key, {key: 9}, rich, 0), Upgrades.Block.NONE)
	assert_eq(upgrades.block(key, {key: 10}, rich, 0), Upgrades.Block.NEEDS_TIER)
	assert_eq(upgrades.block(key, {key: 10, "weapon.machine_gun.tier": 1}, rich, 0), Upgrades.Block.NONE)


func test_blocks_for_max_level_price_and_unlock_wave() -> void:
	assert_eq(upgrades.block("fortress.slots", {"fortress.slots": 6}, {}, 0), Upgrades.Block.MAX_LEVEL)
	assert_eq(upgrades.block("fortress.hull", {}, {"credits": 29}, 0), Upgrades.Block.TOO_EXPENSIVE)
	assert_eq(upgrades.block("fortress.hull", {}, {"credits": 30}, 0), Upgrades.Block.NONE)
	var data := DataRegistry.upgrades.duplicate(true)
	data["tracks"]["fortress.hull"]["unlock"] = {"best_wave": 25}
	var locked := Upgrades.new(data, DataRegistry.weapons)
	assert_eq(locked.block("fortress.hull", {}, {"credits": 999}, 24), Upgrades.Block.LOCKED)
	assert_eq(locked.block("fortress.hull", {}, {"credits": 999}, 25), Upgrades.Block.NONE)


func test_every_weapon_gets_its_tracks() -> void:
	for weapon_id: String in DataRegistry.weapons:
		for track in ["dmg", "range", "turn", "tier", "special"]:
			assert_true(upgrades.tracks.has("weapon.%s.%s" % [weapon_id, track]), "%s %s" % [weapon_id, track])
		var has_rate: bool = DataRegistry.weapon(weapon_id)["base"].has("fire_rate")
		assert_eq(upgrades.tracks.has("weapon.%s.rate" % weapon_id), has_rate, "%s rate" % weapon_id)
	assert_false(upgrades.tracks.has("weapon.laser.rate"), "the laser has no fire rate to upgrade")


func test_boss_unlocks() -> void:
	var key := "fortress.dual_command"
	assert_eq(upgrades.block(key, {}, {"cores": 9}, 99, 0), Upgrades.Block.LOCKED)
	assert_eq(upgrades.block(key, {}, {"cores": 9}, 99, 1), Upgrades.Block.NONE)
