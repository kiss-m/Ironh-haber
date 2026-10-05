extends GutTest
## EliteRules against GAME_DESIGN.md section 5.

var config: Dictionary


func before_each() -> void:
	config = DataRegistry.balance["elites"]


func test_chance_by_wave() -> void:
	assert_eq(EliteRules.chance(14, config), 0.0, "no elites before wave 15")
	assert_almost_eq(EliteRules.chance(15, config), 0.02, 0.0001)
	assert_almost_eq(EliteRules.chance(25, config), 0.07, 0.0001, "2 % + 0.5 % per wave above 15")
	assert_almost_eq(EliteRules.chance(200, config), 0.35, 0.0001, "capped at 35 %")


func test_rolls_follow_the_chance_and_use_every_modifier() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var elites := 0
	var seen := {}
	for i in 20000:
		var result := EliteRules.roll(75, config, rng)
		if result != Enemy.Elite.NONE:
			elites += 1
			seen[result] = true
	assert_almost_eq(elites / 20000.0, 0.32, 0.015, "wave 75: 2 % + 30 %")
	assert_eq(seen.size(), 5, "Armored, Fast, Regenerating, Shielded, Splitting")
