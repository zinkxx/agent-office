import { describe, expect, it } from 'vitest';
import type { Agent } from '../../shared/types.ts';
import { DEFAULT_SETTINGS, effectiveReducedMotion, parseSettings, visibleAgents } from './settings.ts';

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

describe('parseSettings', () => {
  it('kayıt yoksa varsayılanlar', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('eski "dosya adlarını gizle" anahtarı yeni ayara taşınır', () => {
    expect(parseSettings(null, '1').hideFiles).toBe(true);
    expect(parseSettings(null, '0').hideFiles).toBe(false);
  });

  it('yeni kayıt varsa eski anahtara bakılmaz', () => {
    expect(parseSettings('{"hideFiles":false}', '1').hideFiles).toBe(false);
  });

  it('bozuk kayıt ve yanlış türler varsayılana döner, ses düzeyi 0–1 arasına sıkıştırılır', () => {
    expect(parseSettings('{bozuk')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings(
      JSON.stringify({
        sound: 'evet',
        volume: 7,
        motion: 'hızlı',
        theme: 'gündüz',
        hideOffline: true,
        lowPower: 'evet',
        extra: 1,
      }),
    );
    expect(s.sound).toBe(false);
    expect(s.volume).toBe(1);
    expect(s.motion).toBe('system');
    expect(s.theme).toBe('gece');
    expect(s.hideOffline).toBe(true);
    expect(s.lowPower).toBe(false);
    expect(s).not.toHaveProperty('extra');
    expect(parseSettings('{"volume":-3}').volume).toBe(0);
  });

  it('dil: kayıtlı geçerli dil okunur; yoksa ya da geçersizse tarayıcıya göre varsayılan', () => {
    expect(parseSettings('{"language":"tr"}', null, 'en').language).toBe('tr');
    expect(parseSettings('{"language":"en"}', null, 'tr').language).toBe('en');
    expect(parseSettings('{"language":"de"}', null, 'tr').language).toBe('tr');
    expect(parseSettings('{"language":7}', null, 'en').language).toBe('en');
    expect(parseSettings('{}', null, 'tr').language).toBe('tr');
    expect(parseSettings(null, null, 'tr').language).toBe('tr');
    expect(parseSettings('{bozuk', null, 'en').language).toBe('en');
    expect(parseSettings(null).language).toBe(DEFAULT_SETTINGS.language);
  });

  it('düşük güç modu varsayılan kapalı, kayıtlıysa okunur', () => {
    expect(DEFAULT_SETTINGS.lowPower).toBe(false);
    expect(parseSettings('{}').lowPower).toBe(false);
    expect(parseSettings('{"lowPower":true}').lowPower).toBe(true);
    expect(parseSettings('{"lowPower":1}').lowPower).toBe(false);
  });

  it('geçerli kayıt aynen okunur', () => {
    const saved = {
      ...DEFAULT_SETTINGS,
      sound: true,
      volume: 0.25,
      motion: 'reduce',
      showTitles: false,
      lowPower: true,
    };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });
});

describe('effectiveReducedMotion', () => {
  it('sistem tercihini izler ya da onu ezer', () => {
    expect(effectiveReducedMotion('system', true)).toBe(true);
    expect(effectiveReducedMotion('system', false)).toBe(false);
    expect(effectiveReducedMotion('reduce', false)).toBe(true);
    expect(effectiveReducedMotion('full', true)).toBe(false);
  });
});

describe('visibleAgents', () => {
  const agents = [
    agent('acik'),
    agent('kapali', { status: 'offline' }),
    agent('bos', { status: 'idle' }),
    agent('yardimci', { kind: 'subagent', role: 'developer', parentId: 'acik' }),
    agent('bitti', { kind: 'subagent', role: 'tester', parentId: 'acik', status: 'idle' }),
  ];
  const ids = (list: Agent[]) => list.map((a) => a.id);

  it('kapalı değilse hepsi görünür', () => {
    expect(visibleAgents(agents, false)).toBe(agents);
  });

  it('kapalı oturumlar ve işini bitirmiş yardımcılar gizlenir; boştaki oturum kalır', () => {
    expect(ids(visibleAgents(agents, true))).toEqual(['acik', 'bos', 'yardimci']);
  });

  it('sahne için bitmiş yardımcılar korunabilir (kapıdan çıkışları kesilmesin)', () => {
    expect(ids(visibleAgents(agents, true, { keepFinished: true }))).toEqual([
      'acik',
      'bos',
      'yardimci',
      'bitti',
    ]);
  });
});

describe('karakter ve maskot ayarları', () => {
  it('geçerli rol görünümleri ve maskotlar okunur, geçersizler atılır', () => {
    const s = parseSettings(
      JSON.stringify({
        looks: {
          developer: { outfit: '#4a7bff', accessories: false },
          tester: { outfit: '#123456' },
          hacker: { outfit: '#4a7bff' },
          designer: 'kırmızı',
        },
        mascots: { Atlas: 'cat', Nova: 'ejderha', Pusula: 'robot' },
      }),
    );
    expect(s.looks).toEqual({ developer: { outfit: '#4a7bff', accessories: false } });
    expect(s.mascots).toEqual({ Atlas: 'cat', Pusula: 'robot' });
  });

  it('eksikse boş', () => {
    expect(parseSettings('{}').looks).toEqual({});
    expect(parseSettings('{"mascots":[1]}').mascots).toEqual({});
  });
});
