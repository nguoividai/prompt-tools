/**
 * build-prompt.js
 * Pure prompt-building functions ported from figma-design-memory.html.
 * No DOM, no localStorage — all state comes from the `state` parameter.
 *
 * state shape (from prompt-tools-config.json):
 * {
 *   framework:  { framework, customFramework, techStack[] }
 *   agents:     { teamName, teamMode, masterAgent, agents[] }
 *   business:   { enabled, selected, businesses[] }
 *   codebase:   { enabled, markdown }
 *   connectors: { components: { [id]: { enabled, figma_name, code_component, import_path, usage } } }
 *   templates:  { selected, selectedSections[], templates: {}, caseStudies: {} }
 * }
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const STACK_CATEGORIES = ['Frontend', 'UI Library', 'State', 'Backend', 'Language', 'Build Tool', 'API', 'Utilities'];

const AGENT_PRESETS = [
  { value: 'strategic',        label: '🎯 Strategic Advisor', icon: '🎯' },
  { value: 'mentor',           label: '🧑‍🏫 Mentor',           icon: '🧑‍🏫' },
  { value: 'business-analyst', label: '📝 Business Analyst',  icon: '📝' },
  { value: 'innovator',        label: '⚡ Innovator',          icon: '⚡' },
  { value: 'perfectionist',    label: '✨ Perfectionist',      icon: '✨' },
  { value: 'pragmatist',       label: '🔧 Pragmatist',         icon: '🔧' },
  { value: 'custom',           label: '✍️ Custom Name',        icon: '✍️' },
];

// ─── Sketch helpers ───────────────────────────────────────────────────────────

const _SK_INNER = 60;
const _SK_TOTAL = _SK_INNER + 4;

function _sketchFirstText(node, depth) {
  if (!node) return '';
  if (node.type === 'TEXT' && node.text) return node.text;
  if ((depth || 0) >= 3) return '';
  for (const c of node.children || []) {
    const t = _sketchFirstText(c, (depth || 0) + 1);
    if (t) return t;
  }
  return '';
}

function _sketchRole(name, type) {
  const n = (name || '').toLowerCase();
  const t = (type || '').toLowerCase();
  if (t === 'text') return 'text';
  if (n.includes('paging') || n.includes('pagination')) return 'paging';
  if (/\btabs?\b/.test(n) || n.endsWith('-tab') || n.endsWith('-tabs')) return 'tabs';
  if (n.includes('table') || n.includes('grid') || n.includes('data-list')) return 'table';
  if (n.includes('filter') || n.includes('search-bar') || n.includes('searchbar')) return 'filter';
  if (n.includes('header') || n.includes('toolbar') || n === 'title' || n.includes('title-bar')) return 'header';
  if (n.includes('button') || n.includes(' btn') || n.startsWith('btn') || n.startsWith('cta')) return 'button';
  if (n.includes('select') || n.includes('dropdown') || n.includes('combobox') || n.includes('multiselect')) return 'select';
  if (/date|calendar|datepicker/.test(n)) return 'datepicker';
  if (n.includes('search') || (n.includes('input') && !n.includes('date'))) return 'search';
  if (n.includes('badge') || n.includes('status') || n.includes('chip') || n.includes('tag')) return 'badge';
  if (n.includes('icon') || n.includes('avatar') || n.includes('logo') || n.includes('image')) return 'icon';
  if (n.includes('modal') || n.includes('dialog') || n.includes('drawer')) return 'modal';
  if (t === 'instance' || t === 'component') return 'component';
  return 'frame';
}

function _sketchNodeInline(node, colorMode) {
  if (!node) return '';
  const role = _sketchRole(node.name, node.type);
  const rawLabel = (node.text || _sketchFirstText(node) || node.name || '').replace(/\s+/g, ' ').trim();
  const bgAnn = colorMode && node.fills?.[0]?.color ? `·bg:${node.fills[0].color}` : '';
  const clrAnn = colorMode && node.type === 'TEXT' && node.fills?.[0]?.color ? `·clr:${node.fills[0].color}` : '';
  switch (role) {
    case 'text':       return `"${rawLabel.slice(0, 30)}"${clrAnn}`;
    case 'button':     return `[${(rawLabel || 'Button').slice(0, 18)}]${bgAnn}`;
    case 'select':     return `[▼ ${(rawLabel || 'Select').slice(0, 14)}]${bgAnn}`;
    case 'datepicker': return `[📅 ${(rawLabel || 'Date').slice(0, 12)}]${bgAnn}`;
    case 'search':     return `[🔍 ${(rawLabel || 'Search…').slice(0, 14)}]${bgAnn}`;
    case 'badge':      return `‹${(rawLabel || 'Status').slice(0, 12)}›${clrAnn}`;
    case 'icon':       return `[icon]`;
    case 'paging':     return `[← 1 2 3 … →]`;
    case 'tabs':       return `[Tabs: ${rawLabel.slice(0, 20)}]`;
    case 'table':      return `[Table: ${rawLabel.slice(0, 18)}]`;
    case 'component':  return `⬡ ${(node.name || '').slice(0, 22)}${bgAnn}`;
    default:           return `{${(node.name || '?').slice(0, 20)}}${bgAnn}`;
  }
}

function _sketchRow(nodes, colorMode, maxW) {
  const tokens = (nodes || []).slice(0, 12).map(n => _sketchNodeInline(n, colorMode)).filter(Boolean);
  if (!tokens.length) return [''];
  const lines = [];
  let cur = '';
  for (const tok of tokens) {
    const candidate = cur ? cur + '  ' + tok : tok;
    if (candidate.length > maxW && cur) { lines.push(cur); cur = tok; }
    else cur = candidate;
  }
  if (cur) lines.push(cur);
  return lines;
}

function _boxHr(L, R, fill) {
  return L + fill.repeat(_SK_TOTAL - 2) + R;
}
function _boxHrLabel(L, R, fill, label) {
  const trunc = label.slice(0, _SK_TOTAL - 4);
  return L + trunc + fill.repeat(Math.max(1, _SK_TOTAL - 2 - trunc.length)) + R;
}
function _boxLine(content) {
  const s = String(content || '').slice(0, _SK_INNER);
  return '║ ' + s.padEnd(_SK_INNER) + ' ║';
}

function _sketchSection(node, colorMode) {
  const role = _sketchRole(node.name, node.type);
  const children = node.children || [];
  const lines = [];
  const bgAnn = colorMode && node.fills?.[0]?.color ? `  bg:${node.fills[0].color}` : '';

  if (role === 'paging') {
    lines.push(`[←]  1  2  3  …  [→]        Per page: [10 ▼]${bgAnn}`);
  } else if (role === 'tabs') {
    const tabLabels = children.map(c => c.text || _sketchFirstText(c) || c.name || '?').slice(0, 8);
    lines.push((tabLabels.join(' | ') || '(no tabs)') + bgAnn);
  } else if (role === 'table') {
    const headerRow = children.find(c => (c.children || []).filter(cc => cc.type === 'TEXT').length > 1);
    const cols = headerRow
      ? (headerRow.children || []).filter(c => c.type === 'TEXT')
      : children.filter(c => c.type === 'TEXT');
    if (cols.length) {
      const colW = Math.max(6, Math.floor((_SK_INNER - cols.length - 1) / cols.length));
      const sep = '─'.repeat(colW);
      const mkRow = vals => '│' + vals.map(s => s.padEnd(colW).slice(0, colW)).join('│') + '│';
      const colNames = cols.map(c => (c.text || c.name || '').slice(0, colW));
      const dataRow = cols.map(c => {
        const nm = (c.text || c.name || '').toLowerCase();
        return nm.includes('status') ? '‹badge›' : nm.includes('date') ? '01/01/2026' : '(data)';
      });
      lines.push('┌' + cols.map(() => sep).join('┬') + '┐');
      lines.push(mkRow(colNames));
      lines.push('├' + cols.map(() => sep).join('┼') + '┤');
      lines.push(mkRow(dataRow));
      lines.push('└' + cols.map(() => sep).join('┴') + '┘');
    } else if (children.length) {
      _sketchRow(children, colorMode, _SK_INNER - 2).forEach(l => lines.push(l));
    } else {
      lines.push('(empty table)');
    }
  } else if (role === 'filter') {
    const rows = children.filter(c => c.children && c.children.length > 0).slice(0, 6);
    if (rows.length) {
      rows.forEach(row => _sketchRow(row.children || [], colorMode, _SK_INNER - 2).forEach(l => lines.push(l)));
    } else {
      _sketchRow(children, colorMode, _SK_INNER - 2).forEach(l => lines.push(l));
    }
    if (bgAnn) lines.push(bgAnn.trim());
  } else if (role === 'header') {
    const textKids = children.filter(c => c.type === 'TEXT');
    const otherKids = children.filter(c => c.type !== 'TEXT');
    const titleText = textKids[0]?.text || _sketchFirstText(node) || node.name || '';
    const btns = otherKids.slice(0, 5).map((b, i) => {
      const lbl = (_sketchFirstText(b) || b.name || 'Btn').slice(0, 16);
      const fAnn = colorMode && b.fills?.[0]?.color ? `·${b.fills[0].color}` : '';
      return i === 0 ? `[+ ${lbl}]${fAnn}` : `[${lbl}]${fAnn}`;
    });
    lines.push((`"${titleText.slice(0, 28)}"` + (btns.length ? '  ' + btns.join('  ') : '') + bgAnn).slice(0, _SK_INNER));
  } else {
    if (children.length) {
      _sketchRow(children, colorMode, _SK_INNER - 2).forEach(l => lines.push(l));
    } else {
      lines.push(_sketchNodeInline(node, colorMode));
    }
    if (bgAnn && !lines.some(l => l.includes(bgAnn.trim()))) lines.push(bgAnn.trim());
  }

  return lines.length ? lines : [''];
}

function _sketchFrame(frame, colorMode) {
  const W = frame.size?.width || 0;
  const H = frame.size?.height || 0;
  const bg = frame.background || '';
  const rows = [];

  rows.push(_boxHrLabel('╔', '╗', '═', `══ Frame: "${frame.name.slice(0, 24)}" · ${W}×${H} `));
  if (colorMode && bg) rows.push(_boxLine(`bg:${bg}`));
  if (frame.layout) {
    const l = frame.layout;
    const p = l.padding || {};
    rows.push(_boxLine(`layout:${l.mode}  gap:${l.gap || 0}  pad:${p.t || 0}/${p.r || 0}/${p.b || 0}/${p.l || 0}`));
  }

  const children = (frame.children || []).slice(0, 8);
  if (!children.length) {
    rows.push(_boxHrLabel('╠', '╣', '═', '══ (no children extracted) '));
    rows.push(_boxLine('Enable "Wireframe hierarchy" toggle and re-extract'));
  } else {
    for (const child of children) {
      const role = _sketchRole(child.name, child.type).toUpperCase();
      rows.push(_boxHrLabel('╠', '╣', '═', `══ [${role}] ${child.name.slice(0, 22)} `));
      _sketchSection(child, colorMode).forEach(l => rows.push(_boxLine(l)));
    }
  }

  rows.push(_boxHr('╚', '╝', '═'));
  return rows.join('\n');
}

function buildFrameSketches(schema) {
  const pages = schema?.page?.pages || [];
  if (!pages.length) return '';
  const out = [];
  let count = 0;
  for (const page of pages) {
    for (const frame of page.frames || []) {
      if (count >= 8) break;
      count++;
      out.push(`### ${page.name} / ${frame.name}`);
      out.push('');
      out.push('**Wireframe** _(layout & structure)_');
      out.push('```wireframe');
      out.push(_sketchFrame(frame, false));
      out.push('```');
      out.push('');
      out.push('**Colored** _(fill & color values)_');
      out.push('```colored');
      out.push(_sketchFrame(frame, true));
      out.push('```');
      out.push('');
    }
    if (count >= 8) break;
  }
  return out.join('\n');
}

// ─── Section builders ─────────────────────────────────────────────────────────

export function buildCodebaseSection(state) {
  const cb = state.codebase || {};
  if (!cb.enabled || !(cb.markdown || '').trim()) return '';
  return `\n\n## Codebase Conventions\n${cb.markdown.trim()}`;
}

export function buildFrameworkSection(state) {
  const fw_state = state.framework || {};
  const fwRaw = fw_state.framework || 'other';
  let fw = fwRaw === 'other' ? fw_state.customFramework || 'other' : fwRaw;
  if (fwRaw && fwRaw !== 'other') {
    const m = (fw_state.techStack || []).find(i => i.id === fwRaw || i.id.toLowerCase() === String(fwRaw).replace(/[^a-zA-Z0-9_]/g, '').toLowerCase());
    if (m) fw = m.name;
  }
  const enabledItems = (fw_state.techStack || []).filter(i => i.enabled);
  if (!enabledItems.length && fw === 'other' && !fw_state.customFramework) return '';
  let s = `\n\n## Tech Stack\nFramework: **${fw}**`;
  if (enabledItems.length) {
    const byCategory = {};
    for (const item of enabledItems) {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    }
    for (const cat of STACK_CATEGORIES) {
      const items = byCategory[cat];
      if (!items) continue;
      s += `\n\n### ${cat}`;
      for (const item of items) {
        s += `\n- ${item.name}${item.version ? ` v${item.version}` : ''}${item.description ? ` — ${item.description}` : ''}`;
      }
    }
  }
  return s;
}

export function buildPersonalitySection(state) {
  const AGENTS_STATE = state.agents || {};
  // Respect explicit opt-out: if includeInPrompt is false, omit Agents section
  if (AGENTS_STATE.includeInPrompt === false) return '';

  // Apply same defaults as the HTML when config is empty
  const m = AGENTS_STATE.masterAgent || {
    name: 'Orchestrator',
    preset: 'strategic',
    traits: { proactive: true, empathetic: true, analytical: true, creative: true },
    communicationStyle: { formal: true, casual: true, technical: true, friendly: true },
    mission: 'core-responsibility',
    missionCustom: '',
    feedbackBehavior: 'loop',
    outputFormat: 'summary',
  };

  const _defaultAgent = {
    id: 'agent-default',
    preset: 'innovator',
    customName: 'Innovator',
    taskName: '',
    instructionScope: 'generate-code',
    traits: { proactive: true, empathetic: true, analytical: true, creative: true },
    communicationStyle: { formal: true, casual: true, technical: true, friendly: true },
    mission: 'core-responsibility',
    missionCustom: '',
    primaryGoal: 'full-stack',
    enabled: true,
  };

  const enabledAgents = (AGENTS_STATE.agents?.length ? AGENTS_STATE.agents : [_defaultAgent])
    .filter(a => a.enabled !== false);

  const getMissionText = (agent) => {
    const presets = {
      'core-responsibility': 'Drive architectural decisions and ensure design consistency',
      'quality-excellence':  'Ensure code quality and enforce best practices',
      'performance-focus':   'Optimize performance and scalability',
      'user-first':          'Prioritize user experience and accessibility',
      'innovation':          'Explore new technologies and approaches',
    };
    return agent.mission === 'custom' ? agent.missionCustom : presets[agent.mission] || agent.mission;
  };

  const formatTraits = (obj) =>
    Object.keys(obj || {}).filter(k => obj[k]).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(', ');

  const modeDesc = {
    sequential: 'Sub-agents execute in sequence — each agent\'s instruction output feeds into the next, then results are returned to the Master Agent.',
    parallel:   'Sub-agents execute in parallel (fan-out) — the Master Agent distributes tasks simultaneously and collects all results.',
    specialist: 'Each sub-agent owns a specific domain — the Master Agent routes requests to the relevant specialist agent.',
  };
  const feedbackDesc = {
    loop:     'Loop — Master Agent receives IDE feedback/diff and iterates further with sub-agents until complete.',
    finalize: 'Finalize — Master Agent collects all sub-agent outputs and produces a final summary for the developer.',
  };
  const outputDesc = {
    summary:   'Summary — high-level description of changes made',
    diff:      'Diff / Patch — precise line-by-line code changes',
    changelog: 'Changelog — versioned list of modifications',
  };
  const scopeDesc = {
    'generate-code': 'Generate Code',
    'review-code':   'Review Code',
    'test-code':     'Write Tests',
    'document-code': 'Write Documentation',
    'optimize-code': 'Optimize / Refactor',
    'custom':        'Custom Scope',
  };

  const _agentName = (agent) => {
    if (agent.customName) return agent.customName;
    const p = AGENT_PRESETS.find(a => a.value === agent.preset);
    return p ? p.label.replace(/^\S+\s/, '') : 'Agent';
  };
  const _agentIcon = (agent) => {
    const p = AGENT_PRESETS.find(a => a.value === agent.preset);
    return p ? p.icon : '🤖';
  };

  const teamName = AGENTS_STATE.teamName || 'Dev Pipeline';
  const modeKey = AGENTS_STATE.teamMode || 'sequential';
  const masterName = m ? (m.name || 'Orchestrator') : 'Orchestrator';
  const masterMission = m ? getMissionText(m) : '';
  const masterTraits = m ? formatTraits(m.traits) : '';
  const masterStyles = m ? formatTraits(m.communicationStyle) : '';
  const fbBehavior = m ? feedbackDesc[m.feedbackBehavior] || m.feedbackBehavior : 'Loop';
  const outFormat = m ? outputDesc[m.outputFormat] || m.outputFormat : 'Summary';

  let s = `\n\n## Agent Pipeline — ${teamName}`;
  s += `\n**Execution Mode**: ${modeKey.charAt(0).toUpperCase() + modeKey.slice(1)}`;
  s += `\n${modeDesc[modeKey] || ''}`;

  s += `\n\n### Master Agent (Orchestrator): 🎯 ${masterName}`;
  s += `\n- **Role**: Orchestrate sub-agents, route tasks, review IDE feedback, and produce final output to developer`;
  if (masterTraits) s += `\n- **Traits**: ${masterTraits}`;
  if (masterStyles) s += `\n- **Communication**: ${masterStyles}`;
  if (masterMission) s += `\n- **Mission**: ${masterMission}`;
  s += `\n- **Feedback Behavior**: ${fbBehavior}`;
  s += `\n- **Output Format**: ${outFormat}`;

  s += `\n\n### Pipeline Flow`;
  s += `\n\`\`\``;
  s += `\nDeveloper Input → Prompt Builder → 🎯 ${masterName}`;
  if (modeKey === 'parallel') {
    s += `\n🎯 ${masterName} ⇉ [fan-out to ${enabledAgents.length} sub-agent(s) simultaneously]`;
  } else {
    s += `\n🎯 ${masterName} → [routes tasks to sub-agents]`;
  }
  enabledAgents.forEach((a, i) => {
    const taskLabel = a.taskName || `Task ${String.fromCharCode(65 + i)}`;
    s += `\n  Sub-Agent ${i + 1} (${taskLabel}) → Generate Instruction → IDE AI → Execute`;
  });
  s += `\nIDE AI → Feedback / Diff → 🎯 ${masterName}`;
  s += `\n🎯 ${masterName} → Final Output / Summary to Developer`;
  s += `\n\`\`\``;

  if (enabledAgents.length > 0) {
    s += `\n\n### Sub-Agents`;
    s += `\nEach sub-agent generates targeted instructions for the IDE AI based on its task scope.`;
    enabledAgents.forEach((a, i) => {
      const taskLabel = a.taskName || `Task ${String.fromCharCode(65 + i)}`;
      const traits = formatTraits(a.traits);
      const styles = formatTraits(a.communicationStyle);
      const mission = getMissionText(a);
      const scope = scopeDesc[a.instructionScope] || a.instructionScope || 'Generate Code';
      s += `\n\n#### Sub-Agent ${i + 1}: ${_agentIcon(a)} ${_agentName(a)} — ${taskLabel}`;
      s += `\n- **Instruction Scope**: ${scope}`;
      if (a.primaryGoal) s += `\n- **Domain**: ${a.primaryGoal}`;
      if (traits) s += `\n- **Traits**: ${traits}`;
      if (styles) s += `\n- **Style**: ${styles}`;
      if (mission) s += `\n- **Mission**: ${mission}`;
    });
  }

  return s;
}

export function buildBusinessSection(state) {
  const BUSINESS_STATE = state.business || {};
  if (!BUSINESS_STATE.enabled || !BUSINESS_STATE.selected) return '';
  const b = (BUSINESS_STATE.businesses || []).find(biz => biz.id === BUSINESS_STATE.selected);
  if (!b) return '';

  const t = v => (v || '').trim();
  let s = `\n\n## Business Context`;
  s += `\nApplication: **${b.name || 'Unnamed'}**`;
  if (b.industry) s += `\nIndustry: **${b.industry}**`;

  const hasOverview = t(b.appDescription) || t(b.targetCustomers) || t(b.coreValue) || t(b.businessGoals);
  if (hasOverview) {
    s += `\n\n### 1. Business Overview`;
    if (t(b.appDescription)) s += `\n${t(b.appDescription)}`;
    if (t(b.targetCustomers)) s += `\n\n**Target Customers**: ${t(b.targetCustomers)}`;
    if (t(b.coreValue)) s += `\n\n**Core Value Proposition**: ${t(b.coreValue)}`;
    if (t(b.businessGoals)) s += `\n\n**Business Goals**:\n${t(b.businessGoals)}`;
  }
  if (t(b.domainTerminology)) s += `\n\n### 2. Domain Terminology\n${t(b.domainTerminology)}`;
  if (t(b.workflows))         s += `\n\n### 3. Business Workflows\n${t(b.workflows)}`;
  if (t(b.businessRules))     s += `\n\n### 4. Business Rules\n${t(b.businessRules)}`;
  if (t(b.dataModel))         s += `\n\n### 5. Data Model\n${t(b.dataModel)}`;
  if (t(b.aiResponsibilities)) s += `\n\n### 6. AI Responsibilities\n${t(b.aiResponsibilities)}`;
  if (t(b.aiLimitations))     s += `\n\n### 7. AI Limitations\n${t(b.aiLimitations)}`;
  if (t(b.knowledgeSources))  s += `\n\n### 8. Knowledge Sources (RAG)\n${t(b.knowledgeSources)}`;
  if (t(b.exampleInteractions)) s += `\n\n### 9. Example User Interactions\n${t(b.exampleInteractions)}`;
  if (t(b.architectureImplications)) s += `\n\n### 10. System Architecture Implications\n${t(b.architectureImplications)}`;
  s += `\n\n> Important rules: Be structured and precise. Avoid vague descriptions. Use clear business terminology. Ensure workflows match the data model. Ensure AI capabilities respect business rules.`;
  return s;
}

// ─── Main prompt builder ──────────────────────────────────────────────────────

/**
 * Build the full design prompt.
 * @param {Object} files  Design memory layers (index, token, style, ..., prototype)
 * @param {Object} state  Config from prompt-tools-config.json
 * @returns {string}
 */
