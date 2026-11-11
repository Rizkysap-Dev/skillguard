import { isPlainObject, cloneJson } from '../json.js';
import { LIMITS } from '../schema.js';

export class FuzzerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FuzzerError';
    this.code = 'FUZZER_ERROR';
  }
}

/**
 * Standard deterministic boundary number set.
 */
export const BOUNDARY_NUMBERS = Object.freeze([
  0,
  -0,
  -1,
  1,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.EPSILON,
  0.000001,
  -0.000001,
  NaN,
  Infinity,
  -Infinity,
]);

/**
 * Standard deterministic string payloads for edge injection testing.
 */
export const STRING_INJECTIONS = Object.freeze([
  // Boundary empty & whitespace
  '',
  ' ',
  '\t\n\r',
  // Null byte injection
  '\0',
  'test\0.txt',
  '/etc/passwd\0.png',
  // SQL injection mocks
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  '1 UNION SELECT null, username, password FROM users--',
  // Path traversal mocks
  '../../../../etc/passwd',
  '..\\..\\..\\windows\\win.ini',
  '/etc/shadow',
  '/proc/self/environ',
  // Command injection mocks
  '; ls -la',
  '$(whoami)',
  '`id`',
  '| cat /etc/passwd',
  '& calc.exe',
  // Script / XSS mocks
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  // Unicode, multibyte, RTL, and bidirectional controls
  '🚀🔥🛡️⚡',
  '\u202E\u200B\uFEFF',
  'zero\u200Bwidth\u200Cnon\u200Djoiner',
  'T\u0300\u0301e\u0302s\u0303t\u0304',
  '\x00\x07\x08\x1b[31mRed\x1b[0m',
  // Prototype & template injection mocks
  "{{constructor.constructor('return this')()}}",
  '__proto__.polluted=true',
  '{"__proto__":{"polluted":true}}',
]);

/**
 * Standard edge values for boolean fuzzing.
 */
export const BOOLEAN_EDGES = Object.freeze([
  true,
  false,
  null,
  undefined,
  0,
  1,
  -1,
  'true',
  'false',
  '',
  '0',
  '1',
  NaN,
  {},
  [],
]);

/**
 * Mutates a number into boundary and adversarial numerical edge cases.
 *
 * @param {number} [val=0] - Initial numeric value to mutate from.
 * @returns {Array<number>} Deterministic array of boundary values.
 */
