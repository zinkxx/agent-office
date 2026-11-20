/**
 * Ofis zemininde ızgara üzerinde yol bulma (A*).
 *
 * - Izgara, zemini `cell` metrelik karelere böler; her kare ya boş ya da engellidir (mobilya, duvar).
 * - 8 yönlü hareket; çapraz adımda iki yan kare de boş olmalı (köşe kesilmez, mobilyaya sürtünülmez).
 * - Bulunan yol, görüş hattı kontrolüyle sadeleştirilir: karakter gereksiz zikzak yapmadan düz yürür.
 * Saf modül: React ya da Three.js kullanmaz.
 */

export interface Point {
  x: number;
  z: number;
}

export interface Cell {
  c: number;
  r: number;
}

export class WalkGrid {
  readonly blocked: Uint8Array;

  constructor(
    /** Sütun sayısı (x ekseni). */
    readonly cols: number,
    /** Satır sayısı (z ekseni). */
    readonly rows: number,
    /** Bir karenin kenarı (m). */
    readonly cell: number,
    /** Izgaranın sol-üst köşesinin dünya koordinatı. */
    readonly originX: number,
    readonly originZ: number,
  ) {
    this.blocked = new Uint8Array(cols * rows);
  }

  /** Verilen dikdörtgen alanı kaplayan alanı (dünya koordinatları) çevirir. */
  static covering(minX: number, maxX: number, minZ: number, maxZ: number, cell: number): WalkGrid {
    const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
    const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    return new WalkGrid(cols, rows, cell, minX, minZ);
  }

  inside(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  isFree(c: number, r: number): boolean {
    return this.inside(c, r) && this.blocked[r * this.cols + c] === 0;
  }

  toCell(p: Point): Cell {
    return {
      c: Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - this.originX) / this.cell))),
      r: Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - this.originZ) / this.cell))),
    };
  }

  /** Karenin merkezi. */
  toWorld(c: number, r: number): Point {
    return { x: this.originX + (c + 0.5) * this.cell, z: this.originZ + (r + 0.5) * this.cell };
  }

  /** Dikdörtgeni (merkezleri içinde kalan kareleri) engelli yapar. Döndürülmüş dikdörtgen için açı verilir. */
  blockRect(cx: number, cz: number, w: number, d: number, angle = 0, value: 0 | 1 = 1): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = w / 2;
    const hd = d / 2;
    const ext = Math.abs(hw * cos) + Math.abs(hd * sin);
    const extZ = Math.abs(hw * sin) + Math.abs(hd * cos);
    const a = this.toCell({ x: cx - ext, z: cz - extZ });
    const b = this.toCell({ x: cx + ext, z: cz + extZ });
    for (let r = a.r; r <= b.r; r++) {
      for (let c = a.c; c <= b.c; c++) {
        const p = this.toWorld(c, r);
        const dx = p.x - cx;
        const dz = p.z - cz;
        // Dikdörtgenin yerel eksenlerine çevir (y ekseni etrafında `angle` dönüşü).
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        if (Math.abs(lx) <= hw + 1e-6 && Math.abs(lz) <= hd + 1e-6) this.blocked[r * this.cols + c] = value;
      }
    }
  }

  /** Noktanın içinde bulunduğu kareyi boş/engelli yapar. */
  setAt(p: Point, value: 0 | 1): void {
    const { c, r } = this.toCell(p);
    this.blocked[r * this.cols + c] = value;
  }

  /** Bir noktaya en yakın boş kare (kendisi boşsa kendisi). Hiç boş kare yoksa undefined. */
  nearestFree(p: Point): Cell | undefined {
    const start = this.toCell(p);
    if (this.isFree(start.c, start.r)) return start;
    const seen = new Uint8Array(this.cols * this.rows);
    const queue: Cell[] = [start];
    seen[start.r * this.cols + start.c] = 1;
    let best: Cell | undefined;
    let bestD = Infinity;
    let depthLimit = Infinity;
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i]!;
      const ring = Math.max(Math.abs(cur.c - start.c), Math.abs(cur.r - start.r));
      if (ring > depthLimit) break;
      if (this.isFree(cur.c, cur.r)) {
        const w = this.toWorld(cur.c, cur.r);
        const d = (w.x - p.x) ** 2 + (w.z - p.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = cur;
          depthLimit = ring + 1; // bir halka daha bak: daha yakın olan olabilir
        }
        continue;
      }
      for (const [dc, dr] of DIRS4) {
        const c = cur.c + dc;
        const r = cur.r + dr;
        if (!this.inside(c, r) || seen[r * this.cols + c]) continue;
        seen[r * this.cols + c] = 1;
        queue.push({ c, r });
      }
    }
    return best;
  }

  /** İki kare arası düz çizgi boyunca engel yok mu (karakterin genişliği için iki kenar çizgisi de denetlenir). */
  lineOfSight(a: Point, b: Point): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return true;
    const step = this.cell / 3;
    const n = Math.ceil(len / step);
    const ox = (-dz / len) * this.cell * 0.35;
    const oz = (dx / len) * this.cell * 0.35;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      for (const [sx, sz] of [
        [0, 0],
        [ox, oz],
        [-ox, -oz],
      ] as const) {
        const cell = this.toCell({ x: x + sx, z: z + sz });
        if (!this.isFree(cell.c, cell.r)) return false;
      }
    }
    return true;
  }
}

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const DIRS8 = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/** Küçük ikili yığın (öncelik kuyruğu). */
class Heap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0]!;
    const lastItem = this.items.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.items.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
  }
}

