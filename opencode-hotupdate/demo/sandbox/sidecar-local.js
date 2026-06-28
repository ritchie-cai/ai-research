// sidecar-local.js — Host-based sidecar for local demo
// Same logic as sandbox sidecar but with host-appropriate paths

import fs from 'fs';
import path from 'path';
import http from 'http';

// ─── MCP Server (inline) ────────────────────────────────────

let nextSessionId = 1;

class McpServer {
  constructor() {
    this.tools = new Map();
    this.sseClients = new Map();
    this._server = http.createServer((rq, rs) => this.#handle(rq, rs));
  }

  registerTool(name, desc, schema, handler) {
    const old = this.tools.get(name);
    this.tools.set(name, {
      description: desc ?? old?.description ?? '',
      inputSchema: schema ?? old?.inputSchema ?? { type: 'object', properties: {} },
      handler: handler ?? old?.handler,
    });
  }

  notifyToolsChanged() {
    for (const [, res] of this.sseClients) {
      this.#sendSSE(res, 'message', { jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
    }
  }

  listen(port) {
    return new Promise(resolve => this._server.listen(port, '127.0.0.1', resolve));
  }

  #handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/sse') return this.#handleSSE(req, res);
    if (u.pathname === '/messages') return this.#handleMsg(req, res, u.searchParams.get('sessionId'));
    res.writeHead(404); res.end('not found');
  }

  #handleSSE(req, res) {
    const sid = String(nextSessionId++);
    res.writeHead(200, {
      'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive','X-Accel-Buffering':'no',
    });
    this.sseClients.set(sid, res);
    this.#sendSSE(res, 'endpoint', `/messages?sessionId=${sid}`);
    req.on('close', () => this.sseClients.delete(sid));
  }

  async #handleMsg(req, res, sid) {
    if (!sid || req.method !== 'POST') { res.writeHead(400); return res.end('bad'); }
    const body = await this.#body(req);
    const rpc = JSON.parse(body);

    if      (rpc.method === 'initialize')       return this.#json(res, this.#ok(rpc.id, { protocolVersion:'2024-11-05', capabilities:{ tools:{ listChanged:true } }, serverInfo:{ name:'sandbox-mcp', version:'1.0.0' } }));
    if      (rpc.method === 'notifications/initialized') { res.writeHead(202); return res.end(); }
    if      (rpc.method === 'tools/list')       return this.#json(res, this.#ok(rpc.id, { tools: [...this.tools].map(([n,t]) => ({ name:n, description:t.description, inputSchema:t.inputSchema })) }));
    if      (rpc.method === 'tools/call')       return await this.#toolCall(rpc, res);
    this.#json(res, this.#err(rpc.id, -32601, `unknown: ${rpc.method}`));
  }

  async #toolCall(rpc, res) {
    const { name, arguments: args } = rpc.params;
    const tool = this.tools.get(name);
    if (!tool) return this.#json(res, this.#err(rpc.id, -32602, `unknown tool: ${name}`));
    try {
      const result = await tool.handler(args ?? {});
      return this.#json(res, this.#ok(rpc.id, { content: [{ type:'text', text: typeof result==='string' ? result : JSON.stringify(result) }] }));
    } catch(e) {
      return this.#json(res, this.#err(rpc.id, -32000, e.message));
    }
  }

  #ok(id, result) { return { jsonrpc:'2.0', id, result }; }
  #err(id, code, message) { return { jsonrpc:'2.0', id, error:{ code, message } }; }
  #json(res, obj) { res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(obj)); }
  #sendSSE(res, ev, data) { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); }
  #body(req) { return new Promise((ok, rej) => { let d=''; req.on('data', c=>d+=c); req.on('end', ()=>ok(d)); req.on('error', rej); }); }
}

// ─── Config ─────────────────────────────────────────────────

const CP_URL      = process.env.PLATFORM_URL  || 'http://127.0.0.1:3000';
const OPCODE_URL  = process.env.OPENCODE_URL  || 'http://127.0.0.1:19876';
const SANDBOX_ID  = process.env.SANDBOX_ID    || 'demo-local';
const CONTAINER_ID = SANDBOX_ID;
const SKILLS_DIR  = process.env.SKILLS_DIR    || '/tmp/opencode-demo-sandbox/skills';

// ─── State ──────────────────────────────────────────────────

const mcp = new McpServer();
const pending = [];
let updating = false;
let checkTimer;

