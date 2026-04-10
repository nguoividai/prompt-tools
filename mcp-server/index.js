#!/usr/bin/env node
/**
 * index.js — Prompt Engine MCP Server
 *
 * Exposes two tools to Claude Code:
 * 
 *  get_config_json(config_path?)
 *    → Returns the full raw config JSON, identical to what "Save Config for MCP" writes.
 *
 * Setup:
 *  1. In figma-design-memory.html, click "Save Config for MCP" → saves prompt-tools-config.json
 *  2. Extract a Figma design and click "Download All (ZIP)" → saves design-memory-*.zip
 *  3. Claude Code can now call build_design_prompt({ design_zip: "path/to/design.zip" })
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { buildPrompt, buildPersonalitySection } from './build-prompt.js';
import { readDesignZip, readDesignFolder } from './figma-client.js';
import { runPipeline } from './hooks.js';
import { createServer } from 'http';

/**
 * Default hook configuration.
 *
 * Adjust the arrays to add, remove, or reorder hooks.
 * Set a phase to [] to disable it entirely.
 *
 * Available hooks:
 *   before_hook:      rewrite_query | inject_context
 *   tool_hook:        validate_input | rate_limit | audit_log
 *   after_tool_hook:  sanitize_output | enrich_data
 *   after_hook:       format_markdown | add_summary
 *   session_end_hook: run_command | run_playwright_tests
 *
 * Examples:
 *   - To run a command after every tool call:
 *       session_end_hook: ['run_command'],
 *       (then pass cli_command in args; by default run_command executes via npx for local CLIs)
 *
 *   - To run Playwright tests after tool execution:
 *       session_end_hook: ['run_playwright_tests'],
 *
 *   - To run both sequentially:
 *       session_end_hook: ['run_command', 'run_playwright_tests'],
 */
const HOOK_CONFIG = {
  before_hook:      ['rewrite_query', 'inject_context'],
  tool_hook:        ['validate_input', 'rate_limit'],
  after_tool_hook:  ['sanitize_output', 'enrich_data', 'include_current_prompt'],
  after_hook:       ['format_markdown', 'add_summary'],
  session_end_hook: ['run_command'],  // run_command silently skips when cli_command is not provided
};

/**
 * Resolve effective hook config.
 * Priority:
 *   1) hooks from prompt-tools-config.json (if present and valid)
 *   2) built-in HOOK_CONFIG fallback
 */
function resolveHookConfig(configPath) {
  const cfg = loadConfig(configPath);
  const src = cfg?.hooks;
  if (!src || typeof src !== 'object') return HOOK_CONFIG;

  const phases = ['before_hook', 'tool_hook', 'after_tool_hook', 'after_hook', 'session_end_hook'];
  const resolved = {};

  for (const phase of phases) {
    const list = src[phase];
    if (Array.isArray(list)) {
      resolved[phase] = list.filter(v => typeof v === 'string' && v.trim().length > 0);
    } else {
      resolved[phase] = HOOK_CONFIG[phase];
    }
  }

  return resolved;
}

/**
 * Decide whether hook execution trace should be included in tool output.
 * Priority:
 *   1) args.show_hook_trace (boolean)
 *   2) config.hooks_show_trace (boolean)
 *   3) default false
 */
