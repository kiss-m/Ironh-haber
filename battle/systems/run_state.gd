class_name RunState
extends Node
## Run-only data (GAME_DESIGN.md section 9): seed, base HP, kills, elapsed time and the RNG
## streams. Permanent data lives in GameState.

var run_seed := 0
var max_hp := 0.0
var base_hp := 0.0
var kills := 0
var elapsed := 0.0
var is_over := false
## One stream per feature, all derived from the run seed, so a change in one feature never shifts
## another's random outcomes. Loot, elite and perk streams join them in later milestones.
var rng_waves := RandomNumberGenerator.new()
var rng_combat := RandomNumberGenerator.new()


func start(p_seed: int, p_max_hp: float) -> void:
	run_seed = p_seed
	rng_waves.seed = hash([p_seed, "waves"])
	rng_combat.seed = hash([p_seed, "combat"])
	max_hp = p_max_hp
	base_hp = p_max_hp
	kills = 0
	elapsed = 0.0
	is_over = false


func damage_base(amount: float) -> void:
	if is_over or base_hp <= 0.0:
		return
	base_hp = maxf(base_hp - amount, 0.0)
	EventBus.base_damaged.emit(amount, base_hp)


func summary() -> Dictionary:
	return { "seed": run_seed, "kills": kills, "time": elapsed }
