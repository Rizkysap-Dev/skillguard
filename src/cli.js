#!/usr/bin/env node
import { readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureLoadError, loadFixtureFile } from './loader.js';
import { exitCodeOf, buildHumanReport, jsonReportText } from './report.js';
import { ValidationError, runFixtureSource } from './runner.js';
import { safeFreeText, safeText } from './redact.js';
import { VERSION } from './version.js';
import { AdapterError, initSkillFixture } from './adapters/openbot.js';
import { McpAdapterError, initMcpFixture } from './adapters/mcp.js';

const USAGE = `Usage: skillguard test <path> [--json]
       skillguard init --from-skill <path> [--out <file>]
       skillguard init --from-mcp <path> [--out <file>]
       skillguard --version
       skillguard --help

Runs deterministic mock tool-call assertions against a SkillGuard fixture file
or a directory of *.skillguard.json fixtures.

Exit codes: 0 all passed, 1 test failure, 2 invalid input or usage.`;

export class UsageError extends Error {}

function displayPath(absolute) {
  const relative = path.relative(process.cwd(), absolute);
  return (relative || path.basename(absolute)).split(path.sep).join('/');
}

function walkFixtures(dir, out) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((left, right) => {
    if (left.name < right.name) return -1;
    if (left.name > right.name) return 1;
    return 0;
  });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFixtures(full, out);
    else if (entry.isFile() && entry.name.endsWith('.skillguard.json')) out.push(full);
  }
}

function collectFixtures(target) {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    throw new UsageError(`path not found: ${target}`);
  }
  if (stat.isFile()) return [path.resolve(target)];
  if (!stat.isDirectory()) throw new UsageError(`not a file or directory: ${target}`);
  const files = [];
  walkFixtures(path.resolve(target), files);
  if (files.length === 0) throw new UsageError(`no *.skillguard.json fixtures found in ${target}`);
  return files.sort();
}

function runFixture(file) {
  const entry = { file: displayPath(file) };
  try {
    const source = loadFixtureFile(file);
    const result = runFixtureSource(source);
    entry.name = result.name;
    entry.cases = result.cases;
    entry.status = result.cases.some((testCase) => testCase.status === 'fail') ? 'fail' : 'pass';
  } catch (cause) {
    entry.status = 'invalid';
    if (cause instanceof ValidationError) {
      entry.errors = cause.errors;
    } else if (cause instanceof FixtureLoadError) {
      entry.errors = [{ path: 'fixture', message: cause.message }];
    } else {
      entry.errors = [{ path: 'fixture', message: 'internal error while running fixture' }];
    }
  }
  return entry;
}

export function main(argv) {
  const args = [...argv];
  if (args[0] === '--version' || args[0] === '-v') {
    return { text: `skillguard ${VERSION}\n`, code: 0 };
  }
  if (args.length === 0) throw new UsageError('missing command');
  if (args[0] === '--help' || args[0] === '-h') {
    return { text: `${USAGE}\n`, code: 0 };
  }
  if (args[0] === 'init') {
    let fromSkill = null;
    let fromMcp = null;
    let outPath = null;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--from-skill') {
        i++;
        if (i >= args.length) throw new UsageError('missing value for --from-skill');
        fromSkill = args[i];
      } else if (arg === '--from-mcp') {
        i++;
        if (i >= args.length) throw new UsageError('missing value for --from-mcp');
        fromMcp = args[i];
      } else if (arg === '--out') {
        i++;
        if (i >= args.length) throw new UsageError('missing value for --out');
        outPath = args[i];
      } else if (arg.startsWith('-')) {
        throw new UsageError(`unknown option: ${arg}`);
      } else {
        throw new UsageError(`unexpected argument: ${arg}`);
      }
    }
    if (fromSkill && fromMcp) {
      throw new UsageError('cannot specify both --from-skill and --from-mcp');
    }
    if (!fromSkill && !fromMcp) {
      throw new UsageError('missing --from-skill <path> or --from-mcp <path>');
    }

    try {
      const result = fromMcp
        ? initMcpFixture({ manifestPath: fromMcp, outputPath: outPath })
        : initSkillFixture({ skillPath: fromSkill, outputPath: outPath });
      const displayOut = displayPath(result.outputPath);
      return { text: `Created fixture: ${displayOut}\n`, code: 0 };
    } catch (cause) {
      if (cause instanceof AdapterError || cause instanceof McpAdapterError) {
        throw new UsageError(cause.message);
      }
      throw cause;
    }
  }

  if (args[0] !== 'test') throw new UsageError(`unknown command: ${args[0]}`);

  let target = null;
  let json = false;
  for (const arg of args.slice(1)) {
    if (arg === '--json') {
      json = true;
    } else if (arg.startsWith('-')) {
      throw new UsageError(`unknown option: ${arg}`);
    } else if (target === null) {
      target = arg;
    } else {
      throw new UsageError('only one fixture path may be tested per run');
    }
  }
  if (target === null) throw new UsageError('missing fixture path');

  const fixtures = collectFixtures(target).map(runFixture);
  const text = json ? jsonReportText(fixtures) : buildHumanReport(fixtures);
  const code = exitCodeOf({ result: deriveResult(fixtures) });
  return { text, code };
}

function deriveResult(fixtures) {
  if (fixtures.some((fixture) => fixture.status === 'invalid')) return 'invalid';
  if (fixtures.some((fixture) => fixture.status === 'fail')) return 'fail';
  return 'pass';
}

if (process.argv[1] && isSameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const outcome = main(process.argv.slice(2));
    process.stdout.write(outcome.text);
    process.exitCode = outcome.code;
  } catch (cause) {
    if (cause instanceof UsageError) {
      process.stderr.write(`skillguard: ${safeFreeText(cause.message)}\n\n${USAGE}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write('skillguard: unexpected internal error\n');
      process.exitCode = 2;
    }
  }
}

function isSameFile(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}
