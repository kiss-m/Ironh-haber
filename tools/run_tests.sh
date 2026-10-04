#!/usr/bin/env bash
# Runs the GUT suite headlessly and fails on test failures *and* on scripts that did not load.
#
# GUT skips a test script that fails to parse (e.g. a class_name missing from the global class
# cache) and can still exit 0 with "All tests passed!", so this wrapper imports first and then
# treats any load error in the output as a failure.
#
# Usage: tools/run_tests.sh [extra GUT args, e.g. -gselect=damage]
# Set GODOT to the Godot 4 binary if it is not on PATH as "godot".
set -euo pipefail

GODOT="${GODOT:-godot}"
cd "$(dirname "$0")/.."

"$GODOT" --headless --import >/dev/null 2>&1

log="$(mktemp)"
trap 'rm -f "$log"' EXIT

status=0
"$GODOT" --headless -s addons/gut/gut_cmdln.gd -gexit "$@" 2>&1 | tee "$log" || status=$?

if grep -qE "Parse Error|Failed to load script" "$log"; then
	echo "run_tests.sh: a script failed to load; see the errors above." >&2
	exit 1
fi
exit "$status"
