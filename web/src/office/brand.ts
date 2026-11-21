import { translate, type Lang } from '../i18n.ts';

/** Marka seçimi: "sade" (varsayılan, genel) ya da "devtechnic". */
export type BrandId = 'sade' | 'devtechnic';

export const BRAND_IDS: readonly BrandId[] = ['sade', 'devtechnic'];
export const DEFAULT_BRAND: BrandId = 'sade';

export function isBrandId(v: unknown): v is BrandId {
  return typeof v === 'string' && (BRAND_IDS as readonly string[]).includes(v);
}

/**
 * Markaya göre görünen metinler (yüzeylerdeki yazı ve başlık). Sade markanın yazıları dile göre değişir;
 * DevTechnic'in marka yazısı ve sloganı değişmez.
 */
export function brandTexts(
  brand: BrandId,
  lang: Lang,
): {
  word: string;
  tagline: string;
  title: string;
  suffix: string | null;
  icon: string | null;
} {
  return brand === 'devtechnic'
    ? {
        word: 'DEVTECHNIC',
        tagline: 'DATA CENTER · YAZILIM',
        title: `DevTechnic · ${translate(lang, 'app.name')}`,
        suffix: 'DevTechnic',
        icon: '/brand/devtechnic-icon.svg',
      }
    : {
        word: translate(lang, 'brand.word'),
        tagline: translate(lang, 'brand.tagline'),
        title: translate(lang, 'app.name'),
        suffix: null,
        icon: null,
      };
}
