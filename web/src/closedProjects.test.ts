import { describe, expect, it } from 'vitest';
import type { Agent, OfficeSnapshot } from '../../shared/types.ts';
import {
  closeTime,
  closedProjectList,
  closedProjectSet,
  isProjectClosed,
  openSnapshot,
  reopenedProjects,
  shownAgents,
  withoutClosed,
} from './closedProjects.ts';
import {
  CLOSED_PROJECTS_MAX,
  parseClosedProjects,
  parseSettings,
  withClosedProject,
  withoutClosedProjects,
} from './settings.ts';
import { ALL_PROJECTS, projectsOf, resolveView } from './view.ts';

function agent(id: string, project: string, at: number, extra: Partial<Agent> = {}): Agent {
  return {
    id,
    name: id,
    project,
    kind: 'session',
    role: 'lead',
    status: 'idle',
    lastActivityAt: at,
    recent: [],
    ...extra,
  };
}

const agents: Agent[] = [
  agent('atlas-1', 'Atlas', 100),
  agent('atlas-2', 'Atlas', 300, { role: 'designer' }),
  agent('nova-1', 'Nova', 500),
  agent('pusula-1', 'Pusula', 200, { status: 'offline' }),
];

const snap = (list: Agent[]): OfficeSnapshot => ({
  agents: list,
  teams: [
    { project: 'Atlas', members: [{ name: 'tasarimci', role: 'designer' }] },
    { project: 'Nova', members: [] },
  ],
  letters: [],
  now: 1000,
});

describe('parseClosedProjects', () => {
  it('geçerli kayıtları alır', () => {
    expect(parseClosedProjects({ Atlas: 100, Nova: 2.5 })).toEqual({ Atlas: 100, Nova: 2.5 });
  });

  it('bozuk girdide boş döner', () => {
    expect(parseClosedProjects(undefined)).toEqual({});
    expect(parseClosedProjects(null)).toEqual({});
    expect(parseClosedProjects('Atlas')).toEqual({});
    expect(parseClosedProjects(42)).toEqual({});
    expect(parseClosedProjects(['Atlas'])).toEqual({});
  });

  it('geçersiz zamanları ve adları atar', () => {
    expect(
      parseClosedProjects({
        Atlas: 0,
        Nova: -5,
        Pusula: Number.NaN,
        A: Number.POSITIVE_INFINITY,
        B: '100',
        C: null,
        D: {},
        '': 100,
        Tamam: 1,
      }),
    ).toEqual({ Tamam: 1 });
  });

  it('ad sınırı 80 karakter', () => {
    const ok = 'a'.repeat(80);
    const tooLong = 'b'.repeat(81);
    expect(parseClosedProjects({ [ok]: 1, [tooLong]: 1 })).toEqual({ [ok]: 1 });
  });

  it('en fazla 200 kayıt; fazlasında en eski kapatılanlar atılır', () => {
    const raw: Record<string, number> = {};
    for (let i = 1; i <= CLOSED_PROJECTS_MAX + 5; i++) raw[`p${i}`] = i;
    const parsed = parseClosedProjects(raw);
    expect(Object.keys(parsed)).toHaveLength(CLOSED_PROJECTS_MAX);
    for (let i = 1; i <= 5; i++) expect(parsed).not.toHaveProperty(`p${i}`);
    expect(parsed).toHaveProperty('p6', 6);
    expect(parsed).toHaveProperty(`p${CLOSED_PROJECTS_MAX + 5}`);
    // Tam sınırda hiçbir şey atılmaz.
    const exact: Record<string, number> = {};
    for (let i = 1; i <= CLOSED_PROJECTS_MAX; i++) exact[`p${i}`] = i;
    expect(Object.keys(parseClosedProjects(exact))).toHaveLength(CLOSED_PROJECTS_MAX);
  });

  it('ayarlarla birlikte okunur ve saklanıp geri okunabilir', () => {
    expect(parseSettings(null).closedProjects).toEqual({});
    expect(parseSettings('{"closedProjects":"bozuk"}').closedProjects).toEqual({});
    const s = parseSettings('{"closedProjects":{"Atlas":123,"Nova":"x"}}');
    expect(s.closedProjects).toEqual({ Atlas: 123 });
    expect(parseSettings(JSON.stringify(s)).closedProjects).toEqual({ Atlas: 123 });
  });
});

describe('kapatma ve geri getirme kayıtları', () => {
  it('ekler, günceller ve sınırı korur', () => {
    expect(withClosedProject({}, 'Atlas', 10)).toEqual({ Atlas: 10 });
    expect(withClosedProject({ Atlas: 10 }, 'Atlas', 20)).toEqual({ Atlas: 20 });
    const full: Record<string, number> = {};
    for (let i = 1; i <= CLOSED_PROJECTS_MAX; i++) full[`p${i}`] = i;
    const next = withClosedProject(full, 'Atlas', 10_000);
    expect(Object.keys(next)).toHaveLength(CLOSED_PROJECTS_MAX);
    expect(next).toHaveProperty('Atlas', 10_000);
    expect(next).not.toHaveProperty('p1');
  });

  it('geri getirince kaydı siler; değişiklik yoksa aynı nesne', () => {
    const closed = { Atlas: 1, Nova: 2 };
    expect(withoutClosedProjects(closed, ['Atlas'])).toEqual({ Nova: 2 });
    expect(withoutClosedProjects(closed, ['Atlas', 'Nova'])).toEqual({});
    expect(withoutClosedProjects(closed, ['Pusula'])).toBe(closed);
  });
});

