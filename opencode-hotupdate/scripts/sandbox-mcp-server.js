// sandbox-mcp-server.js
// MCP Server 实现（HTTP + SSE 传输）
// 处理 tools/list、tools/call，发送 notifications/tools/list_changed
// 基于 MCP 协议 JSON-RPC 2.0

import http from 'http';

let nextSessionId = 1;

export class McpServer {
  constructor() {
    this.tools = new Map();               // name → { description, inputSchema, handler }
    this.sseClients = new Map();          // sessionId → http.ServerResponse
    this.server = http.createServer((req, res) => this._handle(req, res));
    this._nextRequestId = 0;
  }

  // ── 注册 / 更新 tool ──────────────────────────────────────

  registerTool(name, description, inputSchema, handler) {
    const existing = this.tools.get(name);
    this.tools.set(name, {
      description: description ?? existing?.description ?? '',
      inputSchema: inputSchema ?? existing?.inputSchema ?? { type: 'object', properties: {} },
      handler: handler ?? existing?.handler,
    });
  }

  removeTool(name) {
    this.tools.delete(name);
  }

  // ── 通知 opencode 工具列表已变更 ──────────────────────────

  notifyToolsChanged() {
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed',
    };
    for (const [sid, res] of this.sseClients) {
      this._sendSSE(res, 'message', notification);
    }
  }

  // ── 启动 HTTP 服务 ────────────────────────────────────────

  listen(port) {
    return new Promise((resolve) => {
      this.server.listen(port, '127.0.0.1', resolve);
    });
  }

  // ── 路由分发 ──────────────────────────────────────────────

  async _handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/sse') {
      return this._handleSSE(req, res);
    }

    if (url.pathname === '/messages') {
      return this._handleMessage(req, res, url.searchParams.get('sessionId'));
    }

    res.writeHead(404);
    res.end('not found');
  }

  // ── SSE 端点（opencode 连接后接收 server→client 消息） ───

  _handleSSE(req, res) {
    const sessionId = String(nextSessionId++);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    this.sseClients.set(sessionId, res);

    this._sendSSE(res, 'endpoint', `/messages?sessionId=${sessionId}`);

    req.on('close', () => {
      this.sseClients.delete(sessionId);
    });
  }

  // ── 消息端点（opencode 发送 JSON-RPC 请求） ───────────────

  async _handleMessage(req, res, sessionId) {
    if (!sessionId || req.method !== 'POST') {
      res.writeHead(400);
      return res.end('bad request');
    }

    const body = await this._readBody(req);
    const rpc = JSON.parse(body);

    if (rpc.method === 'tools/list') {
      return this._json(res, this._response(rpc.id, {
        tools: Array.from(this.tools.entries()).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }));
    }

    if (rpc.method === 'tools/call') {
      const { name, arguments: args } = rpc.params;
      const tool = this.tools.get(name);
      if (!tool) {
        return this._json(res, this._error(rpc.id, -32602, `unknown tool: ${name}`));
      }
      try {
        const result = await tool.handler(args ?? {});
        return this._json(res, this._response(rpc.id, {
          content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
        }));
      } catch (err) {
        return this._json(res, this._error(rpc.id, -32000, err.message));
      }
    }

    if (rpc.method === 'initialize') {
      return this._json(res, this._response(rpc.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'sandbox-mcp', version: '1.0.0' },
      }));
    }

    if (rpc.method === 'notifications/initialized') {
      res.writeHead(202);
      return res.end();
    }

    this._json(res, this._error(rpc.id, -32601, `unknown method: ${rpc.method}`));
  }

  // ── 工具方法 ──────────────────────────────────────────────

  _response(id, result) {
    return { jsonrpc: '2.0', id, result };
  }

  _error(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }

  _sendSSE(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  _json(res, obj) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }
}
