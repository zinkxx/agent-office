import { describe, expect, it } from 'vitest';
import type { Agent, AgentRole, TeamMember } from '../../../../shared/types.ts';
import { findPath } from './pathfinding.ts';
import {
  allSeatsReachable,
  buildPlan,
  canPlaceIsland,
  islandArea,
  islandLeftEdge,
  islandRightEdge,
  LAYOUT_SNAP,
  memberFor,
  memberNameMap,
  seatOf,
  snapToLayout,
  visitSpot,
  type OfficePlan,
} from './plan.ts';

function agent(id: string, extra: Partial<Agent> = {}): Agent {
  return {
    id,
    name: id,
    project: 'Atlas',
    kind: 'session',
    role: 'lead',
    status: 'writing',
    lastActivityAt: 0,
    recent: [],
    ...extra,
  };
}
const sub = (id: string, role: AgentRole, agentType?: string, startedAt = 0) =>
  agent(id, { kind: 'subagent', role, parentId: 'lead1', startedAt, ...(agentType ? { agentType } : {}) });

const TEAM: TeamMember[] = [
  { name: 'tasarimci', role: 'designer' },
  { name: 'gelistirici', role: 'developer' },
  { name: 'testci', role: 'tester' },
  { name: 'inceleyici', role: 'reviewer' },
];

function reachable(plan: OfficePlan, to: { x: number; z: number }): boolean {
  return findPath(plan.grid, plan.door, to) !== null;
}

