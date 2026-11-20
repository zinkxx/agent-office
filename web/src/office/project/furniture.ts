import type { AgentRole } from '../../../../shared/types.ts';
import { DESK_D, DESK_W, LEAD_DESK_W, testerBoardOf, type OfficePlan, type Seat } from '../sim/plan.ts';
import { BRAND } from '../textures.ts';
import { DEFAULT_THEME, themeById, type OfficeTheme } from '../themes.ts';
import { Kit, type Part, type V3 } from './batch.tsx';
import { deskDetails, hoodie, techFurniture } from './techFurniture.ts';

/**
 * Kat planından ofisin sabit eşyaları: masalar, sandalyeler, kişisel eşyalar, toplantı odası, mutfak, kanepe,
 * kitaplık, bitkiler, lambalar, duvarlar ve pencereler. Saf fonksiyon; aynı plan → aynı eşyalar.
 * Tekrar eden her şey `Part` olarak döner (toplu çizilir); ekranlar, cam ve dokulu yüzeyler ayrı listelerde.
 */

export const WALL_H = 3.2;

export interface ScreenSpot {
  id: string;
  /** Masaya bağlı ekranlarda masanın id'si (içerik oturanın durumuna göre). */
  seatId?: string;
  /** `tv`: oyun köşesindeki televizyon (biri konsolda oynarken oyun gösterir). */
  kind: 'desk' | 'side' | 'big' | 'meeting' | 'tv';
  p: V3;
  rotY: number;
  w: number;
  h: number;
}

/** Dokulu düz yüzey (logo, plaket, karo, paspas): merkez, y dönüşü, boyut. `floor` ise yere yatırılır. */
export interface Decal {
  p: V3;
  rotY: number;
  w: number;
  h: number;
}

export interface FurnitureLayout {
  parts: Part[];
  /** DevTechnic marka yüzeyleri (Sürüm 3). */
  brand: {
    /** Marka duvarındaki logo ve altındaki yazı. */
    logo: Decal;
    word: Decal;
    /** Lider köşesindeki plaket. */
    plaque: Decal;
    /** Dinlenme alanındaki neon simge. */
    neon: Decal;
    /** Karşılama totemindeki simge. */
    totem: Decal;
    /** Kapının önündeki paspas (yerde). */
    mat: Decal;
  };
  /** Mutfak tezgahının arkasındaki karo. */
  tiles: Decal;
  screens: ScreenSpot[];
  glass: { p: V3; s: V3; rotY: number }[];
  carpets: { x: number; z: number; w: number; d: number }[];
  rugs: { x: number; z: number; w: number; d: number; rotY: number; kind: 'lounge' | 'lead' | 'meeting' }[];
  whiteboard: { p: V3; rotY: number; w: number; h: number };
  islandLabels: { role: AgentRole; x: number; z: number }[];
  /** Kapı boşluğu (kayar cam kapı ayrı çizilir). */
  door: { x: number; z: number; width: number };
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

/** Temadan gelmeyen sabit renkler + temanın oda renkleri (buildFurniture başında temaya göre doldurulur). */
const BASE = {
  metal: '#5a4a52',
  dark: '#1a1216',
  screenBack: '#141014',
  amber: '#ffb547',
  leaf: ['#2f6b3a', '#3e8a48', '#25553a', '#4f9a52'],
  pot: ['#c46a4a', '#e9e0dc', '#2a2226', '#8a4a3a'],
  woods: ['#7a4a34', '#5e3a2c', '#8f5a3e', '#6b4232', '#4a2e24'],
  mugs: ['#ff9db3', '#f4ece8', '#ffb547', '#6fc8ff', '#2a2226', '#5fe0a0'],
  books: ['#8a2b3a', '#2b4b7a', '#c99a3a', '#3e6b4a', '#e9e0dc', '#5a2a5a', '#d84a3a', '#2a2226', '#ff9db3'],
};

export type Palette = ReturnType<typeof paletteOf>;

function paletteOf(theme: OfficeTheme) {
  return {
    ...BASE,
    wall: theme.room.wall,
    wallDark: theme.room.wallDark,
    base: theme.room.base,
    frame: theme.room.frame,
    neon: theme.room.neon,
    neonGlow: theme.room.neonGlow,
    trim: theme.ui.accentSoft,
    sofa: theme.sofa,
  };
}

/**
 * Geçerli palet. Eşya fonksiyonları buradan okur; `buildFurniture` (eşzamanlı) her çağrıda temaya göre ayarlar.
 */
let C = paletteOf(themeById(DEFAULT_THEME));

/** Sandalye kumaşı: rol renginin koyusu. */
function chairColor(role: AgentRole): string {
  const map: Record<AgentRole, string> = {
    lead: '#4a2a1a',
    designer: '#5a2440',
    developer: '#2e2a52',
    tester: '#1f4a36',
    reviewer: '#1f3a52',
    researcher: '#52421f',
    architect: '#3e2a52',
    other: '#3a2a32',
  };
  return map[role];
}

function plant(k: Kit, x: number, z: number, size: number, seed: number): void {
  const r = rng(seed);
  const pot = C.pot[Math.floor(r() * C.pot.length)]!;
  k.add('cyl', 'matte', [x, 0.22 * size, z], [0.42 * size, 0.44 * size, 0.42 * size], pot, { cast: true });
  k.add('cyl', 'matte', [x, 0.445 * size, z], [0.38 * size, 0.02, 0.38 * size], '#2a1a12');
  const blobs = 3 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + r();
    const rad = 0.12 * size * (i === 0 ? 0 : 1);
    const h = (0.6 + r() * 0.5 + (i === 0 ? 0.35 : 0)) * size;
    k.add(
      'ico',
      'leaf',
      [x + Math.cos(a) * rad, h, z + Math.sin(a) * rad],
      [0.42 * size, (0.5 + r() * 0.25) * size, 0.42 * size],
      C.leaf[Math.floor(r() * C.leaf.length)]!,
      { r: [r(), r() * 3, r()], cast: true },
    );
  }
}

/** Ofis sandalyesi; kişinin yerinde, kişinin baktığı yöne dönük (yerel +z = masa). */
function chair(k: Kit, seat: { x: number; z: number; heading: number }, fabric: string, tall = false): void {
  k.at(seat.x, 0, seat.z, seat.heading, () => {
    k.box([0, 0.45, 0.06], [0.5, 0.08, 0.48], fabric, 'fabric', { cast: true });
    k.box([0, tall ? 0.92 : 0.8, -0.2], [0.48, tall ? 0.78 : 0.52, 0.07], fabric, 'fabric', { cast: true });
    k.box([0, tall ? 0.92 : 0.8, -0.24], [0.44, tall ? 0.72 : 0.46, 0.02], C.dark);
    k.add('cyl', 'metal', [0, 0.24, 0.04], [0.05, 0.38, 0.05], C.metal);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.box([Math.sin(a) * 0.13, 0.05, 0.04 + Math.cos(a) * 0.13], [0.04, 0.03, 0.26], C.dark, 'metal', {
        r: [0, a, 0],
      });
    }
    // kolçaklar
    for (const x of [-0.27, 0.27]) k.box([x, 0.62, 0.04], [0.04, 0.04, 0.32], C.dark);
  });
}

