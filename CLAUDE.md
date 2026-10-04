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
  the design's target of wave 8–10 on a fresh save, which M8 tunes. Waiting for the on-device check.
- [ ] M3 – Loot and salvage
- [ ] M4 – Meta progression and save
- [ ] M5 – Full arsenal and bestiary
- [ ] M6 – Bosses, perks, sectors
- [ ] M7 – Polish
- [ ] M8 – Balance and release
