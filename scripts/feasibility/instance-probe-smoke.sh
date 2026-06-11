#!/bin/bash
set -euo pipefail

binary="${1:-bin/instance_probe_multablox}"
test -x "$binary"

output="$("$binary" self-test)"
printf '%s\n' "$output" | grep -q '"ok":true'
printf '%s\n' "$output" | grep -q '"commands":'
