class_name AutoTargeting
extends RefCounted
## Auto-Targeting (GAME_DESIGN.md section 3): unselected turrets fire on their own at a share of
## their manual fire rate, 20 % at level 1 rising evenly to 70 % at level 10, so manual control
## always stays stronger. Numbers come from balance.json → auto_targeting.


static func share(level: int, config: Dictionary) -> float:
	if level <= 0:
		return 0.0
	var max_level := int(config["max_level"])
	var t := clampf(float(level - 1) / maxf(1.0, max_level - 1), 0.0, 1.0)
	return lerpf(float(config["min_share"]), float(config["max_share"]), t)
