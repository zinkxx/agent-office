import type { OfficeTheme } from '../themes.ts';
import { Kit, type Part } from './batch.tsx';

/**
 * Ofis kulesinin çevresindeki şehir (Sürüm 6). Saf: aynı oda boyutu ve tema → aynı şehir.
 *
 * Kamera çoğunlukla tepeden baktığı için çevrede asıl görünen zemin ve komşu çatılardır. Kule bir ızgaranın ortasındaki
 * bloktadır; yakın halkada ofis katından alçak binalar (çatı eşyalarıyla), park, otopark ve meydan; uzak halkada yüksek
 * binalar (sis içinde silüet) vardır. Tekrar eden her şey `Part` olarak döner (toplu çizilir); pencereli bina gövdeleri
 * ve hareket eden arabalar ayrıca çizilir.
 */

/** Kulenin dibindeki sokak seviyesi (ofis katı y=0'da). */
export const OUTSIDE_Y = -12;
export const ROAD_W = 7;
/** Kaldırım (blok) yüksekliği. */
export const CURB_H = 0.15;
const BLOCK_X = 28;
const BLOCK_Z = 24;
/** Blok kenarındaki kaldırım şeridi. */
const SIDEWALK = 2;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type BlockKind = 'tower' | 'low' | 'park' | 'parking' | 'plaza' | 'tall';

export interface Block {
  /** Izgaradaki yeri: kule (0,0); -1 sol/arka, +1 sağ/ön. */
  i: number;
  j: number;
  rect: Rect;
  kind: BlockKind;
}

/** Yol: `axis` 'x' ise z=`at` boyunca x'te uzanır; 'z' ise x=`at` boyunca z'de. */
export interface Road {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
}

/** Pencereli bina sınıfları: her sınıfın kendi doku boyutu (pencere sayısı). İlk dördü alçak, sonrakiler yüksek. */
export const BUILDING_CLASSES = [
  { w: 9, h: 6, d: 7, cols: 11, rows: 3 },
  { w: 11, h: 8.5, d: 8, cols: 13, rows: 4 },
  { w: 7, h: 4.5, d: 6, cols: 8, rows: 2 },
  { w: 13, h: 9.5, d: 9, cols: 15, rows: 5 },
  { w: 6, h: 16, d: 5, cols: 9, rows: 22 },
  { w: 8, h: 22, d: 7, cols: 12, rows: 30 },
  { w: 5, h: 28, d: 5, cols: 7, rows: 38 },
  { w: 10, h: 13, d: 8, cols: 14, rows: 17 },
] as const;
const LOW = [0, 1, 2, 3];
const TALL = [4, 5, 6, 7];

export interface BuildingSpot {
  cls: number;
  x: number;
  z: number;
  /** Ölçek (tüm eksenlerde). */
  s: number;
}

