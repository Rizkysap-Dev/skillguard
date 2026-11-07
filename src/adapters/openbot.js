import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LIMITS } from '../schema.js';

export class AdapterError extends Error {}

/**
 * Extracts YAML frontmatter key-value pairs without dynamic code execution.
 * Expects frontmatter delimited by standard --- delimiters.
 */
export function parseFrontmatter(markdownText) {
  const match = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new AdapterError('missing or invalid YAML frontmatter in SKILL.md');
  }

  const yamlContent = match[1];
  const meta = {};
  const lines = yamlContent.split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const kvMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      let val = kvMatch[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[currentKey] = val;
    } else if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
      meta[currentKey] = (meta[currentKey] ? meta[currentKey] + ' ' : '') + trimmed;
    }
  }

  if (!meta.name) {
    throw new AdapterError('SKILL.md frontmatter must contain a name');
  }

  return {
    name: meta.name.trim(),
    description: meta.description ? meta.description.trim() : '',
  };
}

/**
 * Scans markdown text for tool invocations matching OpenBot tool conventions:
 * e.g. openbot.list_tables, openbot_browser.list_tabs, github.create_issue
 */
export function extractToolReferences(markdownText) {
  const toolSet = new Set();
  // Match backticked tool identifiers: `namespace.tool_name`
  const codeSpanMatches = markdownText.matchAll(/`([A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_.-]+)+)`/g);
  for (const match of codeSpanMatches) {
    const candidate = match[1];
    if (isValidToolCandidate(candidate)) {
      toolSet.add(candidate);
    }
  }

  // Match common openbot.* references in plain text
  const openbotMatches = markdownText.matchAll(/\b(openbot[A-Za-z0-9_]*\.[A-Za-z0-9_.-]+)\b/g);
  for (const match of openbotMatches) {
    const candidate = match[1];
    if (isValidToolCandidate(candidate)) {
      toolSet.add(candidate);
    }
  }

  return Array.from(toolSet);
}

function isValidToolCandidate(name) {
  if (name.length > 120) return false;
  // Must start with alphanumeric, followed by allowed chars
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(name)) return false;
  // Filter out file extensions / domain names like "index.js", "SKILL.md", "github.com", "openbot.site"
  if (/\.(md|json|js|ts|py|sh|html|css|txt|png|svg|com|org|net|site|io)$/i.test(name)) return false;
  return true;
}

/**
 * Generates a valid SkillGuard v1 declarative fixture object from SKILL.md content.
 */
export function generateSkillFixture({ content, filePath = 'SKILL.md' }) {
  if (typeof content !== 'string') {
    throw new AdapterError('skill content must be a string');
  }
  if (Buffer.byteLength(content, 'utf8') > LIMITS.maxFileBytes) {
    throw new AdapterError(`skill file exceeds maximum size limit of ${LIMITS.maxFileBytes} bytes`);
  }

  const { name, description } = parseFrontmatter(content);
  const detectedTools = extractToolReferences(content);

  const tools = {};
  const sampleCalls = [];

  for (const tool of detectedTools) {
    tools[tool] = { result: {} };
    sampleCalls.push({
      tool,
      arguments: {},
    });
  }

  const sanitizedName = name.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  const fixtureName = `${sanitizedName}-flow`;

  const cases = [
    {
      name: `${sanitizedName} standard flow`,
      description: `Verifies expected tool call sequence for ${name}`,
      calls: sampleCalls,
      expect: {
        mode: 'exact',
        calls: sampleCalls.map((call) => ({
          tool: call.tool,
          arguments: {},
        })),
      },
    },
  ];

  return {
    version: 1,
    name: fixtureName,
    description: description || `Automated SkillGuard test fixture for ${name}`,
    target: {
      kind: 'skill',
      name,
      path: filePath,
    },
    tools,
    cases,
  };
}

/**
 * Ingests a local SKILL.md file and writes a starter *.skillguard.json fixture.
 */
export function initSkillFixture({ skillPath, outputPath = null, cwd = process.cwd() }) {
  const absoluteSkillPath = path.resolve(cwd, skillPath);
  let stat;
  try {
    stat = statSync(absoluteSkillPath);
  } catch {
    throw new AdapterError(`skill file not found: ${skillPath}`);
  }

  if (!stat.isFile()) {
    throw new AdapterError(`target is not a file: ${skillPath}`);
  }

  if (stat.size > LIMITS.maxFileBytes) {
    throw new AdapterError(`skill file exceeds maximum limit of ${LIMITS.maxFileBytes} bytes`);
  }

  const content = readFileSync(absoluteSkillPath, 'utf8');
  const relativePath = path.relative(cwd, absoluteSkillPath).split(path.sep).join('/');
  const fixture = generateSkillFixture({ content, filePath: relativePath });

  const resolvedOutPath = outputPath
    ? path.resolve(cwd, outputPath)
    : path.resolve(path.dirname(absoluteSkillPath), `${fixture.target.name}.skillguard.json`);

  const jsonText = JSON.stringify(fixture, null, 2) + '\n';
  writeFileSync(resolvedOutPath, jsonText, 'utf8');

  return {
    outputPath: resolvedOutPath,
    fixture,
  };
}
