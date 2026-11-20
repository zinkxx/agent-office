import { describe, expect, it } from 'vitest';
import type { Agent } from '../../../shared/types.ts';
import { activityText, agoText, groupByProject, STATUS_LABEL } from '../labels.ts';
import { parseServerMessage } from '../store.ts';
import { computeLayout, MAX_VISIBLE_SUBAGENTS, positionOf } from './layout.ts';

function agent(id: string, project: string, extra: Partial<Agent> = {}): Agent {
  return {
    id,
    name: id,
    project,
    kind: 'session',
    role: 'lead',
    status: 'idle',
    lastActivityAt: 0,
    recent: [],
    ...extra,
  };
}
const sub = (id: string, parentId: string, project: string) =>
  agent(id, project, { kind: 'subagent', parentId });

describe('groupByProject', () => {
  it('projelere ayırır, yardımcıları ana oturumun altına koyar, sıralar', () => {
    const groups = groupByProject([
      agent('nova-1', 'Nova'),
      sub('y1', 'atlas-b', 'Atlas'),
      agent('atlas-b', 'Atlas'),
      agent('atlas-a', 'Atlas'),
      sub('y2', 'kayip', 'Atlas'),
    ]);
    expect(groups.map((g) => g.project)).toEqual(['Atlas', 'Nova']);
    expect(groups[0]!.sessions.map((s) => s.agent.id)).toEqual(['atlas-a', 'atlas-b']);
    expect(groups[0]!.sessions[1]!.subagents.map((s) => s.id)).toEqual(['y1']);
    expect(groups[0]!.orphans.map((s) => s.id)).toEqual(['y2']);
  });
});

describe('computeLayout', () => {
  const agents = [
    agent('a', 'Atlas'),
    agent('b', 'Atlas'),
    agent('c', 'Atlas'),
    agent('d', 'Atlas'),
    agent('l', 'Nova'),
    ...Array.from({ length: MAX_VISIBLE_SUBAGENTS + 3 }, (_, i) => sub(`s${i}`, 'a', 'Atlas')),
  ];
  const layout = computeLayout(agents);

  it('her proje için bir ada, her ana oturum için bir masa', () => {
    expect(layout.islands.map((i) => i.project)).toEqual(['Atlas', 'Nova']);
    expect(layout.desks).toHaveLength(5);
  });

  it('masalar kendi adasının içinde ve üst üste binmiyor', () => {
    for (const d of layout.desks) {
      const island = layout.islands.find((i) => i.project === d.project)!;
      expect(Math.abs(d.x - island.x)).toBeLessThan(island.w / 2);
      expect(Math.abs(d.z - island.z)).toBeLessThan(island.d / 2);
    }
    const keys = new Set(layout.desks.map((d) => `${d.x.toFixed(2)},${d.z.toFixed(2)}`));
    expect(keys.size).toBe(layout.desks.length);
  });

  it('adalar çakışmıyor', () => {
    const [a, b] = layout.islands;
    const apart = Math.abs(a!.x - b!.x) >= (a!.w + b!.w) / 2 || Math.abs(a!.z - b!.z) >= (a!.d + b!.d) / 2;
    expect(apart).toBe(true);
  });

  it('fazla yardımcıları sayar, yalnızca sınır kadarını çizer', () => {
    expect(layout.subs).toHaveLength(MAX_VISIBLE_SUBAGENTS);
    expect(layout.hiddenSubs.get('a')).toBe(3);
    expect(positionOf(layout, 's0')).toBeDefined();
    expect(positionOf(layout, 'yok')).toBeUndefined();
  });

  it('boş ofiste çökmez', () => {
    const empty = computeLayout([]);
    expect(empty.islands).toEqual([]);
    expect(empty.bounds.maxX).toBeGreaterThan(empty.bounds.minX);
  });
});

describe('etiketler', () => {
  it('işlem metni dosya adını gösterir, istenirse gizler', () => {
    expect(activityText({ tool: 'Edit', file: 'pressable.dart', at: 0 })).toBe('Edit · pressable.dart');
    expect(activityText({ tool: 'Edit', file: 'pressable.dart', at: 0 }, true)).toBe('Edit');
    expect(activityText(undefined)).toBeUndefined();
  });
  it('durumlar Türkçe', () => {
    expect(STATUS_LABEL.asking).toBe('seni bekliyor');
    expect(STATUS_LABEL.terminal).toBe('terminalde');
  });
  it('geçen süre', () => {
    expect(agoText(0, 10_000)).toBe('az önce');
    expect(agoText(0, 5 * 60_000)).toBe('5 dk önce');
  });
});

describe('parseServerMessage', () => {
  it('geçerli anlık görüntüyü alır, gerisini yok sayar', () => {
    const snap = { agents: [], teams: [], letters: [], now: 1 };
    expect(parseServerMessage(JSON.stringify({ type: 'snapshot', snapshot: snap }))).toEqual(snap);
    expect(parseServerMessage('bozuk')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'baska' }))).toBeNull();
    expect(parseServerMessage(42)).toBeNull();
  });
});