export interface ExteriorLayout {
  parts: Part[];
  blocks: Block[];
  buildings: BuildingSpot[];
  /** Arabaların dolaştığı yollar (kulenin çevresi ve bir dış halka). */
  traffic: Road[];
  /** Asfaltın kapladığı alan. */
  asphalt: Rect;
  /** Gece sokak lambalarının yerde bıraktığı ışık havuzları (yalnızca gece temalarında). */
  pools: { x: number; z: number }[];
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bloklar: ortada kule bloğu, iki halka komşu. */
export function cityBlocks(W: number, D: number): Block[] {
  const tower: Rect = { x0: -4, x1: W + 4, z0: -4, z1: D + 5 };
  const col = (i: number): [number, number] => {
    if (i === 0) return [tower.x0, tower.x1];
    if (i < 0) {
      const x1 = tower.x0 - ROAD_W - (-i - 1) * (BLOCK_X + ROAD_W);
      return [x1 - BLOCK_X, x1];
    }
    const x0 = tower.x1 + ROAD_W + (i - 1) * (BLOCK_X + ROAD_W);
    return [x0, x0 + BLOCK_X];
  };
  const row = (j: number): [number, number] => {
    if (j === 0) return [tower.z0, tower.z1];
    if (j < 0) {
      const z1 = tower.z0 - ROAD_W - (-j - 1) * (BLOCK_Z + ROAD_W);
      return [z1 - BLOCK_Z, z1];
    }
    const z0 = tower.z1 + ROAD_W + (j - 1) * (BLOCK_Z + ROAD_W);
    return [z0, z0 + BLOCK_Z];
  };
  const NEAR: Record<string, BlockKind> = {
    '-1,-1': 'low',
    '0,-1': 'low',
    '1,-1': 'park',
    '-1,0': 'parking',
    '1,0': 'low',
    '-1,1': 'low',
    '0,1': 'plaza',
    '1,1': 'low',
  };
  const blocks: Block[] = [];
  for (let j = -2; j <= 2; j++)
    for (let i = -2; i <= 2; i++) {
      const [x0, x1] = col(i);
      const [z0, z1] = row(j);
      const kind: BlockKind =
        i === 0 && j === 0 ? 'tower' : Math.max(Math.abs(i), Math.abs(j)) === 1 ? NEAR[`${i},${j}`]! : 'tall';
      blocks.push({ i, j, rect: { x0, x1, z0, z1 }, kind });
    }
  return blocks;
}

/** Bloklar arasındaki yolların orta çizgileri. */
function roadLines(blocks: readonly Block[]): { xs: number[]; zs: number[] } {
  const xs = new Set<number>();
  const zs = new Set<number>();
  for (const b of blocks) {
    if (b.i < 2) xs.add(b.rect.x1 + ROAD_W / 2);
    if (b.j < 2) zs.add(b.rect.z1 + ROAD_W / 2);
  }
  return { xs: [...xs].sort((a, b) => a - b), zs: [...zs].sort((a, b) => a - b) };
}

export function buildExterior(size: { width: number; depth: number }, theme: OfficeTheme): ExteriorLayout {
  const W = size.width;
  const D = size.depth;
  const O = theme.outside;
  const night = theme.night;
  const k = new Kit();
  const blocks = cityBlocks(W, D);
  const all = blocks.map((b) => b.rect);
  const asphalt: Rect = {
    x0: Math.min(...all.map((r) => r.x0)) - ROAD_W,
    x1: Math.max(...all.map((r) => r.x1)) + ROAD_W,
    z0: Math.min(...all.map((r) => r.z0)) - ROAD_W,
    z1: Math.max(...all.map((r) => r.z1)) + ROAD_W,
  };
  const G = OUTSIDE_Y;
  const top = G + CURB_H; // kaldırımın üstü
  const buildings: BuildingSpot[] = [];
  const pools: { x: number; z: number }[] = [];
  const r = rng(Math.round(W * 31 + D * 17));

  // ---------- bloklar (kaldırım) ----------
  for (const b of blocks) {
    const { x0, x1, z0, z1 } = b.rect;
    k.box([(x0 + x1) / 2, G + CURB_H / 2, (z0 + z1) / 2], [x1 - x0, CURB_H, z1 - z0], O.sidewalk, 'matte');
  }

  // ---------- yol çizgileri ve yaya geçitleri ----------
  const { xs, zs } = roadLines(blocks);
  const isCross = (v: number, lines: readonly number[]) =>
    lines.some((l) => Math.abs(v - l) < ROAD_W / 2 + 0.6);
  for (const z of zs)
    for (let x = asphalt.x0 + 2; x < asphalt.x1 - 2; x += 5)
      if (!isCross(x, xs)) k.box([x, G + 0.03, z], [2.2, 0.01, 0.16], O.marking, 'matte');
  for (const x of xs)
    for (let z = asphalt.z0 + 2; z < asphalt.z1 - 2; z += 5)
      if (!isCross(z, zs)) k.box([x, G + 0.03, z], [0.16, 0.01, 2.2], O.marking, 'matte');
  // kule bloğunun dört köşesindeki kavşaklarda yaya geçitleri
  const tb = blocks.find((b) => b.kind === 'tower')!.rect;
  const nearX = xs.filter((x) => Math.abs(x - tb.x0) < ROAD_W || Math.abs(x - tb.x1) < ROAD_W);
  const nearZ = zs.filter((z) => Math.abs(z - tb.z0) < ROAD_W || Math.abs(z - tb.z1) < ROAD_W);
  for (const x of nearX)
    for (const z of nearZ)
      for (const side of [-1, 1]) {
        const off = side * (ROAD_W / 2 + 1.3);
        // z yönündeki yolun (x=sabit) geçidi kavşağın önünde/arkasında; x yönündekinin geçidi sağında/solunda
        for (let s = -2.5; s <= 2.5; s += 1)
          k.box([x + s, G + 0.045, z + off], [0.5, 0.01, 2.0], O.marking, 'matte');
        for (let s = -2.5; s <= 2.5; s += 1)
          k.box([x + off, G + 0.045, z + s], [2.0, 0.01, 0.5], O.marking, 'matte');
      }

  // ---------- blok içerikleri ----------
  for (const b of blocks) {
    const inner = inset(b.rect, SIDEWALK);
    switch (b.kind) {
      case 'tower':
        towerPlaza(k, b.rect, W, D, O, top);
        break;
      case 'low':
        packBuildings(k, inner, LOW, r, buildings, O, top, true);
        break;
      case 'tall':
        packBuildings(k, inner, TALL, r, buildings, O, top, false);
        break;
      case 'park':
        park(k, inner, O, top, r);
        break;
      case 'parking':
        parking(k, inner, O, top, r, night);
        break;
      case 'plaza':
        plaza(k, inner, O, top, r);
        break;
    }
  }

  // ---------- kaldırım ağaçları ve sokak lambaları (kule ve yakın halka) ----------
  for (const b of blocks) {
    if (b.kind === 'tall') continue;
    const { x0, x1, z0, z1 } = b.rect;
    const edges: [number, number, number, number, number][] = [
      // x, z başlangıç; dx, dz yön; yola bakan yön (lamba kolu)
      [x0, z0 + 0.9, 1, 0, -1],
      [x0, z1 - 0.9, 1, 0, 1],
      [x0 + 0.9, z0, 0, 1, -1],
      [x1 - 0.9, z0, 0, 1, 1],
    ];
    edges.forEach(([sx, sz, dx, dz, out], e) => {
      const len = dx ? x1 - x0 : z1 - z0;
      for (let t = 4; t < len - 3; t += 10) {
        const lx = sx + dx * t;
        const lz = sz + dz * t;
        lamp(k, lx, lz, dx ? 0 : out, dx ? out : 0, top, theme, pools);
        const tx = sx + dx * (t + 5);
        const tz = sz + dz * (t + 5);
        if (t + 5 < len - 3 && b.kind !== 'park' && b.kind !== 'tower')
          tree(k, tx + (dx ? 0 : -out * 0.4), tz + (dx ? -out * 0.4 : 0), top, O, 0.9 + ((e + t) % 3) * 0.15);
      }
    });
  }

  // ---------- uzak zemin ----------
  const traffic: Road[] = [
    ...zs.map((z) => ({ axis: 'x' as const, at: z, from: asphalt.x0, to: asphalt.x1 })),
    ...xs.map((x) => ({ axis: 'z' as const, at: x, from: asphalt.z0, to: asphalt.z1 })),
  ];
  return { parts: k.parts, blocks, buildings, traffic, asphalt, pools };
}

function inset(rc: Rect, d: number): Rect {
  return { x0: rc.x0 + d, x1: rc.x1 - d, z0: rc.z0 + d, z1: rc.z1 - d };
}

type Outside = OfficeTheme['outside'];

/** Bloğu 1–2 × 1–2 parsele bölüp her parsele sığan bir bina koyar; alçak binalara çatı eşyaları eklenir. */
function packBuildings(
  k: Kit,
  area: Rect,
  classes: readonly number[],
  r: () => number,
  out: BuildingSpot[],
  O: Outside,
  top: number,
  roofs: boolean,
): void {
  const w = area.x1 - area.x0;
  const d = area.z1 - area.z0;
  const nx = w > 18 ? 2 : 1;
  const nz = d > 15 ? 2 : 1;
  for (let a = 0; a < nx; a++)
    for (let c = 0; c < nz; c++) {
      const lot: Rect = {
        x0: area.x0 + (w / nx) * a,
        x1: area.x0 + (w / nx) * (a + 1),
        z0: area.z0 + (d / nz) * c,
        z1: area.z0 + (d / nz) * (c + 1),
      };
      const lw = lot.x1 - lot.x0 - 1.2;
      const ld = lot.z1 - lot.z0 - 1.2;
      const fits = classes.filter(
        (i) => BUILDING_CLASSES[i]!.w * 0.8 <= lw && BUILDING_CLASSES[i]!.d * 0.8 <= ld,
      );
      if (fits.length === 0) continue;
      const cls = fits[Math.floor(r() * fits.length)]!;
      const C = BUILDING_CLASSES[cls]!;
      const s = Math.min(0.85 + r() * 0.3, lw / C.w, ld / C.d);
      const bw = C.w * s;
      const bd = C.d * s;
      const x = lot.x0 + 0.6 + bw / 2 + r() * Math.max(0, lw - bw);
      const z = lot.z0 + 0.6 + bd / 2 + r() * Math.max(0, ld - bd);
      out.push({ cls, x, z, s });
      const h = top + C.h * s;
      parapet(k, x, z, bw, bd, h, O);
      if (roofs) roofProps(k, x, z, bw, bd, h, O, r);
      else if (r() < 0.6) k.add('cyl', 'metal', [x, h + 2, z], [0.12, 4, 0.12], '#8a8f96'); // anten
      // parselde kalan yere ağaç
      if (lw - bw > 3.5) tree(k, lot.x0 + 1.6, (lot.z0 + lot.z1) / 2, top, O, 1);
      if (ld - bd > 3.5) tree(k, (lot.x0 + lot.x1) / 2, lot.z1 - 1.6, top, O, 0.9);
    }
}

function parapet(k: Kit, x: number, z: number, w: number, d: number, h: number, O: Outside): void {
  const t = 0.22;
  const ph = 0.45;
  k.box([x, h + ph / 2, z - d / 2 + t / 2], [w, ph, t], O.parapet, 'matte');
  k.box([x, h + ph / 2, z + d / 2 - t / 2], [w, ph, t], O.parapet, 'matte');
  k.box([x - w / 2 + t / 2, h + ph / 2, z], [t, ph, d - 2 * t], O.parapet, 'matte');
  k.box([x + w / 2 - t / 2, h + ph / 2, z], [t, ph, d - 2 * t], O.parapet, 'matte');
}

/** Çatı: merdiven kulesi, klimalar, su deposu, güneş panelleri, çatı bahçesi, ışıklık ya da helikopter pisti. */
function roofProps(
  k: Kit,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  O: Outside,
  r: () => number,
): void {
  const hx = w / 2 - 1;
  const hz = d / 2 - 1;
  const at = (fx: number, fz: number): [number, number] => [x + fx * hx, z + fz * hz];
  // merdiven kulesi
  const [sx, sz] = at(-0.7, -0.6);
  k.box([sx, h + 1.1, sz], [2, 2.2, 1.8], O.parapet, 'matte');
  k.box([sx, h + 2.25, sz], [2.2, 0.1, 2], O.roofs[0], 'matte');
  const roll = r();
  if (roll < 0.12 && w > 10 && d > 7) {
    // helikopter pisti
    const [px, pz] = at(0.25, 0.15);
    k.add('disc', 'matte', [px, h + 0.05, pz], [5, 0.06, 5], '#2a2e36');
    k.add('disc', 'glow', [px, h + 0.09, pz], [4.4, 0.01, 4.4], '#ffc23a', { glow: 0.9 });
    k.add('disc', 'matte', [px, h + 0.1, pz], [4.0, 0.01, 4.0], '#2a2e36');
    k.box([px - 0.6, h + 0.12, pz], [0.25, 0.01, 1.6], '#f2f2ee');
    k.box([px + 0.6, h + 0.12, pz], [0.25, 0.01, 1.6], '#f2f2ee');
    k.box([px, h + 0.12, pz], [1.2, 0.01, 0.25], '#f2f2ee');
    return;
  }
  if (roll < 0.4) {
    // güneş panelleri
    const rows = Math.max(2, Math.floor(d / 2.2) - 1);
    for (let i = 0; i < rows; i++) {
      const [px, pz] = at(0.25, -0.5 + i * (1.4 / rows));
      k.box([px, h + 0.45, pz], [w * 0.45, 0.06, 1.2], '#1f3a6a', 'gloss', { r: [-0.35, 0, 0] });
    }
  } else if (roll < 0.65) {
    // çatı bahçesi
    const [gx, gz] = at(0.3, 0.3);
    k.box([gx, h + 0.15, gz], [w * 0.4, 0.3, d * 0.4], O.grass, 'matte');
    for (let i = 0; i < 3; i++)
      tree(k, gx - w * 0.12 + i * w * 0.12, gz + (i % 2 ? 0.6 : -0.6), h + 0.3, O, 0.55);
  } else {
    // ışıklıklar
    for (let i = 0; i < 3; i++) {
      const [lx, lz] = at(0.1 + i * 0.3, 0.4);
      k.box([lx, h + 0.25, lz], [1.4, 0.5, 1.0], '#9fc8e8', 'gloss');
    }
  }
  // klimalar
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const [ax, az] = at(-0.1 + (i % 2) * 0.35, 0.55 - Math.floor(i / 2) * 0.5);
    k.box([ax, h + 0.45, az], [1.2, 0.9, 1.0], '#c8ccd2', 'metal');
    k.add('disc', 'matte', [ax, h + 0.91, az], [0.7, 0.02, 0.7], '#3a3e46');
  }
  if (r() < 0.5) {
    // su deposu
    const [tx, tz] = at(0.75, -0.6);
    k.add('cyl', 'wood', [tx, h + 2.0, tz], [1.4, 1.6, 1.4], '#8a5a3a');
    k.add('cone', 'matte', [tx, h + 3.05, tz], [1.5, 0.5, 1.5], '#5a3a28');
    for (const [lx, lz] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ] as const)
      k.box([tx + lx, h + 0.6, tz + lz], [0.1, 1.2, 0.1], '#3a3e46', 'metal');
  }
}

