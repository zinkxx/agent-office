import type {
  Activity,
  Agent,
  AgentRole,
  AgentStatus,
  Letter,
  OfficeSnapshot,
  Team,
  TeamMember,
} from '../../shared/types.ts';
import type { ParsedEvent, ParsedLine } from './parser.ts';
import { emptyStats, inferRole, normalizeName, type ToolStats } from './roles.ts';
import type { LiveSession } from './sessions.ts';

/** Kapanmış bir oturum ofiste bu kadar süre (sönük) kalır, sonra gizlenir. */
export const OFFLINE_VISIBLE_MS = 10 * 60_000;
/** İşini bitirmiş alt ajan bu kadar süre sonra ofisten ayrılır. */
export const SUBAGENT_LINGER_MS = 90_000;
/** Mektuplar bu kadar süre listede kalır. */
export const LETTER_TTL_MS = 2 * 60_000;
/**
 * Alt ajan bu kadar süre hiç iz bırakmazsa işini bitirmiş sayılır. Bazı alt ajanlar sırayı "end_turn" ile değil,
 * lidere rapor veren bir araç çağrısıyla bitirir; onlar da bu sürenin sonunda ofisten ayrılır.
 */
export const SUBAGENT_STALE_MS = 5 * 60_000;
/** Alt ajanın liderine son raporunu teslim ettiği araçlar: çağrıldığında iş bitmiştir. */
const HANDBACK_TOOLS = new Set(['SubagentHandback']);
/** "Hata" durumu bu kadar sürer. */
const ERROR_MS = 8_000;
const RECENT_LIMIT = 20;

/** Araç adından ofisteki duruma. */
export function statusForTool(tool: string): AgentStatus {
  switch (tool) {
    case 'Read':
      return 'reading';
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return 'writing';
    case 'Grep':
    case 'Glob':
    case 'WebSearch':
    case 'WebFetch':
    case 'ToolSearch':
      return 'searching';
    case 'Bash':
    case 'Monitor':
      return 'terminal';
    case 'Agent':
    case 'Task':
    case 'Workflow':
      return 'delegating';
    case 'SendMessage':
      return 'messaging';
    case 'AskUserQuestion':
      return 'asking';
    default:
      return 'working';
  }
}

/** Bir kayıt dosyasının kime ait olduğu. */
export interface TranscriptSource {
  sessionId: string;
  /** Alt ajan dosyasıysa dolu. */
  agentId?: string;
  /** Alt ajanın meta dosyasından kısa iş tanımı. */
  label?: string;
  /** Alt ajanın türü (meta.json `agentType`). */
  agentType?: string;
}

interface AgentRecord extends Agent {
  errorUntil?: number;
  stats: ToolStats;
}

/** Ofisin canlı durumu. Olayları işler, istenince anlık görüntü üretir. */
export class OfficeStore {
  private readonly agents = new Map<string, AgentRecord>();
  private letters: Letter[] = [];
  private live = new Map<string, LiveSession>();
  private letterSeq = 0;
  /** Proje adı → ekip listesi. */
  private readonly teams = new Map<string, TeamMember[]>();
  /** Proje adı → klasörü (ekip listesini okumak için; tarayıcıya gönderilmez). */
  private readonly dirs = new Map<string, string>();
  /** Oturum adı → o adı taşıyan ana oturumların id'leri (mektubun alıcısını bulmak için). */
  private readonly sessionsByName = new Map<string, Set<string>>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Çalışan oturum listesini günceller (oturum adları, giriş noktası, meşgul/boşta bilgisi). */
  setLiveSessions(sessions: LiveSession[]): void {
    this.live = new Map(sessions.map((s) => [s.sessionId, s]));
    for (const s of sessions) {
      this.dirs.set(projectOf(s.cwd), s.cwd);
      const agent = this.ensureSession(s.sessionId, projectOf(s.cwd));
      this.rename(agent, s.name);
      agent.project = projectOf(s.cwd);
      agent.entrypoint = s.entrypoint;
      if (s.startedAt !== undefined) agent.startedAt = s.startedAt;
      agent.lastActivityAt = Math.max(agent.lastActivityAt, s.updatedAt ?? 0);
    }
  }

