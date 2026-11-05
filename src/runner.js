import { createMockDispatcher } from './dispatcher.js';
import { compareCalls } from './matcher.js';
import { validateFixture } from './schema.js';

export class ValidationError extends Error {
  constructor(errors) {
    super(`fixture failed validation with ${errors.length} error(s)`);
    this.name = 'ValidationError';
    this.code = 'FIXTURE_INVALID';
    this.errors = errors;
  }
}

export function runFixtureSource(source, { onDispatch } = {}) {
  const errors = validateFixture(source);
  if (errors.length > 0) throw new ValidationError(errors);

  const cases = source.cases.map((testCase) => {
    const dispatcher = createMockDispatcher(source.tools);
    const recorded = [];
    for (const call of testCase.calls) {
      const record = dispatcher.dispatch(call);
      recorded.push(record);
      if (onDispatch) onDispatch(record);
    }
    const mode = testCase.expect && testCase.expect.mode ? testCase.expect.mode : 'exact';
    const expected = testCase.expect && testCase.expect.calls ? testCase.expect.calls : [];
    const failures = compareCalls(recorded, expected, mode);
    return {
      name: testCase.name,
      status: failures.length === 0 ? 'pass' : 'fail',
      failures,
    };
  });

  return { name: source.name, cases };
}
