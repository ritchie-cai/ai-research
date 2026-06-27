# 沙箱热更新 + 编译隔离完整方案

> 目标：skill/agent/tool 全部支持热更新，不重启沙箱，不修改 opencode 源码；编译/打包在独立沙箱中完成，多租户数据完全隔离。

---

## 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│  平台（控制面）                                                     │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐   │
│  │ Admin API    │   │ SSE Hub      │   │ Compile Dispatcher │   │
│  │ 发布 skill / │──►│ 按 sandbox_id│   │ 编译任务调度         │   │
│  │ agent / tool │   │ 推送事件      │   │ 实例池 + Redis 锁    │   │
│  └──────────────┘   └──────┬───────┘   └─────────┬──────────┘   │
│                            │ SSE 长连接            │ HTTP         │
└────────────────────────────┼──────────────────────┼──────────────┘
                             ▼                      ▼
┌─────────────────────────────────┐   ┌──────────────────────────────┐
│  opencode 沙箱                  │   │  编译沙箱集群                  │
│                                 │   │                              │
│  sidecar（独立 Node 进程）       │   │  compiler-esp32 ×2           │
│  ├── SSE 客户端（接平台）         │   │  compiler-stm32 ×1           │
│  ├── MCP Server (HTTP/SSE) ─────┼──►│  compiler-riscv ×1           │
│  │   └── tool 实现 + tools/list  │   │                              │
│  ├── skill/agent 文件管理        │   │  每实例单任务，任务级目录隔离   │
│  ├── 会话状态监听（/event SSE）   │   │  产物返回调度层，不直接写云存   │
│  └── 触发 instance reload       │   └──────────────────────────────┘
│                                 │
│  opencode（原生，不改源码）       │
│  ├── MCP 连接 sidecar → tool 热更 │
│  ├── skills.paths → 静态加载     │
│  └── POST /instance/dispose     │
│       触发全量重载（skill/agent）  │
└─────────────────────────────────┘
```

**核心思路**：
- **Tool 热更新**：sidecar 作为 MCP Server 运行，利用 opencode 原生支持的 `tools/list_changed` 通知机制实现零中断热更。
- **Skill/Agent 热更新**：sidecar 写文件后通过 `POST /instance/dispose` 触发 opencode 重载，重载前先检测会话状态，对话中则暂存待执行。

---

## Part 1：Tool 热更新（MCP 模式）

### 原理

opencode 源码 `packages/opencode/src/mcp/index.ts:508-519` 已实现对 MCP `notifications/tools/list_changed` 的响应：收到通知后自动重新调用 `tools/list` 并更新内存中的工具列表，下一次 LLM turn 自动使用新工具。

sidecar 运行一个 MCP-compatible HTTP 服务，opencode 通过配置将其注册为 MCP server。sidecar 收到平台 SSE 推送后，更新内部 tool 实现并发送 `tools/list_changed` 通知。

**无需 proxy 文件、无需文件写入、无需改 opencode 源码、无需实例重载。**

### opencode 配置

在 `.opencode/opencode.jsonc` 中注册 sidecar 为 MCP server：

```jsonc
{
  "mcp": {
    "sandbox-tools": {
      "type": "remote",
      "url": "http://127.0.0.1:19999/sse"
    }
  }
}
```

opencode 启动时自动通过 MCP 协议连接 sidecar，拉取初始 tool 列表。参考 `packages/opencode/src/mcp/index.ts:304-419` 的连接流程（优先 StreamableHTTP，fallback SSE）。

### sidecar MCP Server 实现要点

sidecar 需实现 MCP 协议以下能力：
- `tools/list` — 返回当前所有 tool 定义
- `tools/call` — 执行指定 tool，返回结果
- `notifications/tools/list_changed` — 工具列表变更时主动通知 opencode

可基于 `@modelcontextprotocol/sdk` 构建，工具实现逻辑完全在 sidecar 内部管理，平台通过 SSE 推送更新指令。

### 更新时序

```
CI/CD 部署新版 tool 代码
  → POST /registry/tools/{name}/upgrade { code: "..." }
  → SSE Hub 推送 tool_updated 事件（携带完整代码）
  → 沙箱 sidecar 收到事件，更新内部 tool 注册表
  → sidecar 发送 MCP "tools/list_changed" 通知给 opencode
  → opencode 自动调用 tools/list 获取最新工具列表
  → 下一轮 LLM 对话立即使用新 tool  ✓
  → 无需重启 opencode，无中断  ✓
