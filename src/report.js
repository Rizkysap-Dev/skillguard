import { safeFreeText, safeText } from './redact.js';
import { stableStringify } from './json.js';
import { VERSION } from './version.js';

function summarize(fixtures) {
  let cases = 0;
  let passed = 0;
  let failed = 0;
  let invalid = 0;
  for (const fixture of fixtures) {
    if (fixture.status === 'invalid') {
      invalid += 1;
      continue;
    }
    for (const testCase of fixture.cases) {
      cases += 1;
      if (testCase.status === 'pass') passed += 1;
      else failed += 1;
    }
  }
  return { fixtures: fixtures.length, cases, passed, failed, invalid };
}

function resultOf(summary) {
  if (summary.invalid > 0) return 'invalid';
  if (summary.failed > 0) return 'fail';
  return 'pass';
}

export function exitCodeOf(report) {
  if (report.result === 'invalid') return 2;
  if (report.result === 'fail') return 1;
  return 0;
}

export function buildJsonReport(fixtures) {
  const summary = summarize(fixtures);
  return {
    skillguard: VERSION,
    fixtures: fixtures.map((fixture) => {
      if (fixture.status === 'invalid') {
        return {
          file: safeText(fixture.file),
          status: 'invalid',
          errors: fixture.errors.map((item) => ({
            path: safeText(item.path),
            message: safeText(item.message),
          })),
        };
      }
      return {
        file: safeText(fixture.file),
        name: safeFreeText(fixture.name),
        status: fixture.status,
        cases: fixture.cases.map((testCase) => ({
          name: safeFreeText(testCase.name),
          status: testCase.status,
          failures: testCase.failures.map((failure) => safeText(failure.message)),
        })),
      };
    }),
    summary,
    result: resultOf(summary),
  };
}

export function buildHumanReport(fixtures) {
  const summary = summarize(fixtures);
  const lines = [`SkillGuard ${VERSION}`];
  for (const fixture of fixtures) {
    if (lines.length > 1) lines.push('');
    if (fixture.status === 'invalid') {
      lines.push(`INVALID ${safeText(fixture.file)}`);
      for (const item of fixture.errors) {
        lines.push(`  ${safeText(item.path)}: ${safeText(item.message)}`);
      }
      continue;
    }
    lines.push(`${fixture.status === 'pass' ? 'PASS' : 'FAIL'} ${safeText(fixture.file)}`);
    for (const testCase of fixture.cases) {
      lines.push(`  ${testCase.status === 'pass' ? 'PASS' : 'FAIL'} ${safeFreeText(testCase.name)}`);
      for (const failure of testCase.failures) {
        lines.push(`    ${safeText(failure.message)}`);
      }
    }
  }
  lines.push(
    `Summary: ${summary.fixtures} fixture(s), ${summary.cases} case(s), ${summary.passed} passed, ${summary.failed} failed${summary.invalid > 0 ? `, ${summary.invalid} invalid` : ''}`,
  );
  const result = resultOf(summary);
  lines.push(`Result: ${result.toUpperCase()}`);
  return `${lines.join('\n')}\n`;
}

export function jsonReportText(fixtures) {
  return `${stableStringify(buildJsonReport(fixtures))}\n`;
}
