import { describe, expect, it } from 'vitest';
import type { Agent, AgentRole, AgentStatus, Letter, TeamMember } from '../../../../shared/types.ts';
import { buildPlan, seatOf, type OfficePlan } from './plan.ts';
import { OfficeSim, residentId, SOFA_AFTER_MS, type Actor } from './sim.ts';

function agent(id: string, extra: Partial<Agent> = {}): Agent {
  return {
    id,
    name: id,
    project: 'P',
    kind: 'session',
    role: 'lead',
    status: 'writing',
    lastActivityAt: 0,
    recent: [],
    ...extra,
  };
}
const sub = (id: string, role: AgentRole = 'developer', status: AgentStatus = 'writing') =>
  agent(id, { kind: 'subagent', role, parentId: 'lead', status, startedAt: 1 });

/** Sabit tohumlu rastgele. */
function seeded(seed = 1): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

function setup(
  agents: Agent[],
  options: { reducedMotion?: boolean; team?: TeamMember[]; seed?: number } = {},
) {
  const team = options.team ?? [];
  const sim = new OfficeSim({ random: seeded(options.seed), ...options });
  let plan = buildPlan({ project: 'P', agents, team });
  sim.setPlan(plan);
  sim.sync(agents);
  const update = (next: Agent[], letters: Letter[] = []) => {
    plan = buildPlan({ project: 'P', agents: next, team, previous: plan });
    sim.setPlan(plan);
    sim.sync(next, letters);
  };
  const run = (seconds: number, onStep?: () => void) => {
    for (let t = 0; t < seconds; t += 0.05) {
      sim.step(0.05);
      onStep?.();
    }
  };
  return { sim, update, run, plan: () => plan };
}

