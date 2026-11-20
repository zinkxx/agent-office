import { describe, expect, it } from 'vitest';
import type { Agent } from '../../../../shared/types.ts';
import { MascotSim } from './mascot.ts';
import { buildPlan, canPlaceIsland, islandArea, snapToLayout } from './plan.ts';

const lead: Agent = {
  id: 'lead',
  name: 'lead',
  project: 'P',
  kind: 'session',
  role: 'lead',
  status: 'writing',
  lastActivityAt: 0,
  recent: [],
};
const plan = buildPlan({ project: 'P', agents: [lead], team: [] });

/** `seconds` boyunca 1/30 sn adımlarla ilerletir; her adımda konumu yoklar. */
function run(m: MascotSim, seconds: number, each?: (m: MascotSim) => void) {
  for (let i = 0; i < seconds * 30; i++) {
    m.step(1 / 30);
    each?.(m);
  }
}

describe('MascotSim', () => {
  it('kanepenin yanında oturarak başlar', () => {
    const m = new MascotSim(plan, 3);
    expect(m.state.mode).toBe('sit');
    const a = plan.sofaSeats[0]!.approach!;
    expect(Math.hypot(m.state.x - a.x, m.state.z - a.z)).toBeLessThan(0.8);
  });

  it('dinlendikten sonra dolaşır ve hiç engelli hücreye girmez', () => {
    const m = new MascotSim(plan, 7);
    const start = { x: m.state.x, z: m.state.z };
    let walked = false;
    let maxAway = 0;
    run(m, 90, (mm) => {
      if (mm.state.mode === 'walk') walked = true;
      maxAway = Math.max(maxAway, Math.hypot(mm.state.x - start.x, mm.state.z - start.z));
      const c = plan.grid.toCell(mm.state);
      // yol köşeleri kesebilir ama gövde merkezi engelli hücrenin içine girmez
      expect(plan.grid.isFree(c.c, c.r), `${mm.state.x.toFixed(2)},${mm.state.z.toFixed(2)}`).toBe(true);
    });
    expect(walked).toBe(true);
    expect(maxAway).toBeGreaterThan(1.5);
  });

  it('aynı tohum aynı dolaşmayı verir', () => {
    const a = new MascotSim(plan, 11);
    const b = new MascotSim(plan, 11);
    run(a, 40);
    run(b, 40);
    expect([a.state.x, a.state.z]).toEqual([b.state.x, b.state.z]);
  });

  it('hareketi azalt açıkken yerinde oturur', () => {
    const m = new MascotSim(plan, 5);
    m.reducedMotion = true;
    const start = { x: m.state.x, z: m.state.z };
    run(m, 60);
    expect([m.state.x, m.state.z]).toEqual([start.x, start.z]);
    expect(m.state.mode).toBe('sit');
  });

  it('plan değişip olduğu yer engellenirse en yakın boş yere geçer', () => {
    const m = new MascotSim(plan, 9);
    // Maskotu bir adanın konacağı yere koyup adayı oraya taşı.
    const dev = plan.islands[0]!;
    const area = islandArea(plan.width, plan.depth);
    const x = snapToLayout(area.x0 + 3);
    const z = snapToLayout(plan.depth - 3);
    expect(canPlaceIsland(plan, dev.id, x, z)).toBe(true);
    m.state.x = x;
    m.state.z = z + 0.4; // masanın içi
    const moved = buildPlan({ project: 'P', agents: [lead], team: [], layout: { [dev.id]: { x, z } } });
    m.setPlan(moved);
    const c = moved.grid.toCell(m.state);
    expect(moved.grid.isFree(c.c, c.r)).toBe(true);
  });
});
