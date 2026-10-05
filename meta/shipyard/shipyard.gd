class_name Shipyard
extends Control
## Shipyard, the hub between runs (GAME_DESIGN.md sections 8 and 12): resource bar and the tabs
## Arsenal (per-weapon upgrade tracks and tier-ups), Loadout (weapons per turret slot), Fortress
## and Salvage. Each upgrade card shows its level, effect now → next and cost, and is disabled
## while it cannot be bought. Weapons not unlocked yet are listed below with their requirement
## and an unlock button.
##
## The Loadout tab uses ◀ ▶ buttons per slot instead of the design's drag and drop for now.

enum Tab { ARSENAL, LOADOUT, FORTRESS, SALVAGE }

const TAB_KEYS: PackedStringArray = ["TAB_ARSENAL", "TAB_LOADOUT", "TAB_FORTRESS", "TAB_SALVAGE"]
const SHOWN_RESOURCES: PackedStringArray = ["credits", "steel", "electronics", "cores"]
const WEAPON_TRACK_ORDER: PackedStringArray = ["dmg", "rate", "range", "turn", "special", "tier"]

var tab := Tab.ARSENAL

var _resource_bar: Control
var _resource_holder: VBoxContainer
var _tab_buttons: Array[Button] = []
var _content: VBoxContainer


func _ready() -> void:
	var column := UiKit.screen(self)
	column.add_child(UiKit.label(tr("MENU_SHIPYARD"), UiKit.TITLE_SIZE))
	_resource_holder = VBoxContainer.new()
	column.add_child(_resource_holder)
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 12)
	column.add_child(tabs)
	for i in TAB_KEYS.size():
		var button := UiKit.button(tr(TAB_KEYS[i]), show_tab.bind(i), UiKit.SMALL_SIZE)
		button.name = "Tab%d" % i
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tabs.add_child(button)
		_tab_buttons.append(button)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	_content = VBoxContainer.new()
	_content.name = "Content"
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content.add_theme_constant_override("separation", 20)
	scroll.add_child(_content)
	var footer := HBoxContainer.new()
	footer.add_theme_constant_override("separation", 20)
	column.add_child(footer)
	var menu := UiKit.button(tr("BUTTON_MENU"), SceneRouter.goto.bind(SceneRouter.MAIN_MENU))
	menu.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(menu)
	var play := UiKit.button(tr("MENU_PLAY"), SceneRouter.goto.bind(SceneRouter.SECTOR_SELECT), UiKit.TEXT_SIZE, true)
	play.name = "Play"
	play.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(play)
	show_tab(Tab.ARSENAL)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		SceneRouter.goto(SceneRouter.MAIN_MENU)


func show_tab(index: int) -> void:
	tab = index as Tab
	for i in _tab_buttons.size():
		UiKit.style_button(_tab_buttons[i], i == index)
	_refresh()


## Buys the next level of `key` and redraws. Returns true on success.
func buy(key: String) -> bool:
	var bought := GameState.purchase(key)
	_refresh()
	return bought


func _refresh() -> void:
	if _resource_bar != null:
		_resource_bar.queue_free()
	var amounts := {}
	for resource_name in SHOWN_RESOURCES:
		amounts[resource_name] = GameState.resource(resource_name)
	_resource_bar = UiKit.resource_row(amounts)
	_resource_holder.add_child(_resource_bar)
	for child in _content.get_children():
		_content.remove_child(child)
		child.queue_free()
	match tab:
		Tab.ARSENAL:
			for weapon_id: String in GameState.unlocked_weapons():
				_content.add_child(UiKit.label(tr(str(DataRegistry.weapon(weapon_id)["name_key"])), UiKit.HEADING_SIZE,
						UiKit.ACCENT_COLOR))
				for track_id in WEAPON_TRACK_ORDER:
					var key := "weapon.%s.%s" % [weapon_id, track_id]
					if GameState.upgrades.tracks.has(key):
						_content.add_child(_card(key))
			for weapon_id: String in DataRegistry.weapons:
				if not weapon_id in GameState.unlocked_weapons():
					_content.add_child(_unlock_card(weapon_id))
		Tab.LOADOUT:
			_build_loadout()
		Tab.FORTRESS, Tab.SALVAGE:
			var tab_name := "fortress" if tab == Tab.FORTRESS else "salvage"
			for key in GameState.upgrades.order:
				if GameState.upgrades.track(key).tab == tab_name:
					_content.add_child(_card(key))