describe('isProjectClosed', () => {
  it('kayıt yoksa açık', () => {
    expect(isProjectClosed(agents, 'Atlas', undefined)).toBe(false);
  });

  it('kapatıldıktan sonra etkinlik yoksa kapalı', () => {
    expect(isProjectClosed(agents, 'Atlas', 300)).toBe(true);
    expect(isProjectClosed(agents, 'Atlas', 1000)).toBe(true);
  });

  it('kapatıldıktan sonra yeni etkinlik olursa kendiliğinden geri gelir', () => {
    expect(isProjectClosed(agents, 'Atlas', 299)).toBe(false);
    const later = [...agents, agent('atlas-3', 'Atlas', 1001)];
    expect(isProjectClosed(later, 'Atlas', 1000)).toBe(false);
    // Başka projenin etkinliği saymaz.
    expect(isProjectClosed(agents, 'Pusula', 250)).toBe(true);
  });

  it('anlık görüntüde olmayan proje kapalı kalır', () => {
    expect(isProjectClosed(agents, 'Kayip', 1)).toBe(true);
  });

  it('geri gelen projeler ayrılır', () => {
    expect(reopenedProjects(agents, { Atlas: 1000, Nova: 400, Kayip: 1 })).toEqual(['Nova']);
    expect([...closedProjectSet(agents, { Atlas: 1000, Nova: 400 })]).toEqual(['Atlas']);
  });
});

describe('ortak filtre', () => {
  it('kapalı projelerin ajanlarını çıkarır; kapalı proje yoksa aynı dizi', () => {
    expect(withoutClosed(agents, {})).toBe(agents);
    expect(withoutClosed(agents, { Atlas: 1000 }).map((a) => a.id)).toEqual(['nova-1', 'pusula-1']);
  });

  it('kapalı projeleri ve "Kapalıları gizle"yi birlikte uygular', () => {
    expect(
      shownAgents(agents, { hideOffline: false, closedProjects: { Atlas: 1000 } }).map((a) => a.id),
    ).toEqual(['nova-1', 'pusula-1']);
    expect(
      shownAgents(agents, { hideOffline: true, closedProjects: { Atlas: 1000 } }).map((a) => a.id),
    ).toEqual(['nova-1']);
  });

  it('anlık görüntüden kapalı projeleri, ekipleri ve rolleri çıkarır', () => {
    const s = snap(agents);
    expect(openSnapshot(s, {})).toBe(s);
    expect(openSnapshot(null, { Atlas: 1 })).toBeNull();
    const open = openSnapshot(s, { Atlas: 1000 })!;
    expect(projectsOf(open)).toEqual(['Nova', 'Pusula']);
    expect(open.teams.map((t) => t.project)).toEqual(['Nova']);
    // Tasarımcı rolü yalnızca kapalı Atlas'ta vardı.
    expect(open.agents.some((a) => a.role === 'designer')).toBe(false);
  });

  it('kapatılanlar listesi: yalnızca görüntüdekiler, en son kapatılan başta', () => {
    expect(closedProjectList(agents, { Atlas: 1000, Pusula: 2000, Kayip: 3000, Nova: 400 })).toEqual([
      { project: 'Pusula', closedAt: 2000 },
      { project: 'Atlas', closedAt: 1000 },
    ]);
  });

  it('kapatma anı projenin son etkinliğinden önce olmaz', () => {
    expect(closeTime(agents, 'Atlas', 1000)).toBe(1000);
    expect(closeTime(agents, 'Atlas', 250)).toBe(300);
    expect(isProjectClosed(agents, 'Atlas', closeTime(agents, 'Atlas', 250))).toBe(true);
  });
});

describe('görünüm geri düşüşü', () => {
  it('hatırlanan proje kapatılınca en son etkin açık projeye düşer', () => {
    const s = snap(agents);
    expect(resolveView('Nova', s)).toEqual({ kind: 'project', project: 'Nova' });
    expect(resolveView('Nova', openSnapshot(s, { Nova: 1000 }))).toEqual({
      kind: 'project',
      project: 'Atlas',
    });
    // Otomatik seçim de kapalı projeyi atlar.
    expect(resolveView(null, openSnapshot(s, { Nova: 1000 }))).toEqual({ kind: 'project', project: 'Atlas' });
  });

  it('tüm projeler kapalıysa "Tüm projeler"; o seçim de korunur', () => {
    const s = snap(agents);
    const all = { Atlas: 1000, Nova: 1000, Pusula: 1000 };
    expect(resolveView('Atlas', openSnapshot(s, all))).toEqual({ kind: 'all' });
    expect(resolveView(null, openSnapshot(s, all))).toEqual({ kind: 'all' });
    expect(resolveView(ALL_PROJECTS, openSnapshot(s, all))).toEqual({ kind: 'all' });
  });

  it('yeni etkinlikle geri gelen proje yeniden seçilebilir', () => {
    const later = [...agents, agent('nova-2', 'Nova', 1500)];
    expect(resolveView('Nova', openSnapshot(snap(later), { Nova: 1000 }))).toEqual({
      kind: 'project',
      project: 'Nova',
    });
  });
});
