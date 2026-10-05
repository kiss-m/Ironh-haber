class_name TargetingSystem
extends Node
## Targeting for turrets no finger is aiming (GAME_DESIGN.md sections 3 and 9).
##
## - Auto-Targeting: every turret that is neither selected nor finger-controlled aims at the enemy
##   of its domains closest to the fortress within its range, firing at `auto_share` of its rate.
## - Aim assist (setting): a finger-aimed turret snaps up to `assist_angle` toward the nearest
##   valid enemy near the finger's line.
## Targets come from SpatialGrid, never from a scan over all enemies.

var turrets: Array[Turret] = []
var grid: SpatialGrid
var auto_share := 0.0
## Radians; 0 turns aim assist off.
var assist_angle := 0.0
var fortress_center := Vector2.ZERO


func tick(_delta: float) -> void:
	for turret in turrets:
		if turret.is_disabled():
			continue
		if turret.controlled:
			turret.assist_point = _assist(turret) if assist_angle > 0.0 else null
		elif not turret.selected and auto_share > 0.0:
			turret.auto_share = auto_share
			var target := _closest_threat(turret)
			turret.auto_aim(target.position if target != null else null)


func _closest_threat(turret: Turret) -> Enemy:
	var best: Enemy = null
	var best_distance := turret.range_px * turret.range_px
	var count := grid.query(fortress_center, turret.range_px)
	for k in count:
		var enemy: Enemy = grid.results[k]
		if not enemy.alive or (enemy.domain & turret.domain_mask) == 0:
			continue
		var distance := enemy.position.distance_squared_to(fortress_center)
		if distance <= best_distance:
			best_distance = distance
			best = enemy
	return best


func _assist(turret: Turret) -> Variant:
	var finger_angle := (turret.aim_point - fortress_center).angle()
	var best: Variant = null
	var best_offset := assist_angle
	var count := grid.query(fortress_center, turret.range_px)
	for k in count:
		var enemy: Enemy = grid.results[k]
		if not enemy.alive or (enemy.domain & turret.domain_mask) == 0:
			continue
		if enemy.position.distance_to(fortress_center) > turret.range_px:
			continue
		var offset := absf(angle_difference(finger_angle, (enemy.position - fortress_center).angle()))
		if offset <= best_offset:
			best_offset = offset
			best = enemy.position
	return best
