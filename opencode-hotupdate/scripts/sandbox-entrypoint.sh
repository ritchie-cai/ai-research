#!/bin/bash
# sandbox-entrypoint.sh
# opencode 沙箱容器入口，启动 sidecar 和 opencode

set -e

echo "[entrypoint] starting sandbox=${SANDBOX_ID}"

# 初始化必要目录
mkdir -p /opt/opencode/skills
mkdir -p /opt/opencode/agents

# 生成 opencode 配置（注册 sidecar 为 MCP server + skills.paths）
mkdir -p /opt/opencode/.opencode
cat > /opt/opencode/.opencode/opencode.jsonc <<EOF
{
  "mcp": {
    "sandbox-tools": {
      "type": "remote",
      "url": "http://127.0.0.1:19999/sse"
    }
  },
  "skills": {
    "paths": ["/opt/opencode/skills"]
  }
}
EOF
echo "[entrypoint] opencode config written"

# 额外 agent 配置注入（sidecar bootstrap 写 agent 文件后追加到 config）
# 此处展示合并逻辑，实际可替换为 jq 或 config merge 脚本

# 启动 sidecar（后台进程，含 MCP Server）
node /opt/opencode/scripts/sandbox-sidecar.js &
SIDECAR_PID=$!
echo "[entrypoint] sidecar started pid=${SIDECAR_PID}"

# 等待 sidecar 完成 bootstrap（最多等 30s）
for i in $(seq 1 30); do
  if [ -f /opt/opencode/.bootstrap_done ]; then
    echo "[entrypoint] bootstrap complete"
    break
  fi
  sleep 1
done

# 启动 opencode（前台，serve 模式）
# 不传 --skills-dir/--tools-dir/--config 等不存在的 flag，直接依赖 .opencode/ 目录
exec opencode serve \
  --port 19876
