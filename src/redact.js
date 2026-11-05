import { isPlainObject } from './json.js';
import { sanitizeText } from './sanitize.js';

const SENSITIVE_WORDS = new Set([
  'password',
  'passwd',
  'pass',
  'pwd',
  'passphrase',
  'secret',
  'token',
  'credential',
  'credentials',
  'cookie',
  'session',
  'jwt',
  'bearer',
  'dsn',
  'signature',
  'authorization',
  'auth',
  'apikey',
]);

const SENSITIVE_COMPOUNDS = new Set([
  'sessionid',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authtoken',
  'csrftoken',
  'xsrftoken',
  'privatekey',
  'accesskey',
  'secretkey',
  'clientsecret',
]);

const KEY_PREFIXES = new Set(['api', 'access', 'private', 'secret', 'client', 'signing', 'encryption']);
const CONNECTION_PREFIXES = new Set(['connection', 'database', 'mongo', 'postgres', 'mysql', 'redis']);
const CONNECTION_SUFFIXES = new Set(['string', 'url', 'uri']);
const NON_SECRET_SUFFIXES = new Set([
  'count',
  'total',
  'length',
  'len',
  'limit',
  'time',
  'timeout',
  'duration',
  'type',
  'mode',
  'name',
  'status',
  'enabled',
  'size',
  'max',
  'min',
]);

const AWS_SECRET_VALUE = /^(?=[A-Za-z0-9/+=]{40}$)(?=[A-Za-z0-9/+=]*[0-9])(?=[A-Za-z0-9/+=]*[a-z])(?=[A-Za-z0-9/+=]*[A-Z])[A-Za-z0-9/+=]{40}$/;
const HEX_SECRET_VALUE = /^[0-9a-f]{32,}$/i;

const VALUE_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\brk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
  /\bshpat_[0-9a-f]{32}\b/g,
  /\bya29\.[A-Za-z0-9_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{0,}\.[A-Za-z0-9_-]{1,}\.[A-Za-z0-9_-]{1,}\b/g,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bxapp-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{10,}=*/g,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
  /:\/\/[^\s/@:]+:[^\s/@]+@/g,
];

const SECRET_LABELS =
  'password|passwd|pwd|passphrase|secret|token|api[-_ ]?key|authorization|auth|bearer|jwt|credential|session';

const ASSIGNED_SECRET = new RegExp(
  `\\b(${SECRET_LABELS})\\b(\\s*(?::|=)\\s*)([^\\s,;]+)`,
  'gi',
);
const COPULA_SECRET = new RegExp(
  `\\b(${SECRET_LABELS})\\b(\\s+(?:is|was|are|were)(?:\\s+[A-Za-z]+){0,2}\\s+)([^\\s,;]+)`,
  'gi',
);
const FILLER_SECRET = new RegExp(
  `\\b(${SECRET_LABELS})\\b(\\s+(?:[A-Za-z]+\\s+){0,3}(?:(?:is|was|are|were|to)\\b\\s*|[:=]\\s*))([^\\s,;]+)`,
  'gi',
);
const BARE_SECRET = new RegExp(`\\b(${SECRET_LABELS})\\b(\\s+)([^\\s,;]+)`, 'gi');

function looksLikeSecretValue(token) {
  return /\d/.test(token) || token.length >= 12;
}

function tokenizeKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSensitiveToken(token) {
  return SENSITIVE_WORDS.has(token) || SENSITIVE_COMPOUNDS.has(token);
}

export function isSensitiveKey(key) {
  const tokens = tokenizeKey(key);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (isSensitiveToken(token) && !(next && NON_SECRET_SUFFIXES.has(next))) return true;
    if (next === 'key' && KEY_PREFIXES.has(token)) return true;
    if (CONNECTION_PREFIXES.has(token) && CONNECTION_SUFFIXES.has(next)) return true;
  }
  return false;
}

export function pathIsSensitive(path) {
  const segments = String(path).match(/[^.[\]]+/g) || [];
  return segments.some((segment) => isSensitiveKey(segment));
}

function isSecretString(value) {
  if (AWS_SECRET_VALUE.test(value) || HEX_SECRET_VALUE.test(value)) return true;
  return VALUE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function redactText(text) {
  let out = String(text);
  for (const pattern of VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

export function redactFreeText(text) {
  let out = redactText(text);
  ASSIGNED_SECRET.lastIndex = 0;
  out = out.replace(ASSIGNED_SECRET, (match, label, separator) => `${label}${separator}[REDACTED]`);
  COPULA_SECRET.lastIndex = 0;
  out = out.replace(COPULA_SECRET, (match, label, separator, value) =>
    looksLikeSecretValue(value) ? `${label}${separator}[REDACTED]` : match,
  );
  FILLER_SECRET.lastIndex = 0;
  out = out.replace(FILLER_SECRET, (match, label, prefix, value) => {
    const firstWord = prefix.trim().split(/\s+/)[0].toLowerCase();
    if (NON_SECRET_SUFFIXES.has(firstWord)) return match;
    return /\d/.test(value) ? `${label}${prefix}[REDACTED]` : match;
  });
  BARE_SECRET.lastIndex = 0;
  return out.replace(BARE_SECRET, (match, label, separator, value) =>
    looksLikeSecretValue(value) ? `${label}${separator}[REDACTED]` : match,
  );
}

export function redactValue(value) {
  if (typeof value === 'string') {
    return isSecretString(value) ? '[REDACTED]' : redactFreeText(value);
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? '[REDACTED]' : redactValue(item);
    }
    return out;
  }
  return value;
}

export function safeText(value) {
  return redactText(sanitizeText(value));
}

export function safeFreeText(value) {
  return redactFreeText(sanitizeText(value));
}
