class_name SalvageSystem
extends Node
## Runs the salvage boat (GAME_DESIGN.md section 7):
##
##   DOCKED → OUTBOUND → COLLECTING → RETURNING → UNLOADING → DOCKED
##
## The boat leaves the dock when loot is marked, visits marked crates in nearest-neighbor order
## (re-planning every tick, so newly marked loot is picked up too) and grabs any crate within its
## pickup radius on the way. It returns when the hold is full, when no marked loot remains or when
## recalled by a tap on the dock. Unloading banks the cargo: this is the only place resources are
## written into GameState. A destroyed boat spills its cargo as short-lived loot and a new boat
## appears at the dock after the respawn time. Boat stats go through StatResolver (boat upgrades,
## M4) as boat.speed, boat.cargo, boat.pickup_radius and boat.hp.

## How far outside the fortress wall the boat keeps when it sails around the fortress.
const WALL_CLEARANCE := 12.0

var boat: SalvageBoat
var loot: LootSystem
var run_state: RunState
var stats: StatResolver
var fx: FxLayer
var fortress_center := Vector2.ZERO
var fortress_radius := 0.0
## Where the boat docks: just outside the bottom of the fortress.
var dock_position := Vector2.ZERO
var dock_tap_radius := 0.0

var _config: Dictionary = {}
var _spill_float_time := 0.0
var _timer := 0.0
var _last_status := Vector4i(-1, -1, -1, -1)


## `config` is balance.json → salvage_boat; spilled cargo floats for `spill_float_time` seconds.
func setup(layer: Node2D, config: Dictionary, p_fortress_radius: float, spill_float_time: float) -> void:
	_config = config
	_spill_float_time = spill_float_time
	fortress_radius = p_fortress_radius
	dock_tap_radius = float(config["dock_tap_radius"])
	boat = SalvageBoat.new()
	boat.name = "SalvageBoat"
	boat.radius = float(config["radius"])
	dock_position = fortress_center + Vector2(0.0, fortress_radius + boat.radius + WALL_CLEARANCE)
	layer.add_child(boat)
	_dock_new_boat()


func speed() -> float:
	return _stat("speed")


func capacity() -> int:
	return int(_stat("cargo"))


func pickup_radius() -> float:
	return _stat("pickup_radius")


## True while the boat is on the water where enemies can reach it.
func boat_hittable() -> bool:
	return boat.is_out()


## Recall by tapping the dock (section 3, "Other input"). Returns true if the tap was used.
func tap(at: Vector2) -> bool:
	if at.distance_to(dock_position) > dock_tap_radius:
		return false
	if boat.state in [SalvageBoat.State.OUTBOUND, SalvageBoat.State.COLLECTING]:
		_set_state(SalvageBoat.State.RETURNING)
	return true


func damage_boat(amount: float) -> void:
	if not boat.is_out():
		return
	boat.hp -= amount
	boat.queue_redraw()
	if boat.hp > 0.0:
		return
	fx.burst(boat.position, boat.radius * 2.5, Color("ff6b57"))
	for item in boat.cargo:
		loot.spawn(item.x, item.y, boat.position, _spill_float_time)
	boat.cargo.clear()
	_timer = float(_config["respawn"])
	_set_state(SalvageBoat.State.DESTROYED)


func tick(delta: float) -> void:
	match boat.state:
		SalvageBoat.State.DOCKED:
			if loot.has_marked() and capacity() > 0:
				_set_state(SalvageBoat.State.OUTBOUND)
		SalvageBoat.State.OUTBOUND, SalvageBoat.State.COLLECTING:
			var target := loot.nearest_marked(boat.position)
			if target == null or boat.cargo.size() >= capacity():
				_set_state(SalvageBoat.State.RETURNING)
			else:
				_sail_toward(target.position, delta)
				_pick_up()
		SalvageBoat.State.RETURNING:
			if _sail_toward(dock_position, delta):
				boat.position = dock_position
				_timer = float(_config["unload_time"])
				_set_state(SalvageBoat.State.UNLOADING)
			else:
				_pick_up()
		SalvageBoat.State.UNLOADING:
			_timer -= delta
			if _timer <= 0.0:
				_unload()
				_set_state(SalvageBoat.State.DOCKED)
		SalvageBoat.State.DESTROYED:
			_timer -= delta
			if _timer <= 0.0:
				_dock_new_boat()
	_emit_status()


func _pick_up() -> void:
	var room := capacity() - boat.cargo.size()
	if room <= 0:
		return
	var picked := loot.collect_near(boat.position, pickup_radius() + LootDrop.SIZE * 0.5, room)
	if picked.is_empty():
		return
	boat.cargo.append_array(picked)
	boat.queue_redraw()
	if boat.state == SalvageBoat.State.OUTBOUND:
		_set_state(SalvageBoat.State.COLLECTING)


## Moves toward `target`, sliding around the fortress wall. Returns true on arrival.
func _sail_toward(target: Vector2, delta: float) -> bool:
	var step := speed() * delta
	var offset := target - boat.position
	if offset.length() <= step:
		boat.position = target
		return true
	var direction := offset.normalized()
	var next := boat.position + direction * step
	var clearance := fortress_radius + boat.radius + WALL_CLEARANCE
	var from_center := next - fortress_center
	if from_center.length() < clearance:
		var outward := from_center.normalized()
		var tangent := outward.orthogonal()
		if tangent.dot(direction) < 0.0:
			tangent = -tangent
		next = fortress_center + outward * clearance + tangent * step * 0.5
	boat.rotation = (next - boat.position).angle()
	boat.position = next
	return false


func _unload() -> void:
	if boat.cargo.is_empty():
		return
	var delta := {}
	for item in boat.cargo:
		var resource_name := LootRoller.NAMES[item.x]
		delta[resource_name] = int(delta.get(resource_name, 0)) + item.y
	boat.cargo.clear()
	boat.queue_redraw()
	GameState.add_resources(delta)
	run_state.add_banked(delta)
	EventBus.resources_banked.emit(delta)


func _dock_new_boat() -> void:
	boat.max_hp = _stat("hp")
	boat.hp = boat.max_hp
	boat.cargo.clear()
	boat.position = dock_position
	boat.rotation = 0.0
	_set_state(SalvageBoat.State.DOCKED)


func _set_state(next: SalvageBoat.State) -> void:
	boat.state = next
	boat.queue_redraw()
	EventBus.boat_state_changed.emit(boat, next)
	_emit_status()


## Re-sends the boat status, e.g. once the HUD exists.
func refresh_status() -> void:
	_last_status = Vector4i(-1, -1, -1, -1)
	_emit_status()


func _emit_status() -> void:
	var respawn_left := ceili(_timer) if boat.state == SalvageBoat.State.DESTROYED else 0
	var status := Vector4i(boat.state, boat.cargo.size(), capacity(), respawn_left)
	if status != _last_status:
		_last_status = status
		EventBus.boat_status.emit(status.x, status.y, status.z, status.w)


func _stat(stat: String) -> float:
	var base := float(_config[stat])
	return stats.resolve("boat." + stat, base) if stats != null else base
