/**
 * Kare hızı ve güç kararları (saf, testli). Çizim tarafı (Office.tsx, Screens.tsx) yalnızca bunları uygular.
 */

/**
 * İki kare arasındaki en kısa süre (ms). 0: her ekran yenilemesinde çiz.
 * Normal: odakta sınırsız, odak dışında ~12 kare/sn. Düşük güç: odakta 30, odak dışında 8 kare/sn.
 */
export function frameInterval(focused: boolean, lowPower: boolean): number {
  if (lowPower) return 1000 / (focused ? 30 : 8);
  return focused ? 0 : 1000 / 12;
}

/**
 * Ekran yenilemesi tam aralığa denk gelmeyebilir (60 Hz'de kareler ~16,7 ms arayla gelir); bu pay olmadan
 * 33,3 ms'lik hedef bazen bir kare kaçırıp 20 kare/sn'ye düşerdi.
 */
const SLACK_MS = 4;

/** Kare sınırının bir adımı: bu karede çizilsin mi ve sonraki çizimin planlanan zamanı (ms). */
export interface FrameStep {
  draw: boolean;
  next: number;
}

/**
 * Kare sınırı (saf). `next`, bir önceki adımın döndürdüğü planlanan zamandır (ilk adımda 0).
 * Plan son çizimin zamanından değil, bir önceki plandan ilerler; böylece aralık ekran yenilemesine tam
 * bölünmese de ortalama hedefe oturur (ör. 75 Hz'de 30 kare/sn: sırayla 3 ve 2 karede bir çizer; yalnızca
 * son çizimden saymak her 3. kareye, yani 25 kare/sn'ye düşürürdü). Bir aralıktan fazla geride kalınırsa
 * (sekme dönüşü, takılma) plan sıfırlanır; biriken kareler art arda çizilmez.
 */
export function frameStep(now: number, next: number, interval: number): FrameStep {
  if (interval <= 0) return { draw: true, next: now };
  if (now < next - SLACK_MS) return { draw: false, next };
  let planned = next + interval;
  if (planned <= now) planned = now + interval;
  return { draw: true, next: planned };
}

/**
 * frameloop="never" ile r3f'nin saati advance'a verilen zamanı (saniye) olduğu gibi kullanır:
 * `elapsedTime = zaman`, `delta = zaman - önceki`. Ekran yenileme zamanı (ms) bu başlangıca göre saniyeye
 * çevrilir; atlanan karelerin süresi bir sonraki çizimin delta'sına kendiliğinden eklenir.
 */
export function clockSeconds(now: number, origin: number): number {
  return (now - origin) / 1000;
}

/**
 * Saatin başlangıcı (ms): sürücü yeniden kurulduğunda (ör. canlı yeniden yükleme) saat kaldığı yerden
 * devam etsin, geri sarıp eksi delta üretmesin diye mevcut `elapsedTime`'dan geriye hesaplanır.
 */
export function clockOrigin(now: number, elapsedSeconds: number): number {
  return now - elapsedSeconds * 1000;
}

/** Monitör ekranlarının saniyedeki yeniden çizim sayısı: normal 8, düşük güç 2, hareket azaltılmışsa 1. */
export function screenFps(reduced: boolean, lowPower: boolean): number {
  if (reduced) return 1;
  return lowPower ? 2 : 8;
}

/** Proje ofisinde en fazla kaç sarkıt lamba gerçek ışık yayar. */
export function maxPointLights(lowPower: boolean): number {
  return lowPower ? 4 : 8;
}

/** Işık seçimi için lambanın gereken kısmı (bkz. OfficePlan.lamps). */
export interface LampLike {
  kind: 'island' | 'zone';
  zone?: string;
}

/**
 * Gerçek ışık yayacak sarkıt lambalar. Normal: önce en fazla 4 ada lambası, sonra bölge lambaları (toplam 8).
 * Düşük güç (4 ışık): en az bir bölge lambası olur (öncelik lider köşesi), kalanlar ada lambası; yoksa
 * köşeler tamamen kararıyordu.
 */
export function pickPointLights<T extends LampLike>(lamps: readonly T[], lowPower: boolean): T[] {
  const max = maxPointLights(lowPower);
  const islands = lamps.filter((l) => l.kind === 'island');
  const zones = lamps.filter((l) => l.kind === 'zone');
  if (!lowPower) return [...islands.slice(0, 4), ...zones].slice(0, max);
  const zone = zones.find((l) => l.zone === 'lead') ?? zones[0];
  if (!zone) return islands.slice(0, max);
  return [...islands.slice(0, max - 1), zone, ...zones.filter((l) => l !== zone)].slice(0, max);
}

/** Ortam ve gök ışığının çarpanı: düşük güçte daha az nokta ışık var, oda ~%12 daha aydınlık tutulur. */
export function ambientBoost(lowPower: boolean): number {
  return lowPower ? 1.12 : 1;
}
