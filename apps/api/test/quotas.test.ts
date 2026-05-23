import { describe, expect, it } from 'vitest';
import { checkConcurrentLimit, checkRunRateLimit } from '../src/lib/quotas.js';

describe('quota checks', () => {
  it('enforces rate limit', () => {
    expect(checkRunRateLimit(2, 3)).toBe(true);
    expect(checkRunRateLimit(3, 3)).toBe(false);
  });

  it('enforces concurrent limit', () => {
    expect(checkConcurrentLimit(1, 2)).toBe(true);
    expect(checkConcurrentLimit(2, 2)).toBe(false);
  });
});