function tree(k: Kit, x: number, z: number, base: number, O: Outside, size: number): void {
  const c = O.leaves[Math.abs(Math.round(x * 3 + z * 7)) % 3]!;
  k.add('cyl6', 'wood', [x, base + 0.8 * size, z], [0.22 * size, 1.6 * size, 0.22 * size], O.trunk);
  k.add('ico', 'leaf', [x, base + 2.1 * size, z], [2.0 * size, 1.9 * size, 2.0 * size], c, {
    r: [x, z, 0],
  });
  k.add(
    'ico',
    'leaf',
    [x + 0.4 * size, base + 2.7 * size, z - 0.3 * size],
    [1.3 * size, 1.2 * size, 1.3 * size],
    c,
    {
      r: [z, x, 0],
    },
  );
}

/** Lamba başlığının yüksekliği (kaldırımın üstünden). */
export const LAMP_H = 3.5;

/**
 * Sokak lambası: direk, yola uzanan kol, başlık; gece başlık yanar. Yerdeki ışık havuzunun yeri `pools`'a eklenir
 * (yumuşak, saydam bir leke olarak ayrıca çizilir).
 */
function lamp(
  k: Kit,
  x: number,
  z: number,
  ox: number,
  oz: number,
  base: number,
  theme: OfficeTheme,
  pools: { x: number; z: number }[],
): void {
  const pole = '#2a2e36';
  k.add('cyl6', 'metal', [x, base + LAMP_H / 2, z], [0.16, LAMP_H, 0.16], pole);
  k.box(
    [x + ox * 0.45, base + LAMP_H - 0.05, z + oz * 0.45],
    [ox ? 0.9 : 0.09, 0.09, oz ? 0.9 : 0.09],
    pole,
    'metal',
  );
  const hx = x + ox * 0.9;
  const hz = z + oz * 0.9;
  if (theme.night) {
    k.box([hx, base + LAMP_H - 0.12, hz], [0.55, 0.12, 0.55], theme.city.streetLamp, 'glow', { glow: 2.6 });
    pools.push({ x: hx + ox * 0.4, z: hz + oz * 0.4 });
  } else k.box([hx, base + LAMP_H - 0.12, hz], [0.55, 0.12, 0.55], '#e9ecf0', 'gloss');
}

