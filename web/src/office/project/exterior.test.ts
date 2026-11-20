import { describe, expect, it } from 'vitest';
import { THEMES, themeById } from '../themes.ts';
import {
  BUILDING_CLASSES,
  CURB_H,
  OUTSIDE_Y,
  ROAD_W,
  buildExterior,
  cityBlocks,
  type Rect,
} from './exterior.ts';

const W = 28.8;
const D = 17.29;
const city = buildExterior({ width: W, depth: D }, themeById('gece'));

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
function footprint(b: (typeof city.buildings)[number]): Rect {
  const c = BUILDING_CLASSES[b.cls]!;
  return {
    x0: b.x - (c.w * b.s) / 2,
    x1: b.x + (c.w * b.s) / 2,
    z0: b.z - (c.d * b.s) / 2,
    z1: b.z + (c.d * b.s) / 2,
  };
}

describe('dış mekân (şehir)', () => {
  it('kule ortadaki blokta; bloklar arasında yol genişliğinde boşluk var, bloklar çakışmaz', () => {
    const blocks = cityBlocks(W, D);
    const tower = blocks.find((b) => b.kind === 'tower')!;
    expect(tower.rect.x0).toBeLessThan(0);
    expect(tower.rect.x1).toBeGreaterThan(W);
    expect(tower.rect.z0).toBeLessThan(0);
    expect(tower.rect.z1).toBeGreaterThan(D);
    expect(blocks).toHaveLength(25);
    for (const a of blocks)
      for (const b of blocks)
        if (a !== b) expect(overlaps(a.rect, b.rect), `${a.i},${a.j} / ${b.i},${b.j}`).toBe(false);
    const right = blocks.find((b) => b.i === 1 && b.j === 0)!;
    expect(right.rect.x0 - tower.rect.x1).toBeCloseTo(ROAD_W);
  });

  it('yakın halkadaki binalar ofis katından alçak; uzak halkada yüksek binalar var', () => {
    const blocks = cityBlocks(W, D);
    const near = (x: number, z: number) =>
      blocks.find((b) => x >= b.rect.x0 && x <= b.rect.x1 && z >= b.rect.z0 && z <= b.rect.z1)!;
    let tall = 0;
    for (const b of city.buildings) {
      const block = near(b.x, b.z);
      const top = OUTSIDE_Y + CURB_H + BUILDING_CLASSES[b.cls]!.h * b.s;
      if (block.kind === 'low') expect(top, `${b.x},${b.z}`).toBeLessThan(-0.5);
      if (block.kind === 'tall' && top > 0) tall++;
    }
    expect(city.buildings.length).toBeGreaterThan(30);
    expect(tall).toBeGreaterThan(5);
  });

  it('binalar kendi bloğunun içinde: yola, kuleye ve birbirine taşmaz', () => {
    const blocks = cityBlocks(W, D);
    const fps = city.buildings.map(footprint);
    for (const f of fps) {
      const inBlock = blocks.some(
        (b) =>
          b.kind !== 'tower' &&
          f.x0 >= b.rect.x0 &&
          f.x1 <= b.rect.x1 &&
          f.z0 >= b.rect.z0 &&
          f.z1 <= b.rect.z1,
      );
      expect(inBlock, JSON.stringify(f)).toBe(true);
    }
    for (let i = 0; i < fps.length; i++)
      for (let j = i + 1; j < fps.length; j++) expect(overlaps(fps[i]!, fps[j]!)).toBe(false);
  });

  it('arabalar kulenin çevresindeki dört yolda da dolaşır', () => {
    const tower = cityBlocks(W, D).find((b) => b.kind === 'tower')!.rect;
    const ring = city.traffic.filter((r) =>
      r.axis === 'x'
        ? Math.abs(r.at - tower.z0) <= ROAD_W || Math.abs(r.at - tower.z1) <= ROAD_W
        : Math.abs(r.at - tower.x0) <= ROAD_W || Math.abs(r.at - tower.x1) <= ROAD_W,
    );
    expect(ring).toHaveLength(4);
  });

  it('aynı oda ve tema → aynı şehir; gece lambalar yanar, gündüz yanmaz', () => {
    const again = buildExterior({ width: W, depth: D }, themeById('gece'));
    expect(again.parts.length).toBe(city.parts.length);
    expect(again.buildings).toEqual(city.buildings);
    const glow = (t: string) =>
      buildExterior({ width: W, depth: D }, themeById(t as 'gece')).parts.filter((p) => p.m === 'glow')
        .length;
    expect(glow('gece')).toBeGreaterThan(glow('gunisigi'));
    for (const t of THEMES)
      expect(buildExterior({ width: W, depth: D }, t).parts.length).toBeGreaterThan(500);
  });
});