/**
 * A* ile iki nokta arasında yürünebilir yol. Başlangıç ya da hedef engelli bir karedeyse en yakın boş kare
 * kullanılır. Yol bulunamazsa null.
 * Dönen yol: kare merkezlerinden geçen ham yol (başlangıç karesi hariç, hedef karesi dahil).
 */
export function findPathCells(grid: WalkGrid, from: Point, to: Point): Cell[] | null {
  const start = grid.nearestFree(from);
  const goal = grid.nearestFree(to);
  if (!start || !goal) return null;
  const { cols } = grid;
  const startI = start.r * cols + start.c;
  const goalI = goal.r * cols + goal.c;
  if (startI === goalI) return [];
  const g = new Float64Array(grid.cols * grid.rows).fill(Infinity);
  const came = new Int32Array(grid.cols * grid.rows).fill(-1);
  const closed = new Uint8Array(grid.cols * grid.rows);
  const h = (c: number, r: number) => {
    // oktil uzaklık
    const dx = Math.abs(c - goal.c);
    const dr = Math.abs(r - goal.r);
    return Math.max(dx, dr) + (Math.SQRT2 - 1) * Math.min(dx, dr);
  };
  const open = new Heap();
  g[startI] = 0;
  open.push(startI, h(start.c, start.r));
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goalI) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const c = cur % cols;
    const r = (cur - c) / cols;
    for (const [dc, dr, cost] of DIRS8) {
      const nc = c + dc;
      const nr = r + dr;
      if (!grid.isFree(nc, nr)) continue;
      // Köşe kesme yok: çapraz adımda iki komşu da boş olmalı.
      if (dc !== 0 && dr !== 0 && (!grid.isFree(c + dc, r) || !grid.isFree(c, r + dr))) continue;
      const ni = nr * cols + nc;
      if (closed[ni]) continue;
      const ng = g[cur]! + cost;
      if (ng < g[ni]!) {
        g[ni] = ng;
        came[ni] = cur;
        open.push(ni, ng + h(nc, nr));
      }
    }
  }
  if (came[goalI] === -1) return null;
  const path: Cell[] = [];
  for (let i = goalI; i !== startI; i = came[i]!) {
    const c = i % cols;
    path.push({ c, r: (i - c) / cols });
  }
  return path.reverse();
}

/**
 * Yürünecek yol (dünya noktaları): A* yolu + görüş hattıyla sadeleştirme. Son nokta tam hedef noktasıdır
 * (hedef boş bir yerdeyse); hedef engelliyse en yakın boş karenin merkezi.
 */
export function findPath(grid: WalkGrid, from: Point, to: Point): Point[] | null {
  const cells = findPathCells(grid, from, to);
  if (!cells) return null;
  const goalCell = grid.toCell(to);
  const exactGoal = grid.isFree(goalCell.c, goalCell.r);
  const raw: Point[] = cells.map((c) => grid.toWorld(c.c, c.r));
  if (exactGoal) {
    if (raw.length > 0) raw[raw.length - 1] = { x: to.x, z: to.z };
    else raw.push({ x: to.x, z: to.z });
  }
  return smoothPath(grid, from, raw);
}

/** Görüş hattı olan ara noktaları atlar (string pulling). */
export function smoothPath(grid: WalkGrid, from: Point, points: Point[]): Point[] {
  if (points.length <= 1) return points.slice();
  const out: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < points.length) {
    let j = points.length - 1;
    while (j > i && !grid.lineOfSight(anchor, points[j]!)) j--;
    out.push(points[j]!);
    anchor = points[j]!;
    i = j + 1;
  }
  return out;
}

/** Yolun toplam uzunluğu (m). */
export function pathLength(from: Point, path: readonly Point[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return len;
}
