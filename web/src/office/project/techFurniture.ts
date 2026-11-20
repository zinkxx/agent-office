import type { OfficePlan, Seat } from '../sim/plan.ts';
import type { Kit } from './batch.tsx';
import type { FurnitureLayout, Palette } from './furniture.ts';

/**
 * Teknoloji şirketi eşyalarının sabit kısımları (Sürüm 5): sunucu odası, duvar panosu ve derleme lambasının
 * ayakları, kanban panosu, deney masası, atıştırmalık rafı, espresso makinesi, yosun duvarı, giriş ekranının
 * çerçevesi, kablo kanalları ve masalardaki ayrıntılar. Canlı veriyle değişen parçalar (ışıklar, ekranlar, 3B
 * yazıcı, robot kol, drone) `TechOps.tsx`'te çizilir; konumlar buradakilerle aynı hesaplardan gelir.
 */

/** Sunucu dolapları: odanın arka tarafında, önleri +z'ye bakar. Işıklar bu ölçülere göre dizilir. */
export const RACK = { w: 0.62, h: 2.05, d: 0.8, units: 10, gap: 0.75 } as const;

export function rackXs(plan: OfficePlan): number[] {
  const r = plan.zones.tech.server;
  const cx = (r.x0 + r.x1) / 2;
  return [cx - RACK.gap, cx, cx + RACK.gap];
}

/** Dolabın ön yüzünün z'si. */
export function rackFrontZ(plan: OfficePlan): number {
  return plan.zones.tech.server.z0 + 0.12 + RACK.d;
}

/** Sunucu dolabındaki n. birimin yüksekliği (merkez). */
export function unitY(i: number): number {
  return 0.3 + i * 0.18;
}

/** Duvar panosunun ekran ölçüsü. */
export const DASH = { w: 2.3, h: 1.3, y: 1.6 } as const;
/** Kanban panosunun yüzü. */
export const KANBAN = { w: 1.85, h: 1.05, y: 1.38 } as const;
/** Derleme lambası: lambaların yükseklikleri (alttan yeşil, sarı, kırmızı). */
export const STACK_Y = [2.06, 2.22, 2.38] as const;
/** Giriş ekranı (kapının üstünde, sol duvarda). */
export const ENTRANCE = { w: 1.15, h: 0.4, y: 2.62 } as const;
/** Deney masasının yüksekliği (ayakta çalışılır). */
export const LAB_TOP = 0.92;

