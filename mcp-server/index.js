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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { buildPrompt, buildPersonalitySection } from './build-prompt.js';
import { readDesignZip, readDesignFolder } from './figma-client.js';

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
  : resolve(__dirname, '..', '.agent-prompt', 'current.md');

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

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'prompt-tools', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // {
    //   name: 'build_design_prompt',
    //   description: [
    //     'Build a rich, multi-layered design prompt from a Figma design memory export.',
    //     'Reads the design ZIP (or folder) produced by figma-design-memory.html,',
    //     'combines it with your saved config (framework, agents, business context, codebase),',
    //     'and returns the complete prompt string ready to use in a coding task.',
    //     '',
    //     'Workflow:',
    //     '  1. Open figma-design-memory.html, extract your Figma design, and click "Download All (ZIP)".',
    //     '  2. Click "Save Config for MCP" to write prompt-tools-config.json next to this server.',
    //     '  3. Call this tool with the ZIP path.',
    //   ].join('\n'),
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       design_zip: {
    //         type: 'string',
    //         description: 'Absolute or workspace-relative path to the design-memory-*.zip file.',
    //       },
    //       design_folder: {
    //         type: 'string',
    //         description: 'Absolute or workspace-relative path to a folder containing the extracted JSON files (alternative to design_zip).',
    //       },
    //       config_path: {
    //         type: 'string',
    //         description: 'Optional path to prompt-tools-config.json. Defaults to the one next to this server.',
    //       },
    //     },
    //   },
    // },
    // {
    //   name: 'get_config',
    //   description: 'Return a summary of the currently loaded prompt-tools config (framework, tech stack, agents, business context, codebase conventions).',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       config_path: {
    //         type: 'string',
    //         description: 'Optional path to prompt-tools-config.json.',
    //       },
    //     },
    //   },
    // },
    // {
    //   name: 'get_config_json',
    //   description: 'Return the full raw prompt-tools-config.json as a JSON string — identical to what the "Save Config for MCP" button writes. Use this to inspect or forward the complete config (framework, agents, business, codebase, connectors, templates including scaffolds and case studies).',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       config_path: {
    //         type: 'string',
    //         description: 'Optional path to prompt-tools-config.json. Defaults to the one next to this server.',
    //       },
    //     },
    //   },
    // },
    {
      name: 'get_current_prompt',
      description: 'Return the content of the current agent prompt file. Defaults to .agent-prompt/current.md next to this server, or the path in the PROMPT_TOOLS_PROMPT_PATH environment variable. Accepts absolute paths and ~ for the home directory.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt_path: {
            type: 'string',
            description: 'Absolute path, relative path, or ~/... path to the prompt .md file. Overrides the PROMPT_TOOLS_PROMPT_PATH env var and the built-in default.',
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'build_design_prompt') {
    const config = loadConfig(args?.config_path);

    let files = {};
    if (args?.design_zip) {
      const zipPath = resolve(args.design_zip);
      if (!existsSync(zipPath)) {
        return { content: [{ type: 'text', text: `Error: ZIP not found at ${zipPath}` }], isError: true };
      }
      files = await readDesignZip(zipPath);
    } else if (args?.design_folder) {
      const folderPath = resolve(args.design_folder);
      if (!existsSync(folderPath)) {
        return { content: [{ type: 'text', text: `Error: folder not found at ${folderPath}` }], isError: true };
      }
      files = readDesignFolder(folderPath);
    }
    // If neither provided, build prompt from config only (connectors, templates, business context, etc.)

    const prompt = buildPrompt(files, config);
    return { content: [{ type: 'text', text: prompt }] };
  }

  if (name === 'get_config') {
    const config = loadConfig(args?.config_path);
    const summary = {
      framework: config.framework?.framework || 'not set',
      customFramework: config.framework?.customFramework || '',
      techStack: (config.framework?.techStack || []).filter(t => t.enabled).map(t => `${t.name}${t.version ? ` v${t.version}` : ''}`),
      agentMode: config.agents?.teamMode || 'not set',
      masterAgent: config.agents?.masterAgent?.name || 'not set',
      subAgentCount: (config.agents?.agents || []).filter(a => a.enabled !== false).length,
      businessEnabled: config.business?.enabled || false,
      businessName: config.business?.enabled && config.business?.selected
        ? (config.business?.businesses || []).find(b => b.id === config.business.selected)?.name || 'unknown'
        : 'none',
      codebaseEnabled: config.codebase?.enabled || false,
      connectorsEnabled: Object.values(config.connectors?.components || {}).filter(c => c.enabled).length,
      templateSelected: config.templates?.selected || 'none',
      sectionsSelected: (config.templates?.selectedSections || []).length,
    };

    const agentPrompt = buildPersonalitySection(config);
    const text = JSON.stringify(summary, null, 2)
      + (agentPrompt ? '\n\n---\n\n' + agentPrompt : '');

    return { content: [{ type: 'text', text }] };
  }

  if (name === 'get_config_json') {
    const config = loadConfig(args?.config_path);
    return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
  }

  if (name === 'get_current_prompt') {
    const promptPath = args?.prompt_path 
      ? expandPath(args.prompt_path) 
      : DEFAULT_PROMPT_PATH;
    
    if (!existsSync(promptPath)) {
      return { content: [{ type: 'text', text: `Error: Current prompt file not found at ${promptPath}` }], isError: true };
    }
    
    try {
      const content = readFileSync(promptPath, 'utf8');
      return { content: [{ type: 'text', text: content }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error reading prompt file: ${e.message}` }], isError: true };
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