/** Masanın üstündeki kişisel eşyalar: her masada biraz farklı. */
function personal(k: Kit, seat: Seat): void {
  const r = rng(seat.variant);
  const v = seat.variant;
  const side = v % 2 === 0 ? 1 : -1;
  // kupa
  k.add('cyl', 'gloss', [0.5 * side, 0.81, 0.05 + r() * 0.15], [0.08, 0.1, 0.08], C.mugs[v % C.mugs.length]!);
  switch ((v >>> 3) % 6) {
    case 0: // küçük bitki
      k.add('cyl', 'matte', [-0.62 * side, 0.82, -0.24], [0.12, 0.13, 0.12], C.pot[v % C.pot.length]!);
      k.add('ico', 'leaf', [-0.62 * side, 0.95, -0.24], [0.2, 0.2, 0.2], C.leaf[v % C.leaf.length]!, {
        r: [v, v, 0],
      });
      break;
    case 1: // figür
      k.add(
        'cyl',
        'gloss',
        [-0.64 * side, 0.83, -0.22],
        [0.06, 0.12, 0.06],
        ['#ff6fb5', '#6fc8ff', '#ffb547'][v % 3]!,
      );
      k.add('sphere', 'gloss', [-0.64 * side, 0.92, -0.22], [0.08, 0.08, 0.08], '#f3cdb8');
      break;
    case 2: // masada kulaklık
      k.add('cyl', 'matte', [-0.6 * side, 0.79, -0.15], [0.09, 0.04, 0.09], C.dark, {
        r: [Math.PI / 2, 0, 0],
      });
      k.add('cyl', 'matte', [-0.6 * side, 0.79, -0.03], [0.09, 0.04, 0.09], C.dark, {
        r: [Math.PI / 2, 0, 0],
      });
      k.box([-0.6 * side, 0.85, -0.09], [0.03, 0.02, 0.14], '#ff3d6e');
      break;
    case 3: // kitap yığını
      for (let i = 0; i < 3; i++)
        k.box(
          [-0.6 * side, 0.775 + i * 0.035, -0.18],
          [0.22 - i * 0.02, 0.03, 0.28 - i * 0.02],
          C.books[(v + i) % C.books.length]!,
          'matte',
          {
            r: [0, (r() - 0.5) * 0.4, 0],
          },
        );
      break;
    case 4: // fotoğraf çerçevesi
      k.box([-0.6 * side, 0.85, -0.2], [0.14, 0.18, 0.02], C.frame, 'matte', { r: [-0.2, 0.3 * side, 0] });
      k.box(
        [-0.6 * side, 0.85, -0.19],
        [0.11, 0.14, 0.005],
        ['#ffb547', '#ff9db3', '#6fc8ff'][v % 3]!,
        'gloss',
        {
          r: [-0.2, 0.3 * side, 0],
        },
      );
      break;
    default: // su şişesi ve yapışkan notlar
      k.add('cyl', 'gloss', [-0.6 * side, 0.87, -0.15], [0.07, 0.22, 0.07], '#6fc8ff');
      break;
  }
  // monitör kenarında yapışkan not
  if (v % 3 === 0)
    k.box([0.36, 1.2, -0.2], [0.06, 0.06, 0.004], ['#ffe36b', '#ff9db3', '#8fe3b0'][v % 3]!, 'matte', {
      r: [0, 0, 0.1],
    });
}

function monitor(k: Kit, x: number, z: number, rotY: number, w: number, h: number, y = 1.08): void {
  k.at(x, 0, z, rotY, () => {
    k.box([0, 0.765, -0.02], [0.22, 0.012, 0.16], C.metal, 'metal');
    k.box([0, (0.77 + y - h / 2) / 2 + 0.01, -0.06], [0.04, y - h / 2 - 0.76, 0.03], C.metal, 'metal');
    k.box([0, y, -0.045], [w + 0.04, h + 0.04, 0.035], C.screenBack, 'matte', { cast: true });
  });
}

function desk(k: Kit, seat: Seat, screens: ScreenSpot[]): void {
  const wood = C.woods[seat.variant % C.woods.length]!;
  const role = seat.role;
  k.at(seat.deskX, 0, seat.deskZ, seat.deskRot, () => {
    k.box([0, 0.74, 0], [DESK_W, 0.04, DESK_D], wood, 'wood', { cast: true });
    for (const x of [-0.76, 0.76]) k.box([x, 0.36, 0], [0.04, 0.72, 0.72], C.dark, 'metal', { cast: true });
    k.box([0, 0.48, -0.36], [1.5, 0.34, 0.02], C.dark);
    // sırt sırta adalarda ortadaki ses paneli (yalnızca bir sıra çizer)
    if (seat.deskRot === 0 && role !== 'lead')
      k.box([0, 0.96, -0.415], [DESK_W, 0.42, 0.03], chairColor(role), 'fabric');

    // ana monitör (ekranı ayrıca çizilir, oturan kişiye bakar)
    const big = role === 'lead';
    const mw = big ? 0.82 : 0.6;
    const mh = big ? 0.44 : 0.34;
    monitor(k, 0, -0.18, 0, mw, mh);
    const pt = k.point([0, 1.08, -0.2]);
    screens.push({ id: `${seat.id}:0`, seatId: seat.id, kind: 'desk', p: pt.p, rotY: pt.rotY, w: mw, h: mh });

    if (role === 'designer') {
      // ikinci ekran ve çizim tableti
      monitor(k, -0.6, -0.12, 0.38, 0.46, 0.3, 1.05);
      k.at(-0.6, 0, -0.12, 0.38, () => {
        const p2 = k.point([0, 1.05, -0.027]);
        screens.push({
          id: `${seat.id}:1`,
          seatId: seat.id,
          kind: 'side',
          p: p2.p,
          rotY: p2.rotY,
          w: 0.46,
          h: 0.3,
        });
      });
      k.box([0.36, 0.765, 0.12], [0.32, 0.015, 0.22], C.dark, 'gloss');
      k.box([0.36, 0.774, 0.12], [0.26, 0.004, 0.17], '#2a2a3a', 'gloss');
      k.add('cyl', 'gloss', [0.42, 0.78, 0.2], [0.012, 0.16, 0.012], '#e9e0dc', { r: [Math.PI / 2, 0, 0.6] });
    } else {
      k.box([0.32, 0.763, 0.13], [0.24, 0.004, 0.2], C.dark, 'fabric');
      k.box([0.32, 0.775, 0.13], [0.06, 0.025, 0.1], '#2a2226', 'gloss');
    }
    // klavye; geliştiricininki ışıklı
    k.box([0, 0.768, 0.12], [0.44, 0.02, 0.14], '#221a1e', 'matte');
    if (role === 'developer') k.box([0, 0.759, 0.12], [0.45, 0.004, 0.15], '#8f8bff', 'glow', { glow: 1.6 });
    if (role === 'reviewer') {
      for (let i = 0; i < 4; i++)
        k.box([-0.42, 0.765 + i * 0.006, 0.18], [0.21, 0.004, 0.29], '#f4ece8', 'matte', {
          r: [0, i * 0.08, 0],
        });
      k.add('cyl', 'gloss', [-0.36, 0.79, 0.2], [0.012, 0.15, 0.012], '#e0304b', {
        r: [Math.PI / 2, 0, -0.5],
      });
    }
    if (role === 'tester') {
      // masada kontrol listesi panosu
      k.box([-0.45, 0.77, 0.16], [0.22, 0.012, 0.3], '#8a5a3a', 'matte', { r: [0, 0.2, 0] });
      for (let i = 0; i < 4; i++)
        k.box(
          [-0.47 + i * 0.006, 0.778, 0.08 + i * 0.05],
          [0.03, 0.004, 0.03],
          i === 2 ? '#ff4d5e' : '#3fd27a',
          'glow',
          { glow: 1.2 },
        );
    }
    if (role === 'architect') {
      for (let i = 0; i < 3; i++)
        k.add('cyl', 'matte', [-0.5, 0.79 + i * 0.05, -0.05 + i * 0.03], [0.05, 0.5, 0.05], '#4a7ac8', {
          r: [0, 0, Math.PI / 2],
        });
    }
    if (role === 'researcher') {
      for (let i = 0; i < 5; i++)
        k.box([-0.62, 0.78 + i * 0.04, -0.2], [0.2, 0.035, 0.27], C.books[i]!, 'matte', {
          r: [0, (i % 2) * 0.2, 0],
        });
    }
    // masa altında çekmeceli dolap
    k.box([0.48, 0.3, -0.06], [0.4, 0.56, 0.5], '#2a2226', 'matte');
    for (const y of [0.16, 0.34, 0.5]) k.box([0.48, y, 0.195], [0.16, 0.015, 0.012], C.metal, 'metal');
    personal(k, seat);
    deskDetails(k, seat, 1.08 + mh / 2 + 0.02);
  });
  chair(k, seat, chairColor(role), role === 'lead');
  hoodie(k, seat);
}

