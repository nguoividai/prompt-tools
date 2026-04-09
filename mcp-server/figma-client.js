/**
 * figma-client.js
 * Reads pre-extracted design memory files from a ZIP or folder.
 * The design ZIP is produced by the "Download All (ZIP)" button in
 * figma-design-memory.html — no live Figma extraction is done here.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';

const LAYER_KEYS = ['index', 'token', 'style', 'component', 'pattern', 'template', 'page', 'flow', 'prototype'];

/**
 * Load design files from a ZIP archive produced by the HTML tool.
 * @param {string} zipPath  Absolute path to the .zip file
 * @returns {Promise<Object>} files object keyed by layer name
 */
export async function readDesignZip(zipPath) {
  const data = readFileSync(zipPath);
  const zip = await JSZip.loadAsync(data);
  const files = {};

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.endsWith('.json')) continue;
    const basename = name.split('/').pop().replace('.json', '');
    const content = await entry.async('string');
    let json;
    try { json = JSON.parse(content); } catch { continue; }

    // Match by layer key suffix: design-memory-{fileKey}-{layerKey}.json
    for (const key of LAYER_KEYS) {
      if (basename.endsWith(`-${key}`) || basename === key) {
        files[key] = json;
        break;
      }
    }
    // connector / code-template pass-through
    if (basename.endsWith('-connector') || basename === 'connector') files._connector = json;
    if (basename.endsWith('-code-template') || basename === 'code-template') files._codeTemplate = json;
  }

  return files;
}

/**
 * Load design files from a flat folder of JSON files.
 * @param {string} folderPath  Absolute path to the folder
 * @returns {Object} files object keyed by layer name
 */
export function readDesignFolder(folderPath) {
  const files = {};
  for (const entry of readdirSync(folderPath)) {
    if (!entry.endsWith('.json')) continue;
    const fullPath = join(folderPath, entry);
    if (!statSync(fullPath).isFile()) continue;
    let json;
    try { json = JSON.parse(readFileSync(fullPath, 'utf8')); } catch { continue; }
    const base = entry.replace('.json', '');
    for (const key of LAYER_KEYS) {
      if (base.endsWith(`-${key}`) || base === key) {
        files[key] = json;
        break;
      }
    }
    if (base.endsWith('-connector') || base === 'connector') files._connector = json;
    if (base.endsWith('-code-template') || base === 'code-template') files._codeTemplate = json;
  }
  return files;
}
