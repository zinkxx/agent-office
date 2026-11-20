import { describe, expect, it } from 'vitest';
import { readLiveSessions, SESSION_FILE } from './sessions.ts';

const DIR = 'fixtures/claude-home/sessions';

describe('readLiveSessions', () => {
  it('canlı oturumları okur', async () => {
    const sessions = await readLiveSessions(DIR, () => true);
    expect(sessions.map((s) => s.name).sort()).toEqual(['atlas-demo', 'nova-demo']);
    expect(sessions.find((s) => s.name === 'nova-demo')).toMatchObject({
      entrypoint: 'claude-vscode',
      status: 'idle',
    });
  });

  it('süreci ölmüş oturumu atlar', async () => {
    const sessions = await readLiveSessions(DIR, (pid) => pid !== 1111);
    expect(sessions.map((s) => s.name)).toEqual(['nova-demo']);
  });

  it('.key dosyaları adından elenir, hiç açılmaz', () => {
    expect(SESSION_FILE.test('1111.json')).toBe(true);
    expect(SESSION_FILE.test('1111.deadbeef.key')).toBe(false);
    expect(SESSION_FILE.test('1111.json.key')).toBe(false);
  });

  it('klasör yoksa boş döner', async () => {
    expect(await readLiveSessions('/olmayan/klasor')).toEqual([]);
  });
});
