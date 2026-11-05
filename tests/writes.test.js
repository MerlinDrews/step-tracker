import { describe, expect, it } from 'vitest';
import {
  STEPS_WRITES_DISABLED_MESSAGE,
  assertStepsWritesEnabled,
  parseStepsWritesEnabled,
} from '../src/domain/writes.js';

describe('parseStepsWritesEnabled', () => {
  it('defaults when unset', () => {
    expect(parseStepsWritesEnabled(undefined)).toBe(true);
    expect(parseStepsWritesEnabled(null)).toBe(true);
    expect(parseStepsWritesEnabled('')).toBe(true);
    expect(parseStepsWritesEnabled(undefined, false)).toBe(false);
  });

  it('parses common truthy / falsy strings', () => {
    expect(parseStepsWritesEnabled('false')).toBe(false);
    expect(parseStepsWritesEnabled('0')).toBe(false);
    expect(parseStepsWritesEnabled('off')).toBe(false);
    expect(parseStepsWritesEnabled(false)).toBe(false);
    expect(parseStepsWritesEnabled('true')).toBe(true);
    expect(parseStepsWritesEnabled('1')).toBe(true);
    expect(parseStepsWritesEnabled(true)).toBe(true);
  });
});

describe('assertStepsWritesEnabled', () => {
  it('allows writes when enabled', () => {
    expect(assertStepsWritesEnabled(true)).toEqual({ ok: true });
  });

  it('rejects writes when locked', () => {
    expect(assertStepsWritesEnabled(false)).toEqual({
      ok: false,
      error: STEPS_WRITES_DISABLED_MESSAGE,
    });
  });
});
