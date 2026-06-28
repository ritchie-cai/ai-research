#!/bin/bash
# start-local.sh — 在宿主机运行 opencode + sidecar（无需 Docker sandbox）
#
# 前置条件：
#   - opencode 源码在 ~/dev/ai/ai-learning/projects/opencode
#   - control plane 已通过 docker compose up -d 启动（端口 3000）
#   - node 22+ 可用

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== OpenCode Sandbox Demo (Local Mode) ==="
echo ""

# ── check control plane ────────────────────
if ! curl -sf http://localhost:3000/api/containers > /dev/null 2>&1; then
  echo "❌ control plane not running on :3000"
  echo "   run: docker compose up -d"
  exit 1
fi
echo "✅ control plane running"

# ── check opencode binary ──────────────────
OPENCODE_BIN="${HOME}/.opencode/bin/opencode"
if [ ! -x "$OPENCODE_BIN" ]; then
  echo "❌ opencode binary not found at $OPENCODE_BIN"
  exit 1
fi
echo "✅ opencode binary found"

if ! "$OPENCODE_BIN" serve --help > /dev/null 2>&1; then
  echo "❌ opencode binary does not support 'serve' command"
  exit 1
fi
echo "✅ opencode serve command available"

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

cd "$SANDBOX_DIR"
exec "$OPENCODE_BIN" serve --port 19876