describe('OfficeSim', () => {
  it('ilk açılışta herkes masasında oturur (giriş animasyonu yok)', () => {
    const { sim, plan } = setup([agent('lead'), sub('s1')]);
    for (const id of ['lead', 's1']) {
      const a = sim.actors.get(id)!;
      const seat = seatOf(plan(), id)!;
      expect(a).toMatchObject({ pose: 'sit', atHome: true, visible: true, x: seat.x, z: seat.z });
    }
  });

  it('kapalı oturum ve işi çoktan bitmiş yardımcı için karakter yok', () => {
    const { sim } = setup([agent('lead', { status: 'offline' }), sub('s1', 'developer', 'idle')]);
    expect(sim.actors.size).toBe(0);
  });

  it('yeni yardımcı kapıdan girer, masasına yürür, oturur; lider gidip iş verir', () => {
    const { sim, update, run, plan } = setup([agent('lead')]);
    update([agent('lead'), sub('s1')]);
    const s1 = sim.actors.get('s1')!;
    expect(s1.script).toBe('enter');
    expect(Math.hypot(s1.x - plan().door.x, s1.z - plan().door.z)).toBeLessThan(0.01);
    const lead = sim.actors.get('lead')!;
    expect(lead.script).toBe('visit');
    let leadBubble = false;
    let subBubble = false;
    let walked = false;
    run(40, () => {
      if (lead.bubble === 'tasks') leadBubble = true;
      if (s1.bubble === 'tasks') subBubble = true;
      if (s1.pose === 'walk') walked = true;
    });
    expect(walked).toBe(true);
    expect(leadBubble).toBe(true);
    expect(subBubble).toBe(true); // yardımcı ayağa kalkıp lidere döndü
    expect(s1).toMatchObject({ atHome: true, pose: 'sit', script: null });
    expect(lead).toMatchObject({ atHome: true, pose: 'sit', script: null });
  });

  it('işini bitiren yardımcı lidere rapor verir (onay balonu), sonra kapıdan çıkar', () => {
    const { sim, update, run } = setup([agent('lead'), sub('s1')]);
    update([agent('lead'), sub('s1', 'developer', 'idle')]);
    const s1 = sim.actors.get('s1')!;
    expect(s1.script).toBe('report');
    let reported = false;
    let leadTurned = false;
    run(60, () => {
      if (s1.bubble === 'check') reported = true;
      if (sim.actors.get('lead')!.bubble === 'check') leadTurned = true;
    });
    expect(reported).toBe(true);
    expect(leadTurned).toBe(true);
    expect(s1).toMatchObject({ gone: true, visible: false });
    // listeden de düşünce silinir
    update([agent('lead')]);
    expect(sim.actors.has('s1')).toBe(false);
  });

  it('aynı projede mesaj: gönderen alıcının masasına yürür, zarf balonu, sonra döner', () => {
    const agents = [agent('lead'), agent('lead2', { name: 'ikinci' })];
    const { sim, update, run, plan } = setup(agents);
    update(agents, [{ id: 'l1', fromId: 'lead', toId: 'lead2', toName: 'ikinci', at: 0 }]);
    const a = sim.actors.get('lead')!;
    expect(a.script).toBe('visit');
    let minDist = Infinity;
    let mail = false;
    const target = seatOf(plan(), 'lead2')!;
    run(30, () => {
      minDist = Math.min(minDist, Math.hypot(a.x - target.x, a.z - target.z));
      if (a.bubble === 'mail' && sim.actors.get('lead2')!.bubble === 'mail') mail = true;
    });
    expect(minDist).toBeLessThan(1.6);
    expect(mail).toBe(true);
    expect(a).toMatchObject({ atHome: true, script: null });
    // aynı mektup ikinci kez oynamaz
    update(agents, [{ id: 'l1', fromId: 'lead', toId: 'lead2', toName: 'ikinci', at: 0 }]);
    expect(a.script).toBeNull();
  });

  it('başka projeye mesaj: yerinden kalkmaz, yalnızca zarf balonu', () => {
    const { sim, update, run } = setup([agent('lead')]);
    update([agent('lead')], [{ id: 'x', fromId: 'lead', toName: 'baska-proje', at: 0 }]);
    run(0.5);
    expect(sim.actors.get('lead')).toMatchObject({ bubble: 'mail', atHome: true });
  });

  it('kapanan oturum kapıdan çıkar', () => {
    const { sim, update, run } = setup([agent('lead')]);
    update([agent('lead', { status: 'offline' })]);
    run(40);
    expect(sim.actors.get('lead')).toMatchObject({ gone: true, visible: false });
  });

  it('boşta: video, oyun, kahve, dinlenme alanı; uzun boşta dinlenme alanına geçer; iş gelince masaya döner', () => {
    const { sim, update, run, plan } = setup([agent('lead')]);
    update([agent('lead', { status: 'idle' })]);
    const a = sim.actors.get('lead')!;
    const scripts = new Set<string>();
    let mug = false;
    run(SOFA_AFTER_MS / 1000 + 10, () => {
      if (a.script) scripts.add(a.script);
      if (a.holding === 'mug') mug = true;
    });
    expect(scripts.size).toBeGreaterThanOrEqual(2);
    if (scripts.has('coffee')) expect(mug).toBe(true);
    // uzun boşta: dinlenme alanında bir yere oturur
    let seated = false;
    for (let t = 0; t < 400 && !seated; t += 0.05) {
      sim.step(0.05);
      seated = a.pose === 'sofa' && a.perch !== null;
    }
    expect(seated).toBe(true);
    const spot = perchSpot(plan(), a.perch!);
    expect(Math.hypot(a.x - spot.x, a.z - spot.z)).toBeLessThan(0.01);

    update([agent('lead', { status: 'writing' })]);
    expect(a.script).toBe('return');
    run(30);
    expect(a).toMatchObject({ atHome: true, pose: 'sit', perch: null, holding: null, pastime: null });
  });

  it('boşta: masada video/oyun, konsolda oyun kolu, deney masasında kurcalama; süre bitince masasına döner', () => {
    const { sim, update, run, plan } = setup([agent('lead')]);
    update([agent('lead', { status: 'idle' })]);
    const a = sim.actors.get('lead')!;
    const pastimes = new Set<string>();
    let controllerOnBeanbag = false;
    run(1200, () => {
      if (a.pastime) pastimes.add(a.pastime);
      if (a.pastime === 'video' || a.pastime === 'pcgame') expect(a.atHome).toBe(true);
      if (a.pastime === 'lab') {
        const spot = plan().zones.tech.labSpot;
        expect(Math.hypot(a.x - spot.x, a.z - spot.z)).toBeLessThan(0.01);
        expect(a).toMatchObject({ pose: 'stand', perch: 'lab:0' });
      }
      if (a.pastime === 'console') {
        expect(a.perch?.startsWith('game:')).toBe(true);
        if (a.holding === 'controller' && a.pose === 'sofa') controllerOnBeanbag = true;
      }
    });
    expect(pastimes).toEqual(new Set(['video', 'pcgame', 'console', 'lab']));
    expect(controllerOnBeanbag).toBe(true);
  });

  it('dinlenme alanında iki kişi aynı yere oturmaz', () => {
    const team = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ name: n, role: 'developer' as const }));
    const { sim, run } = setup([agent('lead', { status: 'idle' })], { team });
    let max = 0;
    run(900, () => {
      const perches = [...sim.actors.values()].filter((x) => x.perch !== null).map((x) => x.perch);
      expect(new Set(perches).size).toBe(perches.length);
      max = Math.max(max, perches.length);
    });
    expect(max).toBeGreaterThanOrEqual(2);
  });

  it('"seni bekliyor": masasında ayağa kalkar, kameraya döner, el sallar', () => {
    const { sim, update, run } = setup([agent('lead')]);
    update([agent('lead', { status: 'asking' })]);
    run(0.2);
    expect(sim.actors.get('lead')).toMatchObject({ pose: 'stand', faceCamera: true, gesture: 'wave' });
    update([agent('lead', { status: 'writing' })]);
    run(0.2);
    expect(sim.actors.get('lead')).toMatchObject({ pose: 'sit', faceCamera: false, gesture: 'none' });
  });

  it('hareketi azalt: yürümez, solup başka yerde belirir; boşta gezinmez', () => {
    const { sim, update, run } = setup([agent('lead')], { reducedMotion: true });
    update([agent('lead'), sub('s1')]);
    const s1 = sim.actors.get('s1')!;
    let walked = false;
    let faded = false;
    run(20, () => {
      if (s1.pose === 'walk' && s1.speed > 0) walked = true;
      if (s1.opacity < 1) faded = true;
    });
    expect(walked).toBe(false);
    expect(faded).toBe(true);
    expect(s1).toMatchObject({ atHome: true, opacity: 1 });

    update([agent('lead', { status: 'idle' }), sub('s1')]);
    run(SOFA_AFTER_MS / 1000 + 60);
    expect(sim.actors.get('lead')).toMatchObject({ atHome: true, script: null });
  });

  it('yürürken engellerden geçmez', () => {
    const { sim, update, plan } = setup([agent('lead')]);
    update([agent('lead'), sub('s1')]);
    const s1 = sim.actors.get('s1')!;
    for (let t = 0; t < 30; t += 0.05) {
      sim.step(0.05);
      if (s1.pose !== 'walk') continue;
      const c = plan().grid.toCell(s1);
      // yürüyen karakter engelli bir karede olmamalı (oturma yeri boş sayılır)
      expect(plan().grid.isFree(c.c, c.r)).toBe(true);
    }
  });

  it('aynı anda rapor veren iki yardımcı liderin yanında ayrı noktalarda durur', () => {
    const { sim, update, run } = setup([agent('lead'), sub('s1'), sub('s2', 'tester')]);
    update([agent('lead'), sub('s1', 'developer', 'idle'), sub('s2', 'tester', 'idle')]);
    const s1 = sim.actors.get('s1')!;
    const s2 = sim.actors.get('s2')!;
    // Yola aynı anda çıktılar: rapor verdikleri yerler farklı olmalı.
    let p1: { x: number; z: number } | null = null;
    let p2: { x: number; z: number } | null = null;
    run(40, () => {
      if (!p1 && s1.bubble === 'check') p1 = { x: s1.x, z: s1.z };
      if (!p2 && s2.bubble === 'check') p2 = { x: s2.x, z: s2.z };
    });
    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect(Math.hypot(p1!.x - p2!.x, p1!.z - p2!.z)).toBeGreaterThan(0.5);
  });

  it('açılışta uzun süredir boşta olan oturum çok geçmeden dinlenme alanına geçer', () => {
    const sim = new OfficeSim({ random: seeded() });
    const agents = [agent('lead', { status: 'idle', lastActivityAt: 0 })];
    sim.setPlan(buildPlan({ project: 'P', agents, team: [] }));
    sim.sync(agents, [], 3 * 3600_000);
    let lounged = false;
    for (let t = 0; t < 120 && !lounged; t += 0.05) {
      sim.step(0.05);
      lounged = sim.actors.get('lead')!.pose === 'sofa';
    }
    expect(lounged).toBe(true);
  });
});