/** Kulenin meydanı: girişte saçak ve cam kapı, saksılarda ağaçlar, banklar, bisiklet parkı. */
function towerPlaza(k: Kit, rc: Rect, W: number, D: number, O: Outside, top: number): void {
  const cx = W / 2;
  // giriş saçağı ve lobi camı (kulenin ön cephesinin ortasında)
  k.box([cx, top + 3.4, D + 1.3], [7, 0.22, 2.6], O.parapet, 'matte');
  k.box([cx, top + 3.52, D + 1.3], [6.6, 0.03, 2.2], O.roofs[1], 'matte');
  k.box([cx, top + 3.26, D + 2.55], [7, 0.06, 0.08], '#ffc23a', 'glow', { glow: 1.4 });
  for (const dx of [-3.2, 3.2])
    k.add('cyl', 'metal', [cx + dx, top + 1.7, D + 2.4], [0.12, 3.4, 0.12], '#2a2e36');
  k.box([cx, top + 1.4, D + 0.1], [4, 2.8, 0.08], '#8fb8d8', 'gloss');
  k.box([cx, top + 1.4, D + 0.15], [0.05, 2.8, 0.05], '#2a2e36', 'metal');
  // girişe uzanan halı yol
  k.box([cx, top + 0.03, D + 3.6], [3.2, 0.01, 2.4], O.parapet, 'matte');
  // saksılar ve ağaçlar: ön ve yanlar
  const planter = (x: number, z: number) => {
    k.box([x, top + 0.35, z], [1.6, 0.7, 1.6], O.parapet, 'matte');
    k.box([x, top + 0.71, z], [1.4, 0.04, 1.4], O.grass, 'matte');
    tree(k, x, z, top + 0.7, O, 0.8);
  };
  for (let x = 2; x < W - 1; x += 6) if (Math.abs(x - cx) > 5) planter(x, rc.z1 - 1.6);
  for (let z = 2; z < D; z += 6) {
    planter(rc.x0 + 1.6, z);
    planter(rc.x1 - 1.6, z);
  }
  // banklar ve bisiklet parkı
  for (const dx of [-6.5, 6.5]) bench(k, cx + dx, rc.z1 - 3.2, 0, top);
  for (let i = 0; i < 5; i++)
    k.add('cyl', 'metal', [cx + 9 + i * 0.6, top + 0.45, D + 2.6], [0.05, 0.9, 0.05], '#8a8f96', {
      r: [Math.PI / 2, 0, 0],
    });
}