export function techFurniture(k: Kit, plan: OfficePlan, glass: FurnitureLayout['glass'], C: Palette): void {
  const t = plan.zones.tech;
  const W = plan.width;
  const D = plan.depth;

  // ---------- sunucu odası ----------
  const r = t.server;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  k.box([cx, 0.03, cz], [w - 0.04, 0.06, d - 0.04], '#2a2e3a', 'matte');
  for (let i = 1; i < 4; i++) k.box([r.x0 + (w * i) / 4, 0.062, cz], [0.012, 0.004, d - 0.1], '#3a4052');
  k.box([cx, 1.3, r.z0 + 0.05], [w, 2.6, 0.1], '#1d2030', 'matte', { cast: true });
  glass.push({ p: [r.x0, 1.3, cz], s: [0.02, 2.6, d], rotY: 0 });
  glass.push({ p: [r.x1, 1.3, cz], s: [0.02, 2.6, d], rotY: 0 });
  glass.push({ p: [cx, 1.3, r.z1], s: [w, 2.6, 0.02], rotY: 0 });
  for (const x of [r.x0, r.x1])
    for (const z of [r.z0 + 0.05, r.z1]) k.box([x, 1.3, z], [0.06, 2.6, 0.06], C.frame, 'metal');
  for (const x of [cx - 0.45, cx + 0.45]) k.box([x, 1.1, r.z1], [0.05, 2.2, 0.05], C.frame, 'metal');
  k.box([cx + 0.36, 1.05, r.z1 + 0.03], [0.03, 0.22, 0.03], C.metal, 'metal'); // kapı kolu
  // üst çerçeve (tavan açık: dolaplar yukarıdan görünsün)
  k.box([cx, 2.62, r.z1], [w, 0.05, 0.06], C.frame, 'metal');
  for (const x of [r.x0, r.x1]) k.box([x, 2.62, cz], [0.06, 0.05, d], C.frame, 'metal');
  k.box([cx, 2.56, r.z1 - 0.05], [w - 0.1, 0.03, 0.03], '#6fc8ff', 'glow', { glow: 1.6 });
  // kartlı geçiş okuyucu
  k.box([cx + 0.6, 1.25, r.z1 + 0.025], [0.1, 0.16, 0.02], '#14141a', 'gloss');
  k.box([cx + 0.6, 1.29, r.z1 + 0.037], [0.04, 0.02, 0.004], '#5fe0a0', 'glow', { glow: 1.8 });
  const fz = rackFrontZ(plan);
  for (const x of rackXs(plan)) {
    k.box([x, RACK.h / 2 + 0.06, fz - RACK.d / 2], [RACK.w, RACK.h, RACK.d], '#15161d', 'metal', {
      cast: true,
    });
    for (let i = 0; i < RACK.units; i++)
      k.box([x, unitY(i), fz + 0.004], [RACK.w - 0.08, 0.14, 0.01], i % 3 === 1 ? '#2a2d38' : '#22242e');
    k.box([x, RACK.h + 0.03, fz - 0.05], [RACK.w - 0.1, 0.04, 0.04], '#30333f', 'metal');
  }
  // tavandaki kablo kanalı: sunucu odasından sol duvara
  cableTray(k, (0.15 + cx) / 2, cz, cx - 0.15, 'x');
  k.box([cx - 0.2, 2.8, cz], [0.12, 0.32, 0.08], '#2a2d38');

  // duvar boyunca kablo kanalları (tavana yakın)
  cableTray(k, 0.16, (5.4 + D - 0.2) / 2, D - 5.6, 'z');
  cableTray(k, W - 0.16, (5.4 + D - 0.2) / 2, D - 5.6, 'z');

  // ---------- duvar panosu ve derleme lambası ----------
  const db = t.dashboard;
  k.at(db.x, 0, db.z, db.heading, () => {
    k.box([0, DASH.y, -0.04], [DASH.w + 0.1, DASH.h + 0.1, 0.07], C.screenBack, 'matte', { cast: true });
    for (const x of [-0.8, 0.8]) {
      k.box([x, (DASH.y - DASH.h / 2) / 2, -0.06], [0.07, DASH.y - DASH.h / 2, 0.07], C.metal, 'metal');
      k.box([x, 0.025, -0.06], [0.1, 0.05, 0.5], C.dark, 'metal');
    }
    k.box([0, DASH.y - DASH.h / 2 - 0.08, 0.0], [0.5, 0.03, 0.08], C.dark, 'metal');
  });
  const sl = t.stackLight;
  k.add('cyl', 'metal', [sl.x, 0.03, sl.z], [0.34, 0.06, 0.34], C.dark);
  k.add('cyl', 'metal', [sl.x, 1.0, sl.z], [0.04, 1.96, 0.04], C.metal);
  for (const y of [STACK_Y[0] - 0.09, STACK_Y[0] + 0.08, STACK_Y[1] + 0.08, STACK_Y[2] + 0.08])
    k.add('cyl', 'metal', [sl.x, y, sl.z], [0.17, 0.025, 0.17], '#202026');

  // ---------- kanban panosu (tekerlekli) ----------
  const kb = t.kanban;
  k.at(kb.x, 0, kb.z, kb.heading, () => {
    k.box([0, KANBAN.y, -0.03], [KANBAN.w + 0.08, KANBAN.h + 0.08, 0.04], '#d9dde3', 'metal', { cast: true });
    for (const x of [-(KANBAN.w / 2 + 0.06), KANBAN.w / 2 + 0.06]) {
      k.box([x, 0.98, -0.03], [0.05, 1.9, 0.05], C.metal, 'metal');
      k.box([x, 0.08, -0.03], [0.07, 0.04, 0.55], C.dark, 'metal');
      for (const z of [-0.27, 0.22])
        k.add('cyl', 'matte', [x, 0.04, z], [0.07, 0.03, 0.07], '#111', { r: [0, 0, Math.PI / 2] });
    }
    // kalem tablası ve kalemler
    k.box([0, KANBAN.y - KANBAN.h / 2 - 0.06, 0.02], [0.8, 0.02, 0.08], C.metal, 'metal');
    ['#e0304b', '#2b6bd8', '#1b1b22'].forEach((c, i) =>
      k.add('cyl', 'gloss', [-0.2 + i * 0.12, KANBAN.y - KANBAN.h / 2 - 0.04, 0.03], [0.02, 0.12, 0.02], c, {
        r: [0, 0, Math.PI / 2],
      }),
    );
  });

  // ---------- deney masası ----------
  const lb = t.labBench;
  k.at(lb.x, 0, lb.z, lb.heading, () => {
    k.box([0, LAB_TOP, 0], [2.6, 0.05, 0.8], '#c9ccd2', 'metal', { cast: true });
    for (const x of [-1.25, 1.25])
      for (const z of [-0.35, 0.35]) k.box([x, LAB_TOP / 2, z], [0.05, LAB_TOP, 0.05], C.dark, 'metal');
    k.box([0, 0.25, 0], [2.5, 0.03, 0.7], '#8a8e96', 'metal'); // alt raf
    for (let i = 0; i < 4; i++)
      k.box(
        [-0.9 + i * 0.55, 0.36, 0.05],
        [0.4, 0.18, 0.4],
        ['#d84a3a', '#2b6bd8', '#ffb547', '#3e8a48'][i]!,
        'gloss',
      );
    // antistatik mat, devre kartları, çipler
    k.box([-0.55, LAB_TOP + 0.03, -0.05], [1.05, 0.006, 0.55], '#2f6b5a', 'matte');
    for (const [x, z, rot] of [
      [-0.75, -0.1, 0.2],
      [-0.35, 0.05, -0.15],
    ] as const) {
      k.box([x, LAB_TOP + 0.04, z], [0.26, 0.012, 0.18], '#1f7a4a', 'gloss', { r: [0, rot, 0] });
      k.box([x, LAB_TOP + 0.052, z], [0.06, 0.012, 0.06], '#14141a', 'matte', { r: [0, rot, 0] });
      k.box([x + 0.07, LAB_TOP + 0.05, z + 0.03], [0.03, 0.01, 0.03], '#ffd23a', 'metal');
    }
    // lehim istasyonu (kıvılcım ayrıca çizilir)
    k.box([-1.0, LAB_TOP + 0.08, -0.25], [0.22, 0.12, 0.16], '#d84a3a', 'gloss');
    k.box([-0.99, LAB_TOP + 0.1, -0.165], [0.08, 0.03, 0.004], '#ffb547', 'glow', { glow: 1.8 });
    k.add('cyl', 'metal', [-1.0, LAB_TOP + 0.14, -0.06], [0.05, 0.12, 0.05], C.metal, { r: [0.7, 0, 0] });
    k.add('cyl', 'matte', [-0.92, LAB_TOP + 0.06, 0.1], [0.025, 0.2, 0.025], '#2a2a30', {
      r: [0, 0, Math.PI / 2 - 0.3],
    });
    // multimetre
    k.box([0.0, LAB_TOP + 0.09, -0.28], [0.12, 0.18, 0.05], '#ffc23a', 'gloss', { r: [-0.3, 0, 0] });
    k.box([0.0, LAB_TOP + 0.13, -0.25], [0.08, 0.05, 0.004], '#9fe0a8', 'glow', {
      glow: 0.8,
      r: [-0.3, 0, 0],
    });
    // 3B yazıcı gövdesi (baskı ve kafa ayrıca çizilir)
    const px = 0.85;
    for (const x of [px - 0.22, px + 0.22])
      for (const z of [-0.2, 0.2]) k.box([x, LAB_TOP + 0.27, z], [0.03, 0.5, 0.03], '#1b1b22', 'metal');
    k.box([px, LAB_TOP + 0.52, 0], [0.47, 0.03, 0.43], '#1b1b22', 'metal');
    k.box([px, LAB_TOP + 0.035, 0], [0.47, 0.04, 0.43], '#1b1b22', 'metal');
    k.box([px, LAB_TOP + 0.06, 0], [0.36, 0.01, 0.34], '#3a3a44', 'metal');
    k.box([px - 0.235, LAB_TOP + 0.1, 0.12], [0.01, 0.06, 0.08], '#6fc8ff', 'glow', { glow: 1.4 });
    k.add('cyl', 'gloss', [px + 0.32, LAB_TOP + 0.3, 0], [0.16, 0.06, 0.16], '#ff8a2a', {
      r: [0, 0, Math.PI / 2],
    });
    // robot kolun tabanı (kol ayrıca çizilir)
    k.add('cyl', 'metal', [0.3, LAB_TOP + 0.04, 0.05], [0.16, 0.05, 0.16], '#2a2a30');
    // masa lambası
    k.add('cyl', 'metal', [-0.3, LAB_TOP + 0.02, -0.3], [0.12, 0.02, 0.12], C.dark);
    k.add('cyl', 'metal', [-0.3, LAB_TOP + 0.2, -0.25], [0.02, 0.36, 0.02], C.metal, { r: [0.3, 0, 0] });
    k.add('cone', 'metal', [-0.3, LAB_TOP + 0.4, -0.12], [0.12, 0.1, 0.12], '#2a2a30', { r: [0.9, 0, 0] });
    k.add('sphere', 'glow', [-0.3, LAB_TOP + 0.37, -0.09], [0.05, 0.05, 0.05], '#ffe2a8', { glow: 2 });
    // küçük parça kutuları
    for (let i = 0; i < 5; i++)
      k.box(
        [-1.15 + i * 0.12, LAB_TOP + 0.05, 0.3],
        [0.1, 0.06, 0.12],
        ['#ff6f9a', '#6fc8ff', '#ffd23a', '#5fe0a0', '#c69bff'][i]!,
        'gloss',
      );
  });

  // ---------- atıştırmalık rafı ----------
  const sh = t.snackShelf;
  k.at(sh.x, 0, sh.z, sh.heading, () => {
    for (const x of [-0.78, 0.78]) k.box([x, 0.85, 0], [0.04, 1.7, 0.4], C.dark, 'metal', { cast: true });
    k.box([0, 0.85, -0.19], [1.6, 1.7, 0.02], '#2a1a1e');
    const snacks = ['#ff4f6e', '#ffb547', '#5fe0a0', '#6fc8ff', '#c69bff', '#ffd23a', '#ff8a2a', '#e9e0dc'];
    for (let s = 0; s < 4; s++) {
      const y = 0.12 + s * 0.42;
      k.box([0, y, 0], [1.54, 0.025, 0.38], '#6b4232', 'wood');
      for (let i = 0; i < 6; i++) {
        const c = snacks[(s * 3 + i) % snacks.length]!;
        const x = -0.6 + i * 0.24;
        if ((s + i) % 3 === 0) k.add('cyl', 'gloss', [x, y + 0.1, 0.02], [0.07, 0.17, 0.07], c);
        else if ((s + i) % 3 === 1)
          k.box([x, y + 0.12, 0.02], [0.16, 0.22, 0.06], c, 'gloss', { r: [0, 0, 0.06] });
        else k.add('sphere', 'fabric', [x, y + 0.08, 0.04], [0.18, 0.13, 0.12], c);
      }
    }
    k.box([0, 1.74, 0.02], [1.6, 0.06, 0.3], C.dark, 'metal');
    k.box([0, 1.74, 0.172], [1.3, 0.025, 0.004], '#ffb547', 'glow', { glow: 1.8 });
  });

  // ---------- yosun duvarı (sol duvar) ----------
  const mw = t.mossWall;
  const mz = (mw.z0 + mw.z1) / 2;
  const ml = mw.z1 - mw.z0;
  k.box([0.04, 1.6, mz], [0.06, 1.55, ml], '#4a2e24', 'wood');
  k.box([0.075, 1.6, mz], [0.02, 1.43, ml - 0.12], '#24461f', 'matte');
  const greens = ['#3e8a48', '#2f6b3a', '#4f9a52', '#5fae4a', '#25553a', '#6fbf5a'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 46; i++) {
    const z = mw.z0 + 0.1 + rnd() * (ml - 0.2);
    const y = 0.92 + rnd() * 1.35;
    const sz = 0.12 + rnd() * 0.12;
    k.add('ico', 'leaf', [0.09, y, z], [0.07, sz, sz * 1.1], greens[i % greens.length]!, {
      r: [rnd(), rnd(), rnd()],
    });
  }

  // ---------- giriş ekranının çerçevesi (kapının üstü) ----------
  k.box(
    [0.03, ENTRANCE.y, plan.zones.door.z],
    [0.05, ENTRANCE.h + 0.08, ENTRANCE.w + 0.08],
    C.screenBack,
    'matte',
  );
}

