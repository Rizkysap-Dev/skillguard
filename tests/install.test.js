import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('installed npm bin runs, reports version, and honors exit codes', () => {
  assert.notEqual(
    statSync(path.join(ROOT, 'src', 'cli.js')).mode & 0o111,
    0,
    'packaged CLI must keep its executable bit',
  );
  const temp = mkdtempSync(path.join(tmpdir(), 'skillguard-install-'));
  try {
    writeFileSync(
      path.join(temp, 'package.json'),
      JSON.stringify({ name: 'skillguard-install-check', version: '1.0.0', private: true }),
    );
    const install = spawnSync(
      'npm',
      ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--offline', ROOT],
      { cwd: temp, encoding: 'utf8', timeout: 120000, env: { ...process.env } },
    );
    assert.equal(install.status, 0, `npm install failed: ${install.stdout}\n${install.stderr}`);

    const bin = path.join(temp, 'node_modules', '.bin', 'skillguard');
    assert.notEqual(statSync(bin).mode & 0o111, 0, 'installed bin must be executable');
    const version = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000 });
    assert.equal(version.status, 0, version.stderr);
    assert.match(version.stdout, /0\.1\.0/);

    const pass = spawnSync(bin, ['test', path.join(ROOT, 'fixtures', 'pass')], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /Result: PASS/);

    const fail = spawnSync(bin, ['test', path.join(ROOT, 'fixtures', 'fail')], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(fail.status, 1, fail.stdout + fail.stderr);

    const invalid = spawnSync(bin, ['test', path.join(ROOT, 'fixtures', 'invalid')], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
