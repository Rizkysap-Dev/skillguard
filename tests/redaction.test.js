import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSensitiveKey, redactFreeText, redactText, redactValue } from '../src/redact.js';

test('redacts values under sensitive keys', () => {
  const input = {
    user: 'dev',
    password: 'plain-pass',
    nested: { apiKey: 'plain-key', token: 'plain-token' },
    arr: [{ authorization: 'plain-auth' }],
  };
  const output = redactValue(input);
  assert.equal(output.user, 'dev');
  assert.equal(output.password, '[REDACTED]');
  assert.equal(output.nested.apiKey, '[REDACTED]');
  assert.equal(output.nested.token, '[REDACTED]');
  assert.equal(output.arr[0].authorization, '[REDACTED]');
  assert.equal(input.password, 'plain-pass', 'input must not be mutated');
});

test('redacts recognizable secret value patterns even under neutral keys', () => {
  assert.equal(redactValue('sk-live-abcdefghijklmnop123456'), '[REDACTED]');
  assert.equal(redactValue('ghp_0123456789abcdefghijABCDEFGHIJ'), '[REDACTED]');
  assert.equal(redactValue('Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'), '[REDACTED]');
  assert.equal(redactValue('AKIAABCDEFGHIJKLMNOP'), '[REDACTED]');
  assert.equal(redactValue('-----BEGIN RSA PRIVATE KEY-----'), '[REDACTED]');
  assert.equal(redactValue('https://user:secret@example.com/repo'), '[REDACTED]');
});

test('keeps ordinary values intact', () => {
  const input = { city: 'Bandung', count: 3, nested: { ok: true }, list: ['a', 'b'] };
  assert.deepEqual(redactValue(input), input);
});

test('redacts secret-looking substrings in free text', () => {
  const text = 'failed with token sk-live-abcdefghijklmnop123456 and password hunter2';
  assert.match(redactText(text), /\[REDACTED\]/);
  assert.equal(redactText(text).includes('sk-live-abcdefghijklmnop123456'), false);
  assert.equal(redactText(text).includes('hunter2'), true, 'free text only masks token patterns');
});

test('redacts additional provider token patterns', () => {
  const patterns = [
    ['sk', 'live', 'FAKEabcdefghijklmnop1234'].join('_'),
    'glpat-FAKEabcdefghijklmnop12',
    'npm_FAKEabcdefghijklmnopqrstuvwxyz123456',
    'SG.FAKEabcdefghijklmnop.FAKEabcdefghijklmnop',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXYifQ.FAKEsignature12345',
    '-----BEGIN PGP PRIVATE KEY BLOCK-----',
    'gho_FAKEabcdefghijklmnop1234',
    'ASIAFAKEABCDEFGH1234',
  ];
  for (const pattern of patterns) {
    assert.equal(redactValue(pattern), '[REDACTED]', pattern);
  }
});

test('redacts short JWT-like strings', () => {
  assert.equal(redactValue('eyJhbGci.eyJzdWI.c2ln'), '[REDACTED]');
  assert.equal(redactValue('eyJ.a.b'), '[REDACTED]');
});

test('redacts AWS secret access keys under neutral keys', () => {
  const aws = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  assert.equal(redactValue({ note: aws }).note, '[REDACTED]');
  assert.equal(redactValue({ value: aws }).value, '[REDACTED]');
});

test('redacts 32-character hex values under an exact bare key field', () => {
  const hex = '0123456789abcdef0123456789abcdef';
  assert.equal(redactValue({ key: hex }).key, '[REDACTED]');
});

test('redacts password and token claims embedded in free text', () => {
  for (const text of ['password is hunter2', 'token is abc123', 'api key is abc123']) {
    const redacted = redactFreeText(text);
    assert.match(redacted, /\[REDACTED\]/);
    assert.equal(redacted.includes('hunter2'), false);
    assert.equal(redacted.includes('abc123'), false);
  }
});

test('redacts claims with filler words before the copula or assignment', () => {
  for (const [text, secret] of [
    ['password used was hunter2', 'hunter2'],
    ['password changed to hunter2', 'hunter2'],
    ['token used was abc123', 'abc123'],
    ['secret: abcd1234', 'abcd1234'],
  ]) {
    const redacted = redactFreeText(text);
    assert.equal(redacted.includes(secret), false, text);
    assert.match(redacted, /\[REDACTED\]/, text);
  }
  assert.equal(
    redactFreeText('the secret used to authenticate'),
    'the secret used to authenticate',
  );
});

test('redacts claims with an adverb after the copula', () => {
  for (const [text, secret] of [
    ['password is now hunter2', 'hunter2'],
    ['token is still abc123', 'abc123'],
    ['password is currently hunter2', 'hunter2'],
  ]) {
    const redacted = redactFreeText(text);
    assert.equal(redacted.includes(secret), false, text);
    assert.match(redacted, /\[REDACTED\]/, text);
  }
});

test('does not redact numbers in counter phrases', () => {
  for (const text of [
    'session timeout is 30 seconds',
    'token count is 3',
    'password length is 12',
  ]) {
    assert.equal(redactFreeText(text), text);
  }
  assert.equal(redactFreeText('the secret is under the bed'), 'the secret is under the bed');
});

test('leaves ordinary phrases and non-secret counters alone', () => {
  assert.equal(redactFreeText('pass the test'), 'pass the test');
  assert.equal(
    redactFreeText('AWS secret under a neutral key is redacted'),
    'AWS secret under a neutral key is redacted',
  );
  assert.equal(redactFreeText('the secret sauce'), 'the secret sauce');
  assert.equal(redactFreeText('api key is rotated'), 'api key is rotated');
  assert.equal(redactFreeText('the secret is under the bed'), 'the secret is under the bed');
  for (const key of ['sessionCount', 'authCount', 'tokenCount', 'sessionTimeout']) {
    assert.equal(isSensitiveKey(key), false, key);
  }
});

test('does not treat plain key names as sensitive', () => {
  const input = { key: 'plain', author: 'Ada', sessionizer: 'plain', public_key: 'plain' };
  assert.deepEqual(redactValue(input), input);
  for (const key of ['key', 'author', 'sessionizer', 'public_key']) {
    assert.equal(isSensitiveKey(key), false, key);
  }
});

test('redacts additional sensitive key names', () => {
  const input = {
    user: 'dev',
    pwd: 'plain',
    passphrase: 'plain',
    jwt: 'plain',
    dsn: 'plain',
    auth: 'plain',
    connection_string: 'plain',
  };
  const output = redactValue(input);
  assert.equal(output.user, 'dev');
  for (const key of ['pwd', 'passphrase', 'jwt', 'dsn', 'auth', 'connection_string']) {
    assert.equal(output[key], '[REDACTED]', key);
  }
});

test('redacts key-value assignments and password-like free text', () => {
  const text = 'login failed: password=hunter2 secret=abcd api_key=wxyz';
  const redacted = redactFreeText(text);
  assert.equal(redacted.includes('hunter2'), false);
  assert.equal(redacted.includes('abcd'), false);
  assert.equal(redacted.includes('wxyz'), false);
  assert.match(redacted, /\[REDACTED\]/);
  const prose = redactFreeText('case password hunter2');
  assert.equal(prose.includes('hunter2'), false);
});
