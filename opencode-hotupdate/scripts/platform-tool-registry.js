// platform-tool-registry.js
// 平台侧 Tool 注册表，维护 tool 的完整定义和实现
// MCP 模式下 tool 由 sidecar 的 MCP Server 托管，平台推送完整实现代码

import express from 'express';
import { pushToolUpdate, broadcastToolUpdate } from './platform-sse-hub.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

// ── 完整注册表：name → { description, inputSchema, implementation } ─

const registry = new Map();

// 初始化示例 tool
registry.set('chip-advisor', {
  description: '根据需求推荐合适的芯片型号',
  inputSchema: {
    type: 'object',
    properties: {
      requirements: { type: 'string', description: '功能需求描述' },
    },
    required: ['requirements'],
  },
  implementation: '(params) => { /* 默认实现，沙箱启动后由 bootstrap 覆盖 */ }',
});

// ─── 沙箱查询单个 tool（调试用） ────────────────────────────

app.get('/registry/tools/:name', (req, res) => {
  const tool = registry.get(req.params.name);
  if (!tool) return res.sendStatus(404);
  res.json(tool);
});

// ─── 沙箱启动时拉取全量配置（bootstrap） ────────────────────

app.get('/sandbox/bootstrap', async (req, res) => {
  const { id: sandbox_id } = req.query;
  // 可按 sandbox_id 过滤租户可用的 skill/agent/tool 子集
  res.json({
    skills: await getSkillsForSandbox(sandbox_id),
    agents: await getAgentsForSandbox(sandbox_id),
    tools: Array.from(registry.entries()).map(([name, tool]) => ({
      name,
      ...tool,
    })),
  });
});

// ─── 注册 / 更新 tool（Admin API 或 CI/CD 调用） ──────────

app.post('/registry/tools/:name', (req, res) => {
  const { description, inputSchema, implementation, sandbox_ids } = req.body;

  registry.set(req.params.name, { description, inputSchema, implementation });

  const code = typeof implementation === 'function'
    ? implementation.toString()
    : implementation;

  if (sandbox_ids?.length) {
    sandbox_ids.forEach(id => pushToolUpdate(id, req.params.name, code));
  } else {
    broadcastToolUpdate(req.params.name, code);
  }

  console.log(`[registry] tool registered: ${req.params.name}`);
  res.json({ ok: true });
});

// ─── 删除 tool ──────────────────────────────────────────────

app.delete('/registry/tools/:name', (req, res) => {
  registry.delete(req.params.name);
  // 通知所有沙箱移除该 tool（通过推送空实现或特殊事件）
  broadcastToolUpdate(req.params.name, null);
  console.log(`[registry] tool removed: ${req.params.name}`);
  res.json({ ok: true });
});

// ─── 列出所有 tool ──────────────────────────────────────────

app.get('/registry/tools', (req, res) => {
  res.json(Array.from(registry.entries()).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })));
});

async function getSkillsForSandbox(sandbox_id) {
  // 接入你们的 skill 存储逻辑，返回 [{ filename, code }]
  return [];
}

async function getAgentsForSandbox(sandbox_id) {
  // 接入你们的 agent 存储逻辑，返回 [{ name, config }]
  return [];
}

app.listen(3002, () => console.log('[tool-registry] listening on :3002'));
