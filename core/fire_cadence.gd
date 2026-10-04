class_name FireCadence
extends RefCounted
## Turns "trigger held" into shots at a fixed rate (GAME_DESIGN.md section 3: a turret fires while
## the finger is down and the barrel is on target). The first shot comes immediately, the rate
## holds across physics ticks, and releasing the trigger never banks shots for a later burst.

var _cooldown := 0.0


func reset() -> void:
	_cooldown = 0.0


## Advances by `delta` seconds and returns how many shots to fire this tick.
func tick(delta: float, trigger: bool, interval: float) -> int:
	_cooldown -= delta
	if not trigger:
		_cooldown = maxf(_cooldown, 0.0)
		return 0
	var shots := 0
	while _cooldown <= 0.0:
		shots += 1
		_cooldown += interval
	return shots
