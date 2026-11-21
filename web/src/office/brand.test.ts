import { describe, expect, it } from 'vitest';
import { brandTexts, DEFAULT_BRAND, isBrandId } from './brand.ts';

describe('marka', () => {
  it('varsayılan sade; sade markada DevTechnic geçmez', () => {
    expect(DEFAULT_BRAND).toBe('sade');
    const t = brandTexts('sade', 'tr');
    expect(JSON.stringify(t).toLowerCase()).not.toContain('devtechnic');
    expect(JSON.stringify(brandTexts('sade', 'en')).toLowerCase()).not.toContain('devtechnic');
    expect(t.icon).toBeNull();
    expect(brandTexts('devtechnic', 'tr').word).toBe('DEVTECHNIC');
  });
  it('sade markanın yazısı dile göre, DevTechnic yazısı ve sloganı değişmez', () => {
    expect(brandTexts('sade', 'tr').word).toBe('AJAN OFİSİ');
    expect(brandTexts('sade', 'en').word).toBe('AGENT OFFICE');
    expect(brandTexts('sade', 'en').title).toBe('Agent Office');
    const { title: _tr, ...dtTr } = brandTexts('devtechnic', 'tr');
    const { title: _en, ...dtEn } = brandTexts('devtechnic', 'en');
    expect(dtEn).toEqual(dtTr);
  });
  it('geçersiz değer reddedilir', () => {
    expect(isBrandId('devtechnic')).toBe(true);
    expect(isBrandId('x')).toBe(false);
  });
});
