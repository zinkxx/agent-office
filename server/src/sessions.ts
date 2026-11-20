import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** `~/.claude/sessions/<pid>.json` içinden kullandığımız alanlar. */
export interface LiveSession {
  pid: number;
  sessionId: string;
  name: string;
  cwd: string;
  entrypoint: 'cli' | 'claude-vscode' | 'other';
  status: 'busy' | 'idle';
  startedAt?: number;
  updatedAt?: number;
}

/** Yalnızca `<rakamlar>.json` adlı dosyalar okunur; `.key` ve diğer her şey adından elenir, hiç açılmaz. */
export const SESSION_FILE = /^\d+\.json$/;

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: süreç var ama sinyal izni yok; yine de canlıdır.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function parseSession(raw: unknown): LiveSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.pid !== 'number' || typeof r.sessionId !== 'string' || typeof r.cwd !== 'string') return null;
  const entrypoint = r.entrypoint === 'cli' || r.entrypoint === 'claude-vscode' ? r.entrypoint : 'other';
  return {
    pid: r.pid,
    sessionId: r.sessionId,
    name: typeof r.name === 'string' && r.name ? r.name : path.basename(r.cwd),
    cwd: r.cwd,
    entrypoint,
    status: r.status === 'busy' ? 'busy' : 'idle',
    ...(typeof r.startedAt === 'number' ? { startedAt: r.startedAt } : {}),
    ...(typeof r.updatedAt === 'number' ? { updatedAt: r.updatedAt } : {}),
  };
}

/**
 * Çalışan Claude Code oturumlarını listeler. Süreci ölmüş oturum dosyaları atlanır.
 * Bozuk dosya uygulamayı çökertmez.
 */
export async function readLiveSessions(
  sessionsDir: string,
  alive: (pid: number) => boolean = isProcessAlive,
): Promise<LiveSession[]> {
  let names: string[];
  try {
    names = await readdir(sessionsDir);
  } catch {
    return [];
  }
  const sessions: LiveSession[] = [];
  for (const name of names) {
    if (!SESSION_FILE.test(name)) continue;
    try {
      const session = parseSession(JSON.parse(await readFile(path.join(sessionsDir, name), 'utf8')));
      if (session && alive(session.pid)) sessions.push(session);
    } catch {
      // Yazılırken okunan ya da bozuk dosya: bir sonraki taramada tekrar denenir.
    }
  }
  return sessions;
}