function bench(k: Kit, x: number, z: number, rotY: number, top: number): void {
  k.at(x, 0, z, rotY, () => {
    k.box([0, top + 0.45, 0], [1.8, 0.08, 0.5], '#8a5a3a', 'wood');
    k.box([0, top + 0.75, -0.22], [1.8, 0.35, 0.06], '#8a5a3a', 'wood');
    for (const dx of [-0.75, 0.75]) k.box([dx, top + 0.22, 0], [0.08, 0.44, 0.45], '#2a2e36', 'metal');
  });
}

/** Park: çim, çapraz patikalar, gölet, ağaçlar, banklar. */
function park(k: Kit, a: Rect, O: Outside, top: number, r: () => number): void {
  const cx = (a.x0 + a.x1) / 2;
  const cz = (a.z0 + a.z1) / 2;
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  k.box([cx, top + 0.02, cz], [w, 0.04, d], O.grass, 'matte');
  k.box([cx, top + 0.07, cz], [w, 0.01, 1.6], O.sidewalk, 'matte');
  k.box([cx - w / 4, top + 0.07, cz], [1.6, 0.01, d], O.sidewalk, 'matte');
  const px = cx + w / 4;
  const pz = cz - d / 4 + 0.5;
  k.add('disc', 'matte', [px, top + 0.05, pz], [9.4, 0.08, 6.4], O.parapet);
  k.add('disc', 'gloss', [px, top + 0.07, pz], [8.6, 0.08, 5.8], O.water);
  for (let i = 0; i < 24; i++) {
    const x = a.x0 + 1.5 + r() * (w - 3);
    const z = a.z0 + 1.5 + r() * (d - 3);
    if (Math.abs(z - cz) < 2 || Math.abs(x - (cx - w / 4)) < 2) continue;
    if (Math.hypot((x - px) / 5.5, (z - pz) / 4) < 1) continue;
    tree(k, x, z, top, O, 0.8 + r() * 0.5);
  }
  for (const dx of [-6, 6]) bench(k, cx + dx, cz + 1.6, Math.PI, top);
}

