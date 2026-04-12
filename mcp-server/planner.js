/**
 * planner.js — Planner module for prompt-tools MCP server
 *
 * Implements the Planner role from the agentic sequence diagram:
 *
 *   User ──(Prompt + Design)──▶ Planner ──(Task Plan)──▶ Executor
 *                                                              │
 *                                              ┌──────[Execution Loop]──────┐
 *                                              │  Executor ──▶ Tools        │
 *                                              │  Tools ──▶ Executor        │
 *                                              │  Executor ──▶ Validator    │
 *                                              │  Validator ──▶ Critic      │
 *                                              │  [Not Pass] Critic ──▶ Executor (feedback) │
 *                                              │  [Pass] ──▶ Done ──▶ User  │
 *                                              └────────────────────────────┘
 *
 * The Planner reads the current agent prompt file (current.md), filters
 * sections relevant to the user's goal + design context, and returns a
 * structured Task Plan document that tells the Executor:
 *   1. What the goal is
 *   2. What design/image context applies
 *   3. Which sections of the prompt are relevant
 *   4. Numbered execution steps
 *   5. Validation criteria
 *   6. Done condition
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function expandPath(p) {
  if (!p) return p;
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

const DEFAULT_PROMPT_PATH = process.env.PROMPT_TOOLS_PROMPT_PATH
  ? expandPath(process.env.PROMPT_TOOLS_PROMPT_PATH)
  : resolve(__dirname, ".agent-prompt", "current.md");

// ── Text helpers ──────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "as",
  "be",
  "was",
  "are",
  "were",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "not",
  "that",
  "this",
  "these",
  "those",
  "can",
  "will",
  "would",
  "should",
  "could",
  "may",
  "might",
  "shall",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "what",
  "how",
  "when",
  "where",
  "why",
  "which",
  "who",
  "please",
  "help",
  "need",
  "want",
  "get",
]);

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9\u00C0-\u024F\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

// ── Section parser ────────────────────────────────────────────────────────────

function parseSections(text) {
  return text
    .split(/(?=^#{1,4}\s+)/m)
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0)
    .map((raw, idx) => {
      const nl = raw.indexOf("\n");
      const heading = (nl === -1 ? raw : raw.slice(0, nl)).trim();
      const body = nl === -1 ? "" : raw.slice(nl + 1).trim();
      const isHeading = /^#{1,4}\s+/.test(heading);
      const headingText = isHeading
        ? heading.replace(/^#+\s*/, "").toLowerCase()
        : "";
      return { idx, raw, heading, body, isHeading, headingText, score: 0 };
    });
}

