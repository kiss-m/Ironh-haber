extends GutTest
## FireCadence: fixed fire rate while the trigger is held, no stored burst after a pause.

const TICK := 1.0 / 60.0
const MACHINE_GUN_INTERVAL := 1.0 / 8.0


func _run(cadence: FireCadence, ticks: int, trigger: bool) -> int:
	var shots := 0
	for i in ticks:
		shots += cadence.tick(TICK, trigger, MACHINE_GUN_INTERVAL)
	return shots


func test_first_shot_is_immediate() -> void:
	assert_eq(FireCadence.new().tick(TICK, true, MACHINE_GUN_INTERVAL), 1)


func test_holds_eight_shots_per_second() -> void:
	assert_almost_eq(_run(FireCadence.new(), 600, true), 80, 1, "10 s at 8 shots/s")


func test_no_shots_without_trigger() -> void:
	assert_eq(_run(FireCadence.new(), 120, false), 0)


func test_pause_does_not_bank_a_burst() -> void:
	var cadence := FireCadence.new()
	_run(cadence, 30, true)
	_run(cadence, 300, false)
	assert_eq(cadence.tick(TICK, true, MACHINE_GUN_INTERVAL), 1, "one shot, not a burst")


func test_tapping_cannot_beat_the_fire_rate() -> void:
	var cadence := FireCadence.new()
	var shots := 0
	for i in 600:
		shots += cadence.tick(TICK, i % 2 == 0, MACHINE_GUN_INTERVAL)
	assert_true(shots <= 81, "rapid taps fired %d shots in 10 s" % shots)
