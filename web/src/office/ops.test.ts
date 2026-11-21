import { describe, expect, it } from 'vitest';
import type { Agent } from '../../../shared/types.ts';
import { roleLabel } from '../labels.ts';
import { buildState, kanbanNotes, opsStats, presence, rackLevel, KANBAN_MAX } from './ops.ts';

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
const sub = (id: string, extra: Partial<Agent> = {}) =>
  agent(id, { kind: 'subagent', role: 'developer', parentId: 'lead', ...extra });

describe('derleme durumu', () => {
  it('hata > seni bekliyor > çalışıyor > sakin', () => {
    expect(buildState([agent('a', { status: 'idle' })])).toBe('quiet');
    expect(buildState([])).toBe('quiet');
    expect(buildState([agent('a'), agent('b', { status: 'idle' })])).toBe('busy');
    expect(buildState([agent('a'), agent('b', { status: 'asking' })])).toBe('asking');
    expect(buildState([agent('a', { status: 'asking' }), sub('s', { status: 'error' })])).toBe('error');
    expect(buildState([agent('a', { status: 'offline' })])).toBe('quiet');
  });
});

describe('duvar panosu', () => {
  it('çalışan/boşta sayıları; çıkmış yardımcılar sayılmaz; son 10 dk işlemleri dakikalara dağılır', () => {
    const now = 60 * 60_000;
    const agents = [
      agent('lead', {
        recent: [
          { tool: 'Edit', at: now - 10_000 },
          { tool: 'Read', at: now - 61_000 },
        ],
      }),
      agent('lead2', { status: 'idle', recent: [{ tool: 'Bash', at: now - 11 * 60_000 }] }),
      sub('s1', { status: 'reading', recent: [{ tool: 'Grep', at: now - 9 * 60_000 - 5 }] }),
      sub('s2', { status: 'idle' }),
    ];
    const s = opsStats(agents, 3, now);
    expect(s.working).toBe(2);
    expect(s.idle).toBe(4); // boştaki oturum + 3 üye
    expect(s.perMinute).toHaveLength(10);
    expect(s.perMinute[9]).toBe(1); // son dakika
    expect(s.perMinute[8]).toBe(1);
    expect(s.perMinute[0]).toBe(1); // 9 dk önce
    expect(s.total).toBe(3); // 11 dk önceki sayılmaz
  });

  it('sunucu ışıkları: kimse çalışmıyorken yavaş, herkes çalışırken tam', () => {
    expect(rackLevel([])).toBeCloseTo(0.15);
    expect(rackLevel([agent('a', { status: 'idle' })])).toBeCloseTo(0.15);
    expect(rackLevel([agent('a'), sub('b')])).toBeCloseTo(1);
    expect(rackLevel([agent('a'), sub('b', { status: 'idle' })])).toBeCloseTo(0.575);
  });
});

describe('kanban', () => {
  it('çalışan "yapılıyor"da, işini bitiren yardımcı "bitti"de; not kimliği aynı kalır', () => {
    const before = kanbanNotes([agent('lead'), sub('s1')]);
    expect(before.filter((n) => n.column === 0)).toHaveLength(3);
    expect(before.find((n) => n.id === 's1')?.column).toBe(1);
    const after = kanbanNotes([agent('lead', { status: 'idle' }), sub('s1', { status: 'idle' })]);
    expect(after.find((n) => n.id === 's1')?.column).toBe(2);
    expect(after.find((n) => n.id === 'lead')).toBeUndefined(); // boştaki oturum panoda yok
  });

  it('sütunlar taşmaz', () => {
    const many = Array.from({ length: 20 }, (_, i) => sub(`s${i}`));
    expect(kanbanNotes(many).filter((n) => n.column === 1)).toHaveLength(KANBAN_MAX);
  });
});

describe('giriş ekranı', () => {
  it('açık oturumlar, çalışan yardımcılar ve boştaki üyeler; çalışan üye bir kez yazılır', () => {
    const members = [
      { name: 'gelistirici', role: 'developer' as const },
      { name: 'testci', role: 'tester' as const },
    ];
    const agents = [
      agent('lead', { name: 'proje-1' }),
      agent('kapali', { status: 'offline' }),
      sub('s1', { agentType: 'gelistirici' }),
      sub('s2', { role: 'researcher' }),
      sub('s3', { status: 'idle' }),
    ];
    const list = presence(agents, members, new Set(['gelistirici']), (r) => roleLabel(r, 'tr'));
    expect(list).toEqual([
      { role: 'lead', label: 'proje-1', working: true },
      { role: 'developer', label: 'gelistirici', working: true },
      { role: 'researcher', label: 'Araştırmacı', working: true },
      { role: 'tester', label: 'testci', working: false },
    ]);
  });
});