function scoreSections(sections, keywords) {
  for (const sec of sections) {
    if (!sec.isHeading) {
      sec.score = 0.5;
      continue;
    }
    const searchable = `${sec.headingText} ${sec.body}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (sec.headingText.includes(kw)) score += 3;
      score += Math.min(searchable.split(kw).length - 1, 5);
    }
    sec.score = keywords.length > 0 ? score / keywords.length : 0;
  }
}

function selectRelevantSections(sections, maxSections) {
  const headings = sections.filter((s) => s.isHeading);
  const preambles = sections.filter((s) => !s.isHeading);

  if (headings.length === 0) return sections.slice(0, maxSections);

  const maxScore = headings.reduce((m, s) => Math.max(m, s.score), 0);

  if (maxScore === 0) {
    return [...preambles, ...headings.slice(0, maxSections)].sort(
      (a, b) => a.idx - b.idx,
    );
  }

  const threshold = maxScore * 0.2;
  const relevant = headings
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSections);

  return [...preambles, ...relevant].sort((a, b) => a.idx - b.idx);
}

// ── Plan assembler ────────────────────────────────────────────────────────────

function assemblePlan({ goal, designContext, relevantSections, generatedAt }) {
  const lines = ["# Task Plan", "", "## Goal", "", goal, ""];

  if (designContext?.trim()) {
    lines.push("## Design Context", "", designContext.trim(), "");
  }

  if (relevantSections.length > 0) {
    lines.push("## Relevant Context", "");
    for (const sec of relevantSections) {
      lines.push(sec.raw, "");
    }
  }

  lines.push(
    "## Execution Steps",
    "",
    "> **Role: Executor** — Work through each step in order.",
    "> After completing each step, validate against the criteria below.",
    "> If validation does not pass, apply the feedback and return to Step 3.",
    "",
    "- [ ] **Step 1 — Understand:** Analyse the goal, design context, and relevant constraints above",
    "- [ ] **Step 2 — Plan details:** Identify exactly what needs to be built, changed, or configured",
    "- [ ] **Step 3 — Execute:** Generate code, modify files, or call the appropriate tools",
    "- [ ] **Step 4 — Validate:** Check the result against each validation criterion below",
    "- [ ] **Step 5 — Iterate:** If validation fails, apply feedback from the Critic and return to Step 3",
    "",
    "## Validation Criteria",
    "",
    "- Output directly and completely addresses the stated goal",
  );

  if (designContext?.trim()) {
    lines.push("- Visual output / UI matches the provided design context");
  }

  lines.push(
    "- All constraints and conventions from the context above are respected",
    "- Code is clean, idiomatic, and free of security issues",
    "",
    "## Done Condition",
    "",
    "All execution steps are checked off **and** every validation criterion passes.",
    "When done, report **Done** to the user with a summary of what was changed.",
    "",
    "---",
    `> *Plan generated at ${generatedAt}*`,
  );

  return lines.join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a structured Task Plan that guides an Executor agent.
 *
 * Implements the Planner role in the agentic sequence:
 *   User ──(Prompt + Design)──▶ plan_task ──(Task Plan)──▶ Executor
 *
 * @param {object} args
 * @param {string} [args.goal]           — User's primary objective
 * @param {string} [args.original_goal]  — Alias for goal
 * @param {string} [args.task]           — Alias for goal
 * @param {string} [args.query]          — Alias for goal
 * @param {string} [args.user_request]   — Alias for goal
 * @param {string} [args.design_context] — Description of design / image context (from Figma, screenshot, etc.)
 * @param {string} [args.prompt_path]    — Override path to current.md
 * @param {number} [args.max_sections]   — Max relevant context sections to include (default: 5)
 * @returns {{ content: Array, metadata: object, isError?: boolean }}
 */
export function buildTaskPlan(args) {
  const goal = (
    args?.original_goal ||
    args?.goal ||
    args?.task ||
    args?.query ||
    args?.user_request ||
    ""
  ).trim();

  if (!goal) {
    return {
      content: [
        {
          type: "text",
          text: "Error: No goal provided. Pass goal, task, query, or user_request.",
        },
      ],
      isError: true,
    };
  }

  const promptPath = args?.prompt_path
    ? expandPath(args.prompt_path)
    : DEFAULT_PROMPT_PATH;

  if (!existsSync(promptPath)) {
    return {
      content: [
        { type: "text", text: `Error: Prompt file not found at ${promptPath}` },
      ],
      isError: true,
    };
  }

  const fullText = readFileSync(promptPath, "utf8");
  const sections = parseSections(fullText);

  const searchText = `${goal} ${args?.design_context || ""}`;
  const keywords = extractKeywords(searchText);

  scoreSections(sections, keywords);

  const maxSections =
    typeof args?.max_sections === "number" && args.max_sections > 0
      ? args.max_sections
      : 5;
  const relevantSections = selectRelevantSections(sections, maxSections);

  const plan = assemblePlan({
    goal,
    designContext: args?.design_context,
    relevantSections,
    generatedAt: new Date().toISOString(),
  });

  return {
    content: [{ type: "text", text: plan }],
    metadata: {
      promptPath,
      goal,
      relevantSections: relevantSections.length,
      totalSections: sections.length,
      keywords,
    },
  };
}
