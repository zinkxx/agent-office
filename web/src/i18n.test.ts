import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LANGS, defaultLang, format, isLang, translate, translator } from './i18n.ts';

/** Bir metindeki yer tutucu adları (sıralı, tekrarsız). */
function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]!))].sort();
}

describe('sözlükler', () => {
  it('iki dilin anahtarları aynı', () => {
    const tr = Object.keys(DICTIONARIES.tr).sort();
    expect(Object.keys(DICTIONARIES.en).sort()).toEqual(tr);
    expect(tr.length).toBeGreaterThan(100);
  });

  it('hiçbir metin boş değil ve iki dilde aynı yer tutucular kullanılır', () => {
    for (const lang of LANGS)
      for (const [key, text] of Object.entries(DICTIONARIES[lang]))
        expect(text.trim(), `${lang}.${key}`).not.toBe('');
    for (const [key, text] of Object.entries(DICTIONARIES.tr))
      expect(placeholders(DICTIONARIES.en[key as keyof typeof DICTIONARIES.en]), key).toEqual(
        placeholders(text),
      );
  });
});

describe('format', () => {
  it('yer tutucuları doldurur, eksik parametreyi olduğu gibi bırakır', () => {
    expect(format('{n} ajan', { n: 3 })).toBe('3 ajan');
    expect(format('{h} sa {m} dk', { h: 1, m: 12 })).toBe('1 sa 12 dk');
    expect(format('{n} ajan', {})).toBe('{n} ajan');
    expect(format('{n} ajan')).toBe('{n} ajan');
    expect(format('{project} maskotu', { project: 'Atlas' })).toBe('Atlas maskotu');
  });

  it('tekil/çoğul biçimi sayıya göre seçer', () => {
    expect(format('{n} {n|agent|agents}', { n: 1 })).toBe('1 agent');
    expect(format('{n} {n|agent|agents}', { n: 0 })).toBe('0 agents');
    expect(format('{n} {n|agent|agents}', { n: 5 })).toBe('5 agents');
  });
});

describe('translate', () => {
  it('seçili dilde çevirir', () => {
    expect(translate('tr', 'settings.title')).toBe('Ayarlar');
    expect(translate('en', 'settings.title')).toBe('Settings');
    expect(translate('tr', 'list.agents', { n: 2 })).toBe('2 ajan');
    expect(translate('en', 'list.agents', { n: 1 })).toBe('1 agent');
    expect(translate('en', 'list.agents', { n: 2 })).toBe('2 agents');
    expect(translate('en', 'group.developer')).toBe('Development');
    expect(translate('tr', 'group.developer')).toBe('Geliştirme');
    expect(translate('en', 'brand.word')).toBe('AGENT OFFICE');
  });

  it('dil başına tek çevirmen örneği', () => {
    expect(translator('en')).toBe(translator('en'));
    expect(translator('tr')('app.name')).toBe('Ajan Ofisi');
    expect(translator('en')('app.name')).toBe('Agent Office');
  });
});

describe('dil seçimi', () => {
  it('tarayıcı dili "tr" ile başlıyorsa Türkçe, değilse İngilizce', () => {
    expect(defaultLang('tr')).toBe('tr');
    expect(defaultLang('tr-TR')).toBe('tr');
    expect(defaultLang('TR-tr')).toBe('tr');
    expect(defaultLang('en-US')).toBe('en');
    expect(defaultLang('de')).toBe('en');
    expect(defaultLang('')).toBe('en');
    expect(defaultLang(undefined)).toBe('en');
    expect(defaultLang(null)).toBe('en');
  });

  it('geçerli dil kimlikleri', () => {
    expect(isLang('tr')).toBe(true);
    expect(isLang('en')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(isLang(1)).toBe(false);
  });
});