  /** Bilinen proje klasörleri (proje adı → klasör). */
  projectDirs(): Map<string, string> {
    return new Map(this.dirs);
  }

  /** Bir projenin ekip listesini ayarlar (boş liste = ekip yok). */
  setTeam(project: string, members: TeamMember[]): void {
    if (members.length === 0) this.teams.delete(project);
    else
      this.teams.set(
        project,
        members.map((m) => ({ ...m })),
      );
  }

  /** Bu id'ye sahip ajan (ana oturum ya da alt ajan) hâlâ tutuluyor mu (budanmadı mı)? */
  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * Bir kayıt dosyasından okunmuş satırı işler.
   * @param replay true: satır daha önce işlenmişti, yalnızca geçmişi (başlık, son işlemler) yeniden kurmak için
   *   tekrar okunuyor; mektup üretmez.
   */
  ingest(source: TranscriptSource, line: ParsedLine, replay = false): void {
    const project = line.project;
    const session = this.ensureSession(source.sessionId, project);
    if (project && session.project === UNKNOWN_PROJECT) session.project = project;

    let agent: AgentRecord = session;
    if (source.agentId) {
      agent = this.ensureSubagent(source.agentId, session, source.label);
      if (source.agentType && !agent.agentType) agent.agentType = source.agentType;
      for (const e of line.events) {
        if (e.kind === 'title') continue;
        if (agent.startedAt === undefined || e.at < agent.startedAt) agent.startedAt = e.at;
        break;
      }
    }
    for (const event of line.events) this.apply(agent, event, replay);
  }

  private apply(agent: AgentRecord, event: ParsedEvent, replay: boolean): void {
    if (event.kind === 'title') {
      agent.title = event.title;
      return;
    }
    // Eski bir olay (ör. ilk okumadaki geçmiş) daha yeni durumu ezmesin.
    if (event.kind === 'tool') countTool(agent.stats, event.tool, event.test === true);
    if (event.at < agent.lastActivityAt - 1) {
      if (event.kind === 'tool') this.remember(agent, event.tool, event.file, event.at, false);
      return;
    }
    agent.lastActivityAt = event.at;
    switch (event.kind) {
      case 'human':
      case 'peer':
      case 'thinking':
      case 'compact':
        agent.status = 'thinking';
        delete agent.current;
        break;
      case 'reply':
        if (agent.status === 'idle' || agent.status === 'offline') agent.status = 'working';
        break;
      case 'turn-end':
        agent.status = 'idle';
        delete agent.current;
        break;
      case 'error':
        agent.status = 'error';
        agent.errorUntil = event.at + ERROR_MS;
        break;
      case 'tool': {
        if (agent.kind === 'subagent' && HANDBACK_TOOLS.has(event.tool)) {
          // Lidere raporunu verdi: iş bitti (ofiste rapor verip kapıdan çıkar).
          agent.status = 'idle';
          delete agent.current;
          this.remember(agent, event.tool, event.file, event.at, false);
          break;
        }
        agent.status = statusForTool(event.tool);
        this.remember(agent, event.tool, event.file, event.at, true);
        if (event.tool === 'SendMessage' && event.to && !replay) this.addLetter(agent, event.to, event.at);
        break;
      }
    }
  }

  private remember(
    agent: AgentRecord,
    tool: string,
    file: string | undefined,
    at: number,
    current: boolean,
  ): void {
    const activity: Activity = file ? { tool, file, at } : { tool, at };
    if (current) agent.current = activity;
    agent.recent.push(activity);
    agent.recent.sort((a, b) => b.at - a.at);
    if (agent.recent.length > RECENT_LIMIT) agent.recent.length = RECENT_LIMIT;
  }