func _card(key: String) -> Control:
	var track := GameState.upgrades.track(key)
	var level := GameState.upgrade_level(key)
	var block := GameState.purchase_block(key)
	var card := UiKit.panel()
	card.name = "Card_" + key.replace(".", "_")
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	card.add_child(row)

	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(info)
	info.add_child(UiKit.label(tr(track.name_key), UiKit.TEXT_SIZE))
	info.add_child(UiKit.label(tr("UPGRADE_LEVEL") % [level, track.max_level], UiKit.SMALL_SIZE, UiKit.MUTED_COLOR))
	var effect := UpgradeEffects.describe(key, level)
	if level < track.max_level:
		effect += "  →  " + UpgradeEffects.describe(key, level + 1)
	info.add_child(UiKit.label(effect, UiKit.SMALL_SIZE, UiKit.GOOD_COLOR))

	var side := VBoxContainer.new()
	side.custom_minimum_size.x = 330.0
	side.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(side)
	if block == Upgrades.Block.MAX_LEVEL:
		side.add_child(UiKit.label(tr("UPGRADE_MAXED"), UiKit.TEXT_SIZE, UiKit.ACCENT_COLOR, HORIZONTAL_ALIGNMENT_CENTER))
		return card
	side.add_child(UiKit.resource_row(GameState.upgrades.cost(key, level), UiKit.SMALL_SIZE))
	var text := tr("BUTTON_BUY")
	match block:
		Upgrades.Block.LOCKED:
			if track.unlock_bosses > 0:
				text = tr("UPGRADE_LOCKED_BOSSES") % track.unlock_bosses
			else:
				text = tr("UPGRADE_LOCKED") % track.unlock_wave
		Upgrades.Block.NEEDS_TIER:
			text = tr("UPGRADE_NEEDS_TIER")
	var button := UiKit.button(text, buy.bind(key), UiKit.SMALL_SIZE, block == Upgrades.Block.NONE)
	button.name = "Buy"
	button.disabled = block != Upgrades.Block.NONE
	side.add_child(button)
	return card


## Unlocks `weapon_id` and redraws. Returns true on success.
func unlock(weapon_id: String) -> bool:
	var done := GameState.unlock_weapon(weapon_id)
	_refresh()
	return done


func _unlock_card(weapon_id: String) -> Control:
	var def := DataRegistry.weapon(weapon_id)
	var block := GameState.weapon_unlock_block(weapon_id)
	var card := UiKit.panel()
	card.name = "Unlock_" + weapon_id
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	card.add_child(row)
	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(info)
	info.add_child(UiKit.label(tr(str(def["name_key"])), UiKit.HEADING_SIZE, UiKit.MUTED_COLOR))
	info.add_child(UiKit.label(tr(str(def["name_key"]) + "_DESC"), UiKit.SMALL_SIZE, UiKit.MUTED_COLOR))
	var side := VBoxContainer.new()
	side.custom_minimum_size.x = 330.0
	side.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(side)
	side.add_child(UiKit.resource_row(GameState.weapon_unlock_cost(weapon_id), UiKit.SMALL_SIZE))
	var text := tr("BUTTON_UNLOCK")
	if block == Upgrades.Block.LOCKED:
		text = tr("UPGRADE_LOCKED") % int(def.get("unlock", {}).get("best_wave", 0))
	var button := UiKit.button(text, unlock.bind(weapon_id), UiKit.SMALL_SIZE, block == Upgrades.Block.NONE)
	button.name = "Unlock"
	button.disabled = block != Upgrades.Block.NONE
	side.add_child(button)
	return card


func _build_loadout() -> void:
	_content.add_child(UiKit.label(tr("LOADOUT_HINT") % int(DataRegistry.balance["max_mounts_per_weapon"]),
			UiKit.SMALL_SIZE, UiKit.MUTED_COLOR))
	var loadout := GameState.loadout()
	for slot in loadout.size():
		var card := UiKit.panel()
		card.name = "Slot%d" % slot
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 16)
		card.add_child(row)
		var weapon_name := tr("LOADOUT_EMPTY") if loadout[slot] == "" else tr(str(DataRegistry.weapon(loadout[slot])["name_key"]))
		var text := UiKit.label(tr("LOADOUT_SLOT") % [slot + 1, weapon_name], UiKit.TEXT_SIZE)
		text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(text)
		for step in [-1, 1]:
			var arrow := UiKit.button("◀" if step < 0 else "▶", cycle_slot.bind(slot, step))
			arrow.custom_minimum_size.x = 130.0
			row.add_child(arrow)
		_content.add_child(card)


## Steps slot `slot` to the previous or next weapon (or empty) that may be mounted there.
func cycle_slot(slot: int, step: int) -> void:
	var choices: Array = [""]
	choices.append_array(GameState.unlocked_weapons())
	var index := choices.find(GameState.loadout()[slot])
	for i in choices.size():
		index = posmod(index + step, choices.size())
		if GameState.set_loadout_slot(slot, str(choices[index])):
			break
	_refresh()
