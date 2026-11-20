import { describe, expect, it } from 'vitest';
import { pastimeScreen, screenKindFor } from './screens.ts';

describe('ekran içeriği (sahte)', () => {
  it('duruma göre', () => {
    expect(screenKindFor('writing', 'developer')).toBe('code');
    expect(screenKindFor('reading', 'developer')).toBe('page');
    expect(screenKindFor('terminal', 'developer')).toBe('terminal');
    expect(screenKindFor('searching', 'researcher')).toBe('search');
    expect(screenKindFor('thinking', 'developer')).toBe('think');
    expect(screenKindFor('asking', 'lead')).toBe('ask');
    expect(screenKindFor('idle', 'developer')).toBe('idle');
    expect(screenKindFor('offline', 'lead')).toBe('off');
    expect(screenKindFor('absent', 'designer')).toBe('off');
  });
  it('role göre: tasarımcı paletler, test uzmanı tik listeleri', () => {
    expect(screenKindFor('writing', 'designer')).toBe('design');
    expect(screenKindFor('reading', 'designer')).toBe('design');
    expect(screenKindFor('terminal', 'tester')).toBe('tests');
    expect(screenKindFor('writing', 'tester')).toBe('tests');
    expect(screenKindFor('reading', 'tester')).toBe('page');
  });
});

describe('boşta oyalanma ekranı', () => {
  it('masada video ya da oyun; yan ekran bekler; konsol ve oyalanmama masa ekranını değiştirmez', () => {
    expect(pastimeScreen('desk', 'video')).toEqual({ kind: 'video' });
    expect(pastimeScreen('big', 'pcgame')).toEqual({ kind: 'game', variant: 0 });
    expect(pastimeScreen('side', 'video')).toEqual({ kind: 'idle' });
    expect(pastimeScreen('desk', 'console')).toBeNull();
    expect(pastimeScreen('desk', null)).toBeNull();
  });
});