```

### 相关脚本

| 文件 | 说明 |
|---|---|
| `scripts/sandbox-sidecar.js` | 沙箱内 sidecar，SSE 客户端 + MCP Server + skill 文件管理 |
| `scripts/sandbox-mcp-server.js` | MCP Server 核心，tools/list、tools/call、list_changed 通知 |
| `scripts/platform-sse-hub.js` | 平台侧 SSE 推送服务 |
| `scripts/sandbox-entrypoint.sh` | 容器入口，先启动 sidecar，再启动 opencode |

---

## Part 2：Skill / Agent 热更新（Instance Reload + 会话感知）

### 原理

Skill 和 Agent 在 opencode 中通过配置目录和 `skills.paths` 加载，仅在 instance bootstrap 时初始化（`packages/opencode/src/skill/index.ts:173-233`、`packages/opencode/src/agent/agent.ts:283-310`）。更新需要触发 `POST /instance/dispose`（`packages/opencode/src/server/routes/instance/httpapi/groups/instance.ts:44`），opencode 销毁当前 instance 后由客户端自动重建。

为避免在用户活跃对话时中断，sidecar 在触发 reload 前先检测会话状态，对话中则暂存待执行。

### 会话状态检测

sidecar 通过两种方式确认沙箱是否可安全重载：

**方式一：轮询（最简单）**
```
GET /instance/session/status
```
返回 `{ "ses_xxx": { "type": "busy" } }` 表示有活跃会话——idle 的 session 会从 Map 中移除（`packages/opencode/src/session/status.ts:81-83`）；返回 `{}` 表示全部空闲，可安全重载。

**方式二：SSE 实时监听（更精准）**
订阅 `GET /instance/event`（`packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:27`），过滤 `session.status` 事件跟踪每个 session 的 busy/idle 状态，全部 idle 时自动触发重载。

### 更新时序

```
开发者在平台发布新版 skill/agent
  → Admin API 调用 pushSkill(sandbox_id, name, code)
  → SSE Hub 推送 skill_updated 事件（携带完整代码）
  → 沙箱 sidecar 收到事件
      ├── poll GET /session/status
      │     ├── 有空闲 = 无活跃会话 → 写入文件, POST /instance/dispose →
      │     │     opencode 重载, 新 session 使用新版 ✓
      │     └── 有 busy → 写入文件, 加入 pending_updates, 等 idle
      │
      └── (或 SSE 监听) 等 session.status -> idle → 触发 POST /instance/dispose
                                                → opencode 重载 ✓
```

### 触发 reload 后的影响

`POST /instance/dispose` 销毁当前 instance（含所有 session），opencode 客户端（CLI run 或 TUI）检测到 instance disposed 后会自动创建新 instance，重新执行 bootstrap → 加载最新 skill 文件、agent 配置。中断时间约 1-2 秒，发生在会话空闲窗口，对用户基本无感。

### 沙箱冷启动（SSE 建立前的初始化）

sidecar 启动时先调用 `/sandbox/bootstrap` 拉取全量配置（skills + agents + MCP tool 定义），完成后再启动 MCP server 和 opencode，避免启动窗口期丢失变更。详见 `scripts/sandbox-sidecar.js` → `bootstrap()`。

### 相关脚本

| 文件 | 说明 |
|---|---|
| `scripts/sandbox-sidecar.js` | 沙箱内 sidecar（同上），包含 session status 检测 + reload 触发 |
| `scripts/platform-sse-hub.js` | 平台侧 SSE 推送服务 |
| `scripts/sandbox-entrypoint.sh` | 容器入口 |

---

## Part 3：编译 / 打包独立沙箱

### 设计原则

- opencode 沙箱只负责对话和代码生成，**不执行编译**
- 编译是 CPU 密集型操作，独立沙箱隔离，不影响对话体验
- 按芯片平台划分编译池，工具链互不干扰
- 每个编译实例**单任务**处理，靠实例池水平扩展，不靠单实例并发

### 实例池模型

```
同时有 5 个 ESP32 编译任务进来：
  ESP32 池有 2 个实例 → 2 个立即开跑
  剩余 3 个 → 调度层返回 503，前端提示稍后重试（早期策略）

