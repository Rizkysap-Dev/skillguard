import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateFixture } from '../src/schema.js';
import {
  parseFrontmatter,
  extractToolReferences,
  generateSkillFixture,
  initSkillFixture,
} from '../src/adapters/openbot.js';

test('parseFrontmatter extracts name and description from YAML frontmatter', () => {
  const content = `---
name: sample-skill
description: This is a sample description for testing.
---

# Body
Content here.
`;
  const meta = parseFrontmatter(content);
  assert.equal(meta.name, 'sample-skill');
  assert.equal(meta.description, 'This is a sample description for testing.');
});

test('parseFrontmatter handles missing frontmatter safely', () => {
  const content = `# No frontmatter
Just body text.
`;
  assert.throws(() => parseFrontmatter(content), /missing or invalid YAML frontmatter/);
});

test('extractToolReferences identifies openbot tools and namespace tools in markdown', () => {
  const markdown = `
# Guide
1. Call \`openbot.list_tables\` to inspect schema.
2. Next call \`openbot.query_data\` with SQL.
3. If needed, invoke \`openbot_browser.list_tabs\` or \`openbot.execute_data\`.
Duplicate \`openbot.query_data\` should be deduplicated.
`;
  const tools = extractToolReferences(markdown);
  assert.deepEqual(tools, [
    'openbot.list_tables',
    'openbot.query_data',
    'openbot_browser.list_tabs',
    'openbot.execute_data',
  ]);
});

test('generateSkillFixture creates a valid SkillGuard v1 fixture from SKILL.md', () => {
  const content = `---
name: test-data
description: Manipulates database tables safely.
---

## Steps
1. First run \`openbot.list_tables\`.
2. Then run \`openbot.query_data\`.
`;
  const fixture = generateSkillFixture({
    content,
    filePath: '.agents/skills/test-data/SKILL.md',
  });

  assert.equal(fixture.version, 1);
  assert.equal(fixture.name, 'test-data-flow');
  assert.equal(fixture.description, 'Manipulates database tables safely.');
  assert.equal(fixture.target.kind, 'skill');
  assert.equal(fixture.target.name, 'test-data');
  assert.equal(fixture.target.path, '.agents/skills/test-data/SKILL.md');
  assert.ok(fixture.tools['openbot.list_tables']);
  assert.ok(fixture.tools['openbot.query_data']);
  assert.equal(fixture.cases.length, 1);
  assert.equal(fixture.cases[0].calls.length, 2);
  assert.equal(fixture.cases[0].expect.calls.length, 2);

  // Must pass SkillGuard schema validation with 0 errors
  const errors = validateFixture(fixture);
  assert.deepEqual(errors, []);
});

test('generateSkillFixture handles a skill with no detected tools', () => {
  const content = `---
name: pure-notes
description: Simple skill without tools.
---

Just generic guidelines.
`;
  const fixture = generateSkillFixture({
    content,
    filePath: 'skills/pure-notes/SKILL.md',
  });

  assert.equal(fixture.version, 1);
  assert.equal(fixture.name, 'pure-notes-flow');
  assert.deepEqual(fixture.tools, {});
  assert.equal(fixture.cases.length, 1);
  assert.deepEqual(fixture.cases[0].calls, []);

  const errors = validateFixture(fixture);
  assert.deepEqual(errors, []);
});

test('initSkillFixture writes fixture file and returns absolute path', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'skillguard-init-test-'));
  try {
    const skillPath = path.join(temp, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: my-automation
description: Automates tasks.
---

Execute \`openbot.run_task\` to begin.
`,
    );

    const outPath = path.join(temp, 'custom-fixture.skillguard.json');
    const result = initSkillFixture({
      skillPath,
      outputPath: outPath,
      cwd: temp,
    });

    assert.equal(result.outputPath, outPath);
    assert.equal(result.fixture.name, 'my-automation-flow');

    const savedContent = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(savedContent.name, 'my-automation-flow');
    assert.ok(savedContent.tools['openbot.run_task']);

    const errors = validateFixture(savedContent);
    assert.deepEqual(errors, []);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('cli init --from-skill generates fixture and passes skillguard test', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'skillguard-cli-init-'));
  try {
    const skillPath = path.join(temp, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: sample-cli-tool
description: Demonstrates CLI initialization.
---

1. \`openbot.list_tables\`
2. \`openbot.execute_data\`
`,
    );

    const outFixture = path.join(temp, 'sample.skillguard.json');
    const cliPath = path.join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'cli.js');

    const initRun = spawnSync(process.execPath, [cliPath, 'init', '--from-skill', skillPath, '--out', outFixture], {
      encoding: 'utf8',
    });
    assert.equal(initRun.status, 0, initRun.stdout + initRun.stderr);
    assert.match(initRun.stdout, /sample\.skillguard\.json/);

    // Now test running skillguard test on the generated fixture!
    const testRun = spawnSync(process.execPath, [cliPath, 'test', outFixture], {
      encoding: 'utf8',
    });
    assert.equal(testRun.status, 0, testRun.stdout + testRun.stderr);
    assert.match(testRun.stdout, /Result: PASS/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('cli init rejects missing --from-skill option with exit code 2', () => {
  const cliPath = path.join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'cli.js');
  const result = spawnSync(process.execPath, [cliPath, 'init'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing --from-skill/);
});