function perchSpot(plan: OfficePlan, key: string) {
  const [kind, i] = key.split(':') as [string, string];
  const list = kind === 'sofa' ? plan.sofaSeats : kind === 'arm' ? plan.armchairSeats : plan.gameSeats;
  return list[Number(i)]!;
}

describe('ekip üyeleri ofiste kalır', () => {
  const team: TeamMember[] = [
    { name: 'gelistirici', role: 'developer' },
    { name: 'testci', role: 'tester' },
  ];
  const member = (id: string, name: string, role: AgentRole, status: AgentStatus = 'writing') =>
    agent(id, { kind: 'subagent', role, parentId: 'lead', status, startedAt: 1, agentType: name });
  const residentOf = (sim: OfficeSim, name: string): Actor | undefined => sim.actors.get(residentId(name));

  it('çalışmayan üye açılışta masasında oturur ve boşta dolaşır', () => {
    const { sim, run, plan } = setup([agent('lead')], { team });
    for (const name of ['gelistirici', 'testci']) {
      const r = residentOf(sim, name)!;
      const seat = plan().seats.find((s) => s.member === name)!;
      expect(r).toMatchObject({ resident: true, status: 'idle', atHome: true, visible: true });
      expect(Math.hypot(r.x - seat.x, r.z - seat.z)).toBeLessThan(0.01);
    }
    const scripts = new Set<string>();
    run(120, () => {
      for (const name of ['gelistirici', 'testci']) {
        const s = residentOf(sim, name)!.script;
        if (s) scripts.add(s);
      }
    });
    expect(scripts.size).toBeGreaterThanOrEqual(2);
  });

  it('üyeye iş gelince aynı karakter masasına döner; iş bitince rapor verir ve ofiste kalır', () => {
    const { sim, update, run } = setup([agent('lead')], { team });
    run(40); // boşta bir yerlere gitmiş olabilir
    const before = residentOf(sim, 'gelistirici')!;
    const at = { x: before.x, z: before.z };
    update([agent('lead'), member('m1', 'gelistirici', 'developer')]);
    expect(residentOf(sim, 'gelistirici')).toBeUndefined();
    const m1 = sim.actors.get('m1')!;
    // kapıdan girmez: olduğu yerde işe döner
    expect(Math.hypot(m1.x - at.x, m1.z - at.z)).toBeLessThan(0.01);
    expect(m1).toMatchObject({ resident: false, member: 'gelistirici', pastime: null });
    run(40);
    expect(m1).toMatchObject({ atHome: true, pose: 'sit', script: null });

    update([agent('lead'), member('m1', 'gelistirici', 'developer', 'idle')]);
    expect(m1.script).toBe('report');
    let reported = false;
    run(60, () => {
      if (m1.bubble === 'check') reported = true;
    });
    expect(reported).toBe(true);
    expect(sim.actors.has('m1')).toBe(false);
    const back = residentOf(sim, 'gelistirici')!;
    expect(back).toMatchObject({ resident: true, visible: true, gone: false });
    // listeden düşse de ofiste kalır
    update([agent('lead')]);
    expect(residentOf(sim, 'gelistirici')).toMatchObject({ visible: true, gone: false });
  });

  it('çalışırken listeden düşen üye çıkmaz, yerinde boşta kalır', () => {
    const { sim, update } = setup([agent('lead'), member('m1', 'testci', 'tester')], { team });
    expect(residentOf(sim, 'testci')).toBeUndefined();
    update([agent('lead')]);
    expect(sim.actors.has('m1')).toBe(false);
    expect(residentOf(sim, 'testci')).toMatchObject({ resident: true, atHome: true });
  });

  it('ekipten çıkarılan üye kapıdan çıkar', () => {
    const { sim, run } = setup([agent('lead')], { team });
    const plan2 = buildPlan({ project: 'P', agents: [agent('lead')], team: [team[0]!] });
    sim.setPlan(plan2);
    sim.sync([agent('lead')]);
    expect(residentOf(sim, 'testci')!.script).toBe('exit');
    run(40);
    expect(residentOf(sim, 'testci')).toMatchObject({ gone: true, visible: false });
    expect(residentOf(sim, 'gelistirici')).toMatchObject({ gone: false });
  });

  it('genel yardımcı (ekip üyesi değil) eskisi gibi kapıdan çıkar', () => {
    const { sim, update, run } = setup([agent('lead'), sub('s1', 'researcher')], { team });
    update([agent('lead'), sub('s1', 'researcher', 'idle')]);
    run(60);
    expect(sim.actors.get('s1')).toMatchObject({ gone: true });
  });

  it('hareketi azalt açıkken üyeler masasında oturur, gezinmez', () => {
    const { sim, run } = setup([agent('lead')], { team, reducedMotion: true });
    run(200);
    expect(residentOf(sim, 'gelistirici')).toMatchObject({ atHome: true, script: null });
  });
});
