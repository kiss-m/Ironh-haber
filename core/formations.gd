class_name Formations
extends RefCounted
## Spawn offsets for a group formation (GAME_DESIGN.md section 6: line, V, cluster, wide spread).
## Offsets are in the group's local frame: +x points along the approach direction (toward the
## fortress), +y to the side. No offset has x > 0, so a group anchored off screen stays off screen.
## Callers rotate them into the world.


static func offsets(formation: String, count: int, params: Dictionary, rng: RandomNumberGenerator) -> PackedVector2Array:
	var result := PackedVector2Array()
	result.resize(count)
	match formation:
		"line", "wide_spread":
			var spacing := float(params.get("spacing", 60.0))
			for i in count:
				result[i] = Vector2(0.0, (i - (count - 1) * 0.5) * spacing)
		"v":
			var spacing := float(params.get("spacing", 60.0))
			for i in count:
				var rank := ceili(i / 2.0)
				var side := -1.0 if i % 2 == 1 else 1.0
				result[i] = Vector2(-rank * spacing, side * rank * spacing)
		"cluster":
			var radius := float(params.get("radius", 80.0))
			for i in count:
				var offset := Vector2.from_angle(rng.randf() * TAU) * sqrt(rng.randf()) * radius
				result[i] = Vector2(-absf(offset.x), offset.y)
		_:
			push_error("Unknown formation '%s'" % formation)
	return result
