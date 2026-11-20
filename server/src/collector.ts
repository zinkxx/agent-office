import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { parseLine } from './parser.ts';
import { readTeam } from './roster.ts';
import { readLiveSessions, isProcessAlive } from './sessions.ts';
import { FileTailer } from './tail.ts';
import type { OfficeStore, TranscriptSource } from './store.ts';

export interface CollectorOptions {
  /** Claude Code klasörü (gerçekte ~/.claude, testlerde fixtures/claude-home). */
  claudeHome: string;
  store: OfficeStore;
  /** Bir değişiklik işlendiğinde çağrılır (sunucu tarayıcıya yeni görüntü gönderir). */
  onChange?: () => void;
  alive?: (pid: number) => boolean;
  /** Açılışta yalnızca son bu kadar sürede değişmiş kayıtlar okunur (canlı oturumlarınki her zaman okunur). */
  recentMs?: number;
  /** Canlılık ve zaman aşımı kontrolü aralığı. */
  tickMs?: number;
  /** false ise dosya izleme kurulmaz (testler için). */
  watch?: boolean;
  /**
   * Proje klasöründen ekip listesinin okunacağı klasör (testlerde örnek klasöre yönlendirmek için).
   * Varsayılan: klasörün kendisi. null dönerse ekip okunmaz.
   */
  teamDirFor?: (projectDir: string) => string | null;
  /** Ekip listesinin yeniden okunma aralığı. */
  teamRefreshMs?: number;
  /**
   * Ajanı durum modelinden silinmiş (budanmış) bir dosya en az bu kadar süre okunmadıysa takipçisi bırakılır.
   * Varsayılan 2 dk.
   */
  releaseAfterMs?: number;
}

interface SubagentMeta {
  label?: string;
  agentType?: string;
}

const SUBAGENT_FILE = /^agent-(.+)\.jsonl$/;
/** Bırakılmış dosyaların hâlâ var olup olmadığı bu aralıkla denetlenir. */
const RELEASED_SWEEP_MS = 10 * 60_000;

interface Tracked {
  tailer: FileTailer;
  /** Son okuma zamanı (Date.now). */
  readAt: number;
}

/**
 * `~/.claude` altındaki oturum ve kayıt dosyalarını izler, yeni satırları durum modeline aktarır.
 * Hiçbir dosyaya yazmaz. `.key` dosyalarını açmaz.
 */
export class Collector {
  /** Takip edilen kayıt dosyaları. Ajanı budanınca bırakılır (bkz. `releaseIdle`). */
  private readonly tailers = new Map<string, Tracked>();
  /** Yalnızca sürmekte olan işler; iş bitince kayıt silinir. */
  private readonly queues = new Map<string, Promise<void>>();
  private readonly metas = new Map<string, SubagentMeta>();
  /**
   * Bırakılmış dosya → işlenmiş son satırın bittiği bayt. Dosya yeniden değişirse bu konuma kadarki satırlar
   * yalnızca geçmiş olarak tekrar okunur (mektup üretmez). Silinen dosyalar listeden çıkar.
   */
  private readonly released = new Map<string, number>();
  private releasedSweptAt = Date.now();
  private teamsReadAt = 0;
  private readonly teamDirsRead = new Set<string>();
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private liveIds = new Set<string>();

  constructor(private readonly options: CollectorOptions) {}

  private get sessionsDir(): string {
    return path.join(this.options.claudeHome, 'sessions');
  }

  private get projectsDir(): string {
    return path.join(this.options.claudeHome, 'projects');
  }

