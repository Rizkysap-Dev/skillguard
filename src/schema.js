import { isPlainObject } from './json.js';
import { safeText } from './redact.js';

export const LIMITS = {
  maxFileBytes: 256 * 1024,
  maxDepth: 12,
  maxString: 8192,
  maxArray: 500,
  maxObjectKeys: 200,
  maxTools: 64,
  maxCases: 200,
  maxCalls: 100,
  maxNodes: 50000,
};

const TOP_LEVEL_KEYS = new Set(['version', 'name', 'description', 'target', 'tools', 'cases']);
const TARGET_KEYS = new Set(['kind', 'name', 'path']);
const TOOL_DEF_KEYS = new Set(['result', 'throws']);
const THROW_KEYS = new Set(['message', 'code']);
const CASE_KEYS = new Set(['name', 'description', 'calls', 'expect']);
const CALL_KEYS = new Set(['tool', 'arguments']);
const EXPECT_KEYS = new Set(['mode', 'calls']);
const EXPECTED_CALL_KEYS = new Set(['tool', 'arguments', 'match']);
const MATCH_MODES = new Set(['exact', 'subset']);
const EXPECT_MODES = new Set(['exact', 'contains']);
const TARGET_KINDS = new Set(['skill', 'mcp-tool']);
const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function error(path, message) {
  return { path: safeText(path), message: safeText(message) };
}

function checkJsonValue(value, path, depth, ctx, errors) {
  ctx.nodes += 1;
  if (ctx.nodes > LIMITS.maxNodes && !ctx.nodeLimitReported) {
    ctx.nodeLimitReported = true;
    errors.push(error(path, `fixture exceeds the maximum of ${LIMITS.maxNodes} JSON values`));
  }
  if (depth > LIMITS.maxDepth) {
    errors.push(error(path, `value exceeds the maximum object/array depth of ${LIMITS.maxDepth}`));
    return;
  }
  if (value === null) return;
  if (typeof value === 'string') {
    if (value.length > LIMITS.maxString) {
      errors.push(error(path, `string exceeds the maximum length of ${LIMITS.maxString}`));
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(error(path, 'number must be finite'));
      return;
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      errors.push(error(path, 'integer exceeds the safe integer range'));
    }
    return;
  }
  if (typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    if (value.length > LIMITS.maxArray) {
      errors.push(error(path, `array exceeds the maximum of ${LIMITS.maxArray} items`));
    }
    value.forEach((item, index) => checkJsonValue(item, `${path}[${index}]`, depth + 1, ctx, errors));
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > LIMITS.maxObjectKeys) {
      errors.push(error(path, `object exceeds the maximum of ${LIMITS.maxObjectKeys} keys`));
    }
    for (const key of keys) {
      if (DANGEROUS_KEYS.has(key)) {
        errors.push(error(`${path}.${key}`, 'forbidden key'));
      }
      checkJsonValue(value[key], `${path}.${key}`, depth + 1, ctx, errors);
    }
    return;
  }
  errors.push(error(path, 'value is not valid JSON'));
}

function checkString(value, path, errors, { max = LIMITS.maxString, min = 1, noControl = false } = {}) {
  if (typeof value !== 'string') {
    errors.push(error(path, 'must be a string'));
    return false;
  }
  if (value.length < min) {
    errors.push(error(path, `must not be shorter than ${min} character(s)`));
    return false;
  }
  if (value.length > max) {
    errors.push(error(path, `must not be longer than ${max} characters`));
    return false;
  }
  if (noControl && /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/.test(value)) {
    errors.push(error(path, 'must not contain control or bidirectional formatting characters'));
    return false;
  }
  return true;
}

function checkAllowedKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(error(path, 'unknown key'));
  }
}

function validateTarget(target, errors) {
  const path = 'fixture.target';
  if (!isPlainObject(target)) {
    errors.push(error(path, 'must be an object'));
    return;
  }
  checkAllowedKeys(target, TARGET_KEYS, path, errors);
  if (!TARGET_KINDS.has(target.kind)) {
    errors.push(error(`${path}.kind`, `must be one of: ${[...TARGET_KINDS].join(', ')}`));
  }
  checkString(target.name, `${path}.name`, errors, { noControl: true });
  if (target.path !== undefined) {
    checkString(target.path, `${path}.path`, errors, { max: 500, noControl: true });
  }
}

function validateThrows(throws, path, errors) {
  if (!isPlainObject(throws)) {
    errors.push(error(path, 'must be an object'));
    return;
  }
  checkAllowedKeys(throws, THROW_KEYS, path, errors);
  checkString(throws.message, `${path}.message`, errors, { max: 2000 });
  if (throws.code !== undefined) checkString(throws.code, `${path}.code`, errors, { max: 200, noControl: true });
}

function validateTools(tools, errors) {
  const path = 'fixture.tools';
  if (!isPlainObject(tools)) {
    errors.push(error(path, 'must be an object'));
    return new Set();
  }
  const names = Object.keys(tools);
  if (names.length > LIMITS.maxTools) {
    errors.push(error(path, `must not declare more than ${LIMITS.maxTools} tools`));
  }
  for (const name of names) {
    const defPath = `${path}.${name}`;
    const def = tools[name];
    if (!TOOL_NAME.test(name)) {
      errors.push(error(defPath, 'tool name must match [A-Za-z0-9][A-Za-z0-9_.:-]{0,119}'));
    }
    if (!isPlainObject(def)) {
      errors.push(error(defPath, 'must be an object'));
      continue;
    }
    checkAllowedKeys(def, TOOL_DEF_KEYS, defPath, errors);
    const hasResult = Object.hasOwn(def, 'result');
    const hasThrows = Object.hasOwn(def, 'throws');
    if (hasResult === hasThrows) {
      errors.push(error(defPath, 'must define exactly one of "result" or "throws"'));
    }
    if (hasThrows) validateThrows(def.throws, `${defPath}.throws`, errors);
  }
  return new Set(names);
}

