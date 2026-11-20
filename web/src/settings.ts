import { AGENT_ROLES, type Agent, type AgentRole } from '../../shared/types.ts';
import { isActive } from './labels.ts';
import { MASCOT_KINDS, type MascotKind } from './office/sim/mascot.ts';
import { DEFAULT_BRAND, isBrandId, type BrandId } from './office/brand.ts';
import { DEFAULT_THEME, isThemeId, type ThemeId } from './office/themes.ts';

export type { ThemeId };

/** Hareket tercihi: işletim sistemini izle, her zaman azalt ya da her zaman tam. */
export type MotionPref = 'system' | 'reduce' | 'full';

/** Karakter kıyafeti için hazır renkler (adları ekran okuyucu ve ipucu için). */
export const OUTFIT_COLORS: readonly { color: string; name: string }[] = [
  { color: '#e0465a', name: 'Kırmızı' },
  { color: '#ff8a3d', name: 'Turuncu' },
  { color: '#ffc847', name: 'Sarı' },
  { color: '#3fbf7f', name: 'Yeşil' },
  { color: '#2fb3c9', name: 'Turkuaz' },
  { color: '#4a7bff', name: 'Mavi' },
  { color: '#8f6bff', name: 'Mor' },
  { color: '#e46ad0', name: 'Pembe' },
  { color: '#ece6df', name: 'Beyaz' },
  { color: '#33323c', name: 'Antrasit' },
];

/** Bir rolün özelleştirmesi: kıyafet rengi (yoksa otomatik) ve rol aksesuarı (varsayılan açık). */
export interface RoleLook {
  outfit?: string;
  accessories?: boolean;
}

export const MASCOT_LABEL: Record<MascotKind, string> = { cat: 'Kedi', dog: 'Köpek', robot: 'Robot' };

/** Tarayıcıda saklanan kullanıcı ayarları. */
export interface Settings {
  theme: ThemeId;
  /** Marka: sade (varsayılan) ya da DevTechnic yüzeyleri. */
  brand: BrandId;
  /** Dosya adları gösterilmez (ekran paylaşırken). */
  hideFiles: boolean;
  /** Oturumun otomatik başlığı (içerik özeti) gösterilsin mi. */
  showTitles: boolean;
  /** Kapalı oturumlar ve işini bitirmiş yardımcılar listede ve sahnede gösterilmez. */
  hideOffline: boolean;
  /** Kısa sesli uyarılar (biri seni beklediğinde, yardımcı işini bitirdiğinde, mesaj geldiğinde). */
  sound: boolean;
  /** 0–1 arası ses düzeyi. */
  volume: number;
  motion: MotionPref;
  /** Düşük güç modu: daha az kare, parlama ve gölge kapalı, ekranlar yavaş (pil ve ısı için). */
  lowPower: boolean;
  /** Rol başına karakter görünümü. */
  looks: Partial<Record<AgentRole, RoleLook>>;
  /** Proje başına maskot (yoksa maskot yok). */
  mascots: Record<string, MascotKind>;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  brand: DEFAULT_BRAND,
  hideFiles: false,
  showTitles: true,
  hideOffline: false,
  sound: false,
  volume: 0.6,
  motion: 'system',
  lowPower: false,
  looks: {},
  mascots: {},
};

export const SETTINGS_KEY = 'ajan-ofisi:ayarlar';
/** Sürüm 2 öncesinde yalnızca bu anahtar vardı; ilk açılışta yeni ayarlara taşınır. */
export const LEGACY_HIDE_FILES_KEY = 'ajan-ofisi:dosya-adlarini-gizle';

const MOTIONS: MotionPref[] = ['system', 'reduce', 'full'];

/**
 * Saklanan metni ayarlara çevirir. Bozuk ya da eksik alanlar varsayılana döner; bilinmeyen alanlar atılır.
 * `legacyHideFiles`: eski tek anahtarın değeri (yeni ayar hiç kaydedilmemişse kullanılır).
 */
export function parseSettings(raw: string | null, legacyHideFiles: string | null = null): Settings {
  let data: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        data = parsed as Record<string, unknown>;
    } catch {
      /* bozuk kayıt: varsayılanlar */
    }
  } else if (legacyHideFiles === '1') {
    data = { hideFiles: true };
  }
  const bool = (key: keyof Settings) =>
    typeof data[key] === 'boolean' ? (data[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);
  const volume =
    typeof data.volume === 'number' && Number.isFinite(data.volume)
      ? Math.min(1, Math.max(0, data.volume))
      : DEFAULT_SETTINGS.volume;
  const motion = MOTIONS.includes(data.motion as MotionPref) ? (data.motion as MotionPref) : 'system';
  const theme = isThemeId(data.theme) ? data.theme : DEFAULT_SETTINGS.theme;
  return {
    looks: parseLooks(data.looks),
    mascots: parseMascots(data.mascots),
    theme,
    brand: isBrandId(data.brand) ? data.brand : DEFAULT_BRAND,
    hideFiles: bool('hideFiles'),
    showTitles: bool('showTitles'),
    hideOffline: bool('hideOffline'),
    sound: bool('sound'),
    volume,
    motion,
    lowPower: bool('lowPower'),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function parseLooks(value: unknown): Settings['looks'] {
  if (!isRecord(value)) return {};
  const out: Settings['looks'] = {};
  for (const role of AGENT_ROLES) {
    const look = value[role];
    if (!isRecord(look)) continue;
    const clean: RoleLook = {};
    if (OUTFIT_COLORS.some((c) => c.color === look.outfit)) clean.outfit = look.outfit as string;
    if (typeof look.accessories === 'boolean') clean.accessories = look.accessories;
    if (Object.keys(clean).length > 0) out[role] = clean;
  }
  return out;
}

function parseMascots(value: unknown): Settings['mascots'] {
  if (!isRecord(value)) return {};
  const out: Settings['mascots'] = {};
  for (const [project, kind] of Object.entries(value).slice(0, 60)) {
    if (project.length <= 80 && MASCOT_KINDS.includes(kind as MascotKind)) out[project] = kind as MascotKind;
  }
  return out;
}

/** Hareket gerçekten azaltılsın mı: tercih "sistem" ise işletim sisteminin ayarı geçerli. */
export function effectiveReducedMotion(pref: MotionPref, systemReduced: boolean): boolean {
  return pref === 'system' ? systemReduced : pref === 'reduce';
}

/** İşini bitirmiş yardımcı ajan (ofisten ayrılmış). */
export function isFinishedHelper(agent: Agent): boolean {
  return agent.kind === 'subagent' && !isActive(agent.status);
}

/**
 * "Kapalıları gizle" açıkken gösterilecek ajanlar. Kapalı oturumlar her yerde gizlenir; işini bitirmiş
 * yardımcılar `keepFinished` verilmezse gizlenir (proje ofisinde onlar zaten kapıdan çıkarak ayrılır, çıkış
 * yürüyüşü kesilmesin diye sahneye verilmeye devam edilir).
 */
export function visibleAgents(
  agents: Agent[],
  hideOffline: boolean,
  options: { keepFinished?: boolean } = {},
): Agent[] {
  if (!hideOffline) return agents;
  return agents.filter((a) => {
    if (a.kind === 'session') return a.status !== 'offline';
    return options.keepFinished || !isFinishedHelper(a);
  });
}
