import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFixture } from '../src/schema.js';
import { buildHumanReport, buildJsonReport } from '../src/report.js';
import { sanitizeText } from '../src/sanitize.js';
import { isSensitiveKey } from '../src/redact.js';
import { runFixtureSource } from '../src/runner.js';

function fixture() {
  return {
    version: 1,
    name: 'safe-name',
    tools: { 'demo.echo': { result: {} } },
    cases: [
      {
        name: 'safe case',
        calls: [{ tool: 'demo.echo', arguments: { value: 'x' } }],
        expect: { calls: [{ tool: 'demo.echo', arguments: { value: 'x' } }] },
      },
    ],
  };
}

test('rejects integers outside the safe integer range', () => {
  const value = fixture();
  value.cases[0].calls[0].arguments = { id: Number.MAX_SAFE_INTEGER + 1 };
  const errors = validateFixture(value);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].message, /safe integer/);
});

test('accepts safe integers and fractional numbers', () => {
  const value = fixture();
  value.cases[0].calls[0].arguments = {
    max: Number.MAX_SAFE_INTEGER,
    min: Number.MIN_SAFE_INTEGER,
    fraction: 1.25,
  };
  value.cases[0].expect.calls[0].arguments = value.cases[0].calls[0].arguments;
  assert.deepEqual(validateFixture(value), []);
});

test('rejects control characters in case names', () => {
  const value = fixture();
  value.cases[0].name = 'evil\u001b[31mred';
  const errors = validateFixture(value);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].message, /control/);
});

test('rejects bidirectional formatting characters in fixture names', () => {
  const value = fixture();
  value.name = 'safe\u202ename';
  const errors = validateFixture(value);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].message, /control|bidirectional/);
});

test('sanitizeText escapes control and bidirectional characters', () => {
  assert.equal(sanitizeText('a\u001bb'), 'a\\u001bb');
  assert.equal(sanitizeText('a\u202eb'), 'a\\u202eb');
  assert.equal(sanitizeText('a\nb'), 'a\\u000ab');
  assert.equal(sanitizeText('a\u2028b'), 'a\\u2028b');
  assert.equal(sanitizeText('a\u2029b'), 'a\\u2029b');
});

test('human and JSON reports never emit raw terminal control characters', () => {
  const malicious = {
    file: 'fixtures/\u001b[2Jevil.skillguard.json',
    status: 'pass',
    name: 'name\u001b[31m',
    cases: [{ name: 'case\u001b]0;title', status: 'pass', failures: [] }],
  };
  const human = buildHumanReport([malicious]);
  assert.equal(human.includes('\u001b'), false);
  assert.match(human, /\\u001b/);
  const json = buildJsonReport([malicious]);
  assert.equal(JSON.stringify(json).includes('\u001b'), false);
});

test('validation errors do not echo secret-like tool identifiers', () => {
  const secret = 'sk-live-abcdefghijklmnop123456';
  const value = fixture();
  value.tools = {};
  value.cases[0].calls = [{ tool: secret, arguments: {} }];
  value.cases[0].expect.calls = [];
  const message = validateFixture(value)
    .map((item) => `${item.path} ${item.message}`)
    .join('\n');
  assert.equal(message.includes(secret), false);
});

test('validation error paths do not echo secret-like declared tool names', () => {
  const secret = 'sk-live-abcdefghijklmnop123456';
  const value = fixture();
  value.tools = {
    [secret]: { result: {}, throws: { message: 'conflict' } },
  };
  const message = validateFixture(value)
    .map((item) => `${item.path} ${item.message}`)
    .join('\n');
  assert.equal(message.includes(secret), false);
  assert.match(message, /\[REDACTED\]/);
});

test('unknown schema key paths do not echo the raw key', () => {
  const secret = 'hunter2-super-secret';
  const value = fixture();
  value[secret] = true;
  const message = validateFixture(value)
    .map((item) => `${item.path} ${item.message}`)
    .join('\n');
  assert.equal(message.includes(secret), false);
});

test('long fixture paths are not over-redacted', () => {
  const file =
    'fixtures/2024-01-01-long-fixture-directory-name-that-exceeds-the-limit/basic.skillguard.json';
  const hexFile = 'fixtures/0123456789abcdef0123456789abcdef/basic.skillguard.json';
  const human = buildHumanReport([
    {
      file,
      status: 'pass',
      name: 'path check',
      cases: [{ name: 'safe case', status: 'pass', failures: [] }],
    },
    {
      file: hexFile,
      status: 'pass',
      name: 'path check',
      cases: [{ name: 'safe case', status: 'pass', failures: [] }],
    },
  ]);
  assert.equal(human.includes(file), true);
  assert.equal(human.includes(hexFile), true);
  assert.equal(human.includes('[REDACTED]'), false);
});

test('does not corrupt structured failure diffs with assignment redaction', () => {
  const value = fixture();
  value.cases[0].calls[0].arguments = { password: 'hunter2-super-secret' };
  value.cases[0].expect.calls[0].arguments = { password: 'other-value' };
  const result = runFixtureSource(value);
  const human = buildHumanReport([
    { file: 'x.skillguard.json', status: 'fail', name: 'diff', cases: result.cases },
  ]);
  assert.match(human, /arguments\.password/);
  assert.match(human, /expected/);
  assert.match(human, /got/);
  assert.equal(human.includes('hunter2-super-secret'), false);
});

test('redacts password-like free text in case names', () => {
  const human = buildHumanReport([
    {
      file: 'x.skillguard.json',
      status: 'pass',
      name: 'free text',
      cases: [{ name: 'case password is hunter2', status: 'pass', failures: [] }],
    },
  ]);
  assert.equal(human.includes('hunter2'), false);
  assert.match(human, /\[REDACTED\]/);
});

test('classifies sensitive keys without substring false positives', () => {
  for (const key of ['key', 'author', 'sessionizer', 'public_key', 'monkey']) {
    assert.equal(isSensitiveKey(key), false, key);
  }
  for (const key of ['auth', 'session_id', 'apiKey', 'access_token', 'connection_string', 'database_url']) {
    assert.equal(isSensitiveKey(key), true, key);
  }
});