/** Tavana yakın metal kablo kanalı ve içinde renkli kablolar. `along`: uzandığı eksen. */
function cableTray(k: Kit, x: number, z: number, length: number, along: 'x' | 'z'): void {
  const y = 2.97;
  const size = (l: number, w: number, h: number): [number, number, number] =>
    along === 'x' ? [l, h, w] : [w, h, l];
  const off = (o: number): [number, number] => (along === 'x' ? [x, z + o] : [x + o, z]);
  k.box([x, y, z], size(length, 0.16, 0.025), '#7a7e86', 'metal');
  for (const o of [-0.075, 0.075]) {
    const [ox, oz] = off(o);
    k.box([ox, y + 0.03, oz], size(length, 0.01, 0.06), '#7a7e86', 'metal');
  }
  ['#2b6bd8', '#ffc23a', '#e0304b', '#1b1b22'].forEach((c, i) => {
    const [ox, oz] = off(-0.045 + i * 0.03);
    k.box([ox, y + 0.025, oz], size(length - 0.04, 0.022, 0.022), c, 'matte');
  });
}

/**
 * Masadaki ek ayrıntılar (masanın yerel koordinatlarında, `desk` içinden çağrılır): mekanik klavye, monitörün
 * üstünde lastik ördek, kulaklık standı, çıkartmalı dizüstü. Hepsi masa çeşidine göre; her masada değil.
 */
