class_name CombatTypes
extends RefCounted
## Enums shared by the combat rules (GAME_DESIGN.md sections 4 and 5). Data files use lowercase
## names; they are converted once when a definition is loaded, so per-frame code compares ints.

enum DamageType { KINETIC, EXPLOSIVE, ENERGY }
enum Armor { LIGHT, ARMORED, SHIELD }

## Domain bit flags: a weapon hits every domain in its mask, an enemy is in exactly one domain.
const DOMAIN_SURFACE := 1
const DOMAIN_SUBMERGED := 2
const DOMAIN_AIR := 4

const _DOMAINS := { "surface": DOMAIN_SURFACE, "submerged": DOMAIN_SUBMERGED, "air": DOMAIN_AIR }


## Returns the DamageType for a data name such as "kinetic", or -1 if it is unknown.
static func damage_type_from_name(type_name: String) -> int:
	return _parse_enum(DamageType, type_name, "damage type")


## Returns the Armor class for a data name such as "armored", or -1 if it is unknown.
static func armor_from_name(armor_name: String) -> int:
	return _parse_enum(Armor, armor_name, "armor class")


## Returns the domain flag for "surface", "submerged" or "air", or 0 if it is unknown.
static func domain_from_name(domain_name: String) -> int:
	if not _DOMAINS.has(domain_name):
		push_error("Unknown domain '%s'" % domain_name)
		return 0
	return _DOMAINS[domain_name]


## Combines a list of domain names into one bit mask.
static func domain_mask(domain_names: Array) -> int:
	var mask := 0
	for domain_name: String in domain_names:
		mask |= domain_from_name(domain_name)
	return mask


static func _parse_enum(names: Dictionary, value: String, what: String) -> int:
	var key := value.to_upper()
	if not names.has(key):
		push_error("Unknown %s '%s'" % [what, value])
		return -1
	return names[key]
