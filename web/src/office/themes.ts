/**
 * Tema sistemi: arayüz renkleri (CSS değişkenleri) ve 3B sahnenin renkleri tek yerde. Saf veri; sahne bileşenleri
 * ve dokular yalnızca buradan okur. Yeni tema eklemek = bu listeye bir nesne eklemek.
 */

export type ThemeId = 'gece' | 'gunisigi' | 'kuzey';

/** Arayüzün CSS değişkenleri (styles.css'teki :root ile aynı adlar). */
export interface UiColors {
  bg: string;
  panel: string;
  panelSolid: string;
  line: string;
  lineStrong: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
}

export interface OfficeTheme {
  id: ThemeId;
  name: string;
  /** Ayarlar penceresindeki kısa açıklama. */
  description: string;
  /** Ayarlar penceresindeki küçük renk örneği. */
  swatch: [string, string, string];
  ui: UiColors;
  /** Gökyüzü dikey geçişi (yukarıdan aşağı) ve sis. */
  sky: [string, string, string, string];
  fog: { color: string; near: number; far: number };
  /** Gece mi (şehir ışıkları ve sokak lambaları yanar). */
  night: boolean;
  room: {
    wall: string;
    wallDark: string;
    base: string;
    frame: string;
    /** Tavan kenarındaki ışık şeridi. */
    neon: string;
    neonGlow: number;
    glass: string;
    door: string;
  };
  /** Parke: renk tonu (hsl), doygunluk ve ortalama açıklık (%); malzeme rengi parkeyi hafifçe boyar. */
  floor: { hue: number; hueSpread: number; sat: number; light: number; tint: string };
  carpet: { base: string; fleck: [number, number, number] };
  rugs: Record<'lounge' | 'lead' | 'meeting', [string, string, string]>;
  sofa: { body: string; seat: string; back: string; pillows: [string, string] };
  /**
   * Dış mekân (kulenin dibindeki şehir): uzak zemin, asfalt, kaldırım, çim, su, yol çizgisi, çatılar ve çatı
   * kenarı, ağaç yaprakları ve gövdesi.
   */
  outside: {
    ground: string;
    road: string;
    sidewalk: string;
    grass: string;
    water: string;
    marking: string;
    roofs: [string, string, string];
    parapet: string;
    leaves: [string, string, string];
    trunk: string;
  };
  /** Ofisin bulunduğu kulenin alt katları (odanın altında görünen cephe). */
  tower: { facade: string; glass: string };
  city: {
    facade: string;
    unlit: string;
    windows: string[];
    /** Yanan pencere oranı. */
    lit: number;
    glow: number;
    streetLamp: string;
  };
  lights: {
    ambient: { color: string; intensity: number };
    hemi: { sky: string; ground: string; intensity: number };
    sun: { color: string; intensity: number; position: [number, number, number] };
    /** Pencerelerden gelen dolgu ışığı. */
    fill: { color: string; intensity: number };
    island: { color: string; intensity: number };
    zone: [string, string];
    zoneIntensity: number;
  };
  bloom: { intensity: number; threshold: number };
  /** "Tüm projeler" görünümü (küçük odalar). */
  overview: {
    background: string;
    fog: string;
    floor: string;
    gridCell: string;
    gridSection: string;
    island: string;
    islandEdge: string;
    glass: string;
    roomLight: string;
    ambient: string;
    hemiSky: string;
    hemiGround: string;
    fillLight: string;
  };
}

/** Dış mekân: üç temada da aynı nötr şehir paleti; yalnızca gece/gündüz farkı (pencere ışıkları) temadan gelir. */
const CITY_OUTSIDE: OfficeTheme['outside'] = {
  ground: '#46503f',
  road: '#3d4046',
  sidewalk: '#9a958d',
  grass: '#5f8a4a',
  water: '#3f7fb0',
  marking: '#e8e8e2',
  roofs: ['#6b7078', '#8c8880', '#575d66'],
  parapet: '#b9b5ab',
  leaves: ['#4a7d3a', '#5a9145', '#3d6b32'],
  trunk: '#5a4030',
};
const CITY_TOWER: OfficeTheme['tower'] = { facade: '#7f8a96', glass: '#5f7490' };
const CITY_BASE = {
  facade: '#7f8a96',
  unlit: '#5a6878',
  windows: ['#ffd98a', '#ffe9b8', '#fff1d6', '#ffc873'],
  streetLamp: '#ffd28a',
};
/** Gece ve Kuzey aynı gece gökyüzünü ve sisi kullanır (dışarısı ikisinde aynı görünür). */
const NIGHT_SKY: OfficeTheme['sky'] = ['#04070f', '#0a1428', '#16284a', '#2a3f66'];
const NIGHT_FOG: OfficeTheme['fog'] = { color: '#0c1830', near: 30, far: 90 };

