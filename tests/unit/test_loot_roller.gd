extends GutTest
## LootRoller against GAME_DESIGN.md section 7: base × multiplier, rounded up; chances per table.

const CREDITS := LootRoller.ResourceType.CREDITS
const STEEL := LootRoller.ResourceType.STEEL
const ELECTRONICS := LootRoller.ResourceType.ELECTRONICS

var roller: LootRoller
var rng: RandomNumberGenerator


func before_each() -> void:
	roller = LootRoller.new(DataRegistry.loot_tables)
	rng = RandomNumberGenerator.new()
	rng.seed = 11


func test_credits_always_drop_and_round_up() -> void:
	assert_eq(roller.roll("light_small", 1.0, rng)[CREDITS], 2)
	assert_eq(roller.roll("light_small", 1.06, rng)[CREDITS], 3, "2 × 1.06 = 2.12 rounds up")
	assert_eq(roller.roll("armored", pow(1.06, 9), rng)[CREDITS], ceili(12 * pow(1.06, 9)))


func test_drop_chances_follow_the_tables() -> void:
	var counts := { "light_small": [0, 0], "armored": [0, 0], "air_small": [0, 0] }
	for i in 4000:
		for table: String in counts:
			var drops := roller.roll(table, 1.0, rng)
			if drops.has(STEEL):
				counts[table][0] += 1
			if drops.has(ELECTRONICS):
				counts[table][1] += 1
	assert_almost_eq(counts["light_small"][0] / 4000.0, 0.25, 0.03, "25 % steel from Light")
	assert_almost_eq(counts["armored"][0] / 4000.0, 0.60, 0.03, "60 % steel from Armored")
	assert_almost_eq(counts["light_small"][1] / 4000.0, 0.04, 0.015, "4 % electronics base")
	assert_almost_eq(counts["air_small"][1] / 4000.0, 0.10, 0.02, "10 % electronics from Air")


func test_resource_names_round_trip() -> void:
	for i in LootRoller.NAMES.size():
		assert_eq(LootRoller.resource_from_name(LootRoller.NAMES[i]), i)
	assert_eq(LootRoller.resource_from_name("gold"), -1)
