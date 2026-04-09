#!/usr/bin/env node
/**
 * scripts/start-all.js
 *
 * Start MCP server (`index.js`), `save-server.js`, and a tiny static server
 * that serves `figma-design-memory.html` from the workspace root, then open
 * the page in the default browser. Designed for local development on Node 18+.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..'); // d:/prompt-tools/mcp-server

function spawnProcess(name, command, args, opts = {}) {
  const proc = spawn(command, args, { cwd: root, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  proc.stdout.on('data', (d) => {
    process.stdout.write(`[${name}] ${d}`);
  });
  proc.stderr.on('data', (d) => {
    process.stderr.write(`[${name}] ${d}`);
  });
  proc.on('exit', (code, signal) => {
    process.stdout.write(`[${name}] exited ${signal ?? code}\n`);
  });
  return proc;
}

function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', (err) => {
      tester.close?.();
      if (err && err.code === 'EADDRINUSE') return resolve(false);
      return resolve(false);
    });
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

async function findFirstFreePort(candidates = [], host = '127.0.0.1') {
  for (const p of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p, host)) return p;
  }
  return undefined;
}

(async () => {
  const procs = [];

  try {
    // Choose a free port for save-server if possible
    const savePort = await findFirstFreePort([7843, 7842, 7845], '127.0.0.1');
    if (savePort) {
      const saveServer = spawnProcess('save-server', process.execPath, ['save-server.js', '--port', String(savePort), '--dir', '.agent-prompt']);
      procs.push(saveServer);
    } else {
      process.stdout.write('[save-server] no free port found (7843/7842/7845) — skipping save-server startup\n');
    }

    // Start MCP server (stdio-based)
    const mcp = spawnProcess('mcp-server', process.execPath, ['index.js']);
    procs.push(mcp);

    // Static server for figma-design-memory.html (prefer 7844, fall back to ephemeral port)
    const preferPort = 7844;
    const useEphemeral = !(await isPortFree(preferPort, '127.0.0.1'));
    const portToUse = useEphemeral ? 0 : preferPort;

    const htmlFile = path.resolve(root, '..', 'figma-design-memory.html');
    const host = '127.0.0.1';

    const staticServer = http.createServer(async (req, res) => {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        try {
          let content = await fs.promises.readFile(htmlFile, 'utf8');

          // If we started a save-server on a chosen port, inject it into the
          // HTML so the page posts to the correct host:port instead of a
          // hard-coded value.
          if (typeof savePort !== 'undefined' && savePort) {
            try {
              const regex = /const\s+SAVE_SERVER_URL\s*=\s*['"`][^'"`]*['"`]\s*;/;
              const replacement = `const SAVE_SERVER_URL = "http://localhost:${savePort}/save-prompt";`;
              if (regex.test(content)) {
                content = content.replace(regex, replacement);
                process.stdout.write(`[static] injected SAVE_SERVER_URL -> http://localhost:${savePort}/save-prompt\n`);
              }
            } catch (e) {
              // non-fatal: continue serving original content
              process.stderr.write(`[static] failed to inject save-server port: ${e.message}\n`);
            }
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(content);
        } catch (e) {
          res.writeHead(500);
          return res.end(`Error reading ${htmlFile}: ${e.message}`);
        }
      }
      res.writeHead(404);
      res.end('Not found');
    });

    staticServer.listen(portToUse, host, () => {
      const actualPort = staticServer.address().port;
      const url = `http://${host}:${actualPort}/`;
      process.stdout.write(`[static] serving ${htmlFile} at ${url}\n`);
      openUrl(url);
    });

    function openUrl(target) {
      const platform = process.platform;
      if (platform === 'win32') {
        spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
      } else if (platform === 'darwin') {
        spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
      }
    }

    function shutdown() {
      process.stdout.write('Shutting down children...\n');
      procs.forEach((p) => {
        try {
          p.kill();
        } catch (e) {}
      });
      try {
        staticServer.close();
      } catch (e) {}
      process.exit();
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', shutdown);
  } catch (err) {
    console.error('Failed to start processes:', err);
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
