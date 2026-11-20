import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDemo } from './demo.ts';
import { OfficeStore } from './store.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('demo modu', () => {
  it('dolu ofis ~20 karakterle başlar, zamanla değişir ve çökmez', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-11-20T10:00:00Z'));
    const store = new OfficeStore();
    const stop = startDemo(store, () => {}, { full: true, tickMs: 1000 });
    const first = store.snapshot();
    expect(first.agents.length).toBeGreaterThanOrEqual(16);
    expect(first.agents.length).toBeLessThanOrEqual(22);
    expect(first.teams.map((t) => t.project)).toEqual(['Atlas', 'Nova']);
    expect(new Set(first.agents.map((a) => a.role)).size).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 300; i++) vi.advanceTimersByTime(1000);
    const later = store.snapshot();
    expect(later.agents.length).toBeLessThanOrEqual(24);
    expect(later.letters.length + later.agents.length).toBeGreaterThan(0);
    stop();
  });
});
