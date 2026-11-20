import { describe, expect, it } from 'vitest';
import { VIEWPORT, boundsFor, frameBox, frameOffice } from './framing.ts';

/** Varsayılan ofis: 4 ada (genişlik sabit 28,8 m). */
const plan = { width: 28.8, depth: 16 };
const FOV = 38;

describe('kadraj', () => {
  for (const [name, w, h] of [
    ['1920×1080', 1920, 1080],
    ['1440×900 panel açık', 1440 - 380, 900],
    ['1600×900', 1600, 900],
    ['telefon 390×844', 390, 844],
  ] as const) {
    it(`${name}: kutu ekrana sığar ve ekranı iyi doldurur`, () => {
      const aspect = w / h;
      const box = frameBox(plan, aspect);
      const f = frameOffice(box, FOV, aspect);
      const b = boundsFor(box, f, FOV, aspect);
      expect(b.x0).toBeGreaterThanOrEqual(VIEWPORT.left - 1e-3);
      expect(b.x1).toBeLessThanOrEqual(VIEWPORT.right + 1e-3);
      expect(b.y0).toBeGreaterThanOrEqual(VIEWPORT.bottom - 1e-3);
      expect(b.y1).toBeLessThanOrEqual(VIEWPORT.top + 1e-3);
      // Yatayda ve dikeyde en az birinde sınıra dayanır; geniş ekranda kapsama yüksek.
      const wide = b.x1 - b.x0 > 1.85;
      const tall = b.y1 - b.y0 > 1.7;
      expect(wide || tall).toBe(true);
      if (aspect > 1.2) expect(f.coverage).toBeGreaterThan(0.6);
    });
  }

  it('geniş ekranda eski sabit açıdan daha çok doldurur', () => {
    const aspect = 1920 / 1080;
    const box = frameBox(plan, aspect);
    const f = frameOffice(box, FOV, aspect);
    // Eski kadraj (sabit ~35°) bu oranda ekranın ~%80'ini dolduruyordu.
    expect(f.coverage).toBeGreaterThan(0.9);
  });

  it('dar ekranda yalnızca çalışma alanı kadraja alınır', () => {
    const box = frameBox(plan, 390 / 844);
    expect(box.x1 - box.x0).toBeLessThan(plan.width);
    expect(frameBox(plan, 1.6).x1 - frameBox(plan, 1.6).x0).toBeGreaterThan(plan.width);
  });

  it('aynı girdi → aynı kadraj', () => {
    const box = frameBox(plan, 1.6);
    const a = frameOffice(box, FOV, 1.6);
    const b = frameOffice(box, FOV, 1.6);
    expect(a.pos.toArray()).toEqual(b.pos.toArray());
    expect(a.target.toArray()).toEqual(b.target.toArray());
  });
});
