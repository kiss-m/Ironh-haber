extends GutTest
## StatResolver: (base + Σ add) × Π mul, set, caps, filters and cache invalidation (section 10).

const GUN := {"weapon": "machine_gun"}

var resolver: StatResolver


func before_each() -> void:
	resolver = StatResolver.new({"weapon.fire_rate": {"max_mul": 2.5}, "fortress.armor": {"max": 0.5}})


func _mod(stat: String, op: String, value: float, filter := {}) -> Dictionary:
	return {"stat": stat, "op": op, "value": value, "filter": filter}


func test_no_modifiers_returns_base() -> void:
	assert_eq(resolver.resolve("weapon.damage", 6.0, GUN), 6.0)


func test_adds_then_multiplies() -> void:
	resolver.set_modifiers([
		_mod("weapon.damage", "mul", 1.5),
		_mod("weapon.damage", "add", 4.0),
		_mod("weapon.damage", "mul", 2.0),
	])
	assert_almost_eq(resolver.resolve("weapon.damage", 6.0, GUN), (6.0 + 4.0) * 3.0, 0.0001)


func test_set_replaces_the_result() -> void:
	resolver.set_modifiers([_mod("weapon.damage", "mul", 3.0), _mod("weapon.damage", "set", 1.0)])
	assert_eq(resolver.resolve("weapon.damage", 6.0, GUN), 1.0)


func test_filters_limit_modifiers_to_matching_context() -> void:
	resolver.set_modifiers([_mod("weapon.damage", "mul", 2.0, {"weapon": "naval_cannon"})])
	assert_eq(resolver.resolve("weapon.damage", 6.0, GUN), 6.0)
	assert_eq(resolver.resolve("weapon.damage", 45.0, {"weapon": "naval_cannon"}), 90.0)


func test_caps_apply_last() -> void:
	resolver.set_modifiers([_mod("weapon.fire_rate", "mul", 10.0), _mod("fortress.armor", "add", 0.9)])
	assert_almost_eq(resolver.resolve("weapon.fire_rate", 8.0, GUN), 20.0, 0.0001, "capped at ×2.5")
	assert_almost_eq(resolver.resolve("fortress.armor", 0.0), 0.5, 0.0001, "capped at 50 %")


func test_cache_is_invalidated_when_modifiers_change() -> void:
	watch_signals(resolver)
	assert_eq(resolver.resolve("weapon.damage", 6.0, GUN), 6.0)
	resolver.add_modifier(_mod("weapon.damage", "mul", 1.12))
	assert_almost_eq(resolver.resolve("weapon.damage", 6.0, GUN), 6.72, 0.0001)
	assert_signal_emitted(resolver, "changed")


func test_turret_refreshes_its_stats_when_modifiers_change() -> void:
	var turret: Turret = autofree(Turret.new())
	turret.setup(DataRegistry.weapon("machine_gun"), resolver, 4.0)
	assert_eq(turret.damage, 6.0)
	resolver.add_modifier(_mod("weapon.damage", "mul", 2.0, GUN))
	assert_eq(turret.damage, 12.0)
