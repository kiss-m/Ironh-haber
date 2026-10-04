class_name RunState
extends Node
## Run-only data (GAME_DESIGN.md section 9): seed, wave, base HP, kills, resources banked this run,
## elapsed time and the RNG streams. Permanent data lives in GameState.

var run_seed := 0
var wave := 0
var max_hp := 0.0
var base_hp := 0.0
var kills := 0
var elapsed := 0.0
var is_over := false
## Incoming damage multiplier from Armor Plating (1.0 = full damage).
var damage_taken := 1.0
## Base HP regenerated per second (Repair Crews).
var regen := 0.0
## Resources unloaded by the salvage boat this run, by name.
var banked: Dictionary = {}
## One stream per feature, all derived from the run seed, so a change in one feature never shifts
## another's random outcomes. Elite and perk streams join them in later milestones.
var rng_waves := RandomNumberGenerator.new()
var rng_combat := RandomNumberGenerator.new()
var rng_loot := RandomNumberGenerator.new()


func start(p_seed: int, p_max_hp: float) -> void:
	run_seed = p_seed
	rng_waves.seed = hash([p_seed, "waves"])
	rng_combat.seed = hash([p_seed, "combat"])
	rng_loot.seed = hash([p_seed, "loot"])
	max_hp = p_max_hp
	base_hp = p_max_hp
	wave = 0
	kills = 0
	elapsed = 0.0
	is_over = false
	banked = { "credits": 0, "steel": 0, "electronics": 0, "cores": 0 }


func damage_base(amount: float) -> void:
	if is_over or base_hp <= 0.0:
		return
	var taken := amount * damage_taken
	base_hp = maxf(base_hp - taken, 0.0)
	EventBus.base_damaged.emit(taken, base_hp)


## Repair Crews: heals `regen` HP per second up to max HP.
func tick_regen(delta: float) -> void:
	if regen <= 0.0 or is_over or base_hp <= 0.0 or base_hp >= max_hp:
		return
	var before := ceili(base_hp)
	base_hp = minf(base_hp + regen * delta, max_hp)
	if ceili(base_hp) != before:
		EventBus.base_repaired.emit(base_hp)


func add_banked(delta: Dictionary) -> void:
	for resource_name: String in delta:
		banked[resource_name] = int(banked.get(resource_name, 0)) + int(delta[resource_name])


func summary() -> Dictionary:
	return { "seed": run_seed, "wave": wave, "kills": kills, "time": elapsed, "banked": banked.duplicate() }