/** Lider köşesine özel: yüksek sırtlı, baş yastıklı yönetici/oyuncu koltuğu. */
function leadChair(k: Kit, seat: { x: number; z: number; heading: number }): void {
  const leather = '#2a1a1a';
  k.at(seat.x, 0, seat.z, seat.heading, () => {
    k.box([0, 0.46, 0.06], [0.56, 0.1, 0.52], leather, 'fabric', { cast: true });
    for (const x of [-0.3, 0.3]) k.box([x, 0.52, 0.04], [0.06, 0.1, 0.44], '#5a2a1a', 'fabric');
    k.box([0, 1.0, -0.2], [0.54, 0.92, 0.08], leather, 'fabric', { cast: true });
    k.box([0, 1.0, -0.155], [0.12, 0.8, 0.012], '#d9a441', 'matte');
    for (const x of [-0.31, 0.31]) k.box([x, 0.86, -0.17], [0.08, 0.5, 0.12], '#5a2a1a', 'fabric');
    k.box([0, 1.58, -0.18], [0.3, 0.17, 0.1], '#5a2a1a', 'fabric', { cast: true });
    k.box([0, 1.34, -0.2], [0.05, 0.22, 0.04], C.dark);
    k.add('cyl', 'metal', [0, 0.24, 0.04], [0.05, 0.38, 0.05], C.metal);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.box([Math.sin(a) * 0.13, 0.05, 0.04 + Math.cos(a) * 0.13], [0.04, 0.03, 0.26], C.dark, 'metal', {
        r: [0, a, 0],
      });
    }
    for (const x of [-0.31, 0.31]) {
      k.box([x, 0.66, 0.04], [0.05, 0.04, 0.34], C.dark);
      k.box([x, 0.58, -0.1], [0.03, 0.16, 0.03], C.dark);
    }
  });
}

function leadCornerDesk(k: Kit, seat: Seat, screens: ScreenSpot[]): void {
  k.at(seat.deskX, 0, seat.deskZ, seat.deskRot, () => {
    const wood = '#3a2018';
    k.box([0, 0.74, 0], [LEAD_DESK_W, 0.05, DESK_D + 0.1], wood, 'wood', { cast: true });
    k.box([-1.4, 0.74, 0.75], [0.8, 0.05, 1.6], wood, 'wood', { cast: true });
    for (const x of [-1.05, 1.05]) k.box([x, 0.36, 0], [0.05, 0.72, 0.8], C.dark, 'metal', { cast: true });
    k.box([-1.4, 0.36, 1.5], [0.7, 0.72, 0.05], C.dark, 'metal');
    k.box([0, 0.5, -0.42], [2.1, 0.4, 0.02], C.dark);
    // geniş ana ekran, üstünde web kamerası
    monitor(k, 0, -0.2, 0, 1.24, 0.56, 1.2);
    const pt = k.point([0, 1.2, -0.222]);
    screens.push({
      id: `${seat.id}:0`,
      seatId: seat.id,
      kind: 'big',
      p: pt.p,
      rotY: pt.rotY,
      w: 1.24,
      h: 0.56,
    });
    k.box([0, 1.5, -0.2], [0.09, 0.03, 0.03], '#15101a', 'gloss');
    k.add('sphere', 'glow', [0, 1.5, -0.183], [0.012, 0.012, 0.012], '#6fe3ff', { glow: 2 });
    // iki yanda içe dönük, kollu ikinci ve üçüncü ekran
    for (const sx of [-1, 1]) {
      const mx = sx * 0.99;
      const rot = -sx * 0.6;
      k.at(mx, 0, -0.1, rot, () => {
        k.box([0, 1.08, -0.045], [0.5, 0.34, 0.035], C.screenBack, 'matte', { cast: true });
        k.box([0, 0.765, -0.14], [0.1, 0.012, 0.1], C.metal, 'metal');
        k.box([0, 0.92, -0.14], [0.03, 0.34, 0.03], C.metal, 'metal');
        k.box([0, 1.08, -0.092], [0.03, 0.03, 0.095], C.metal, 'metal');
        const p2 = k.point([0, 1.08, -0.027]);
        screens.push({
          id: `${seat.id}:${sx < 0 ? 1 : 2}`,
          seatId: seat.id,
          kind: 'side',
          p: p2.p,
          rotY: p2.rotY,
          w: 0.46,
          h: 0.3,
        });
      });
    }
    // büyük masa matı, RGB altışıklı mekanik klavye, mouse
    k.box([0, 0.767, 0.16], [1.1, 0.008, 0.42], '#17121c', 'fabric');
    k.box([0, 0.771, 0.375], [1.1, 0.003, 0.012], '#ff4fd8', 'glow', { glow: 1.2 });
    k.box([-0.05, 0.783, 0.16], [0.46, 0.022, 0.15], '#1b1620', 'matte');
    k.box([-0.05, 0.775, 0.16], [0.48, 0.006, 0.17], '#8f6bff', 'glow', { glow: 1.8 });
    k.box([-0.05, 0.796, 0.16], [0.42, 0.004, 0.11], '#6fe3ff', 'glow', { glow: 0.7 });
    k.add('sphere', 'gloss', [0.36, 0.778, 0.17], [0.06, 0.03, 0.095], '#1b1620');
    k.box([0.36, 0.783, 0.135], [0.01, 0.004, 0.02], '#ff4fd8', 'glow', { glow: 1.5 });
    // yayın mikrofonu, bom kolu
    k.add('cyl', 'metal', [0.86, 0.775, 0.0], [0.07, 0.02, 0.07], C.metal);
    k.box([0.86, 0.92, 0.0], [0.02, 0.3, 0.02], C.metal, 'metal');
    k.box([0.76, 1.07, 0.0], [0.22, 0.02, 0.02], C.metal, 'metal', { r: [0, 0, -0.15] });
    k.add('cyl', 'gloss', [0.64, 1.03, 0.0], [0.05, 0.12, 0.05], '#1b1620', { r: [0, 0, 1.2] });
    // kulaklık standı + kulaklık
    k.add('cyl', 'metal', [-0.72, 0.775, 0.3], [0.1, 0.02, 0.1], C.metal);
    k.add('cyl', 'metal', [-0.72, 0.9, 0.3], [0.02, 0.25, 0.02], C.metal);
    k.box([-0.72, 1.0, 0.3], [0.2, 0.025, 0.03], '#1b1620', 'matte');
    for (const hx of [-0.8, -0.64])
      k.add('cyl', 'matte', [hx, 0.97, 0.3], [0.07, 0.03, 0.07], '#1b1620', { r: [0, 0, Math.PI / 2] });
    // plaket, kupa, ödül, küçük bitki
    k.box([0.3, 0.775, 0.4], [0.22, 0.03, 0.04], '#d9a441', 'metal');
    k.box([0.3, 0.79, 0.41], [0.2, 0.004, 0.01], '#2a1a12');
    k.add('cyl', 'gloss', [0.6, 0.81, 0.33], [0.08, 0.1, 0.08], '#ffb547');
    k.add('cyl', 'metal', [0.72, 0.8, -0.34], [0.08, 0.08, 0.08], '#d9a441');
    k.add('cone', 'metal', [0.72, 0.9, -0.34], [0.12, 0.12, 0.12], '#d9a441', { r: [Math.PI, 0, 0] });
    k.add('cyl', 'matte', [-0.6, 0.8, -0.34], [0.1, 0.1, 0.1], C.pot[1 % C.pot.length]!);
    k.add('ico', 'leaf', [-0.6, 0.91, -0.34], [0.18, 0.18, 0.18], C.leaf[0]!, { r: [0.3, 0.5, 0] });
    // L kolunda: masa lambası, telefon standı, defter ve kalem
    k.add('cyl', 'metal', [-1.55, 0.78, 0.4], [0.14, 0.03, 0.14], C.metal);
    k.add('cyl', 'metal', [-1.55, 0.98, 0.4], [0.02, 0.4, 0.02], C.metal);
    k.add('cone', 'matte', [-1.55, 1.2, 0.47], [0.2, 0.16, 0.2], C.amber, { r: [0.5, 0, 0] });
    k.add('sphere', 'glow', [-1.55, 1.15, 0.5], [0.07, 0.07, 0.07], C.amber, { glow: 2.4 });
    k.box([-1.25, 0.8, 0.5], [0.09, 0.06, 0.08], C.dark, 'metal');
    k.box([-1.25, 0.86, 0.52], [0.07, 0.11, 0.008], '#1b1620', 'gloss', { r: [-0.35, 0, 0] });
    k.box([-1.4, 0.772, 1.05], [0.22, 0.02, 0.3], '#7a2a2a', 'matte', { r: [0, 0.25, 0] });
    k.box([-1.4, 0.784, 1.05], [0.2, 0.004, 0.28], '#f4ece8', 'matte', { r: [0, 0.25, 0] });
    k.add('cyl', 'gloss', [-1.18, 0.785, 1.05], [0.012, 0.15, 0.012], '#e0304b', {
      r: [Math.PI / 2, 0, 1.2],
    });
    // oyuncu kasası: masanın sağ yanında, cam yan paneli ve renkli fanlarla
    k.box([1.4, 0.26, -0.02], [0.26, 0.52, 0.5], '#14121a', 'matte', { cast: true });
    k.box([1.4, 0.26, 0.2455], [0.23, 0.48, 0.012], '#0b1428', 'gloss');
    k.box([1.4, 0.012, 0.0], [0.28, 0.022, 0.52], '#ff4fd8', 'glow', { glow: 1.4 });
    const fan = ['#ff4fd8', '#6fe3ff', '#8f6bff'];
    for (let i = 0; i < 3; i++)
      k.add('cyl', 'glow', [1.4, 0.1 + i * 0.16, 0.236], [0.14, 0.012, 0.14], fan[i]!, {
        r: [Math.PI / 2, 0, 0],
        glow: 1.6,
      });
    k.box([1.4 - 0.105, 0.26, 0.2395], [0.012, 0.46, 0.006], '#6fe3ff', 'glow', { glow: 1.8 });
  });
  // arkada alçak dolap, üstünde bitki ve ödüller
  k.box([seat.deskX, 0.32, 0.38], [2.0, 0.64, 0.38], '#2a1418', 'wood', { cast: true });
  plant(k, seat.deskX - 0.7, 0.38, 0.55, 99);
  for (let i = 0; i < 4; i++)
    k.box([seat.deskX + 0.2 + i * 0.12, 0.74, 0.38], [0.08, 0.2, 0.22], C.books[i + 2]!);
  leadChair(k, seat);
}

