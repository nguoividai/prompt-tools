/**
 * hooks.js — Programmable Hook System for Prompt Engine MCP Server
 *
 * Execution lifecycle:
 *
 *   1. BEFORE_HOOK       — preprocess / enrich the incoming request
 *   2. THINK             — (handled externally by the tool dispatcher)
 *   3. TOOL_HOOK         — validate, rate-limit, and audit before execution
 *   4. TOOL_EXECUTION    — run the actual MCP tool
 *   5. AFTER_TOOL_HOOK   — sanitize and enrich the raw tool output
 *   6. AFTER_HOOK        — format and summarise the final response
 *   7. SESSION_END_HOOK  — run async commands/tests; re-signal AI to fix on failure
 *
 * Default config (used by index.js):
 *
 *   before_hook:      rewrite_query, inject_context
 *   tool_hook:        validate_input, rate_limit, audit_log
 *   after_tool_hook:  sanitize_output, enrich_data
 *   after_hook:       format_markdown, add_summary
 *   session_end_hook: run_command, run_playwright_tests  (opt-in — empty by default)
 *
 * Each hook is a plain synchronous (or async) function that receives the
 * shared context object and mutates it in-place.  Hooks are composable —
 * you can add, remove, or reorder them by editing the config object.
 */

import { spawn as _spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

function expandPath(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Create a fresh context for one tool invocation.
 *
 * Shape:
 *   toolName       {string}   — MCP tool being called
 *   args           {object}   — (mutable) tool arguments
 *   toolResult     {object}   — set by TOOL_EXECUTION; { content[], isError? }
 *   meta           {object}   — arbitrary metadata accumulated by hooks
 *   requestId      {string}   — set by inject_context
 *   requestedAt    {string}   — ISO timestamp, set by inject_context
 *   _aborted       {boolean}  — set true by ctx.abort()
 *   _abortReason   {string}   — reason passed to ctx.abort()
 */
function createContext(toolName, args) {
  const logs = [];
  const initialArgs = args ? { ...args } : {};
  const inferredGoal = firstNonEmptyString(
    initialArgs.original_goal,
    initialArgs.goal,
    initialArgs.task,
    initialArgs.query,
    initialArgs.user_request,
    initialArgs.user_intent,
    initialArgs.primary_intent,
  );
  const inferredContextOnly = typeof initialArgs.context_only === 'boolean'
    ? initialArgs.context_only
    : toolName === 'get_current_prompt';

  return {
    toolName,
    args: initialArgs,
    toolResult: null,
    meta: {
      originalGoal: inferredGoal,
      contextOnly: inferredContextOnly,
      contextOnlyExplicit: typeof initialArgs.context_only === 'boolean',
    },
    requestId: null,
    requestedAt: null,
    _aborted: false,
    _abortReason: '',

    /** Record an internal log entry (not surfaced to the caller). */
    _log(phase, msg) {
      logs.push({ phase, msg, ts: Date.now() });
    },

    /** Abort the pipeline — remaining hooks and tool execution are skipped. */
    abort(reason) {
      this._aborted = true;
      this._abortReason = reason;
    },

    /** Retrieve all accumulated log entries (useful for debugging). */
    getLogs() {
      return logs.slice();
    },
  };
}

// ── Rate-limit state (module-level, per-tool) ─────────────────────────────────

const _rateLimitState = {};

function _shouldWrapWithNpx(command) {
  if (!command || typeof command !== 'string') return false;
  const trimmed = command.trim();
  if (!trimmed) return false;

  // Keep direct/system CLIs untouched.
  return !/^(npx|npm|pnpm|yarn|node|git|docker|bash|sh|cmd|powershell|pwsh)\b/i.test(trimmed);
}

// ── Hook Registry ─────────────────────────────────────────────────────────────

/**
 * HOOK_REGISTRY maps hook name → handler function.
 *
 * Each handler receives `ctx` and must return it (or a Promise that resolves
 * to it).  Use `ctx.abort(reason)` to halt the pipeline on fatal errors.
 *
 * Add custom hooks here and reference them in your hook config.
 */
const HOOK_REGISTRY = {

  // ── before_hook ──────────────────────────────────────────────────────────

  /**
   * rewrite_query
   * Normalise incoming string args: trim whitespace and unify path separators
   * so downstream code never has to worry about Windows backslashes.
   */
  rewrite_query(ctx) {
    if (ctx.args && typeof ctx.args === 'object') {
      const normalised = {};
      for (const [key, val] of Object.entries(ctx.args)) {
        normalised[key] = typeof val === 'string'
          ? val.trim().replace(/\\/g, '/')
          : val;
      }
      ctx.args = normalised;
    }
    ctx._log('before_hook:rewrite_query', 'Args normalised');
    return ctx;
  },

  /**
   * inject_context
   * Stamp a unique request ID and ISO timestamp onto the context so later
   * hooks (audit_log, add_summary) can reference them consistently.
   */
  inject_context(ctx) {
    ctx.requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    ctx.requestedAt = new Date().toISOString();
    ctx._log('before_hook:inject_context', `Request ID: ${ctx.requestId}`);
    return ctx;
  },

  // ── tool_hook ─────────────────────────────────────────────────────────────

  /**
   * validate_input
   * Abort the pipeline early if required constraints are violated so the
   * tool executor never receives invalid arguments.
   */
  validate_input(ctx) {
    const { toolName, args } = ctx;

    // max_chars must be a non-negative number when provided
    if (args.max_chars !== undefined) {
      if (typeof args.max_chars !== 'number' || args.max_chars < 0) {
        ctx.abort('validate_input: max_chars must be a non-negative number');
        return ctx;
      }
    }

    // offset must be a non-negative number when provided
    if (args.offset !== undefined) {
      if (typeof args.offset !== 'number' || args.offset < 0) {
        ctx.abort('validate_input: offset must be a non-negative number');
        return ctx;
      }
    }

    // build_design_prompt: design_zip / design_folder paths must be strings if given
    if (toolName === 'build_design_prompt') {
      if (args.design_zip !== undefined && typeof args.design_zip !== 'string') {
        ctx.abort('validate_input: design_zip must be a string path');
        return ctx;
      }
      if (args.design_folder !== undefined && typeof args.design_folder !== 'string') {
        ctx.abort('validate_input: design_folder must be a string path');
        return ctx;
      }
    }

    ctx._log('tool_hook:validate_input', `Validation passed for tool "${toolName}"`);
    return ctx;
  },

  /**
   * rate_limit
   * Enforce a minimum interval between successive calls to the same tool.
   * Logs a warning when the interval is breached but does NOT abort — the
   * MCP server is local and the caller is trusted code, not end-users.
   */
  rate_limit(ctx) {
    const MIN_INTERVAL_MS = 100;
    const now = Date.now();
    const last = _rateLimitState[ctx.toolName] ?? 0;
    const elapsed = now - last;

    if (elapsed < MIN_INTERVAL_MS) {
      ctx._log(
        'tool_hook:rate_limit',
        `Warning: ${ctx.toolName} called ${elapsed}ms after last call (min ${MIN_INTERVAL_MS}ms)`,
      );
    }

    _rateLimitState[ctx.toolName] = now;
    return ctx;
  },

  /**
   * audit_log
   * Emit a structured log entry to stderr so it is captured by the MCP host
   * without polluting the stdout transport channel.
   */
  audit_log(ctx) {
    const entry = {
      requestId: ctx.requestId ?? 'unknown',
      timestamp: ctx.requestedAt ?? new Date().toISOString(),
      tool: ctx.toolName,
      argsKeys: Object.keys(ctx.args),
    };
    process.stderr.write(`[audit] ${JSON.stringify(entry)}\n`);
    ctx._log('tool_hook:audit_log', `Logged: ${entry.requestId}`);
    return ctx;
  },

  // ── after_tool_hook ───────────────────────────────────────────────────────

  /**
   * sanitize_output
   * Redact common secret patterns (Bearer tokens, generic API keys) from
   * text content so sensitive values are never forwarded to the AI model.
   */
  sanitize_output(ctx) {
    if (!ctx.toolResult?.content) return ctx;

    ctx.toolResult.content = ctx.toolResult.content.map(item => {
      if (item.type !== 'text' || typeof item.text !== 'string') return item;

      const sanitized = item.text
        // Bearer tokens
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]')
        // Inline API key assignments  (api_key="…", apiKey: "…", etc.)
        .replace(
          /\b(api[_-]?key|apikey|secret|token)\s*[:=]\s*["']?[A-Za-z0-9\-_]{16,}["']?/gi,
          (_, name) => `${name}=[REDACTED]`,
        );

      return { ...item, text: sanitized };
    });

    ctx._log('after_tool_hook:sanitize_output', 'Secrets redacted');
    return ctx;
  },

  /**
   * enrich_data
   * Attach output statistics (character count) to ctx.meta so other hooks
   * or the caller can inspect them without re-scanning the content.
   */
  enrich_data(ctx) {
    if (!ctx.toolResult?.content || ctx.toolResult?.isError) return ctx;

    const totalChars = ctx.toolResult.content
      .filter(i => i.type === 'text')
      .reduce((sum, i) => sum + (i.text?.length ?? 0), 0);

    ctx.meta.outputChars = totalChars;
    ctx._log('after_tool_hook:enrich_data', `Output: ${totalChars} chars`);
    return ctx;
  },

  /**
   * include_current_prompt
   * Append the current agent prompt file to the tool result so every tool
   * invocation includes the active agent prompt for context.
   *
   * Priority for prompt path:
   *   1) ctx.args.prompt_path
   *   2) env PROMPT_TOOLS_PROMPT_PATH
   *   3) .agent-prompt/current.md next to this module
   */
  include_current_prompt(ctx) {
    try {
      if (ctx.toolName === 'get_current_prompt') {
        ctx._log('after_tool_hook:include_current_prompt', 'Skipped for get_current_prompt to avoid duplicate prompt content');
        return ctx;
      }

      const argPath = ctx.args && typeof ctx.args.prompt_path === 'string' && ctx.args.prompt_path.trim()
        ? ctx.args.prompt_path
        : null;
      const promptPath = argPath
        ? expandPath(argPath)
        : (process.env.PROMPT_TOOLS_PROMPT_PATH ? expandPath(process.env.PROMPT_TOOLS_PROMPT_PATH) : resolve(__dirname, '.agent-prompt', 'current.md'));

      if (!existsSync(promptPath)) {
        ctx._log('after_tool_hook:include_current_prompt', `Prompt not found: ${promptPath}`);
        return ctx;
      }

      const content = readFileSync(promptPath, 'utf8');
      const header = '\n\n---\n## Current Agent Prompt\n\n';
      const block = header + '```' + '\n' + content + '\n' + '```' + '\n';

      if (!ctx.toolResult) {
        ctx.toolResult = { content: [{ type: 'text', text: block }] };
      } else {
        const hasText = Array.isArray(ctx.toolResult.content) && ctx.toolResult.content.some(i => i.type === 'text');
        if (!hasText) {
          ctx.toolResult.content = [...(ctx.toolResult.content || []), { type: 'text', text: block }];
        } else {
          ctx.toolResult.content = ctx.toolResult.content.map((item, idx) => {
            if (idx === 0 && item.type === 'text') return { ...item, text: (item.text || '') + block };
            return item;
          });
        }
      }

      ctx._log('after_tool_hook:include_current_prompt', `Appended prompt from ${promptPath}`);
    } catch (e) {
      ctx._log('after_tool_hook:include_current_prompt', `Error reading prompt: ${e.message}`);
    }
    return ctx;
  },

  // ── after_hook ────────────────────────────────────────────────────────────

  /**
   * format_markdown
   * Collapse runs of 3+ blank lines to 2 and ensure the text ends with
   * exactly one newline — keeps prompts clean for downstream AI consumption.
   */
  format_markdown(ctx) {
    if (!ctx.toolResult?.content) return ctx;

    ctx.toolResult.content = ctx.toolResult.content.map(item => {
      if (item.type !== 'text' || typeof item.text !== 'string') return item;
      return { ...item, text: item.text.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n' };
    });

    ctx._log('after_hook:format_markdown', 'Markdown formatted');
    return ctx;
  },

  /**
   * add_intent_preamble
   * Make the original objective explicit so downstream models treat this tool
   * output as supplemental context, not the final answer.
   */
  add_intent_preamble(ctx) {
    if (!ctx.toolResult?.content || ctx.toolResult?.isError) return ctx;

    const goal = typeof ctx.meta.originalGoal === 'string' ? ctx.meta.originalGoal.trim() : '';
    const contextOnly = ctx.meta.contextOnly === true;
    const contextOnlyExplicit = ctx.meta.contextOnlyExplicit === true;

    if (!goal && !contextOnlyExplicit) return ctx;

    const lines = ['## Retrieval Intent', ''];
    if (goal) lines.push(`Primary objective: ${goal}`);
    if (contextOnly && (goal || contextOnlyExplicit)) {
      lines.push('This tool call is for context retrieval only. After reading this output, continue solving the primary objective instead of stopping here.');
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    const preamble = lines.join('\n');

    ctx.toolResult.content = ctx.toolResult.content.map((item, i) => {
      if (i === 0 && item.type === 'text') {
        return { ...item, text: preamble + (item.text || '') };
      }
      return item;
    });

    ctx._log('after_hook:add_intent_preamble', 'Intent preamble prepended');
    return ctx;
  },

  /**
   * add_summary
   * Prepend an invisible HTML comment to the first text block with request
   * metadata.  HTML comments are hidden in rendered markdown but visible to
   * the AI model, providing lightweight provenance without cluttering output.
   */
  add_summary(ctx) {
    if (!ctx.toolResult?.content || ctx.toolResult?.isError) return ctx;

    // Keep get_current_prompt output fully clean by default.
    // Opt-in only when explicit debugging is requested.
    if (ctx.toolName === 'get_current_prompt' && ctx.args?.include_meta_comment !== true) {
      ctx._log('after_hook:add_summary', 'Skipped for get_current_prompt (clean output mode)');
      return ctx;
    }

    const header =
      `<!-- tool:${ctx.toolName}` +
      ` | req:${ctx.requestId ?? 'n/a'}` +
      ` | ${ctx.requestedAt ?? ''}` +
      ` | chars:${ctx.meta.outputChars ?? '?'}` +
      ` | context_only:${ctx.meta.contextOnly === true}` +
      ` | goal:${(ctx.meta.originalGoal || '').replace(/-->/g, '').slice(0, 240)} -->\n`;

    ctx.toolResult.content = ctx.toolResult.content.map((item, i) => {
      if (i === 0 && item.type === 'text') {
        return { ...item, text: header + item.text };
      }
      return item;
    });

    ctx._log('after_hook:add_summary', 'Summary header prepended');
    return ctx;
  },

  // ── session_end_hook ──────────────────────────────────────────────────────

  /**
   * run_command
   *
   * Execute an arbitrary CLI command automatically in the MCP pipeline.
    * Captures stdout/stderr and appends the result to ctx.toolResult.
    *
    * By default this hook runs commands through npx so the same MCP server
    * can execute project-local CLIs across different codebases.
   *
   * Context args consumed:
   *   ctx.args.cli_command    {string}   — Required: the command to run (e.g., "npm run build" or "yarn test")
   *   ctx.args.cli_cwd        {string}   — Optional: working directory (defaults to process.cwd())
   *   ctx.args.cli_shell      {boolean}  — Optional: use shell for execution (defaults to true on Windows, false on Unix)
   *   ctx.args.cli_timeout    {number}   — Optional: timeout in milliseconds (default: 60000)
   *   ctx.args.cli_show_output {boolean} — Optional: include command output in tool result (default: true)
    *   ctx.args.cli_use_npx    {boolean}  — Optional: run command via npx (default: true)
   *
   * Writes to ctx.meta:
    *   ctx.meta.cliResult      — { code, stdout, stderr, duration, command, executedCommand }
   *
   * If command fails (non-zero exit code), appends an error report to ctx.toolResult
   * and sets isError: true.
   */
  async run_command(ctx) {
    const {
      cli_command,
      cli_cwd,
      cli_shell,
      cli_timeout,
      cli_show_output,
      cli_use_npx,
    } = ctx.args;

    if (!cli_command || typeof cli_command !== 'string') {
      ctx._log('session_end_hook:run_command', 'Skipped: cli_command not provided or invalid');
      return ctx;
    }

    const cwd = cli_cwd || process.cwd();
    const useShell = typeof cli_shell === 'boolean' ? cli_shell : process.platform === 'win32';
    const timeout = typeof cli_timeout === 'number' ? cli_timeout : 60000;
    const showOutput = typeof cli_show_output === 'boolean' ? cli_show_output : true;
    const useNpx = typeof cli_use_npx === 'boolean' ? cli_use_npx : true;
    const executedCommand = useNpx && _shouldWrapWithNpx(cli_command)
      ? `npx ${cli_command}`
      : cli_command;

    ctx._log('session_end_hook:run_command', `Running: ${executedCommand} (cwd: ${cwd}, timeout: ${timeout}ms)`);

    const startTime = Date.now();
    const { code, stdout, stderr } = await new Promise((resolve) => {
      let out = '';
      let err = '';
      let timedOut = false;

      const child = _spawn(executedCommand, [], {
        cwd,
        shell: useShell,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill();
        resolve({ code: -1, stdout: out, stderr: `Command timed out after ${timeout}ms` });
      }, timeout);

      child.stdout?.on('data', (d) => { out += d.toString(); });
      child.stderr?.on('data', (d) => { err += d.toString(); });
      child.on('close', (c) => {
        clearTimeout(timeoutHandle);
        if (!timedOut) resolve({ code: c ?? 1, stdout: out, stderr: err });
      });
      child.on('error', (e) => {
        clearTimeout(timeoutHandle);
        resolve({ code: 1, stdout: out, stderr: e.message });
      });
    });

    const duration = Date.now() - startTime;

    const result = { code, stdout, stderr, duration, command: cli_command, executedCommand };
    ctx.meta.cliResult = result;

    const success = code === 0;
    const status = success ? '✅' : '❌';
    const time = (duration / 1000).toFixed(2);

    ctx._log('session_end_hook:run_command',
      `${status} Command exited with code ${code} (${time}s)`);

    if (!showOutput) return ctx;

    const lines = [
      '',
      '---',
      '## 📋 Command Execution Result',
      '',
      `| | Value |`,
      `|---|---|`,
      `| **Status** | ${success ? '✅ Success' : '❌ Failed'} |`,
      `| **Command** | \`${cli_command}\` |`,
      `| **Executed As** | \`${executedCommand}\` |`,
      `| **Exit Code** | ${code} |`,
      `| **Duration** | ${time}s |`,
      `| **Directory** | \`${cwd}\` |`,
      '',
    ];

    if (stdout.trim()) {
      lines.push('### 📤 STDOUT');
      lines.push('```');
      lines.push(stdout.trim().slice(0, 2000)); // Truncate to 2000 chars
      if (stdout.length > 2000) lines.push('... (truncated)');
      lines.push('```');
      lines.push('');
    }

    if (stderr.trim()) {
      lines.push('### 📥 STDERR');
      lines.push('```');
      lines.push(stderr.trim().slice(0, 2000)); // Truncate to 2000 chars
      if (stderr.length > 2000) lines.push('... (truncated)');
      lines.push('```');
      lines.push('');
    }

    if (!success) {
      lines.push('---');
      lines.push('> **⚠️ Command failed.** Review the error messages above and fix the issue.');
      lines.push('');
    }

    lines.push('---');

    const report = lines.join('\n');
    _appendCommandResult(ctx, report, !success);

    return ctx;
  },

  /**
   * run_playwright_tests
   *
   * Runs `npx playwright test --reporter=json` as a subprocess, parses the
   * JSON results, and — if any tests fail — appends a structured failure
   * report to ctx.toolResult telling the AI exactly what broke and asking it
   * to fix the code and call the tool again.
   *
   * The hook does NOT abort the pipeline.  The main tool content is preserved
   * alongside the failure report so the AI has full context when fixing.
   *
   * Context args consumed (all optional):
   *   ctx.args.test_cwd          — working directory for the test run
   *   ctx.args.playwright_config — path to playwright.config.{ts,js}
   *
   * Writes to ctx.meta:
   *   ctx.meta.playwrightResult  — { passed, total, passCount, failCount, failures[], duration }
   */
  async run_playwright_tests(ctx) {
    const cwd       = ctx.args?.test_cwd || process.cwd();
    const configArg = ctx.args?.playwright_config;

    const spawnArgs = ['playwright', 'test', '--reporter=json'];
    if (configArg) spawnArgs.push('--config', configArg);

    ctx._log('session_end_hook:run_playwright_tests', `Running: npx ${spawnArgs.join(' ')} in ${cwd}`);

    const { code, stdout, stderr } = await new Promise((resolve) => {
      const child = _spawn('npx', spawnArgs, {
        cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        shell: process.platform === 'win32',
      });
      let out = '';
      let err = '';
      child.stdout?.on('data', (d) => { out += d.toString(); });
      child.stderr?.on('data', (d) => { err += d.toString(); });
      child.on('close', (c) => resolve({ code: c ?? 1, stdout: out, stderr: err }));
      child.on('error', (e) => resolve({ code: 1, stdout: '', stderr: e.message }));
    });

    // Playwright JSON reporter writes to stdout; extract the outermost JSON object.
    let report = null;
    const jsonMatch = stdout.match(/(\{[\s\S]*\})\s*$/);
    if (jsonMatch) {
      try { report = JSON.parse(jsonMatch[1]); } catch (_) {}
    }
    if (!report) {
      try { report = JSON.parse(stdout); } catch (_) {}
    }

    if (!report) {
      const msg = `Could not parse Playwright JSON output (exit ${code}).\nstderr: ${stderr.slice(0, 400)}`;
      ctx._log('session_end_hook:run_playwright_tests', msg);
      _appendTestReport(ctx, { passed: false, total: 0, passCount: 0, failCount: 0, failures: [], parseError: msg, duration: 0 });
      return ctx;
    }

    // Recursively collect failures from nested suites.
    const failures = [];
    function walkSuites(suites, filePath) {
      for (const suite of suites || []) {
        const file = suite.file || filePath || '';
        for (const spec of suite.specs || []) {
          for (const test of spec.tests || []) {
            const badResult = (test.results || []).find(
              r => r.status !== 'passed' && r.status !== 'skipped',
            );
            if (badResult) {
              failures.push({
                file,
                title: spec.title,
                status: badResult.status || 'failed',
                error: badResult.error?.message?.split('\n')[0] || 'unknown error',
                stack: (badResult.error?.stack || '').split('\n').slice(0, 6).join('\n'),
                retry: badResult.retry ?? 0,
                duration: badResult.duration ?? 0,
              });
            }
          }
        }
        if (suite.suites) walkSuites(suite.suites, file);
      }
    }
    walkSuites(report.suites);

    const stats    = report.stats || {};
    const total    = (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.skipped ?? 0) + (stats.flaky ?? 0);
    const passCount = stats.expected  ?? 0;
    const failCount = stats.unexpected ?? 0;
    const duration  = stats.duration   ?? 0;

    const result = { passed: failures.length === 0, total, passCount, failCount, failures, duration };
    ctx.meta.playwrightResult = result;

    if (result.passed) {
      ctx._log('session_end_hook:run_playwright_tests',
        `✅ All ${total} test(s) passed in ${(duration / 1000).toFixed(1)}s`);
    } else {
      ctx._log('session_end_hook:run_playwright_tests',
        `❌ ${failCount} of ${total} test(s) failed — appending failure report`);
      _appendTestReport(ctx, result);
    }

    return ctx;
  },
};

/**
 * Append a structured Playwright failure report to ctx.toolResult.
 * Called by run_playwright_tests when tests fail.
 */
function _appendTestReport(ctx, result) {
  const { total, passCount, failCount, failures, parseError, duration } = result;

  const lines = [
    '',
    '---',
    '## ⚠️ Playwright Test Report — ACTION REQUIRED',
    '',
    `| | Value |`,
    `|---|---|`,
    `| **Status** | ${parseError ? '❌ Parse error' : failures.length === 0 ? '✅ All passed' : `❌ ${failCount} failed`} |`,
    `| **Total** | ${total} |`,
    `| **Passed** | ${passCount} |`,
    `| **Failed** | ${failCount} |`,
    `| **Duration** | ${(duration / 1000).toFixed(1)}s |`,
    '',
  ];

  if (parseError) {
    lines.push('### ❌ Could not parse test output');
    lines.push('');
    lines.push('```');
    lines.push(parseError);
    lines.push('```');
  } else {
    lines.push(`### ❌ Failed Test Cases (${failCount})`);
    lines.push('');
    failures.forEach((f, i) => {
      lines.push(`#### ${i + 1}. ${f.title}`);
      lines.push(`- **File:** \`${f.file}\``);
      lines.push(`- **Status:** \`${f.status}\`${f.retry > 0 ? ` _(retry ${f.retry})_` : ''}`);
      lines.push(`- **Error:** ${f.error}`);
      if (f.stack) {
        lines.push('```');
        lines.push(f.stack);
        lines.push('```');
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('> **🔁 Action required:** Fix every failing test case listed above,');
  lines.push('> then call this tool again. The session will close only when all tests pass.');
  lines.push('');

  const report = lines.join('\n');

  if (!ctx.toolResult) {
    ctx.toolResult = { content: [{ type: 'text', text: report }], isError: true };
    return;
  }

  // Append to first existing text block, or add a new one.
  const hasText = ctx.toolResult.content?.some(i => i.type === 'text');
  if (!hasText) {
    ctx.toolResult.content = [...(ctx.toolResult.content || []), { type: 'text', text: report }];
  } else {
    ctx.toolResult.content = ctx.toolResult.content.map((item, idx) => {
      if (idx === 0 && item.type === 'text') return { ...item, text: item.text + report };
      return item;
    });
  }
  ctx.toolResult.isError = true;
}

// ── Pipeline executor ─────────────────────────────────────────────────────────

/**
 * Run a list of named hooks against a context object in order.
 * Stops early if ctx._aborted becomes true.
 *
 * @param {string[]} hookNames
 * @param {object}   ctx
 */
async function runHooks(hookNames, ctx) {
  for (const name of hookNames) {
    if (ctx._aborted) break;
    const fn = HOOK_REGISTRY[name];
    if (!fn) {
      ctx._log('pipeline', `Warning: unknown hook "${name}" — skipped`);
      continue;
    }
    await fn(ctx);
  }
}

/**
 * Append a command execution result to ctx.toolResult.
 * Called by run_command when output should be displayed.
 */
function _appendCommandResult(ctx, report, isError) {
  if (!ctx.toolResult) {
    ctx.toolResult = { content: [{ type: 'text', text: report }], isError };
    return;
  }

  // Append to first existing text block, or add a new one.
  const hasText = ctx.toolResult.content?.some(i => i.type === 'text');
  if (!hasText) {
    ctx.toolResult.content = [...(ctx.toolResult.content || []), { type: 'text', text: report }];
  } else {
    ctx.toolResult.content = ctx.toolResult.content.map((item, idx) => {
      if (idx === 0 && item.type === 'text') return { ...item, text: item.text + report };
      return item;
    });
  }
  if (isError) ctx.toolResult.isError = true;
}

/**
 * Append a human-readable execution trace to the tool response content.
 * This makes hook activity visible to MCP clients that do not expose stderr.
 */
function appendExecutionTrace(result, ctx, hookConfig, status) {
  const toList = (arr) => (arr && arr.length ? arr.join(', ') : '(none)');
  const logs = ctx.getLogs();
  const startedAt = ctx.requestedAt || new Date().toISOString();
  const lines = [
    '',
    '---',
    '## Hook Execution Trace',
    `status: ${status}`,
    `tool: ${ctx.toolName}`,
    `request_id: ${ctx.requestId || 'n/a'}`,
    `started_at: ${startedAt}`,
    '',
    'configured_hooks:',
    `  before_hook:      ${toList(hookConfig.before_hook)}`,
    `  tool_hook:        ${toList(hookConfig.tool_hook)}`,
    `  after_tool_hook:  ${toList(hookConfig.after_tool_hook)}`,
    `  after_hook:       ${toList(hookConfig.after_hook)}`,
    `  session_end_hook: ${toList(hookConfig.session_end_hook)}`,
    '',
    'steps:',
  ];

  if (!logs.length) {
    lines.push('  1. (no hook logs captured)');
  } else {
    logs.forEach((l, i) => lines.push(`  ${i + 1}. ${l.phase} -> ${l.msg}`));
  }

  const trace = lines.join('\n') + '\n';
  const safeResult = result || { content: [{ type: 'text', text: '' }] };
  const hasText = Array.isArray(safeResult.content)
    && safeResult.content.some(item => item.type === 'text');

  if (!hasText) {
    safeResult.content = [...(safeResult.content || []), { type: 'text', text: trace }];
    return safeResult;
  }

  safeResult.content = safeResult.content.map((item, idx) => {
    if (idx === 0 && item.type === 'text') return { ...item, text: (item.text || '') + trace };
    return item;
  });
  return safeResult;
}

/**
 * Execute the full six-phase lifecycle for a single tool call.
 *
 * @param {object}   hookConfig     — { before_hook?, tool_hook?, after_tool_hook?, after_hook? }
 * @param {string}   toolName       — MCP tool name
 * @param {object}   args           — raw tool arguments from the MCP request
 * @param {Function} toolExecutor   — async (ctx) => { content[], isError? }
 * @param {object}   options        — { includeTrace?: boolean }
 * @returns {Promise<object>}         MCP-compatible result object
 */
async function runPipeline(hookConfig, toolName, args, toolExecutor, options = {}) {
  const ctx = createContext(toolName, args);
  const includeTrace = !!options.includeTrace;

  if (!hookConfig.after_hook?.includes('add_intent_preamble')) {
    hookConfig = {
      ...hookConfig,
      after_hook: ['add_intent_preamble', ...(hookConfig.after_hook ?? [])],
    };
  }

  // ── Phase 1: BEFORE_HOOK ──────────────────────────────────────────────────
  await runHooks(hookConfig.before_hook ?? [], ctx);
  if (ctx._aborted) {
    let result = {
      content: [{ type: 'text', text: `[before_hook aborted] ${ctx._abortReason}` }],
      isError: true,
    };
    if (includeTrace) result = appendExecutionTrace(result, ctx, hookConfig, 'aborted@before_hook');
    return result;
  }

  // ── Phase 2: THINK ────────────────────────────────────────────────────────
  // Reasoning happens inside toolExecutor; this phase is a no-op in the hook
  // system but is reserved for future pre-execution planning hooks.

  // ── Phase 3: TOOL_HOOK ────────────────────────────────────────────────────
  await runHooks(hookConfig.tool_hook ?? [], ctx);
  if (ctx._aborted) {
    let result = {
      content: [{ type: 'text', text: `[tool_hook aborted] ${ctx._abortReason}` }],
      isError: true,
    };
    if (includeTrace) result = appendExecutionTrace(result, ctx, hookConfig, 'aborted@tool_hook');
    return result;
  }

  // ── Phase 4: TOOL_EXECUTION ───────────────────────────────────────────────
  ctx.toolResult = await toolExecutor(ctx);

  // ── Phase 5: AFTER_TOOL_HOOK ──────────────────────────────────────────────
  await runHooks(hookConfig.after_tool_hook ?? [], ctx);

  // ── Phase 6: AFTER_HOOK ───────────────────────────────────────────────────
  await runHooks(hookConfig.after_hook ?? [], ctx);

  // ── Phase 7: SESSION_END_HOOK ─────────────────────────────────────────────
  // Hooks in this phase run AFTER formatting and summary.  They MUST NOT call
  // ctx.abort() — instead they append directly to ctx.toolResult.content.
  // The canonical use-case is run_playwright_tests: it appends a failure report
  // and signals the AI to fix the code and retry.
  await runHooks(hookConfig.session_end_hook ?? [], ctx);

  let result = ctx.toolResult;
  if (includeTrace) result = appendExecutionTrace(result, ctx, hookConfig, 'completed');
  return result;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export { HOOK_REGISTRY, createContext, runHooks, runPipeline };
