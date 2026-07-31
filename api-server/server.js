const express = require('express');
const cors = require('cors');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors());
app.use(express.json({ limit: '64kb' }));

// ---------------------------------------------------------------------------
// In-memory telemetry store
// ---------------------------------------------------------------------------

const MAX_SNAPSHOTS_PER_TARGET = 3600;
const MAX_ANOMALIES = 500;

const snapshots = new Map();
const anomalies = [];
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

setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':ping\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 30000).unref();

// ---------------------------------------------------------------------------
// POST /api/ingest
// ---------------------------------------------------------------------------

app.post('/api/ingest', (req, res) => {
  try {
    const { type, target, timestamp } = req.body || {};
    if (!target || !timestamp) {
      return res.status(400).json({ error: 'missing target/timestamp' });
    }

    const now = Date.now() / 1000;
    if (now - timestamp > 60) {
      return res.json({ ok: true, dropped: 'stale' });
    }

    if (type === 'snapshot') {
      if (!snapshots.has(target)) snapshots.set(target, []);
      const arr = snapshots.get(target);
      arr.push({
        target,
        timestamp,
        avg_rtt_ms: req.body.avg_rtt_ms ?? 0,
        min_rtt_ms: req.body.min_rtt_ms ?? 0,
        max_rtt_ms: req.body.max_rtt_ms ?? 0,
        jitter_ms: req.body.jitter_ms ?? 0,
        packet_loss_pct: req.body.packet_loss_pct ?? 0,
        sent: req.body.sent ?? 0,
        lost: req.body.lost ?? 0,
      });
      if (arr.length > MAX_SNAPSHOTS_PER_TARGET) {
        arr.splice(0, arr.length - MAX_SNAPSHOTS_PER_TARGET);
      }
      broadcastSSE('snapshot', {
        target,
        avg_rtt_ms: req.body.avg_rtt_ms ?? 0,
        min_rtt_ms: req.body.min_rtt_ms ?? 0,
        max_rtt_ms: req.body.max_rtt_ms ?? 0,
        jitter_ms: req.body.jitter_ms ?? 0,
        packet_loss_pct: req.body.packet_loss_pct ?? 0,
        sent: req.body.sent ?? 0,
        lost: req.body.lost ?? 0,
      });
    }

    if (type === 'anomaly') {
      anomalies.push({
        type,
        target,
        reason: req.body.reason ?? 'unknown',
        loss_pct: req.body.loss_pct ?? 0,
        avg_rtt: req.body.avg_rtt ?? 0,
        baseline_avg_rtt: req.body.baseline_avg_rtt ?? 0,
        timestamp,
      });
      if (anomalies.length > MAX_ANOMALIES) {
        anomalies.splice(0, anomalies.length - MAX_ANOMALIES);
      }
      broadcastSSE('anomaly', {
        target,
        reason: req.body.reason ?? 'unknown',
        loss_pct: req.body.loss_pct ?? 0,
        avg_rtt: req.body.avg_rtt ?? 0,
        baseline_avg_rtt: req.body.baseline_avg_rtt ?? 0,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('ingest error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/snapshots
// ---------------------------------------------------------------------------

app.get('/api/snapshots', (_req, res) => {
  const result = {};
  for (const [target, data] of snapshots) {
    result[target] = data.slice(-120);
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/anomalies
// ---------------------------------------------------------------------------

app.get('/api/anomalies', (_req, res) => {
  res.json(anomalies.slice(-100));
});

// ---------------------------------------------------------------------------
// GET /api/health
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
// GET /api/stream (SSE)
// ---------------------------------------------------------------------------

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ---------------------------------------------------------------------------
// Static file serving (Next.js export fallback)
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
    .meta { display: flex; gap: 24px; justify-content: center; margin-top: 24px; flex-wrap: wrap }
    .meta div { background: #1f2937; border-radius: 8px; padding: 12px 20px }
    .meta .label { font-size: 0.6875rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em }
    .meta .value { font-size: 1.25rem; font-weight: 700; margin-top: 2px }
    a { color: #818cf8; text-decoration: none }
  </style>
</head>
<body>
  <div class="card">
    <h1>Network Pulse</h1>
    <p>Real-time latency &amp; packet loss monitor is online. Connect the Python daemon to start streaming telemetry.</p>
    <div class="status">Server Online</div>
    <div class="meta">
      <div><div class="label">API</div><div class="value"><a href="/api/health">/api/health</a></div></div>
      <div><div class="label">SSE</div><div class="value"><a href="/api/stream">/api/stream</a></div></div>
    </div>
  </div>
</body>
</html>`;

function serveStatic() {
  const outDir = join(__dirname, '..', 'out');
  const hasBuild = existsSync(outDir) && existsSync(join(outDir, 'index.html'));

  if (!hasBuild) {
    app.get('/', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
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

    if (!existsSync(filePath)) return next();

    try {
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const content = readFileSync(filePath);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=3600');
      res.status(200).send(content);
    } catch {
      next();
    }
  });
}

serveStatic();

// ---------------------------------------------------------------------------
// Catch-all fallback — send fallback HTML for any unmatched route
// ---------------------------------------------------------------------------

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not found' });
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).send(FALLBACK_HTML);
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error('unhandled error:', err.message);
  res.status(500).json({ error: 'internal server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log('[api-server] listening on :' + PORT + ' (SSE on /api/stream)');
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  for (const client of sseClients) client.end();
  server.close(() => process.exit(0));
});