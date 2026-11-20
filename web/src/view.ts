import type { Agent, OfficeSnapshot } from '../../shared/types.ts';

/** Görünüm: tüm projeler ya da tek bir projenin büyük ofisi. */
export type View = { kind: 'all' } | { kind: 'project'; project: string };

/** Tarayıcıda hatırlanan seçim: "*" = tüm projeler, diğerleri proje adı. */
export const ALL_PROJECTS = '*';

/** Görünen projeler (ajanı ya da ekip listesi olan), ada göre sıralı. */
export function projectsOf(snapshot: OfficeSnapshot | null): string[] {
  if (!snapshot) return [];
  const set = new Set<string>(snapshot.agents.map((a) => a.project));
  return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
}

/** En son etkin proje (en yeni etkinliği olan ajanın projesi). Eşitlikte ada göre ilk. */
export function mostRecentProject(agents: readonly Agent[]): string | undefined {
  let best: Agent | undefined;
  for (const a of agents) {
    if (
      !best ||
      a.lastActivityAt > best.lastActivityAt ||
      (a.lastActivityAt === best.lastActivityAt && a.project.localeCompare(best.project, 'tr') < 0)
    )
      best = a;
  }
  return best?.project;
}

/**
 * Hangi görünüm çizilecek: hatırlanan seçim geçerliyse o; değilse en son etkin proje; hiç proje yoksa tüm projeler.
 * Hatırlanan proje şu an görünmüyorsa seçim silinmez, yalnızca o an en son etkin proje gösterilir.
 */
export function resolveView(saved: string | null, snapshot: OfficeSnapshot | null): View {
  if (saved === ALL_PROJECTS) return { kind: 'all' };
  const projects = projectsOf(snapshot);
  if (saved && projects.includes(saved)) return { kind: 'project', project: saved };
  const recent = mostRecentProject(snapshot?.agents ?? []);
  return recent ? { kind: 'project', project: recent } : { kind: 'all' };
}

export function viewKey(view: View): string {
  return view.kind === 'all' ? ALL_PROJECTS : view.project;
}

/** Bu genişliğin altında yan panel sahnenin üstüne biner (styles.css'teki 900 px kırılımıyla aynı). */
export const WIDE_MIN = 900;

/** Düzenleme modu açılırken yan panel açık kalabilir mi: dar pencerede sahneyi kapatmasın diye kapanır. */
export function keepPanelWhileEditing(windowWidth: number): boolean {
  return windowWidth >= WIDE_MIN;
}
