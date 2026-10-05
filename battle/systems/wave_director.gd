class_name WaveDirector
extends Node
## Runs the wave lifecycle (GAME_DESIGN.md section 6):
##
##   PREPARE (countdown) → ACTIVE (spawning on the timeline) → CLEANUP (until no enemies are left)
##   → BREAK → next wave
##
## Each wave's groups come from WaveGenerator (deterministic per run seed + wave). Groups spawn just
## outside their edge of the visible area, in their formation, facing the fortress. Perk choices
## after every 5th wave (M6) and boss waves (M6) are not in yet. Wave enemies roll for elite
## modifiers as they spawn.

enum Phase { IDLE, PREPARE, ACTIVE, CLEANUP, BREAK }

var enabled := true
var phase := Phase.IDLE
var wave := 0
var enemies: EnemySystem
var run_state: RunState
var generator: WaveGenerator
## Visible world rectangle; enemies spawn just outside its edges.
var play_area := Rect2()

var _prepare_time := 0.0
var _break_time := 0.0
var _margin := 0.0
var _formation_params: Dictionary = {}
var _groups: Array[WaveGenerator.Group] = []
var _next_group := 0
var _timer := 0.0
var _elapsed := 0.0
var _last_countdown := -1


func setup(p_generator: WaveGenerator, waves: Dictionary) -> void:
	generator = p_generator
	_prepare_time = float(waves["lifecycle"]["prepare"])
	_break_time = float(waves["lifecycle"]["break"])
	_margin = float(waves["spawn"]["margin"])
	_formation_params = waves["formations"]


## Starts the run at `first_wave` with its PREPARE countdown.
func start(first_wave := 1) -> void:
	_prepare(first_wave)


func tick(delta: float) -> void:
	if not enabled:
		return
	match phase:
		Phase.PREPARE:
			_timer -= delta
			_emit_countdown()
			if _timer <= 0.0:
				_set_phase(Phase.ACTIVE)
				_elapsed = 0.0
				EventBus.wave_started.emit(wave)
		Phase.ACTIVE:
			_elapsed += delta
			while _next_group < _groups.size() and _groups[_next_group].time <= _elapsed:
				_spawn_group(_groups[_next_group])
				_next_group += 1
			if _next_group >= _groups.size():
				_set_phase(Phase.CLEANUP)
		Phase.CLEANUP:
			if enemies.alive_count() == 0:
				EventBus.wave_cleared.emit(wave)
				_timer = _break_time
				_set_phase(Phase.BREAK)
		Phase.BREAK:
			_timer -= delta
			if _timer <= 0.0:
				_prepare(wave + 1)


## The planned groups of the current wave (for tests and the Radar preview in M5).
func groups() -> Array[WaveGenerator.Group]:
	return _groups


## Groups of the current wave that spawn within `lookahead` seconds (all of them during PREPARE),
## for the Radar's edge warnings.
func upcoming(lookahead: float) -> Array[WaveGenerator.Group]:
	var result: Array[WaveGenerator.Group] = []
	if phase == Phase.PREPARE:
		result.assign(_groups)
	elif phase == Phase.ACTIVE:
		for i in range(_next_group, _groups.size()):
			if _groups[i].time - _elapsed <= lookahead:
				result.append(_groups[i])
	return result


func _prepare(next_wave: int) -> void:
	wave = next_wave
	run_state.wave = wave
	_groups = generator.generate(wave, run_state.run_seed)
	_next_group = 0
	_timer = _prepare_time
	_last_countdown = -1
	_set_phase(Phase.PREPARE)
	_emit_countdown()


func _set_phase(next: Phase) -> void:
	phase = next
	EventBus.wave_phase_changed.emit(wave, phase)


func _emit_countdown() -> void:
	var seconds_left := ceili(maxf(_timer, 0.0))
	if seconds_left != _last_countdown:
		_last_countdown = seconds_left
		EventBus.wave_countdown.emit(wave, seconds_left)


func _spawn_group(group: WaveGenerator.Group) -> void:
	var anchor := edge_point(group.edge, group.edge_offset)
	var forward := anchor.direction_to(play_area.get_center())
	var offsets := Formations.offsets(group.formation, group.count,
			_formation_params.get(group.formation, {}), run_state.rng_waves)
	for offset in offsets:
		var at := anchor + forward * offset.x + forward.orthogonal() * offset.y
		var enemy := enemies.spawn(group.enemy_id, at, wave)
		var elite := EliteRules.roll(wave, enemies.elite_config, run_state.rng_elites)
		if enemy != null and elite != Enemy.Elite.NONE:
			enemy.make_elite(elite, enemies.elite_config)


## A point just outside the given edge of the visible area; `offset` runs -1 .. 1 along the edge.
func edge_point(edge: int, offset: float) -> Vector2:
	var center := play_area.get_center()
	var half := play_area.size * 0.5
	match edge:
		WaveGenerator.Edge.LEFT:
			return center + Vector2(-half.x - _margin, offset * half.y)
		WaveGenerator.Edge.RIGHT:
			return center + Vector2(half.x + _margin, offset * half.y)
		WaveGenerator.Edge.TOP:
			return center + Vector2(offset * half.x, -half.y - _margin)
	return center + Vector2(offset * half.x, half.y + _margin)
