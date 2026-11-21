import type { Agent, AgentRole, AgentStatus, TeamMember } from '../../../shared/types.ts';
import type { MessageKey } from '../i18n.ts';

/**
 * Teknoloji eşyalarının (sunucu ışıkları, duvar panosu, derleme lambası, kanban, giriş ekranı) canlı veriden
 * okuduğu her şey. Saf ve testli; çizim tarafı yalnızca bunları gösterir. Yalnızca sayı, rol ve ad (oturum adı ya
 * da ekip üyesinin adı) kullanılır; iş içeriği, dosya adı, komut kullanılmaz.
 */

const working = (s: AgentStatus) => s !== 'idle' && s !== 'offline';

/** Derleme lambasının durumu: hata > seni bekliyor > çalışıyor > sakin. */
export type BuildState = 'error' | 'asking' | 'busy' | 'quiet';

export function buildState(agents: readonly Agent[]): BuildState {
  let busy = false;
  let asking = false;
  for (const a of agents) {
    if (a.status === 'error') return 'error';
    if (a.status === 'asking') asking = true;
    else if (working(a.status)) busy = true;
  }
  return asking ? 'asking' : busy ? 'busy' : 'quiet';
}

/** Lamba ve LED şerit renkleri: kırmızı, sarı, yeşil (sakinken de yeşil, yalnızca sönük). */
export const BUILD_COLOR: Record<BuildState, string> = {
  error: '#ff3b4e',
  asking: '#ffc23a',
  busy: '#3fe07f',
  quiet: '#3fe07f',
};

/** Panodaki durum yazısının sözlük anahtarı ("Her şey yolunda" / "All good"). */
export const BUILD_TEXT: Record<BuildState, MessageKey> = {
  error: 'build.error',
  asking: 'build.asking',
  busy: 'build.busy',
  quiet: 'build.quiet',
};

export interface OpsStats {
  /** Şu an çalışan ajanlar (oturum + yardımcı). */
  working: number;
  /** Boştaki oturumlar ve çalışmayan ekip üyeleri. */
  idle: number;
  /** Son 10 dakikadaki işlemler, dakika dakika (en eski başta). */
  perMinute: number[];
  total: number;
}

export const OPS_MINUTES = 10;

/**
 * Duvar panosunun sayıları. `idleMembers`: ofiste boşta dolaşan ekip üyeleri. İşini bitirip ofisten çıkmış genel
 * yardımcılar sayılmaz. İşlem sayısı ajanların son işlemlerinden çıkarılır (ajan başına en fazla 20; kabaca).
 */
export function opsStats(agents: readonly Agent[], idleMembers: number, now: number): OpsStats {
  const perMinute = new Array<number>(OPS_MINUTES).fill(0);
  let busy = 0;
  let idle = idleMembers;
  for (const a of agents) {
    if (working(a.status)) busy++;
    else if (a.status === 'idle' && a.kind === 'session') idle++;
    for (const r of a.recent) {
      const ago = Math.floor((now - r.at) / 60_000);
      if (ago >= 0 && ago < OPS_MINUTES) perMinute[OPS_MINUTES - 1 - ago]!++;
    }
  }
  return { working: busy, idle, perMinute, total: perMinute.reduce((n, x) => n + x, 0) };
}

/** Sunucu ışıklarının hareketliliği (0,15–1): çalışanların oranı. */
export function rackLevel(agents: readonly Agent[]): number {
  const live = agents.filter((a) => a.status !== 'offline');
  if (live.length === 0) return 0.15;
  const busy = live.filter((a) => working(a.status)).length;
  return 0.15 + 0.85 * (busy / live.length);
}

export interface KanbanNote {
  id: string;
  role: AgentRole;
  /** 0 yapılacak, 1 yapılıyor, 2 bitti. */
  column: 0 | 1 | 2;
}

/** Bir sütunda en fazla bu kadar not (pano taşmasın). */
export const KANBAN_MAX = 8;
const BACKLOG: AgentRole[] = ['designer', 'developer', 'tester'];

/**
 * Kanban notları: "Yapılacak"ta sabit birkaç not (iş listesi), "Yapılıyor"da çalışan her ajan, "Bitti"de işini
 * bitirmiş yardımcılar (en yeniler). Not kimliği ajanın kimliğidir: iş bitince aynı not "Bitti"ye kayar.
 */
export function kanbanNotes(agents: readonly Agent[]): KanbanNote[] {
  const notes: KanbanNote[] = BACKLOG.map((role, i) => ({ id: `backlog:${i}`, role, column: 0 }));
  const doing = agents.filter((a) => working(a.status)).slice(0, KANBAN_MAX);
  const done = agents
    .filter((a) => a.kind === 'subagent' && !working(a.status))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .slice(0, KANBAN_MAX);
  for (const a of doing) notes.push({ id: a.id, role: a.role, column: 1 });
  for (const a of done) notes.push({ id: a.id, role: a.role, column: 2 });
  return notes;
}

export interface Presence {
  role: AgentRole;
  /** Oturum adı, ekip üyesinin adı ya da (genel yardımcıda) rolün adı. */
  label: string;
  working: boolean;
}

export const PRESENCE_MAX = 10;

/**
 * Giriş ekranındaki "Bugün ofiste" listesi: açık oturumlar, çalışan yardımcılar ve ofiste boşta dolaşan ekip
 * üyeleri (o an çalışan üyenin yardımcısı zaten listede olduğu için `busyMembers` ikinci kez yazılmaz).
 */
export function presence(
  agents: readonly Agent[],
  members: readonly TeamMember[],
  busyMembers: ReadonlySet<string>,
  roleLabel: (role: AgentRole) => string,
): Presence[] {
  const out: Presence[] = [];
  for (const a of agents) {
    if (a.kind === 'session' && a.status !== 'offline')
      out.push({ role: 'lead', label: a.name, working: working(a.status) });
  }
  for (const a of agents) {
    if (a.kind !== 'subagent' || !working(a.status)) continue;
    const member = a.agentType && members.find((m) => m.name === a.agentType);
    out.push({ role: a.role, label: member ? member.name : roleLabel(a.role), working: true });
  }
  for (const m of members) {
    if (!busyMembers.has(m.name)) out.push({ role: m.role, label: m.name, working: false });
  }
  return out.slice(0, PRESENCE_MAX);
}
