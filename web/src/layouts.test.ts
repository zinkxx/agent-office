import { describe, expect, it } from 'vitest';
import { parseLayouts, withIsland, withoutProject } from './layouts.ts';

describe('kayıtlı düzenler', () => {
  it('boş, bozuk ya da yanlış biçimli kayıt boş döner', () => {
    expect(parseLayouts(null)).toEqual({});
    expect(parseLayouts('{bozuk')).toEqual({});
    expect(parseLayouts('[1]')).toEqual({});
    expect(parseLayouts('"metin"')).toEqual({});
  });

  it('geçerli konumlar kalır, geçersizler atılır', () => {
    const raw = JSON.stringify({
      Atlas: {
        'developer#0': { x: 10.5, z: 4 },
        'tester#0': { x: 'on', z: 3 },
        'designer#0': { x: 1e9, z: 3 },
        'reviewer#0': null,
      },
      Bos: { 'developer#0': { x: Number.NaN, z: 1 } },
      Liste: [1, 2],
    });
    expect(parseLayouts(raw)).toEqual({ Atlas: { 'developer#0': { x: 10.5, z: 4 } } });
  });

  it('ada ekleme ve projeyi sıfırlama değişmez kopya döner', () => {
    const a = { Nova: { 'developer#0': { x: 1, z: 2 } } };
    const b = withIsland(a, 'Nova', 'tester#0', { x: 3, z: 4 });
    expect(b.Nova).toEqual({ 'developer#0': { x: 1, z: 2 }, 'tester#0': { x: 3, z: 4 } });
    expect(a.Nova).toEqual({ 'developer#0': { x: 1, z: 2 } });
    expect(withoutProject(b, 'Nova')).toEqual({});
    expect(withIsland({}, 'Yeni', 'other#0', { x: 5, z: 6 })).toEqual({
      Yeni: { 'other#0': { x: 5, z: 6 } },
    });
  });
});