function testerBoard(k: Kit, x: number, z: number): void {
  k.at(x, 0, z, 0, () => {
    for (const dx of [-0.38, 0.38])
      k.box([dx, 0.8, -0.05], [0.04, 1.6, 0.04], C.metal, 'metal', { cast: true });
    k.box([0, 1.25, 0], [0.86, 0.72, 0.03], '#f4ece8', 'gloss', { cast: true });
    for (let i = 0; i < 6; i++) {
      const y = 1.5 - i * 0.1;
      k.box([-0.33, y, 0.02], [0.05, 0.05, 0.005], i === 3 ? '#ff4d5e' : '#3fd27a', 'glow', { glow: 1.3 });
      k.box([-0.05, y, 0.02], [0.4 - (i % 3) * 0.08, 0.02, 0.004], '#6b5a62');
    }
  });
}

function pendant(k: Kit, x: number, z: number, long: boolean): void {
  if (long) {
    k.box([x, 2.62, z], [2.6, 0.08, 0.22], C.dark, 'metal');
    k.box([x, 2.575, z], [2.5, 0.015, 0.16], '#ffd9a8', 'glow', { glow: 2.2 });
    for (const dx of [-1.1, 1.1]) k.add('cyl', 'metal', [x + dx, 2.92, z], [0.01, 0.56, 0.01], C.dark);
  } else {
    k.add('cyl', 'metal', [x, 2.95, z], [0.012, 0.5, 0.012], C.dark);
    k.add('cone', 'matte', [x, 2.6, z], [0.5, 0.32, 0.5], '#2a1a1e', { r: [0, 0, 0] });
    k.add('sphere', 'glow', [x, 2.48, z], [0.16, 0.16, 0.16], '#ffcf8a', { glow: 2.6 });
  }
}

/** Arka duvarda xa–xb arası pencere bandı: denizlik, üst duvar, dikmeler, yatay kayıt ve camlar. */
function windowBand(k: Kit, glass: FurnitureLayout['glass'], xa: number, xb: number): void {
  const len = xb - xa;
  if (len <= 0.2) return;
  const cx = (xa + xb) / 2;
  k.box([cx, 0.25, -0.1], [len, 0.5, 0.2], C.wall, 'matte', { cast: true });
  k.box([cx, (2.75 + WALL_H) / 2, -0.1], [len, WALL_H - 2.75, 0.2], C.wall, 'matte', { cast: true });
  k.box([cx, 0.52, 0.04], [len, 0.05, 0.16], '#2a1418', 'wood');
  const panes = Math.max(2, Math.round(len / 2.3));
  const paneW = len / panes;
  for (let i = 0; i <= panes; i++) {
    k.box([xa + i * paneW, 1.62, -0.06], [0.12, 2.26, 0.16], C.frame, 'metal', { cast: true });
  }
  for (let i = 0; i < panes; i++) {
    const x = xa + (i + 0.5) * paneW;
    k.box([x, 1.62, -0.06], [paneW, 0.05, 0.08], C.frame, 'metal'); // yatay kayıt
    glass.push({ p: [x, 1.625, -0.08], s: [paneW - 0.1, 2.2, 0.02], rotY: 0 });
  }
}

/**
 * DevTechnic marka duvarı: dolu duvar, lacivert panel, iki yanda dikey ahşap çıtalar, altın ışık çizgileri,
 * üstte aşağı vuran ışık şeridi ve alçak raf. Logo ve yazı dokulu yüzey olarak ayrıca çizilir (bkz. Room.tsx).
 */
