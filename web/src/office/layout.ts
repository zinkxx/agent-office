import type { Agent } from '../../../shared/types.ts';
import { groupByProject } from '../labels.ts';

/**
 * Ofis yerleşimi: her proje bir "ada" (oda), her ana oturum adada bir masa, yardımcı ajanlar masanın yanında.
 * Saf fonksiyon: aynı girdi → aynı yerleşim. Birimler sahnedeki metre benzeri birimlerdir; y yukarıdır.
 */

export const DESK_SPACING_X = 3.6;
export const DESK_SPACING_Z = 4.2;
const DESKS_PER_ROW = 3;
const ISLAND_PAD_X = 1.2;
const ISLAND_PAD_Z = 1.4;
const ISLAND_GAP = 3;
/** Bir masanın yanında en fazla bu kadar yardımcı çizilir; fazlası yalnızca listede görünür. */
export const MAX_VISIBLE_SUBAGENTS = 8;

export interface IslandSlot {
  project: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface DeskSlot {
  agentId: string;
  project: string;
  x: number;
  z: number;
}

export interface SubSlot {
  agentId: string;
  parentId: string;
  x: number;
  z: number;
}

export interface OfficeLayout {
  islands: IslandSlot[];
  desks: DeskSlot[];
  subs: SubSlot[];
  /** Ana oturumun yanına sığmayan yardımcı sayısı. */
  hiddenSubs: Map<string, number>;
  /** Tüm ofisin kapladığı alan (kamera ve gölge için). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export function computeLayout(agents: Agent[]): OfficeLayout {
  const groups = groupByProject(agents).filter((g) => g.sessions.length > 0);

  // 1) Her adanın boyutu
  const sized = groups.map((g) => {
    const n = g.sessions.length;
    const cols = Math.min(DESKS_PER_ROW, n);
    const rows = Math.ceil(n / cols);
    return {
      group: g,
      cols,
      rows,
      w: cols * DESK_SPACING_X + ISLAND_PAD_X * 2 - 1,
      d: rows * DESK_SPACING_Z + ISLAND_PAD_Z * 2 - 1,
    };
  });

  // 2) Adaları ızgaraya diz (satır satır), sonra her şeyi merkeze al
  const perRow = Math.max(1, Math.ceil(Math.sqrt(sized.length)));
  const islands: IslandSlot[] = [];
  let cursorZ = 0;
  for (let i = 0; i < sized.length; i += perRow) {
    const row = sized.slice(i, i + perRow);
    const rowDepth = Math.max(...row.map((s) => s.d));
    let cursorX = 0;
    for (const s of row) {
      islands.push({
        project: s.group.project,
        x: cursorX + s.w / 2,
        z: cursorZ + rowDepth / 2,
        w: s.w,
        d: s.d,
      });
      cursorX += s.w + ISLAND_GAP;
    }
    cursorZ += rowDepth + ISLAND_GAP;
  }
  const raw = boundsOf(islands);
  const cx = (raw.minX + raw.maxX) / 2;
  const cz = (raw.minZ + raw.maxZ) / 2;
  for (const island of islands) {
    island.x -= cx;
    island.z -= cz;
  }

  // 3) Masalar ve yardımcılar
  const desks: DeskSlot[] = [];
  const subs: SubSlot[] = [];
  const hiddenSubs = new Map<string, number>();
  sized.forEach((s, i) => {
    const island = islands[i]!;
    s.group.sessions.forEach((entry, k) => {
      const col = k % s.cols;
      const row = Math.floor(k / s.cols);
      const x = island.x + (col - (s.cols - 1) / 2) * DESK_SPACING_X;
      const z = island.z + (row - (s.rows - 1) / 2) * DESK_SPACING_Z;
      desks.push({ agentId: entry.agent.id, project: s.group.project, x, z });
      entry.subagents.slice(0, MAX_VISIBLE_SUBAGENTS).forEach((sub, j) => {
        subs.push({
          agentId: sub.id,
          parentId: entry.agent.id,
          x: x + 1.45 + (j % 2) * 0.62,
          z: z - 0.9 + Math.floor(j / 2) * 0.62,
        });
      });
      const extra = entry.subagents.length - MAX_VISIBLE_SUBAGENTS;
      if (extra > 0) hiddenSubs.set(entry.agent.id, extra);
    });
  });

  return { islands, desks, subs, hiddenSubs, bounds: boundsOf(islands) };
}

function boundsOf(islands: IslandSlot[]): OfficeLayout['bounds'] {
  if (islands.length === 0) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  return {
    minX: Math.min(...islands.map((i) => i.x - i.w / 2)),
    maxX: Math.max(...islands.map((i) => i.x + i.w / 2)),
    minZ: Math.min(...islands.map((i) => i.z - i.d / 2)),
    maxZ: Math.max(...islands.map((i) => i.z + i.d / 2)),
  };
}

/** Bir ajanın sahnedeki konumu (kamera odağı için). Bulunamazsa undefined. */
export function positionOf(layout: OfficeLayout, agentId: string): { x: number; z: number } | undefined {
  return layout.desks.find((d) => d.agentId === agentId) ?? layout.subs.find((s) => s.agentId === agentId);
}
