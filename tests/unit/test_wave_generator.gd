extends GutTest
## WaveScaling and WaveGenerator against GAME_DESIGN.md section 6.

var generator: WaveGenerator


func before_each() -> void:
	generator = WaveGenerator.new(DataRegistry.enemies, DataRegistry.waves)


func _signature(groups: Array[WaveGenerator.Group]) -> Array:
	var result := []
	for group in groups:
		result.append([group.enemy_id, group.count, group.formation, group.edge, snappedf(group.time, 0.001)])
	return result


func _cost(groups: Array[WaveGenerator.Group]) -> float:
	var total := 0.0
	for group in groups:
		total += float(DataRegistry.enemy(group.enemy_id)["budget_cost"]) * group.count
	return total


## Cost of the smallest group any unlocked type can field.
func _cheapest_group(wave: int) -> float:
	var cheapest := INF
	for id: String in generator.weights(wave):
		var def := DataRegistry.enemy(id)
		cheapest = minf(cheapest, float(def["budget_cost"]) * int(def["group_size"][0]))
	return cheapest


func test_scaling_formulas() -> void:
	var scaling := generator.scaling
	assert_almost_eq(scaling.budget(1), 13.12, 0.0001)
	assert_almost_eq(scaling.budget(10), 70.0, 0.0001)
	assert_almost_eq(scaling.hp_multiplier(1), 1.0, 0.0001)
	assert_almost_eq(scaling.hp_multiplier(11), pow(1.085, 10), 0.0001)
	assert_almost_eq(scaling.damage_multiplier(26), 2.0, 0.0001)
	assert_almost_eq(scaling.speed_multiplier(26), 1.1, 0.0001)
	assert_almost_eq(scaling.speed_multiplier(200), 1.3, 0.0001, "speed is capped")
	assert_almost_eq(scaling.loot_multiplier(3), 1.06 * 1.06, 0.0001)


func test_same_seed_and_wave_give_the_same_wave() -> void:
	assert_eq(_signature(generator.generate(7, 1234)), _signature(generator.generate(7, 1234)))
	assert_ne(_signature(generator.generate(7, 1234)), _signature(generator.generate(7, 4321)))
	assert_ne(_signature(generator.generate(7, 1234)), _signature(generator.generate(8, 1234)))


func test_budget_is_spent_until_nothing_fits() -> void:
	for wave in [1, 4, 9, 15, 25]:
		for run_seed in 20:
			var groups := generator.generate(wave, run_seed)
			var remaining := generator.scaling.budget(wave) - _cost(groups)
			assert_true(remaining >= -0.0001, "wave %d overspent" % wave)
			assert_lt(remaining, _cheapest_group(wave), "wave %d left %s that still fits a group" % [wave, remaining])


func test_only_unlocked_types_and_featured_weights() -> void:
	assert_eq(generator.weights(1).keys(), ["raider_skiff"])
	assert_eq(generator.weights(3)["patrol_boat"], 3.0, "featured right after unlocking")
	assert_eq(generator.weights(6)["patrol_boat"], 1.0, "normal weight three waves later")
	assert_false(generator.weights(11).has("armored_gunboat"))
	for run_seed in 30:
		for group in generator.generate(2, run_seed):
			assert_eq(group.enemy_id, "raider_skiff")


func test_group_sizes_follow_the_data() -> void:
	for run_seed in 30:
		for group in generator.generate(12, run_seed):
			var size: Array = DataRegistry.enemy(group.enemy_id)["group_size"]
			assert_between(group.count, 1, int(size[1]), group.enemy_id)
			if group.enemy_id == "attack_drone":
				assert_eq(group.count, 5, "drones come in groups of 5")


func test_early_waves_come_mostly_from_the_sides() -> void:
	var sides := 0
	var total := 0
	for run_seed in 200:
		for group in generator.generate(10, run_seed):
			total += 1
			if group.edge == WaveGenerator.Edge.LEFT or group.edge == WaveGenerator.Edge.RIGHT:
				sides += 1
	assert_almost_eq(float(sides) / total, 0.8, 0.05, "about 80 % from left and right")


func test_every_fifth_wave_from_20_ends_with_a_pincer() -> void:
	for run_seed in 20:
		var groups := generator.generate(25, run_seed)
		var last := groups[-1]
		var before := groups[-2]
		assert_eq(before.edge, WaveGenerator.opposite(last.edge))
		assert_eq(before.time, last.time)


func test_timeline_spans_20_to_30_seconds_with_shrinking_gaps() -> void:
	for wave in [1, 15, 30]:
		var groups := generator.generate(wave, 99)
		assert_eq(groups[0].time, 0.0)
		var expected := lerpf(20.0, 30.0, clampf((wave - 1) / 29.0, 0.0, 1.0))
		assert_almost_eq(groups[-1].time, expected, 0.001, "wave %d timeline" % wave)
		if groups.size() >= 3:
			var first_gap := groups[1].time - groups[0].time
			var last_gap := groups[-1].time - groups[-2].time
			assert_gt(first_gap, last_gap, "gaps shrink across wave %d" % wave)
