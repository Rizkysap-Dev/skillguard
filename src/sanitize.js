const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

export function sanitizeText(value) {
  return String(value).replace(
    CONTROL_CHARS,
    (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`,
  );
}
