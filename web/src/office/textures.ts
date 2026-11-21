import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { brandTexts, type BrandId } from './brand.ts';
import { translate, type Lang } from '../i18n.ts';
import type { OfficeTheme } from './themes.ts';

/**
 * Kodla (kanvasla) üretilen dokular. İnternetten hiçbir görsel indirilmez.
 * Her doku bir kez üretilir ve paylaşılır.
 */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  else t.wrapS = t.wrapT = ClampToEdgeWrapping;
  return t;
}

const cache = new Map<string, Texture>();
function once<T extends Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Parke (tekrarlanır; 1 tekrar ≈ 2 m). Renk tonu ve açıklık temadan gelir. */
export function woodFloorTexture(f: OfficeTheme['floor']): Texture {
  return once(`wood${f.hue}/${f.hueSpread}/${f.sat}/${f.light}`, () => {
    const [c, g] = canvas(512, 512);
    const r = rng(11);
    const plankH = 512 / 8;
    for (let row = 0; row < 8; row++) {
      let x = -r() * 200;
      while (x < 512) {
        const len = 180 + r() * 220;
        const base = 38 + r() * 16;
        g.fillStyle = `hsl(${f.hue + r() * f.hueSpread}, ${f.sat + r() * 12}%, ${(f.light * base) / 46}%)`;
        g.fillRect(x, row * plankH, len, plankH);
        // damarlar
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
          g.lineWidth = 1 + r() * 1.5;
          g.beginPath();
          const y = row * plankH + 4 + r() * (plankH - 8);
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + r() * 6 - 3, x + len * 0.6, y + r() * 6 - 3, x + len, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(x, row * plankH, 2, plankH);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(0, row * plankH, 512, 2);
    }
    return texture(c, true);
  });
}

/** Halı karo (tekrarlanır; 1 tekrar ≈ 1 m). Zemin rengi ve benekler temadan gelir. */
export function carpetTexture(carpet: OfficeTheme['carpet']): Texture {
  const [fr, fg, fb] = carpet.fleck;
  return once(`carpet${carpet.base}${carpet.fleck.join(',')}`, () => {
    const [c, g] = canvas(256, 256);
    const r = rng(5);
    g.fillStyle = carpet.base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${fr + r() * 60},${fg + r() * 30},${fb + r() * 30},${0.08 + r() * 0.1})`;
      g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
    }
    // karo kenarları
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 254);
    return texture(c, true);
  });
}

/** Desenli kilim (kanepe ve lider köşesi). */
export function rugTexture(seed: number, a: string, b: string, edge: string): Texture {
  return once(`rug${seed}${a}${b}`, () => {
    const [c, g] = canvas(512, 384);
    const r = rng(seed);
    g.fillStyle = a;
    g.fillRect(0, 0, 512, 384);
    g.strokeStyle = edge;
    g.lineWidth = 14;
    g.strokeRect(18, 18, 476, 348);
    g.lineWidth = 4;
    g.strokeRect(42, 42, 428, 300);
    g.fillStyle = b;
    for (let i = 0; i < 6; i++) {
      const x = 90 + i * 66;
      g.beginPath();
      g.moveTo(x, 192 - 60);
      g.lineTo(x + 26, 192);
      g.lineTo(x, 192 + 60);
      g.lineTo(x - 26, 192);
      g.closePath();
      g.fill();
    }
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.04})`;
      g.fillRect(r() * 512, r() * 384, 2, 2);
    }
    return texture(c);
  });
}

/** Gökyüzü (sahne arka planı): temanın dört renkli dikey geçişi. */
export function skyTexture(stops: OfficeTheme['sky']): Texture {
  return once(`sky${stops.join('')}`, () => {
    const [c, g] = canvas(64, 512);
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(0.45, stops[1]);
    grad.addColorStop(0.78, stops[2]);
    grad.addColorStop(1, stops[3]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 512);
    const t = texture(c);
    t.magFilter = LinearFilter;
    return t;
  });
}

/**
 * Bina cephesi: koyu duvar üzerinde yanan/sönük pencere ızgarası. `cols × rows` pencere.
 * Işıklı pencereler parlama (bloom) için ayrı bir "emissive" doku olarak da döner.
 */
export function buildingTextures(
  seed: number,
  cols: number,
  rows: number,
  city: OfficeTheme['city'],
): { map: Texture; glow: Texture } {
  const key = `bld${seed}:${cols}x${rows}:${city.facade}${city.windows.join('')}${city.lit}`;
  const map = once(`${key}m`, () => paintBuilding(seed, cols, rows, false, city));
  const glow = once(`${key}g`, () => paintBuilding(seed, cols, rows, true, city));
  return { map, glow };
}

