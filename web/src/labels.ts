import type { Activity, Agent, AgentRole, AgentStatus } from '../../shared/types.ts';
import { translate, type Lang } from './i18n.ts';

/** Durumun adı ("okuyor" / "reading"); `finished`: işini bitirmiş yardımcı. */
export function statusLabel(status: AgentStatus | 'finished', lang: Lang): string {
  return translate(lang, `status.${status}`);
}

/** "Gece" teması durum renkleri (ekran, masa lambası, listedeki nokta). */
export const STATUS_COLOR: Record<AgentStatus, string> = {
  thinking: '#c58bff',
  reading: '#6fb4ff',
  writing: '#ff4f8b',
  terminal: '#4ee08a',
  searching: '#ffc04d',
  delegating: '#ff8a3d',
  messaging: '#4fd2ff',
  asking: '#ffe14d',
  working: '#ff8fa8',
  error: '#ff3b3b',
  idle: '#9c7a86',
  offline: '#3b2a31',
};

/** Rolün adı ("Geliştirici" / "Developer"). */
export function roleLabel(role: AgentRole, lang: Lang): string {
  return translate(lang, `role.${role}`);
}

/** Masa adalarının tabelası (grup adı: "Geliştirme" / "Development"). */
export function roleGroupLabel(role: AgentRole, lang: Lang): string {
  return translate(lang, `group.${role}`);
}

/** Rol rengi (filtre çipleri, listedeki rozet, masa adası tabelası). */
export const ROLE_COLOR: Record<AgentRole, string> = {
  lead: '#ffb547',
  designer: '#ff6fb5',
  developer: '#8f8bff',
  tester: '#5fe0a0',
  reviewer: '#6fc8ff',
  researcher: '#ffd36b',
  architect: '#c69bff',
  other: '#c49aa6',
};

/** Durum "etkin" mi (ekran parlak, lamba yanık, karakter hareketli). */
export function isActive(status: AgentStatus): boolean {
  return status !== 'idle' && status !== 'offline';
}

export function entrypointLabel(entrypoint: Agent['entrypoint']): string | undefined {
  if (entrypoint === 'cli') return 'Terminal';
  if (entrypoint === 'claude-vscode') return 'VS Code';
  return undefined;
}

/**
 * Ekranda gösterilecek işlem metni, ör. "Edit · pressable.dart".
 * `hideFiles` açıkken dosya adı gösterilmez (ekran paylaşımı için).
 */
/**
 * Araç adını kısaltır: eklenti araçları "mcp__eklenti__sunucu__browser_click" gibi uzun adlarla gelir;
 * yalnızca son kısım ("browser_click") gösterilir.
 */
export function toolName(tool: string): string {
  if (!tool.startsWith('mcp__')) return tool;
  const last = tool.split('__').filter(Boolean).pop();
  return last && last !== 'mcp' ? last : tool;
}

export function activityText(activity: Activity | undefined, hideFiles = false): string | undefined {
  if (!activity) return undefined;
  const tool = toolName(activity.tool);
  return activity.file && !hideFiles ? `${tool} · ${activity.file}` : tool;
}

/** "1 sa 12 dk", "8 dk", "40 sn": çalışma süresi. */
export function durationText(ms: number, lang: Lang): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return translate(lang, 'time.seconds', { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return translate(lang, 'time.minutes', { n: m });
  const h = Math.floor(m / 60);
  return m % 60
    ? translate(lang, 'time.hoursMinutes', { h, m: m % 60 })
    : translate(lang, 'time.hours', { n: h });
}

/** "az önce", "3 dk önce", "2 sa önce". */
export function agoText(at: number, now: number, lang: Lang): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return translate(lang, 'time.justNow');
  const m = Math.round(s / 60);
  if (m < 60) return translate(lang, 'time.minutesAgo', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return translate(lang, 'time.hoursAgo', { n: h });
  return translate(lang, 'time.daysAgo', { n: Math.round(h / 24) });
}

export interface ProjectGroup {
  project: string;
  /** Ana oturumlar; her birinin yardımcıları `subagents` içinde. */
  sessions: { agent: Agent; subagents: Agent[] }[];
  /** Ana oturumu görünmeyen yardımcılar (nadiren; yine de gösterilir). */
  orphans: Agent[];
}

/** Ajanları projeye ve ana oturuma göre gruplar. Sıralama kararlıdır (proje adı, sonra ajan adı). */
export function groupByProject(agents: Agent[]): ProjectGroup[] {
  const byProject = new Map<string, ProjectGroup>();
  const group = (project: string): ProjectGroup => {
    let g = byProject.get(project);
    if (!g) {
      g = { project, sessions: [], orphans: [] };
      byProject.set(project, g);
    }
    return g;
  };
  const sessionsById = new Map<string, { agent: Agent; subagents: Agent[] }>();
  for (const a of agents) {
    if (a.kind !== 'session') continue;
    const entry = { agent: a, subagents: [] as Agent[] };
    sessionsById.set(a.id, entry);
    group(a.project).sessions.push(entry);
  }
  for (const a of agents) {
    if (a.kind !== 'subagent') continue;
    const parent = a.parentId ? sessionsById.get(a.parentId) : undefined;
    if (parent) parent.subagents.push(a);
    else group(a.project).orphans.push(a);
  }
  const byName = (x: Agent, y: Agent) => x.name.localeCompare(y.name, 'tr');
  const groups = [...byProject.values()].sort((x, y) => x.project.localeCompare(y.project, 'tr'));
  for (const g of groups) {
    g.sessions.sort((x, y) => byName(x.agent, y.agent));
    for (const s of g.sessions) s.subagents.sort(byName);
    g.orphans.sort(byName);
  }
  return groups;
}
