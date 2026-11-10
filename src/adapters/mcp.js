import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject, cloneJson } from '../json.js';
import { LIMITS } from '../schema.js';

const TOOL_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ALLOWED_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

export class McpAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'McpAdapterError';
    this.code = 'MCP_ADAPTER_ERROR';
  }
}

/**
 * Checks a JSON value tree for prototype-polluting keys, excessive depth, and size limits.
 */
function assertSafeObjectTree(value, path = 'manifest', depth = 0) {
  if (depth > LIMITS.maxDepth) {
    throw new McpAdapterError(`${path} exceeds maximum depth of ${LIMITS.maxDepth}`);
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > LIMITS.maxArray) {
      throw new McpAdapterError(`${path} exceeds maximum array length of ${LIMITS.maxArray}`);
    }
    for (let i = 0; i < value.length; i += 1) {
      assertSafeObjectTree(value[i], `${path}[${i}]`, depth + 1);
    }
    return;
  }
  if (!isPlainObject(value)) {
    throw new McpAdapterError(`${path} must be a plain JSON object`);
  }
  const ownKeys = Object.getOwnPropertyNames(value);
  if (ownKeys.length > LIMITS.maxObjectKeys) {
    throw new McpAdapterError(`${path} exceeds maximum object keys of ${LIMITS.maxObjectKeys}`);
  }
  for (const key of ownKeys) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new McpAdapterError(`forbidden prototype-polluting key "${key}" at ${path}`);
    }
    assertSafeObjectTree(value[key], `${path}.${key}`, depth + 1);
  }
}

/**
 * Safely parses raw JSON text while detecting explicit "__proto__", "prototype", or "constructor" keys.
 */
function parseSafeJsonString(jsonText) {
  if (Buffer.byteLength(jsonText, 'utf8') > LIMITS.maxFileBytes) {
    throw new McpAdapterError(`manifest exceeds maximum size limit of ${LIMITS.maxFileBytes} bytes`);
  }
  // Detect raw "__proto__", "prototype", or "constructor" property keys in JSON text before V8 strips __proto__
  if (/"(?:__proto__|prototype|constructor)"\s*:/.test(jsonText)) {
    throw new McpAdapterError('forbidden prototype-polluting key detected in JSON manifest');
  }
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    throw new McpAdapterError(`invalid JSON in MCP manifest: ${err && err.message ? err.message : 'parse error'}`);
  }
}

/**
 * Validates and normalizes an individual MCP tool definition.
 */
function normalizeMcpToolDef(rawTool, index = 0) {
  const pathPrefix = `tools[${index}]`;
  if (!isPlainObject(rawTool)) {
    throw new McpAdapterError(`${pathPrefix} must be an object`);
  }
  assertSafeObjectTree(rawTool, pathPrefix, 0);

  if (typeof rawTool.name !== 'string' || !rawTool.name.trim()) {
    throw new McpAdapterError(`${pathPrefix}.name must be a non-empty string`);
  }
  const name = rawTool.name.trim();
  if (!TOOL_NAME_REGEX.test(name)) {
    throw new McpAdapterError(
      `${pathPrefix}.name "${name}" must match [A-Za-z0-9][A-Za-z0-9_.:-]{0,119}`,
    );
  }

  let description = '';
  if (rawTool.description !== undefined) {
    if (typeof rawTool.description !== 'string') {
      throw new McpAdapterError(`${pathPrefix}.description must be a string`);
    }
    description = rawTool.description.trim();
  }

  const rawSchema = rawTool.inputSchema !== undefined ? rawTool.inputSchema : { type: 'object', properties: {} };
  if (!isPlainObject(rawSchema)) {
    throw new McpAdapterError(`${pathPrefix}.inputSchema must be a plain object`);
  }

  const schemaType = rawSchema.type !== undefined ? rawSchema.type : 'object';
  if (schemaType !== 'object') {
    throw new McpAdapterError(`${pathPrefix}.inputSchema.type must be "object"`);
  }

  const properties = rawSchema.properties !== undefined ? rawSchema.properties : {};
  if (!isPlainObject(properties)) {
    throw new McpAdapterError(`${pathPrefix}.inputSchema.properties must be a plain object`);
  }

  for (const [propName, propSchema] of Object.entries(properties)) {
    if (DANGEROUS_KEYS.has(propName)) {
      throw new McpAdapterError(`forbidden property key "${propName}" in ${pathPrefix}.inputSchema.properties`);
    }
    validatePropertySchema(propSchema, `${pathPrefix}.inputSchema.properties.${propName}`, 1);
  }

  let required = [];
  if (rawSchema.required !== undefined) {
    if (!Array.isArray(rawSchema.required) || !rawSchema.required.every((item) => typeof item === 'string')) {
      throw new McpAdapterError(`${pathPrefix}.inputSchema.required must be an array of strings`);
    }
    required = [...rawSchema.required];
  }

  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: cloneJson(properties),
      required,
    },
  };
}

