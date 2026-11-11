import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FuzzerError,
  BOUNDARY_NUMBERS,
  STRING_INJECTIONS,
  BOOLEAN_EDGES,
  mutateNumber,
  mutateString,
  mutateBoolean,
  mutateArray,
  mutateObject,
  mutateValue,
  mutateArguments,
} from '../src/fuzzer/mutators.js';
import { LIMITS } from '../src/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('mutateNumber generates deterministic boundary values and adversarial numbers', () => {
  const result1 = mutateNumber(42);
  const result2 = mutateNumber(42);

  // Determinism check: byte-identical representations
  assert.strictEqual(JSON.stringify(result1), JSON.stringify(result2));

  // Must include explicit boundary numbers
  assert.ok(result1.includes(0), 'must include 0');
  assert.ok(result1.includes(-1), 'must include -1');
  assert.ok(result1.includes(1), 'must include 1');
  assert.ok(result1.includes(Number.MAX_SAFE_INTEGER), 'must include Number.MAX_SAFE_INTEGER');
  assert.ok(result1.includes(Number.MIN_SAFE_INTEGER), 'must include Number.MIN_SAFE_INTEGER');
  assert.ok(result1.includes(Infinity), 'must include Infinity');
  assert.ok(result1.includes(-Infinity), 'must include -Infinity');
  assert.ok(result1.some((n) => Number.isNaN(n)), 'must include NaN');

  // Must include off-by-one derived from input 42
  assert.ok(result1.includes(43), 'must include base + 1');
  assert.ok(result1.includes(41), 'must include base - 1');
  assert.ok(result1.includes(-42), 'must include negated base');

  // Fallback for non-number input
  const fallback = mutateNumber('invalid_not_number');
  assert.ok(fallback.includes(0));
  assert.ok(fallback.includes(Number.MAX_SAFE_INTEGER));
});

test('mutateString generates empty, boundary length, unicode, and mock injection strings', () => {
  const result1 = mutateString('sample_query');
  const result2 = mutateString('sample_query');

  // Determinism check
  assert.deepStrictEqual(result1, result2);

  // Must include empty string
  assert.ok(result1.includes(''), 'must include empty string');

  // Must include boundary lengths
  assert.ok(result1.some((s) => s.length === 256), 'must include 256-char string');
  assert.ok(result1.some((s) => s.length === LIMITS.maxString), 'must include maxString boundary');
  assert.ok(result1.some((s) => s.length === LIMITS.maxString + 1), 'must include maxString + 1 boundary');

  // Must include unicode / multibyte / control characters
  assert.ok(result1.some((s) => s.includes('🚀🔥🛡️⚡')), 'must include multibyte emoji');
  assert.ok(result1.some((s) => s.includes('\u202E')), 'must include RTL override');
  assert.ok(result1.some((s) => s.includes('\0')), 'must include null byte');
  assert.ok(result1.some((s) => s.includes('\x1b[31m')), 'must include ANSI control sequence');

  // Must include mock injection patterns
  assert.ok(result1.some((s) => s.includes("' OR '1'='1")), 'must include SQL injection mock');
  assert.ok(result1.some((s) => s.includes('../../../../etc/passwd')), 'must include path traversal mock');
  assert.ok(result1.some((s) => s.includes('; ls -la')), 'must include command injection mock');
  assert.ok(result1.some((s) => s.includes('<script>alert(1)</script>')), 'must include XSS mock');
  assert.ok(result1.some((s) => s.includes('__proto__')), 'must include prototype injection mock');

  // Must include variations derived from base string
  assert.ok(result1.includes('SAMPLE_QUERY'), 'must include upper-cased base');
  assert.ok(result1.includes('sample_query\0'), 'must include base with null byte');
});

