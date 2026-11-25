import { AGENT_ROLES, type Agent, type AgentRole } from '../../shared/types.ts';
import { defaultLang, isLang, type Lang, type MessageKey } from './i18n.ts';
import { isActive } from './labels.ts';
import { MASCOT_KINDS, type MascotKind } from './office/sim/mascot.ts';
import { DEFAULT_BRAND, isBrandId, type BrandId } from './office/brand.ts';
import { DEFAULT_THEME, isThemeId, type ThemeId } from './office/themes.ts';

export type { ThemeId };

/** Hareket tercihi: işletim sistemini izle, her zaman azalt ya da her zaman tam. */
export type MotionPref = 'system' | 'reduce' | 'full';

/** Karakter kıyafeti için hazır renkler (adlarının sözlük anahtarı ekran okuyucu ve ipucu için). */
export const OUTFIT_COLORS: readonly { color: string; name: MessageKey }[] = [
  { color: '#e0465a', name: 'outfit.red' },
  { color: '#ff8a3d', name: 'outfit.orange' },
  { color: '#ffc847', name: 'outfit.yellow' },
  { color: '#3fbf7f', name: 'outfit.green' },
  { color: '#2fb3c9', name: 'outfit.teal' },
  { color: '#4a7bff', name: 'outfit.blue' },
  { color: '#8f6bff', name: 'outfit.purple' },
  { color: '#e46ad0', name: 'outfit.pink' },
  { color: '#ece6df', name: 'outfit.white' },
  { color: '#33323c', name: 'outfit.charcoal' },
];

/** Bir rolün özelleştirmesi: kıyafet rengi (yoksa otomatik) ve rol aksesuarı (varsayılan açık). */
export interface RoleLook {
  outfit?: string;
  accessories?: boolean;
}

export const MASCOT_LABEL: Record<MascotKind, MessageKey> = {
  cat: 'mascotKind.cat',
  dog: 'mascotKind.dog',
  robot: 'mascotKind.robot',
};

/** Tarayıcıda saklanan kullanıcı ayarları. */
export interface Settings {
  /** Arayüz dili. */
  language: Lang;
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
  /**
   * Kapatılan (gizlenen) projeler: proje adı → kapatıldığı an (sunucu saati, ms). Yalnızca Ajan Ofisi'nde gizler;
   * oturumlara ve dosyalara dokunulmaz. Projede bu andan sonra etkinlik olursa proje kendiliğinden geri gelir.
   */
  closedProjects: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  // Tarayıcı dili bilinmiyorsa geçerli olan; gerçek varsayılanı `parseSettings`'e verilen tarayıcı dili belirler.
  language: defaultLang(undefined),
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
  closedProjects: {},
};

export const SETTINGS_KEY = 'ajan-ofisi:ayarlar';
/** Sürüm 2 öncesinde yalnızca bu anahtar vardı; ilk açılışta yeni ayarlara taşınır. */
export const LEGACY_HIDE_FILES_KEY = 'ajan-ofisi:dosya-adlarini-gizle';

const MOTIONS: MotionPref[] = ['system', 'reduce', 'full'];

/**
 * Saklanan metni ayarlara çevirir. Bozuk ya da eksik alanlar varsayılana döner; bilinmeyen alanlar atılır.
 * `legacyHideFiles`: eski tek anahtarın değeri (yeni ayar hiç kaydedilmemişse kullanılır).
 * `fallbackLanguage`: dil kaydedilmemişse ya da geçersizse kullanılan (tarayıcı diline göre, bkz. `defaultLang`).
 */
export function parseSettings(
  raw: string | null,
  legacyHideFiles: string | null = null,
  fallbackLanguage: Lang = DEFAULT_SETTINGS.language,
): Settings {
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
    language: isLang(data.language) ? data.language : fallbackLanguage,
    looks: parseLooks(data.looks),
    mascots: parseMascots(data.mascots),
    closedProjects: parseClosedProjects(data.closedProjects),
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

/** Saklanan kapatılmış proje sayısının üst sınırı; aşılırsa en eski kapatılanlar atılır. */
export const CLOSED_PROJECTS_MAX = 200;
/** Saklanan proje adının en fazla uzunluğu. Okuma (parse) ve ekleme (withClosedProject) aynı kuralı kullanır. */
export const CLOSED_PROJECT_NAME_MAX = 255;

/** Kapatılmış proje kaydı geçerli mi: boş olmayan, en fazla `CLOSED_PROJECT_NAME_MAX` karakterlik ad ve sonlu, pozitif zaman. */
function validClosedEntry(project: string, at: unknown): at is number {
  if (project.length === 0 || project.length > CLOSED_PROJECT_NAME_MAX) return false;
  return typeof at === 'number' && Number.isFinite(at) && at > 0;
}

/**
 * Kapatılmış projeleri doğrular (bkz. validClosedEntry). En fazla `CLOSED_PROJECTS_MAX` kayıt; fazlası varsa en
 * eski kapatılanlar atılır.
 */
export function parseClosedProjects(value: unknown): Settings['closedProjects'] {
  if (!isRecord(value)) return {};
  const entries: [string, number][] = [];
  for (const [project, at] of Object.entries(value)) {
    if (!validClosedEntry(project, at)) continue;
    entries.push([project, at]);
  }
  return Object.fromEntries(limitClosed(entries));
}

/** En yeni kapatılan `CLOSED_PROJECTS_MAX` kaydı tutar. */
function limitClosed(entries: [string, number][]): [string, number][] {
  if (entries.length <= CLOSED_PROJECTS_MAX) return entries;
  return [...entries].sort((a, b) => b[1] - a[1]).slice(0, CLOSED_PROJECTS_MAX);
}

/**
 * Projeyi kapatılmış olarak ekler (zaten varsa zamanını günceller); üst sınırı korur. Geçersiz kayıt (bkz.
 * validClosedEntry) eklenmez ve aynı nesne döner: yeniden yüklemede atılacak bir kayıt hiç saklanmaz.
 */
export function withClosedProject(
  closed: Settings['closedProjects'],
  project: string,
  at: number,
): Settings['closedProjects'] {
  if (!validClosedEntry(project, at)) return closed;
  const entries = Object.entries(closed).filter(([p]) => p !== project);
  entries.push([project, at]);
  return Object.fromEntries(limitClosed(entries));
}

/** Projeleri kapatılmışlardan çıkarır (geri getirme). Değişiklik yoksa aynı nesneyi döndürür. */
export function withoutClosedProjects(
  closed: Settings['closedProjects'],
  projects: readonly string[],
): Settings['closedProjects'] {
  if (!projects.some((p) => Object.hasOwn(closed, p))) return closed;
  return Object.fromEntries(Object.entries(closed).filter(([p]) => !projects.includes(p)));
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
