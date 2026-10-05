class_name UpgradeEffects
extends RefCounted
## Turns an upgrade track into the Shipyard's "effect now → next" text (GAME_DESIGN.md section 12):
## the real value of the track's first stat with every other owned upgrade applied.


## Value of the track's main stat with the track at `level` and all other levels as owned.
static func value_at(key: String, level: int) -> float:
	var track := GameState.upgrades.track(key)
	var stat := str(track.modifiers[0]["stat"])
	var levels := GameState.upgrade_levels().duplicate()
	levels[key] = level
	var resolver := StatResolver.new(DataRegistry.balance["stat_caps"])
	resolver.set_modifiers(GameState.upgrades.modifiers(levels))
	var context := { "weapon": track.weapon_id } if track.weapon_id != "" else {}
	return resolver.resolve(stat, base_value(stat, track.weapon_id), context)


static func describe(key: String, level: int) -> String:
	var track := GameState.upgrades.track(key)
	return format(str(track.modifiers[0]["stat"]), value_at(key, level))


static func base_value(stat: String, weapon_id: String) -> float:
	var balance := DataRegistry.balance
	var parts := stat.split(".")
	match parts[0]:
		"weapon":
			return float(DataRegistry.weapon(weapon_id)["base"].get(parts[1], 0.0))
		"boat":
			return float(balance["salvage_boat"][parts[1]])
	match stat:
		"fortress.max_hp":
			return float(balance["fortress"]["base_hp"])
		"fortress.damage_taken":
			return 1.0
		"fortress.regen":
			return float(balance["fortress"]["regen"])
		"fortress.turret_slots":
			return float(balance["fortress"]["turret_slots"])
		"loot.float_time":
			return float(balance["loot"]["float_time"])
		"fortress.shield", "fortress.auto_targeting", "fortress.radar", "fortress.dual_command":
			return 0.0
	push_error("No base value for stat '%s'" % stat)
	return 0.0


static func format(stat: String, value: float) -> String:
	match stat:
		"weapon.damage":
			return "%.1f" % value
		"weapon.fire_rate":
			return "%.2f/s" % value
		"weapon.turn_speed":
			return "%d°/s" % roundi(value)
		"weapon.spread":
			return "%.1f°" % value
		"weapon.range", "weapon.splash_radius", "boat.pickup_radius":
			return "%d px" % roundi(value)
		"fortress.max_hp", "boat.hp":
			return "%d HP" % roundi(value)
		"fortress.damage_taken":
			return "−%d %%" % roundi((1.0 - value) * 100.0)
		"fortress.regen":
			return "%.2f HP/s" % value
		"boat.speed":
			return "%d px/s" % roundi(value)
		"loot.float_time":
			return "%d s" % roundi(value)
		"fortress.shield":
			return "%d %% HP" % roundi(value * 100.0)
		"fortress.auto_targeting":
			return "%d %%" % roundi(AutoTargeting.share(roundi(value), DataRegistry.balance["auto_targeting"]) * 100.0)
		"fortress.dual_command":
			return TranslationServer.translate("EFFECT_ON") if value >= 1.0 else TranslationServer.translate("EFFECT_OFF")
		"weapon.charge_time":
			return "%.2f s" % value
		"weapon.heat_capacity", "weapon.cooldown":
			return "%.1f s" % value
	return str(roundi(value))