  private addLetter(from: AgentRecord, toName: string, at: number): void {
    // Aynı adı taşıyan birden çok oturum varsa ilk eklenen (eski davranışla aynı).
    const toId = this.sessionsByName.get(toName)?.values().next().value;
    const letter: Letter = { id: `l${++this.letterSeq}`, fromId: from.id, toName, at };
    if (toId !== undefined) letter.toId = toId;
    this.letters.push(letter);
  }

  private ensureSession(sessionId: string, project: string | undefined): AgentRecord {
    let agent = this.agents.get(sessionId);
    if (!agent) {
      const proj = project ?? UNKNOWN_PROJECT;
      agent = {
        id: sessionId,
        name: '',
        project: proj,
        kind: 'session',
        role: 'lead',
        status: 'idle',
        lastActivityAt: 0,
        recent: [],
        stats: emptyStats(),
      };
      this.agents.set(sessionId, agent);
      this.rename(agent, `${proj.toLowerCase()}-${sessionId.slice(0, 4)}`);
    }
    return agent;
  }

  /** Ana oturumun adını değiştirir; ad dizinini günceller. */
  private rename(agent: AgentRecord, name: string): void {
    if (agent.name === name) return;
    this.unindex(agent);
    agent.name = name;
    let ids = this.sessionsByName.get(name);
    if (!ids) this.sessionsByName.set(name, (ids = new Set()));
    ids.add(agent.id);
  }

  private unindex(agent: AgentRecord): void {
    const ids = this.sessionsByName.get(agent.name);
    if (!ids) return;
    ids.delete(agent.id);
    if (ids.size === 0) this.sessionsByName.delete(agent.name);
  }

  private remove(agent: AgentRecord): void {
    this.agents.delete(agent.id);
    if (agent.kind === 'session') this.unindex(agent);
  }