function brandWall(k: Kit, x0: number, x1: number): { logo: Decal; word: Decal } {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  k.box([cx, WALL_H / 2, -0.1], [w, WALL_H, 0.2], C.wall, 'matte', { cast: true });
  k.box([cx, 1.55, 0.02], [w - 0.12, 2.9, 0.04], BRAND.navy, 'matte');
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const x = cx + side * (w / 2 - 0.16 - i * 0.11);
      k.box([x, 1.55, 0.065], [0.055, 2.9, 0.05], '#8a5a3a', 'wood');
    }
  const fw = w - 1.75;
  for (const y of [0.5, 2.62]) k.box([cx, y, 0.045], [fw, 0.022, 0.012], BRAND.gold, 'glow', { glow: 1.5 });
  for (const x of [cx - fw / 2, cx + fw / 2])
    k.box([x, 1.56, 0.045], [0.022, 2.14, 0.012], BRAND.gold, 'glow', { glow: 1.2 });
  // üstte ışık şeridi (duvarı aşağı doğru yıkar)
  k.box([cx, 2.99, 0.1], [w - 0.2, 0.05, 0.1], C.dark, 'metal');
  k.box([cx, 2.962, 0.12], [w - 0.3, 0.012, 0.05], '#ffe8b0', 'glow', { glow: 2.2 });
  // alçak raf: ortada küçük ödüller
  k.box([cx, 0.36, 0.15], [fw - 0.2, 0.04, 0.22], '#8a5a3a', 'wood', { cast: true });
  for (const dx of [-0.9, 0.9]) {
    k.add('cyl', 'metal', [cx + dx, 0.42, 0.15], [0.09, 0.08, 0.09], '#d9a441');
    k.add('cone', 'metal', [cx + dx, 0.53, 0.15], [0.13, 0.14, 0.13], '#d9a441', { r: [Math.PI, 0, 0] });
  }
  return {
    logo: { p: [cx, 1.78, 0.05], rotY: 0, w: 2.5, h: 1.25 },
    word: { p: [cx, 0.86, 0.05], rotY: 0, w: 2.6, h: 0.325 },
  };
}

/** Kanepeye bakan koltuk (yerel +z kişinin baktığı yön; sırt -z'de). */
function armchair(k: Kit, x: number, z: number, heading: number): void {
  k.at(x, 0, z, heading, () => {
    k.box([0, 0.22, 0], [0.78, 0.3, 0.74], C.sofa.body, 'fabric', { cast: true });
    k.box([0, 0.42, 0.05], [0.58, 0.12, 0.6], C.sofa.seat, 'fabric', { cast: true });
    k.box([0, 0.66, -0.3], [0.78, 0.6, 0.16], C.sofa.back, 'fabric', { cast: true });
    for (const dx of [-0.34, 0.34]) k.box([dx, 0.46, 0], [0.12, 0.38, 0.74], C.sofa.body, 'fabric');
    k.box([0, 0.6, -0.18], [0.34, 0.3, 0.1], C.sofa.pillows[1], 'fabric', { r: [-0.25, 0, 0] });
    for (const dx of [-0.32, 0.32])
      for (const dz of [-0.3, 0.3]) k.box([dx, 0.03, dz], [0.05, 0.06, 0.05], C.dark);
  });
}

