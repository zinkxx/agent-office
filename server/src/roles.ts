import type { AgentRole } from '../../shared/types.ts';

/**
 * Rol çıkarımı: bir ajanın ekipteki rolünü adından, türünden, ekip listesinden ya da davranışından tahmin eder.
 * Saf fonksiyonlar; hiçbir içerik (mesaj, komut, kod) görmez, yalnızca adlar ve sayaçlarla çalışır.
 */

/** Türkçe karakterleri sadeleştirir, küçük harfe çevirir. */
export function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

/** Kelime başlarına göre anahtar sözcükler (ör. "test" → "testci", "tester", "testing" de eşleşir). Sıra önemlidir. */
const KEYWORDS: readonly (readonly [AgentRole, readonly string[]])[] = [
  ['lead', ['lead', 'lider', 'leader', 'manager', 'yonetici', 'koordinator', 'coordinator', 'orchestrat']],
  ['tester', ['test', 'qa', 'quality', 'kalite', 'dogrula', 'verif', 'e2e']],
  ['reviewer', ['review', 'incele', 'denetle', 'audit', 'critic', 'elestir']],
  ['designer', ['design', 'tasarim', 'ui', 'ux', 'gorsel', 'visual', 'figma', 'stil', 'style']],
  ['architect', ['architect', 'mimar', 'plan', 'tasar']], // "tasar" (tasarla) designer'dan sonra bakılır
  [
    'researcher',
    ['research', 'arastir', 'explor', 'kesif', 'kesfet', 'investig', 'search', 'analy', 'analiz'],
  ],
  [
    'developer',
    [
      'develop',
      'gelistir',
      'dev',
      'engineer',
      'muhendis',
      'coder',
      'code',
      'kod',
      'implement',
      'program',
      'build',
      'fix',
    ],
  ],
];

function words(value: string): string[] {
  return normalizeName(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Bir ad ya da açıklamadaki ilk eşleşen rol. Eşleşme yoksa undefined. */
export function roleFromText(value: string | undefined, skipLead = false): AgentRole | undefined {
  if (!value) return undefined;
  const ws = words(value);
  if (ws.length === 0) return undefined;
  for (const [role, keys] of KEYWORDS) {
    if (skipLead && role === 'lead') continue;
    if (ws.some((w) => keys.some((k) => w.startsWith(k)))) return role;
  }
  return undefined;
}

/** Claude Code'un yerleşik alt ajan türleri. `strong: false` → davranış daha belirgin bir rol gösterirse ezilebilir. */
const BUILT_IN: Record<string, { role: AgentRole; strong: boolean }> = {
  explore: { role: 'researcher', strong: true },
  plan: { role: 'architect', strong: true },
  'general-purpose': { role: 'developer', strong: false },
  'statusline-setup': { role: 'other', strong: false },
  'claude-code-guide': { role: 'researcher', strong: true },
};

/** Bir ajanın yaptığı işlemlerin sayaçları (içerik yok). */
export interface ToolStats {
  /** Toplam araç kullanımı. */
  total: number;
  /** Okuma/arama (Read, Grep, Glob, WebFetch…). */
  reads: number;
  /** Dosya yazma/düzenleme. */
  writes: number;
  /** Test çalıştırma ya da test dosyası düzenleme. */
  tests: number;
}

export function emptyStats(): ToolStats {
  return { total: 0, reads: 0, writes: 0, tests: 0 };
}

/** Davranıştan rol tahmini için gereken en az işlem sayısı. */
export const MIN_TOOLS_FOR_GUESS = 3;

/** Davranıştan rol: çoğunlukla test → test uzmanı; hiç yazmadan okuyan → inceleyici. */
export function roleFromBehavior(stats: ToolStats): AgentRole | undefined {
  if (stats.total < MIN_TOOLS_FOR_GUESS) return undefined;
  if (stats.tests * 2 >= stats.total) return 'tester';
  if (stats.writes === 0 && stats.reads * 2 >= stats.total) return 'reviewer';
  return undefined;
}

export interface RoleInput {
  kind: 'session' | 'subagent';
  /** Alt ajanın türü (meta.json `agentType`). */
  agentType?: string;
  /** Projenin ekip listesi: ajan adı → rol. */
  team?: ReadonlyMap<string, AgentRole>;
  stats?: ToolStats;
  /**
   * Alt ajanın kısa iş tanımı (meta.json `description`, ör. "Tasarımcı: tema kontrolü"). Türü genel
   * (general-purpose) ya da hiç yazılmamışsa rol buradaki sözcüklerden de anlaşılır.
   */
  label?: string;
}

/**
 * Rol çıkarımı. Sıra:
 * 1. Ana oturum → takım lideri.
 * 2. Tür ekip listesinde tanımlıysa oradaki rol.
 * 3. Türün adı belirgin bir rol söylüyorsa (ör. "tasarimci", "code-reviewer", "Explore", "Plan").
 * 4. Tür genel ya da yoksa iş tanımındaki rol sözcüğü ("Tasarımcı: tema kontrolü").
 * 5. Davranış: çoğunlukla test → test uzmanı; okuyup hiç yazmayan → inceleyici.
 * 6. Zayıf yerleşik eşleme (general-purpose → geliştirici), yoksa "other".
 */
export function inferRole(input: RoleInput): AgentRole {
  if (input.kind === 'session') return 'lead';
  const type = input.agentType?.trim();
  if (type) {
    const fromTeam = input.team?.get(type) ?? input.team?.get(normalizeName(type));
    if (fromTeam && fromTeam !== 'other') return fromTeam;
    const builtIn = BUILT_IN[type.toLowerCase()];
    if (builtIn?.strong) return builtIn.role;
    if (!builtIn) {
      // Alt ajan "lider" olamaz: ekipte lider ana oturumdur.
      const named = roleFromText(type, true);
      if (named) return named;
    }
  }
  // Türü özel değilse (yok ya da yerleşik zayıf tür) iş tanımındaki rol sözcüğü davranıştan önce gelir.
  if (!type || BUILT_IN[type.toLowerCase()]?.strong === false) {
    // İlk sözcük önce: "Geliştirici: inceleme düzeltmeleri" geliştiricidir, inceleyici değil.
    const first = input.label
      ? normalizeName(input.label)
          .split(/[^a-z0-9]+/)
          .find(Boolean)
      : undefined;
    const fromLabel = roleFromText(first, true) ?? roleFromText(input.label, true);
    if (fromLabel) return fromLabel;
  }
  const behavior = input.stats ? roleFromBehavior(input.stats) : undefined;
  if (behavior) return behavior;
  if (type) {
    const builtIn = BUILT_IN[type.toLowerCase()];
    if (builtIn) return builtIn.role;
  }
  // Türü hiç yazılmamış alt ajan, Agent aracının varsayılanı olan general-purpose sayılır.
  return type ? 'other' : 'developer';
}

/** Ekip listesindeki bir üyenin rolü: önce adından, sonra açıklamasından. */
export function roleForMember(name: string, description: string | undefined): AgentRole {
  // Açıklamadaki "lead" gibi sözcükler ("incelemeyi yönetir") lider demek değildir; lider ana oturumdur.
  return roleFromText(name, true) ?? roleFromText(description, true) ?? 'other';
}