function bootstrapDone() {
  const d = process.env.SKILLS_DIR?.replace('/skills', '') || '/tmp/opencode-demo-sandbox';
  fs.writeFileSync(path.join(d, '.bootstrap_done'), `${Date.now()}`);
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log(`[sidecar] starting local mode, sandbox=${SANDBOX_ID}`);

  await fetch(`${CP_URL}/api/containers/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ container_id: CONTAINER_ID, sandbox_id: SANDBOX_ID, opencode_url: OPCODE_URL }),
  });

  await bootstrap();

  await mcp.listen(19999);
  console.log('[sidecar] MCP server on :19999');
  connectSSE();
  console.log('[sidecar] ready');
}

// ─── Bootstrap ──────────────────────────────────────────────

async function bootstrap() {
  console.log('[sidecar] bootstrapping...');
  const res = await fetch(`${CP_URL}/api/bootstrap/${CONTAINER_ID}`);
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
  const { skills, agents, tools } = await res.json();

  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  for (const s of skills) {
    fs.writeFileSync(path.join(SKILLS_DIR, s.filename), s.code, 'utf8');
    console.log(`[sidecar] bootstrap skill: ${s.filename}`);
  }

  if (agents?.length) {
    const ad = path.dirname(SKILLS_DIR) + '/agents';
    fs.mkdirSync(ad, { recursive: true });
    for (const a of agents) {
      fs.writeFileSync(path.join(ad, `${a.name}.json`), JSON.stringify(a.config, null, 2));
      console.log(`[sidecar] bootstrap agent: ${a.name}`);
    }
  }

  for (const t of tools) {
    const fn = eval(`(${t.implementation})`);
    mcp.registerTool(t.name, t.description, t.inputSchema, fn);
    console.log(`[sidecar] bootstrap tool: ${t.name}`);
  }

  bootstrapDone();
  console.log('[sidecar] bootstrap done');
}

// ─── SSE ────────────────────────────────────────────────────

function connectSSE() {
  const url = `${CP_URL}/api/events/${CONTAINER_ID}`;
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`SSE connect failed: ${res.status}`);
    console.log('[sidecar] SSE connected');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const p of parts) {
        const m = p.match(/^event:\s*(.+)\ndata:\s*(.+)/m);
        if (!m) continue;
        const [, ev, raw] = m;
        let data;
        try { data = JSON.parse(raw); } catch { continue; }
        handleEvent(ev, data);
      }
    }
  }).catch(err => {
    console.error('[sidecar] SSE error, reconnecting in 5s:', err.message);
    setTimeout(connectSSE, 5000);
  });
}

function handleEvent(ev, data) {
  if (ev === 'skill_updated') {
    const fp = path.join(SKILLS_DIR, data.filename);
    fs.writeFileSync(fp, data.code, 'utf8');
    pending.push({ type:'skill', name:data.name });
    console.log(`[sidecar] skill written (pending reload): ${data.name}`);
    scheduleReload();
  }
  if (ev === 'agent_updated') {
    const ad = path.dirname(SKILLS_DIR) + '/agents';
    fs.mkdirSync(ad, { recursive: true });
    fs.writeFileSync(path.join(ad, `${data.name}.json`), JSON.stringify(data.config, null, 2));
    pending.push({ type:'agent', name:data.name });
    console.log(`[sidecar] agent written (pending reload): ${data.name}`);
    scheduleReload();
  }
  if (ev === 'tool_updated') {
    const fn = eval(`(${data.code})`);
    mcp.registerTool(data.name, undefined, undefined, fn);
    mcp.notifyToolsChanged();
    console.log(`[sidecar] tool hot-reloaded: ${data.name}`);
  }
}

// ─── Reload ─────────────────────────────────────────────────

function scheduleReload() {
  if (updating) return;
  updating = true;
  checkAndReload();
}

async function checkAndReload() {
  try {
    const busy = await getBusyCount();
    if (busy > 0) {
      console.log(`[sidecar] ${busy} session(s) busy, deferring...`);
      if (!checkTimer) {
        checkTimer = setInterval(async () => {
          if (await getBusyCount() === 0) { clearInterval(checkTimer); checkTimer = null; await doReload(); }
        }, 3000);
      }
    } else {
      await doReload();
    }
  } catch(e) {
    console.error('[sidecar] check failed, forcing reload:', e.message);
    await doReload();
  }
}

async function getBusyCount() {
  try {
    const r = await fetch(`${OPCODE_URL}/session/status`);
    if (!r.ok) return 0;
    return Object.keys(await r.json()).length;
  } catch { return 0; }
}

async function doReload() {
  console.log('[sidecar] triggering reload...');
  try {
    const r = await fetch(`${OPCODE_URL}/instance/dispose`, { method:'POST' });
    console.log(`[sidecar] reload: ${r.status}`);
  } catch(e) {
    console.error('[sidecar] reload failed:', e.message);
  }
  pending.length = 0; updating = false;
}

main().catch(e => { console.error('[sidecar] fatal:', e); process.exit(1); });
