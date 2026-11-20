import { describe, expect, it } from 'vitest';
import { findPath, findPathCells, pathLength, WalkGrid, type Point } from './pathfinding.ts';

/** 10x10 m, 1 m'lik kareler; (0,0) sol üst. */
function grid10(): WalkGrid {
  return new WalkGrid(10, 10, 1, 0, 0);
}

/** Yolun hiçbir parçası engelli kareden geçmiyor mu (ince adımlarla). */
function walkable(grid: WalkGrid, from: Point, path: Point[]): boolean {
  let prev = from;
  for (const p of path) {
    const n = Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.05);
    for (let i = 0; i <= n; i++) {
      const c = grid.toCell({ x: prev.x + ((p.x - prev.x) * i) / n, z: prev.z + ((p.z - prev.z) * i) / n });
      if (!grid.isFree(c.c, c.r)) return false;
    }
    prev = p;
  }
  return true;
}

describe('WalkGrid', () => {
  it('dünya ↔ kare dönüşümü', () => {
    const g = new WalkGrid(4, 4, 0.5, -1, -1);
    expect(g.toCell({ x: -1, z: -1 })).toEqual({ c: 0, r: 0 });
    expect(g.toCell({ x: 0.9, z: 0.1 })).toEqual({ c: 3, r: 2 });
    expect(g.toWorld(0, 0)).toEqual({ x: -0.75, z: -0.75 });
    expect(g.toCell({ x: 99, z: -99 })).toEqual({ c: 3, r: 0 }); // dışarısı kenara sıkıştırılır
  });

  it('döndürülmüş dikdörtgeni engeller', () => {
    const g = grid10();
    g.blockRect(5, 5, 4, 1, Math.PI / 2); // 90°: dikey bir masa
    expect(g.isFree(5, 3)).toBe(false);
    expect(g.isFree(5, 6)).toBe(false);
    expect(g.isFree(3, 5)).toBe(true);
  });

  it('en yakın boş kare', () => {
    const g = grid10();
    g.blockRect(5, 5, 3, 3);
    const near = g.nearestFree({ x: 5.5, z: 4.2 })!;
    expect(g.isFree(near.c, near.r)).toBe(true);
    expect(Math.hypot(g.toWorld(near.c, near.r).x - 5.5, g.toWorld(near.c, near.r).z - 4.2)).toBeLessThan(2);
  });
});

describe('A* yol bulma', () => {
  it('boş zeminde düz yol', () => {
    const g = grid10();
    const path = findPath(g, { x: 0.5, z: 0.5 }, { x: 9.5, z: 9.5 })!;
    expect(path).toEqual([{ x: 9.5, z: 9.5 }]); // sadeleşince tek doğru parça
  });

  it('duvarın etrafından dolaşır, engelden geçmez', () => {
    const g = grid10();
    g.blockRect(5, 4, 1, 8); // x=5 sütununda z 0..8 duvar; aşağıda geçit
    const from = { x: 1.5, z: 1.5 };
    const path = findPath(g, from, { x: 8.5, z: 1.5 })!;
    expect(path).not.toBeNull();
    expect(walkable(g, from, path)).toBe(true);
    expect(pathLength(from, path)).toBeGreaterThan(14); // düz uzaklık 7; aşağıdan dolaşmak zorunda
  });

  it('köşe kesmez', () => {
    const g = grid10();
    g.blocked[1 * 10 + 2] = 1; // (2,1)
    g.blocked[2 * 10 + 1] = 1; // (1,2)
    const cells = findPathCells(g, g.toWorld(1, 1), g.toWorld(2, 2))!;
    // (1,1)'den (2,2)'ye çapraz adım iki yan kare dolu olduğu için yasak; yol çevreden dolaşır ya da yoktur.
    if (cells.length > 0) expect(cells.length).toBeGreaterThan(1);
  });

  it('ulaşılamayan hedefte null', () => {
    const g = grid10();
    g.blockRect(5, 5, 1, 10); // tam bölen duvar
    expect(findPath(g, { x: 1.5, z: 5 }, { x: 8.5, z: 5 })).toBeNull();
  });

  it('hedef engelliyse en yakın boş kareye gider', () => {
    const g = grid10();
    g.blockRect(7.5, 7.5, 1, 1);
    const path = findPath(g, { x: 0.5, z: 0.5 }, { x: 7.5, z: 7.5 })!;
    const end = path[path.length - 1]!;
    const cell = g.toCell(end);
    expect(g.isFree(cell.c, cell.r)).toBe(true);
    expect(Math.hypot(end.x - 7.5, end.z - 7.5)).toBeLessThanOrEqual(1.5);
  });

  it('aynı karede boş yol', () => {
    expect(findPath(grid10(), { x: 3.2, z: 3.2 }, { x: 3.4, z: 3.3 })).toEqual([{ x: 3.4, z: 3.3 }]);
  });

  it('büyük ızgarada hızlı', () => {
    const g = WalkGrid.covering(-15, 15, -10, 10, 0.5);
    for (let i = 0; i < 8; i++) g.blockRect(-10 + i * 3, 0, 1, 14);
    const t = performance.now();
    for (let i = 0; i < 50; i++) findPath(g, { x: -14, z: -9 }, { x: 14, z: 9 });
    expect(performance.now() - t).toBeLessThan(500);
  });
});