function resolveShowHookTrace(args, configPath) {
  if (typeof args?.show_hook_trace === 'boolean') return args.show_hook_trace;
  const cfg = loadConfig(configPath);
  if (typeof cfg?.hooks_show_trace === 'boolean') return cfg.hooks_show_trace;
  return false;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Expand a leading ~ to the user's home directory. */
function expandPath(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

// Default config path: sibling to mcp-server/ in the workspace root
const DEFAULT_CONFIG = resolve(__dirname, '..', 'prompt-tools-config.json');

// Default prompt path — override via env var PROMPT_TOOLS_PROMPT_PATH
const DEFAULT_PROMPT_PATH = process.env.PROMPT_TOOLS_PROMPT_PATH
  ? expandPath(process.env.PROMPT_TOOLS_PROMPT_PATH)
  : resolve(__dirname, '.agent-prompt', 'current.md');

function loadConfig(configPath) {
  const p = configPath ? resolve(configPath) : DEFAULT_CONFIG;
  if (!existsSync(p)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse config at ${p}: ${e.message}`);
  }
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseOptionalBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return undefined;
}

function normalizeDebugArgs(rawArgs) {
  const args = rawArgs ? { ...rawArgs } : {};
  const debug = parseOptionalBoolean(args.debug);
  if (typeof debug === 'boolean') args.debug = debug;

  if (args.debug === true) {
    if (typeof args.show_hook_trace !== 'boolean') args.show_hook_trace = true;
    if (args.include_meta_comment !== true) args.include_meta_comment = true;
  }

  return args;
}

function applyDebugHookOverrides(hookConfig, args) {
  if (args?.debug !== true) return hookConfig;
  const currentToolHooks = Array.isArray(hookConfig?.tool_hook) ? hookConfig.tool_hook : [];
  if (currentToolHooks.includes('audit_log')) return hookConfig;
  return {
    ...hookConfig,
    tool_hook: [...currentToolHooks, 'audit_log'],
  };
}

function logInfo(message) {
  process.stderr.write(`${message}\n`);
}

function logWarn(message) {
  process.stderr.write(`${message}\n`);
}

function normalizePromptIntentArgs(rawArgs) {
  const args = rawArgs ? { ...rawArgs } : {};
  const inferredGoal = firstNonEmptyString(
    args.original_goal,
    args.goal,
    args.task,
    args.query,
    args.user_request,
    args.user_intent,
    args.primary_intent,
  );

  if (!args.original_goal && inferredGoal) {
    args.original_goal = inferredGoal;
  }

  return args;
}

function buildIntentPreamble(args) {
  const goal = firstNonEmptyString(args?.original_goal);
  const contextOnly = args?.context_only === true;

  if (!goal && !contextOnly) return '';

  const lines = [''];
  lines.push('## Retrieval Intent');
  lines.push('');
  if (goal) lines.push(`Primary objective: ${goal}`);
  if (contextOnly) {
    lines.push('This stream is for context retrieval only. After reading this output, continue solving the primary objective instead of stopping here.');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

/**
 * Read a slice of the file by character offset without loading the whole file into memory.
 * - `offset` and `maxChars` are character counts (not bytes).
 * - If `maxChars` is 0, returns all characters from `offset` to EOF.
 */
function readChunkedByChars(promptPath, offset, maxChars) {
  return new Promise((resolve, reject) => {
    let collected = '';
    let skipped = 0;
    const rs = createReadStream(promptPath, { encoding: 'utf8' });

    rs.on('data', (chunk) => {
      if (skipped < offset) {
        const needToSkip = offset - skipped;
        if (chunk.length <= needToSkip) {
          skipped += chunk.length;
          return;
        }
        chunk = chunk.slice(needToSkip);
        skipped += needToSkip;
      }

      if (maxChars > 0) {
        const remaining = maxChars - collected.length;
        if (chunk.length <= remaining) {
          collected += chunk;
        } else {
          collected += chunk.slice(0, remaining);
          rs.destroy(); // stop reading further
        }
      } else {
        collected += chunk;
      }
    });

    rs.on('error', (err) => reject(err));
    rs.on('close', () => resolve(collected));
    rs.on('end', () => resolve(collected));
  });
}

function computeTotalChars(promptPath) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const rs = createReadStream(promptPath, { encoding: 'utf8' });
    rs.on('data', (chunk) => { total += chunk.length; });
    rs.on('error', (err) => reject(err));
    rs.on('end', () => resolve(total));
  });
}

/** Core implementation used by both MCP tool and HTTP endpoints. */
async function getCurrentPromptCore(args) {
  const promptPath = args?.prompt_path ? expandPath(args.prompt_path) : DEFAULT_PROMPT_PATH;

  if (!existsSync(promptPath)) {
    return { content: [{ type: 'text', text: `Error: Current prompt file not found at ${promptPath}` }], isError: true };
  }

  try {
    const offset = Number.isInteger(args?.offset) ? args.offset : 0;
    const maxChars = Number.isInteger(args?.max_chars) ? args.max_chars : 0;

    if (maxChars > 0) {
      // Read only the requested character window and compute total in parallel.
      const [output, totalChars] = await Promise.all([
        readChunkedByChars(promptPath, offset, maxChars),
        computeTotalChars(promptPath),
      ]);

      const truncated = output.length >= maxChars && (offset + output.length) < totalChars;
      const footer = truncated
        ? `\n\n---\n[Truncated. Showing ${maxChars} of ${totalChars} chars from offset ${offset}. Call again with offset=${offset + maxChars} to continue.]`
        : (offset > 0 ? `\n\n---\n[Showing chars ${offset}–${offset + output.length} of ${totalChars}.]` : '');

      const nextOffset = truncated ? offset + output.length : null;

      return {
        content: [{ type: 'text', text: output + footer }],
        metadata: { promptPath, totalChars, offset, returnedChars: output.length, maxChars, truncated, nextOffset },
      };
    }

    // maxChars === 0 => return the rest of the file from offset (may still read remainder into memory)
    const output = await readChunkedByChars(promptPath, offset, 0);
    const totalChars = await computeTotalChars(promptPath);
    const footer = offset > 0 ? `\n\n---\n[Showing chars ${offset}–${offset + output.length} of ${totalChars}.]` : '';

    return {
      content: [{ type: 'text', text: output + footer }],
      metadata: { promptPath, totalChars, offset, returnedChars: output.length, maxChars: 0, truncated: false, nextOffset: null },
    };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error reading prompt file: ${e.message}` }], isError: true };
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: 'prompt-tools', version: '1.0.0' }
);

