import { PerspectiveCamera, Vector3 } from 'three';

/**
 * Proje ofisinin "tüm ofis" kadrajı: ekranın en-boy oranına göre kamera açısını ve hedefini seçer. Saf
 * fonksiyonlar (React'sız, testli).
 *
 * Eskiden açı sabitti; geniş ekranda oda yatay sınıra dayanıp altta ve üstte boş alan bırakıyordu. Şimdi birkaç
 * açı ve hedef denenir, kadraja alınan kutu ekranın kullanılabilir alanını en çok dolduran seçilir. Dar (dikey)
 * ekranda tüm oda yerine çalışma alanı (adalar) kadraja alınır; kenarlar kaydırarak görülür.
 */

/** Kadraja alınacak kutu (dünya koordinatları; oda (0,0) merkezli). */
export interface FrameBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Arka kenardaki yükseklik (duvar üstü). */
  h: number;
  /** Ön kenarın altında kadraja alınacak derinlik (kat bandının altın şeridi). */
  below: number;
}

export interface Framing {
  pos: Vector3;
  target: Vector3;
  /** Kutunun ekranda kapladığı oran (0–1). */
  coverage: number;
  /** Dikeyden açı (radyan). */
  polar: number;
}

/** Ekranın kullanılabilir alanı (NDC): üstte başlık çubuğuna pay. */
export const VIEWPORT = { left: -0.97, right: 0.97, bottom: -0.97, top: 0.84 } as const;

/** Bu en-boy oranının altında ekran dar (dikey) sayılır. */
export const PORTRAIT_ASPECT = 0.9;

const WALL_H = 3.2;
/** Odanın altındaki kat bandının üst kısmı (altın şerit görünsün; bkz. Room.tsx Tower). */
const SLAB_BELOW = 0.3;
/** Dar ekranda kadraja alınan genişliğin yarısı: orta bölge (adalar), iki yandaki şeritler kaydırılarak görülür. */
const PORTRAIT_HALF_W = 6.2;

export function frameBox(plan: { width: number; depth: number }, aspect: number): FrameBox {
  const hw = aspect < PORTRAIT_ASPECT ? Math.min(PORTRAIT_HALF_W, plan.width / 2) : plan.width / 2 + 0.2;
  return { x0: -hw, x1: hw, z0: -plan.depth / 2, z1: plan.depth / 2, h: WALL_H, below: SLAB_BELOW };
}

function corners(box: FrameBox): Vector3[] {
  return [
    new Vector3(box.x0, 0, box.z1),
    new Vector3(box.x1, 0, box.z1),
    new Vector3(box.x0, 0, box.z0),
    new Vector3(box.x1, 0, box.z0),
    new Vector3(box.x0, box.h, box.z0),
    new Vector3(box.x1, box.h, box.z0),
    new Vector3(box.x0, -box.below, box.z1 + 0.15),
    new Vector3(box.x1, -box.below, box.z1 + 0.15),
  ];
}

/** Kameranın verilen konumdan kutuyu gördüğü ekran sınırları (NDC). */
function projectedBounds(
  cam: PerspectiveCamera,
  pts: readonly Vector3[],
): { x0: number; x1: number; y0: number; y1: number } {
  const p = new Vector3();
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of pts) {
    p.copy(c).project(cam);
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}

function place(cam: PerspectiveCamera, target: Vector3, dir: Vector3, dist: number): void {
  cam.position.copy(target).addScaledVector(dir, dist);
  cam.lookAt(target);
  cam.updateMatrixWorld();
}

function fits(b: ReturnType<typeof projectedBounds>): boolean {
  return b.x0 >= VIEWPORT.left && b.x1 <= VIEWPORT.right && b.y0 >= VIEWPORT.bottom && b.y1 <= VIEWPORT.top;
}

/**
 * Denenecek açılar (dikeyden, radyan). OrbitControls'ün sınırları (0,3–1,2) içinde. Daha tepeden bakış odayı
 * ekranda uzatır (boş dikey alanı doldurur) ama düzleştirir; geniş ekranda 0,45'in altına inilmez. Dar ekranda
 * dikeyde bol yer olduğu için daha tepeden bakılabilir.
 */
