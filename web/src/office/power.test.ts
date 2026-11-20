import { describe, expect, it } from 'vitest';
import {
  ambientBoost,
  clockOrigin,
  clockSeconds,
  frameInterval,
  frameStep,
  maxPointLights,
  pickPointLights,
  screenFps,
} from './power.ts';

describe('kare aralığı', () => {
  it('normal: odakta sınırsız, odak dışında ~12 kare/sn', () => {
    expect(frameInterval(true, false)).toBe(0);
    expect(frameInterval(false, false)).toBeCloseTo(1000 / 12);
  });

  it('düşük güç: odakta 30, odak dışında 8 kare/sn', () => {
    expect(frameInterval(true, true)).toBeCloseTo(1000 / 30);
    expect(frameInterval(false, true)).toBe(125);
  });

  it('aralık 0 ise her karede çizilir', () => {
    expect(frameStep(100, 100, 0)).toEqual({ draw: true, next: 100 });
    expect(frameStep(100, 5000, 0).draw).toBe(true);
  });

  /** `hz` yenileme hızında `seconds` saniye boyunca kaç kare çizildiğini sayar. */
  const count = (hz: number, interval: number, seconds = 1, jitter = 0) => {
    let next = 0;
    let drawn = 0;
    for (let i = 1; i <= hz * seconds; i++) {
      const t = i * (1000 / hz) + (i % 2 ? jitter : -jitter);
      const step = frameStep(t, next, interval);
      next = step.next;
      if (step.draw) drawn++;
    }
    return drawn;
  };

  it('normal modda odakta her ekran karesi çizilir', () => {
    expect(count(75, frameInterval(true, false))).toBe(75);
    expect(count(144, frameInterval(true, false))).toBe(144);
  });

  it('60 Hz ekranda 30 kare/sn hedefi her ikinci karede çizer (küçük sapmaya rağmen)', () => {
    const interval = frameInterval(true, true);
    let next = 0;
    const drawnAt: number[] = [];
    for (let i = 1; i <= 120; i++) {
      // yenileme zamanları ±0,3 ms oynar
      const step = frameStep(i * (1000 / 60) + (i % 2 ? 0.3 : -0.3), next, interval);
      next = step.next;
      if (step.draw) drawnAt.push(i);
    }
    // ilk çizimden sonra düzenli olarak her ikinci kare
    const gaps = drawnAt.slice(2).map((f, k) => f - drawnAt[k + 1]!);
    expect(new Set(gaps)).toEqual(new Set([2]));
    expect(Math.abs(count(60, interval, 10, 0.3) - 300)).toBeLessThanOrEqual(1);
  });

  it('75 Hz ekranda 30 kare/sn tutturulur (25e düşmez)', () => {
    const drawn = count(75, frameInterval(true, true), 10);
    expect(drawn).toBeGreaterThanOrEqual(299);
    expect(drawn).toBeLessThanOrEqual(301);
  });

  it('120 ve 144 Hz ekranlarda da ~30 kare/sn, asla fazlası değil', () => {
    for (const hz of [120, 144, 240]) {
      const drawn = count(hz, frameInterval(true, true), 10, 0.2);
      expect(drawn).toBeGreaterThanOrEqual(298);
      expect(drawn).toBeLessThanOrEqual(301);
    }
  });

  it('odak dışında: normal ~12, düşük güç ~8 kare/sn', () => {
    expect(Math.abs(count(60, frameInterval(false, false), 10) - 120)).toBeLessThanOrEqual(1);
    expect(Math.abs(count(75, frameInterval(false, true), 10) - 80)).toBeLessThanOrEqual(1);
  });

  it('uzun bir aradan sonra biriken kareler art arda çizilmez', () => {
    const interval = frameInterval(true, true);
    const first = frameStep(1000, 0, interval);
    expect(first).toEqual({ draw: true, next: 1000 + interval });
    // bir sonraki ekran karesi (60 Hz) çizilmez
    expect(frameStep(1000 + 1000 / 60, first.next, interval).draw).toBe(false);
  });

  it('bir kare kaçınca plan bir kez yetişir, sonra düzene döner', () => {
    const interval = 100;
    const a = frameStep(0, 0, interval); // plan 100
    const b = frameStep(150, a.next, interval); // geç kaldı, plan 200
    expect(b).toEqual({ draw: true, next: 200 });
    expect(frameStep(198, b.next, interval).draw).toBe(true);
  });
});

describe('sahne saati (frameloop="never")', () => {
  it('ekran zamanını başlangıca göre saniyeye çevirir', () => {
    expect(clockSeconds(1500, 1000)).toBeCloseTo(0.5);
    expect(clockSeconds(1000, 1000)).toBe(0);
  });

  it("atlanan karelerin süresi bir sonraki delta'ya eklenir", () => {
    const origin = 0;
    // 60 Hz'de 30 kare/sn: iki çizim arası iki ekran karesi
    const d = clockSeconds(2 * (1000 / 60), origin) - clockSeconds(0, origin);
    expect(d).toBeCloseTo(1 / 30);
  });

  it('sürücü yeniden kurulunca saat kaldığı yerden sürer', () => {
    const origin = clockOrigin(90_000, 12.5);
    expect(clockSeconds(90_000, origin)).toBeCloseTo(12.5);
    expect(clockSeconds(90_016, origin)).toBeCloseTo(12.516);
  });
});

describe('ekranlar ve ışıklar', () => {
  it('monitör ekranları düşük güçte yavaşlar, hareket azaltılmışsa en yavaş', () => {
    expect(screenFps(false, false)).toBe(8);
    expect(screenFps(false, true)).toBe(2);
    expect(screenFps(true, false)).toBe(1);
    expect(screenFps(true, true)).toBe(1);
  });

  it('nokta ışık sınırı', () => {
    expect(maxPointLights(false)).toBe(8);
    expect(maxPointLights(true)).toBe(4);
  });
});

describe('nokta ışık seçimi', () => {
  const island = (n: number) => Array.from({ length: n }, () => ({ kind: 'island' as const }));
  const zones = [
    { kind: 'zone' as const, zone: 'kitchen' },
    { kind: 'zone' as const, zone: 'lounge' },
    { kind: 'zone' as const, zone: 'lead' },
    { kind: 'zone' as const, zone: 'meeting' },
  ];

  it('normal: en fazla 4 ada lambası, sonra bölge lambaları (toplam 8)', () => {
    const picked = pickPointLights([...island(5), ...zones], false);
    expect(picked).toHaveLength(8);
    expect(picked.filter((l) => l.kind === 'island')).toHaveLength(4);
  });

  it('düşük güç: 4 ışıktan en az biri bölge lambası (lider köşesi)', () => {
    for (const n of [2, 4, 6]) {
      const picked = pickPointLights([...island(n), ...zones], true);
      expect(picked.length).toBeLessThanOrEqual(4);
      expect(
        picked.some((l) => l.kind === 'zone' && l.zone === 'lead'),
        `${n} ada`,
      ).toBe(true);
    }
    expect(pickPointLights([...island(6), ...zones], true).filter((l) => l.kind === 'island')).toHaveLength(
      3,
    );
  });

  it('düşük güçte ortam ışığı ~%12 artar', () => {
    expect(ambientBoost(false)).toBe(1);
    expect(ambientBoost(true)).toBeCloseTo(1.12);
  });
});
