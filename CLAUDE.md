# Iron Harbor — rules for Claude Code

Portrait-mode Android naval fortress defense game. The full spec is `docs/GAME_DESIGN.md`. It is
the source of truth: read the relevant sections before you start a task, and **ask before changing
anything in it**.

## Stack

- Godot **4.7** (standard build, not .NET) with statically typed GDScript. The project currently
  targets 4.7.2-stable.
- GUT 9.7.1 (the Godot 4.7 line) is vendored in `addons/gut/`. Do not edit it; upgrade it by
  replacing the whole folder.
- Android: arm64-v8a, Mobile renderer with Compatibility (OpenGL) fallback. Portrait design
  resolution 1080 × 2400, stretch `canvas_items`, aspect `expand`.

## Commands

```sh
tools/run_tests.sh                                          # import + GUT suite; non-zero on failure or load error
godot --headless --export-debug "Android" build/iron-harbor-debug.apk
adb install -r build/iron-harbor-debug.apk                  # USB-connected phone
godot --headless --export-debug "Android Sandbox" build/iron-harbor-test-debug.apk  # test build
```

- Use `tools/run_tests.sh`, not the bare `gut_cmdln.gd` command. GUT skips a test script that fails
  to parse and can still report "All tests passed!" with exit code 0; the wrapper catches that.
- Set `GODOT=/path/to/godot` if the binary is not on `PATH` as `godot`.
- Run `godot --headless --import` after cloning, after adding assets, and after adding or renaming a
  `class_name`. Headless runs do not rescan the global class cache, so a new class is undefined
  until the next import. `run_tests.sh` imports for you.
- Export needs the Android export templates for the exact Godot version, the Android SDK path
  (`ANDROID_HOME` set before Godot first creates its editor settings, or Editor Settings → Export →
  Android → Android SDK Path), and JDK 17 (`JAVA_HOME`).
- Signing: Godot creates and uses its own debug keystore, or you can override it with
  `GODOT_ANDROID_KEYSTORE_DEBUG_PATH` / `_USER` / `_PASSWORD`. Release builds use
  `GODOT_ANDROID_KEYSTORE_RELEASE_PATH` / `_USER` / `_PASSWORD`. Never commit keystores or
  passwords. `export_presets.cfg` stays free of secrets, because Godot stores those in
  `.godot/export_credentials.cfg`.
- The non-Gradle export uses the template's `minSdk` 24, which covers the API 26 target. Enforcing a
  hard floor of 26 would need a Gradle build (`gradle_build/min_sdk`).

## Workflow

- Do one milestone per session (GAME_DESIGN.md section 16). Plan first, then implement. Never start
  the next milestone while the previous one is broken.
- After every task, run `tools/run_tests.sh` and a debug export, and keep the suite green.
- Commit after each finished step, with clear messages.
- When the user should check a milestone on a device, say exactly what to look for.

## Code rules

- **Code-first scenes.** A `.tscn` holds only the root node and its script. Build children in
  `_ready()` from code or data, so no change ever needs the visual editor.
- **Pure rules in `core/`.** Gameplay math (damage, stats, wave budget, economy, loot) lives in
  `RefCounted` classes with no node dependencies. Every rule has GUT tests in `tests/`.
- **Static typing everywhere** (`var hp: float`, typed arrays, return types). Give every reusable
  script a `class_name`, except autoloads, whose autoload name is already the global.
- **No hard-coded tunables.** Every balance number lives in `data/*.json` and is read through
  `DataRegistry`. Presentation constants such as colors and font sizes may stay in scripts until
  the shared `Theme` exists.
- **Decoupled systems.** Systems never call each other's internals. They talk through `EventBus`
  signals or through dependencies the Battle root injects in `_ready()`.
- **Thin entities, behavior in systems.** Enemy AI is a strategy `RefCounted` chosen by the
  `behavior` id in data. `RunState` holds run-only data and `GameState` holds permanent data. Only
  `SalvageSystem` writes resources into `GameState`.
- **Performance.** Anything spawned repeatedly comes from `ObjectPool` (`acquire()` / `release()`
  and `reset()`). Projectiles are not physics bodies; they use `SpatialGrid`. Avoid per-frame
  allocations, `get_nodes_in_group()` in hot loops and string-keyed dictionaries in per-frame code.
- **Determinism.** One run seed feeds separate RNG streams for waves, loot, elites and perks.
- **UI.** All player-facing strings go through translation keys in `locale/translations.csv`
  (columns `keys,sk,en`; Slovak is the default). Touch targets are at least 48 dp, and layouts
  respect `DisplayServer.get_display_safe_area()`.
- **Art.** Use placeholder shapes drawn in code until final art arrives. A `visual` field in the data
  picks the shape or the sprite. Use only assets with a clear license and record each one in
  `CREDITS.md`.

## Conventions

