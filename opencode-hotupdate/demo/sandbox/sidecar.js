// sidecar.js — Demo sandbox sidecar
// SSE client → control plane | MCP Server → opencode | session-aware reload

import fs from 'fs';
import path from 'path';
import http from 'http';

// ─── config ─────────────────────────────────────────────────

const CP_URL      = process.env.PLATFORM_URL   || 'http://control-plane:3000';
const OPCODE_URL  = process.env.OPENCODE_URL   || 'http://127.0.0.1:19876';
const SANDBOX_ID  = process.env.SANDBOX_ID     || `sandbox-${Math.random().toString(36).slice(2, 8)}`;
const CONTAINER_ID = process.env.HOSTNAME       || SANDBOX_ID;
const SKILLS_DIR  = '/opt/opencode/skills';
const MCP_PORT    = 19999;

// ─── MCP Server (inline) ────────────────────────────────────

class McpServer {
  constructor() {
    this.tools = new Map();
    this.sseClients = new Map();
    this._nextSid = 1;
    this._nextReqId = 0;
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
    return new Promise(resolve => this._server.listen(port, '0.0.0.0', resolve));
  }

  #handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://0.0.0.0');
    if (u.pathname === '/sse') return this.#handleSSE(req, res);
    if (u.pathname === '/messages') return this.#handleMsg(req, res, u.searchParams.get('sessionId'));
    res.writeHead(404); res.end('not found');
  }

  #handleSSE(req, res) {
    const sid = String(this._nextSid++);
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

// ─── global state ──────────────────────────────────────────

const mcp = new McpServer();
const pending = [];
let updating = false;
let checkTimer;

// ─── main ───────────────────────────────────────────────────

async function main() {
  console.log(`[sidecar] starting, sandbox=${SANDBOX_ID} container=${CONTAINER_ID}`);

  // register with control plane
  await fetch(`${CP_URL}/api/containers/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      container_id: CONTAINER_ID,
      sandbox_id: SANDBOX_ID,
      opencode_url: OPCODE_URL,
    }),
  });

  await bootstrap();
  await mcp.listen(MCP_PORT);
  console.log(`[sidecar] MCP server on :${MCP_PORT}`);
  connectSSE();
  console.log('[sidecar] ready');
}

// ─── bootstrap ─────────────────────────────────────────────

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
    fs.mkdirSync('/opt/opencode/agents', { recursive: true });
    for (const a of agents) {
      fs.writeFileSync(path.join('/opt/opencode/agents', `${a.name}.json`), JSON.stringify(a.config, null, 2));
      console.log(`[sidecar] bootstrap agent: ${a.name}`);
    }
  }

  for (const t of tools) {
    const fn = typeof t.implementation === 'function' ? t.implementation : eval(`(${t.implementation})`);
    mcp.registerTool(t.name, t.description, t.inputSchema, fn);
    console.log(`[sidecar] bootstrap tool: ${t.name}`);
  }

  fs.writeFileSync('/opt/opencode/.bootstrap_done', `${Date.now()}`, 'utf8');
  console.log('[sidecar] bootstrap done');
}

// ─── SSE to control plane ──────────────────────────────────

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
    const filepath = path.join(SKILLS_DIR, data.filename);
    fs.writeFileSync(filepath, data.code, 'utf8');
    pending.push({ type:'skill', name:data.name, version:data.version });
    console.log(`[sidecar] skill written (pending reload): ${data.name}`);
    scheduleReload();
  }
  if (ev === 'agent_updated') {
    fs.mkdirSync('/opt/opencode/agents', { recursive: true });
    fs.writeFileSync(path.join('/opt/opencode/agents', `${data.name}.json`), JSON.stringify(data.config, null, 2));
    pending.push({ type:'agent', name:data.name, version:data.version });
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

// ─── session-aware reload ─────────────────────────────────

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
          if (await getBusyCount() === 0) {
            clearInterval(checkTimer);
            checkTimer = null;
            await doReload();
          }
        }, 3000);
      }
    } else {
      await doReload();
    }
  } catch (e) {
    console.error('[sidecar] check failed, forcing reload:', e.message);
    await doReload();
  }
}

async function getBusyCount() {
  try {
    const res = await fetch(`${OPCODE_URL}/instance/session/status`);
    if (!res.ok) return 0;
    const m = await res.json();
    return Object.keys(m).length;
  } catch { return 0; }
}

async function doReload() {
  console.log('[sidecar] triggering reload...');
  try {
    const res = await fetch(`${OPCODE_URL}/instance/dispose`, { method: 'POST' });
    console.log(`[sidecar] reload: ${res.status}`);
  } catch (e) {
    console.error('[sidecar] reload failed:', e.message);
  }
  pending.length = 0;
  updating = false;
}

main().catch(e => { console.error('[sidecar] fatal:', e); process.exit(1); });
