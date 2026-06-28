# OpenCode Sandbox Hot-Reload Demo

基于 `sandbox-hot-reload-design.md` 方案的可运行演示。

## 架构

```
┌──────────────────────────────────────────────┐
│  Web UI (localhost:3000)                     │
│  ├── 容器列表 + 状态                          │
│  ├── 对话面板 → opencode HTTP API (19876)    │
│  └── Skill 推送面板 → 控制面 push API         │
└──────────┬───────────────────────────────────┘
           │ HTTP
┌──────────▼───────────────────────────────────┐
│  Control Plane (Docker, :3000)               │
│  ├── /api/containers  — 容器注册表            │
│  ├── /api/events/:id   — SSE 推送通道         │
│  ├── /api/skills/push  — 推送 skill 更新      │
│  ├── /api/agents/push  — 推送 agent 更新      │
│  └── /api/bootstrap    — 全量配置拉取          │
└──────────▲───────────────────────────────────┘
           │ SSE (sidecar 主动连接)
┌──────────┴───────────────────────────────────┐
│  Host: Sidecar (Node, :19999)                │
│  ├── SSE Client → 控制面                      │
│  ├── MCP Server → opencode 连接 (tools热更)   │
│  └── Session-aware reload → opencode API     │
│                                               │
│  Host: OpenCode (bun, :19876)                │
│  ├── MCP Client → sidecar MCP Server         │
│  └── skills.paths → 本地 skill 目录           │
└──────────────────────────────────────────────┘
```

## 快速开始

```bash
# 1. 启动控制面 + Web UI（Docker）
cd opencode-hotupdate/demo
docker compose up -d

# 2. 打开 Web UI
open http://localhost:3000

# 3. 在另一个终端启动 opencode + sidecar（宿主机）
./start-local.sh
```

执行 `start-local.sh` 后，侧边栏会显示 `demo-local` 容器已注册，即可在对话面板发送消息。

## 验证热更新

1. 打开 Web UI http://localhost:3000
2. 确认 sidebar 显示 `demo-local` 在线（绿点）
3. 切换到 **Skill / Agent Push** 标签
4. 选择 `demo-local` 容器
5. 输入 skill 名称和代码，点击 "Push Skill Update"
6. 控制面通过 SSE 推送给 sidecar
7. sidecar 写文件 → 检测会话状态 → 等 idle 后调用 `POST /instance/dispose`
8. 检查 opencode 终端日志，应看到 "reload triggered" 信息

## 文件说明

```
demo/
  README.md                本文件
  docker-compose.yml       仅编排控制面 + Web UI
  start-local.sh           宿主机启动 opencode + sidecar 的脚本

  control-plane/
    Dockerfile             控制面镜像
    package.json
    server.js              HTTP API + SSE Hub + 静态文件

  web/
    index.html             SPA：容器列表 + 对话 + skill/agent 推送

  sandbox/
    Dockerfile             Docker 模式 sandbox 镜像（需要更多构建时间）
    entrypoint.sh          Docker 模式入口
    sidecar.js             Docker 模式 sidecar
    sidecar-local.js       宿主机模式 sidecar
    config/
      opencode.jsonc       opencode MCP + skills 配置
```

## 两种运行模式

### 模式 A：控制面 Docker + opencode/sidecar 宿主机（推荐）

```bash
docker compose up -d          # 控制面 + Web UI
./start-local.sh              # opencode + sidecar（需要 opencode 源码）
```

### 模式 B：全 Docker（TODO）

Sandbox 镜像需要 `build-essential` + `bun install`（~5-8 分钟首次构建）。完成后 `docker compose up --build` 即可全栈运行。

```bash
# 需要先更新 docker-compose.yml 加入 sandbox 服务定义
docker compose up --build -d
```