function paintBuilding(
  seed: number,
  cols: number,
  rows: number,
  glowOnly: boolean,
  city: OfficeTheme['city'],
): Texture {
  const cw = 16;
  const ch = 20;
  const [c, g] = canvas(cols * cw, rows * ch);
  const r = rng(seed);
  g.fillStyle = glowOnly ? '#000' : city.facade;
  g.fillRect(0, 0, c.width, c.height);
  const palette = city.windows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = r() < city.lit;
      if (glowOnly && !lit) continue;
      g.fillStyle = lit ? palette[Math.floor(r() * palette.length)]! : city.unlit;
      g.fillRect(x * cw + 4, y * ch + 5, cw - 8, ch - 9);
    }
  }
  return texture(c);
}

/** Beyaz tahta: anlamsız karalamalar, kutular, oklar ve yapışkan notlar (gerçek içerik yok). */
export function whiteboardTexture(): Texture {
  return once('whiteboard', () => {
    const [c, g] = canvas(512, 320);
    const r = rng(23);
    g.fillStyle = '#f4eef0';
    g.fillRect(0, 0, 512, 320);
    g.lineCap = 'round';
    const pens = ['#2b4bd8', '#d8304b', '#1e8a5a', '#222'];
    // kutular ve oklar (akış şeması gibi)
    const boxes: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      const x = 30 + i * 70 + r() * 20;
      const y = 40 + (i % 2) * 90 + r() * 20;
      g.strokeStyle = pens[i % pens.length]!;
      g.lineWidth = 3;
      g.strokeRect(x, y, 56, 34);
      boxes.push([x + 28, y + 17]);
      // kutunun içinde karalama satırı
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + 8, y + 17);
      for (let k = 0; k < 6; k++) g.lineTo(x + 10 + k * 7, y + 13 + r() * 8);
      g.stroke();
    }
    g.strokeStyle = '#333';
    g.lineWidth = 2;
    for (let i = 0; i < boxes.length - 1; i++) {
      const [x1, y1] = boxes[i]!;
      const [x2, y2] = boxes[i + 1]!;
      g.beginPath();
      g.moveTo(x1 + 28, y1);
      g.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 30, x2 - 28, y2);
      g.stroke();
    }
    // dalgalı karalamalar
    for (let l = 0; l < 6; l++) {
      g.strokeStyle = pens[l % pens.length]!;
      g.lineWidth = 2;
      g.beginPath();
      const y = 210 + l * 16;
      g.moveTo(30, y);
      for (let x = 30; x < 30 + 120 + r() * 160; x += 8) g.lineTo(x, y + Math.sin(x * 0.3 + l) * 3);
      g.stroke();
    }
    // yapışkan notlar
    const notes = ['#ffe36b', '#ff9db3', '#8fe3b0', '#8fc8ff', '#ffc27a'];
    for (let i = 0; i < 9; i++) {
      const x = 360 + (i % 3) * 46 + r() * 6;
      const y = 26 + Math.floor(i / 3) * 52 + r() * 6;
      g.save();
      g.translate(x + 20, y + 20);
      g.rotate((r() - 0.5) * 0.2);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(-18, -16, 40, 40);
      g.fillStyle = notes[i % notes.length]!;
      g.fillRect(-20, -20, 40, 40);
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(-14, -10 + k * 9);
        g.lineTo(-14 + 10 + r() * 16, -10 + k * 9);
        g.stroke();
      }
      g.restore();
    }
    return texture(c);
  });
}

/* ------------------------------------------------------------------------------------------------------------
 * DevTechnic marka dokuları (Sürüm 3). Logo ve simge `web/public/brand/` altındaki yerel SVG dosyalarından
 * kanvasa çizilir (Vite'ın yerel sunucusundan okunur, internete gidilmez). Yazılar sistem yazı tipiyle çizilir.
 * ---------------------------------------------------------------------------------------------------------- */

/** Marka renkleri (bkz. docs/gorsel-arastirma.md). Her temada aynı. */
export const BRAND = { gold: '#eab308', navy: '#0f172a', teal: '#64ffda', navySoft: '#1e293b' } as const;

/** Yerel bir SVG'yi kanvasa çizen doku: önce boş (saydam) döner, görsel yüklenince güncellenir. */
function svgTexture(
  key: string,
  url: string,
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D, img: HTMLImageElement | null) => void,
): Texture {
  return once(key, () => {
    const [c, g] = canvas(w, h);
    paint(g, null);
    const t = texture(c);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      g.clearRect(0, 0, w, h);
      paint(g, img);
      t.needsUpdate = true;
    };
    img.src = url;
    return t;
  });
}