function validatePropertySchema(propSchema, path, depth) {
  if (depth > LIMITS.maxDepth) {
    throw new McpAdapterError(`${path} exceeds maximum schema depth of ${LIMITS.maxDepth}`);
  }
  if (!isPlainObject(propSchema)) {
    throw new McpAdapterError(`${path} must be a schema object`);
  }
  if (propSchema.type !== undefined) {
    const typeVal = Array.isArray(propSchema.type) ? propSchema.type[0] : propSchema.type;
    if (typeof typeVal !== 'string' || !ALLOWED_SCHEMA_TYPES.has(typeVal)) {
      throw new McpAdapterError(`${path}.type must be a valid JSON Schema type`);
    }
  }
  if (propSchema.enum !== undefined) {
    if (!Array.isArray(propSchema.enum) || propSchema.enum.length === 0) {
      throw new McpAdapterError(`${path}.enum must be a non-empty array`);
    }
  }
  if (propSchema.properties !== undefined) {
    if (!isPlainObject(propSchema.properties)) {
      throw new McpAdapterError(`${path}.properties must be a plain object`);
    }
    for (const [nestedKey, nestedSchema] of Object.entries(propSchema.properties)) {
      if (DANGEROUS_KEYS.has(nestedKey)) {
        throw new McpAdapterError(`forbidden key "${nestedKey}" at ${path}.properties`);
      }
      validatePropertySchema(nestedSchema, `${path}.properties.${nestedKey}`, depth + 1);
    }
  }
  if (propSchema.items !== undefined) {
    if (!isPlainObject(propSchema.items)) {
      throw new McpAdapterError(`${path}.items must be a schema object`);
    }
    validatePropertySchema(propSchema.items, `${path}.items`, depth + 1);
  }
}

/**
 * Generates a deterministic mock value from a JSON Schema property definition (zero-LLM, zero-network).
 */
export function buildDeterministicMockValue(propSchema, propName = 'value', depth = 0) {
  if (depth > LIMITS.maxDepth || !isPlainObject(propSchema)) {
    return 'sample';
  }
  if (propSchema.const !== undefined) {
    return cloneJson(propSchema.const);
  }
  if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
    return cloneJson(propSchema.enum[0]);
  }
  if (propSchema.default !== undefined) {
    return cloneJson(propSchema.default);
  }

  const rawType = Array.isArray(propSchema.type)
    ? propSchema.type.find((t) => t !== 'null') || propSchema.type[0]
    : propSchema.type;

  switch (rawType) {
    case 'string':
      return `sample_${propName.replace(/[^A-Za-z0-9_]/g, '_')}`;
    case 'integer':
      return typeof propSchema.minimum === 'number' && Number.isInteger(propSchema.minimum)
        ? propSchema.minimum
        : 1;
    case 'number':
      return typeof propSchema.minimum === 'number' && Number.isFinite(propSchema.minimum)
        ? propSchema.minimum
        : 1;
    case 'boolean':
      return true;
    case 'null':
      return null;
    case 'array': {
      if (isPlainObject(propSchema.items)) {
        return [buildDeterministicMockValue(propSchema.items, `${propName}_item`, depth + 1)];
      }
      return [];
    }
    case 'object': {
      const out = {};
      if (isPlainObject(propSchema.properties)) {
        const keys = Object.keys(propSchema.properties).sort();
        for (const key of keys) {
          out[key] = buildDeterministicMockValue(propSchema.properties[key], key, depth + 1);
        }
      }
      return out;
    }
    default: {
      if (isPlainObject(propSchema.properties)) {
        const out = {};
        for (const key of Object.keys(propSchema.properties).sort()) {
          out[key] = buildDeterministicMockValue(propSchema.properties[key], key, depth + 1);
        }
        return out;
      }
      return `sample_${propName.replace(/[^A-Za-z0-9_]/g, '_')}`;
    }
  }
}

