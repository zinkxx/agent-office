import { describe, expect, it } from 'vitest';
import type { Agent, OfficeSnapshot } from '../../shared/types.ts';
import { durationText } from './labels.ts';
import { ALL_PROJECTS, keepPanelWhileEditing, mostRecentProject, projectsOf, resolveView } from './view.ts';

const agent = (id: string, project: string, at: number): Agent => ({
  id,
  name: id,
  project,
  kind: 'session',
  role: 'lead',
  status: 'idle',
  lastActivityAt: at,
  recent: [],
});
const snap = (agents: Agent[]): OfficeSnapshot => ({ agents, teams: [], letters: [], now: 0 });

describe('görünüm seçimi', () => {
  const s = snap([agent('a', 'Nova', 10), agent('b', 'Atlas', 50), agent('c', 'Nova', 20)]);

  it('projeleri sıralı listeler', () => {
    expect(projectsOf(s)).toEqual(['Atlas', 'Nova']);
    expect(projectsOf(null)).toEqual([]);
  });

  it('varsayılan: en son etkin proje', () => {
    expect(mostRecentProject(s.agents)).toBe('Atlas');
    expect(resolveView(null, s)).toEqual({ kind: 'project', project: 'Atlas' });
  });

  it('hatırlanan seçim geçerliyse o', () => {
    expect(resolveView('Nova', s)).toEqual({ kind: 'project', project: 'Nova' });
    expect(resolveView(ALL_PROJECTS, s)).toEqual({ kind: 'all' });
  });

  it('hatırlanan proje artık yoksa en son etkin proje; hiç ajan yoksa tüm projeler', () => {
    expect(resolveView('Kayip', s)).toEqual({ kind: 'project', project: 'Atlas' });
    expect(resolveView(null, snap([]))).toEqual({ kind: 'all' });
    expect(resolveView(null, null)).toEqual({ kind: 'all' });
  });

  it('çalışma süresi', () => {
    expect(durationText(40_000)).toBe('40 sn');
    expect(durationText(8 * 60_000)).toBe('8 dk');
    expect(durationText(72 * 60_000)).toBe('1 sa 12 dk');
    expect(durationText(120 * 60_000)).toBe('2 sa');
  });
});

describe('düzenleme modunda yan panel', () => {
  it('dar pencerede (< 900 px) kapanır, genişte açık kalabilir', () => {
    expect(keepPanelWhileEditing(375)).toBe(false);
    expect(keepPanelWhileEditing(899)).toBe(false);
    expect(keepPanelWhileEditing(900)).toBe(true);
    expect(keepPanelWhileEditing(1440)).toBe(true);
  });
});