// ── Tool registrations ───────────────────────────────────────────────────────

// server.tool('build_design_prompt', {
//   design_zip: {
//     type: 'string',
//     description: 'Absolute or workspace-relative path to the design-memory-*.zip file.',
//   },
//   design_folder: {
//     type: 'string',
//     description: 'Alternative to design_zip: folder containing extracted JSON files.',
//   },
//   config_path: {
//     type: 'string',
//     description: 'Optional path to prompt-tools-config.json.',
//   },
// }, async (args) => {
//   const hookConfig = resolveHookConfig(args?.config_path);
//   const includeTrace = resolveShowHookTrace(args, args?.config_path);
//   return runPipeline(hookConfig, 'build_design_prompt', args, async (ctx) => {
//     /* ... */
//   }, { includeTrace });
// });

// server.tool('get_config_json',
//   'Return the full raw prompt-tools-config.json as a JSON string.',
//   { config_path: { type: 'string', description: 'Optional path to prompt-tools-config.json.' } },
//   async (args) => {
//     const hookConfig = resolveHookConfig(args?.config_path);
//     const includeTrace = resolveShowHookTrace(args, args?.config_path);
//     return runPipeline(hookConfig, 'get_config_json', args, async (ctx) => {
//       /* ... */
//     }, { includeTrace });
//   },
// );

