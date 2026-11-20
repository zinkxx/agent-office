import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Collector } from './collector.ts';
import { OfficeStore, SUBAGENT_LINGER_MS } from './store.ts';

/** Uydurma veriyle geçici bir Claude klasörü: bir canlı oturum ve bir alt ajan. */
const T0 = Date.parse('2026-11-19T10:00:00Z');
const SESSION = '33333333-3333-4333-8333-333333333333';
const iso = (ms: number) => new Date(ms).toISOString();

function line(at: number, content: unknown[], stop: string, agentId?: string): string {
  return `${JSON.stringify({
    type: 'assistant',
    timestamp: iso(at),
    sessionId: SESSION,
    cwd: '/demo/Deneme',
    ...(agentId ? { isSidechain: true, agentId } : {}),
    message: { role: 'assistant', content, stop_reason: stop },
  })}\n`;
}
const tool = (name: string, input: Record<string, unknown> = {}) => ({
  type: 'tool_use',
  id: 't',
  name,
  input,
});

function setupHome() {
  const home = mkdtempSync(path.join(os.tmpdir(), 'ajan-ofisi-home-'));
  mkdirSync(path.join(home, 'sessions'));
  writeFileSync(
    path.join(home, 'sessions', '4242.json'),
    JSON.stringify({
      pid: 4242,
      sessionId: SESSION,
      cwd: '/demo/Deneme',
      name: 'deneme-1',
      entrypoint: 'cli',
      status: 'busy',
    }),
  );
  const projectDir = path.join(home, 'projects', '-demo-Deneme');
  const subDir = path.join(projectDir, SESSION, 'subagents');
  mkdirSync(subDir, { recursive: true });
  const sessionFile = path.join(projectDir, `${SESSION}.jsonl`);
  writeFileSync(sessionFile, line(T0, [tool('Read', { file_path: '/demo/Deneme/a.ts' })], 'tool_use'));
  const subFile = path.join(subDir, 'agent-b1.jsonl');
  writeFileSync(
    subFile,
    line(T0, [tool('SendMessage', { to: 'nova-1', message: 'GİZLİ' })], 'tool_use', 'b1') +
      line(T0 + 1_000, [{ type: 'text', text: 'GİZLİ' }], 'end_turn', 'b1'),
  );
  writeFileSync(
    path.join(subDir, 'agent-b1.meta.json'),
    JSON.stringify({ agentType: 'general-purpose', description: 'Kontrol işi' }),
  );
  return { home, sessionFile, subFile };
}

interface CollectorInternals {
  tailers: Map<string, unknown>;
  queues: Map<string, unknown>;
  metas: Map<string, unknown>;
  released: Map<string, number>;
  onFile(file: string): Promise<void>;
  forget(file: string): Promise<void>;
}

describe('Collector kayıt bırakma', () => {
  it('ajanı budanan dosyayı bırakır; dosya yeniden değişince çift mektup üretmeden devam eder', async () => {
    const { home, sessionFile, subFile } = setupHome();
    let now = T0 + 2_000;
    const store = new OfficeStore(() => now);
    const collector = new Collector({
      claudeHome: home,
      store,
      alive: () => true,
      recentMs: Number.MAX_SAFE_INTEGER,
      watch: false,
      tickMs: 60_000,
      teamDirFor: () => null,
      releaseAfterMs: 0,
    });
    const inner = collector as unknown as CollectorInternals;
    try {
      await collector.start();
      let snap = store.snapshot();
      expect(snap.agents.map((a) => a.name)).toEqual(['deneme-1', 'Kontrol işi']);
      expect(snap.letters).toHaveLength(1);
      expect(inner.tailers.size).toBe(2);
      expect(inner.queues.size).toBe(0); // biten işler sırada tutulmaz

      // Alt ajan bitti, bekleme süresi geçti: durum modelinden ve toplayıcıdan çıkar (mektup hâlâ süresinde).
      now = T0 + 1_000 + SUBAGENT_LINGER_MS + 5_000;
      store.prune();
      await collector.releaseIdle();
      expect(store.hasAgent('b1')).toBe(false);
      expect([...inner.tailers.keys()]).toEqual([sessionFile]);
      expect(inner.metas.size).toBe(0);
      expect(inner.released.has(subFile)).toBe(true);

      // Alt ajan yeniden çalışmaya başladı.
      appendFileSync(subFile, line(now, [tool('Grep', { pattern: 'GİZLİ' })], 'tool_use', 'b1'));
      await inner.onFile(subFile);
      snap = store.snapshot();
      const sub = snap.agents.find((a) => a.id === 'b1');
      expect(sub).toMatchObject({ name: 'Kontrol işi', status: 'searching', agentType: 'general-purpose' });
      expect(sub!.recent.map((r) => r.tool)).toEqual(['Grep', 'SendMessage']);
      expect(snap.letters).toHaveLength(1); // eski SendMessage yeniden mektup üretmedi
      expect(inner.tailers.size).toBe(2);
      expect(inner.released.size).toBe(0);

      // Dosya silinirse hiçbir kaydı kalmaz.
      rmSync(subFile);
      await inner.forget(subFile);
      expect(inner.tailers.size).toBe(1);
      expect(inner.metas.size).toBe(0);
      expect(inner.queues.size).toBe(0);
    } finally {
      await collector.stop();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('ajanı hâlâ görünen ya da yakın zamanda okunan dosyayı bırakmaz', async () => {
    const { home } = setupHome();
    let now = T0 + 2_000;
    const store = new OfficeStore(() => now);
    const collector = new Collector({
      claudeHome: home,
      store,
      alive: () => true,
      recentMs: Number.MAX_SAFE_INTEGER,
      watch: false,
      tickMs: 60_000,
      teamDirFor: () => null,
    });
    const inner = collector as unknown as CollectorInternals;
    try {
      await collector.start();
      now += SUBAGENT_LINGER_MS + 10_000;
      store.prune();
      await collector.releaseIdle(); // varsayılan bekleme (2 dk) dolmadı
      expect(inner.tailers.size).toBe(2);
    } finally {
      await collector.stop();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