export function deskDetails(k: Kit, seat: Seat, monitorTop: number): void {
  const v = seat.variant;
  const side = v % 2 === 0 ? 1 : -1;
  // mekanik klavye: tuş sıraları ve renkli Esc
  for (let row = 0; row < 4; row++)
    k.box([0, 0.784, 0.075 + row * 0.032], [0.4, 0.012, 0.024], row === 3 ? '#4a4046' : '#3a3036', 'gloss');
  k.box(
    [-0.185, 0.792, 0.075],
    [0.026, 0.012, 0.024],
    ['#ff3d6e', '#ffb547', '#6fc8ff', '#5fe0a0'][v % 4]!,
    'gloss',
  );
  if (v % 3 === 1) {
    // lastik ördek monitörün üstünde, oturana bakar
    const x = -0.16 * side;
    k.add('sphere', 'gloss', [x, monitorTop + 0.04, -0.2], [0.1, 0.08, 0.12], '#ffd23a');
    k.add('sphere', 'gloss', [x, monitorTop + 0.11, -0.17], [0.07, 0.07, 0.07], '#ffd23a');
    k.box([x, monitorTop + 0.1, -0.125], [0.04, 0.015, 0.03], '#ff8a2a', 'gloss');
  }
  if (v % 4 === 1) {
    // kulaklık standı
    const x = 0.68 * side;
    k.add('cyl', 'metal', [x, 0.77, -0.26], [0.1, 0.02, 0.1], '#1b1b22');
    k.add('cyl', 'metal', [x, 0.93, -0.26], [0.02, 0.3, 0.02], C_METAL);
    k.box([x, 1.1, -0.26], [0.18, 0.025, 0.03], '#1b1b22', 'matte');
    for (const dx of [-0.09, 0.09])
      k.add('cyl', 'matte', [x + dx, 1.01, -0.26], [0.07, 0.04, 0.07], '#1b1b22', { r: [0, 0, Math.PI / 2] });
    k.box([x, 1.122, -0.26], [0.12, 0.006, 0.032], '#ff3d6e', 'glow', { glow: 1 });
  }
  if (v % 5 === 2 && (seat.role === 'developer' || seat.role === 'other')) {
    // kapalı, çıkartmalı dizüstü
    const x = -0.5 * side;
    k.box([x, 0.775, 0.17], [0.32, 0.02, 0.22], '#b8bcc4', 'metal', { r: [0, 0.15 * side, 0] });
    ['#ff3d6e', '#5fe0a0', '#ffb547', '#8f8bff'].forEach((c, i) =>
      k.box(
        [x - 0.09 + (i % 2) * 0.13, 0.787, 0.12 + Math.floor(i / 2) * 0.09],
        [0.06, 0.004, 0.05],
        c,
        'gloss',
        {
          r: [0, 0.15 * side + i * 0.3, 0],
        },
      ),
    );
  }
}

const C_METAL = '#5a4a52';

/** Sandalyenin arkasına asılı kapüşonlu (bazı masalarda). Sandalyenin yerel koordinatlarında. */
export function hoodie(k: Kit, seat: Seat): void {
  if (seat.variant % 4 !== 3) return;
  const c = ['#3a4a6a', '#6a2a3a', '#2a2a30', '#5a6a3a', '#8a6a2a'][(seat.variant >>> 4) % 5]!;
  k.at(seat.x, 0, seat.z, seat.heading, () => {
    k.box([0, 0.86, -0.26], [0.46, 0.36, 0.06], c, 'fabric');
    k.box([0, 1.06, -0.27], [0.24, 0.1, 0.1], c, 'fabric', { r: [0.3, 0, 0] });
    for (const x of [-0.18, 0.18])
      k.box([x, 0.6, -0.27], [0.09, 0.32, 0.06], c, 'fabric', { r: [0, 0, x * 0.3] });
  });
}