function validateArguments(args, path, errors) {
  if (!isPlainObject(args)) errors.push(error(path, 'must be an object'));
}

function validateCall(call, path, toolNames, errors) {
  if (!isPlainObject(call)) {
    errors.push(error(path, 'must be an object'));
    return;
  }
  checkAllowedKeys(call, CALL_KEYS, path, errors);
  if (!checkString(call.tool, `${path}.tool`, errors, { max: 120 })) return;
  if (!TOOL_NAME.test(call.tool)) {
    errors.push(error(`${path}.tool`, 'tool name must match [A-Za-z0-9][A-Za-z0-9_.:-]{0,119}'));
  } else if (!toolNames.has(call.tool)) {
    errors.push(error(`${path}.tool`, 'tool is not declared in fixture.tools'));
  }
  if (call.arguments !== undefined) validateArguments(call.arguments, `${path}.arguments`, errors);
}

function validateExpectedCall(call, path, toolNames, errors) {
  if (!isPlainObject(call)) {
    errors.push(error(path, 'must be an object'));
    return;
  }
  checkAllowedKeys(call, EXPECTED_CALL_KEYS, path, errors);
  if (!checkString(call.tool, `${path}.tool`, errors, { max: 120 })) return;
  if (!TOOL_NAME.test(call.tool)) {
    errors.push(error(`${path}.tool`, 'tool name must match [A-Za-z0-9][A-Za-z0-9_.:-]{0,119}'));
  } else if (!toolNames.has(call.tool)) {
    errors.push(error(`${path}.tool`, 'tool is not declared in fixture.tools'));
  }
  if (call.match !== undefined && !MATCH_MODES.has(call.match)) {
    errors.push(error(`${path}.match`, `must be one of: ${[...MATCH_MODES].join(', ')}`));
  }
  if (call.arguments !== undefined) validateArguments(call.arguments, `${path}.arguments`, errors);
}

function validateExpect(expect, path, toolNames, errors) {
  if (!isPlainObject(expect)) {
    errors.push(error(path, 'must be an object'));
    return;
  }
  checkAllowedKeys(expect, EXPECT_KEYS, path, errors);
  if (expect.mode !== undefined && !EXPECT_MODES.has(expect.mode)) {
    errors.push(error(`${path}.mode`, `must be one of: ${[...EXPECT_MODES].join(', ')}`));
  }
  if (expect.calls === undefined) return;
  if (!Array.isArray(expect.calls)) {
    errors.push(error(`${path}.calls`, 'must be an array'));
    return;
  }
  if (expect.calls.length > LIMITS.maxCalls) {
    errors.push(error(`${path}.calls`, `must not contain more than ${LIMITS.maxCalls} calls`));
  }
  expect.calls.forEach((call, index) => {
    validateExpectedCall(call, `${path}.calls[${index}]`, toolNames, errors);
  });
}

function validateCases(cases, toolNames, errors) {
  const path = 'fixture.cases';
  if (!Array.isArray(cases)) {
    errors.push(error(path, 'must be an array'));
    return;
  }
  if (cases.length < 1) errors.push(error(path, 'must contain at least 1 case'));
  if (cases.length > LIMITS.maxCases) {
    errors.push(error(path, `must not contain more than ${LIMITS.maxCases} cases`));
  }
  cases.forEach((testCase, index) => {
    const casePath = `${path}[${index}]`;
    if (!isPlainObject(testCase)) {
      errors.push(error(casePath, 'must be an object'));
      return;
    }
    checkAllowedKeys(testCase, CASE_KEYS, casePath, errors);
    checkString(testCase.name, `${casePath}.name`, errors, { max: 200, noControl: true });
    if (testCase.description !== undefined) {
      checkString(testCase.description, `${casePath}.description`, errors, { max: 2000 });
    }
    if (!Array.isArray(testCase.calls)) {
      errors.push(error(`${casePath}.calls`, 'must be an array'));
    } else {
      if (testCase.calls.length > LIMITS.maxCalls) {
        errors.push(error(`${casePath}.calls`, `must not contain more than ${LIMITS.maxCalls} calls`));
      }
      testCase.calls.forEach((call, callIndex) => {
        validateCall(call, `${casePath}.calls[${callIndex}]`, toolNames, errors);
      });
    }
    if (testCase.expect !== undefined) {
      validateExpect(testCase.expect, `${casePath}.expect`, toolNames, errors);
    }
  });
}

export function validateFixture(value) {
  if (!isPlainObject(value)) {
    return [error('fixture', 'must be a JSON object')];
  }

  const errors = [];
  const ctx = { nodes: 0, nodeLimitReported: false };
  checkJsonValue(value, 'fixture', 0, ctx, errors);

  checkAllowedKeys(value, TOP_LEVEL_KEYS, 'fixture', errors);
  if (value.version !== 1) {
    errors.push(error('fixture.version', 'must equal 1'));
  }
  checkString(value.name, 'fixture.name', errors, { max: 200, noControl: true });
  if (value.description !== undefined) {
    checkString(value.description, 'fixture.description', errors, { max: 2000 });
  }
  if (value.target !== undefined) validateTarget(value.target, errors);

  const toolNames = validateTools(value.tools, errors);
  validateCases(value.cases, toolNames, errors);

  return errors;
}
