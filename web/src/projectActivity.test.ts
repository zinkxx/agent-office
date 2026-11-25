import { describe, expect, it } from 'vitest';
import type { Agent } from '../../shared/types.ts';
import { projectDisplayName, projectOverview } from './projectActivity.ts';

function agent(p: Partial<Agent> & Pick<Agent, 'id' | 'project'>): Agent {
  return {
    name: p.id,
    kind: 'session',
    role: 'lead',
    status: 'idle',
    lastActivityAt: 0,
    recent: [],
    ...p,
  };
}

const agents: Agent[] = [
  agent({
    id: 'atlas-1',
    project: 'Atlas',
    status: 'writing',
    lastActivityAt: 300,
    recent: [
      { tool: 'Edit', file: 'tema.ts', at: 300 },
      { tool: 'Read', file: 'tema.ts', at: 100 },
    ],
  }),
  agent({
    id: 'atlas-2',
    project: 'Atlas',
    lastActivityAt: 150,
    recent: [{ tool: 'Bash', at: 150 }],
  }),
  agent({
    id: 'yardimci',
    project: 'Atlas',
    kind: 'subagent',
    role: 'tester',
    parentId: 'atlas-1',
    status: 'terminal',
    lastActivityAt: 250,
    recent: [
      { tool: 'Bash', at: 250 },
      { tool: 'Bash', at: 250 },
    ],
  }),
  agent({ id: 'nova-1', project: 'Nova', recent: [{ tool: 'Edit', at: 999 }], lastActivityAt: 999 }),
];

describe('projectOverview', () => {
  it('yalnızca seçilen projenin ajanlarını alır ve işlemleri en yeni başta birleştirir', () => {
    const o = projectOverview(agents, 'Atlas');
    expect(o.items.map((i) => `${i.agentId}:${i.activity.at}`)).toEqual([
      'atlas-1:300',
      'yardimci:250',
      'atlas-2:150',
      'atlas-1:100',
    ]);
    expect(o.items.some((i) => i.agentId === 'nova-1')).toBe(false);
  });

  it('oturumları ve yardımcıları ayırır, çalışanları sayar', () => {
    const o = projectOverview(agents, 'Atlas');
    expect(o.sessions.map((a) => a.id)).toEqual(['atlas-1', 'atlas-2']);
    expect(o.helpers.map((a) => a.id)).toEqual(['yardimci']);
    expect(o.working).toBe(2);
    expect(o.lastActivityAt).toBe(300);
  });

  it('sınırı uygular', () => {
    expect(projectOverview(agents, 'Atlas', 2).items).toHaveLength(2);
  });

  it('klasörsüz oturumda klasör adı yerine en son oturumun başlığını gösterir', () => {
    const scratch = 'scratch-2026-01-02-ab12cd';
    const list = [
      agent({ id: 'eski', project: scratch, title: 'Eski iş', lastActivityAt: 10 }),
      agent({ id: 'yeni', name: 'nova-7', project: scratch, title: 'Tema düzeni', lastActivityAt: 20 }),
    ];
    expect(projectDisplayName(list, scratch)).toBe('Tema düzeni');
    // Başlıklar kapalıyken zaten görünen oturum adı kullanılır.
    expect(projectDisplayName(list, scratch, false)).toBe('nova-7');
    expect(projectDisplayName([agent({ id: 'x', name: ' ', project: scratch })], scratch)).toBe(scratch);
    expect(projectDisplayName(agents, 'Atlas')).toBe('Atlas');
  });

  it('bilinmeyen proje boş özet verir', () => {
    const o = projectOverview(agents, 'Pusula');
    expect(o.sessions).toEqual([]);
    expect(o.items).toEqual([]);
    expect(o.lastActivityAt).toBe(0);
  });
});
