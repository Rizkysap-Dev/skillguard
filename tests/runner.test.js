import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFixtureSource, ValidationError } from '../src/runner.js';

function fixture(overrides = {}) {
  return {
    version: 1,
    name: 'demo',
    tools: {
      'weather.get': { result: { tempC: 24 } },
      'files.read': { result: { text: 'hello' } },
      'db.write': { throws: { message: 'write blocked' } },
    },
    cases: [
      {
        name: 'expected call',
        calls: [{ tool: 'weather.get', arguments: { city: 'Bandung' } }],
        expect: { calls: [{ tool: 'weather.get', arguments: { city: 'Bandung' } }] },
      },
    ],
    ...overrides,
  };
}

test('passes when recorded calls match expected calls', () => {
  const result = runFixtureSource(fixture());
  assert.equal(result.name, 'demo');
  assert.equal(result.cases[0].status, 'pass');
  assert.deepEqual(result.cases[0].failures, []);
});

test('fails with the first differing argument path', () => {
  const fx = fixture();
  fx.cases[0].expect.calls[0].arguments.city = 'Jakarta';
  const result = runFixtureSource(fx);
  assert.equal(result.cases[0].status, 'fail');
  assert.match(result.cases[0].failures[0].message, /arguments\.city/);
  assert.match(result.cases[0].failures[0].message, /Jakarta/);
  assert.match(result.cases[0].failures[0].message, /Bandung/);
});

test('fails when an extra call is recorded', () => {
  const fx = fixture();
  fx.cases[0].calls.push({ tool: 'files.read', arguments: { path: 'a.txt' } });
  const result = runFixtureSource(fx);
  assert.equal(result.cases[0].status, 'fail');
  assert.match(result.cases[0].failures[0].message, /unexpected call/);
});

test('fails when an expected call is missing', () => {
  const fx = fixture();
  fx.cases[0].expect.calls.push({ tool: 'files.read', arguments: { path: 'a.txt' } });
  const result = runFixtureSource(fx);
  assert.equal(result.cases[0].status, 'fail');
  assert.match(result.cases[0].failures[0].message, /missing expected call/);
});

test('supports contains mode with extra recorded calls', () => {
  const fx = fixture();
  fx.cases[0].calls = [
    { tool: 'files.read', arguments: { path: 'a.txt' } },
    { tool: 'weather.get', arguments: { city: 'Bandung' } },
  ];
  fx.cases[0].expect.mode = 'contains';
  const result = runFixtureSource(fx);
  assert.equal(result.cases[0].status, 'pass');
});

test('supports subset argument matching', () => {
  const fx = fixture();
  fx.cases[0].calls[0].arguments = { city: 'Bandung', units: 'metric', tz: 'Asia/Jakarta' };
  fx.cases[0].expect.calls[0].match = 'subset';
  assert.equal(runFixtureSource(fx).cases[0].status, 'pass');

  fx.cases[0].expect.calls[0].arguments = { city: 'Bandung', units: 'imperial' };
  assert.equal(runFixtureSource(fx).cases[0].status, 'fail');
});

test('treats omitted expected arguments as a wildcard', () => {
  const fx = fixture();
  fx.cases[0].expect.calls[0] = { tool: 'weather.get' };
  assert.equal(runFixtureSource(fx).cases[0].status, 'pass');
});

test('records a throwing mock call and keeps executing later calls', () => {
  const fx = fixture();
  fx.cases[0].calls = [
    { tool: 'db.write', arguments: { id: 'x' } },
    { tool: 'weather.get', arguments: { city: 'Bandung' } },
  ];
  fx.cases[0].expect.calls = [{ tool: 'weather.get', arguments: { city: 'Bandung' } }];
  fx.cases[0].expect.mode = 'contains';
  const result = runFixtureSource(fx);
  assert.equal(result.cases[0].status, 'pass');
});

test('reports independent results for every case', () => {
  const fx = fixture();
  fx.cases.push({
    name: 'second case fails',
    calls: [{ tool: 'weather.get', arguments: { city: 'Bandung' } }],
    expect: { calls: [{ tool: 'weather.get', arguments: { city: 'Jakarta' } }] },
  });
  const result = runFixtureSource(fx);
  assert.equal(result.cases[0].status, 'pass');
  assert.equal(result.cases[1].status, 'fail');
});

test('rejects an invalid fixture before dispatching any mock call', () => {
  const fx = fixture();
  fx.cases[0].calls[0].tool = 'ghost.tool';
  let dispatched = 0;
  assert.throws(
    () => runFixtureSource(fx, { onDispatch: () => { dispatched += 1; } }),
    (error) => error instanceof ValidationError,
  );
  assert.equal(dispatched, 0);
});

test('redacts secrets in failure messages', () => {
  const fx = fixture();
  fx.cases[0].calls[0].arguments = { password: 'hunter2-super-secret' };
  fx.cases[0].expect.calls[0].arguments = { password: 'other-value' };
  const result = runFixtureSource(fx);
  const message = result.cases[0].failures[0].message;
  assert.match(message, /\[REDACTED\]/);
  assert.equal(message.includes('hunter2-super-secret'), false);
});
