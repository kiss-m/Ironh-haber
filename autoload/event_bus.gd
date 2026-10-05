extends Node
## Global signal hub (GAME_DESIGN.md section 9).
##
## Systems never call each other's internals; they emit and listen here. Signals are only
## declared in this file and emitted by the systems that own the event. Entity parameters
## are typed as Node2D until the entity classes exist (M1+).

@warning_ignore_start("unused_signal")

signal enemy_spawned(enemy: Node2D)
signal enemy_killed(enemy: Node2D, position: Vector2)
signal base_damaged(amount: float, hp_left: float)
signal loot_dropped(loot: Node2D)
signal loot_marked(loot: Node2D)
signal loot_sunk(loot: Node2D)
signal boat_state_changed(boat: Node2D, state: int)
signal resources_banked(delta: Dictionary)
signal wave_started(n: int)
signal wave_cleared(n: int)
signal perk_offered(perks: Array)
signal perk_picked(id: StringName)
signal run_ended(summary: Dictionary)
signal upgrade_purchased(track: StringName, level: int)
## M2 additions: wave lifecycle for the HUD and turret selection.
## `phase` is a WaveDirector.Phase value.
signal wave_phase_changed(n: int, phase: int)
signal wave_countdown(n: int, seconds_left: int)
signal turret_selected(slot: int)
## M3: what the HUD shows about the salvage boat. `state` is a SalvageBoat.State value;
## `respawn_left` is whole seconds until a destroyed boat returns.
signal boat_status(state: int, cargo: int, capacity: int, respawn_left: int)
## M4: Repair Crews healed the base.
signal base_repaired(hp_left: float)
## M5: a Landing Craft reached the base and knocks out a random turret for `seconds`.
signal turret_disable_requested(seconds: float)
## Turret state for the bottom bar: laser heat 0 .. 1 and whether it is knocked out.
signal turret_status(slot: int, heat: float, disabled: bool)
## Base shield (Shield Generator) for the HUD.
signal base_shield_changed(shield: float, max_shield: float)
