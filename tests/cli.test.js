import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(ROOT, 'src', 'cli.js');

function runCli(args, extraEnv = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ...extraEnv,
  };
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
    timeout: 15000,
  });
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

test('passes the fixture suite with exit code 0 and no LLM keys', () => {
  const result = runCli(['test', 'fixtures/pass']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Result: PASS/);
  assert.match(result.stdout, /Summary:/);
});

test('fails the intentional-failure fixture with exit code 1', () => {
  const result = runCli(['test', 'fixtures/fail']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Result: FAIL/);
  assert.match(result.stdout, /arguments\.city/);
});

test('rejects malformed fixtures with exit code 2 before running any case', () => {
  const result = runCli(['test', 'fixtures/invalid']);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /Result: INVALID/);
  assert.equal((result.stdout.match(/INVALID /g) || []).length >= 3, true);
  assert.equal(/\bPASS / .test(result.stdout), false);
});

test('produces byte-identical output on repeat runs', () => {
  const first = runCli(['test', 'fixtures/fail']);
  const second = runCli(['test', 'fixtures/fail']);
  assert.equal(first.status, 1);
  assert.equal(second.status, 1);
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stderr, '');
  assert.equal(second.stderr, '');
});

test('prints relative paths only', () => {
  const result = runCli(['test', 'fixtures/pass']);
  assert.equal(result.stdout.includes(ROOT), false);
});

test('supports a machine-readable JSON report', () => {
  const result = runCli(['test', 'fixtures/pass', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.result, 'pass');
  assert.equal(report.skillguard, '0.1.0');
  assert.equal(report.summary.invalid, 0);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.fixtures.length >= 2, true);
  assert.equal(typeof report.fixtures[0].file, 'string');
});

test('redacts secrets in failure output', () => {
  const result = runCli(['test', 'fixtures/fail/secret-leak.skillguard.json']);
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.match(output, /\[REDACTED\]/);
  assert.equal(output.includes('hunter2-super-secret'), false);
  assert.equal(output.includes('sk-live-abcdefghijklmnop123456'), false);
});

test('runs the fixture suite in under 3 seconds', () => {
  const started = process.hrtime.bigint();
  const result = runCli(['test', 'fixtures/pass']);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(result.status, 0);
  assert.equal(elapsedMs < 3000, true, `took ${elapsedMs.toFixed(0)}ms`);
});

test('shows usage and version without running fixtures', () => {
  const help = runCli(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  const version = runCli(['--version']);
  assert.equal(version.status, 0);
  assert.match(version.stdout, /0\.1\.0/);
});

test('fails usage errors with exit code 2', () => {
  const missing = runCli(['test', 'does-not-exist']);
  assert.equal(missing.status, 2);
  const unknown = runCli(['test', 'fixtures/pass', '--wat']);
  assert.equal(unknown.status, 2);
  const bare = runCli([]);
  assert.equal(bare.status, 2);
  assert.match(bare.stderr, /Usage:/);
});

test('source has no network, LLM SDK, or dynamic-code execution paths', () => {
  const files = walk(path.join(ROOT, 'src')).filter((file) => file.endsWith('.js'));
  assert.equal(files.length > 0, true);
  const banned = [
    [/from\s+['"]node:(http|https|http2|net|dns|tls)['"]/, 'network module import'],
    [/\bfetch\s*\(/, 'fetch call'],
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
    [/\bWebSocket\b/, 'WebSocket'],
    [/\bprocess\.env\b/, 'environment/key access'],
    [/\bnew\s+Function\b/, 'dynamic function'],
    [/\beval\s*\(/, 'eval'],
    [/['"](axios|undici|openai|@anthropic-ai)['"]/, 'external SDK import'],
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const [pattern, label] of banned) {
      assert.equal(pattern.test(source), false, `${label} found in ${path.relative(ROOT, file)}`);
    }
  }
});

test('redacts additional secret patterns in failure output', () => {
  const secrets = [
    ['sk', 'live', 'FAKEabcdefghijklmnop1234'].join('_'),
    'glpat-FAKEabcdefghijklmnop12',
    'npm_FAKEabcdefghijklmnopqrstuvwxyz123456',
    'SG.FAKEabcdefghijklmnop.FAKEabcdefghijklmnop',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXYifQ.FAKEsignature12345',
    'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    '-----BEGIN PGP PRIVATE KEY BLOCK-----',
    '0123456789abcdef0123456789abcdef',
  ];
  const result = runCli(['test', 'fixtures/fail/secret-patterns.skillguard.json']);
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.match(output, /\[REDACTED\]/);
  for (const secret of secrets) {
    assert.equal(output.includes(secret), false, secret);
  }
});

test('does not leak secret-like identifiers or fixture file paths', () => {
  const secret = 'sk-live-abcdefghijklmnop123456';
  const temp = mkdtempSync(path.join(tmpdir(), 'skillguard-secret-id-'));
  try {
    const file = path.join(temp, `${secret}.skillguard.json`);
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        name: 'leaky',
        tools: {},
        cases: [
          {
            name: 'undeclared secret tool',
            calls: [{ tool: secret, arguments: {} }],
            expect: { calls: [] },
          },
        ],
      }),
    );
    const result = runCli(['test', file]);
    assert.equal(result.status, 2);
    const output = result.stdout + result.stderr;
    assert.equal(output.includes(secret), false);
    assert.match(result.stdout, /\[REDACTED\]/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('sanitizes terminal control characters in case names and file paths', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'skillguard-control-'));
  try {
    const file = path.join(temp, '\u001b[2Jevil.skillguard.json');
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        name: 'control-path',
        tools: { 'demo.echo': { result: {} } },
        cases: [
          {
            name: 'safe case',
            calls: [{ tool: 'demo.echo', arguments: {} }],
            expect: { calls: [{ tool: 'demo.echo', arguments: {} }] },
          },
        ],
      }),
    );
    const result = runCli(['test', file]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.includes('\u001b'), false);
    assert.match(result.stdout, /\\u001b/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('fixture files stay within the size limit', () => {
  const files = walk(path.join(ROOT, 'fixtures')).filter((file) => file.endsWith('.json'));
  assert.equal(files.length >= 6, true);
  for (const file of files) {
    assert.equal(statSync(file).size < 256 * 1024, true, `${file} is too large`);
  }
});