/**
 * Generates deterministic mock arguments for an MCP tool's inputSchema.
 */
export function buildDeterministicToolArguments(inputSchema) {
  if (!isPlainObject(inputSchema) || !isPlainObject(inputSchema.properties)) {
    return {};
  }
  const properties = inputSchema.properties;
  const requiredSet = new Set(Array.isArray(inputSchema.required) ? inputSchema.required : []);
  const allKeys = Object.keys(properties);

  // Include all declared properties in a stable order (required first, then optional)
  const selectedKeys = allKeys.length > 0 ? allKeys : [...requiredSet];
  const args = {};
  for (const key of selectedKeys) {
    if (Object.hasOwn(properties, key)) {
      args[key] = buildDeterministicMockValue(properties[key], key, 0);
    } else if (requiredSet.has(key)) {
      args[key] = `sample_${key}`;
    }
  }
  return args;
}

/**
 * Parses an MCP tools manifest (JSON string or plain object with `tools: [...]`)
 * and returns a validated list of normalized tool definitions.
 */
export function parseMcpToolsManifest(manifestData) {
  let parsed = manifestData;
  if (typeof manifestData === 'string') {
    parsed = parseSafeJsonString(manifestData);
  }
  if (!isPlainObject(parsed)) {
    throw new McpAdapterError('MCP manifest must be a JSON object or JSON string');
  }

  assertSafeObjectTree(parsed, 'manifest', 0);

  if (!Array.isArray(parsed.tools)) {
    throw new McpAdapterError('MCP manifest must contain a "tools" array');
  }
  if (parsed.tools.length === 0) {
    throw new McpAdapterError('MCP manifest "tools" array must contain at least 1 tool');
  }
  if (parsed.tools.length > LIMITS.maxTools) {
    throw new McpAdapterError(`MCP manifest exceeds maximum of ${LIMITS.maxTools} tools`);
  }

  return parsed.tools.map((tool, index) => normalizeMcpToolDef(tool, index));
}

/**
 * Converts a single MCP tool definition into a declarative SkillGuard v1 fixture object.
 */
export function generateMcpToolFixture(toolDef, { filePath = undefined } = {}) {
  const normalized = normalizeMcpToolDef(toolDef, 0);
  const mockArgs = buildDeterministicToolArguments(normalized.inputSchema);
  const sanitizedName = normalized.name.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);

  const target = {
    kind: 'mcp-tool',
    name: normalized.name,
  };
  if (typeof filePath === 'string' && filePath.trim()) {
    target.path = filePath.trim();
  }

  return {
    version: 1,
    name: `${sanitizedName}-mcp-fixture`,
    description: normalized.description || `Deterministic SkillGuard fixture for MCP tool ${normalized.name}`,
    target,
    tools: {
      [normalized.name]: {
        result: { ok: true },
      },
    },
    cases: [
      {
        name: `${normalized.name} deterministic contract call`,
        description: `Verifies deterministic argument schema for MCP tool ${normalized.name}`,
        calls: [
          {
            tool: normalized.name,
            arguments: cloneJson(mockArgs),
          },
        ],
        expect: {
          mode: 'exact',
          calls: [
            {
              tool: normalized.name,
              arguments: cloneJson(mockArgs),
              match: 'exact',
            },
          ],
        },
      },
    ],
  };
}

