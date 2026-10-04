class_name FxLayer
extends Node2D
## Placeholder effects drawn in code (GAME_DESIGN.md section 13): expanding, fading rings for
## kills, rams, shell splashes and the base explosion, and short fading tracers for enemy gunfire.
## At most MAX_BURSTS rings and MAX_TRACERS tracers at once (the explosion cap in section 14);
## extra ones are dropped. Particles replace this in M7.

const MAX_BURSTS := 30
const MAX_TRACERS := 30
const DEFAULT_DURATION := 0.35
const TRACER_DURATION := 0.15
const RING_SEGMENTS := 32

var count := 0
var tracer_count := 0

var _positions := PackedVector2Array()
var _radii := PackedFloat32Array()
var _ages := PackedFloat32Array()
var _durations := PackedFloat32Array()
var _colors := PackedColorArray()

var _tracer_from := PackedVector2Array()
var _tracer_to := PackedVector2Array()
var _tracer_ages := PackedFloat32Array()
var _tracer_widths := PackedFloat32Array()
var _tracer_colors := PackedColorArray()


func _init() -> void:
	_positions.resize(MAX_BURSTS)
	_radii.resize(MAX_BURSTS)
	_ages.resize(MAX_BURSTS)
	_durations.resize(MAX_BURSTS)
	_colors.resize(MAX_BURSTS)
	_tracer_from.resize(MAX_TRACERS)
	_tracer_to.resize(MAX_TRACERS)
	_tracer_ages.resize(MAX_TRACERS)
	_tracer_widths.resize(MAX_TRACERS)
	_tracer_colors.resize(MAX_TRACERS)


func burst(at: Vector2, radius: float, color: Color, duration := DEFAULT_DURATION) -> void:
	if count == MAX_BURSTS:
		return
	_positions[count] = at
	_radii[count] = radius
	_ages[count] = 0.0
	_durations[count] = duration
	_colors[count] = color
	count += 1
	queue_redraw()


func tracer(from: Vector2, to: Vector2, color: Color, width: float) -> void:
	if tracer_count == MAX_TRACERS:
		return
	_tracer_from[tracer_count] = from
	_tracer_to[tracer_count] = to
	_tracer_ages[tracer_count] = 0.0
	_tracer_widths[tracer_count] = width
	_tracer_colors[tracer_count] = color
	tracer_count += 1
	queue_redraw()


func tick(delta: float) -> void:
	if count == 0 and tracer_count == 0:
		return
	var i := 0
	while i < count:
		_ages[i] += delta
		if _ages[i] >= _durations[i]:
			count -= 1
			_positions[i] = _positions[count]
			_radii[i] = _radii[count]
			_ages[i] = _ages[count]
			_durations[i] = _durations[count]
			_colors[i] = _colors[count]
		else:
			i += 1
	i = 0
	while i < tracer_count:
		_tracer_ages[i] += delta
		if _tracer_ages[i] >= TRACER_DURATION:
			tracer_count -= 1
			_tracer_from[i] = _tracer_from[tracer_count]
			_tracer_to[i] = _tracer_to[tracer_count]
			_tracer_ages[i] = _tracer_ages[tracer_count]
			_tracer_widths[i] = _tracer_widths[tracer_count]
			_tracer_colors[i] = _tracer_colors[tracer_count]
		else:
			i += 1
	queue_redraw()


func _draw() -> void:
	for i in tracer_count:
		var color := _tracer_colors[i]
		color.a *= 1.0 - _tracer_ages[i] / TRACER_DURATION
		draw_line(_tracer_from[i], _tracer_to[i], color, _tracer_widths[i])
	for i in count:
		var t := _ages[i] / _durations[i]
		var color := _colors[i]
		color.a *= 1.0 - t
		draw_arc(_positions[i], _radii[i] * (0.35 + 0.65 * t), 0.0, TAU, RING_SEGMENTS, color, 2.0 + 8.0 * (1.0 - t), true)
