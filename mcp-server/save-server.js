#!/usr/bin/env node
/**
 * save-server.js — Tiny HTTP sidecar for figma-design-memory.html
 *
 * Listens on http://localhost:7842 and accepts:
 *
 *   POST /save-prompt   { text: "..." }
 *     → writes the prompt to .agent-prompt/current-<TIMESTAMP>.md
 *
 * The HTML page calls this automatically (debounced 800 ms) whenever
 * the full agent prompt changes. Each save creates a new timestamped file.
 *
 * Start:
 *   node save-server.js
 *   node save-server.js --port 7842 --dir .agent-prompt
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, def) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}

const PORT = parseInt(getArg('--port', '7843'), 10);
const OUTPUT_DIR = path.resolve(__dirname, getArg('--dir', '.agent-prompt'));

// ── Helper: generate timestamped filename ──────────────────────────────────────
function generateTimestampedFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `current.md`;
}

// ── CORS helper ───────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCors(res);

  // Pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/save-prompt') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
        if (typeof text !== 'string') throw new Error('missing text field');

        const filename = generateTimestampedFilename();
        const outputFile = path.join(OUTPUT_DIR, filename);

        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(outputFile, text, 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file: outputFile, filename, length: text.length }));
        process.stdout.write(`[save-server] wrote ${text.length} chars → ${outputFile}\n`);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Health-check / unknown
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'save-server running', port: PORT, dir: OUTPUT_DIR }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`[save-server] listening on http://localhost:${PORT}\n`);
  process.stdout.write(`[save-server] writing prompts to → ${OUTPUT_DIR}\n`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(`[save-server] port ${PORT} already in use — is another instance running?\n`);
  } else {
    process.stderr.write(`[save-server] error: ${err.message}\n`);
  }
  process.exit(1);
});