/**
 * Converts an entire MCP server manifest into a consolidated SkillGuard v1 fixture object.
 */
export function generateMcpManifestFixture(manifestData, { filePath = undefined } = {}) {
  let rawObj = manifestData;
  if (typeof manifestData === 'string') {
    rawObj = parseSafeJsonString(manifestData);
  }
  const normalizedTools = parseMcpToolsManifest(rawObj);
  const serverName =
    isPlainObject(rawObj) && typeof rawObj.name === 'string' && rawObj.name.trim()
      ? rawObj.name.trim()
      : normalizedTools[0].name;

  const sanitizedServer = serverName.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  const toolsMap = {};
  const cases = [];

  for (const tool of normalizedTools) {
    const mockArgs = buildDeterministicToolArguments(tool.inputSchema);
    toolsMap[tool.name] = { result: { ok: true } };
    cases.push({
      name: `${tool.name} deterministic contract call`,
      description: tool.description || `Verifies deterministic argument schema for MCP tool ${tool.name}`,
      calls: [
        {
          tool: tool.name,
          arguments: cloneJson(mockArgs),
        },
      ],
      expect: {
        mode: 'exact',
        calls: [
          {
            tool: tool.name,
            arguments: cloneJson(mockArgs),
            match: 'exact',
          },
        ],
      },
    });
  }

  const target = {
    kind: 'mcp-tool',
    name: serverName,
  };
  if (typeof filePath === 'string' && filePath.trim()) {
    target.path = filePath.trim();
  }

  return {
    version: 1,
    name: `${sanitizedServer}-mcp-suite`,
    description:
      isPlainObject(rawObj) && typeof rawObj.description === 'string' && rawObj.description.trim()
        ? rawObj.description.trim()
        : `Automated SkillGuard MCP fixture suite for ${serverName}`,
    target,
    tools: toolsMap,
    cases,
  };
}

/**
 * Ingests a local MCP manifest JSON file and writes a SkillGuard v1 fixture (*.skillguard.json).
 * Defaults to writing under `./fixtures/mcp/<sanitized-name>.skillguard.json` relative to `cwd`.
 */
export function initMcpFixture({ manifestPath, outputPath = null, cwd = process.cwd() }) {
  const absoluteManifestPath = path.resolve(cwd, manifestPath);
  let stat;
  try {
    stat = statSync(absoluteManifestPath);
  } catch {
    throw new McpAdapterError(`MCP manifest file not found: ${manifestPath}`);
  }

  if (!stat.isFile()) {
    throw new McpAdapterError(`target is not a file: ${manifestPath}`);
  }

  if (stat.size > LIMITS.maxFileBytes) {
    throw new McpAdapterError(`MCP manifest file exceeds maximum limit of ${LIMITS.maxFileBytes} bytes`);
  }

  const content = readFileSync(absoluteManifestPath, 'utf8');
  const relativePath = path.relative(cwd, absoluteManifestPath).split(path.sep).join('/');
  const fixture = generateMcpManifestFixture(content, { filePath: relativePath });

  const sanitizedTargetName = fixture.target.name.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  const resolvedOutPath = outputPath
    ? path.resolve(cwd, outputPath)
    : path.resolve(cwd, 'fixtures', 'mcp', `${sanitizedTargetName}.skillguard.json`);

  mkdirSync(path.dirname(resolvedOutPath), { recursive: true });
  const jsonText = JSON.stringify(fixture, null, 2) + '\n';
  writeFileSync(resolvedOutPath, jsonText, 'utf8');

  return {
    outputPath: resolvedOutPath,
    fixture,
  };
}

