class_name WaveScaling
extends RefCounted
## Wave scaling formulas (GAME_DESIGN.md section 6), w = wave number starting at 1:
##
##   B(w) = 8 + 5w + 0.12w²        H(w) = 1.085^(w−1)        A(w) = 1 + 0.04·(w−1)
##   S(w) = min(1 + 0.004·(w−1), 1.3)                         L(w) = 1.06^(w−1)
##
## The constants come from the "scaling" section of waves.json.

var budget_base := 0.0
var budget_linear := 0.0
var budget_quadratic := 0.0
var hp_growth := 1.0
var damage_per_wave := 0.0
var speed_per_wave := 0.0
var speed_max := 1.0
var loot_growth := 1.0


func _init(scaling: Dictionary) -> void:
	var budget_terms: Dictionary = scaling["budget"]
	budget_base = float(budget_terms["base"])
	budget_linear = float(budget_terms["linear"])
	budget_quadratic = float(budget_terms["quadratic"])
	hp_growth = float(scaling["hp_growth"])
	damage_per_wave = float(scaling["damage_per_wave"])
	speed_per_wave = float(scaling["speed_per_wave"])
	speed_max = float(scaling["speed_max"])
	loot_growth = float(scaling["loot_growth"])


## B(w): spawn budget.
func budget(wave: int) -> float:
	return budget_base + budget_linear * wave + budget_quadratic * wave * wave


## H(w): enemy HP multiplier.
func hp_multiplier(wave: int) -> float:
	return pow(hp_growth, wave - 1)


## A(w): enemy damage multiplier.
func damage_multiplier(wave: int) -> float:
	return 1.0 + damage_per_wave * (wave - 1)


## S(w): enemy speed multiplier.
func speed_multiplier(wave: int) -> float:
	return minf(1.0 + speed_per_wave * (wave - 1), speed_max)


## L(w): loot value multiplier (used from M3).
func loot_multiplier(wave: int) -> float:
	return pow(loot_growth, wave - 1)
