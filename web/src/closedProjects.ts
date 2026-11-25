import type { Agent, OfficeSnapshot } from '../../shared/types.ts';
import { visibleAgents, withoutClosedProjects, type Settings } from './settings.ts';

/**
 * Kapatılan (gizlenen) projeler. Saf fonksiyonlar, React'sız ve testli. "Kapatmak" yalnızca Ajan Ofisi'nde
 * gizler: oturumlar, süreçler ve `~/.claude` altındaki dosyalar değişmez. Projede kapatıldığı andan sonra
 * etkinlik olursa (bir ajanın `lastActivityAt`'i daha yeniyse) proje kendiliğinden geri gelir.
 */

export type ClosedProjects = Settings['closedProjects'];

/** Proje şu an kapalı mı: kapatılmış ve o andan sonra hiçbir ajanında etkinlik yok. */
export function isProjectClosed(
  agents: readonly Agent[],
  project: string,
  closedAt: number | undefined,
): boolean {
  if (closedAt === undefined) return false;
  return !agents.some((a) => a.project === project && a.lastActivityAt > closedAt);
}

/** Şu an kapalı olan projeler. */
export function closedProjectSet(agents: readonly Agent[], closed: ClosedProjects): Set<string> {
  const out = new Set<string>();
  for (const [project, at] of Object.entries(closed))
    if (isProjectClosed(agents, project, at)) out.add(project);
  return out;
}

/** Kapatıldıktan sonra yeniden etkinlik olan projeler: kayıtları silinmeli (bkz. store.ts applySnapshot). */
export function reopenedProjects(agents: readonly Agent[], closed: ClosedProjects): string[] {
  return Object.entries(closed)
    .filter(([project, at]) => !isProjectClosed(agents, project, at))
    .map(([project]) => project);
}

/**
 * Anlık görüntü geldiğinde kapatma kayıtlarını temizler: yeniden etkinlik olan projelerin kaydı silinir (proje
 * geri gelir). Silinecek kayıt yoksa aynı nesne döner (bkz. store.ts applySnapshot).
 */
export function pruneReopened(agents: readonly Agent[], closed: ClosedProjects): ClosedProjects {
  const reopened = reopenedProjects(agents, closed);
  return reopened.length === 0 ? closed : withoutClosedProjects(closed, reopened);
}

export interface Selection {
  selectedId: string | null;
  selectedProject: string | null;
}

/**
 * Proje kapatılınca silinecek seçimler: o proje seçiliyse proje seçimi, seçili ajan o projedeyse ajan seçimi.
 * Silinecek bir şey yoksa `null` (bkz. store.ts closeProject).
 */
export function selectionAfterClose(
  agents: readonly Agent[],
  project: string,
  selection: Selection,
): Partial<{ selectedId: null; selectedProject: null }> | null {
  const clearProject = selection.selectedProject === project;
  const selected = selection.selectedId ? agents.find((a) => a.id === selection.selectedId) : undefined;
  const clearAgent = selected?.project === project;
  if (!clearProject && !clearAgent) return null;
  return {
    ...(clearProject ? { selectedProject: null } : {}),
    ...(clearAgent ? { selectedId: null } : {}),
  };
}

/** Kapalı projelerin ajanları çıkarılmış liste. Kapalı proje yoksa aynı dizi döner. */
export function withoutClosed(agents: Agent[], closed: ClosedProjects): Agent[] {
  const set = closedProjectSet(agents, closed);
  return set.size === 0 ? agents : agents.filter((a) => !set.has(a.project));
}

/**
 * Listede, sahnede ve özette gösterilecek ajanlar: kapalı projeler ve ("Kapalıları gizle" açıksa) kapalı
 * oturumlar ile işini bitirmiş yardımcılar çıkarılır. Tüm görünüm yerleri bu tek filtreyi kullanır.
 */
export function shownAgents(
  agents: Agent[],
  settings: Pick<Settings, 'hideOffline' | 'closedProjects'>,
  options: { keepFinished?: boolean } = {},
): Agent[] {
  return visibleAgents(withoutClosed(agents, settings.closedProjects), settings.hideOffline, options);
}

/**
 * Kapalı projeleri (ajanları ve ekipleri) çıkarılmış anlık görüntü: proje seçici, görünüm seçimi ve rol
 * filtresi bunu kullanır. Kapalı proje yoksa aynı nesne döner.
 */
export function openSnapshot(snapshot: OfficeSnapshot | null, closed: ClosedProjects): OfficeSnapshot | null {
  if (!snapshot) return null;
  const set = closedProjectSet(snapshot.agents, closed);
  if (set.size === 0) return snapshot;
  return {
    ...snapshot,
    agents: snapshot.agents.filter((a) => !set.has(a.project)),
    teams: snapshot.teams.filter((t) => !set.has(t.project)),
  };
}

export interface ClosedProjectItem {
  project: string;
  closedAt: number;
}

/**
 * "Kapatılan projeler" bölümü: anlık görüntüde hâlâ ajanı olan kapalı projeler, en son kapatılan başta
 * (eşitlikte ada göre).
 */
export function closedProjectList(agents: readonly Agent[], closed: ClosedProjects): ClosedProjectItem[] {
  const present = new Set(agents.map((a) => a.project));
  return Object.entries(closed)
    .filter(([project, at]) => present.has(project) && isProjectClosed(agents, project, at))
    .map(([project, closedAt]) => ({ project, closedAt }))
    .sort((a, b) => b.closedAt - a.closedAt || a.project.localeCompare(b.project, 'tr'));
}

/**
 * Kapatma anı (sunucu saati): şimdi, ama projenin en son etkinliğinden önce değil. Böylece sunucu ile tarayıcı
 * saati arasındaki küçük bir kayma projenin hemen geri gelmesine yol açmaz.
 */
export function closeTime(agents: readonly Agent[], project: string, serverNow: number): number {
  let at = serverNow;
  for (const a of agents) if (a.project === project && a.lastActivityAt > at) at = a.lastActivityAt;
  return at;
}