const GECE: OfficeTheme = {
  id: 'gece',
  name: 'Gece',
  description: 'Koyu lacivert gece, sıcak amber ışıklar ve ay ışığı; ışıklı gece şehri.',
  swatch: ['#0f1726', '#ffb547', '#6f86b0'],
  ui: {
    bg: '#070b14',
    panel: 'rgba(14, 22, 38, 0.66)',
    panelSolid: '#0f1726',
    line: 'rgba(150, 180, 230, 0.14)',
    lineStrong: 'rgba(150, 180, 230, 0.3)',
    text: '#eaf0fa',
    muted: '#9eacc4',
    faint: '#66748c',
    accent: '#ffb547',
    accentSoft: '#ffd591',
  },
  sky: NIGHT_SKY,
  fog: NIGHT_FOG,
  night: true,
  room: {
    wall: '#1c2a42',
    wallDark: '#111a2c',
    base: '#0a1020',
    frame: '#121722',
    neon: '#ffe2b0',
    neonGlow: 1.2,
    glass: '#cfe0ff',
    door: '#ffd591',
  },
  floor: { hue: 28, hueSpread: 10, sat: 22, light: 21, tint: '#e0d0bc' },
  carpet: { base: '#1c2740', fleck: [60, 80, 120] },
  rugs: {
    lounge: ['#25324e', '#ffb547', '#4a5f86'],
    lead: ['#1e2638', '#3c4a66', '#ffb547'],
    meeting: ['#1a2234', '#33415c', '#9eb4d8'],
  },
  sofa: { body: '#2a3550', seat: '#3a4868', back: '#324058', pillows: ['#ffb547', '#6f86b0'] },
  outside: CITY_OUTSIDE,
  tower: CITY_TOWER,
  city: { ...CITY_BASE, lit: 0.35, glow: 1.4 },
  lights: {
    ambient: { color: '#b8cbff', intensity: 0.5 },
    hemi: { sky: '#9fb8ee', ground: '#0a1020', intensity: 0.7 },
    sun: { color: '#cfe0ff', intensity: 1.2, position: [-10, 22, 14] },
    fill: { color: '#8fb0ff', intensity: 0.3 },
    island: { color: '#ffd08a', intensity: 14 },
    zone: ['#ffc87a', '#ffdca0'],
    zoneIntensity: 9,
  },
  bloom: { intensity: 0.6, threshold: 1.05 },
  overview: {
    background: '#070b14',
    fog: '#0a1020',
    floor: '#0e1626',
    gridCell: '#172238',
    gridSection: '#2a3c5e',
    island: '#162036',
    islandEdge: '#ffb547',
    glass: '#9fb8ee',
    roomLight: '#ffd08a',
    ambient: '#cbdcff',
    hemiSky: '#9fb8ee',
    hemiGround: '#070b14',
    fillLight: '#8fb0ff',
  },
};

const GUNISIGI: OfficeTheme = {
  id: 'gunisigi',
  name: 'Gün ışığı',
  description: 'Açık renk duvarlar, açık meşe parke, güneş ve mavi gök. Neon ışıklar sönük.',
  swatch: ['#e8e0d6', '#3d8bff', '#ffb547'],
  ui: {
    bg: '#121820',
    panel: 'rgba(22, 30, 42, 0.86)',
    panelSolid: '#18212d',
    line: 'rgba(150, 190, 235, 0.2)',
    lineStrong: 'rgba(150, 190, 235, 0.38)',
    text: '#f0f5fb',
    muted: '#a9bacd',
    faint: '#71849a',
    accent: '#3d8bff',
    accentSoft: '#9cc6ff',
  },
  sky: ['#5f9be0', '#8dbdf0', '#c4def5', '#eef3f2'],
  fog: { color: '#c9dcee', near: 45, far: 140 },
  night: false,
  room: {
    wall: '#e4dbd1',
    wallDark: '#c7bbae',
    base: '#8f8176',
    frame: '#3c3f46',
    neon: '#fff1d6',
    neonGlow: 0.6,
    glass: '#d8ecff',
    door: '#cfe6ff',
  },
  floor: { hue: 32, hueSpread: 8, sat: 26, light: 52, tint: '#f2ece6' },
  carpet: { base: '#59636f', fleck: [150, 165, 180] },
  rugs: {
    lounge: ['#d9c7b0', '#3d8bff', '#f08a5d'],
    lead: ['#b89a7a', '#7a5a3a', '#f2d4a4'],
    meeting: ['#c8ccd4', '#8a94a4', '#ffffff'],
  },
  sofa: { body: '#5a6a7a', seat: '#6f8193', back: '#62748a', pillows: ['#ffb547', '#f08a5d'] },
  outside: CITY_OUTSIDE,
  tower: CITY_TOWER,
  city: { ...CITY_BASE, lit: 0.2, glow: 0.1 },
  lights: {
    ambient: { color: '#ffffff', intensity: 0.55 },
    hemi: { sky: '#cfe6ff', ground: '#8a7a6a', intensity: 0.7 },
    sun: { color: '#fff4e0', intensity: 1.8, position: [-14, 26, 6] },
    fill: { color: '#bcd8ff', intensity: 0.8 },
    island: { color: '#fff1dc', intensity: 4 },
    zone: ['#fff1dc', '#ffe6c4'],
    zoneIntensity: 3,
  },
  bloom: { intensity: 0.35, threshold: 1.25 },
  overview: {
    background: '#cfe0ef',
    fog: '#d6e4f0',
    floor: '#e9e4dc',
    gridCell: '#d6cfc4',
    gridSection: '#b9ae9f',
    island: '#f4efe8',
    islandEdge: '#3d8bff',
    glass: '#a8d0ff',
    roomLight: '#fff4e0',
    ambient: '#ffffff',
    hemiSky: '#cfe6ff',
    hemiGround: '#a89a8a',
    fillLight: '#bcd8ff',
  },
};

