# Iron Harbor

Iron Harbor is a portrait-mode Android defense game built with Godot 4. A naval fortress sits in
the middle of the screen and you aim its turrets with a finger. Loot from sunk ships floats on the
water, and a salvage boat has to collect it before it sinks.

- Design and technical architecture: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- Working rules for Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Setup

Install the following on the dev machine:

1. **Godot 4.7.x**, the standard build (not .NET), available as `godot` on `PATH`. Otherwise set
   `GODOT=/path/to/godot`.
2. **Godot Android export templates** for the same version. In the editor use Editor → Manage Export
   Templates → Download, or install the `.tpz` manually.
3. **OpenJDK 17**, with `JAVA_HOME` pointing at it.
4. **Android SDK**: command-line tools, platform-tools, build-tools and one recent platform. Set
   `ANDROID_HOME` before you first open Godot, or set Editor Settings → Export → Android → Android
   SDK Path.
5. A phone with USB debugging enabled, for `adb install`.

## Commands

```sh
godot --headless --import                                   # first run after cloning
tools/run_tests.sh                                          # unit tests (GUT)
godot --headless --export-debug "Android" build/iron-harbor-debug.apk
adb install -r build/iron-harbor-debug.apk
```

Godot signs debug builds with its own debug keystore. You can point it at another keystore with
`GODOT_ANDROID_KEYSTORE_DEBUG_PATH`, `GODOT_ANDROID_KEYSTORE_DEBUG_USER` and
`GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD`. Release builds use the matching `..._RELEASE_...`
variables. Keystores never go into the repository.

## Status

Milestones M0 (project and pipeline), M1 (core combat) and M2 (waves and data) are done. See the milestone list in
[`CLAUDE.md`](CLAUDE.md).