/** Harf aralıklı tek satır yazı (kanvasın letterSpacing'i her tarayıcıda yok: harf harf çizilir). */
function spacedText(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  spacing: number,
): void {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    g.fillText(ch, x, cy);
    x += widths[i]! + spacing;
  });
}

const BRAND_FONT = `"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif`;

/** Sade marka simgesi: yuvarlak köşeli kare içinde üç yatay çizgi (camgöbeği). */
function paintSimpleIcon(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const r = size * 0.22;
  g.save();
  g.fillStyle = BRAND.navy;
  g.strokeStyle = BRAND.teal;
  g.lineWidth = size * 0.04;
  g.beginPath();
  g.roundRect(x + g.lineWidth, y + g.lineWidth, size - 2 * g.lineWidth, size - 2 * g.lineWidth, r);
  g.fill();
  g.stroke();
  g.lineWidth = size * 0.07;
  g.lineCap = 'round';
  for (const f of [0.34, 0.5, 0.66]) {
    g.beginPath();
    g.moveTo(x + size * 0.27, y + size * f);
    g.lineTo(x + size * 0.73, y + size * f);
    g.stroke();
  }
  g.restore();
}

/** Marka dokusu: DevTechnic'te yerel SVG'den, sade markada kanvasla çizilir (dosya yüklenmez). */
function brandTexture(
  brand: BrandId,
  key: string,
  w: number,
  h: number,
  svgUrl: string | null,
  paint: (g: CanvasRenderingContext2D, img: HTMLImageElement | null) => void,
): Texture {
  if (brand === 'devtechnic' && svgUrl) return svgTexture(`${key}-dt`, svgUrl, w, h, paint);
  return once(`${key}-sade`, () => {
    const [c, g] = canvas(w, h);
    paint(g, null);
    return texture(c);
  });
}

const ICON_URL = '/brand/devtechnic-icon.svg';

/**
 * Marka duvarındaki logo: saydam zeminde altın logo (sade markada yalnızca simge; marka yazısı altındaki ayrı
 * şeritte, bkz. `brandWordTexture`). 2:1.
 */
export function brandLogoTexture(brand: BrandId = 'sade'): Texture {
  return brandTexture(brand, 'brand-logo', 1024, 512, '/brand/devtechnic-logo.svg', (g, img) => {
    if (brand === 'devtechnic') {
      if (img) g.drawImage(img, 0, 0, 1024, 512);
      return;
    }
    // yatayda ortalı; üst boşluk, simge ile alttaki yazı şeridi arasındaki boşlukla yaklaşık eşit
    const size = 360;
    paintSimpleIcon(g, (1024 - size) / 2, 60, size);
  });
}

/** Marka yazısı (harf aralıklı, büyük harf). 8:1, saydam zemin. */
export function brandWordTexture(color: string, brand: BrandId = 'sade', lang: Lang = 'tr'): Texture {
  const text = brandTexts(brand, lang).word;
  return once(`brand-word-${color}-${text}`, () => {
    const [c, g] = canvas(1024, 128);
    g.fillStyle = color;
    g.font = `600 78px ${BRAND_FONT}`;
    spacedText(g, text, 512, 68, 26);
    return texture(c);
  });
}

/** Neon/totem simgesi, saydam zemin. Kare. */
export function brandIconTexture(brand: BrandId = 'sade'): Texture {
  return brandTexture(brand, 'brand-icon', 256, 256, ICON_URL, (g, img) => {
    if (brand === 'devtechnic') {
      if (img) g.drawImage(img, 0, 0, 256, 256);
      return;
    }
    paintSimpleIcon(g, 16, 16, 224);
  });
}

function paintEmblem(
  g: CanvasRenderingContext2D,
  brand: BrandId,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
): void {
  if (brand === 'devtechnic') {
    if (img) g.drawImage(img, x, y, size, size);
  } else paintSimpleIcon(g, x, y, size);
}

/** Lider köşesindeki plaket: lacivert zemin, çerçeve, simge ve yazı. 3:2. */
export function brandPlaqueTexture(brand: BrandId = 'sade', lang: Lang = 'tr'): Texture {
  const accent = brand === 'devtechnic' ? BRAND.gold : BRAND.teal;
  return brandTexture(brand, `brand-plaque-${lang}`, 480, 320, ICON_URL, (g, img) => {
    g.fillStyle = BRAND.navy;
    g.fillRect(0, 0, 480, 320);
    g.strokeStyle = accent;
    g.lineWidth = 6;
    g.strokeRect(14, 14, 452, 292);
    paintEmblem(g, brand, img, 170, 42, 140);
    const t = brandTexts(brand, lang);
    g.fillStyle = brand === 'devtechnic' ? BRAND.gold : '#ffffff';
    g.font = `600 38px ${BRAND_FONT}`;
    spacedText(g, t.word, 240, 230, 9);
    g.fillStyle = 'rgba(226, 232, 240, 0.75)';
    g.font = `400 20px ${BRAND_FONT}`;
    spacedText(g, t.tagline, 240, 270, 4);
  });
}

