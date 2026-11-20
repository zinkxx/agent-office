import { describe, expect, it } from 'vitest';
import { brandTexts, DEFAULT_BRAND, isBrandId } from './brand.ts';

describe('marka', () => {
  it('varsayılan sade; sade markada DevTechnic geçmez', () => {
    expect(DEFAULT_BRAND).toBe('sade');
    const t = brandTexts('sade');
    expect(JSON.stringify(t).toLowerCase()).not.toContain('devtechnic');
    expect(t.icon).toBeNull();
    expect(brandTexts('devtechnic').word).toBe('DEVTECHNIC');
  });
  it('geçersiz değer reddedilir', () => {
    expect(isBrandId('devtechnic')).toBe(true);
    expect(isBrandId('x')).toBe(false);
  });
});