test('mutateBoolean generates inverted values and non-boolean edge inputs', () => {
  const trueMutations = mutateBoolean(true);
  const falseMutations = mutateBoolean(false);

  // Inverted check
  assert.strictEqual(trueMutations[0], false, 'true should invert to false first');
  assert.strictEqual(falseMutations[0], true, 'false should invert to true first');

  // Non-boolean edge inputs
  assert.ok(trueMutations.includes(null), 'must include null');
  assert.ok(trueMutations.includes(0), 'must include 0');
  assert.ok(trueMutations.includes('true'), 'must include string "true"');
  assert.ok(trueMutations.includes('false'), 'must include string "false"');
  assert.ok(trueMutations.includes(''), 'must include empty string');
  assert.ok(trueMutations.some((v) => isNaN(v) && typeof v === 'number'), 'must include NaN');

  // Determinism check
  assert.strictEqual(JSON.stringify(trueMutations), JSON.stringify(mutateBoolean(true)));
});

test('mutateArray generates empty, single, oversized, and heterogeneous arrays', () => {
  const base = ['alpha', 'beta'];
  const mutations1 = mutateArray(base);
  const mutations2 = mutateArray(base);

  // Determinism check
  assert.deepStrictEqual(mutations1, mutations2);

  // Empty array
  assert.ok(mutations1.some((arr) => Array.isArray(arr) && arr.length === 0), 'must include empty array');

  // Single item array
  assert.ok(mutations1.some((arr) => Array.isArray(arr) && arr.length === 1 && arr[0] === 'alpha'), 'must include single item');

  // Oversized arrays
  assert.ok(mutations1.some((arr) => Array.isArray(arr) && arr.length === 50), 'must include 50-item array');
  assert.ok(mutations1.some((arr) => Array.isArray(arr) && arr.length === LIMITS.maxArray), 'must include maxArray boundary');
  assert.ok(mutations1.some((arr) => Array.isArray(arr) && arr.length === LIMITS.maxArray + 1), 'must include maxArray + 1');

  // Heterogeneous array
  const hetero = mutations1.find((arr) => Array.isArray(arr) && arr.includes('two') && arr.includes(true));
  assert.ok(hetero, 'must include heterogeneous array');

  // Deeply nested array (exceeding depth limit)
  const isDeepArray = (arr, depth = 0) => {
    if (!Array.isArray(arr)) return depth;
    return isDeepArray(arr[0], depth + 1);
  };
  assert.ok(mutations1.some((arr) => isDeepArray(arr) > LIMITS.maxDepth), 'must include array exceeding maxDepth');
});

test('mutateObject generates prototype pollution guards, missing keys, and unexpected keys safely', () => {
  // Ensure Object.prototype is clean before test
  assert.strictEqual(Object.prototype.polluted, undefined);

  const baseObj = { username: 'testuser', role: 'admin', active: true };
  const mutations1 = mutateObject(baseObj, { requiredKeys: ['username'] });
  const mutations2 = mutateObject(baseObj, { requiredKeys: ['username'] });

  // Determinism check
  assert.deepStrictEqual(mutations1, mutations2);

  // Empty object
  assert.ok(mutations1.some((o) => typeof o === 'object' && o !== null && Object.keys(o).length === 0));

  // Prototype pollution payloads must be present but NOT pollute global prototype
  assert.strictEqual(Object.prototype.polluted, undefined, 'Object.prototype must remain unpolluted');
  const hasProtoKey = mutations1.some((o) => Object.hasOwn(o, '__proto__'));
  assert.ok(hasProtoKey, 'must contain object with own __proto__ property');
  const hasConstructorKey = mutations1.some((o) => Object.hasOwn(o, 'constructor'));
  assert.ok(hasConstructorKey, 'must contain object with constructor property');

  // Verify Object.prototype still safe
  assert.strictEqual(Object.prototype.polluted, undefined);

  // Unexpected properties
  assert.ok(mutations1.some((o) => o.__unexpected_fuzz_key__ === 'fuzz_payload'), 'must include unexpected key');
  assert.ok(mutations1.some((o) => Object.hasOwn(o, "' OR '1'='1")), 'must include SQL injection key');
  assert.ok(mutations1.some((o) => Object.hasOwn(o, '../../../../etc/passwd')), 'must include path traversal key');

  // Missing required keys
  const withoutUsername = mutations1.find((o) => !Object.hasOwn(o, 'username') && Object.hasOwn(o, 'role'));
  assert.ok(withoutUsername, 'must include object omitting username');

  // Excessive keys (> maxObjectKeys)
  assert.ok(mutations1.some((o) => Object.keys(o).length > LIMITS.maxObjectKeys), 'must include object with > maxObjectKeys');

  // Deeply nested object (> maxDepth)
  const getObjDepth = (o, depth = 0) => {
    if (typeof o !== 'object' || o === null) return depth;
    const next = o.next || o.deep;
    return next ? getObjDepth(next, depth + 1) : depth;
  };
  assert.ok(mutations1.some((o) => getObjDepth(o) > LIMITS.maxDepth), 'must include object exceeding maxDepth');
});