- **Data files.** `weapons.json` and `enemies.json` are arrays of definitions with unique `id`s;
  `balance.json` and `waves.json` are objects. Distances are design pixels (1080-wide portrait),
  times are seconds, rates are per second and angles are degrees (code converts to radians).
  Fields the design doc does not list yet: enemy `radius` (hit circle) and `visual` (placeholder
  shape id), weapon `projectile_speed`, `spread` and `splash_radius`.
- **Wave enemies** need `first_wave`, `budget_cost` and `group_size`; definitions without them
  (e.g. `enemy_torpedo`) are only spawned by other enemies. `"counts_as_kill": false` keeps
  shot-down projectiles out of the kill count. Attack Drones cost 0.4 each with groups of exactly
  5, which is the design's "2 per group".
- **Loot.** `loot_tables.json` is an object of tables; `credits` is a flat base amount, other
  resources are `{ "chance", "amount" }`. Wave enemies need a `loot_table`. Resources are named
  credits, steel, electronics and cores everywhere (`LootRoller.NAMES`).
- **Only `SalvageSystem._unload()` banks resources** (GameState and RunState.banked). Nothing else may
  add to GameState.resources.
- **Touch radius for loot** is `balance.json` → loot.mark_radius = 120 design px, about 48 dp on a
  typical phone. Taps near loot mark it instead of aiming (section 3, rule 2).
- **Salvage Hunter numbers the design leaves open:** contact damage 5 to the base and
  `boat_damage` 25 to the salvage boat (2 rams sink a fresh boat).
- **Save file.** `GameState.data` is the save layout of section 11 (`SaveMigrator.defaults()`).
  When the layout changes, bump `SaveMigrator.CURRENT_VERSION` and add a migration step with its
  own test. `SaveStore` writes atomically (`.tmp` → rename, previous file kept as `.bak`).
- **Tests and the save.** `tests/pre_run.gd` points GameState at `user://test_save.json`.
  Integration tests call `GameState.reset()` in `before_each` and set `battle.leave_on_end = false`,
  so a finished run does not switch scenes under GUT.
- **Upgrades.** `upgrades.json` has `weapon_tracks` (applied to every weapon as
  `weapon.<id>.<track>`), `weapon_specials` and `tracks`. Levels become StatResolver modifiers
  (`mul` with `compound` = per_level^n, `mul` without it = 1 + (per_level − 1)·n, `add` = per_level·n).
  Stats in use: weapon.damage/fire_rate/range/turn_speed/spread/splash_radius,
  fortress.max_hp/damage_taken/regen/turret_slots, boat.speed/cargo/pickup_radius/hp and
  loot.float_time. Repair Crews are read as a base 0.5 HP/s plus 0.25 HP/s per level. The machine
  gun's special track (spread) and all cost constants are first guesses for M8 to tune. Shield
  Generator, Auto-Targeting, Radar, Dual Command, Auto-Salvage, Fleet and the Salvage Drone are added
  together with their mechanics in M5/M6.
- **Screens** switch only through `SceneRouter` (paths are constants there); battles start with
  `SceneRouter.start_battle(sector, resume)`, which fills `GameState.pending_run`.
- **Weapons by projectile kind.** `projectile` is bullet, shell, missile, torpedo, lob, beam or rail;
  `DataValidator.KIND_STATS` lists the base stats each kind needs (the laser has no fire_rate, so
  it has no Fire Rate track). Extra weapon fields: `salvo`, `pierce`, `projectile_turn`,
  `heat_capacity`, `cooldown`, `charge_time` and `unlock` (`best_wave`, `cost`). Weapons are
  unlocked only through `GameState.unlock_weapon()`.
- **Test build.** The "Android Sandbox" preset adds the `sandbox` feature tag and installs as a
  separate app (`com.matej.ironharbor.sandbox`, "Iron Harbor TEST") with its own save. `Sandbox`
  (`core/sandbox.gd`, numbers in `balance.json` → sandbox) tops up resources, unlocks all weapons,
  sets best wave 50 and one boss kill on load, and the sector screen offers starting at later
  waves. It is the only exception to the SalvageSystem-only resources rule.
- **Aim.** A finger's aim angle is measured from the fortress center; Auto-Targeting and aim
  assist aim from the turret itself at an enemy (`Turret.target_angle()`).
- **New behaviors** go into both `EnemySystem._make_behavior()` and `DataValidator.BEHAVIORS`.
- **Ranges are measured from the fortress center**, like every distance in the design (engage
  distances, weapon ranges). Turrets sit off center, so shots and the aim line end on the range
  circle around the center (`Turret.reach()`).
- **StatResolver.** A stat is (base + Σ add) × Π mul; a `set` modifier replaces the result; caps from
  `balance.json` → `stat_caps` (`max_mul`, `max`, `min`) apply last. Turrets re-read their stats on
  `changed`.
- **Strings in data, ints at runtime.** Definitions are converted when an entity is set up
  (`CombatTypes` parses damage types, armor and domains), so per-frame code compares ints.
