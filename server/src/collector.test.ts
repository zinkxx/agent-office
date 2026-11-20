import { describe, expect, it } from 'vitest';
import { Collector } from './collector.ts';
import { OfficeStore } from './store.ts';

const NOW = Date.parse('2026-11-19T10:01:00Z');

async function collect() {
  const store = new OfficeStore(() => NOW);
  const collector = new Collector({
    claudeHome: 'fixtures/claude-home',
    store,
    alive: () => true,
    recentMs: Number.MAX_SAFE_INTEGER,
    watch: false,
    tickMs: 60_000,
    // Uydurma kayıtlardaki /Users/demo/Desktop/<Proje> → fixtures/projects/<Proje>
    teamDirFor: (dir) => `fixtures/projects/${dir.split('/').pop()}`,
  });
  await collector.start();
  await collector.stop();
  return store.snapshot();
}

describe('Collector (örnek kayıtlarla uçtan uca)', () => {
  it('oturumları, projeleri, alt ajanları ve mektubu bulur', async () => {
    const snap = await collect();
    const byName = Object.fromEntries(snap.agents.map((a) => [a.name, a]));
    expect(Object.keys(byName).sort()).toEqual(
      ['Akış adımı', 'atlas-demo', 'nova-demo', 'Testleri incele'].sort(),
    );
    expect(byName['atlas-demo']).toMatchObject({
      project: 'Atlas',
      entrypoint: 'cli',
      title: 'Profil ekranını düzenleme',
    });
    expect(byName['nova-demo']).toMatchObject({
      project: 'Nova',
      entrypoint: 'claude-vscode',
      status: 'idle',
    });
    expect(byName['Testleri incele']).toMatchObject({
      kind: 'subagent',
      parentId: byName['atlas-demo']!.id,
    });
    expect(byName['Akış adımı']).toMatchObject({
      kind: 'subagent',
      status: 'reading',
      current: { file: 'README.md' },
    });
    expect(byName['atlas-demo']!.role).toBe('lead');
    // İş tanımında "test" geçtiği için genel türdeki yardımcı test uzmanı sayılır.
    expect(byName['Testleri incele']).toMatchObject({ agentType: 'general-purpose', role: 'tester' });
    expect(snap.teams).toEqual([
      {
        project: 'Atlas',
        members: [
          { name: 'gelistirici', role: 'developer' },
          { name: 'kalite-bekcisi', role: 'tester' },
          { name: 'onbilgisiz', role: 'other' },
          { name: 'tasarimci', role: 'designer' },
          { name: 'testci', role: 'tester' },
        ],
      },
    ]);
    expect(snap.letters).toHaveLength(1);
    expect(snap.letters[0]).toMatchObject({ toName: 'nova-demo', toId: byName['nova-demo']!.id });
  });

  it('tarayıcıya gidecek veride gizli içerik, tam yol ya da hesap bilgisi yok', async () => {
    const json = JSON.stringify(await collect());
    expect(json).not.toMatch(/GİZLİ|GIZLI|\/Users\/|accountUuid|organizationUuid|ASLA-OKUNMAMALI/);
  });
});