test('mutateValue dispatches correctly based on runtime type', () => {
  const numMutations = mutateValue(100);
  assert.ok(numMutations.includes(0));
  assert.ok(numMutations.includes(Number.MAX_SAFE_INTEGER));

  const strMutations = mutateValue('foo');
  assert.ok(strMutations.includes(''));
  assert.ok(strMutations.some((s) => typeof s === 'string' && s.includes('../../../../etc/passwd')));

  const boolMutations = mutateValue(false);
  assert.ok(boolMutations.includes(true));
  assert.ok(boolMutations.includes(null));

  const nullMutations = mutateValue(null);
  assert.ok(nullMutations.includes(0));
  assert.ok(nullMutations.includes(''));
});

test('mutateArguments creates a comprehensive mutated dictionary suite for tool calls', () => {
  const args = { query: 'test', limit: 10 };
  const mutatedArgs = mutateArguments(args, { requiredKeys: ['query'] });

  assert.ok(Array.isArray(mutatedArgs));
  assert.ok(mutatedArgs.length > 20, 'must generate numerous edge variations');

  // Includes empty arguments
  assert.ok(mutatedArgs.some((a) => Object.keys(a).length === 0));

  // Includes variation where limit is mutated to boundary number (e.g. 0) while query remains 'test'
  assert.ok(mutatedArgs.some((a) => a.query === 'test' && a.limit === 0));
  assert.ok(mutatedArgs.some((a) => a.query === 'test' && a.limit === Number.MAX_SAFE_INTEGER));

  // Includes variation where query is mutated to injection string while limit remains 10
  assert.ok(mutatedArgs.some((a) => a.limit === 10 && typeof a.query === 'string' && a.query.includes("' OR '1'='1")));

  // Includes variation where query is omitted
  assert.ok(mutatedArgs.some((a) => !Object.hasOwn(a, 'query') && a.limit === 10));

  // Includes prototype pollution in arguments
  assert.ok(mutatedArgs.some((a) => Object.hasOwn(a, '__proto__')));
});

test('FuzzerError can be instantiated with proper name and code', () => {
  const err = new FuzzerError('Test fuzzer error');
  assert.strictEqual(err.name, 'FuzzerError');
  assert.strictEqual(err.code, 'FUZZER_ERROR');
  assert.strictEqual(err.message, 'Test fuzzer error');
});

test('source code adheres to strict Zero-LLM, Zero-Network, and zero external dependency constraints', () => {
  const sourcePath = path.join(__dirname, '../src/fuzzer/mutators.js');
  const source = readFileSync(sourcePath, 'utf8');

  // Network modules forbidden
  assert.doesNotMatch(source, /from\s+['"]node:http['"]/);
  assert.doesNotMatch(source, /from\s+['"]node:https['"]/);
  assert.doesNotMatch(source, /from\s+['"]node:net['"]/);
  assert.doesNotMatch(source, /from\s+['"]node:dgram['"]/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  // LLM SDK references forbidden
  assert.doesNotMatch(source, /@anthropic-ai/);
  assert.doesNotMatch(source, /openai/);
  assert.doesNotMatch(source, /@google\/generative-ai/);

  // Dynamic code evaluation forbidden
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new\s+Function\s*\(/);
});
