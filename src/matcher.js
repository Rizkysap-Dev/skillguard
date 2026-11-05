import { deepEqual, isPlainObject, stableStringify } from './json.js';
import { pathIsSensitive, redactText, redactValue } from './redact.js';

function formatValue(value, path) {
  if (value === undefined) return '<missing>';
  if (pathIsSensitive(path)) return '[REDACTED]';
  let text;
  try {
    text = stableStringify(redactValue(value));
  } catch {
    text = '<unprintable>';
  }
  if (text.length > 120) text = `${text.slice(0, 117)}...`;
  return text;
}

function formatName(name) {
  return stableStringify(redactText(name));
}

function findDifference(expected, actual, path) {
  if (deepEqual(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return { path, expected, actual };
    for (let index = 0; index < expected.length; index += 1) {
      const found = findDifference(expected[index], actual[index], `${path}[${index}]`);
      if (found) return found;
    }
    return { path, expected, actual };
  }
  if (isPlainObject(expected) && isPlainObject(actual)) {
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) {
        return { path: `${path}.${key}`, expected: expected[key], actual: undefined };
      }
      const found = findDifference(expected[key], actual[key], `${path}.${key}`);
      if (found) return found;
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) {
        return { path: `${path}.${key}`, expected: undefined, actual: actual[key] };
      }
    }
    return { path, expected, actual };
  }
  return { path, expected, actual };
}

function findSubsetDifference(expected, actual, path) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return { path, expected, actual };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const found = findSubsetDifference(expected[index], actual[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) return { path, expected, actual };
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) {
        return { path: `${path}.${key}`, expected: expected[key], actual: undefined };
      }
      const found = findSubsetDifference(expected[key], actual[key], `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }
  return deepEqual(expected, actual) ? null : { path, expected, actual };
}

function diffOne(expected, actual) {
  if (expected.tool !== actual.tool) {
    return {
      path: 'tool',
      expected: expected.tool,
      actual: actual.tool,
    };
  }
  if (expected.arguments === undefined) return null;
  const subset = expected.match === 'subset';
  return subset
    ? findSubsetDifference(expected.arguments, actual.arguments, 'arguments')
    : findDifference(expected.arguments, actual.arguments, 'arguments');
}

function describeDiff(diff) {
  return `${diff.path}: expected ${formatValue(diff.expected, diff.path)}, got ${formatValue(diff.actual, diff.path)}`;
}

function compareOne(expected, actual, callNumber) {
  const diff = diffOne(expected, actual);
  if (!diff) return [];
  return [{ message: `call ${callNumber} ${describeDiff(diff)}` }];
}

function matches(expected, actual) {
  return diffOne(expected, actual) === null;
}

export function compareCalls(actual, expected, mode) {
  const failures = [];
  if (mode === 'contains') {
    let start = 0;
    for (let index = 0; index < expected.length; index += 1) {
      let found = -1;
      for (let cursor = start; cursor < actual.length; cursor += 1) {
        if (matches(expected[index], actual[cursor])) {
          found = cursor;
          break;
        }
      }
      if (found === -1) {
        failures.push({
          message: `missing expected call ${index + 1} (${formatName(expected[index].tool)})`,
        });
      } else {
        start = found + 1;
      }
    }
    return failures;
  }

  const total = Math.max(actual.length, expected.length);
  for (let index = 0; index < total; index += 1) {
    if (index >= actual.length) {
      failures.push({
        message: `call ${index + 1}: missing expected call ${formatName(expected[index].tool)}`,
      });
    } else if (index >= expected.length) {
      failures.push({
        message: `call ${index + 1}: unexpected call ${formatName(actual[index].tool)}`,
      });
    } else {
      failures.push(...compareOne(expected[index], actual[index], index + 1));
    }
  }
  return failures;
}