  private ensureSubagent(agentId: string, parent: AgentRecord, label: string | undefined): AgentRecord {
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = {
        id: agentId,
        name: label ?? 'Yardımcı ajan',
        project: parent.project,
        kind: 'subagent',
        role: 'developer',
        parentId: parent.id,
        status: 'thinking',
        lastActivityAt: 0,
        recent: [],
        stats: emptyStats(),
      };
      this.agents.set(agentId, agent);
    } else if (label && agent.name === 'Yardımcı ajan') {
      agent.name = label;
    }
    return agent;
  }

  /**
   * Ekranda gösterilecek ajanları ve durumlarını bulur; bir daha gösterilmeyecek kayıtları da siler (O(n)):
   * gizlenmiş kapalı oturumlar (alt ajanlarıyla birlikte), bekleme süresi dolmuş bitmiş alt ajanlar ve artık hiç
   * ajanı kalmayan projelerin klasör/ekip kayıtları. Silinen bir ajanın dosyasına yeni satır gelirse yeniden
   * oluşturulur.
   */
  private sweep(now: number): Array<[AgentRecord, AgentStatus]> {
    const visible: Array<[AgentRecord, AgentStatus]> = [];
    const sessionStatus = new Map<string, AgentStatus>();

    for (const agent of this.agents.values()) {
      if (agent.kind !== 'session') continue;
      const status = this.resolveSessionStatus(agent, now);
      if (status === null) {
        this.remove(agent);
        continue;
      }
      sessionStatus.set(agent.id, status);
      visible.push([agent, status]);
    }
    for (const agent of this.agents.values()) {
      if (agent.kind !== 'subagent') continue;
      const parentStatus = agent.parentId === undefined ? undefined : sessionStatus.get(agent.parentId);
      // Ana oturumu gizlendi (ve silindi): alt ajan da gider.
      if (parentStatus === undefined) {
        this.remove(agent);
        continue;
      }
      let status = this.withError(agent, now);
      if (parentStatus === 'offline') status = 'offline';
      // Sessizliği yüzünden bitmiş sayılan alt ajan da rapor verip çıkabilsin diye bekleme süresi o andan sayılır.
      let lingerFrom = agent.lastActivityAt;
      if (
        status !== 'idle' &&
        status !== 'offline' &&
        status !== 'asking' &&
        now - agent.lastActivityAt > SUBAGENT_STALE_MS
      ) {
        status = 'idle';
        lingerFrom = agent.lastActivityAt + SUBAGENT_STALE_MS;
      }
      const finished = status === 'idle' || status === 'offline';
      if (finished && now - lingerFrom > SUBAGENT_LINGER_MS) {
        this.remove(agent);
        continue;
      }
      visible.push([agent, status]);
    }

    const projects = new Set(visible.map(([a]) => a.project));
    for (const project of this.dirs.keys()) if (!projects.has(project)) this.dirs.delete(project);
    for (const project of this.teams.keys()) if (!projects.has(project)) this.teams.delete(project);
    this.letters = this.letters.filter((l) => now - l.at < LETTER_TTL_MS);
    return visible;
  }

  /** Bir daha gösterilmeyecek kayıtları siler (snapshot da bunu yapar; toplayıcı periyodik olarak çağırır). */
  prune(): void {
    this.sweep(this.now());
  }

  /** Ekranda gösterilecek durum: canlılık, zaman aşımı ve görünürlük kuralları uygulanmış haliyle. */
  snapshot(): OfficeSnapshot {
    const now = this.now();
    const visible: Agent[] = this.sweep(now).map(([agent, status]) =>
      agent.kind === 'session'
        ? publicAgent(agent, status, 'lead')
        : publicAgent(
            agent,
            status,
            inferRole({
              kind: 'subagent',
              ...(agent.agentType ? { agentType: agent.agentType } : {}),
              team: this.teamRoles(agent.project),
              stats: agent.stats,
              ...(agent.name !== 'Yardımcı ajan' ? { label: agent.name } : {}),
            }),
          ),
    );
    const teams: Team[] = [...this.teams]
      .sort(([a], [b]) => a.localeCompare(b, 'tr'))
      .map(([project, members]) => ({ project, members: members.map((m) => ({ ...m })) }));

    return {
      agents: visible.sort(
        (a, b) => a.project.localeCompare(b.project, 'tr') || a.name.localeCompare(b.name, 'tr'),
      ),
      teams,
      letters: this.letters.map((l) => ({ ...l })),
      now,
    };
  }

  private teamRoles(project: string): Map<string, AgentRole> {
    const map = new Map<string, AgentRole>();
    for (const m of this.teams.get(project) ?? []) {
      map.set(m.name, m.role);
      map.set(normalizeName(m.name), m.role);
    }
    return map;
  }

  private resolveSessionStatus(agent: AgentRecord, now: number): AgentStatus | null {
    const live = this.live.get(agent.id);
    if (!live) {
      // Süreci kapanmış: bir süre sönük kalır, sonra gizlenir.
      return now - agent.lastActivityAt < OFFLINE_VISIBLE_MS ? 'offline' : null;
    }
    const status = this.withError(agent, now);
    if (live.status === 'idle' && status !== 'asking' && status !== 'error') return 'idle';
    if (live.status === 'busy' && status === 'idle') return 'thinking';
    return status;
  }

  private withError(agent: AgentRecord, now: number): AgentStatus {
    if (agent.status === 'error' && (agent.errorUntil ?? 0) <= now) return 'idle';
    return agent.status;
  }
}

const UNKNOWN_PROJECT = 'Proje';

function projectOf(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? UNKNOWN_PROJECT;
}

/** Rol tahmini için araç sayaçları (içerik yok). */
function countTool(stats: ToolStats, tool: string, test: boolean): void {
  stats.total += 1;
  const status = statusForTool(tool);
  if (status === 'reading' || status === 'searching') stats.reads += 1;
  if (status === 'writing') stats.writes += 1;
  if (test) stats.tests += 1;
}

function publicAgent(agent: AgentRecord, status: AgentStatus, role: AgentRole): Agent {
  const { errorUntil: _errorUntil, stats: _stats, ...rest } = agent;
  const copy: Agent = { ...rest, role, status, recent: agent.recent.map((r) => ({ ...r })) };
  if (agent.current) copy.current = { ...agent.current };
  if (status === 'idle' || status === 'offline') delete copy.current;
  return copy;
}
