import { describe, expect, it } from 'vitest';
import type { Agent, Letter, OfficeSnapshot } from '../../shared/types.ts';
import { soundCues } from './sound.ts';

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

function snap(agents: Agent[], letters: Letter[] = []): OfficeSnapshot {
  return { agents, letters, teams: [], now: 0 };
}

const letter = (id: string, toId?: string): Letter => ({
  id,
  fromId: 'a',
  toName: toId ?? 'bilinmeyen',
  at: 0,
  ...(toId ? { toId } : {}),
});

describe('soundCues', () => {
  it('ilk görüntüde ses yok (sayfa açılınca eski durumlar çalmaz)', () => {
    expect(soundCues(null, snap([agent('a', { status: 'asking' })], [letter('m1', 'b')]))).toEqual([]);
  });

  it('beklemeye geçen ajan "ask" çalar; zaten bekleyen tekrar çalmaz', () => {
    expect(soundCues(snap([agent('a')]), snap([agent('a', { status: 'asking' })]))).toEqual(['ask']);
    expect(
      soundCues(snap([agent('a', { status: 'asking' })]), snap([agent('a', { status: 'asking' })])),
    ).toEqual([]);
  });

  it('yeni beliren ajan bekliyor olsa da çalmaz (önceki durumu bilinmiyor)', () => {
    expect(soundCues(snap([]), snap([agent('a', { status: 'asking' })]))).toEqual([]);
  });

  it('işini bitiren yardımcı "done" çalar; oturum boşa düşünce çalmaz', () => {
    const sub = (status: Agent['status']) => agent('s', { kind: 'subagent', role: 'tester', status });
    expect(soundCues(snap([sub('terminal')]), snap([sub('idle')]))).toEqual(['done']);
    expect(soundCues(snap([agent('a')]), snap([agent('a', { status: 'idle' })]))).toEqual([]);
    expect(soundCues(snap([sub('idle')]), snap([sub('idle')]))).toEqual([]);
  });

  it('alıcısı olan yeni mektup "letter" çalar; eski ya da alıcısız mektup çalmaz', () => {
    const prev = snap([], [letter('m1', 'b')]);
    expect(soundCues(prev, snap([], [letter('m1', 'b'), letter('m2', 'c')]))).toEqual(['letter']);
    expect(soundCues(prev, snap([], [letter('m1', 'b')]))).toEqual([]);
    expect(soundCues(prev, snap([], [letter('m1', 'b'), letter('m3')]))).toEqual([]);
  });

  it('aynı anda birden fazla uyarı önem sırasıyla, her biri bir kez', () => {
    const prev = snap([agent('a'), agent('b'), agent('s', { kind: 'subagent', role: 'developer' })]);
    const next = snap(
      [
        agent('a', { status: 'asking' }),
        agent('b', { status: 'asking' }),
        agent('s', { kind: 'subagent', role: 'developer', status: 'idle' }),
      ],
      [letter('m9', 'a')],
    );
    expect(soundCues(prev, next)).toEqual(['ask', 'done', 'letter']);
  });
});
