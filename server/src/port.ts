/**
 * Ortam değişkeninden port okur (web/vite.config.ts ile aynı kural): 1–65535 arası tam sayı değilse varsayılan
 * kullanılır. Değer verilmiş ama geçersizse `warn` ile bildirilir.
 */
export function parsePort(
  value: string | undefined,
  fallback: number,
  warn: (message: string) => void = () => {},
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  warn(`Geçersiz port "${value}"; ${fallback} kullanılıyor.`);
  return fallback;
}