/** Otopark: çizgili asfalt ve park etmiş arabalar. */
function parking(k: Kit, a: Rect, O: Outside, top: number, r: () => number, night: boolean): void {
  const cx = (a.x0 + a.x1) / 2;
  const cz = (a.z0 + a.z1) / 2;
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  k.box([cx, top + 0.01, cz], [w, 0.02, d], O.road, 'matte');
  const rows = [a.z0 + 3, a.z1 - 3];
  for (const rz of rows)
    for (let x = a.x0 + 1; x < a.x1 - 1.5; x += 2.8) {
      k.box([x, top + 0.04, rz], [0.12, 0.01, 4.8], O.marking, 'matte');
      if (r() < 0.7) parkedCar(k, x + 1.4, rz, Math.PI / 2, top, r, night);
    }
  k.box([cx, top + 0.04, cz], [w - 2, 0.01, 0.14], O.marking, 'matte');
}

export const CAR_COLORS = [
  '#d84a3a',
  '#2b6bd8',
  '#e9e6ea',
  '#1b1b22',
  '#ffc23a',
  '#5fa046',
  '#8a8f96',
  '#c0c4cc',
];

function parkedCar(
  k: Kit,
  x: number,
  z: number,
  rotY: number,
  top: number,
  r: () => number,
  night: boolean,
): void {
  const c = CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]!;
  k.at(x, 0, z, rotY, () => {
    k.box([0, top + 0.5, 0], [1.8, 0.7, 4.0], c, 'gloss');
    k.box([0, top + 1.1, -0.2], [1.6, 0.6, 2.0], night ? '#1a2230' : '#3a4a5a', 'gloss');
  });
}

