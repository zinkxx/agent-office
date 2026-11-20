import { describe, expect, it } from 'vitest';
import type { LiveSession } from './sessions.ts';
import { LETTER_TTL_MS, OFFLINE_VISIBLE_MS, OfficeStore, SUBAGENT_LINGER_MS } from './store.ts';

/**
 * Uzun süre açık kalan sunucunun belleği: olay akışı ne kadar uzarsa uzasın iç yapılar sınırlı kalmalı.
 * İç alanlara yalnızca ölçmek için bakılır.
 */
const T0 = Date.parse('2026-11-19T10:00:00Z');
const live: LiveSession = {
  pid: 1,
  sessionId: 's1',
  name: 'atlas-1',
  cwd: '/x/Atlas',
  entrypoint: 'cli',
  status: 'busy',
};

interface StoreInternals {
  agents: Map<string, { recent: unknown[] }>;
  letters: unknown[];
  sessionsByName: Map<string, Set<string>>;
  teams: Map<string, unknown>;
  dirs: Map<string, string>;
}
const internals = (store: OfficeStore) => store as unknown as StoreInternals;

/** `count` kısa ömürlü alt ajan: her biri 30 işlem yapıp sırasını bitirir, ardından bekleme süresi geçer. */
function runSubagents(count: number) {
  let now = T0;
  const store = new OfficeStore(() => now);
  store.setLiveSessions([live]);
  for (let i = 0; i < count; i++) {
    now += 60_000;
    for (let k = 0; k < 30; k++) {
      store.ingest(
        { sessionId: 's1', agentId: `a${i}`, label: `İş ${i}` },
        { events: [{ kind: 'tool', tool: 'Edit', file: `f${k}.ts`, at: now + k }] },
      );
    }
    store.ingest({ sessionId: 's1', agentId: `a${i}` }, { events: [{ kind: 'turn-end', at: now + 100 }] });
    store.snapshot(); // sunucu her değişiklikte görüntü üretir
  }
  now += SUBAGENT_LINGER_MS + 1_000;
  return { store, tick: (ms: number) => (now += ms), at: () => now };
}

