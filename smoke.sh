#!/bin/sh
# smoke.sh — boot the real Aitri Hub server and assert its key entry points respond
# without a server error (5xx). This is the "green tests, dead app" catcher: a fully
# green unit/integration suite can still ship an app that 500s on first launch.
#
# Gates run WITHOUT a shell, so this must be a single executable file (declared as the
# smoke quality_gate command). Exits non-zero on any boot failure or 5xx response.
#
# @aitri-trace NFR-ID: NFR-013, NFR-011

set -eu

# Run from the repo root regardless of the caller's cwd (gates run without a shell
# and may invoke this as ../../smoke.sh from a feature dir).
cd "$(dirname "$0")"

PORT="${SMOKE_PORT:-3971}"
HUB_DIR="$(mktemp -d)"
BASE="http://127.0.0.1:${PORT}"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$HUB_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Boot the server against an isolated temp hub dir (no real projects needed).
AITRI_HUB_DIR="$HUB_DIR" AITRI_HUB_PORT="$PORT" node bin/aitri-hub.js web >/dev/null 2>&1 &
SERVER_PID=$!

# Wait for liveness (up to ~20s).
i=0
until curl -fsS "${BASE}/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 100 ]; then
    echo "SMOKE FAIL: server did not become healthy on ${BASE}/health"
    exit 1
  fi
  sleep 0.2
done

# Probe the key entry points; any 5xx (or a curl failure) fails the smoke gate.
fail=0
for route in "/health" "/" "/data/dashboard.json" "/api/projects"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${route}" || echo 000)"
  case "$code" in
    5*|000)
      echo "SMOKE FAIL: ${route} → ${code}"
      fail=1
      ;;
    *)
      echo "SMOKE ok:   ${route} → ${code}"
      ;;
  esac
done

# /health must be 200 JSON specifically (NFR-013).
health_body="$(curl -s "${BASE}/health")"
case "$health_body" in
  *'"status"'*'"ok"'*) : ;;
  *)
    echo "SMOKE FAIL: /health did not return JSON {status:ok} — got: ${health_body}"
    fail=1
    ;;
esac

if [ "$fail" -ne 0 ]; then
  echo "SMOKE FAILED"
  exit 1
fi
echo "SMOKE PASSED"
exit 0
