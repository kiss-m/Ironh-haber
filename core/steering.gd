class_name Steering
extends RefCounted
## Enemy movement helpers (GAME_DESIGN.md section 5): approach with a slight sine weave, and
## separation steering so groups do not overlap.


## Unit heading from `from` toward `target`, bent sideways by `lateral_rate`: the lateral speed
## divided by the forward speed at this instant (A·ω·cos(φ) / speed for a weave of amplitude A).
static func weave_heading(from: Vector2, target: Vector2, lateral_rate: float) -> Vector2:
	var forward := from.direction_to(target)
	return (forward + forward.orthogonal() * lateral_rate).normalized()


## Push away from one neighbor: length 1 when touching, falling to 0 at `radius`.
static func separation_from(position: Vector2, neighbor: Vector2, radius: float) -> Vector2:
	var offset := position - neighbor
	var distance := offset.length()
	if distance >= radius or is_zero_approx(distance):
		return Vector2.ZERO
	return offset / distance * (1.0 - distance / radius)