- **Battle stepping.** `battle/battle.gd` builds the world, systems and HUD and calls each system's
  `tick(delta)` in a fixed order: waves → enemies → grid rebuild → turrets → projectiles → effects.
  Integration tests turn physics processing off and call `battle.step()` themselves; set
  `run_seed` and `first_wave` before adding the battle to the tree.
- **Pause.** The HUD runs while the tree is paused. Android back toggles the pause overlay
  (`quit_on_go_back` is off) and leaving the app pauses the battle.
- **Translations.** Add keys to `locale/translations.csv`, run the import, and commit the
  regenerated `locale/*.translation` files too. They are small and deterministic, and committing
  them keeps a fresh clone free of "missing translation" errors. A new locale also has to be added
  to `internationalization/locale/translations` in `project.godot`.

## Layout

```
autoload/   EventBus, DataRegistry, GameState, SceneRouter, AudioManager
core/       pure rules (unit-tested)
battle/     battle.gd (root), entities/, systems/, behaviors/ (enemy AI), layers/ (drawing), hud/
meta/       splash, main menu, sector select, shipyard, results
ui/         shared widgets, theme
data/       JSON configs
locale/     translations.csv
assets/     sprites, audio, fonts
tests/      GUT tests: unit/ for core rules, integration/ for the stepped battle (config in .gutconfig.json)
tools/      run_tests.sh, balance simulator, debug menu
```

## Milestone status

- [x] M0 – Project and pipeline. Includes the folder layout, autoload stubs, GUT, the Android
  export preset and a splash screen that shows "Iron Harbor" in portrait. Tests are green, the
  headless debug export works, and the APK has been installed and launched on the designer's phone.
- [x] M1 – Core combat. Includes the ocean and fortress, one Machine Gun turret with
  turn-speed aiming, the aim line and fire tolerance, bullets as pooled flat arrays, and Raider
  Skiffs trickling in from the side edges. Also damage with armor and crits, base HP, a slow-motion
  game over with retry, and SK/EN translations. `WaveDirector` is a temporary trickle spawner
  (`waves.json` → `trickle`) that M2 replaces. Checked on the designer's phone.
- [x] M2 – Waves and data. Includes DataRegistry with DataValidator, StatResolver, WaveGenerator
  (budget, featured types, formations, edges, pincers, timeline) and the WaveDirector lifecycle
  (PREPARE → ACTIVE → CLEANUP → BREAK). The first five wave enemies are Raider Skiff, Patrol Boat,
  Attack Drone, Torpedo Boat (with shootable torpedoes) and Armored Gunboat; the Salvage Hunter
  comes with M3. Also the Naval Cannon with splash, turret selection via the bottom bar or by
  touching a turret, the wave banner and countdown, and pause. Not in yet: boss waves (M6), perk
  breaks (M6) and elites (M5). Balance is untuned: a naive auto-aim bot dies around wave 3 against
  the design's target of wave 8–10 on a fresh save, which M8 tunes. Checked on the designer's phone.
- [x] M3 – Loot and salvage. Includes LootRoller, loot tables, floating crates that drift, blink,
  sink and merge, tap-to-mark, and the salvage boat state machine (outbound, collecting with
  nearest-neighbor re-planning, returning around the fortress, 0.8 s unloading, recall by tapping
  the dock, destruction with cargo spill and respawn). Also the Salvage Hunter, HUD resource
  counters and boat status, and banked resources in the game over summary. Resources live in
  GameState for the app session until saving arrives in M4. Checked on the designer's phone.
- [x] M4 – Meta progression and save. Includes SaveStore (atomic write, backup fallback), the
  SaveMigrator framework, GameState saving after purchases, at wave breaks (run snapshot with
  continue from the next wave), at run end and on app pause/close. Also the Upgrades catalog with
  the cost formula, tier gates and listed slot costs; the Shipyard (Arsenal, Loadout, Fortress,
  Salvage) with effect now → next; and the main menu (continue, play, Shipyard, SK/EN toggle,
  quit confirm on back), sector select (sector 1 playable, 2–4 shown locked) and results screens.
  The pause menu offers resume / abandon run. The Loadout tab uses ◀ ▶ buttons instead of drag and
  drop. Checked on the designer's phone.
- [x] M5 – Full arsenal and bestiary. Includes all 7 weapons (missiles home in and retarget,
  torpedoes pierce and hit Submerged, depth charges are lobbed to the aim point, the laser is a
  heat-limited beam, the railgun charges and hits everything in line), weapon unlocks in the
  Arsenal tab, all 12 wave enemies with shields, the frigate aura, submarine surfacing, bombs,
  mines, missiles and turret knock-out, and elites (wave 15+). Also Shield Generator,
  Auto-Targeting (unselected turrets fire at 20–70 % of their rate at the threat closest to the
  fortress), aim assist, Radar (edge arrows and next-wave preview) and Dual Command (a second
  finger aims the previously selected turret). Unlock costs, the new specials and the numbers the
  design leaves open are first guesses for M8. Waiting for the on-device check.
- [ ] M6 – Bosses, perks, sectors
- [ ] M7 – Polish
- [ ] M8 – Balance and release
