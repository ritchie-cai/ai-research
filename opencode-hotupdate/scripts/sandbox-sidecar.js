// sandbox-sidecar.js
// 沙箱内与 opencode 一起启动的独立 Node 进程
// 负责：① MCP Server（tool 热更）  ② skill/agent 文件写入 + 会话感知 reload
//       ③ SSE 长连接接收平台推送  ④ bootstrap 全量初始化

import fs from 'fs';
import path from 'path';
import EventSource from 'eventsource';
import { McpServer } from './sandbox-mcp-server.js';

const OPCODE_URL   = process.env.OPENCODE_URL  || 'http://127.0.0.1:19876';
const PLATFORM_URL = process.env.PLATFORM_URL;
const SANDBOX_ID   = process.env.SANDBOX_ID;
const TOKEN        = process.env.SANDBOX_TOKEN;

const SKILLS_DIR   = '/opt/opencode/skills';
const MCP_PORT     = 19999;

// ─── 全局状态 ────────────────────────────────────────────────

// 待执行的 pending 更新（会话忙时暂存）
const pendingUpdates = [];

let updating = false;         // 是否有待执行的更新任务
let sessionCheckInterval;     // 轮询 /session/status 的定时器

// ─── MCP Server ──────────────────────────────────────────────

const mcp = new McpServer();

// ─── 启动顺序 ────────────────────────────────────────────────

async function main() {
  console.log('[sidecar] starting...');

  await bootstrap();
  await mcp.listen(MCP_PORT);
  console.log(`[sidecar] MCP server listening on :${MCP_PORT}`);

  connectSSE();
  console.log('[sidecar] ready');
}

// ─── Bootstrap：拉全量配置，写入 skill 文件，注册 MCP tools ───

async function bootstrap() {
  console.log('[sidecar] bootstrapping...');

  const res = await fetch(`${PLATFORM_URL}/sandbox/bootstrap?id=${SANDBOX_ID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
  const { skills, agents, tools } = await res.json();

  // ── 写入 skill 文件（openCode 通过 skills.paths 加载） ──
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  for (const { filename, code } of skills) {
    fs.writeFileSync(path.join(SKILLS_DIR, filename), code, 'utf8');
    console.log(`[sidecar] bootstrap skill: ${filename}`);
  }

  // ── 写入 agent 配置（openCode 通过 config.agent 加载） ──
  if (agents?.length) {
    fs.mkdirSync('/opt/opencode/agents', { recursive: true });
    for (const { name, config } of agents) {
      fs.writeFileSync(
        path.join('/opt/opencode/agents', `${name}.json`),
        JSON.stringify(config, null, 2),
        'utf8',
      );
      console.log(`[sidecar] bootstrap agent: ${name}`);
    }
  }

  // ── 注册 MCP tools（热更不走文件，由 MCP Server 托管） ──
  for (const { name, description, inputSchema, implementation } of tools) {
    mcp.registerTool(name, description, inputSchema, implementation);
    console.log(`[sidecar] bootstrap tool: ${name}`);
  }

  // ── 标记 bootstrap 完成，供 entrypoint 轮询 ──
  fs.writeFileSync('/opt/opencode/.bootstrap_done', `${Date.now()}`, 'utf8');
  console.log('[sidecar] bootstrap complete');
}

// ─── SSE 长连接，接收平台增量更新 ────────────────────────────

function connectSSE() {
  const url = `${PLATFORM_URL}/sandbox-events?sandbox_id=${SANDBOX_ID}&token=${TOKEN}`;
  const es = new EventSource(url);

  // Skill/Agent 更新：写文件 + 等会话 idle 后 reload
  es.addEventListener('skill_updated', (e) => {
    const { name, filename, code, version } = JSON.parse(e.data);
    const filepath = path.join(SKILLS_DIR, filename);
    fs.writeFileSync(filepath, code, 'utf8');
    pendingUpdates.push({ type: 'skill', name, version });
    console.log(`[sidecar] skill written (pending reload): ${name} v${version}`);
    scheduleReload();
  });

  es.addEventListener('agent_updated', (e) => {
    const { name, config, version } = JSON.parse(e.data);
    fs.mkdirSync('/opt/opencode/agents', { recursive: true });
    fs.writeFileSync(
      path.join('/opt/opencode/agents', `${name}.json`),
      JSON.stringify(config, null, 2),
      'utf8',
    );
    pendingUpdates.push({ type: 'agent', name, version });
    console.log(`[sidecar] agent written (pending reload): ${name} v${version}`);
    scheduleReload();
  });

  // Tool 更新：直接更新 MCP registry + 发 list_changed（零中断）
  es.addEventListener('tool_updated', (e) => {
    const { name, code, version } = JSON.parse(e.data);
    const impl = eval(`(${code})`);  // code 为 "(params) => { ... }" 形式

    mcp.registerTool(name, undefined, undefined, impl);
    mcp.notifyToolsChanged();
    console.log(`[sidecar] tool hot-reloaded: ${name} v${version}`);
  });

  es.onerror = () => {
    console.error('[sidecar] SSE disconnected, reconnecting in 5s...');
    es.close();
    setTimeout(connectSSE, 5_000);
  };

  es.onopen = () => console.log('[sidecar] SSE connected');
}

// ─── 会话感知的 reload 调度 ──────────────────────────────────

function scheduleReload() {
  if (updating) return;
  updating = true;
  checkAndReload();
}

async function checkAndReload() {
  try {
    const busy = await getBusySessionCount();
    if (busy > 0) {
      console.log(`[sidecar] ${busy} session(s) busy, deferring reload...`);
      if (!sessionCheckInterval) {
        sessionCheckInterval = setInterval(async () => {
          const stillBusy = await getBusySessionCount();
          if (stillBusy === 0) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
            await doReload();
          }
        }, 3_000);
      }
    } else {
      await doReload();
    }
  } catch (err) {
    console.error('[sidecar] session check failed, forcing reload:', err.message);
    await doReload();
  }
}

async function getBusySessionCount() {
  const res = await fetch(`${OPENCODE_URL}/instance/session/status`);
  if (!res.ok) return 0;
  const statusMap = await res.json();
  // 只统计 busy/retry 的 session，idle 的已从 Map 移除
  return Object.keys(statusMap).length;
}

async function doReload() {
  console.log('[sidecar] triggering instance reload...');
  try {
    const res = await fetch(`${OPENCODE_URL}/instance/dispose`, { method: 'POST' });
    console.log(`[sidecar] reload triggered: ${res.status}`);
  } catch (err) {
    console.error('[sidecar] reload request failed:', err.message);
  }
  pendingUpdates.length = 0;
  updating = false;
}

main().catch((err) => {
  console.error('[sidecar] fatal:', err);
  process.exit(1);
});
