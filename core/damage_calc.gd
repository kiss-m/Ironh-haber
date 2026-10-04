class_name DamageCalc
extends RefCounted
## Damage formula (GAME_DESIGN.md section 4):
##
##   D = D_base · M_level · M_tier · M_perks · M_armor(type, armor) · (crit ? 2 : 1)
##
## Level, tier and perk multipliers are folded into the weapon's resolved damage (StatResolver,
## M2), so this class applies the armor multiplier and crits. Shields arrive in M5.

var crit_chance := 0.0
var crit_multiplier := 1.0

var _armor_count := CombatTypes.Armor.size()
## Flat lookup table indexed by damage_type * armor class count + armor.
var _armor_table := PackedFloat32Array()


## Builds the lookup table from balance.json's "armor_multipliers" and "crit" sections.
func _init(armor_multipliers: Dictionary, crit: Dictionary) -> void:
	crit_chance = float(crit.get("chance", 0.0))
	crit_multiplier = float(crit.get("multiplier", 1.0))
	_armor_table.resize(CombatTypes.DamageType.size() * _armor_count)
	_armor_table.fill(1.0)
	for type_name: String in armor_multipliers:
		var damage_type := CombatTypes.damage_type_from_name(type_name)
		var row: Dictionary = armor_multipliers[type_name]
		for armor_name: String in row:
			var armor := CombatTypes.armor_from_name(armor_name)
			if damage_type >= 0 and armor >= 0:
				_armor_table[damage_type * _armor_count + armor] = float(row[armor_name])


func armor_multiplier(damage_type: int, armor: int) -> float:
	return _armor_table[damage_type * _armor_count + armor]


func roll_crit(rng: RandomNumberGenerator) -> bool:
	return rng.randf() < crit_chance


## Final damage of one hit. `base_damage` is the weapon's resolved damage.
func final_damage(base_damage: float, damage_type: int, armor: int, is_crit: bool) -> float:
	var crit_factor := crit_multiplier if is_crit else 1.0
	return base_damage * armor_multiplier(damage_type, armor) * crit_factor
