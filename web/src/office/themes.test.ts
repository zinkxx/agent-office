import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, cssVariables, isThemeId, themeById } from './themes.ts';

const COLOR = /^(#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/i;

/** Nesnenin içindeki tüm metinleri (renkleri) toplar. */
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

describe('temalar', () => {
  it('kimlikler benzersiz, varsayılan tema listede', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    expect(isThemeId('yok')).toBe(false);
    expect(themeById('kuzey').name).toBe('Kuzey');
  });

  it('her temanın renkleri geçerli biçimde', () => {
    for (const theme of THEMES) {
      const { id: _id, name: _n, description: _d, ...rest } = theme;
      for (const [path, v] of strings(rest)) expect(v, `${theme.id}.${path}`).toMatch(COLOR);
    }
  });

  it('her tema aynı alanlara sahip (eksik renk yok)', () => {
    const shape = (t: object) =>
      strings(t)
        .map(([p]) => p.replace(/\[\d+\]/g, '[]'))
        .sort();
    const first = new Set(shape(THEMES[0]!));
    for (const t of THEMES) expect(new Set(shape(t))).toEqual(first);
  });

  it('arayüz renkleri CSS değişkenlerine çevrilir', () => {
    const vars = cssVariables(themeById('gece'));
    expect(vars['--accent']).toBe('#ffb547');
    expect(vars['--panel-solid']).toBe('#0f1726');
    expect(Object.keys(vars)).toHaveLength(10);
  });
});