describe('buildPlan', () => {
  const agents = [
    agent('lead1'),
    sub('s1', 'designer', 'tasarimci'),
    sub('s2', 'developer', 'general-purpose'),
    sub('s3', 'researcher', 'Explore'),
  ];
  const plan = buildPlan({ project: 'Atlas', agents, team: TEAM });

  it('lider köşe masasına, ekip üyesi kendi masasına oturur', () => {
    expect(plan.assignment.get('lead1')).toBe('lead-corner:0');
    const designerSeat = seatOf(plan, 's1')!;
    expect(designerSeat.role).toBe('designer');
    expect(designerSeat.member).toBe('tasarimci');
  });

  it('ekip listesindeki her üyenin (çalışmasa da) masası var', () => {
    const members = plan.seats.filter((s) => s.member).map((s) => s.member);
    expect(members.sort()).toEqual(['gelistirici', 'inceleyici', 'tasarimci', 'testci']);
  });

  it('ekip masası olmayan yardımcı, rolünün boş masasına oturur (üye masasına değil)', () => {
    const dev = seatOf(plan, 's2')!;
    expect(dev.role).toBe('developer');
    expect(dev.member).toBeUndefined();
    expect(seatOf(plan, 's3')!.role).toBe('researcher');
  });

  it('kimse aynı masayı paylaşmaz', () => {
    const ids = [...plan.assignment.values()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adalar çakışmaz ve odanın içinde', () => {
    for (const a of plan.islands) {
      expect(islandLeftEdge(a)).toBeGreaterThan(5.5);
      expect(islandRightEdge(a)).toBeLessThan(plan.width - 5.5);
      for (const b of plan.islands) {
        if (a === b) continue;
        const apart =
          islandRightEdge(a) < islandLeftEdge(b) ||
          islandRightEdge(b) < islandLeftEdge(a) ||
          Math.abs(a.z - b.z) > 3;
        expect(apart).toBe(true);
      }
    }
  });

  it('kapıdan her masaya, kahve makinesine, kanepeye ve ziyaret noktalarına yol var', () => {
    for (const s of plan.seats) {
      expect(reachable(plan, s), s.id).toBe(true);
      const v = visitSpot(plan, s);
      expect(reachable(plan, v), `ziyaret ${s.id}`).toBe(true);
      expect(Math.hypot(v.x - s.x, v.z - s.z)).toBeLessThan(1.6);
    }
    expect(reachable(plan, plan.coffee)).toBe(true);
    for (const s of plan.sofaSeats) expect(reachable(plan, s.approach!)).toBe(true);
    for (const s of [...plan.armchairSeats, ...plan.gameSeats])
      expect(reachable(plan, s.approach!), `${s.x},${s.z}`).toBe(true);
  });

  it('teknoloji eşyaları ızgarada engel, ada alanının dışında; deney masasına yol var', () => {
    const t = plan.zones.tech;
    for (const p of [t.dashboard, t.stackLight, t.kanban, t.labBench, t.snackShelf]) {
      const c = plan.grid.toCell(p);
      expect(plan.grid.isFree(c.c, c.r), `${p.x},${p.z}`).toBe(false);
    }
    const sc = plan.grid.toCell({ x: (t.server.x0 + t.server.x1) / 2, z: (t.server.z0 + t.server.z1) / 2 });
    expect(plan.grid.isFree(sc.c, sc.r)).toBe(false);
    const a = plan.area;
    const outside = (x: number, z: number) => x < a.x0 || x > a.x1 || z < a.z0 || z > a.z1;
    for (const [x, z] of [
      [t.server.x1, t.server.z0],
      [t.dashboard.x - 1.25, t.dashboard.z],
      [t.kanban.x + 1, t.kanban.z],
      [t.labBench.x - 1.35, t.labBench.z],
      [t.snackShelf.x + 0.85, t.snackShelf.z],
    ] as const)
      expect(outside(x, z), `${x},${z}`).toBe(true);
    expect(reachable(plan, t.labSpot)).toBe(true);
    expect(reachable(plan, plan.coffee)).toBe(true);
  });

  it('oturma yerleri engelli değil', () => {
    for (const s of plan.seats) {
      const c = plan.grid.toCell(s);
      expect(plan.grid.isFree(c.c, c.r), s.id).toBe(true);
    }
  });
});

describe('DevTechnic ofisi (Sürüm 3)', () => {
  const agents = [agent('lead1'), sub('s1', 'designer', 'tasarimci')];
  const plan = buildPlan({ project: 'Atlas', agents, team: TEAM });
  const z = plan.zones;

  it('marka duvarı arka duvarın ortasında; önünde bitki yok, iki yanında var', () => {
    expect((z.brandWall.x0 + z.brandWall.x1) / 2).toBeCloseTo(plan.width / 2);
    expect(z.brandWall.x1 - z.brandWall.x0).toBeCloseTo(5);
    // marka duvarı toplantı odası ile lider köşesi arasında
    expect(z.brandWall.x0).toBeGreaterThan(z.meeting.x1);
    expect(z.brandWall.x1).toBeLessThan(z.leadCorner.x0);
    const inFront = plan.plants.filter((p) => p.x > z.brandWall.x0 && p.x < z.brandWall.x1 && p.z < 3);
    expect(inFront).toEqual([]);
    const flanks = plan.plants.filter((p) => p.z < 1 && Math.abs(p.x - plan.width / 2) < 3.5);
    expect(flanks).toHaveLength(2);
  });

  it('yeni eşyalar (totem, portmanto, koltuklar, yan sehpa, TV, armut koltuklar) yürüme ızgarasında engel', () => {
    for (const p of [z.totem, z.coatRack, ...z.armchairs, z.sideTable, z.tv, ...z.beanbags]) {
      const c = plan.grid.toCell(p);
      expect(plan.grid.isFree(c.c, c.r), `${p.x},${p.z}`).toBe(false);
    }
  });

  it('yeni eşyalar kapıyı, kahveyi ve kanepeyi kapatmaz', () => {
    expect(allSeatsReachable(plan)).toBe(true);
    for (const s of plan.sofaSeats) expect(reachable(plan, s.approach!)).toBe(true);
    // kalabalık ofiste de (çok ada, oda derinleşir)
    const crowd = buildPlan({
      project: 'Atlas',
      agents: [
        agent('lead1'),
        agent('lead2'),
        ...Array.from({ length: 18 }, (_, i) =>
          sub(
            `c${i}`,
            (['developer', 'designer', 'tester', 'reviewer', 'researcher', 'architect'] as const)[i % 6]!,
          ),
        ),
      ],
      team: TEAM,
    });
    expect(allSeatsReachable(crowd)).toBe(true);
  });

  it('dinlenme koltukları kanepeye bakar ve dinlenme alanının içinde', () => {
    for (const a of z.armchairs) {
      expect(a.heading).toBeCloseTo(Math.PI / 2); // +x: kanepe sağ duvarda
      expect(a.x).toBeGreaterThan(z.lounge.x0);
      expect(a.z).toBeGreaterThan(z.lounge.z0);
      expect(a.z).toBeLessThan(z.lounge.z1);
    }
  });
});

describe('kararlılık', () => {
  it('yeni yardımcı gelince ya da biri gidince diğerlerinin masası değişmez', () => {
    const base = [agent('lead1'), sub('a', 'developer', undefined, 1), sub('b', 'developer', undefined, 2)];
    const p1 = buildPlan({ project: 'X', agents: base, team: [] });
    const p2 = buildPlan({
      project: 'X',
      agents: [agent('lead1'), sub('b', 'developer', undefined, 2), sub('c', 'tester', undefined, 3)],
      team: [],
      previous: p1,
    });
    expect(p2.assignment.get('b')).toBe(p1.assignment.get('b'));
    // var olan adalar yerinde kalır
    for (const isl of p1.islands) {
      const same = p2.islands.find((x) => x.id === isl.id)!;
      expect([same.x, same.z]).toEqual([isl.x, isl.z]);
    }
  });

  it('kalabalık ofis: 2 lider + 18 yardımcı, herkesin masası var', () => {
    const roles: AgentRole[] = ['developer', 'designer', 'tester', 'reviewer', 'researcher', 'architect'];
    const agents = [
      agent('l1'),
      agent('l2'),
      ...Array.from({ length: 18 }, (_, i) => sub(`s${i}`, roles[i % roles.length]!, undefined, i)),
    ];
    const plan = buildPlan({ project: 'X', agents, team: TEAM });
    for (const a of agents) expect(plan.assignment.has(a.id), a.id).toBe(true);
    expect(plan.assignment.get('l2')).toBe('lead-corner:1');
  });

  it("üçüncü lider lider adasına oturur; 8'den fazla aynı rol ikinci adaya taşar", () => {
    const agents = [
      agent('l1'),
      agent('l2'),
      agent('l3'),
      ...Array.from({ length: 10 }, (_, i) => sub(`d${i}`, 'developer', undefined, i)),
    ];
    const plan = buildPlan({ project: 'X', agents, team: [] });
    expect(seatOf(plan, 'l3')!.role).toBe('lead');
    expect(plan.islands.filter((i) => i.role === 'developer')).toHaveLength(2);
    for (const a of agents) expect(plan.assignment.has(a.id)).toBe(true);
  });

  it('boş projede bile en az iki ada', () => {
    const plan = buildPlan({ project: 'X', agents: [agent('l1')], team: [] });
    expect(plan.islands.length).toBeGreaterThanOrEqual(2);
  });
});

describe('düzen (taşınan adalar)', () => {
  const agents = [agent('lead1'), sub('s1', 'designer', 'tasarimci'), sub('s2', 'developer')];
  const base = buildPlan({ project: 'Atlas', agents, team: TEAM });
  const dev = base.islands.find((i) => i.role === 'developer')!;

  it('varsayılan yerleşimde her ada kendi yerinde taşınabilir sayılır', () => {
    for (const isl of base.islands) expect(canPlaceIsland(base, isl.id, isl.x, isl.z), isl.id).toBe(true);
    expect(allSeatsReachable(base)).toBe(true);
  });

  it('geçerli konuma taşınan ada orada durur, masaları ve atamalar onunla gider', () => {
    const area = islandArea(base.width, base.depth);
    const x = snapToLayout(area.x0 + 3);
    const z = snapToLayout(base.depth - 3);
    expect(canPlaceIsland(base, dev.id, x, z)).toBe(true);
    const moved = buildPlan({
      project: 'Atlas',
      agents,
      team: TEAM,
      previous: base,
      layout: { [dev.id]: { x, z } },
    });
    const isl = moved.islands.find((i) => i.id === dev.id)!;
    expect([isl.x, isl.z]).toEqual([x, z]);
    expect(moved.assignment.get('s2')).toBe(base.assignment.get('s2'));
    const seat = seatOf(moved, 's2')!;
    expect(Math.abs(seat.x - x)).toBeLessThan(3);
    expect(allSeatsReachable(moved)).toBe(true);
    expect(moved.shapeKey).not.toBe(base.shapeKey);
  });

  it('oda dışına ya da başka adanın üstüne taşıma reddedilir', () => {
    const other = base.islands.find((i) => i.id !== dev.id)!;
    expect(canPlaceIsland(base, dev.id, other.x, other.z)).toBe(false);
    expect(canPlaceIsland(base, dev.id, 1, 5)).toBe(false); // mutfak/toplantı tarafı
    expect(canPlaceIsland(base, dev.id, dev.x, base.depth + 4)).toBe(false);
    expect(canPlaceIsland(base, 'yok#0', dev.x, dev.z)).toBe(false);
  });

  it('geçersiz kayıtlı konum (oda dışı, bilinmeyen ada) yok sayılır; ada varsayılan yerine döner', () => {
    const p = buildPlan({
      project: 'Atlas',
      agents,
      team: TEAM,
      layout: { [dev.id]: { x: 1, z: 5 }, 'yok#0': { x: 10, z: 10 } },
    });
    const isl = p.islands.find((i) => i.id === dev.id)!;
    expect([isl.x, isl.z]).toEqual([dev.x, dev.z]);
    expect(p.islands.find((i) => i.id === 'yok#0')).toBeUndefined();
  });

  it('taşınan ada başka adanın varsayılan yerine konduysa o ada boş yuvaya kayar (yer değiştirme)', () => {
    const other = base.islands.find((i) => i.id !== dev.id)!;
    const p = buildPlan({
      project: 'Atlas',
      agents,
      team: TEAM,
      layout: { [dev.id]: { x: other.x, z: other.z } },
    });
    const a = p.islands.find((i) => i.id === dev.id)!;
    const b = p.islands.find((i) => i.id === other.id)!;
    expect([a.x, a.z]).toEqual([other.x, other.z]);
    expect([b.x, b.z]).not.toEqual([other.x, other.z]);
    expect(allSeatsReachable(p)).toBe(true);
  });

  it('taşınan adanın eski yerine sonradan gelen yeni ada oturabilir, kimse çakışmaz', () => {
    const area = islandArea(base.width, base.depth);
    const layout = { [dev.id]: { x: snapToLayout(area.x0 + 3), z: snapToLayout(base.depth - 3) } };
    const more = [...agents, sub('t1', 'tester'), sub('r1', 'reviewer'), sub('a1', 'architect')];
    const p = buildPlan({ project: 'Atlas', agents: more, team: TEAM, layout });
    const isl = p.islands.find((i) => i.id === dev.id)!;
    expect([isl.x, isl.z]).toEqual([layout[dev.id]!.x, layout[dev.id]!.z]);
    for (const a of p.islands) expect(canPlaceIsland(p, a.id, a.x, a.z), a.id).toBe(true);
    for (const a of more) expect(p.assignment.has(a.id), a.id).toBe(true);
    expect(allSeatsReachable(p)).toBe(true);
  });
});

describe('düzenleyici ile buildPlan aynı alanı kullanır', () => {
  // 5 ada → 3 sıra; oda derinliği adalara göre büyüdüğünde de "yeşil" gösterilen her yer kabul edilmeli.
  const agents = [
    agent('lead1'),
    sub('d1', 'developer'),
    sub('t1', 'designer'),
    sub('q1', 'tester'),
    sub('r1', 'reviewer'),
    sub('a1', 'architect'),
  ];
  const base = buildPlan({ project: 'Atlas', agents, team: TEAM });

  it('canPlaceIsland true dediği her konumda buildPlan adayı oraya koyar', () => {
    expect(base.islands).toHaveLength(5);
    let checked = 0;
    for (const isl of base.islands) {
      for (let x = snapToLayout(base.area.x0); x <= base.area.x1; x += 1) {
        for (let z = snapToLayout(base.area.z0); z <= base.depth + 1; z += LAYOUT_SNAP) {
          if (!canPlaceIsland(base, isl.id, x, z)) continue;
          checked++;
          const p = buildPlan({
            project: 'Atlas',
            agents,
            team: TEAM,
            previous: base,
            layout: { [isl.id]: { x, z } },
          });
          const moved = p.islands.find((i) => i.id === isl.id)!;
          expect([moved.x, moved.z], `${isl.id} @ ${x},${z}`).toEqual([x, z]);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('ekip üyesinin masası', () => {
  it('genel türdeki yardımcı, iş tanımı üyenin adıyla başlıyorsa üyenin masasına oturur', () => {
    const helper = agent('g1', {
      kind: 'subagent',
      role: 'developer',
      parentId: 'lead1',
      agentType: 'general-purpose',
      name: 'Geliştirici: düşük güç modu',
    });
    const plan = buildPlan({ project: 'Atlas', agents: [agent('lead1'), helper], team: TEAM });
    expect(seatOf(plan, 'g1')!.member).toBe('gelistirici');
  });

  it('ad eşleşse de rol farklıysa üye masasına oturmaz', () => {
    const helper = agent('g2', {
      kind: 'subagent',
      role: 'tester',
      parentId: 'lead1',
      agentType: 'general-purpose',
      name: 'Geliştirici testleri',
    });
    const plan = buildPlan({ project: 'Atlas', agents: [agent('lead1'), helper], team: TEAM });
    expect(seatOf(plan, 'g2')!.member).not.toBe('gelistirici');
  });

  it('Türkçe harfli üye adı: türü de iş tanımı da eşleşir', () => {
    const team: TeamMember[] = [
      { name: 'Geliştirici', role: 'developer' },
      { name: 'tasarımcı', role: 'designer' },
    ];
    const byType = agent('h1', {
      kind: 'subagent',
      role: 'designer',
      parentId: 'lead1',
      agentType: 'tasarımcı',
    });
    const byTask = agent('h2', {
      kind: 'subagent',
      role: 'developer',
      parentId: 'lead1',
      agentType: 'general-purpose',
      name: 'Geliştirici: düşük güç modu',
    });
    const byName = memberNameMap(team);
    expect(memberFor(byType, byName)?.name).toBe('tasarımcı');
    expect(memberFor(byTask, byName)?.name).toBe('Geliştirici');
    const plan = buildPlan({ project: 'Atlas', agents: [agent('lead1'), byType, byTask], team });
    expect(seatOf(plan, 'h1')!.member).toBe('tasarımcı');
    expect(seatOf(plan, 'h2')!.member).toBe('Geliştirici');
  });
});
