import { describe, expect, it } from 'vitest';
import type { AgentRole } from '../../shared/types.ts';
import {
  inferRole,
  normalizeName,
  roleForMember,
  roleFromBehavior,
  roleFromText,
  type ToolStats,
} from './roles.ts';

const stats = (over: Partial<ToolStats>): ToolStats => ({ total: 0, reads: 0, writes: 0, tests: 0, ...over });

describe('roleFromText', () => {
  it.each<[string, AgentRole]>([
    ['tasarimci', 'designer'],
    ['Tasarımcı', 'designer'],
    ['ui-designer', 'designer'],
    ['gelistirici', 'developer'],
    ['Geliştirici', 'developer'],
    ['frontend-developer', 'developer'],
    ['testci', 'tester'],
    ['Testçi', 'tester'],
    ['qa-engineer', 'tester'],
    ['inceleyici', 'reviewer'],
    ['code-reviewer', 'reviewer'],
    ['arastirmaci', 'researcher'],
    ['Araştırmacı', 'researcher'],
    ['mimar', 'architect'],
    ['software-architect', 'architect'],
  ])('%s → %s', (name, role) => {
    expect(roleFromText(name)).toBe(role);
  });

  it('tanımadığı adda undefined', () => {
    expect(roleFromText('muhasebe')).toBeUndefined();
    expect(roleFromText('')).toBeUndefined();
    expect(roleFromText(undefined)).toBeUndefined();
  });

  it('Türkçe harfleri sadeleştirir', () => {
    expect(normalizeName('İnceleyici Öğe Şçğ')).toBe('inceleyici oge scg');
  });
});

describe('roleFromBehavior', () => {
  it('az işlemle tahmin yapmaz', () => {
    expect(roleFromBehavior(stats({ total: 2, tests: 2 }))).toBeUndefined();
  });
  it('çoğunlukla test → test uzmanı', () => {
    expect(roleFromBehavior(stats({ total: 6, tests: 3, writes: 2 }))).toBe('tester');
  });
  it('okuyup hiç yazmayan → inceleyici', () => {
    expect(roleFromBehavior(stats({ total: 5, reads: 5 }))).toBe('reviewer');
  });
  it('yazan ama test etmeyen → tahmin yok', () => {
    expect(roleFromBehavior(stats({ total: 5, reads: 2, writes: 3 }))).toBeUndefined();
  });
});

describe('inferRole', () => {
  it('ana oturum her zaman takım lideri', () => {
    expect(inferRole({ kind: 'session', agentType: 'testci' })).toBe('lead');
  });

  it('yerleşik türler', () => {
    expect(inferRole({ kind: 'subagent', agentType: 'Explore' })).toBe('researcher');
    expect(inferRole({ kind: 'subagent', agentType: 'Plan' })).toBe('architect');
    expect(inferRole({ kind: 'subagent', agentType: 'general-purpose' })).toBe('developer');
  });

  it('Explore çok okusa da araştırmacı kalır (güçlü eşleme)', () => {
    expect(inferRole({ kind: 'subagent', agentType: 'Explore', stats: stats({ total: 9, reads: 9 }) })).toBe(
      'researcher',
    );
  });

  it('general-purpose davranışa göre test uzmanı ya da inceleyici olabilir', () => {
    expect(
      inferRole({ kind: 'subagent', agentType: 'general-purpose', stats: stats({ total: 4, tests: 3 }) }),
    ).toBe('tester');
    expect(
      inferRole({ kind: 'subagent', agentType: 'general-purpose', stats: stats({ total: 4, reads: 4 }) }),
    ).toBe('reviewer');
  });

  it('özel ajan adı davranışı ezer', () => {
    expect(
      inferRole({ kind: 'subagent', agentType: 'tasarimci', stats: stats({ total: 5, tests: 5 }) }),
    ).toBe('designer');
  });

  it('ekip listesindeki rol önce gelir', () => {
    const team = new Map<string, AgentRole>([['kahraman', 'tester']]);
    expect(inferRole({ kind: 'subagent', agentType: 'kahraman', team })).toBe('tester');
  });

  it('alt ajan lider olamaz', () => {
    expect(inferRole({ kind: 'subagent', agentType: 'team-lead' })).toBe('other');
  });

  it('türü olmayan alt ajan varsayılan olarak geliştirici, tanınmayan tür "other"', () => {
    expect(inferRole({ kind: 'subagent' })).toBe('developer');
    expect(inferRole({ kind: 'subagent', agentType: 'muhasebe' })).toBe('other');
  });
});

describe('roleForMember', () => {
  it('önce ad, sonra açıklama', () => {
    expect(roleForMember('gelistirici', 'Testleri de yazar')).toBe('developer');
    expect(roleForMember('ayse', 'Arayüz tasarımı ve renkler')).toBe('designer');
    expect(roleForMember('bob', 'Leads code reviews')).toBe('reviewer');
    expect(roleForMember('xyz', undefined)).toBe('other');
  });
});

describe('iş tanımından rol', () => {
  it('genel ya da türsüz yardımcıda iş tanımındaki rol sözcüğü kullanılır', () => {
    expect(
      inferRole({ kind: 'subagent', agentType: 'general-purpose', label: 'Tasarımcı: tema kontrolü' }),
    ).toBe('designer');
    expect(inferRole({ kind: 'subagent', label: 'Testçi performans ölçümü' })).toBe('tester');
    expect(inferRole({ kind: 'subagent', agentType: 'general-purpose', label: 'Reviewer pass' })).toBe(
      'reviewer',
    );
  });

  it('iş tanımı davranıştan önce gelir; sözcük yoksa davranış geçerli', () => {
    const stats = { total: 10, reads: 10, writes: 0, tests: 0 };
    expect(inferRole({ kind: 'subagent', agentType: 'general-purpose', label: 'Geliştirici', stats })).toBe(
      'developer',
    );
    expect(inferRole({ kind: 'subagent', agentType: 'general-purpose', label: 'Yardım işi', stats })).toBe(
      'reviewer',
    );
  });

  it('güçlü tür, ekip ve özel tür iş tanımına göre önceliklidir; lider olunamaz', () => {
    expect(inferRole({ kind: 'subagent', agentType: 'Explore', label: 'Tasarımcı' })).toBe('researcher');
    expect(inferRole({ kind: 'subagent', agentType: 'testci', label: 'Tasarımcı' })).toBe('tester');
    expect(inferRole({ kind: 'subagent', label: 'Takım lideri yardımcısı' })).not.toBe('lead');
  });
});

describe('iş tanımında ilk sözcük önceliği', () => {
  it('baştaki rol sözcüğü sonraki sözcüklere üstün gelir', () => {
    expect(
      inferRole({
        kind: 'subagent',
        agentType: 'general-purpose',
        label: 'Geliştirici: inceleme düzeltmeleri',
      }),
    ).toBe('developer');
    expect(inferRole({ kind: 'subagent', label: 'İnceleyici: test kapsamı' })).toBe('reviewer');
    expect(inferRole({ kind: 'subagent', label: 'Hızlı test kontrolü' })).toBe('tester');
  });
});
