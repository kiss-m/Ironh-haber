class_name FxLayer
extends Node2D
## Placeholder effects drawn in code (GAME_DESIGN.md section 13): expanding, fading rings for
## kills, rams and the base explosion. At most MAX_BURSTS at once, like the explosion cap in
## section 14; extra bursts are dropped. Particles replace this in M7.

const MAX_BURSTS := 30
const DEFAULT_DURATION := 0.35
const RING_SEGMENTS := 32

var count := 0

var _positions := PackedVector2Array()
var _radii := PackedFloat32Array()
var _ages := PackedFloat32Array()
var _durations := PackedFloat32Array()
var _colors := PackedColorArray()


func _init() -> void:
	_positions.resize(MAX_BURSTS)
	_radii.resize(MAX_BURSTS)
	_ages.resize(MAX_BURSTS)
	_durations.resize(MAX_BURSTS)
	_colors.resize(MAX_BURSTS)


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


func tick(delta: float) -> void:
	if count == 0:
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
	queue_redraw()


func _draw() -> void:
	for i in count:
		var t := _ages[i] / _durations[i]
		var color := _colors[i]
		color.a *= 1.0 - t
		draw_arc(_positions[i], _radii[i] * (0.35 + 0.65 * t), 0.0, TAU, RING_SEGMENTS, color, 2.0 + 8.0 * (1.0 - t), true)
