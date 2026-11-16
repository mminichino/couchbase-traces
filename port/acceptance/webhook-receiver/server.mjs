#!/usr/bin/env node
/**
 * Records webhook payloads for acceptance G1.
 * POST /:service  → append JSON
 * GET  /_dump     → all payloads
 * DELETE /_dump   → clear
 */
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.WEBHOOK_DATA_DIR || '/data';
const FILE = join(DATA_DIR, 'payloads.ndjson');

mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(FILE)) writeFileSync(FILE, '');

function readAll() {
  const text = readFileSync(FILE, 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map(l => {
      try {
        return JSON.parse(l);
      } catch {
        return { raw: l };
      }
    });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/_dump') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readAll()));
    return;
  }
  if (req.method === 'DELETE' && url.pathname === '/_dump') {
    writeFileSync(FILE, '');
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  let json = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = body;
  }
  const service = url.pathname.replace(/^\//, '') || 'unknown';
  const entry = {
    ts: new Date().toISOString(),
    service,
    method: req.method,
    path: url.pathname,
    headers: req.headers,
    body: json,
  };
  appendFileSync(FILE, `${JSON.stringify(entry)}\n`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`webhook-receiver listening on ${PORT}`);
});
