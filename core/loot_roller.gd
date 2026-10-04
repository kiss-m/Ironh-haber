class_name LootRoller
extends RefCounted
## Rolls what a destroyed enemy drops (GAME_DESIGN.md section 7):
##
##   amount = base amount from the enemy's loot table × L(w) × sector multiplier × perk multiplier,
##   rounded up
##
## Credits always drop; steel, electronics and cores drop with the table's chance. Elites (3× loot,
## always electronics) arrive in M5, sector multipliers in M6.

enum ResourceType { CREDITS, STEEL, ELECTRONICS, CORES }

## Data and save-file names of the resources, indexed by ResourceType.
const NAMES: PackedStringArray = ["credits", "steel", "electronics", "cores"]

var _tables: Dictionary = {}


func _init(loot_tables: Dictionary) -> void:
	_tables = loot_tables


static func resource_from_name(resource_name: String) -> int:
	return NAMES.find(resource_name)


## Returns {ResourceType: amount} with only the resources that drop. `multiplier` is
## L(w) × sector × perk multipliers.
func roll(table_id: String, multiplier: float, rng: RandomNumberGenerator) -> Dictionary:
	var drops := {}
	if not _tables.has(table_id):
		push_error("Unknown loot table '%s'" % table_id)
		return drops
	var table: Dictionary = _tables[table_id]
	for resource in NAMES.size():
		var entry: Variant = table.get(NAMES[resource])
		if entry == null:
			continue
		var base := 0.0
		if entry is Dictionary:
			if rng.randf() >= float(entry.get("chance", 1.0)):
				continue
			base = float(entry.get("amount", 0.0))
		else:
			base = float(entry)
		var amount := ceili(base * multiplier - 0.000001)
		if amount > 0:
			drops[resource] = amount
	return drops
