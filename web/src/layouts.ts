import type { IslandLayout } from './office/sim/plan.ts';

/** Proje başına kullanıcının taşıdığı adalar: proje adı → (ada kimliği → konum). */
export type SavedLayouts = Readonly<Record<string, IslandLayout>>;

export const LAYOUTS_KEY = 'ajan-ofisi:duzen';

const MAX_PROJECTS = 60;
const MAX_ISLANDS = 40;
const MAX_KEY = 80;
/** Odanın dışına taşmış uçuk değerler zaten plan tarafından reddedilir; burada yalnızca makul aralık. */
const MAX_COORD = 500;

/** Saklanan metni düzenlere çevirir; bozuk kayıtlar ve uçuk değerler atılır. */
export function parseLayouts(raw: string | null): SavedLayouts {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: Record<string, Record<string, { x: number; z: number }>> = {};
  for (const [project, islands] of Object.entries(data).slice(0, MAX_PROJECTS)) {
    if (project.length > MAX_KEY || !islands || typeof islands !== 'object' || Array.isArray(islands))
      continue;
    const clean: Record<string, { x: number; z: number }> = {};
    for (const [id, pos] of Object.entries(islands as Record<string, unknown>).slice(0, MAX_ISLANDS)) {
      if (id.length > MAX_KEY || !pos || typeof pos !== 'object') continue;
      const { x, z } = pos as { x?: unknown; z?: unknown };
      if (typeof x !== 'number' || typeof z !== 'number') continue;
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > MAX_COORD || Math.abs(z) > MAX_COORD)
        continue;
      clean[id] = { x, z };
    }
    if (Object.keys(clean).length > 0) out[project] = clean;
  }
  return out;
}

/** Bir adanın yeni konumunu ekler (değişmez kopya döner). */
export function withIsland(
  layouts: SavedLayouts,
  project: string,
  islandId: string,
  pos: { x: number; z: number },
): SavedLayouts {
  return { ...layouts, [project]: { ...(layouts[project] ?? {}), [islandId]: { x: pos.x, z: pos.z } } };
}

/** Projenin düzenini siler (varsayılana döner). */
export function withoutProject(layouts: SavedLayouts, project: string): SavedLayouts {
  const { [project]: _removed, ...rest } = layouts;
  return rest;
}
