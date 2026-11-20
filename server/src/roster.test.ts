import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { extractFrontMatter, parseFrontMatter, readFrontMatter, readTeam } from './roster.ts';

const ATLAS = 'fixtures/projects/Atlas';

describe('readTeam', () => {
  it('ekibi yalnızca ön bilgiden okur, rolleri çıkarır', async () => {
    const team = await readTeam(ATLAS);
    expect(team).toEqual([
      { name: 'gelistirici', role: 'developer' },
      { name: 'kalite-bekcisi', role: 'tester' }, // ad ("kalite") açıklamadan önce gelir
      { name: 'onbilgisiz', role: 'other' }, // ön bilgisi yok: dosya adı
      { name: 'tasarimci', role: 'designer' },
      { name: 'testci', role: 'tester' },
    ]);
    expect(JSON.stringify(team)).not.toMatch(/GİZLİ|GIZLI|Arayüz|kodlar/);
  });

  it('ekip klasörü olmayan projede boş liste', async () => {
    expect(await readTeam('fixtures/projects/Nova')).toEqual([]);
    expect(await readTeam('fixtures/yok-boyle-bir-klasor')).toEqual([]);
  });
});

describe('ön bilgi', () => {
  const dir = mkdtemp(path.join(os.tmpdir(), 'ajan-ofisi-roster-'));
  afterAll(async () => rm(await dir, { recursive: true, force: true }));

  it('gövdeyi döndürmez', async () => {
    const block = await readFrontMatter(`${ATLAS}/.claude/agents/tasarimci.md`);
    expect(block).toContain('name: tasarimci');
    expect(block).not.toContain('GİZLİ');
  });

  it('sınır içinde kapanmayan ön bilgiyi okumaz', async () => {
    const file = path.join(await dir, 'uzun.md');
    await writeFile(file, `---\nname: uzun\ndescription: ${'x'.repeat(5000)}\n---\nGİZLİ`);
    expect(await readFrontMatter(file)).toBeNull();
  });

  it('ön bilgisi olmayan dosyada ilk parçadan sonra durur', async () => {
    expect(await readFrontMatter(`${ATLAS}/.claude/agents/onbilgisiz.md`)).toBeNull();
  });

  it('YAML alanları', () => {
    expect(parseFrontMatter('name: "a b"\ndescription: >\n  bir\n  iki\ntools: x')).toEqual({
      name: 'a b',
      description: 'bir iki',
    });
    expect(extractFrontMatter('---\nname: a\n')).toBeUndefined();
    expect(extractFrontMatter('---\nname: a\n---\ngövde')).toBe('name: a');
  });
});
