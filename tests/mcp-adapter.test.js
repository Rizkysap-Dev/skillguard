import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFixture } from '../src/schema.js';
import { runFixtureSource } from '../src/runner.js';
import {
  McpAdapterError,
  parseMcpToolsManifest,
  generateMcpToolFixture,
  generateMcpManifestFixture,
} from '../src/adapters/mcp.js';

test('parseMcpToolsManifest parses valid MCP manifest object and JSON string with all parameter types', () => {
  const manifestObj = {
    name: 'workspace-mcp',
    tools: [
      {
        name: 'workspace.search_files',
        description: 'Search files in workspace with filters.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
            caseSensitive: { type: 'boolean' },
            extensions: { type: 'array', items: { type: 'string' } },
            filter: {
              type: 'object',
              properties: {
                includeHidden: { type: 'boolean' },
                minBytes: { type: 'integer' },
              },
              required: ['includeHidden'],
            },
          },
          required: ['query', 'limit'],
        },
      },
    ],
  };

  const parsedFromObj = parseMcpToolsManifest(manifestObj);
  assert.equal(parsedFromObj.length, 1);
  assert.equal(parsedFromObj[0].name, 'workspace.search_files');
  assert.equal(parsedFromObj[0].description, 'Search files in workspace with filters.');
  assert.deepEqual(parsedFromObj[0].inputSchema.required, ['query', 'limit']);

  const parsedFromString = parseMcpToolsManifest(JSON.stringify(manifestObj));
  assert.deepEqual(parsedFromString, parsedFromObj);
});

test('parseMcpToolsManifest rejects malformed JSON, missing tools array, or missing tool name with McpAdapterError', () => {
  assert.throws(
    () => parseMcpToolsManifest('{ malformed json'),
    (err) => err instanceof McpAdapterError && /invalid JSON/i.test(err.message),
  );

  assert.throws(
    () => parseMcpToolsManifest(null),
    (err) => err instanceof McpAdapterError && /manifest/i.test(err.message),
  );

  assert.throws(
    () => parseMcpToolsManifest({}),
    (err) => err instanceof McpAdapterError && /tools/i.test(err.message),
  );

  assert.throws(
    () => parseMcpToolsManifest({ tools: [{ description: 'no name tool', inputSchema: { type: 'object' } }] }),
    (err) => err instanceof McpAdapterError && /name/i.test(err.message),
  );

  assert.throws(
    () => parseMcpToolsManifest({ tools: [{ name: 'bad tool spaces!', inputSchema: { type: 'object' } }] }),
    (err) => err instanceof McpAdapterError && /name/i.test(err.message),
  );
});

test('parseMcpToolsManifest and generateMcpToolFixture reject prototype pollution and malformed inputSchema', () => {
  const pollutedJson = '{"tools":[{"name":"demo.tool","inputSchema":{"type":"object","__proto__":{"polluted":true}}}]}';
  assert.throws(
    () => parseMcpToolsManifest(pollutedJson),
    (err) => err instanceof McpAdapterError && /forbidden|prototype|__proto__/i.test(err.message),
  );

  const constructorPolluted = {
    name: 'demo.tool',
    inputSchema: {
      type: 'object',
      properties: {
        constructor: { type: 'string' },
      },
    },
  };
  assert.throws(
    () => generateMcpToolFixture(constructorPolluted),
    (err) => err instanceof McpAdapterError && /forbidden|prototype|constructor/i.test(err.message),
  );

  assert.throws(
    () => generateMcpToolFixture({ name: 'demo.tool', inputSchema: { type: 'array' } }),
    (err) => err instanceof McpAdapterError && /inputSchema/i.test(err.message),
  );
});

test('generateMcpToolFixture generates deterministic mock arguments for string, number, integer, boolean, array, and nested object types', () => {
  const toolDef = {
    name: 'analytics.query_metrics',
    description: 'Query metrics deterministically.',
    inputSchema: {
      type: 'object',
      properties: {
        metricName: { type: 'string' },
        status: { type: 'string', enum: ['active', 'paused'] },
        threshold: { type: 'number' },
        limit: { type: 'integer' },
        includeArchived: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        options: {
          type: 'object',
          properties: {
            region: { type: 'string', default: 'ap-southeast-1' },
            retries: { type: 'integer' },
          },
        },
      },
      required: ['metricName', 'status', 'threshold', 'limit', 'includeArchived', 'tags', 'options'],
    },
  };

  const fixture = generateMcpToolFixture(toolDef);
  assert.equal(fixture.version, 1);
  assert.equal(fixture.target.kind, 'mcp-tool');
  assert.equal(fixture.target.name, 'analytics.query_metrics');
  assert.ok(fixture.tools['analytics.query_metrics']);
  assert.equal(fixture.cases.length, 1);

  const callArgs = fixture.cases[0].calls[0].arguments;
  assert.equal(typeof callArgs.metricName, 'string');
  assert.equal(callArgs.status, 'active');
  assert.equal(typeof callArgs.threshold, 'number');
  assert.equal(Number.isInteger(callArgs.limit), true);
  assert.equal(typeof callArgs.includeArchived, 'boolean');
  assert.equal(Array.isArray(callArgs.tags), true);
  assert.equal(typeof callArgs.options, 'object');
  assert.equal(callArgs.options.region, 'ap-southeast-1');
  assert.equal(Number.isInteger(callArgs.options.retries), true);

  // Repeat call must produce byte-identical output (deterministic, zero-LLM)
  const secondFixture = generateMcpToolFixture(toolDef);
  assert.deepEqual(secondFixture, fixture);
});

test('integration: fixture generated by generateMcpToolFixture passes validateFixture and runFixtureSource', () => {
  const manifest = {
    tools: [
      {
        name: 'github.create_issue',
        description: 'Create a new issue in a GitHub repository.',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            title: { type: 'string' },
            labels: { type: 'array', items: { type: 'string' } },
            milestone: { type: 'integer' },
            notifyAssignees: { type: 'boolean' },
          },
          required: ['owner', 'repo', 'title'],
        },
      },
    ],
  };

  const tools = parseMcpToolsManifest(manifest);
  const fixture = generateMcpToolFixture(tools[0], { filePath: 'mcp/github.json' });

  const validationErrors = validateFixture(fixture);
  assert.deepEqual(validationErrors, []);

  const runResult = runFixtureSource(fixture);
  assert.equal(runResult.cases.length, 1);
  assert.equal(runResult.cases[0].status, 'pass');
});

test('integration: generateMcpManifestFixture builds a multi-tool SkillGuard v1 fixture that passes validation', () => {
  const manifest = {
    name: 'database-mcp',
    description: 'Database read/write MCP server',
    tools: [
      {
        name: 'db.list_tables',
        description: 'List all tables',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'db.query_rows',
        description: 'Query table rows',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string' },
            limit: { type: 'integer', default: 10 },
          },
          required: ['table'],
        },
      },
    ],
  };

  const fixture = generateMcpManifestFixture(manifest, { filePath: 'mcp/database.json' });
  assert.equal(fixture.version, 1);
  assert.equal(fixture.target.kind, 'mcp-tool');
  assert.equal(Object.keys(fixture.tools).length, 2);
  assert.equal(fixture.cases.length, 2);

  const errors = validateFixture(fixture);
  assert.deepEqual(errors, []);

  const runResult = runFixtureSource(fixture);
  assert.equal(runResult.cases.every((c) => c.status === 'pass'), true);
});
