import type { Activity, Agent, AgentRole } from '../../shared/types.ts';
import { isActive } from './labels.ts';

/**
 * Bir projenin özeti (proje paneli): oturumlar, yardımcılar ve tüm ajanların son işlemleri tek zaman çizelgesinde.
 * Saf fonksiyon; içerik görmez, yalnızca ajanların zaten taşıdığı işlem türü ve dosya adı kullanılır.
 */

export interface ProjectActivityItem {
  agentId: string;
  name: string;
  role: AgentRole;
  activity: Activity;
}

export interface ProjectOverview {
  project: string;
  /** Ana oturumlar, en son etkin olan başta. */
  sessions: Agent[];
  /** Yardımcı ajanlar, en son etkin olan başta. */
  helpers: Agent[];
  /** Şu an çalışan ajan sayısı (oturum + yardımcı). */
  working: number;
  /** En son etkinlik zamanı (ms); hiç yoksa 0. */
  lastActivityAt: number;
  /** Tüm ajanların işlemleri, en yeni başta. */
  items: ProjectActivityItem[];
}

export const PROJECT_ACTIVITY_LIMIT = 40;

const newestFirst = (x: Agent, y: Agent) => y.lastActivityAt - x.lastActivityAt;

/** Claude masaüstü uygulamasının klasörsüz oturumları için açtığı geçici klasörün adı, ör. "scratch-2026-11-25-a1d895". */
const SCRATCH_FOLDER = /^scratch-\d{4}-\d{2}-\d{2}-[0-9a-f]+$/i;

/**
 * Ekranda gösterilecek proje adı. Klasörsüz oturumların klasör adı anlamsızdır: o zaman projedeki en son etkin
 * oturumun başlığı (başlıklar kapalıysa ya da yoksa, zaten görünen oturum adı) gösterilir.
 */
export function projectDisplayName(agents: readonly Agent[], project: string, useTitles = true): string {
  if (!SCRATCH_FOLDER.test(project)) return project;
  const latest = agents.filter((a) => a.project === project && a.kind === 'session').sort(newestFirst)[0];
  return (useTitles && latest?.title?.trim()) || latest?.name.trim() || project;
}

export function projectOverview(
  agents: readonly Agent[],
  project: string,
  limit = PROJECT_ACTIVITY_LIMIT,
): ProjectOverview {
  const inProject = agents.filter((a) => a.project === project);
  const items: ProjectActivityItem[] = [];
  const seen = new Set<string>();
  for (const a of inProject) {
    for (const activity of a.recent) {
      // Aynı ajanın aynı andaki aynı işlemi iki kez gelirse bir kez göster.
      const key = `${a.id}|${activity.at}|${activity.tool}|${activity.file ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ agentId: a.id, name: a.name, role: a.role, activity });
    }
  }
  items.sort((x, y) => y.activity.at - x.activity.at || x.name.localeCompare(y.name));
  return {
    project,
    sessions: inProject.filter((a) => a.kind === 'session').sort(newestFirst),
    helpers: inProject.filter((a) => a.kind === 'subagent').sort(newestFirst),
    working: inProject.filter((a) => isActive(a.status)).length,
    lastActivityAt: inProject.reduce((m, a) => Math.max(m, a.lastActivityAt), 0),
    items: items.slice(0, Math.max(0, limit)),
  };
}
