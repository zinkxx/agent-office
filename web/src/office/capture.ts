/**
 * "Görüntü kaydet": 3B sahnenin o anki görünümünü PNG olarak indirmek için saf yardımcılar.
 * Görüntü tarayıcıda oluşur ve yalnızca indirilir; hiçbir yere gönderilmez. Etiketler HTML katmanında
 * olduğu için (bkz. Label.tsx) yalnızca WebGL tuvali yakalanır: ad, dosya adı ya da yol görüntüye girmez.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** İndirilecek dosyanın adı, yerel saate göre: `ajan-ofisi-2026-11-21-1030.png`. */
export function snapshotFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `ajan-ofisi-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.png`;
}

/** `data:image/png;base64,...` adresini ham baytlara çevirir; biçim tanınmazsa `null`. */
export function dataUrlToBytes(dataUrl: string): { type: string; bytes: Uint8Array<ArrayBuffer> } | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!m || !m[1] || m[2] === undefined || m[2].length === 0) return null;
  let raw: string;
  try {
    raw = atob(m[2]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return { type: m[1], bytes };
}

/** Sahneyi çizip PNG veri adresi döndüren fonksiyon; Canvas içindeki köprü bileşeni kaydeder. */
export type CaptureFn = () => string | null;

let current: CaptureFn | null = null;

/** Köprü bileşeni bağlanınca fonksiyonu kaydeder; dönen fonksiyon kaydı (hâlâ aynıysa) siler. */
export function registerCapture(fn: CaptureFn): () => void {
  current = fn;
  return () => {
    if (current === fn) current = null;
  };
}

/** Sahne hazırsa o anki görünümün PNG veri adresi; sahne yoksa ya da yakalama başarısızsa `null`. */
export function captureView(): string | null {
  if (!current) return null;
  try {
    return current();
  } catch {
    return null;
  }
}