const POLARS = [0.45, 0.5, 0.55, 0.6, 0.66];
/** Kareye yakın ekran (ör. geniş ekranda panel açıkken): oda yatay sınıra dayanır, biraz daha tepeden bakılır. */
const POLARS_SQUARE = [0.38, 0.42, 0.48, 0.54, 0.6];
const POLARS_PORTRAIT = [0.3, 0.36, 0.42, 0.48, 0.54, 0.6];
const SQUARE_ASPECT = 1.4;
/** Görünümün tercih edilen açısı: kapsama birbirine yakınsa buna yakın olan seçilir. */
const PREFERRED_POLAR = 0.6;

/**
 * Kutuyu ekrana en iyi sığdıran kamera. Her açı için hedef derinlik ekseninde kaydırılır ve kutunun sığdığı en
 * yakın uzaklık bulunur; kapsama en yüksek olan seçilir. Eşitlikte (ör. yatay sınıra dayanınca) kutu dikeyde
 * ortalanır ve tercih edilen açıya yakın olan kazanır.
 */
export function frameOffice(box: FrameBox, fovDeg: number, aspect: number): Framing {
  const cam = new PerspectiveCamera(fovDeg, Math.max(0.1, aspect), 0.1, 500);
  const pts = corners(box);
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  const area = (VIEWPORT.right - VIEWPORT.left) * (VIEWPORT.top - VIEWPORT.bottom);
  const midY = (VIEWPORT.top + VIEWPORT.bottom) / 2;
  let best: (Framing & { score: number }) | null = null;
  const polars = aspect < PORTRAIT_ASPECT ? POLARS_PORTRAIT : aspect < SQUARE_ASPECT ? POLARS_SQUARE : POLARS;
  for (const polar of polars) {
    const dir = new Vector3(0, Math.cos(polar), Math.sin(polar));
    for (let dz = -4; dz <= 4.001; dz += 0.25) {
      const target = new Vector3(cx, 0, cz + dz);
      // Uzaklık: sığdığı en yakın değer (ikiye bölerek arama; uzaklaştıkça kutu küçülür).
      let lo = 2;
      let hi = 160;
      place(cam, target, dir, hi);
      if (!fits(projectedBounds(cam, pts))) continue;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        place(cam, target, dir, mid);
        if (fits(projectedBounds(cam, pts))) hi = mid;
        else lo = mid;
      }
      place(cam, target, dir, hi);
      const b = projectedBounds(cam, pts);
      const coverage = ((b.x1 - b.x0) * (b.y1 - b.y0)) / area;
      const offCenter = Math.abs((b.y0 + b.y1) / 2 - midY);
      const score = coverage - 0.12 * Math.abs(polar - PREFERRED_POLAR) - 0.1 * offCenter;
      if (!best || score > best.score) {
        best = { pos: cam.position.clone(), target: target.clone(), coverage, polar, score };
      }
    }
  }
  if (!best) {
    // Hiçbir açıda sığmadı (çok küçük pencere): eski sabit açıyla uzaktan bak.
    const dir = new Vector3(0, Math.cos(PREFERRED_POLAR), Math.sin(PREFERRED_POLAR));
    const target = new Vector3(cx, 0, cz);
    return { pos: target.clone().addScaledVector(dir, 80), target, coverage: 0, polar: PREFERRED_POLAR };
  }
  const { pos, target, coverage, polar } = best;
  return { pos, target, coverage, polar };
}

/** Ekranda kutunun sınırları (testler ve hata ayıklama için). */
export function boundsFor(box: FrameBox, framing: Framing, fovDeg: number, aspect: number) {
  const cam = new PerspectiveCamera(fovDeg, Math.max(0.1, aspect), 0.1, 500);
  cam.position.copy(framing.pos);
  cam.lookAt(framing.target);
  cam.updateMatrixWorld();
  return projectedBounds(cam, corners(box));
}