describe('OfficeStore bellek sınırları (uzun akış)', () => {
  it('son işlemler listesi ajan başına RECENT_LIMIT (20) ile sınırlı', () => {
    const { store } = runSubagents(50);
    for (const agent of internals(store).agents.values()) expect(agent.recent.length).toBeLessThanOrEqual(20);
  });

  it('mektuplar süresi dolunca listeden atılır', () => {
    let now = T0;
    const store = new OfficeStore(() => now);
    store.setLiveSessions([live]);
    for (let i = 0; i < 1_000; i++) {
      now += 1_000;
      store.ingest(
        { sessionId: 's1' },
        { events: [{ kind: 'tool', tool: 'SendMessage', to: 'nova-1', at: now }] },
      );
      if (i % 50 === 0) store.snapshot();
    }
    now += LETTER_TTL_MS + 1;
    expect(store.snapshot().letters).toHaveLength(0);
    expect(internals(store).letters).toHaveLength(0);
  });

  it('bitmiş alt ajanlar ekrandan kalkar', () => {
    const { store } = runSubagents(500);
    expect(store.snapshot().agents.map((a) => a.id)).toEqual(['s1']);
  });

  it('gizlenmiş alt ajanlar haritadan da silinir', () => {
    const { store } = runSubagents(500);
    store.snapshot();
    expect(internals(store).agents.size).toBeLessThan(50);
  });

  it('snapshot uzun akışta yavaşlamaz: harita görünen ajan sayısıyla sınırlı kalır', () => {
    const { store } = runSubagents(2_000);
    store.prune();
    expect(internals(store).agents.size).toBe(1);
    expect(internals(store).sessionsByName.size).toBe(1);
  });

  it('kapanıp gizlenen oturum alt ajanları, ad dizini ve proje kayıtlarıyla birlikte silinir', () => {
    let now = T0;
    const store = new OfficeStore(() => now);
    store.setLiveSessions([live]);
    store.setTeam('Atlas', [{ name: 'tasarimci', role: 'designer' }]);
    store.ingest({ sessionId: 's1' }, { events: [{ kind: 'tool', tool: 'Read', at: now }] });
    store.ingest({ sessionId: 's1', agentId: 'a1' }, { events: [{ kind: 'tool', tool: 'Grep', at: now }] });
    store.setLiveSessions([]);
    now += OFFLINE_VISIBLE_MS + 1;
    store.prune();
    const inner = internals(store);
    expect(inner.agents.size).toBe(0);
    expect(inner.sessionsByName.size).toBe(0);
    expect(inner.teams.size).toBe(0);
    expect(inner.dirs.size).toBe(0);
    // Silinen oturumun adına giden mektubun alıcısı artık bilinmez.
    store.setLiveSessions([{ ...live, sessionId: 's2', name: 'nova-2', cwd: '/x/Nova' }]);
    store.ingest(
      { sessionId: 's2' },
      { events: [{ kind: 'tool', tool: 'SendMessage', to: 'atlas-1', at: now }] },
    );
    expect(store.snapshot().letters[0]).not.toHaveProperty('toId');
  });

  it('silinen oturum yeniden açılınca yeniden oluşturulur ve doğru görünür', () => {
    let now = T0;
    const store = new OfficeStore(() => now);
    store.setLiveSessions([live]);
    store.ingest({ sessionId: 's1' }, { project: 'Atlas', events: [{ kind: 'title', title: 'Eski iş' }] });
    store.setLiveSessions([]);
    now += OFFLINE_VISIBLE_MS + 1;
    expect(store.snapshot().agents).toEqual([]);
    expect(internals(store).agents.size).toBe(0);

    now += 60_000;
    store.setLiveSessions([{ ...live, status: 'busy', updatedAt: now }]);
    store.ingest(
      { sessionId: 's1' },
      { project: 'Atlas', events: [{ kind: 'tool', tool: 'Edit', file: 'a.ts', at: now }] },
    );
    store.ingest(
      { sessionId: 's1', agentId: 'a9', label: 'Yeni iş' },
      { events: [{ kind: 'tool', tool: 'Read', at: now }] },
    );
    const snap = store.snapshot();
    expect(snap.agents.map((a) => [a.name, a.status])).toEqual([
      ['atlas-1', 'writing'],
      ['Yeni iş', 'reading'],
    ]);
    expect(snap.agents[0]).toMatchObject({ project: 'Atlas', current: { tool: 'Edit', file: 'a.ts' } });
    expect(store.projectDirs().get('Atlas')).toBe('/x/Atlas');
  });

  it('mektup alıcısı ad dizininden bulunur; ad değişince dizin de güncellenir', () => {
    let now = T0;
    const store = new OfficeStore(() => now);
    const nova: LiveSession = { ...live, pid: 2, sessionId: 's2', name: 'nova-2', cwd: '/x/Nova' };
    store.setLiveSessions([live, nova]);
    store.setLiveSessions([live, { ...nova, name: 'nova-yeni' }]);
    const send = (to: string) =>
      store.ingest(
        { sessionId: 's1' },
        { events: [{ kind: 'tool', tool: 'SendMessage', to, at: (now += 1) }] },
      );
    send('nova-yeni');
    send('nova-2');
    const letters = store.snapshot().letters;
    expect(letters[0]).toMatchObject({ toName: 'nova-yeni', toId: 's2' });
    expect(letters[1]).not.toHaveProperty('toId');
    expect(internals(store).sessionsByName.has('nova-2')).toBe(false);
  });

  it('yeniden okunan (replay) satırlar mektup üretmez', () => {
    const store = new OfficeStore(() => T0);
    store.setLiveSessions([live]);
    store.ingest(
      { sessionId: 's1', agentId: 'a1' },
      { events: [{ kind: 'tool', tool: 'SendMessage', to: 'nova-1', at: T0 }] },
      true,
    );
    const snap = store.snapshot();
    expect(snap.letters).toEqual([]);
    expect(snap.agents.find((a) => a.id === 'a1')!.recent).toHaveLength(1);
  });
});
