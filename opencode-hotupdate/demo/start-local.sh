#!/bin/bash
# start-local.sh — 在宿主机运行 opencode + sidecar（无需 Docker sandbox）
#
# 前置条件：
#   - opencode 源码在 ~/dev/ai/ai-learning/projects/opencode
#   - control plane 已通过 docker compose up -d 启动（端口 3000）
#   - node 22+ 可用

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
OPCODE_DIR="${HOME}/dev/ai/ai-learning/projects/opencode"

echo "=== OpenCode Sandbox Demo (Local Mode) ==="
echo ""

# ── check control plane ────────────────────
if ! curl -sf http://localhost:3000/api/containers > /dev/null 2>&1; then
  echo "❌ control plane not running on :3000"
  echo "   run: docker compose up -d"
  exit 1
fi
echo "✅ control plane running"

# ── check opencode source ──────────────────
if [ ! -f "$OPCODE_DIR/packages/opencode/src/index.ts" ]; then
  echo "❌ opencode source not found at $OPCODE_DIR"
  exit 1
fi
echo "✅ opencode source found"

# ── create required dirs ───────────────────
SANDBOX_DIR="/tmp/opencode-demo-sandbox"
mkdir -p "$SANDBOX_DIR/skills" "$SANDBOX_DIR/agents" "$SANDBOX_DIR/.opencode"

# ── write opencode config ──────────────────
cat > "$SANDBOX_DIR/.opencode/opencode.jsonc" <<'EOF'
{
  "mcp": {
    "sandbox-tools": {
      "type": "remote",
      "url": "http://127.0.0.1:19999/sse"
    }
  },
  "skills": {
    "paths": ["/tmp/opencode-demo-sandbox/skills"]
  }
}
EOF

# ── start sidecar (background) ─────────────
export PLATFORM_URL="http://127.0.0.1:3000"
export SANDBOX_ID="demo-local"
export OPENCODE_URL="http://127.0.0.1:19876"
export SKILLS_DIR="$SANDBOX_DIR/skills"

node "$ROOT/sandbox/sidecar-local.js" &
SIDECAR_PID=$!
echo "✅ sidecar started (pid=$SIDECAR_PID)"

# ── wait for sidecar bootstrap ─────────────
for i in $(seq 1 10); do
  if [ -f "$SANDBOX_DIR/.bootstrap_done" ]; then
    echo "✅ sidecar bootstrap complete"
    break
  fi
  sleep 1
done

# ── start opencode ─────────────────────────
echo ""
echo "Starting opencode serve on :19876 ..."
echo "  → working dir: $SANDBOX_DIR"
echo ""

cd "$OPCODE_DIR"
exec bun run --conditions=browser packages/opencode/src/index.ts serve \
  --port 19876