  async start(): Promise<void> {
    await this.refreshSessions();
    await this.initialScan();
    await this.refreshTeams(true);
    if (this.options.watch !== false) {
      this.watcher = chokidar.watch([this.sessionsDir, this.projectsDir], {
        ignoreInitial: true,
        // Yalnızca ilgilendiğimiz dosyalar; .key ve diğerleri hiç izlenmez.
        ignored: (p, stats) =>
          Boolean(stats?.isFile()) && !p.endsWith('.jsonl') && !/\/sessions\/\d+\.json$/.test(p),
        awaitWriteFinish: false,
      });
      this.watcher.on('add', (p) => void this.onFile(p));
      this.watcher.on('change', (p) => void this.onFile(p));
      this.watcher.on('unlink', (p) => {
        if (p.startsWith(this.sessionsDir)) void this.refreshSessions().then(() => this.changed());
        else if (p.endsWith('.jsonl')) void this.forget(p);
      });
    }
    this.timer = setInterval(() => {
      void this.refreshSessions()
        .then(() => this.refreshTeams(false))
        .then(() => {
          this.options.store.prune();
          return this.releaseIdle();
        })
        .then(() => this.changed());
    }, this.options.tickMs ?? 5_000);
    this.changed();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.watcher?.close();
    await Promise.all(this.queues.values());
  }

  private changed(): void {
    this.options.onChange?.();
  }

  private async refreshSessions(): Promise<void> {
    const sessions = await readLiveSessions(this.sessionsDir, this.options.alive ?? isProcessAlive);
    this.liveIds = new Set(sessions.map((s) => s.sessionId));
    this.options.store.setLiveSessions(sessions);
  }

  /**
   * Bilinen proje klasörlerinin ekip listelerini okur: yeni bir proje görünce hemen, gerisini aralıkla.
   * Yalnızca `.claude/agents/*.md` ön bilgileri okunur (bkz. roster.ts).
   */
  private async refreshTeams(force: boolean): Promise<void> {
    const due = force || Date.now() - this.teamsReadAt >= (this.options.teamRefreshMs ?? 30_000);
    const dirs = this.options.store.projectDirs();
    // Durum modelinden silinmiş projeler: geri gelirlerse hemen yeniden okunsun.
    const known = new Set(dirs.values());
    for (const dir of this.teamDirsRead) if (!known.has(dir)) this.teamDirsRead.delete(dir);
    const fresh = [...dirs.values()].some((d) => !this.teamDirsRead.has(d));
    if (!due && !fresh) return;
    this.teamsReadAt = Date.now();
    for (const [project, dir] of dirs) {
      this.teamDirsRead.add(dir);
      const teamDir = this.options.teamDirFor ? this.options.teamDirFor(dir) : dir;
      if (teamDir === null) continue;
      this.options.store.setTeam(project, await readTeam(teamDir));
    }
  }

  private async initialScan(): Promise<void> {
    const cutoff = Date.now() - (this.options.recentMs ?? 15 * 60_000);
    const files = await listJsonl(this.projectsDir);
    for (const file of files) {
      const source = this.sourceOf(file);
      if (!source) continue;
      let mtime = 0;
      try {
        mtime = (await stat(file)).mtimeMs;
      } catch {
        continue;
      }
      if (mtime >= cutoff || this.liveIds.has(source.sessionId)) await this.process(file, source);
    }
  }

  private async onFile(file: string): Promise<void> {
    if (file.startsWith(this.sessionsDir)) {
      await this.refreshSessions();
      this.changed();
      return;
    }
    if (!file.endsWith('.jsonl')) return;
    const source = this.sourceOf(file);
    if (!source) return;
    await this.process(file, source);
    this.changed();
  }

  /** Dosya yolundan kime ait olduğunu çıkarır. */
  sourceOf(file: string): TranscriptSource | null {
    const rel = path.relative(this.projectsDir, file);
    if (rel.startsWith('..')) return null;
    const parts = rel.split(path.sep);
    // projects/<klasör>/<sessionId>.jsonl
    if (parts.length === 2 && parts[1]?.endsWith('.jsonl')) {
      return { sessionId: parts[1].slice(0, -'.jsonl'.length) };
    }
    // projects/<klasör>/<sessionId>/subagents/**/agent-<id>.jsonl
    if (parts.length >= 4 && parts[2] === 'subagents') {
      const match = SUBAGENT_FILE.exec(parts[parts.length - 1] ?? '');
      if (match?.[1] && parts[1]) return { sessionId: parts[1], agentId: match[1] };
    }
    return null;
  }

