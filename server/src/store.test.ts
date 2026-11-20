import { describe, expect, it } from 'vitest';
import type { LiveSession } from './sessions.ts';
import {
  OFFLINE_VISIBLE_MS,
  OfficeStore,
  SUBAGENT_LINGER_MS,
  SUBAGENT_STALE_MS,
  statusForTool,
} from './store.ts';

const T0 = Date.parse('2026-11-19T10:00:00Z');
const live = (over: Partial<LiveSession> = {}): LiveSession => ({
  pid: 1,
  sessionId: 's1',
  name: 'atlas-1',
  cwd: '/x/Atlas',
  entrypoint: 'cli',
  status: 'busy',
  ...over,
});

function setup() {
  let now = T0;
  const store = new OfficeStore(() => now);
  return { store, tick: (ms: number) => (now += ms), at: (s: number) => T0 + s * 1000 };
}

describe('OfficeStore', () => {
  it('araç olaylarını duruma ve dosya adına çevirir', () => {
    const { store, at } = setup();
    store.setLiveSessions([live()]);
    store.ingest(
      { sessionId: 's1' },
      { events: [{ kind: 'tool', tool: 'Edit', file: 'a.dart', at: at(1) }] },
    );
    const agent = store.snapshot().agents[0]!;
    expect(agent).toMatchObject({ name: 'atlas-1', project: 'Atlas', status: 'writing' });
    expect(agent.current).toEqual({ tool: 'Edit', file: 'a.dart', at: at(1) });
  });

  it('sıra bitince boşta; süreç boşta diyorsa boşta', () => {
    const { store, at } = setup();
    store.setLiveSessions([live({ status: 'idle' })]);
    store.ingest({ sessionId: 's1' }, { events: [{ kind: 'tool', tool: 'Bash', at: at(1) }] });
    expect(store.snapshot().agents[0]!.status).toBe('idle');
    store.setLiveSessions([live({ status: 'busy' })]);
    store.ingest({ sessionId: 's1' }, { events: [{ kind: 'turn-end', at: at(2) }] });
    expect(store.snapshot().agents[0]!.status).toBe('thinking'); // süreç hâlâ meşgul
  });

  it('soru sorarken süreç boşta olsa da "seni bekliyor" kalır', () => {
    const { store, at } = setup();
    store.setLiveSessions([live({ status: 'idle' })]);
    store.ingest({ sessionId: 's1' }, { events: [{ kind: 'tool', tool: 'AskUserQuestion', at: at(1) }] });
    expect(store.snapshot().agents[0]!.status).toBe('asking');
  });

  it('eski olay yeni durumu ezmez ama geçmişe eklenir', () => {
    const { store, at } = setup();
    store.setLiveSessions([live()]);
    store.ingest(
      { sessionId: 's1' },
      { events: [{ kind: 'tool', tool: 'Read', file: 'yeni.ts', at: at(10) }] },
    );
    store.ingest({ sessionId: 's1' }, { events: [{ kind: 'tool', tool: 'Bash', at: at(5) }] });
    const agent = store.snapshot().agents[0]!;
    expect(agent.status).toBe('reading');
    expect(agent.recent.map((r) => r.tool)).toEqual(['Read', 'Bash']);
  });

  it('alt ajan ana oturuma bağlı doğar, işi bitince bir süre sonra ayrılır', () => {
    const { store, tick, at } = setup();
    store.setLiveSessions([live()]);
    store.ingest(
      { sessionId: 's1', agentId: 'a1', label: 'Testleri incele' },
      {
        events: [{ kind: 'tool', tool: 'Grep', at: at(1) }],
      },
    );
    let sub = store.snapshot().agents.find((a) => a.kind === 'subagent');
    expect(sub).toMatchObject({
      name: 'Testleri incele',
      parentId: 's1',
      status: 'searching',
      project: 'Atlas',
    });
    store.ingest({ sessionId: 's1', agentId: 'a1' }, { events: [{ kind: 'turn-end', at: at(2) }] });
    tick(SUBAGENT_LINGER_MS + 5_000);
    sub = store.snapshot().agents.find((a) => a.kind === 'subagent');
    expect(sub).toBeUndefined();
  });

  it('mesaj gönderilince alıcıya mektup oluşur', () => {
    const { store, at } = setup();
    store.setLiveSessions([live(), live({ pid: 2, sessionId: 's2', name: 'nova-2', cwd: '/x/Nova' })]);
    store.ingest(
      { sessionId: 's1' },
      { events: [{ kind: 'tool', tool: 'SendMessage', to: 'nova-2', at: at(1) }] },
    );
    const snap = store.snapshot();
    expect(snap.letters).toEqual([{ id: 'l1', fromId: 's1', toName: 'nova-2', toId: 's2', at: at(1) }]);
    expect(snap.agents.find((a) => a.id === 's1')!.status).toBe('messaging');
  });

  it('kapanan oturum sönük kalır, sonra gizlenir; alt ajanları da kapanır', () => {
    const { store, tick, at } = setup();
    store.setLiveSessions([live()]);
    store.ingest({ sessionId: 's1' }, { events: [{ kind: 'tool', tool: 'Read', at: at(0) }] });
    store.ingest({ sessionId: 's1', agentId: 'a1' }, { events: [{ kind: 'tool', tool: 'Read', at: at(0) }] });
    store.setLiveSessions([]);
    const snap = store.snapshot();
    expect(snap.agents.map((a) => a.status)).toEqual(['offline', 'offline']);
    tick(OFFLINE_VISIBLE_MS + 1);
    expect(store.snapshot().agents).toEqual([]);
  });

  it('hata durumu kısa sürer', () => {
    const { store, tick, at } = setup();
    store.setLiveSessions([live()]);
    store.ingest({ sessionId: 's1' }, { events: [{ kind: 'error', at: at(0) }] });
    expect(store.snapshot().agents[0]!.status).toBe('error');
    tick(10_000);
    expect(store.snapshot().agents[0]!.status).toBe('thinking'); // meşgul süreç → düşünüyor
  });

  it('araç → durum eşlemesi', () => {
    expect(statusForTool('Read')).toBe('reading');
    expect(statusForTool('Write')).toBe('writing');
    expect(statusForTool('Glob')).toBe('searching');
    expect(statusForTool('Bash')).toBe('terminal');
    expect(statusForTool('Agent')).toBe('delegating');
    expect(statusForTool('SendMessage')).toBe('messaging');
    expect(statusForTool('mcp__bir__arac')).toBe('working');
  });

  it('rolleri hesaplar: lider, ekip listesi, davranış', () => {
    const { store, at } = setup();
    store.setLiveSessions([live()]);
    store.setTeam('Atlas', [{ name: 'kahraman', role: 'designer' }]);
    store.ingest({ sessionId: 's1' }, { events: [{ kind: 'tool', tool: 'Read', at: at(0) }] });
    store.ingest(
      { sessionId: 's1', agentId: 'a1', agentType: 'kahraman' },
      { events: [{ kind: 'tool', tool: 'Bash', test: true, at: at(1) }] },
    );
    store.ingest(
      { sessionId: 's1', agentId: 'a2', agentType: 'general-purpose' },
      {
        events: [
          { kind: 'tool', tool: 'Bash', test: true, at: at(2) },
          { kind: 'tool', tool: 'Edit', file: 'a.test.ts', test: true, at: at(3) },
          { kind: 'tool', tool: 'Read', at: at(4) },
        ],
      },
    );
    const snap = store.snapshot();
    const role = (id: string) => snap.agents.find((a) => a.id === id)!.role;
    expect(role('s1')).toBe('lead');
    expect(role('a1')).toBe('designer');
    expect(role('a2')).toBe('tester');
    expect(snap.agents.find((a) => a.id === 'a1')).toMatchObject({ agentType: 'kahraman', startedAt: at(1) });
    expect(snap.teams).toEqual([{ project: 'Atlas', members: [{ name: 'kahraman', role: 'designer' }] }]);
    expect(JSON.stringify(snap)).not.toContain('stats');
  });

  it('ekip listesi yalnızca görünen projeler için gönderilir', () => {
    const { store } = setup();
    store.setTeam('Gizlenmis', [{ name: 'x', role: 'other' }]);
    expect(store.snapshot().teams).toEqual([]);
  });
});

