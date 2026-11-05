import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('README fixture commands point to existing fixtures', () => {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const commands = [...readme.matchAll(/node src\/cli\.js test (fixtures\/[^\s`]+)/g)];
  assert.equal(commands.length > 0, true);
  for (const match of commands) {
    assert.equal(
      existsSync(path.resolve(ROOT, match[1])),
      true,
      `README references missing fixture: ${match[1]}`,
    );
  }
});

test('CI workflow asserts the pass, failure, and invalid exit-code contract', () => {
  const workflow = readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(workflow, /fixtures\/pass/);
  assert.match(workflow, /fixtures\/fail/);
  assert.match(workflow, /fixtures\/invalid/);
  assert.match(workflow, /-eq 1/);
  assert.match(workflow, /-eq 2/);
  assert.match(workflow, /npm test/);
});
