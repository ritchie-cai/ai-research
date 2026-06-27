// platform-sse-hub.js
// 平台侧 SSE 推送服务，维护所有沙箱的长连接
// 负责推送 skill_updated / agent_updated / tool_updated 事件

import express from 'express';

const app = express();
app.use(express.json());

// sandbox_id → SSE response 对象
const clients = new Map();

// ─── 沙箱连入，建立 SSE 长连接 ──────────────────────────────
app.get('/sandbox-events', (req, res) => {
  const { sandbox_id, token } = req.query;

  if (!verifyToken(sandbox_id, token)) return res.sendStatus(401);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 记录连接
  clients.set(sandbox_id, res);
  console.log(`[sse-hub] sandbox connected: ${sandbox_id}, total=${clients.size}`);

  // 断线时清理
  req.on('close', () => {
    clients.delete(sandbox_id);
    console.log(`[sse-hub] sandbox disconnected: ${sandbox_id}`);
  });
});

// ─── 推送 skill 更新（完整代码，sidecar 写文件 + 等空闲 reload） ───

export function pushSkill(sandbox_id, skillName, skillCode) {
  const client = clients.get(sandbox_id);
  if (!client) return false;

  client.write(`event: skill_updated\ndata: ${JSON.stringify({
    name: skillName,
    filename: `${skillName}.js`,
    code: skillCode,
    version: Date.now(),
  })}\n\n`);
  return true;
}

export function broadcastSkill(skillName, skillCode) {
  for (const [, client] of clients) {
    client.write(`event: skill_updated\ndata: ${JSON.stringify({
      name: skillName,
      filename: `${skillName}.js`,
      code: skillCode,
      version: Date.now(),
    })}\n\n`);
  }
}

// ─── 推送 agent 更新（sidecar 写文件 + 等空闲 reload） ──────

export function pushAgent(sandbox_id, agentName, agentConfig) {
  const client = clients.get(sandbox_id);
  if (!client) return false;

  client.write(`event: agent_updated\ndata: ${JSON.stringify({
    name: agentName,
    config: agentConfig,
    version: Date.now(),
  })}\n\n`);
  return true;
}

// ─── 推送 tool 更新（完整实现代码，sidecar 注入 MCP → 零中断热更） ──

export function pushToolUpdate(sandbox_id, toolName, toolCode) {
  const client = clients.get(sandbox_id);
  if (!client) return false;

  client.write(`event: tool_updated\ndata: ${JSON.stringify({
    name: toolName,
    code: toolCode,
    version: Date.now(),
  })}\n\n`);
  return true;
}

export function broadcastToolUpdate(toolName, toolCode) {
  let count = 0;
  for (const [sid, client] of clients) {
    client.write(`event: tool_updated\ndata: ${JSON.stringify({
      name: toolName,
      code: toolCode,
      version: Date.now(),
    })}\n\n`);
    count++;
  }
  console.log(`[sse-hub] broadcast tool_updated: ${toolName}, clients=${count}`);
}

// ─── 查询当前在线沙箱 ────────────────────────────────────────

export function getOnlineSandboxes() {
  return Array.from(clients.keys());
}

function verifyToken(sandbox_id, token) {
  // 接入你们自己的鉴权逻辑
  return !!token;
}

app.listen(3001, () => console.log('[sse-hub] listening on :3001'));