第一个实例完成 → Redis 锁释放 → 可接受新任务
```

早期不做队列，保持简单。观察 503 频率，超过 5% 时手动 `docker-compose scale` 扩实例。

### 相关脚本

| 文件 | 说明 |
|---|---|
| `scripts/compiler-worker.js` | 编译沙箱内的 HTTP worker，单任务锁 + 临时目录隔离 |
| `scripts/platform-compile-dispatcher.js` | 调度层，Redis 实例池 + 路由 + 产物存储 |
| `scripts/docker-compose.compiler.yml` | 编译沙箱 + 调度层的 compose 配置 |
| `scripts/Dockerfile.compiler-esp32` | ESP32 编译镜像，其他芯片平台复制后替换工具链 |

---

## Part 4：多租户数据隔离

编译流程中三层隔离保证租户数据不互窜：

### 第一层：身份隔离（源码拉取）

调度层为每个任务申请**短期只读 Git token**，TTL 覆盖编译时间（15min），scope 限定单个 repo，编译沙箱拿不到租户长期凭证。

```
调度层  →  向 Git 服务申请短期 token（只读 + 单 repo + TTL=15min）
       →  token 随编译任务下发给编译沙箱
       →  编译完成后 token 自然失效
```

### 第二层：执行隔离（编译过程）

每个任务在编译沙箱内使用**独立临时目录**，任务结束立即清理：

```
/tmp/tasks/{task_id}/     ← 用 task_id 而非 tenant_id，防止信息泄露
  src/                    ← git clone 的源码
  build/                  ← 编译产物
```

编译进程使用最小化环境变量（不继承宿主机环境），HOME 指向任务目录。详见 `scripts/compiler-worker.js`。

### 第三层：产物隔离（存储）

编译沙箱**不直接写云存**，产物 base64 返回给调度层，由调度层写入租户隔离路径：

```
s3://your-platform-artifacts/
  tenants/{tenant_id}/
    tasks/{task_id}/
      firmware.bin
```

调度层生成**限时签名 URL**（1小时有效）返回给租户，其他租户无法访问。详见 `scripts/platform-compile-dispatcher.js` → `saveArtifact()`。

### 完整数据流

```
租户A 发起编译请求
  → 调度层验证权限，申请短期 git token
  → acquire() 取空闲编译实例（Redis SETNX）
  → 编译实例建立 /tmp/tasks/{task_id}/ 目录（mode 700）
  → git clone（短期 token，stdio:pipe 防 token 泄漏日志）
  → 编译执行（最小环境变量）
  → 产物 base64 返回调度层，立即清理临时目录
  → 调度层写入 s3://…/tenants/tenant-a/{task_id}/firmware.bin
  → 返回限时签名 URL 给租户A

租户B 全程不可见任何租户A的数据  ✓
```

---

## Part 5：扩缩容参考

早期 Docker 环境下的手动扩缩策略：

| 现象 | 动作 |
|---|---|
| ESP32 编译 503 频率 > 5% | `docker-compose up -d --scale compiler-esp32=3` |
| 某芯片平台长期无请求 | 缩减到 1 个实例节省资源 |
| 整体规模增长，手动跟不上 | 迁移 K8s，上 HPA 自动扩缩 |

监控指标：各芯片平台的 503 频率 + 平均编译等待时长，数据说话，不提前过度设计。

---

## 文件索引

```
scripts/
  sandbox-sidecar.js              沙箱内 sidecar（热更新核心）
                                    ├── SSE 客户端（接平台推送）
                                    ├── MCP Server（tool 热更）
                                    ├── skill/agent 文件写入
                                    ├── 会话状态检测 + reload 触发
                                    └── bootstrap 全量初始化
  sandbox-mcp-server.js           MCP Server 核心实现
                                    tools/list、tools/call、list_changed 通知
  sandbox-entrypoint.sh           沙箱容器启动脚本
  platform-sse-hub.js             平台侧 SSE 推送服务
  platform-compile-dispatcher.js  编译任务调度层
  compiler-worker.js              编译沙箱内 HTTP worker
  docker-compose.compiler.yml     编译沙箱集群 compose 配置
  Dockerfile.compiler-esp32       ESP32 编译镜像（其他芯片平台参照此文件）
```

---

## 关键源码对照

| 方案功能 | opencode 源码依据 |
|---|---|
| MCP tools/list_changed 运行时更新 | `packages/opencode/src/mcp/index.ts:508-519` |
| MCP 动态添加 Server | `POST /mcp` 端点（`groups/mcp.ts:55-65`） |
| Skill 加载（仅 bootstrap） | `packages/opencode/src/skill/index.ts:173-242` |
| Skill 路径配置 | `config.skills.paths`（`config/config.ts:148`） |
| Agent 加载（仅 bootstrap） | `packages/opencode/src/agent/agent.ts:283-310` |
| Instance Dispose API | `POST /instance/dispose`（`groups/instance.ts:44`） |
| 会话状态查询 | `GET /session/status`（`groups/session.ts:117-127`） |
| SSE 事件流 | `GET /event`（`handlers/event.ts:27`） |
| MCP 连接配置 | `config.mcp`（`config/config.ts:223-232`） |
