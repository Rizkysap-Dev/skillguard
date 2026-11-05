import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFixture, LIMITS } from '../src/schema.js';

function minimal() {
  return {
    version: 1,
    name: 'minimal',
    tools: {
      'demo.echo': { result: { ok: true } },
    },
    cases: [
      {
        name: 'echoes input',
        calls: [{ tool: 'demo.echo', arguments: { value: 'hello' } }],
        expect: {
          calls: [{ tool: 'demo.echo', arguments: { value: 'hello' } }],
        },
      },
    ],
  };
}

test('accepts a valid fixture without errors', () => {
  assert.deepEqual(validateFixture(minimal()), []);
});

test('accepts a fixture with zero tools and zero calls', () => {
  const fixture = {
    version: 1,
    name: 'empty-case',
    tools: {},
    cases: [{ name: 'does nothing', calls: [], expect: { calls: [] } }],
  };
  assert.deepEqual(validateFixture(fixture), []);
});

test('rejects a wrong version', () => {
  const errors = validateFixture({ ...minimal(), version: 2 });
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].path, /version/);
});

test('rejects a missing name', () => {
  const { name, ...rest } = minimal();
  const errors = validateFixture(rest);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].path, /name/);
});

test('rejects unknown top-level keys', () => {
  const fixture = { ...minimal(), runner: { exec: 'anything' } };
  const errors = validateFixture(fixture);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].message, /unknown key/);
});

test('rejects calls to tools that are not declared as mocks', () => {
  const fixture = minimal();
  fixture.cases[0].calls[0].tool = 'ghost.tool';
  const errors = validateFixture(fixture);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].path, /cases\[0\]\.calls\[0\]\.tool/);
});

test('rejects a tool definition with both result and throws', () => {
  const fixture = minimal();
  fixture.tools['demo.echo'] = { result: {}, throws: { message: 'x' } };
  const errors = validateFixture(fixture);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].path, /tools\.demo\.echo/);
});

test('rejects prototype-polluting keys anywhere', () => {
  const fixture = minimal();
  fixture.cases[0].calls[0].arguments = { __proto__: { polluted: true }, safe: 1 };
  const raw = JSON.parse(JSON.stringify(fixture));
  raw.cases[0].calls[0].arguments = JSON.parse('{"__proto__":{"polluted":true},"safe":1}');
  const errors = validateFixture(raw);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].path, /arguments/);
});

test('rejects values deeper than the limit', () => {
  let deep = { value: 1 };
  for (let i = 0; i < LIMITS.maxDepth; i += 1) deep = { next: deep };
  const fixture = minimal();
  fixture.cases[0].calls[0].arguments = deep;
  const errors = validateFixture(fixture);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].message, /depth/);
});

test('rejects strings longer than the limit', () => {
  const fixture = minimal();
  fixture.cases[0].calls[0].arguments = { value: 'x'.repeat(LIMITS.maxString + 1) };
  const errors = validateFixture(fixture);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].message, /maximum length/);
});

test('rejects an invalid expect mode', () => {
  const fixture = minimal();
  fixture.cases[0].expect.mode = 'fuzzy';
  const errors = validateFixture(fixture);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].path, /mode/);
});

test('rejects an invalid match type on an expected call', () => {
  const fixture = minimal();
  fixture.cases[0].expect.calls[0].match = 'regex';
  const errors = validateFixture(fixture);
  assert.equal(errors.length > 0, true);
  assert.match(errors[0].path, /match/);
});

test('rejects a case without calls or name', () => {
  const fixture = minimal();
  fixture.cases[0] = { calls: [] };
  const errors = validateFixture(fixture);
  assert.equal(errors.length > 0, true);
});

test('does not echo raw fixture values in validation errors', () => {
  const secret = 'sk-live-abcdefghijklmnop123456';
  const fixture = minimal();
  fixture.version = secret;
  const message = validateFixture(fixture).map((e) => e.message).join(' ');
  assert.equal(message.includes(secret), false);
});