export function buildFurniture(plan: OfficePlan, theme: OfficeTheme): FurnitureLayout {
  C = paletteOf(theme);
  const k = new Kit();
  const screens: ScreenSpot[] = [];
  const glass: FurnitureLayout['glass'] = [];
  const W = plan.width;
  const D = plan.depth;
  const z = plan.zones;

  // ---------- duvarlar ve pencereler ----------
  // arka duvar: toplantı odası kısmı dolu, ortada DevTechnic marka duvarı, iki yanında pencere bantları
  const meetW = z.meeting.x1;
  k.box([meetW / 2, WALL_H / 2, -0.1], [meetW + 0.2, WALL_H, 0.2], C.wall, 'matte', { cast: true });
  windowBand(k, glass, meetW, z.brandWall.x0);
  windowBand(k, glass, z.brandWall.x1, W);
  const brandSurfaces = brandWall(k, z.brandWall.x0, z.brandWall.x1);
  // sol duvar (kapılı)
  const dz0 = z.door.z - z.door.width / 2;
  const dz1 = z.door.z + z.door.width / 2;
  k.box([-0.1, WALL_H / 2, dz0 / 2], [0.2, WALL_H, dz0], C.wall, 'matte', { cast: true });
  k.box([-0.1, WALL_H / 2, (dz1 + D) / 2], [0.2, WALL_H, D - dz1], C.wall, 'matte', { cast: true });
  k.box([-0.1, (2.35 + WALL_H) / 2, z.door.z], [0.2, WALL_H - 2.35, z.door.width], C.wall);
  for (const dz of [dz0, dz1]) k.box([0, 1.18, dz], [0.24, 2.36, 0.08], C.frame, 'metal');
  k.box([0, 2.38, z.door.z], [0.24, 0.06, z.door.width + 0.1], C.frame, 'metal');
  k.box([0.03, 2.55, z.door.z], [0.04, 0.12, 0.34], '#2bd67a', 'glow', { glow: 1.6 }); // çıkış ışığı
  // sağ duvar
  k.box([W + 0.1, WALL_H / 2, D / 2], [0.2, WALL_H, D], C.wall, 'matte', { cast: true });
  // süpürgelik ve tavan kenarındaki neon şerit
  k.box([meetW / 2, 0.05, 0.01], [meetW, 0.1, 0.02], C.base);
  k.box([0.01, 0.05, D / 2], [0.02, 0.1, D], C.base);
  k.box([W - 0.01, 0.05, D / 2], [0.02, 0.1, D], C.base);
  k.box([W / 2, WALL_H - 0.04, 0.02], [W, 0.025, 0.025], C.neon, 'glow', { glow: C.neonGlow });
  k.box([0.02, WALL_H - 0.04, D / 2], [0.025, 0.025, D], C.neon, 'glow', { glow: C.neonGlow });
  k.box([W - 0.02, WALL_H - 0.04, D / 2], [0.025, 0.025, D], C.neon, 'glow', { glow: C.neonGlow });
  // ön kenar (kesit): zemin kenarında ince ışık
  k.box([W / 2, 0.012, D + 0.02], [W, 0.024, 0.04], C.neon, 'glow', { glow: C.neonGlow * 0.75 });

  // ---------- masalar ----------
  for (const seat of plan.seats) {
    if (seat.kind === 'lead-corner') leadCornerDesk(k, seat, screens);
    else desk(k, seat, screens);
  }
  const carpets: FurnitureLayout['carpets'] = [];
  const islandLabels: FurnitureLayout['islandLabels'] = [];
  for (const isl of plan.islands) {
    const w = isl.cols * 1.7 + 1.2;
    carpets.push({ x: isl.x, z: isl.z, w, d: 3.9 });
    // Tabela halının ön kenarında, ortada: masa etiketleri (sandalyelerin üstünde) ile çakışmaz.
    islandLabels.push({ role: isl.role, x: isl.x, z: isl.z + 2.0 });
    if (isl.role === 'tester') {
      const b = testerBoardOf(isl);
      testerBoard(k, b.x, b.z);
    }
  }

  // ---------- toplantı odası ----------
  const m = z.meeting;
  const mx = (m.x0 + m.x1) / 2;
  // cam duvarlar ve dikmeler
  glass.push({ p: [m.x1, 1.3, (m.z0 + m.z1) / 2], s: [0.02, 2.6, m.z1 - m.z0], rotY: 0 });
  glass.push({
    p: [(m.x0 + z.meetingDoor.x0) / 2, 1.3, m.z1],
    s: [z.meetingDoor.x0 - m.x0, 2.6, 0.02],
    rotY: 0,
  });
  glass.push({
    p: [(z.meetingDoor.x1 + m.x1) / 2, 1.3, m.z1],
    s: [m.x1 - z.meetingDoor.x1, 2.6, 0.02],
    rotY: 0,
  });
  for (const zz of [m.z0 + 0.05, 1.8, 3.5, m.z1]) k.box([m.x1, 1.3, zz], [0.06, 2.6, 0.06], C.frame, 'metal');
  for (const xx of [0.05, 1.9, z.meetingDoor.x0, z.meetingDoor.x1])
    k.box([xx, 1.3, m.z1], [0.06, 2.6, 0.06], C.frame, 'metal');
  k.box([m.x1, 2.62, (m.z0 + m.z1) / 2], [0.08, 0.06, m.z1 - m.z0], C.frame, 'metal');
  k.box([(m.x0 + m.x1) / 2, 2.62, m.z1], [m.x1 - m.x0, 0.06, 0.08], C.frame, 'metal');
  // buzlu şerit (cam üzerinde)
  k.box([m.x1 + 0.015, 1.25, (m.z0 + m.z1) / 2], [0.005, 0.12, m.z1 - m.z0 - 0.2], C.trim, 'glow', {
    glow: 0.6,
  });
  // masa ve sandalyeler
  k.box([mx, 0.74, 2.4], [3.1, 0.05, 1.25], '#d9c8c0', 'gloss', { cast: true });
  for (const dx of [-0.9, 0.9]) k.box([mx + dx, 0.37, 2.4], [0.12, 0.72, 0.7], C.dark, 'metal');
  for (const dx of [-1, 0, 1]) {
    chair(k, { x: mx + dx, z: 1.35, heading: 0 }, '#4a2232');
    chair(k, { x: mx + dx, z: 3.45, heading: Math.PI }, '#4a2232');
  }
  // duvar ekranı
  k.box([mx, 1.65, 0.04], [2.3, 1.25, 0.06], C.screenBack, 'matte');
  screens.push({ id: 'meeting', kind: 'meeting', p: [mx, 1.65, 0.075], rotY: 0, w: 2.15, h: 1.12 });
  plant(k, 0.5, 4.6, 0.85, 7);
  // akustik paneller (sol duvar, marka renkleri)
  const acoustic = [BRAND.navy, '#134e4a', BRAND.navySoft, '#0e3b38'];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++) {
      const c = row === 1 && col === 2 ? BRAND.gold : acoustic[(row + col) % acoustic.length]!;
      k.box([0.035, 1.05 + row * 0.6, 0.85 + col * 0.66], [0.05, 0.54, 0.6], c, 'fabric');
    }
  // masada konferans telefonu, bardaklar ve su şişesi
  k.add('cyl', 'matte', [mx, 0.78, 2.4], [0.26, 0.03, 0.26], '#1c1c22');
  k.add('cyl', 'glow', [mx, 0.797, 2.4], [0.08, 0.004, 0.08], BRAND.teal, { glow: 1.4 });
  for (const dx of [-1, 0.05, 1]) {
    k.add('cyl', 'gloss', [mx + dx, 0.82, 1.92], [0.06, 0.1, 0.06], '#bfe3ff');
    k.add('cyl', 'gloss', [mx + dx - 0.05, 0.82, 2.88], [0.06, 0.1, 0.06], '#bfe3ff');
  }
  k.add('cyl', 'gloss', [mx + 0.55, 0.88, 2.4], [0.08, 0.24, 0.08], '#6fc8ff');

  // ---------- mutfak / kahve köşesi ----------
  const kz = (z.kitchen.z0 + z.kitchen.z1) / 2;
  k.box([0.33, 0.45, kz - 0.1], [0.66, 0.9, 3.8], '#2a1a1e', 'matte', { cast: true });
  for (let i = 0; i < 5; i++)
    k.box([0.665, 0.45, z.kitchen.z0 + 0.5 + i * 0.75], [0.01, 0.8, 0.012], '#120a0e');
  k.box([0.36, 0.92, kz - 0.1], [0.74, 0.04, 3.9], '#e6dcd6', 'gloss');
  k.box([0.2, 2.15, kz - 0.4], [0.4, 0.7, 3.2], '#2a1a1e', 'matte');
  k.box([0.41, 1.79, kz - 0.4], [0.02, 0.02, 3.1], '#ffcf8a', 'glow', { glow: 2 });
  // espresso makinesi (kahve noktasına bakar): krom gövde, iki demleme başlığı, buhar çubuğu, göstergeler
  const cz = plan.coffee.z;
  k.box([0.3, 1.17, cz], [0.42, 0.46, 0.66], '#b8bcc4', 'metal', { cast: true });
  k.box([0.3, 1.41, cz], [0.4, 0.03, 0.62], '#2a2a30', 'metal');
  k.box([0.515, 1.25, cz], [0.012, 0.14, 0.5], '#1b1b22', 'gloss');
  for (const dz of [-0.15, 0.15]) {
    k.add('cyl', 'metal', [0.56, 1.08, cz + dz], [0.09, 0.06, 0.09], '#d9dde3');
    k.add('cyl', 'metal', [0.6, 1.07, cz + dz], [0.02, 0.02, 0.02], '#1b1b22', { r: [0, 0, Math.PI / 2] });
    k.add('cyl', 'gloss', [0.56, 0.98, cz + dz], [0.06, 0.06, 0.06], '#f4ece8');
    k.add('cyl', 'glow', [0.522, 1.27, cz + dz * 0.6], [0.035, 0.01, 0.035], dz < 0 ? '#5fe0a0' : '#ffb547', {
      glow: 1.8,
      r: [0, 0, Math.PI / 2],
    });
  }
  k.box([0.56, 0.95, cz], [0.18, 0.02, 0.52], '#2a2a30', 'metal'); // damla tepsisi
  k.add('cyl', 'metal', [0.57, 1.12, cz + 0.29], [0.012, 0.22, 0.012], '#d9dde3', { r: [0.25, 0, 0] });
  for (let i = 0; i < 3; i++)
    k.add('cyl', 'gloss', [0.25 + (i % 2) * 0.1, 1.46, cz - 0.15 + i * 0.13], [0.06, 0.07, 0.06], '#f4ece8');
  // kahve değirmeni
  k.add('cyl', 'metal', [0.3, 1.1, cz - 0.52], [0.14, 0.3, 0.14], '#2a2a30');
  k.add('cone', 'gloss', [0.3, 1.33, cz - 0.52], [0.13, 0.18, 0.13], '#6b4232', { r: [Math.PI, 0, 0] });
  // kupalar
  for (let i = 0; i < 4; i++)
    k.add('cyl', 'gloss', [0.3, 0.98, cz + 0.5 + i * 0.12], [0.075, 0.1, 0.075], C.mugs[i]!);
  // lavabo
  k.box([0.36, 0.935, kz + 0.9], [0.44, 0.012, 0.52], '#8a8a94', 'metal');
  k.add('cyl', 'metal', [0.16, 1.08, kz + 0.9], [0.025, 0.28, 0.025], '#b8b8c0');
  // buzdolabı
  k.box([0.38, 1.0, z.kitchen.z1 - 0.3], [0.72, 2.0, 0.66], '#cfc8cc', 'gloss', { cast: true });
  k.box([0.75, 1.3, z.kitchen.z1 - 0.52], [0.02, 0.5, 0.03], '#7a7a84', 'metal');
  // yüksek bar masası ve tabureler
  k.box([2.6, 1.02, 8.6], [0.7, 0.04, 1.45], '#6b4232', 'wood', { cast: true });
  k.box([2.6, 0.5, 8.6], [0.1, 1.0, 1.0], C.dark, 'metal');
  for (const sz of [8.05, 8.6, 9.15]) {
    k.add('cyl', 'fabric', [3.18, 0.74, sz], [0.36, 0.06, 0.36], '#ff6f9a', { cast: true });
    k.add('cyl', 'metal', [3.18, 0.37, sz], [0.04, 0.72, 0.04], C.metal);
    k.add('cyl', 'metal', [3.18, 0.02, sz], [0.3, 0.03, 0.3], C.dark);
  }
  k.add('cyl', 'gloss', [2.5, 1.09, 8.4], [0.075, 0.1, 0.075], '#ffb547');
  // meyve kâsesi
  k.add('cyl', 'gloss', [2.62, 1.08, 9.0], [0.3, 0.07, 0.3], '#e9e0dc');
  ['#ff8a2a', '#e0304b', '#ffd23a', '#5fbf4a', '#ff8a2a'].forEach((c, i) => {
    const a = (i / 5) * Math.PI * 2;
    k.add(
      'sphere',
      'gloss',
      [2.62 + Math.cos(a) * 0.07, 1.15 + (i === 4 ? 0.05 : 0), 9.0 + Math.sin(a) * 0.07],
      [0.09, 0.09, 0.09],
      c,
    );
  });
  // mikrodalga
  k.box([0.34, 1.08, 8.3], [0.4, 0.28, 0.52], '#2a2a30', 'metal', { cast: true });
  k.box([0.545, 1.08, 8.24], [0.01, 0.2, 0.34], '#101014', 'gloss');
  k.box([0.545, 1.08, 8.5], [0.01, 0.2, 0.08], '#3a3a42', 'matte');
  k.box([0.552, 1.13, 8.5], [0.004, 0.025, 0.05], BRAND.teal, 'glow', { glow: 1.6 });
  // barın üstünde iki küre lamba
  for (const lz of [8.25, 8.95]) {
    k.add('cyl', 'metal', [2.6, 2.6, lz], [0.01, 1.2, 0.01], C.dark);
    k.add('sphere', 'glow', [2.6, 1.98, lz], [0.2, 0.2, 0.2], '#ffd9a0', { glow: 1.9 });
  }

  // ---------- beyaz tahta ve kitaplık ----------
  const wb = z.whiteboard;
  const wbz = (wb.z0 + wb.z1) / 2;
  k.box([W - 0.03, 1.55, wbz], [0.05, 1.32, wb.z1 - wb.z0 + 0.06], '#8a8a94', 'metal');
  k.box([W - 0.1, 0.9, wbz], [0.1, 0.03, 1.2], '#8a8a94', 'metal');
  for (let i = 0; i < 3; i++)
    k.add(
      'cyl',
      'gloss',
      [W - 0.1, 0.93, wbz - 0.2 + i * 0.14],
      [0.02, 0.12, 0.02],
      ['#2b4bd8', '#d8304b', '#1e8a5a'][i]!,
      { r: [Math.PI / 2, 0, 0] },
    );
  const bs = z.bookshelf;
  const bz = (bs.z0 + bs.z1) / 2;
  const bl = bs.z1 - bs.z0;
  for (const zz of [bs.z0, bs.z1])
    k.box([W - 0.22, 1.05, zz], [0.42, 2.1, 0.04], '#3a2018', 'wood', { cast: true });
  k.box([W - 0.42, 1.05, bz], [0.02, 2.1, bl], '#24120e');
  const r = rng(31);
  for (let s = 0; s < 5; s++) {
    const y = 0.08 + s * 0.48;
    k.box([W - 0.22, y, bz], [0.42, 0.03, bl], '#3a2018', 'wood');
    let zz = bs.z0 + 0.06;
    while (zz < bs.z1 - 0.12) {
      const t = 0.04 + r() * 0.05;
      const h = 0.24 + r() * 0.14;
      if (r() < 0.1) {
        zz += 0.12;
        continue;
      }
      k.box(
        [W - 0.24, y + 0.015 + h / 2, zz + t / 2],
        [0.26, h, t],
        C.books[Math.floor(r() * C.books.length)]!,
        'matte',
        {
          r: r() < 0.08 ? [0.25, 0, 0] : [0, 0, 0],
        },
      );
      zz += t + 0.006;
    }
  }
  k.box([W - 0.22, 2.12, bz], [0.42, 0.03, bl], '#3a2018', 'wood');
  plant(k, W - 0.25, bs.z0 + 0.25, 0.4, 41);

  // ---------- kanepe köşesi ----------
  const lz = (z.lounge.z0 + z.lounge.z1) / 2;
  k.at(W - 0.85, 0, lz, -Math.PI / 2, () => {
    k.box([0, 0.2, 0], [2.5, 0.3, 0.92], C.sofa.body, 'fabric', { cast: true });
    for (const dx of [-0.78, 0, 0.78])
      k.box([dx, 0.42, 0.06], [0.74, 0.14, 0.76], C.sofa.seat, 'fabric', { cast: true });
    k.box([0, 0.68, -0.36], [2.5, 0.56, 0.22], C.sofa.back, 'fabric', { cast: true });
    for (const dx of [-1.28, 1.28])
      k.box([dx, 0.45, 0], [0.2, 0.52, 0.92], C.sofa.body, 'fabric', { cast: true });
    k.box([-0.95, 0.64, -0.18], [0.36, 0.34, 0.12], C.sofa.pillows[0], 'fabric', { r: [-0.25, 0.2, 0] });
    k.box([0.95, 0.64, -0.18], [0.36, 0.34, 0.12], C.sofa.pillows[1], 'fabric', { r: [-0.25, -0.2, 0] });
    for (const dx of [-1.15, 1.15])
      for (const dz of [-0.35, 0.35]) k.box([dx, 0.03, dz], [0.06, 0.06, 0.06], C.dark);
  });
  k.box([W - 2.9, 0.42, lz], [0.8, 0.04, 1.3], '#6b4232', 'wood', { cast: true });
  for (const dx of [-0.32, 0.32])
    for (const dz of [-0.55, 0.55]) k.box([W - 2.9 + dx, 0.2, lz + dz], [0.04, 0.4, 0.04], C.dark, 'metal');
  k.box([W - 2.85, 0.45, lz - 0.3], [0.28, 0.02, 0.36], '#e9e0dc', 'matte', { r: [0, 0.3, 0] });
  k.box([W - 2.95, 0.465, lz - 0.25], [0.26, 0.02, 0.34], '#ff9db3', 'matte', { r: [0, -0.2, 0] });
  plant(k, W - 2.9, lz + 0.35, 0.3, 61);
  // lambader
  k.add('cyl', 'metal', [W - 0.5, 0.02, lz - 1.65], [0.32, 0.03, 0.32], C.dark);
  k.add('cyl', 'metal', [W - 0.5, 0.8, lz - 1.65], [0.03, 1.6, 0.03], C.metal);
  k.add('cone', 'fabric', [W - 0.5, 1.68, lz - 1.65], [0.46, 0.34, 0.46], '#f4dcc8');
  k.add('sphere', 'glow', [W - 0.5, 1.6, lz - 1.65], [0.14, 0.14, 0.14], '#ffcf8a', { glow: 2.4 });

  // dinlenme alanı: iki koltuk, yan sehpa
  for (const a of z.armchairs) armchair(k, a.x, a.z, a.heading);
  k.add('cyl', 'wood', [z.sideTable.x, 0.5, z.sideTable.z], [0.42, 0.03, 0.42], '#6b4232', { cast: true });
  k.add('cyl', 'metal', [z.sideTable.x, 0.25, z.sideTable.z], [0.04, 0.5, 0.04], C.metal);
  k.add('cyl', 'metal', [z.sideTable.x, 0.015, z.sideTable.z], [0.3, 0.03, 0.3], C.dark);
  k.add('cyl', 'gloss', [z.sideTable.x + 0.08, 0.57, z.sideTable.z], [0.07, 0.1, 0.07], C.mugs[3]!);

  // oyun köşesi: alçak TV sehpası, konsol, TV ve önünde iki armut koltuk
  const tv = z.tv;
  k.box([tv.x, 0.22, tv.z], [1.6, 0.4, 0.42], '#2a1a16', 'wood', { cast: true });
  k.box([tv.x, 0.43, tv.z], [1.64, 0.03, 0.46], '#4a2e24', 'wood');
  for (const dx of [-0.4, 0.4]) k.box([tv.x + dx, 0.22, tv.z + 0.212], [0.74, 0.32, 0.01], '#3a2420', 'wood');
  // konsol: beyaz gövde, ışık şeridi; yanında ikinci kol
  k.box([tv.x - 0.5, 0.5, tv.z + 0.02], [0.36, 0.1, 0.28], '#e9e6ea', 'gloss');
  k.box([tv.x - 0.5, 0.5, tv.z + 0.161], [0.3, 0.012, 0.004], '#6fc8ff', 'glow', { glow: 1.6 });
  k.box([tv.x + 0.5, 0.47, tv.z + 0.05], [0.16, 0.04, 0.1], '#1b1b22', 'matte', { r: [0, 0.4, 0] });
  // TV: ince ayak ve çerçeve (ekran ayrıca çizilir)
  k.box([tv.x, 0.5, tv.z - 0.04], [0.4, 0.02, 0.2], C.dark, 'metal');
  k.box([tv.x, 0.6, tv.z - 0.08], [0.06, 0.2, 0.04], C.dark, 'metal');
  k.box([tv.x, 1.08, tv.z - 0.08], [1.46, 0.84, 0.05], C.screenBack, 'matte', { cast: true });
  screens.push({ id: 'tv', kind: 'tv', p: [tv.x, 1.08, tv.z - 0.05], rotY: 0, w: 1.38, h: 0.76 });
  z.beanbags.forEach((b, i) => {
    const color = C.sofa.pillows[i % C.sofa.pillows.length]!;
    k.add('sphere', 'fabric', [b.x, 0.24, b.z], [0.76, 0.46, 0.72], color, { cast: true });
    // sırt kabarıklığı TV'nin tersinde (+z)
    k.add('sphere', 'fabric', [b.x, 0.42, b.z + 0.2], [0.6, 0.32, 0.3], color);
  });

  // teknoloji şirketi eşyaları (Sürüm 5)
  techFurniture(k, plan, glass, C);

  // lider köşesi: plaketin altında ödül rafı
  k.box([W - 0.13, 1.18, 1.7], [0.22, 0.03, 1.1], '#3a2018', 'wood');
  ['#d9a441', '#c0c4cc', '#d9a441'].forEach((c, i) => {
    const zz = 1.35 + i * 0.35;
    k.add('cyl', 'metal', [W - 0.13, 1.22, zz], [0.08, 0.05, 0.08], c);
    k.add('cyl', 'metal', [W - 0.13, 1.31, zz], [0.03, 0.14, 0.03], c);
    k.add('sphere', 'metal', [W - 0.13, 1.42, zz], [0.09, 0.09, 0.09], c);
  });

  // giriş: karşılama totemi (simge ayrıca çizilir) ve portmanto
  const t = z.totem;
  k.box([t.x, 0.02, t.z], [0.5, 0.04, 0.24], C.dark, 'metal');
  k.box([t.x, 0.78, t.z], [0.42, 1.5, 0.12], BRAND.navy, 'matte', { cast: true });
  k.box([t.x, 1.5, t.z + 0.062], [0.3, 0.012, 0.004], BRAND.gold, 'glow', { glow: 1.5 });
  k.box([t.x, 0.72, t.z + 0.062], [0.3, 0.012, 0.004], BRAND.gold, 'glow', { glow: 1.5 });
  const cr = z.coatRack;
  k.add('cyl', 'metal', [cr.x, 0.02, cr.z], [0.4, 0.03, 0.4], C.dark);
  k.add('cyl', 'metal', [cr.x, 0.9, cr.z], [0.035, 1.8, 0.035], C.metal);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    k.add(
      'cyl',
      'metal',
      [cr.x + Math.cos(a) * 0.1, 1.72, cr.z + Math.sin(a) * 0.1],
      [0.02, 0.22, 0.02],
      C.metal,
      {
        r: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8],
      },
    );
  }
  k.box([cr.x + 0.12, 1.35, cr.z], [0.08, 0.6, 0.34], '#3a5a8a', 'fabric', { r: [0, 0, 0.12] });
  k.box([cr.x - 0.1, 1.42, cr.z + 0.04], [0.08, 0.46, 0.3], '#8a3a3a', 'fabric', { r: [0, 0, -0.1] });

  // ---------- bitkiler ve lambalar ----------
  plan.plants.forEach((p, i) => plant(k, p.x, p.z, p.size, 200 + i));
  for (const l of plan.lamps) pendant(k, l.x, l.z, l.kind === 'island');

  const rugs: FurnitureLayout['rugs'] = [
    { x: W - 2.2, z: lz, w: 3.4, d: 3.2, rotY: 0, kind: 'lounge' },
    {
      x: plan.seats.find((s) => s.id === 'lead-corner:0')!.deskX - 0.4,
      z: 2.2,
      w: 3.6,
      d: 2.6,
      rotY: 0,
      kind: 'lead',
    },
    { x: mx, z: 2.4, w: 4.0, d: 2.8, rotY: 0, kind: 'meeting' },
  ];

  const loungeZ = (z.lounge.z0 + z.lounge.z1) / 2;
  const kitchenZ = (z.kitchen.z0 + z.kitchen.z1) / 2;
  return {
    parts: k.parts,
    brand: {
      ...brandSurfaces,
      plaque: { p: [W - 0.035, 1.78, 1.7], rotY: -Math.PI / 2, w: 0.96, h: 0.64 },
      neon: { p: [W - 0.03, 1.95, loungeZ], rotY: -Math.PI / 2, w: 0.85, h: 0.85 },
      totem: { p: [t.x, 1.12, t.z + 0.063], rotY: 0, w: 0.3, h: 0.3 },
      mat: { p: [1.05, 0.009, z.door.z], rotY: 0, w: 1.3, h: 1.3 },
    },
    tiles: { p: [0.012, 1.36, kitchenZ - 0.1], rotY: Math.PI / 2, w: 3.8, h: 0.84 },
    screens,
    glass,
    carpets,
    rugs,
    whiteboard: { p: [W - 0.06, 1.55, wbz], rotY: -Math.PI / 2, w: wb.z1 - wb.z0 - 0.08, h: 1.24 },
    islandLabels,
    door: { x: 0, z: z.door.z, width: z.door.width },
  };
}
