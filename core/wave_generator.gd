class_name WaveGenerator
extends RefCounted
## Deterministic wave generation, seeded by run seed + wave number (GAME_DESIGN.md section 6):
##
## 1. Collect enemy types whose first wave ≤ w. A newly unlocked type is "featured" for a few
##    waves with a higher weight.
## 2. Spend the budget B(w): pick a type by weight, pick a group size, subtract cost × size, stop
##    when nothing fits.
## 3. Give each group a formation and a spawn edge. Before the all-edges wave, side edges are more
##    likely; from it on every edge is equal and every n-th wave ends with a pincer (two groups
##    from opposite edges at the same time).
## 4. Lay the groups on a timeline whose gaps shrink from first_gap to last_gap.
## Elite modifiers (step 5) arrive in M5.

enum Edge { LEFT, RIGHT, TOP, BOTTOM }

## One group of enemies spawning together.
class Group:
	extends RefCounted
	var enemy_id := ""
	var count := 0
	var formation := ""
	## WaveGenerator.Edge value.
	var edge := 0
	## Position along the edge, -1 .. 1.
	var edge_offset := 0.0
	## Seconds after the wave turns ACTIVE.
	var time := 0.0

## Small tolerance so fractional costs (e.g. 0.4 per drone) fit exactly.
const EPSILON := 0.0001

var scaling: WaveScaling

var _types: Array[Dictionary] = []
var _featured_waves := 0
var _featured_weight := 1.0
var _side_share_early := 1.0
var _all_edges_from_wave := 0
var _pincer_every := 0
var _min_duration := 0.0
var _max_duration := 0.0
var _full_duration_at_wave := 1
var _first_gap := 0.0
var _last_gap := 0.0
var _edge_band := 1.0
var _formations: PackedStringArray = []


## `enemy_defs` is DataRegistry.enemies; only definitions with "first_wave" and "budget_cost"
## take part. `waves` is waves.json.
func _init(enemy_defs: Dictionary, waves: Dictionary) -> void:
	scaling = WaveScaling.new(waves["scaling"])
	for id: String in enemy_defs:
		var def: Dictionary = enemy_defs[id]
		if not def.has("first_wave") or not def.has("budget_cost"):
			continue
		var group_size: Array = def["group_size"]
		_types.append({
			"id": id,
			"cost": float(def["budget_cost"]),
			"first_wave": int(def["first_wave"]),
			"min_group": int(group_size[0]),
			"max_group": int(group_size[1]),
		})
	_featured_waves = int(waves["featured"]["waves"])
	_featured_weight = float(waves["featured"]["weight"])
	_side_share_early = float(waves["edges"]["side_share_early"])
	_all_edges_from_wave = int(waves["edges"]["all_edges_from_wave"])
	_pincer_every = int(waves["edges"]["pincer_every"])
	var timeline: Dictionary = waves["timeline"]
	_min_duration = float(timeline["min_duration"])
	_max_duration = float(timeline["max_duration"])
	_full_duration_at_wave = int(timeline["full_duration_at_wave"])
	_first_gap = float(timeline["first_gap"])
	_last_gap = float(timeline["last_gap"])
	_edge_band = float(waves["spawn"]["edge_band"])
	for formation: String in waves["formations"]:
		_formations.append(formation)


static func wave_seed(run_seed: int, wave: int) -> int:
	return hash([run_seed, "waves", wave])


## Enemy types available in `wave` with their pick weights, as {id: weight}.
func weights(wave: int) -> Dictionary:
	var result := {}
	for type in _types:
		var first_wave: int = type["first_wave"]
		if first_wave > wave:
			continue
		result[type["id"]] = _featured_weight if wave - first_wave < _featured_waves else 1.0
	return result


func generate(wave: int, run_seed: int) -> Array[Group]:
	var rng := RandomNumberGenerator.new()
	rng.seed = wave_seed(run_seed, wave)
	var groups := _spend_budget(wave, rng)
	_assign_edges(groups, wave, rng)
	_lay_timeline(groups, wave)
	return groups


func _spend_budget(wave: int, rng: RandomNumberGenerator) -> Array[Group]:
	var groups: Array[Group] = []
	var type_weights := weights(wave)
	var remaining := scaling.budget(wave)
	while true:
		var candidates: Array[Dictionary] = []
		var total_weight := 0.0
		for type in _types:
			if type_weights.has(type["id"]) and type["cost"] * type["min_group"] <= remaining + EPSILON:
				candidates.append(type)
				total_weight += type_weights[type["id"]]
		if candidates.is_empty():
			break
		var pick := rng.randf() * total_weight
		var chosen: Dictionary = candidates[-1]
		for type in candidates:
			pick -= type_weights[type["id"]]
			if pick < 0.0:
				chosen = type
				break
		var cost: float = chosen["cost"]
		var affordable := floori(remaining / cost + EPSILON)
		var size := mini(rng.randi_range(chosen["min_group"], chosen["max_group"]), affordable)
		remaining -= cost * size
		var group := Group.new()
		group.enemy_id = chosen["id"]
		group.count = size
		group.formation = _formations[rng.randi() % _formations.size()]
		groups.append(group)
	return groups


func _assign_edges(groups: Array[Group], wave: int, rng: RandomNumberGenerator) -> void:
	var all_edges := wave >= _all_edges_from_wave
	for group in groups:
		group.edge_offset = rng.randf_range(-_edge_band, _edge_band)
		if all_edges:
			group.edge = rng.randi() % 4
		elif rng.randf() < _side_share_early:
			group.edge = Edge.LEFT if rng.randf() < 0.5 else Edge.RIGHT
		else:
			group.edge = Edge.TOP if rng.randf() < 0.5 else Edge.BOTTOM
	if all_edges and _pincer_every > 0 and wave % _pincer_every == 0 and groups.size() >= 2:
		var last := groups[-1]
		groups[-2].edge = opposite(last.edge)


func _lay_timeline(groups: Array[Group], wave: int) -> void:
	var count := groups.size()
	if count == 0:
		return
	var progress := clampf(float(wave - 1) / maxf(1.0, _full_duration_at_wave - 1), 0.0, 1.0)
	var duration := lerpf(_min_duration, _max_duration, progress)
	var raw_times := PackedFloat32Array()
	raw_times.resize(count)
	var elapsed := 0.0
	for i in count:
		raw_times[i] = elapsed
		if i < count - 1:
			elapsed += lerpf(_first_gap, _last_gap, float(i) / maxf(1.0, count - 2))
	var scale := duration / elapsed if elapsed > 0.0 else 0.0
	for i in count:
		groups[i].time = raw_times[i] * scale
	if wave >= _all_edges_from_wave and _pincer_every > 0 and wave % _pincer_every == 0 and count >= 2:
		groups[-2].time = groups[-1].time


static func opposite(edge: int) -> int:
	match edge:
		Edge.LEFT:
			return Edge.RIGHT
		Edge.RIGHT:
			return Edge.LEFT
		Edge.TOP:
			return Edge.BOTTOM
	return Edge.TOP