/** Giriş paspası: lacivert zemin, kenar, simge ve "HOŞ GELDİNİZ" / "WELCOME". Kare. */
export function entranceMatTexture(brand: BrandId = 'sade', lang: Lang = 'tr'): Texture {
  const accent = brand === 'devtechnic' ? BRAND.gold : BRAND.teal;
  return brandTexture(brand, `brand-mat-${lang}`, 384, 384, ICON_URL, (g, img) => {
    g.fillStyle = BRAND.navy;
    g.fillRect(0, 0, 384, 384);
    const r = rng(9);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.035})`;
      g.fillRect(r() * 384, r() * 384, 2, 2);
    }
    g.strokeStyle = accent;
    g.lineWidth = 8;
    g.strokeRect(16, 16, 352, 352);
    paintEmblem(g, brand, img, 122, 70, 140);
    g.fillStyle = brand === 'devtechnic' ? BRAND.gold : '#ffffff';
    g.font = `600 30px ${BRAND_FONT}`;
    spacedText(g, translate(lang, 'brand.welcome'), 192, 266, 5);
    g.fillStyle = 'rgba(226, 232, 240, 0.7)';
    g.font = `500 22px ${BRAND_FONT}`;
    spacedText(g, brandTexts(brand, lang).word, 192, 306, 6);
  });
}

/** Mutfak tezgahının arkasındaki karo kaplama (tekrarlanır; 1 tekrar ≈ 0,6 m). */
export function tileTexture(): Texture {
  return once('tiles', () => {
    const [c, g] = canvas(256, 128);
    const r = rng(17);
    g.fillStyle = '#9a9296';
    g.fillRect(0, 0, 256, 128);
    // metro karo: 4 sütun × 4 sıra, sıralar yarım kaydırılmış
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 4; col++) {
        const x = col * 64 + (row % 2) * 32 + 2;
        const y = row * 32 + 2;
        const l = 88 + r() * 6;
        g.fillStyle = `hsl(30, 12%, ${l}%)`;
        g.fillRect(x, y, 60, 28);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x + 3, y + 3, 54, 4);
      }
    }
    return texture(c, true);
  });
}

/**
 * Ofisin bulunduğu kulenin alt katlarının cephesi: her katta koyu bir döşeme bandı ve dikmelerle bölünmüş şerit
 * cam; gece bazı bölmeler yanar. Aşağı inildikçe kararır (göz yukarıdaki ofiste kalsın). `floors` kat, `bays`
 * bölme. Işıklı kısımlar ayrı "emissive" doku.
 */
export function towerTextures(
  floors: number,
  bays: number,
  city: OfficeTheme['city'],
  facade: string,
  glass: string,
): { map: Texture; glow: Texture } {
  const key = `tower${floors}x${bays}${facade}${glass}${city.windows.join('')}${city.lit}`;
  const paint = (glowOnly: boolean) => {
    const bw = 20;
    const fh = 60;
    const [c, g] = canvas(bays * bw, floors * fh);
    const r = rng(101);
    g.fillStyle = glowOnly ? '#000' : facade;
    g.fillRect(0, 0, c.width, c.height);
    for (let f = 0; f < floors; f++) {
      const y = f * fh + 16; // üstte döşeme bandı
      const h = fh - 22;
      if (!glowOnly) {
        g.fillStyle = glass;
        g.fillRect(0, y, c.width, h);
      }
      // ışıklı bölmeler küçük gruplar halinde (bir ofis, bir toplantı odası…)
      let b = 0;
      while (b < bays) {
        const run = 1 + Math.floor(r() * 4);
        const lit = r() < city.lit * 0.55;
        if (lit) {
          g.fillStyle = city.windows[Math.floor(r() * city.windows.length)]!;
          g.globalAlpha = glowOnly ? 0.4 + r() * 0.3 : 0.6;
          g.fillRect(b * bw, y + 2, Math.min(run, bays - b) * bw, h - 4);
          g.globalAlpha = 1;
        }
        b += run;
      }
      // dikmeler
      g.fillStyle = glowOnly ? '#000' : facade;
      for (let k = 0; k <= bays; k++) g.fillRect(k * bw - 1, y, 2, h);
    }
    // aşağı doğru kararma
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    return texture(c);
  };
  return { map: once(`${key}m`, () => paint(false)), glow: once(`${key}g`, () => paint(true)) };
}