server.tool(
  'get_current_prompt',
  'Return the content of the current agent prompt file as supporting context. Defaults to .agent-prompt/current.md next to this server, or the path in the PROMPT_TOOLS_PROMPT_PATH environment variable. Accepts absolute paths and ~ for the home directory. This tool is context-only by default and can infer the main task from original_goal, goal, task, query, or user_request.',
  {
    prompt_path: z.string().optional().describe('Absolute path, relative path, or ~/... path to the prompt .md file. Overrides the PROMPT_TOOLS_PROMPT_PATH env var and the built-in default.'),
    max_chars: z.number().optional().describe('Maximum number of characters to return (default: 0 = unlimited).'),
    offset: z.number().optional().describe('Character offset to start reading from (default: 0). Use together with max_chars to paginate large files.'),
    original_goal: z.string().optional().describe('The caller\'s main objective. Use this when the prompt is being fetched only as supporting context so downstream models keep working on the original task.'),
    goal: z.string().optional().describe('Alias for original_goal.'),
    task: z.string().optional().describe('Alias for original_goal.'),
    query: z.string().optional().describe('Alias for original_goal.'),
    user_request: z.string().optional().describe('Alias for original_goal.'),
    context_only: z.boolean().optional().describe('Set true when this tool call is only for context retrieval and should not be treated as the final task result.'),
    show_hook_trace: z.boolean().optional().describe('Whether to include a visible Hook Execution Trace block in the response (default: false).'),
    debug: z.boolean().optional().describe('Enable focused debug mode for this call: show hook trace, include metadata comment, and enable audit logging.'),
  },
  async (args) => {
    args = normalizePromptIntentArgs(args);
    args = normalizeDebugArgs(args);
    const hookConfig = applyDebugHookOverrides(resolveHookConfig(args?.config_path), args);
    const includeTrace = resolveShowHookTrace(args, args?.config_path);

    return runPipeline(hookConfig, 'get_current_prompt', args, async (ctx) => {
      return await getCurrentPromptCore(ctx.args ?? args);
    }, { includeTrace }); // end runPipeline
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Optional HTTP transport: exposes simple REST endpoints to call the same pipeline/tools.
// Default bind port is 3000; if occupied, server falls back to a random free port.
const requestedHttpPort = process.env.PROMPT_TOOLS_HTTP_PORT
  ? Number(process.env.PROMPT_TOOLS_HTTP_PORT)
  : 3000;

const httpServer = createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '/', `http://localhost`);

    if (urlObj.pathname === '/get_current_prompt') {
      const params = urlObj.searchParams;
      const args = {};
      if (params.has('prompt_path')) args.prompt_path = params.get('prompt_path');
      if (params.has('offset')) args.offset = Number(params.get('offset'));
      if (params.has('max_chars')) args.max_chars = Number(params.get('max_chars'));
      if (params.has('original_goal')) args.original_goal = params.get('original_goal');
      if (params.has('goal')) args.goal = params.get('goal');
      if (params.has('task')) args.task = params.get('task');
      if (params.has('query')) args.query = params.get('query');
      if (params.has('user_request')) args.user_request = params.get('user_request');
      if (params.has('context_only')) args.context_only = params.get('context_only') === 'true';
      if (params.has('show_hook_trace')) args.show_hook_trace = params.get('show_hook_trace') === 'true';
      if (params.has('config_path')) args.config_path = params.get('config_path');
      if (params.has('debug')) args.debug = params.get('debug');

      const normalizedArgs = normalizeDebugArgs(normalizePromptIntentArgs(args));

      const hookConfig = applyDebugHookOverrides(resolveHookConfig(normalizedArgs?.config_path), normalizedArgs);
      const includeTrace = resolveShowHookTrace(normalizedArgs, normalizedArgs?.config_path);

      const result = await runPipeline(hookConfig, 'get_current_prompt', normalizedArgs, async (ctx) => {
        return await getCurrentPromptCore(ctx.args ?? normalizedArgs);
      }, { includeTrace });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    if (urlObj.pathname === '/stream_current_prompt') {
      const params = urlObj.searchParams;
      const args = normalizePromptIntentArgs({
        prompt_path: params.get('prompt_path') || undefined,
        offset: params.has('offset') ? Number(params.get('offset')) : 0,
        max_chars: params.has('max_chars') ? Number(params.get('max_chars')) : 0,
        original_goal: params.get('original_goal') || undefined,
        goal: params.get('goal') || undefined,
        task: params.get('task') || undefined,
        query: params.get('query') || undefined,
        user_request: params.get('user_request') || undefined,
        context_only: params.has('context_only') ? params.get('context_only') === 'true' : undefined,
      });

      const prompt_path = args.prompt_path;
      const offset = args.offset;
      const max_chars = args.max_chars;

      const promptPath = prompt_path ? expandPath(prompt_path) : DEFAULT_PROMPT_PATH;
      if (!existsSync(promptPath)) {
        res.writeHead(404);
        res.end('Prompt file not found');
        return;
      }

        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('X-Context-Only', String(args.context_only === true));
        if (args.original_goal) res.setHeader('X-Original-Goal', args.original_goal);
      res.writeHead(200);

        const preamble = buildIntentPreamble(args);
        if (preamble) res.write(preamble);

      const rs = createReadStream(promptPath, { encoding: 'utf8' });
      let skipped = 0;
      let remaining = Number.isInteger(max_chars) ? max_chars : 0;
      let finished = false;

      rs.on('data', (chunk) => {
        if (finished) return;
        if (skipped < offset) {
          const needToSkip = offset - skipped;
          if (chunk.length <= needToSkip) {
            skipped += chunk.length;
            return;
          }
          chunk = chunk.slice(needToSkip);
          skipped += needToSkip;
        }

        if (remaining > 0) {
          if (chunk.length <= remaining) {
            res.write(chunk);
            remaining -= chunk.length;
          } else {
            res.write(chunk.slice(0, remaining));
            finished = true;
            rs.destroy();
          }
        } else {
          res.write(chunk);
        }
      });

      rs.on('end', () => { if (!res.writableEnded) res.end(); });
      rs.on('close', () => { if (!res.writableEnded) res.end(); });
      rs.on('error', (err) => { try { res.writeHead(500); res.end(String(err)); } catch (e) {} });

      return;
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});

async function startHttpTransport() {
  const primaryPort = Number.isInteger(requestedHttpPort) && requestedHttpPort > 0
    ? requestedHttpPort
    : 3000;

  const tryListen = (port) => new Promise((resolve, reject) => {
    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };
    const onError = (err) => {
      httpServer.off('listening', onListening);
      reject(err);
    };

    httpServer.once('listening', onListening);
    httpServer.once('error', onError);
    httpServer.listen(port);
  });

  try {
    await tryListen(primaryPort);
    const address = httpServer.address();
    const actualPort = address && typeof address === 'object' ? address.port : primaryPort;
    logInfo(`HTTP transport listening on port ${actualPort}`);
  } catch (err) {
    if (err?.code !== 'EADDRINUSE') {
      logWarn(`HTTP transport disabled: ${err?.message || String(err)}`);
      return;
    }

    logWarn(`HTTP port ${primaryPort} is already in use. Falling back to a random free port.`);

    try {
      await tryListen(0);
      const address = httpServer.address();
      const actualPort = address && typeof address === 'object' ? address.port : 0;
      logInfo(`HTTP transport listening on port ${actualPort}`);
    } catch (fallbackErr) {
      logWarn(`HTTP transport disabled after fallback failure: ${fallbackErr?.message || String(fallbackErr)}`);
    }
  }
}

await startHttpTransport();
