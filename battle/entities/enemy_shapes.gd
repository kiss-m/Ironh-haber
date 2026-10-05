class_name EnemyShapes
extends RefCounted
## Placeholder silhouettes per "visual" id (GAME_DESIGN.md section 13): hull outlines in units of
## the hit radius with the bow along +x, plus a deck accent. Colors follow the domain: Surface
## grey-blue, Air orange.

const SURFACE_COLOR := Color("a9bccb")
const AIR_COLOR := Color("f0a040")
const SUBMERGED_COLOR := Color("2f6f6a")

const HULLS := {
	"skiff": [Vector2(1.3, 0.0), Vector2(0.55, -0.5), Vector2(-1.0, -0.5), Vector2(-1.1, 0.0),
			Vector2(-1.0, 0.5), Vector2(0.55, 0.5)],
	"patrol_boat": [Vector2(1.25, 0.0), Vector2(0.7, -0.45), Vector2(-1.05, -0.45),
			Vector2(-1.05, 0.45), Vector2(0.7, 0.45)],
	"torpedo_boat": [Vector2(1.4, 0.0), Vector2(0.9, -0.3), Vector2(-1.1, -0.35),
			Vector2(-1.1, 0.35), Vector2(0.9, 0.3)],
	"gunboat": [Vector2(1.1, 0.0), Vector2(0.8, -0.6), Vector2(-1.0, -0.6), Vector2(-1.0, 0.6),
			Vector2(0.8, 0.6)],
	"drone": [Vector2(1.0, 0.0), Vector2(-0.2, -1.0), Vector2(-0.6, -1.0), Vector2(-0.3, 0.0),
			Vector2(-0.6, 1.0), Vector2(-0.2, 1.0)],
	"torpedo": [Vector2(1.2, 0.0), Vector2(0.8, -0.3), Vector2(-1.2, -0.3), Vector2(-1.2, 0.3),
			Vector2(0.8, 0.3)],
	"hunter": [Vector2(1.4, 0.0), Vector2(0.4, -0.55), Vector2(-0.6, -0.4), Vector2(-1.1, -0.55),
			Vector2(-0.9, 0.0), Vector2(-1.1, 0.55), Vector2(-0.6, 0.4), Vector2(0.4, 0.55)],
	"submarine": [Vector2(1.3, 0.0), Vector2(1.0, -0.3), Vector2(-1.1, -0.3), Vector2(-1.4, 0.0),
			Vector2(-1.1, 0.3), Vector2(1.0, 0.3)],
	"bomber": [Vector2(1.1, 0.0), Vector2(0.3, -0.2), Vector2(0.1, -1.2), Vector2(-0.3, -1.2),
			Vector2(-0.4, -0.2), Vector2(-1.0, -0.5), Vector2(-1.0, 0.5), Vector2(-0.4, 0.2),
			Vector2(-0.3, 1.2), Vector2(0.1, 1.2), Vector2(0.3, 0.2)],
	"minelayer": [Vector2(1.1, 0.0), Vector2(0.7, -0.5), Vector2(-1.1, -0.65), Vector2(-1.1, 0.65),
			Vector2(0.7, 0.5)],
	"frigate": [Vector2(1.4, 0.0), Vector2(0.9, -0.42), Vector2(-1.1, -0.42), Vector2(-1.2, 0.0),
			Vector2(-1.1, 0.42), Vector2(0.9, 0.42)],
	"landing_craft": [Vector2(0.9, -0.7), Vector2(-1.0, -0.7), Vector2(-1.0, 0.7), Vector2(0.9, 0.7)],
	"corvette": [Vector2(1.5, 0.0), Vector2(0.8, -0.38), Vector2(-1.1, -0.38), Vector2(-1.1, 0.38),
			Vector2(0.8, 0.38)],
	"mine": [Vector2(1.0, 0.0), Vector2(0.7, -0.7), Vector2(0.0, -1.0), Vector2(-0.7, -0.7),
			Vector2(-1.0, 0.0), Vector2(-0.7, 0.7), Vector2(0.0, 1.0), Vector2(0.7, 0.7)],
	"missile": [Vector2(1.3, 0.0), Vector2(0.4, -0.35), Vector2(-1.0, -0.35), Vector2(-1.3, -0.7),
			Vector2(-1.3, 0.7), Vector2(-1.0, 0.35), Vector2(0.4, 0.35)],
}

## Accent drawn on deck: [offset along the hull in radius units, size in radius units, color].
const ACCENTS := {
	"skiff": [-0.25, 0.28, Color("e0664f")],
	"patrol_boat": [-0.1, 0.3, Color("e0664f")],
	"torpedo_boat": [-0.3, 0.25, Color("d9534f")],
	"gunboat": [0.15, 0.42, Color("4b5966")],
	"drone": [-0.2, 0.25, Color("7a3b10")],
	"torpedo": [0.9, 0.2, Color("e0664f")],
	"hunter": [0.0, 0.3, Color("8e24aa")],
	"submarine": [0.3, 0.22, Color("1b3a3a")],
	"bomber": [0.4, 0.2, Color("7a3b10")],
	"minelayer": [-0.5, 0.35, Color("2b2b2b")],
	"frigate": [0.0, 0.32, Color("4dd0e1")],
	"landing_craft": [-0.3, 0.4, Color("6d4c41")],
	"corvette": [0.2, 0.25, Color("e0664f")],
	"mine": [0.0, 0.45, Color("c62828")],
	"missile": [1.0, 0.2, Color("ffeb3b")],
}


static func hull(visual: String, radius: float) -> PackedVector2Array:
	var points := PackedVector2Array()
	for point: Vector2 in HULLS.get(visual, HULLS["skiff"]):
		points.append(point * radius)
	return points


static func accent(visual: String) -> Array:
	return ACCENTS.get(visual, ACCENTS["skiff"])


static func domain_color(domain: int) -> Color:
	match domain:
		CombatTypes.DOMAIN_AIR:
			return AIR_COLOR
		CombatTypes.DOMAIN_SUBMERGED:
			return SUBMERGED_COLOR
	return SURFACE_COLOR
