import { readFileSync, statSync } from 'node:fs';
import { LIMITS } from './schema.js';

export class FixtureLoadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FixtureLoadError';
    this.code = 'FIXTURE_LOAD_ERROR';
  }
}

export function parseFixtureText(text) {
  try {
    return JSON.parse(text);
  } catch (cause) {
    const position = /position (\d+)/.exec(String(cause && cause.message ? cause.message : ''));
    throw new FixtureLoadError(
      `invalid JSON${position ? ` at position ${position[1]}` : ''}`,
    );
  }
}

export function loadFixtureFile(file) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    throw new FixtureLoadError('file cannot be read');
  }
  if (!stat.isFile()) throw new FixtureLoadError('path is not a file');
  if (stat.size > LIMITS.maxFileBytes) {
    throw new FixtureLoadError(`file exceeds the ${LIMITS.maxFileBytes}-byte limit`);
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new FixtureLoadError('file cannot be read');
  }
  return parseFixtureText(text);
}
