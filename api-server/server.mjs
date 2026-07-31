import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors());
app.use(express.json({ limit: '64kb' }));

// ---------------------------------------------------------------------------
// In-memory telemetry store (ring-buffered per target)
// ---------------------------------------------------------------------------

const MAX_SNAPSHOTS_PER_TARGET = 3600;
const MAX_ANOMALIES = 500;

/** @type {Map<string, Array<{target:string; timestamp:number; avg_rtt_ms:number; min_rtt_ms:number; max_rtt_ms:number; jitter_ms:number; packet_loss_pct:number; sent:number; lost:number}>>} */
const snapshots = new Map();

/** @type {Array<{type:string; target:string; reason:string; loss_pct:number; avg_rtt:number; baseline_avg_rtt:number; timestamp:number}>} */
const anomalies = [];

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set();

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Clean up dead SSE connections every 30s
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':ping\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 30_000).unref();

// ---------------------------------------------------------------------------
// Ingest endpoint (receives from daemon)
// ---------------------------------------------------------------------------

app.post('/api/ingest', (req, res) => {
  const { type, target, timestamp, ...fields } = req.body;
  if (!target || !timestamp) {
    return res.status(400).json({ error: 'missing target/timestamp' });
  }

  const now = Date.now() / 1000;
  // Drop stale payloads older than 60s
  if (now - timestamp > 60) {
    return res.json({ ok: true, dropped: 'stale' });
  }

  if (type === 'snapshot') {
    if (!snapshots.has(target)) {
      snapshots.set(target, []);
    }
    const arr = snapshots.get(target);
    arr.push({
      target,
      timestamp,
      avg_rtt_ms: fields.avg_rtt_ms ?? 0,
      min_rtt_ms: fields.min_rtt_ms ?? 0,
      max_rtt_ms: fields.max_rtt_ms ?? 0,
      jitter_ms: fields.jitter_ms ?? 0,
      packet_loss_pct: fields.packet_loss_pct ?? 0,
      sent: fields.sent ?? 0,
      lost: fields.lost ?? 0,
    });
    if (arr.length > MAX_SNAPSHOTS_PER_TARGET) {
      arr.splice(0, arr.length - MAX_SNAPSHOTS_PER_TARGET);
    }
    broadcastSSE('snapshot', { target, ...fields });
  }

  if (type === 'anomaly') {
    anomalies.push({
      type,
      target,
      reason: fields.reason ?? 'unknown',
      loss_pct: fields.loss_pct ?? 0,
      avg_rtt: fields.avg_rtt ?? 0,
      baseline_avg_rtt: fields.baseline_avg_rtt ?? 0,
      timestamp,
    });
    if (anomalies.length > MAX_ANOMALIES) {
      anomalies.splice(0, anomalies.length - MAX_ANOMALIES);
    }
    broadcastSSE('anomaly', { target, ...fields });
  }

  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// REST snapshot endpoint
// ---------------------------------------------------------------------------

app.get('/api/snapshots', (_req, res) => {
  const result = {};
  for (const [target, data] of snapshots) {
    result[target] = data.slice(-120); // last 2 min @ 1s interval
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// REST anomalies endpoint
// ---------------------------------------------------------------------------

app.get('/api/anomalies', (_req, res) => {
  res.json(anomalies.slice(-100));
});

// ---------------------------------------------------------------------------
// HTTP health check
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    targets: [...snapshots.keys()],
    anomalyCount: anomalies.length,
    sseClients: sseClients.size,
  });
});

// ---------------------------------------------------------------------------
// SSE event stream
// ---------------------------------------------------------------------------

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');

  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ---------------------------------------------------------------------------
// Static file serving for production (Next.js export)
// ---------------------------------------------------------------------------

const FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Network Pulse</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box }
    body { background: #030712; color: #e5e7eb; font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 48px; text-align: center; max-width: 480px }
    h1 { font-size: 1.75rem; margin-bottom: 8px; color: #f9fafb }
    p { color: #9ca3af; font-size: 0.9375rem; line-height: 1.6 }
    .status { display: inline-block; margin-top: 20px; padding: 8px 20px; border-radius: 9999px; font-size: 0.8125rem; font-weight: 600; background: #065f46; color: #6ee7b7; border: 1px solid #059669 }
    .meta { display: flex; gap: 24px; justify-content: center; margin-top: 24px }
    .meta div { background: #1f2937; border-radius: 8px; padding: 12px 20px }
    .meta .label { font-size: 0.6875rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em }
    .meta .value { font-size: 1.25rem; font-weight: 700; margin-top: 2px }
    a { color: #818cf8; text-decoration: none }
  </style>
</head>
<body>
  <div class="card">
    <h1>📡 Network Pulse</h1>
    <p>Real-time latency &amp; packet loss monitor is online. Connect the Python daemon to start streaming telemetry.</p>
    <div class="status">Server Online</div>
    <div class="meta">
      <div><div class="label">API</div><div class="value"><a href="/api/health">/api/health</a></div></div>
      <div><div class="label">SSE</div><div class="value"><a href="/api/stream">/api/stream</a></div></div>
      <div><div class="label" id="targets" style="cursor:pointer">Targets</div><div id="targets-val" class="value">—</div></div>
    </div>
  </div>
  <script>
    fetch('/api/health').then(r => r.json()).then(d => {
      if (d.targets && d.targets.length) document.getElementById('targets-val').textContent = d.targets.length
    }).catch(() => {})
  </script>
</body>
</html>`;

function serveStatic(app) {
  const outDir = join(__dirname, '..', 'out');
  const hasBuild = existsSync(outDir) && existsSync(join(outDir, 'index.html'));

  if (!hasBuild) {
    app.get('/', (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.send(FALLBACK_HTML);
    });
    return;
  }

  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  };

  const serveFile = (filePath, res, next) => {
    if (!existsSync(filePath)) return next();
    try {
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const content = readFileSync(filePath);
      res.setHeader('Content-Type', contentType);
      if (ext === '.html') {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      res.status(200).send(content);
    } catch {
      next();
    }
  };

  app.use((req, _res, next) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) return next();

    let filePath = join(outDir, pathname);

    if (!pathname.includes('.')) {
      const htmlPath = join(filePath, 'index.html');
      if (existsSync(htmlPath)) filePath = htmlPath;
      else if (pathname !== '/') {
        const fallback = join(outDir, pathname + '.html');
        if (existsSync(fallback)) filePath = fallback;
        else filePath = join(outDir, 'index.html');
      } else {
        filePath = join(outDir, 'index.html');
      }
    }

    serveFile(filePath, res, next);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

serveStatic(app);

const server = app.listen(PORT, () => {
  console.log(`[api-server] listening on :${PORT} (SSE on /api/stream)`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  for (const client of sseClients) {
    client.end();
  }
  server.close(() => process.exit(0));
});