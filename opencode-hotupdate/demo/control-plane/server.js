// server.js — Control Plane
// HTTP API + SSE Hub + container registry + static files

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '5mb' }));

// containerId → { sseRes, registeredAt, opencodeUrl, sandboxId }
const containers = new Map();

// ─── Static files (web UI) ─────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// ─── Container registry ────────────────────────────────────

app.post('/api/containers/register', (req, res) => {
  const { container_id, sandbox_id, opencode_url } = req.body;
  containers.set(container_id, {
    registeredAt: Date.now(),
    sandboxId: sandbox_id || container_id,
    opencodeUrl: opencode_url || `http://${container_id}:19876`,
  });
  console.log(`[cp] container registered: ${container_id} (sandbox=${sandbox_id})`);
  res.json({ ok: true });
});

app.get('/api/containers', (req, res) => {
  const list = Array.from(containers.entries()).map(([id, info]) => ({
    id,
    sandboxId: info.sandboxId,
    opencodeUrl: info.opencodeUrl,
    registeredAt: info.registeredAt,
    hasSSE: !!info.sseRes,
  }));
  res.json(list);
});

// ─── SSE stream (sidecar connects here) ────────────────────

app.get('/api/events/:containerId', (req, res) => {
  const { containerId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const entry = containers.get(containerId);
  if (entry) {
    entry.sseRes = res;
  }

  res.write(`event: connected\ndata: ${JSON.stringify({ container_id: containerId })}\n\n`);

  req.on('close', () => {
    if (entry) entry.sseRes = null;
    console.log(`[cp] SSE disconnected: ${containerId}`);
  });
});

// ─── Push skill update ─────────────────────────────────────

app.post('/api/skills/push/:containerId', (req, res) => {
  const { containerId } = req.params;
  const { name, code } = req.body;
  const entry = containers.get(containerId);

  if (!entry) return res.status(404).json({ error: 'container not found' });
  if (!entry.sseRes) return res.status(410).json({ error: 'SSE not connected' });

  const payload = {
    name,
    filename: `${name}.js`,
    code,
    version: Date.now(),
  };

  entry.sseRes.write(`event: skill_updated\ndata: ${JSON.stringify(payload)}\n\n`);
  console.log(`[cp] skill pushed to ${containerId}: ${name}`);
  res.json({ ok: true, name });
});

// ─── Push agent update ─────────────────────────────────────

app.post('/api/agents/push/:containerId', (req, res) => {
  const { containerId } = req.params;
  const { name, config } = req.body;
  const entry = containers.get(containerId);

  if (!entry) return res.status(404).json({ error: 'container not found' });
  if (!entry.sseRes) return res.status(410).json({ error: 'SSE not connected' });

  const payload = { name, config, version: Date.now() };
  entry.sseRes.write(`event: agent_updated\ndata: ${JSON.stringify(payload)}\n\n`);
  console.log(`[cp] agent pushed to ${containerId}: ${name}`);
  res.json({ ok: true, name });
});

// ─── Bootstrap (sidecar pulls full config on startup) ──────

app.get('/api/bootstrap/:containerId', (req, res) => {
  const { containerId } = req.params;
  // For demo, return mock skills and tools.
  // In production this pulls from a DB filtered by tenant.
  res.json({
    skills: [
      {
        filename: 'greeting.js',
        code: `// greeting skill — demo
export default {
  name: "greeting",
  description: "Responds with a friendly greeting",
  run: async (params) => {
    return \`Hello! I'm here to help with your queries.\`;
  }
};`,
      },
    ],
    agents: [],
    tools: [
      {
        name: 'demo-echo',
        description: 'Echo back the input message (demo tool)',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The message to echo' },
          },
          required: ['message'],
        },
        implementation: '(params) => `[demo-echo] You said: ${params.message}`',
      },
    ],
  });
});

// ─── Start ─────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[cp] control plane listening on :${PORT}`);
  console.log(`[cp] web UI at http://localhost:${PORT}`);
});
