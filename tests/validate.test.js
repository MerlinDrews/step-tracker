import { describe, expect, it } from 'vitest';
import { MAX_STEPS, validateSteps } from '../src/domain/validate.js';

describe('validateSteps', () => {
  it('accepts integers in range', () => {
    expect(validateSteps(8432)).toEqual({ ok: true, steps: 8432 });
    expect(validateSteps('100')).toEqual({ ok: true, steps: 100 });
    expect(validateSteps(0)).toEqual({ ok: true, steps: 0 });
  });

  it('rejects empty', () => {
    expect(validateSteps('').ok).toBe(false);
    expect(validateSteps(null).ok).toBe(false);
  });

  it('rejects non-numbers and floats', () => {
    expect(validateSteps('abc').ok).toBe(false);
    expect(validateSteps(12.5).ok).toBe(false);
  });

  it('rejects negatives and absurd highs', () => {
    expect(validateSteps(-1).ok).toBe(false);
    expect(validateSteps(MAX_STEPS + 1).ok).toBe(false);
  });
});
