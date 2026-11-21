/**
 * Yolun son parçası (dosya ya da klasör adı). Hem `/` hem `\` ayırıcıyı her platformda tanır: Windows kayıtları
 * Linux/WSL'de okunsa da tam yol asla sızmaz. Node'a özgü modül kullanmaz (tarayıcıdaki statik demoda da çalışır).
 */
export function lastPathSegment(value: string): string | undefined {
  const parts = value.trim().split(/[\\/]+/);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]?.trim();
    if (part && part !== '.' && part !== '..' && !/^[A-Za-z]:$/.test(part)) return part;
  }
  return undefined;
}