export function buildPrompt(files, state) {
  state = state || {};
  const meta = files.index?.meta || {};
  const hasFigma = Boolean(meta.file_key);
  const colorKeys = Object.keys(files.style?.colors || {}).slice(0, 8);
  const textKeys = Object.keys(files.style?.typography || {}).slice(0, 6);
  const pages = files.page?.pages?.map(p => p.name).join(', ') || '—';
  const conns = files.prototype?.connection_count || 0;
  const base = meta.file_key ? `design-memory-${meta.file_key}` : 'design-memory';
  const getFile = l => `${base}-${l}.json`;

  // ── Connector section ──
  const connectorState = state.connectors || { components: {} };
  const enabledComps = Object.values(connectorState.components || {}).filter(c => c.enabled);
  const fw_state = state.framework || {};
  const fw = fw_state.framework === 'other'
    ? fw_state.customFramework || 'other'
    : fw_state.framework || 'other';

  let connectorSection = '';
  if (enabledComps.length > 0) {
    const mappings = enabledComps.map(c => {
      const lines = [`- Figma: "${c.figma_name}"  →  <${c.code_component || c.figma_name}>`];
      if (c.import_path) lines.push(`  import: "${c.import_path}"`);
      if (c.usage && c.usage.trim()) {
        lines.push('  usage:');
        c.usage.trim().split('\n').forEach(l => lines.push('    ' + l));
      }
      return lines.join('\n');
    }).join('\n\n');

    connectorSection = `

## Component Connectors · ${fw}
Target framework: **${fw}**
The following Figma components are mapped to real code components.
When generating UI code, use the exact component and usage pattern shown — do NOT invent alternatives.

\`\`\`
${mappings}
\`\`\`

Connector schema: \`${base}-connector.json\` (includes figma_id, $ref_component, import paths).
Rule 11: For every Figma component listed above, use its mapped code component verbatim.
Rule 12: Match the usage example exactly — props, children, and structure must be consistent with the Preview.`;
  }

  // ── Template section ──
  const tmplState = state.templates || { selected: null, selectedSections: [], templates: {}, caseStudies: {} };
  const selectedTmpl = tmplState.selected ? tmplState.templates[tmplState.selected] : null;
  const selectedSectionTmpls = (tmplState.selectedSections || []).map(k => tmplState.templates[k]).filter(Boolean);
  let templateSection = '';

  function _buildSectionBlock(tmpl) {
    const slotList2 = (tmpl.slots || []).map((s, i) => `  Section ${i + 1}: ${s}`).join('\n');
    const compList2 = (tmpl.components || []).map(c => `  - ${c}`).join('\n');
    const mixinList2 = (tmpl.mixins || []).map(m => `  - ${m}`).join('\n');
    let colSchemaSec2 = '';
    if (tmpl.columnSchema) {
      const cs2 = tmpl.columnSchema;
      colSchemaSec2 = `\n\n### Column schema · ${cs2.name}\n${cs2.description || ''}\n` +
        Object.entries(cs2.properties || {}).map(([k, v]) => {
          const req = v.required ? ' [required]' : '';
          const def = v.default !== undefined ? ` (default: ${v.default})` : '';
          const vals = v.values ? ` · values: ${v.values}` : '';
          return `  - ${k} (${v.type})${req}${def}${vals}: ${v.description || ''}`;
        }).join('\n');
    }
    const replacerSec2 = tmpl.replacePattern
      ? `\n\n### Replace pattern\nEvery \`${tmpl.replacePattern}\` marker must be substituted with the entity name derived from the Figma frame/component names.\n${tmpl.hint || ''}`
      : '';
    return `

## Section Template · ${tmpl.name}
File: \`${tmpl.file}\`
${tmpl.description}

### How to code this section using the design JSON
SECTION template — implement the content of ONE slot only, not the full page.
The template provides the **SECTION STRUCTURE**. The design JSON is the **SOURCE OF TRUTH** for all field content. Follow these steps in order:

1. **Identify which page slot this section belongs to** from the design JSON:
   → Open \`${base}-page.json\` › find the slot frame that contains this section's controls
   → The slot frame name identifies the section (e.g. "Filter", "Table", "Header")

2. **Extract fields and controls for this section** from the design JSON:
   → In \`${base}-page.json\`, enumerate every child node of this section's frame in order
   → Each input / select / multiselect node becomes one filter field or data binding
   → Map node names and text content to the matching prop or model* variable in the template

3. **Apply styles from the design JSON** — never hardcode values:
   → \`${base}-style.json\` › \`colors\` for badges, input borders, labels
   → \`${base}-style.json\` › \`typography\` for font sizes and label weights

4. **Wire each section slot to its Figma frame** using the template's section map below:
${slotList2 || '  (see template file)'}

### Required components
${compList2 || '  (see template file)'}
${mixinList2 ? '\n### Required mixins\n' + mixinList2 : ''}${colSchemaSec2}${replacerSec2}

Rule S1: SECTION template — code ONLY this section's slots; do NOT generate a full page scaffold.
Rule S2: REPLACE the \`${tmpl.replacePattern || '[entity]'}\` placeholder with the entity name derived from Figma frame names.
Rule S3: EXTRACT every field, dropdown, and control for this section FROM \`${base}-page.json\` — never add controls not present in the design.
Rule S4: RESOLVE every color and typography value from \`${base}-style.json\` before applying to the template.`;
  }

  if (selectedTmpl) {
    const slotList = (selectedTmpl.slots || []).map((s, i) => `  Slot ${i + 1}: ${s}`).join('\n');
    const compList = (selectedTmpl.components || []).map(c => `  - ${c}`).join('\n');
    const mixinList = (selectedTmpl.mixins || []).map(m => `  - ${m}`).join('\n');

    let colSchemaSection = '';
    if (selectedTmpl.columnSchema) {
      const cs = selectedTmpl.columnSchema;
      const propLines = Object.entries(cs.properties || {}).map(([k, v]) => {
        const req = v.required ? ' [required]' : '';
        const def = v.default !== undefined ? ` (default: ${v.default})` : '';
        const vals = v.values ? ` · values: ${v.values}` : '';
        return `  - ${k} (${v.type})${req}${def}${vals}: ${v.description || ''}`;
      }).join('\n');
      colSchemaSection = `\n\n### Column schema · ${cs.name}\n${cs.description || ''}\n${propLines}`;
    }

    const replacerSection = selectedTmpl.replacePattern
      ? `\n\n### Replace pattern\nEvery \`${selectedTmpl.replacePattern}\` marker must be substituted with the feature name derived from the Figma frame/component names.\n${selectedTmpl.hint || ''}`
      : '';

    templateSection = `

## Code Template · ${selectedTmpl.name} [page]
File: \`${selectedTmpl.file}\`
${selectedTmpl.description}

### How to build this feature using the design JSON
PAGE template — follow the full layout structure and fill every slot placement.
The template provides the **CODE STRUCTURE**. The design JSON is the **SOURCE OF TRUTH** for all feature content. Follow these steps in order:

1. **Identify the feature name** from the design JSON:
   → Open \`${base}-page.json\` › \`pages[].name\` / \`frames[].name\`
   → The primary frame name IS the feature (e.g. "Work Order" → \`WorkOrder\` / \`work-order\` / \`WORK_ORDER\`)

2. **Extract table columns / data fields** from the design JSON:
   → In \`${base}-page.json\`, find the table frame inside the main screen frame
   → Each header text node becomes a column — map text to \`displayName\`, derive \`name\` in camelCase
   → Follow the ColumnDef schema below for every column object

3. **Apply styles from the design JSON** — never hardcode values:
   → \`${base}-style.json\` › \`colors\` for status badges, buttons, highlights
   → \`${base}-style.json\` › \`typography\` for font sizes and weights

4. **Map filter / form fields** from the design JSON:
   → Locate filter frames in \`${base}-page.json\` — each input/select maps to a filter prop
   → Use \`${base}-component.json\` to identify which component to use per input type

5. **Fill the slot structure below** — each slot maps directly to a Figma frame section:
${slotList || '  (see template file)'}

### Required components
${compList || '  (see template file)'}
${mixinList ? '\n### Required mixins\n' + mixinList : ''}${colSchemaSection}${replacerSection}

\`\`\`
${base}-code-template.json  →  template layer · slot map · agent_rules
\`\`\`

Rule 13: FOLLOW the code template slot structure — each slot must map to its Figma counterpart frame.
Rule 14: REPLACE the \`${selectedTmpl.replacePattern || '@@REPLACE@@'}\` pattern with the feature name derived from Figma frame names.
Rule 15: EXTRACT all columns, fields, and filter options FROM \`${base}-page.json\` — never invent or hardcode them.
Rule 16: RESOLVE every color and typography value from \`${base}-style.json\` before applying to the template.`;
  }

  for (const secTmpl of selectedSectionTmpls) {
    templateSection += _buildSectionBlock(secTmpl);
  }

  // ── Frame sketches ──
  const sketchSection = buildFrameSketches(files);

  const rule11 = enabledComps.length > 0
    ? '\n11. USE the Component Connectors mapping — each listed component MUST be used as specified, consistent with the Preview\n12. GENERATE component code that matches the visual layout shown in the Wireframe/Preview pane'
    : '';
  const _anyTmpl = selectedTmpl || selectedSectionTmpls.length > 0;
  const rule1314 = _anyTmpl
    ? selectedTmpl
      ? '\n13. FOLLOW code template slot structure — map each slot to its Figma counterpart frame\n14. REPLACE the code template pattern marker with the feature name derived from Figma frame names\n15. EXTRACT all columns, fields, and filter options from the page layer — never invent or hardcode them\n16. RESOLVE every color and typography value from the style layer before applying to the template'
      : '\n13. SECTION template — code ONLY the section\'s slots; do NOT scaffold the full page\n14. REPLACE the code template placeholder with the entity name derived from Figma frame names\n15. EXTRACT every field, dropdown, and control for this section from the page layer — never add controls not in the design\n16. RESOLVE every color and typography value from the style layer before applying to the template'
    : '';

  const codeTemplateFileRow = [
    selectedTmpl ? `| CT | Code Template | ${selectedTmpl.file} | ${selectedTmpl.name} scaffold · @@REPLACE@@ markers |` : '',
    ...selectedSectionTmpls.map(t => `| CS | Section Template | ${t.file} | ${t.name} section · ${t.replacePattern || '[entity]'} markers |`),
  ].filter(Boolean).join('\n');

  const codeTemplateDepGraph = [
    selectedTmpl ? `\n                     └─ code_template  (${selectedTmpl.name} · ${selectedTmpl.replacePattern || 'scaffold'} → ${selectedTmpl.file})` : '',
    ...selectedSectionTmpls.map(t => `\n                     └─ section_template  (${t.name} · ${t.replacePattern || '[entity]'} → ${t.file})`),
  ].join('');

  const hierarchyLine = _anyTmpl
    ? 'Token → Style → Component → Pattern → Template → Page → Flow → Prototype → CodeTemplate'
    : 'Token → Style → Component → Pattern → Template → Page → Flow → Prototype';

  // ── Page-type detection ──
  const allFrameNames = (files.page?.pages || []).flatMap(p => (p.frames || []).map(f => f.name || ''));
  const PAGE_TYPE_PATTERNS = { listing: /list|listing|request|index/i, detail: /detail|edit/i, setting: /setting|config/i };
  const TEMPLATE_SUGGESTIONS = { listing: 'jlListingPage/[entity].template.js', detail: 'jlDetailPage.template.js', setting: 'jlSettingPage.template.js' };
  const detectedPageType = Object.entries(PAGE_TYPE_PATTERNS).find(([, rx]) => allFrameNames.some(n => rx.test(n)))?.[0] || null;

  let pageTypeAdvisory = '';
  if (selectedTmpl || selectedSectionTmpls.length > 0) {
    const parts = [
      selectedTmpl ? `**${selectedTmpl.name}** (page)` : null,
      selectedSectionTmpls.length > 0 ? `${selectedSectionTmpls.map(t => `**${t.name}**`).join(', ')} (${selectedSectionTmpls.length === 1 ? 'section' : 'sections'})` : null,
    ].filter(Boolean);
    pageTypeAdvisory = `> ✓ Templates loaded: ${parts.join(' + ')} — scaffolds are included in this prompt.\n\n`;
  } else if (detectedPageType) {
    pageTypeAdvisory = `> ⚠ No code template selected. Detected page type: **${detectedPageType}** — open the Templates tab and select \`${TEMPLATE_SUGGESTIONS[detectedPageType]}\` before copying this prompt, or the JS file scaffold will be absent.\n\n`;
  }

  // ── Section helpers ──
  const codebaseSection     = buildCodebaseSection(state);
  const frameworkSection    = buildFrameworkSection(state);
  const personalitySection  = buildPersonalitySection(state);
  const businessSection     = buildBusinessSection(state);

  // ── Case study blocks ──
  const injectedCsKeys = new Set();
  function _buildCaseStudyBlocks(tmplKey) {
    const matched = Object.values(tmplState.caseStudies || {}).filter(cs => cs.selected && cs.templateKeys.includes(tmplKey));
    matched.forEach(cs => injectedCsKeys.add(cs.key));
    return matched.map(cs =>
      `\n\n## Reference Case Study · ${cs.name}\n> Use the implementation patterns shown in this case study as a guide.\n> Do NOT copy its entity-specific names, field values, or data — derive everything from the design JSON layers above.\n\n${cs.content.trim()}`
    ).join('');
  }

  // ── JS scaffold section ──
  let scaffoldSection = '';
  const hasTemplateSelection = Boolean(selectedTmpl || selectedSectionTmpls.length > 0);
  if (selectedTmpl && selectedTmpl.content) {
    scaffoldSection += `

## JS File Scaffold · ${selectedTmpl.name}
Use this as the EXACT structure for the generated JS file — do NOT rewrite from scratch.
Replace all placeholder markers with the feature name derived from the Figma frame name:
- \`[entity]\` / \`@@REPLACE@@\` → kebab-case (e.g. \`quote-request\`)
- \`[Entity]\` → PascalCase (e.g. \`QuoteRequest\`)
- \`[ENTITY]\` → SCREAMING_SNAKE_CASE (e.g. \`QUOTE_REQUEST\`)

Fill all column definitions, filter fields, tab names, and status badge classes from the design JSON layers. Mark any placeholder mock data with \`// TODO: remove before production\`.

\`\`\`js
${selectedTmpl.content}
\`\`\`${_buildCaseStudyBlocks(selectedTmpl.key)}`;
  } else if (selectedTmpl) {
    scaffoldSection += _buildCaseStudyBlocks(selectedTmpl.key);
  }
  for (const secTmpl of selectedSectionTmpls) {
    if (secTmpl.content) {
      scaffoldSection += `

## Section Scaffold · ${secTmpl.name}
Use this as the EXACT structure for the section code — do NOT rewrite from scratch.
Replace all placeholder markers with the entity name derived from Figma frame names:
- \`${secTmpl.replacePattern || '[entity]'}\` → kebab-case (e.g. \`quote-request\`)

Fill all filter fields and controls from the design JSON layers.

\`\`\`js
${secTmpl.content}
\`\`\`${_buildCaseStudyBlocks(secTmpl.key)}`;
    } else {
      scaffoldSection += _buildCaseStudyBlocks(secTmpl.key);
    }
  }
  if (hasTemplateSelection) {
    const remainingCs = Object.values(tmplState.caseStudies || {}).filter(cs => cs.selected && !injectedCsKeys.has(cs.key));
    if (remainingCs.length > 0) {
      scaffoldSection += remainingCs.map(cs =>
        `\n\n## Reference Case Study · ${cs.name}\n> Use the implementation patterns shown in this case study as a guide.\n> Do NOT copy its entity-specific names, field values, or data — derive everything from the design JSON layers above.\n\n${cs.content.trim()}`
      ).join('');
    }
  }

  const usageSection = hasFigma
    ? `\n## Usage\n\`\`\`js\nconst idx  = await fetch('${getFile('index')}').then(r=>r.json());\n// Resolve a layer by name:\nconst get  = name => fetch(idx.layers.find(l=>l.name===name).file).then(r=>r.json());\n\nconst style = await get('style');\nconst page  = await get('page');\nconst primary    = style.colors['Color/Primary']?.value;\nconst loginFrame = page.pages[0].frames.find(f=>f.name==='Login');\n\`\`\`\n`
    : '';

  const JSON_LAYERS = [
    { name: 'token',     label: 'Layer 1 · Token',     data: files.token },
    { name: 'style',     label: 'Layer 2 · Style',     data: files.style },
    { name: 'component', label: 'Layer 3 · Component', data: files.component },
    { name: 'pattern',   label: 'Layer 4 · Pattern',   data: files.pattern },
    { name: 'template',  label: 'Layer 5 · Template',  data: files.template },
    { name: 'page',      label: 'Layer 6 · Page',      data: files.page },
    { name: 'flow',      label: 'Layer 7 · Flow',      data: files.flow },
    { name: 'prototype', label: 'Layer 8 · Prototype', data: files.prototype },
  ];
  const jsonDataSection = hasFigma
    ? '\n\n## Inline Design JSON\nAll 8 design memory layers are embedded below. Use these directly — no external file fetching needed.\n\n' +
      JSON_LAYERS.filter(l => l.data).map(l => `### ${l.label} · \`${getFile(l.name)}\`\n\`\`\`json\n${JSON.stringify(l.data, null, 2)}\n\`\`\``).join('\n\n')
    : '';

  return `${!meta.file_key ? '> ℹ No Figma design loaded. This prompt includes connectors, templates and codebase conventions only. Extract a Figma design to add design tokens and page layers.\n\n' : ''}${pageTypeAdvisory}# Design Memory${meta.file_name ? ` · ${meta.file_name}` : ''}
${meta.extracted_at ? `Extracted from Figma on ${new Date(meta.extracted_at).toLocaleDateString()}\n` : ''}
## Role
You are a UI engineer implementing a Figma design.
Your ONLY source of truth is the design memory JSON extracted in this session.
Do NOT infer, assume, or invent any design decision not present in these files.
The design memory is structured as 8 ordered layers — load only the layers your task requires.

## Layer hierarchy
\`\`\`
${hierarchyLine}
\`\`\`
Each layer file depends only on the layers to its left via $ref_* keys.

## Files
| # | Layer | File | Contents |
|---|-------|------|----------|
| 1 | Token | ${getFile('token')} | Primitive colors · spacing scale · radii · type scale |
| 2 | Style | ${getFile('style')} | Named Figma color · text · effect styles |
| 3 | Component | ${getFile('component')} | Atomic reusable Figma components |
| 4 | Pattern | ${getFile('pattern')} | Component sets & variant groups |
| 5 | Template | ${getFile('template')} | Auto-layout frame structures & slot definitions |
| 6 | Page | ${getFile('page')} | Full screen layout hierarchy |
| 7 | Flow | ${getFile('flow')} | User journey paths & navigation sequences |
| 8 | Prototype | ${getFile('prototype')} | Interactions, triggers & transition animations |${codeTemplateFileRow ? '\n' + codeTemplateFileRow : ''}

## Dependency graph
\`\`\`
token
└─ style          ($ref_token)
   └─ component   ($ref_style)
      └─ pattern  ($ref_component)
         └─ template  ($ref_pattern, $ref_style)
            └─ page  ($ref_template)
               └─ flow  ($ref_page)
                  └─ prototype  ($ref_flow)
                     └─ connector  ($ref_component, $ref_style, $ref_page)${codeTemplateDepGraph}
\`\`\`
connector.json cross-references component, style, and page layers to map Figma components → code components with usage examples.${selectedTmpl ? '\ncode-template.json references the selected scaffold file and its slot map.' : ''}

## Rules
1. ONLY use design data present in the session JSON files — never infer or invent values
2. MAP style.colors values to variables/tokens in your target framework
3. USE style.typography for all font sizes, weights, and line heights
4. FOLLOW page.pages[].frames[].children for screen layout hierarchy
5. IMPLEMENT prototype.connections for routing — each is a navigation event
6. NEVER invent hex values — resolve from style.colors or token.colors
7. RESOLVE $ref_* keys to load the referenced layer file as needed
8. COMPONENT names in component.json map to reusable UI components in your target framework
9. PATTERN sets in pattern.json are Figma variant groups (e.g. Button/Primary)
10. APPLY the same rules regardless of UI framework (React, Vue, Svelte, Angular, plain HTML, etc.)${rule11}${rule1314}

## Summary
- Pages: ${pages}
- Style colors: ${meta.color_style_count || 0} (${colorKeys.join(', ')}${colorKeys.length < (meta.color_style_count || 0) ? '…' : ''})
- Text styles: ${meta.typography_count || 0} (${textKeys.join(', ')}${textKeys.length < (meta.typography_count || 0) ? '…' : ''})
- Components: ${meta.component_count || 0} atoms · ${meta.pattern_count || 0} patterns · ${meta.template_count || 0} templates
- Prototype: ${conns} connections across ${meta.flow_count || 0} flows
- Connectors: ${enabledComps.length} mapped to ${fw}
- Code template: ${selectedTmpl ? `${selectedTmpl.name} (${selectedTmpl.file})` : 'none selected'}${selectedSectionTmpls.length > 0 ? ' + ' + selectedSectionTmpls.length + ' section(s): ' + selectedSectionTmpls.map(t => t.name).join(', ') : ''}
${personalitySection}${businessSection}${codebaseSection}${frameworkSection}
${connectorSection}${templateSection}${scaffoldSection}${sketchSection ? '\n\n## Screen Layout Sketches\nASCII box-art previews of every design frame. **Wireframe** shows layout structure and node roles. **Colored** adds fill and color annotations. Read these before the raw JSON to quickly understand the design intent.\n\n' + sketchSection : ''}

## Framework
Apply the design memory to whichever UI framework the project uses (React, Vue, Svelte, Angular, plain HTML/CSS, etc.).
Adapt component names, styling conventions, and routing to the target framework while strictly following the values defined in the session JSON layers.

${usageSection}${jsonDataSection}`;
}