  /** Aynı dosya için okumalar sırayla yapılır. */
  private process(file: string, source: TranscriptSource): Promise<void> {
    return this.enqueue(file, () => this.read(file, source));
  }

  /** Dosyanın iş sırasına ekler; sıra boşalınca kaydı silinir. */
  private enqueue(file: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(file) ?? Promise.resolve();
    const next: Promise<void> = previous
      .then(task)
      .catch(() => undefined)
      .then(() => {
        if (this.queues.get(file) === next) this.queues.delete(file);
      });
    this.queues.set(file, next);
    return next;
  }

  private async read(file: string, source: TranscriptSource): Promise<void> {
    let tracked = this.tailers.get(file);
    if (!tracked) {
      const replayUntil = this.released.get(file);
      this.released.delete(file);
      tracked = {
        tailer: new FileTailer(file, undefined, replayUntil === undefined ? {} : { replayUntil }),
        readAt: Date.now(),
      };
      this.tailers.set(file, tracked);
    }
    tracked.readAt = Date.now();
    if (source.agentId && !this.metas.has(source.agentId)) {
      this.metas.set(source.agentId, await readSubagentMeta(file));
    }
    const meta = source.agentId ? this.metas.get(source.agentId) : undefined;
    const full: TranscriptSource = { ...source, ...meta };
    for await (const batch of tracked.tailer.batches()) {
      for (const raw of batch.lines) {
        const line = parseLine(raw);
        if (line) this.options.store.ingest(full, line, batch.replay);
      }
    }
  }

  /**
   * Ajanı durum modelinden silinmiş ve bir süredir okunmamış dosyaların takipçilerini bırakır (önce
   * `store.prune()` çağrılmalı). Dosya yeniden değişirse kaldığı konum hatırlanarak tekrar okunur.
   */
  async releaseIdle(): Promise<void> {
    const now = Date.now();
    const idleMs = this.options.releaseAfterMs ?? 2 * 60_000;
    const jobs: Promise<void>[] = [];
    for (const [file, tracked] of this.tailers) {
      if (now - tracked.readAt < idleMs) continue;
      const source = this.sourceOf(file);
      const id = source ? (source.agentId ?? source.sessionId) : undefined;
      if (id !== undefined && this.options.store.hasAgent(id)) continue;
      jobs.push(
        this.enqueue(file, async () => {
          const current = this.tailers.get(file);
          // Bu arada yeni satır okunduysa ajan yeniden doğmuştur; bırakma.
          if (current !== tracked || (id !== undefined && this.options.store.hasAgent(id))) return;
          this.tailers.delete(file);
          if (source?.agentId) this.metas.delete(source.agentId);
          const position = tracked.tailer.position;
          if (position !== null && (await exists(file))) this.released.set(file, position);
        }),
      );
    }
    if (now - this.releasedSweptAt >= RELEASED_SWEEP_MS) {
      this.releasedSweptAt = now;
      for (const file of [...this.released.keys()]) if (!(await exists(file))) this.released.delete(file);
    }
    await Promise.all(jobs);
  }

  /** Silinen kayıt dosyasının bütün kayıtlarını bırakır. */
  private forget(file: string): Promise<void> {
    return this.enqueue(file, async () => {
      this.tailers.delete(file);
      this.released.delete(file);
      const agentId = this.sourceOf(file)?.agentId;
      if (agentId) this.metas.delete(agentId);
    });
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Alt ajanın meta dosyasından kısa iş tanımı (`description`, en fazla 40 karakter) ve türü (`agentType`). */
async function readSubagentMeta(jsonlFile: string): Promise<SubagentMeta> {
  try {
    const meta = JSON.parse(await readFile(jsonlFile.replace(/\.jsonl$/, '.meta.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const out: SubagentMeta = {};
    const label = clip(meta.description, 40);
    const agentType = clip(meta.agentType, 40);
    if (label) out.label = label;
    if (agentType) out.agentType = agentType;
    return out;
  } catch {
    return {};
  }
}

/** projects altındaki tüm .jsonl dosyaları (alt ajanlar dahil). */
async function listJsonl(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => path.join(e.parentPath, e.name));
}