/** Meydan: ortada fıskiyeli havuz, dört çim yatak ve ağaçlar, banklar. */
function plaza(k: Kit, a: Rect, O: Outside, top: number, r: () => number): void {
  const cx = (a.x0 + a.x1) / 2;
  const cz = (a.z0 + a.z1) / 2;
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  k.add('disc', 'matte', [cx, top + 0.3, cz], [7, 0.6, 7], O.parapet);
  k.add('disc', 'gloss', [cx, top + 0.62, cz], [6.2, 0.04, 6.2], O.water);
  k.add('cyl', 'matte', [cx, top + 1.1, cz], [0.6, 1.0, 0.6], O.parapet);
  k.add('sphere', 'gloss', [cx, top + 1.8, cz], [1.0, 0.8, 1.0], O.water);
  for (const [fx, fz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const bx = cx + fx * w * 0.3;
    const bz = cz + fz * d * 0.28;
    k.box([bx, top + 0.15, bz], [w * 0.28, 0.3, d * 0.3], O.grass, 'matte');
    for (let i = 0; i < 3; i++)
      tree(k, bx + (r() - 0.5) * w * 0.2, bz + (r() - 0.5) * d * 0.2, top + 0.3, O, 0.75 + r() * 0.3);
    bench(k, bx - fx * w * 0.17, bz, fx < 0 ? Math.PI / 2 : -Math.PI / 2, top);
  }
}