describe('alt ajanın işi bitirmesi', () => {
  it('lidere rapor aracıyla dönen alt ajan "işini bitirdi" sayılır', () => {
    const { store, at } = setup();
    store.setLiveSessions([live()]);
    store.ingest(
      { sessionId: 's1', agentId: 'a1', label: 'Geliştirici: iş' },
      {
        events: [
          { kind: 'tool', tool: 'Edit', file: 'x.ts', at: at(1) },
          { kind: 'tool', tool: 'SubagentHandback', at: at(2) },
        ],
      },
    );
    const sub = store.snapshot().agents.find((a) => a.kind === 'subagent')!;
    expect(sub.status).toBe('idle');
    expect(sub.current).toBeUndefined();
  });

  it('uzun süre iz bırakmayan alt ajan bitmiş sayılır, sonra ofisten ayrılır', () => {
    const { store, tick, at } = setup();
    store.setLiveSessions([live()]);
    store.ingest(
      { sessionId: 's1', agentId: 'a1', label: 'Testçi: ölçüm' },
      { events: [{ kind: 'tool', tool: 'Bash', at: at(1) }] },
    );
    tick(60_000);
    expect(store.snapshot().agents.find((a) => a.kind === 'subagent')!.status).toBe('terminal');
    tick(SUBAGENT_STALE_MS);
    expect(store.snapshot().agents.find((a) => a.kind === 'subagent')!.status).toBe('idle');
    tick(SUBAGENT_LINGER_MS);
    expect(store.snapshot().agents.find((a) => a.kind === 'subagent')).toBeUndefined();
  });
});
