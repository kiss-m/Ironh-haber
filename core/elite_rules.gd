class_name EliteRules
extends RefCounted
## Elite modifiers (GAME_DESIGN.md section 5): from wave 15 any regular enemy can roll elite, with
## chance 2 % + 0.5 % per wave above 15, capped at 35 %. An elite gets one random modifier:
## Armored, Fast, Regenerating, Shielded or Splitting. Numbers come from balance.json → elites.


static func chance(wave: int, config: Dictionary) -> float:
	var from_wave := int(config["from_wave"])
	if wave < from_wave:
		return 0.0
	var value := float(config["base_chance"]) + float(config["per_wave"]) * (wave - from_wave)
	return minf(value, float(config["max_chance"]))


## Rolls for one enemy of `wave`; returns an Enemy.Elite value (NONE when it is not an elite).
static func roll(wave: int, config: Dictionary, rng: RandomNumberGenerator) -> int:
	if rng.randf() >= chance(wave, config):
		return Enemy.Elite.NONE
	return rng.randi_range(Enemy.Elite.ARMORED, Enemy.Elite.SPLITTING)
