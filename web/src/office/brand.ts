/** Marka seçimi: "sade" (varsayılan, genel) ya da "devtechnic". */
export type BrandId = 'sade' | 'devtechnic';

export const BRAND_IDS: readonly BrandId[] = ['sade', 'devtechnic'];
export const DEFAULT_BRAND: BrandId = 'sade';

export function isBrandId(v: unknown): v is BrandId {
  return typeof v === 'string' && (BRAND_IDS as readonly string[]).includes(v);
}

/** Markaya göre görünen metinler (yüzeylerdeki yazı ve başlık). */
export function brandTexts(brand: BrandId): {
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
        title: 'DevTechnic · Ajan Ofisi',
        suffix: 'DevTechnic',
        icon: '/brand/devtechnic-icon.svg',
      }
    : { word: 'AJAN OFİSİ', tagline: 'YAPAY ZEKÂ EKİBİ', title: 'Ajan Ofisi', suffix: null, icon: null };
}