const KUZEY: OfficeTheme = {
  id: 'kuzey',
  name: 'Kuzey',
  description: 'Soğuk lacivert gece; ofiste camgöbeği ve mor neon.',
  swatch: ['#0b1624', '#3de0ff', '#a98bff'],
  ui: {
    bg: '#060b12',
    panel: 'rgba(10, 24, 38, 0.66)',
    panelSolid: '#0c1a2a',
    line: 'rgba(110, 210, 255, 0.16)',
    lineStrong: 'rgba(110, 210, 255, 0.34)',
    text: '#e8f6fd',
    muted: '#93b3c6',
    faint: '#5d7a8c',
    accent: '#3de0ff',
    accentSoft: '#9fe9ff',
  },
  sky: NIGHT_SKY,
  fog: NIGHT_FOG,
  night: true,
  room: {
    wall: '#172638',
    wallDark: '#0c1522',
    base: '#070d16',
    frame: '#0f1820',
    neon: '#3de0ff',
    neonGlow: 1.5,
    glass: '#bfefff',
    door: '#9fe9ff',
  },
  floor: { hue: 210, hueSpread: 12, sat: 16, light: 18, tint: '#d8e8f4' },
  carpet: { base: '#10243a', fleck: [40, 110, 160] },
  rugs: {
    lounge: ['#14243a', '#3de0ff', '#a98bff'],
    lead: ['#1a2230', '#3a5a7a', '#9fe9ff'],
    meeting: ['#121e2e', '#2a4060', '#9fe9ff'],
  },
  sofa: { body: '#1c2a44', seat: '#26385a', back: '#22324e', pillows: ['#a98bff', '#3de0ff'] },
  outside: CITY_OUTSIDE,
  tower: CITY_TOWER,
  city: { ...CITY_BASE, lit: 0.35, glow: 1.4 },
  lights: {
    ambient: { color: '#d6ecff', intensity: 0.55 },
    hemi: { sky: '#9fd8ff', ground: '#0a1828', intensity: 0.75 },
    sun: { color: '#e0f0ff', intensity: 1.2, position: [-10, 22, 14] },
    fill: { color: '#3de0ff', intensity: 0.35 },
    island: { color: '#d8ecff', intensity: 13 },
    zone: ['#9fe9ff', '#b9a6ff'],
    zoneIntensity: 8,
  },
  bloom: { intensity: 0.85, threshold: 1 },
  overview: {
    background: '#060b12',
    fog: '#07101c',
    floor: '#0a1420',
    gridCell: '#10223a',
    gridSection: '#1e4a6a',
    island: '#0e1c2c',
    islandEdge: '#3de0ff',
    glass: '#7ad4ff',
    roomLight: '#9fd8ff',
    ambient: '#d6ecff',
    hemiSky: '#9fd8ff',
    hemiGround: '#050c16',
    fillLight: '#3de0ff',
  },
};

export const THEMES: readonly OfficeTheme[] = [GECE, GUNISIGI, KUZEY];

export const DEFAULT_THEME: ThemeId = 'gece';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function themeById(id: ThemeId): OfficeTheme {
  return THEMES.find((t) => t.id === id) ?? GECE;
}

/** CSS değişken adları (styles.css :root ile aynı). */
const UI_VARS: Record<keyof UiColors, string> = {
  bg: '--bg',
  panel: '--panel',
  panelSolid: '--panel-solid',
  line: '--line',
  lineStrong: '--line-strong',
  text: '--text',
  muted: '--muted',
  faint: '--faint',
  accent: '--accent',
  accentSoft: '--accent-soft',
};

/** Temanın arayüz renklerini CSS değişkenleri olarak döner (ör. `--accent: #ff3d6e`). */
export function cssVariables(theme: OfficeTheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(UI_VARS) as (keyof UiColors)[]) out[UI_VARS[key]] = theme.ui[key];
  return out;
}