export function mutateNumber(val = 0) {
  const base = typeof val === 'number' && Number.isFinite(val) ? val : 0;
  const list = [...BOUNDARY_NUMBERS];

  if (base !== 0) {
    list.push(-base);
    list.push(base + 1);
    list.push(base - 1);
    list.push(base * 2);
    list.push(base / 2);
  } else {
    list.push(2);
    list.push(-2);
  }

  // Deduplicate while preserving NaN properly
  const result = [];
  let hasNaN = false;
  for (const item of list) {
    if (Number.isNaN(item)) {
      if (!hasNaN) {
        hasNaN = true;
        result.push(item);
      }
    } else if (!result.some((existing) => Object.is(existing, item))) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Mutates a string into empty, boundary length, unicode, and mock injection strings.
 *
 * @param {string} [val=""] - Base string value to mutate from.
 * @returns {Array<string>} Deterministic array of mutated strings.
 */
export function mutateString(val = '') {
  const base = typeof val === 'string' ? val : String(val ?? '');
  const list = [...STRING_INJECTIONS];

  // Boundary length strings
  list.push('A'.repeat(256));
  list.push('A'.repeat(LIMITS.maxString));
  list.push('A'.repeat(LIMITS.maxString + 1));

  if (base.length > 0) {
    list.push(base.toUpperCase());
    list.push(base.toLowerCase());
    list.push(`${base}\0`);
    list.push(`${base}' OR '1'='1`);
    list.push(`${base}/../../../../etc/passwd`);
    list.push(`${base}; ls -la`);
    list.push(`${base}\r\n\r\n`);
  }

  // Deduplicate preserving deterministic order
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }

  return result;
}

/**
 * Mutates a boolean value into inverted booleans and non-boolean edge inputs.
 *
 * @param {boolean} [val=false] - Initial boolean value.
 * @returns {Array<*>} Deterministic array of boolean and edge mutations.
 */
export function mutateBoolean(val = false) {
  const bool = Boolean(val);
  const inverted = !bool;
  const list = [inverted, bool, ...BOOLEAN_EDGES];

  const result = [];
  for (const item of list) {
    const isPresent = result.some((existing) => {
      if (Number.isNaN(existing) && Number.isNaN(item)) return true;
      if (typeof existing === 'object' && typeof item === 'object') {
        if (existing === null && item === null) return true;
        if (Array.isArray(existing) && Array.isArray(item) && existing.length === 0 && item.length === 0) return true;
        if (isPlainObject(existing) && isPlainObject(item) && Object.keys(existing).length === 0 && Object.keys(item).length === 0) return true;
        return false;
      }
      return Object.is(existing, item);
    });
    if (!isPresent) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Mutates an array into empty, single, oversized, and heterogeneous arrays.
 *
 * @param {Array<*>} [arr=[]] - Initial array to mutate.
 * @returns {Array<Array<*>>} Deterministic array of mutated array variants.
 */
export function mutateArray(arr = []) {
  const base = Array.isArray(arr) ? arr : [];
  const sample = base.length > 0 ? base[0] : 'fuzz_sample';

  // Build deep nested array (exceeding depth limit 12)
  let deepNested = ['deep_payload'];
  for (let i = 0; i < LIMITS.maxDepth + 2; i += 1) {
    deepNested = [deepNested];
  }

  const list = [
    [],
    base.length > 0 ? [cloneJson(base[0])] : ['single_item'],
    new Array(50).fill(cloneJson(sample)),
    new Array(LIMITS.maxArray).fill(cloneJson(sample)),
    new Array(LIMITS.maxArray + 1).fill(cloneJson(sample)),
    [1, 'two', true, null, { key: 'value' }, [42]],
    [null],
    [undefined],
    [null, undefined, NaN],
    base.length > 1 ? [...base, ...base] : ['duplicate_item', 'duplicate_item'],
    base.length > 1 ? [...base].reverse() : ['b', 'a'],
    deepNested,
  ];

  return list;
}

/**
 * Builds a safe payload object that tests prototype pollution defenses without polluting Object.prototype.
 *
 * @param {string} type - 'proto' | 'constructor' | 'prototype'
 * @returns {object} Safe object with own dangerous property name.
 */
function createSafePollutionObject(type) {
  if (type === 'proto') {
    return JSON.parse('{"__proto__":{"polluted":true}}');
  }
  if (type === 'constructor') {
    return JSON.parse('{"constructor":{"prototype":{"polluted":true}}}');
  }
  const obj = Object.create(null);
  obj.prototype = { polluted: true };
  return Object.assign({}, obj);
}

/**
 * Builds a deeply nested object that exceeds the schema max depth limit.
 */
function createDeepNestedObject(depth = LIMITS.maxDepth + 2) {
  let curr = { deep: 'payload' };
  for (let i = 0; i < depth; i += 1) {
    curr = { next: curr };
  }
  return curr;
}

/**
 * Builds an object with keys count exceeding LIMITS.maxObjectKeys.
 */
function createExcessiveKeysObject(count = LIMITS.maxObjectKeys + 1) {
  const obj = {};
  for (let i = 0; i < count; i += 1) {
    obj[`fuzz_k_${i}`] = i;
  }
  return obj;
}

/**
 * Mutates an object into edge cases including prototype pollution payloads,
 * missing required keys, unexpected properties, and oversized objects.
 *
 * @param {object} [obj={}] - Initial plain object to mutate.
 * @param {object} [options={}] - Mutation options.
 * @param {Array<string>} [options.requiredKeys] - Keys that should specifically be tested for omission.
 * @returns {Array<object>} Deterministic array of mutated object variants.
 */
export function mutateObject(obj = {}, options = {}) {
  const base = isPlainObject(obj) ? cloneJson(obj) : {};
  const list = [];

  // Empty object
  list.push({});

  // Prototype pollution payloads
  list.push(createSafePollutionObject('proto'));
  list.push(createSafePollutionObject('constructor'));
  list.push(createSafePollutionObject('prototype'));

  // Object with unexpected properties & injection keys
  list.push({ ...base, __unexpected_fuzz_key__: 'fuzz_payload' });
  list.push({ ...base, "' OR '1'='1": 'sql_injection_key' });
  list.push({ ...base, '../../../../etc/passwd': 'traversal_key' });
  list.push({ ...base, '': 'empty_key' });

  // Missing keys (omission of required or existing keys)
  const targetKeys = Array.isArray(options.requiredKeys) && options.requiredKeys.length > 0
    ? options.requiredKeys
    : Object.keys(base);

  for (const key of targetKeys) {
    const copy = { ...base };
    delete copy[key];
    list.push(copy);
  }

  // Object with all values set to null
  if (Object.keys(base).length > 0) {
    const nullObj = {};
    for (const key of Object.keys(base)) {
      nullObj[key] = null;
    }
    list.push(nullObj);
  }

  // Null-prototype object
  const nullProto = Object.create(null);
  for (const [key, value] of Object.entries(base)) {
    nullProto[key] = cloneJson(value);
  }
  list.push(nullProto);

  // Structural boundaries: excessive keys & deep nesting
  list.push(createExcessiveKeysObject());
  list.push(createDeepNestedObject());

  return list;
}

/**
 * Dispatches mutation based on runtime type with cross-type edge cases.
 *
 * @param {*} val - Value to mutate.
 * @param {object} [options={}] - Optional mutator options.
 * @returns {Array<*>} Deterministic array of mutated variants.
 */
export function mutateValue(val, options = {}) {
  let mutations = [];

  if (typeof val === 'number') {
    mutations = mutateNumber(val);
  } else if (typeof val === 'string') {
    mutations = mutateString(val);
  } else if (typeof val === 'boolean') {
    mutations = mutateBoolean(val);
  } else if (Array.isArray(val)) {
    mutations = mutateArray(val);
  } else if (isPlainObject(val)) {
    mutations = mutateObject(val, options);
  } else {
    // For null / undefined
    mutations = [0, '', false, {}, [], NaN, Infinity];
  }

  // Include universal type mismatch edges
  const universalEdges = [null, undefined, {}, []];
  const combined = [...mutations];
  for (const edge of universalEdges) {
    if (!combined.includes(edge)) {
      combined.push(edge);
    }
  }

  return combined;
}

/**
 * Generates an array of mutated arguments dictionaries from a baseline arguments object.
 *
 * @param {object} [args={}] - Baseline arguments object.
 * @param {object} [options={}] - Options (e.g. requiredKeys).
 * @returns {Array<object>} Array of mutated arguments dictionaries.
 */
export function mutateArguments(args = {}, options = {}) {
  const base = isPlainObject(args) ? cloneJson(args) : {};
  const entries = Object.entries(base);
  const variants = [];

  // Empty arguments
  variants.push({});

  // Prototype pollution argument tests
  variants.push(createSafePollutionObject('proto'));
  variants.push(createSafePollutionObject('constructor'));

  // Unexpected parameter added
  variants.push({ ...base, __unexpected_param__: 'fuzz_value' });

  // Field-by-field mutation: mutate one parameter while keeping others baseline
  for (const [key, val] of entries) {
    const mutatedValues = mutateValue(val, options);
    for (const mVal of mutatedValues) {
      variants.push({ ...base, [key]: mVal });
    }

    // Missing key mutation
    const omitted = { ...base };
    delete omitted[key];
    variants.push(omitted);
  }

  return variants;
}
