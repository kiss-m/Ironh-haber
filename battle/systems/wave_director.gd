class_name WaveDirector
extends Node
## M1 stand-in for the wave system: trickles one enemy type in from the left and right edges at a
## shrinking interval, configured by the "trickle" section of waves.json. M2 replaces this with
## budget waves, formations, edges and the wave lifecycle (GAME_DESIGN.md section 6).

var enabled := true
var enemies: EnemySystem
var rng: RandomNumberGenerator
## Visible world rectangle; enemies spawn just outside its left and right edges.
var play_area := Rect2()

var _enemy_id := ""
var _interval := 0.0
var _min_interval := 0.0
var _decay := 1.0
var _margin := 0.0
var _edge_band := 1.0
var _timer := 0.0


func setup(trickle: Dictionary) -> void:
	_enemy_id = str(trickle["enemy"])
	_interval = float(trickle["start_interval"])
	_min_interval = float(trickle["min_interval"])
	_decay = float(trickle["interval_decay"])
	_margin = float(trickle["spawn_margin"])
	_edge_band = float(trickle["edge_band"])
	_timer = float(trickle["first_delay"])


func tick(delta: float) -> void:
	if not enabled:
		return
	_timer -= delta
	while _timer <= 0.0:
		enemies.spawn(_enemy_id, _spawn_point())
		_interval = maxf(_min_interval, _interval * _decay)
		_timer += _interval


## A point just outside the left or right edge, within the middle `edge_band` of the height.
func _spawn_point() -> Vector2:
	var center := play_area.get_center()
	var half := play_area.size * 0.5
	var side := -1.0 if rng.randf() < 0.5 else 1.0
	var y := rng.randf_range(-_edge_band, _edge_band) * half.y
	return center + Vector2(side * (half.x + _margin), y)
