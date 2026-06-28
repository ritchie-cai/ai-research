#!/bin/bash
# entrypoint.sh — opencode sandbox container entry
# 1. Start sidecar (SSE client + MCP Server)
# 2. Install opencode deps if needed
# 3. Start opencode serve

set -e

echo "[entrypoint] starting sandbox=${SANDBOX_ID:-sandbox-1}"

# ── start sidecar (backround) ────────────────
node /opt/opencode/scripts/sidecar.js &
SIDECAR_PID=$!
echo "[entrypoint] sidecar started pid=${SIDECAR_PID}"

# ── wait for sidecar bootstrap ──────────────
for i in $(seq 1 30); do
  if [ -f /opt/opencode/.bootstrap_done ]; then
    echo "[entrypoint] bootstrap complete"
    break
  fi
  sleep 1
done

# ── install opencode deps (first run only) ──
cd /opencode
if [ ! -d "node_modules/effect" ]; then
  echo "[entrypoint] installing opencode dependencies (this may take a while)..."
  bun install
fi

# ── start opencode (foreground) ─────────────
echo "[entrypoint] starting opencode serve..."
exec bun run --conditions=browser packages/opencode/src/index.ts serve \
  --port 19876
