class_name LootSystem
extends Node
## Floating loot (GAME_DESIGN.md section 7). Destroyed enemies drop one crate per resource at the
## death point with a small scatter. Crates drift with the current, blink during their last
## seconds and sink when their float time runs out. Crates of the same type close together merge
## into one, and a tap marks every crate near it for the salvage boat. Loot is worth nothing until
## the boat brings it back to the dock.

## Seconds between merge passes (crates drift slowly, so this does not need every tick).
const MERGE_INTERVAL := 0.25

var active: Array[LootDrop] = []
var run_state: RunState
var scaling: WaveScaling
var stats: StatResolver
var mark_radius := 0.0

var _pool: ObjectPool
var _roller: LootRoller
var _scatter := 0.0
var _merge_radius := 0.0
var _blink_time := 0.0
var _float_time := 0.0
var _current_direction := Vector2.RIGHT
var _current_min := 0.0
var _current_max := 0.0
var _merge_timer := 0.0


func setup(layer: Node2D, loot_tables: Dictionary, loot: Dictionary) -> void:
	_roller = LootRoller.new(loot_tables)
	_float_time = float(loot["float_time"])
	_blink_time = float(loot["blink_time"])
	_scatter = float(loot["scatter"])
	_merge_radius = float(loot["merge_radius"])
	mark_radius = float(loot["mark_radius"])
	_current_direction = Vector2.from_angle(deg_to_rad(float(loot["current_direction_deg"])))
	var speeds: Array = loot["current_speed"]
	_current_min = float(speeds[0])
	_current_max = float(speeds[1])
	_pool = ObjectPool.new(func() -> LootDrop: return LootDrop.new(), layer)
	_pool.prewarm(24)
	EventBus.enemy_killed.connect(_on_enemy_killed)


## Float time with upgrades (Flotation Foam, M4) applied.
func float_time() -> float:
	return stats.resolve("loot.float_time", _float_time) if stats != null else _float_time


## Drops the loot of `table_id` for an enemy of `wave` at `at`.
func drop(table_id: String, wave: int, at: Vector2) -> void:
	var drops := _roller.roll(table_id, scaling.loot_multiplier(wave), run_state.rng_loot)
	for resource_type: int in drops:
		var offset := Vector2(run_state.rng_loot.randf_range(-_scatter, _scatter),
				run_state.rng_loot.randf_range(-_scatter, _scatter))
		spawn(resource_type, drops[resource_type], at + offset, float_time())


func spawn(resource_type: int, amount: int, at: Vector2, p_float_time: float) -> LootDrop:
	var crate: LootDrop = _pool.acquire()
	var speed := run_state.rng_loot.randf_range(_current_min, _current_max)
	crate.setup(resource_type, amount, _current_direction * speed, p_float_time, _blink_time)
	crate.position = at
	active.append(crate)
	EventBus.loot_dropped.emit(crate)
	_merge_into(crate)
	return crate


## Marks every floating crate within `radius` of `at`. Returns how many were newly marked.
func mark_near(at: Vector2, radius: float) -> int:
	var marked := 0
	for crate in active:
		if crate.alive and not crate.marked and crate.position.distance_to(at) <= radius:
			crate.set_marked(true)
			marked += 1
			EventBus.loot_marked.emit(crate)
	return marked


## True if a touch at `at` lands near floating loot (marked or not).
func is_near_loot(at: Vector2, radius: float) -> bool:
	for crate in active:
		if crate.alive and crate.position.distance_to(at) <= radius:
			return true
	return false


func has_marked() -> bool:
	for crate in active:
		if crate.alive and crate.marked:
			return true
	return false


func nearest_marked(from: Vector2) -> LootDrop:
	var best: LootDrop = null
	var best_distance := INF
	for crate in active:
		if crate.alive and crate.marked:
			var distance := crate.position.distance_squared_to(from)
			if distance < best_distance:
				best_distance = distance
				best = crate
	return best


## Removes up to `max_count` crates within `radius` of `at` and returns them as cargo entries
## Vector2i(resource type, amount), marked crates first.
func collect_near(at: Vector2, radius: float, max_count: int) -> Array[Vector2i]:
	var picked: Array[Vector2i] = []
	for pass_marked in [true, false]:
		for crate in active:
			if picked.size() >= max_count:
				return picked
			if crate.alive and crate.marked == pass_marked and crate.position.distance_to(at) <= radius:
				picked.append(Vector2i(crate.resource_type, crate.amount))
				crate.alive = false
				crate.visible = false
	return picked


func tick(delta: float) -> void:
	var write := 0
	for i in active.size():
		var crate := active[i]
		if crate.alive and not crate.tick(delta):
			crate.alive = false
			EventBus.loot_sunk.emit(crate)
		if crate.alive:
			active[write] = crate
			write += 1
		else:
			_pool.release(crate)
	active.resize(write)
	_merge_timer -= delta
	if _merge_timer <= 0.0:
		_merge_timer = MERGE_INTERVAL
		for crate in active:
			if crate.alive:
				_merge_into(crate)


## Folds other crates of the same type within the merge radius into `crate`. The merged crate
## keeps the longest remaining float time and is marked if any part was.
func _merge_into(crate: LootDrop) -> void:
	for other in active:
		if other == crate or not other.alive or other.resource_type != crate.resource_type:
			continue
		if other.position.distance_to(crate.position) > _merge_radius:
			continue
		crate.amount += other.amount
		if other.time_left() > crate.time_left():
			crate.age = 0.0
			crate.float_time = other.time_left()
		if other.marked:
			crate.set_marked(true)
		other.alive = false
		other.visible = false


func _on_enemy_killed(enemy: Node2D, at: Vector2) -> void:
	var source := enemy as Enemy
	if source != null and source.loot_table != "":
		drop(source.loot_table, source.wave, at)
