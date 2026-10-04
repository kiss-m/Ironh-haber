extends GutTest
## DamageCalc and CombatTypes against GAME_DESIGN.md section 4.

const Kinetic := CombatTypes.DamageType.KINETIC
const Explosive := CombatTypes.DamageType.EXPLOSIVE
const Energy := CombatTypes.DamageType.ENERGY
const Light := CombatTypes.Armor.LIGHT
const Armored := CombatTypes.Armor.ARMORED
const Shield := CombatTypes.Armor.SHIELD

var calc: DamageCalc


func before_each() -> void:
	calc = DamageCalc.new(DataRegistry.balance["armor_multipliers"], DataRegistry.balance["crit"])


func test_armor_table_matches_design() -> void:
	var expected := {
		Kinetic: [1.0, 0.5, 0.75],
		Explosive: [1.0, 1.25, 0.75],
		Energy: [0.9, 1.0, 1.5],
	}
	for damage_type: int in expected:
		var row: Array = expected[damage_type]
		for armor in [Light, Armored, Shield]:
			assert_almost_eq(calc.armor_multiplier(damage_type, armor), float(row[armor]), 0.0001,
					"type %d vs armor %d" % [damage_type, armor])


func test_base_crit_is_five_percent_for_double_damage() -> void:
	assert_almost_eq(calc.crit_chance, 0.05, 0.0001)
	assert_almost_eq(calc.crit_multiplier, 2.0, 0.0001)


func test_final_damage_applies_armor_and_crit() -> void:
	assert_almost_eq(calc.final_damage(6.0, Kinetic, Light, false), 6.0, 0.0001)
	assert_almost_eq(calc.final_damage(6.0, Kinetic, Armored, false), 3.0, 0.0001)
	assert_almost_eq(calc.final_damage(45.0, Explosive, Armored, true), 112.5, 0.0001)


func test_crit_rolls_follow_the_chance() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var crits := 0
	for i in 10000:
		if calc.roll_crit(rng):
			crits += 1
	assert_between(crits, 400, 600, "about 5 % of 10 000 rolls")


func test_combat_type_names_parse() -> void:
	assert_eq(CombatTypes.damage_type_from_name("explosive"), Explosive)
	assert_eq(CombatTypes.armor_from_name("shield"), Shield)
	assert_eq(CombatTypes.domain_mask(["surface", "air"]), CombatTypes.DOMAIN_SURFACE | CombatTypes.DOMAIN_AIR)
