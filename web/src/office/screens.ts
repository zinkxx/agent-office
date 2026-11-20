import { CanvasTexture, SRGBColorSpace } from 'three';
import type { AgentRole, AgentStatus } from '../../../shared/types.ts';
import { screenFps } from './power.ts';
import type { Pastime } from './sim/sim.ts';

/**
 * Monitör ekranları: duruma göre canlanan, TAMAMEN SAHTE kanvas çizimleri. Gerçek kod, metin ya da komut
 * içermez; satırlar renkli dikdörtgenlerden oluşur.
 *
 * Aynı türdeki ekranlar dokuyu paylaşır (her tür için 2 çeşit), yalnızca kullanılan türler ~8 fps'de yeniden çizilir.
 */

export type ScreenKind =
  | 'code'
  | 'page'
  | 'terminal'
  | 'search'
  | 'design'
  | 'tests'
  | 'think'
  | 'ask'
  | 'error'
  | 'tasks'
  | 'idle'
  | 'off'
  | 'dash'
  | 'slides'
  /** Boştayken izlenen video (sahte: hareketli manzara + oynatma çubuğu). */
  | 'video'
  /** Oyun: 0. çeşit platform oyunu (bilgisayarda), 1. çeşit iki kişilik yarış (TV'de konsol). */
  | 'game';

/** Ekranda ne görünecek: durum + rol. Rolü olan ekranlar (tasarımcı, test uzmanı) çalışırken kendi işini gösterir. */
export function screenKindFor(status: AgentStatus | 'absent', role: AgentRole): ScreenKind {
  if (status === 'absent' || status === 'offline') return 'off';
  if (status === 'idle') return 'idle';
  if (status === 'asking') return 'ask';
  if (status === 'error') return 'error';
  if (status === 'thinking') return 'think';
  if (role === 'designer' && status !== 'searching' && status !== 'terminal') return 'design';
  if (role === 'tester' && (status === 'terminal' || status === 'writing' || status === 'working'))
    return 'tests';
  switch (status) {
    case 'writing':
      return 'code';
    case 'reading':
      return 'page';
    case 'terminal':
      return 'terminal';
    case 'searching':
      return 'search';
    case 'delegating':
    case 'messaging':
      return 'tasks';
    default:
      return role === 'lead' ? 'dash' : 'code';
  }
}

/**
 * Boştaki karakter masasında oyalanıyorsa ekranı: ana ekranda (ve liderin büyük ekranında) video ya da oyun,
 * yan ekranda bekleme görüntüsü. Oyalanmıyorsa ya da konsoldaysa null (ekran durumuna göre seçilir).
 */
export function pastimeScreen(
  spot: 'desk' | 'side' | 'big',
  pastime: Pastime,
): { kind: ScreenKind; variant?: number } | null {
  if (pastime !== 'video' && pastime !== 'pcgame') return null;
  if (spot === 'side') return { kind: 'idle' };
  return pastime === 'video' ? { kind: 'video' } : { kind: 'game', variant: 0 };
}

const W = 256;
const H = 160;

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

interface Screen {
  kind: ScreenKind;
  variant: number;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  texture: CanvasTexture;
  usedAt: number;
  /** Sabit rastgele "içerik" (satır uzunlukları, renkler). */
  lines: { indent: number; tokens: { w: number; c: string }[] }[];
}

const CODE_COLORS = ['#ff7aa8', '#ffb547', '#8f8bff', '#6fc8ff', '#5fe0a0', '#e9d9df', '#c69bff'];

export class ScreenBank {
  private readonly screens = new Map<string, Screen>();
  private lastDraw = -1;

  /** Bir ekran türünün dokusu. `variant` 0 ya da 1. */
  get(kind: ScreenKind, variant: number, now: number): CanvasTexture {
    const v = kind === 'off' ? 0 : variant % 2;
    const key = `${kind}:${v}`;
    let s = this.screens.get(key);
    if (!s) {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext('2d')!;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const r = rng(hashKey(key));
      const lines = Array.from({ length: 40 }, () => ({
        indent: Math.floor(r() * 4),
        tokens: Array.from({ length: 1 + Math.floor(r() * 5) }, () => ({
          w: 10 + r() * 46,
          c: CODE_COLORS[Math.floor(r() * CODE_COLORS.length)]!,
        })),
      }));
      s = { kind, variant: v, canvas, g, texture, usedAt: now, lines };
      this.screens.set(key, s);
      draw(s, now / 1000);
      texture.needsUpdate = true;
    }
    s.usedAt = now;
    return s.texture;
  }

  /**
   * Kullanılan ekranları yeniden çizer (saniyede ~8 kez). `reduced`: hareketi azalt, yalnızca yavaş.
   * `lowPower`: düşük güç modu, saniyede ~2 kez.
   */
  tick(now: number, reduced = false, lowPower = false): void {
    const interval = 1000 / screenFps(reduced, lowPower);
    if (now - this.lastDraw < interval) return;
    this.lastDraw = now;
    for (const s of this.screens.values()) {
      if (s.kind === 'off' || now - s.usedAt > 2000) continue;
      draw(s, (reduced ? Math.floor(now / 4000) * 4 : now / 1000) + s.variant * 7.3);
      s.texture.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const s of this.screens.values()) s.texture.dispose();
    this.screens.clear();
  }
}

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function bg(g: CanvasRenderingContext2D, color: string): void {
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
}

function titleBar(g: CanvasRenderingContext2D, color: string): void {
  g.fillStyle = color;
  g.fillRect(0, 0, W, 12);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i]!;
    g.beginPath();
    g.arc(8 + i * 9, 6, 2.6, 0, Math.PI * 2);
    g.fill();
  }
}

function draw(s: Screen, t: number): void {
  const g = s.g;
  switch (s.kind) {
    case 'off':
      bg(g, '#050304');
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.fillRect(0, 0, W, H / 2);
      return;
    case 'code': {
      bg(g, '#150a10');
      titleBar(g, '#2a1520');
      g.fillStyle = '#1d0f16';
      g.fillRect(0, 12, 22, H);
      const lh = 9;
      const scroll = (t * 14) % (s.lines.length * lh);
      for (let i = 0; i < 20; i++) {
        const idx = Math.floor(scroll / lh) + i;
        const line = s.lines[idx % s.lines.length]!;
        const y = 18 + i * lh - (scroll % lh);
        if (y < 14) continue;
        g.fillStyle = '#5a3a48';
        g.fillRect(6, y, 10, 4);
        let x = 28 + line.indent * 12;
        for (const tok of line.tokens) {
          g.fillStyle = tok.c;
          g.fillRect(x, y, tok.w, 4);
          x += tok.w + 5;
          if (x > W - 10) break;
        }
      }
      if (Math.floor(t * 2) % 2 === 0) {
        g.fillStyle = '#ffe1ea';
        g.fillRect(28 + (Math.floor(t * 7) % 30) * 4, H - 22, 3, 8);
      }
      return;
    }
    case 'page': {
      bg(g, '#1f141a');
      titleBar(g, '#2c1c24');
      const scroll = (t * 18) % 400;
      g.save();
      g.translate(0, -scroll);
      for (let block = 0; block < 6; block++) {
        const y0 = 22 + block * 90;
        g.fillStyle = '#f0d6de';
        g.fillRect(30, y0, 120, 7);
        g.fillStyle = '#9c7f8a';
        for (let k = 0; k < 5; k++) g.fillRect(30, y0 + 16 + k * 9, 170 - ((k * 37 + block * 13) % 60), 4);
        if (block % 2 === 0) {
          g.fillStyle = '#4a2a38';
          g.fillRect(30, y0 + 64, 90, 18);
        }
      }
      for (let block = 0; block < 6; block++) {
        const y0 = 22 + (block + 6) * 90;
        g.fillStyle = '#f0d6de';
        g.fillRect(30, y0, 120, 7);
      }
      g.restore();
      // kaydırma çubuğu
      g.fillStyle = '#3a2630';
      g.fillRect(W - 8, 14, 4, H - 18);
      g.fillStyle = '#ff9db3';
      g.fillRect(W - 8, 14 + (scroll / 400) * (H - 50), 4, 30);
      return;
    }
    case 'terminal': {
      bg(g, '#020403');
      const lh = 9;
      const n = Math.floor(t * 2.5);
      for (let i = 0; i < 16; i++) {
        const idx = n - 15 + i;
        if (idx < 0) continue;
        const line = s.lines[idx % s.lines.length]!;
        const y = 8 + i * lh;
        const prompt = idx % 5 === 0;
        g.fillStyle = prompt ? '#7dffb0' : '#3fd27a';
        if (prompt) g.fillRect(6, y, 6, 4);
        let x = prompt ? 16 : 6;
        for (const tok of line.tokens) {
          g.fillStyle = prompt ? '#c8ffdc' : tok.w > 40 ? '#2fa864' : '#3fd27a';
          g.fillRect(x, y, tok.w * 0.8, 4);
          x += tok.w * 0.8 + 4;
          if (x > W - 10) break;
        }
      }
      if (Math.floor(t * 2) % 2 === 0) {
        g.fillStyle = '#7dffb0';
        g.fillRect(16, 8 + 16 * lh - 2, 5, 7);
      }
      return;
    }
    case 'search': {
      bg(g, '#170c12');
      g.fillStyle = '#2c1620';
      g.fillRect(14, 10, W - 28, 20);
      // büyüteç
      g.strokeStyle = '#ffc04d';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(28, 19, 5.5, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(32, 23);
      g.lineTo(37, 28);
      g.stroke();
      g.fillStyle = '#e9d9df';
      g.fillRect(44, 17, 40 + Math.abs(Math.sin(t * 1.3)) * 60, 4);
      const active = Math.floor(t * 1.5) % 7;
      for (let i = 0; i < 7; i++) {
        const y = 40 + i * 17;
        if (i === active) {
          g.fillStyle = 'rgba(255,192,77,0.18)';
          g.fillRect(10, y - 4, W - 20, 15);
        }
        g.fillStyle = '#ffc04d';
        g.fillRect(16, y, 6, 6);
        g.fillStyle = '#d8b4c0';
        g.fillRect(28, y, 60 + ((i * 41) % 70), 4);
        g.fillStyle = '#7d5b68';
        g.fillRect(28, y + 6, 110 + ((i * 23) % 60), 2);
      }
      return;
    }
    case 'design': {
      bg(g, '#241820');
      // sol araç çubuğu
      g.fillStyle = '#17101a';
      g.fillRect(0, 0, 18, H);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i === Math.floor(t) % 6 ? '#ff6fb5' : '#4a3542';
        g.fillRect(5, 8 + i * 14, 8, 8);
      }
      // paletler
      const hue = (t * 12 + s.variant * 90) % 360;
      for (let i = 0; i < 5; i++) {
        g.fillStyle = `hsl(${(hue + i * 34) % 360}, 75%, ${55 + (i % 2) * 10}%)`;
        g.fillRect(30 + i * 30, 10, 24, 24);
      }
      // çalışma alanı: kart, düğme, kutular
      g.fillStyle = '#f6eef2';
      g.fillRect(30, 44, 120, 100);
      g.fillStyle = `hsl(${hue}, 70%, 60%)`;
      g.fillRect(38, 52, 104, 34);
      g.fillStyle = '#c9b6c0';
      g.fillRect(38, 94, 80, 5);
      g.fillRect(38, 104, 60, 5);
      g.fillStyle = `hsl(${(hue + 150) % 360}, 70%, 58%)`;
      g.fillRect(38, 118, 50, 16);
      // sağ katmanlar paneli
      g.fillStyle = '#17101a';
      g.fillRect(W - 80, 0, 80, H);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i === Math.floor(t * 0.7) % 8 ? '#5a2e48' : '#2a1d26';
        g.fillRect(W - 74, 8 + i * 16, 68, 12);
      }
      // seçim kutusu ve imleç
      const cx = 60 + Math.sin(t * 0.9) * 40;
      const cy = 90 + Math.cos(t * 1.1) * 30;
      g.strokeStyle = '#6fc8ff';
      g.lineWidth = 1.5;
      g.strokeRect(cx - 20, cy - 12, 40, 24);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(cx + 20, cy + 12);
      g.lineTo(cx + 28, cy + 26);
      g.lineTo(cx + 22, cy + 24);
      g.fill();
      return;
    }
    case 'tests': {
      bg(g, '#0f0b0d');
      titleBar(g, '#221a1e');
      const shown = Math.floor(t * 2) % 14;
      for (let i = 0; i < Math.min(shown + 1, 12); i++) {
        const y = 18 + i * 11;
        const pass = (i * 7 + s.variant) % 5 !== 3;
        g.fillStyle = pass ? '#3fd27a' : '#ff4d5e';
        // tik ya da çarpı
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 2;
        g.beginPath();
        if (pass) {
          g.moveTo(8, y + 3);
          g.lineTo(11, y + 6);
          g.lineTo(16, y);
        } else {
          g.moveTo(8, y);
          g.lineTo(15, y + 6);
          g.moveTo(15, y);
          g.lineTo(8, y + 6);
        }
        g.stroke();
        g.fillStyle = pass ? '#9fd8b5' : '#ffadb6';
        g.fillRect(22, y + 1, 50 + ((i * 29) % 90), 4);
      }
      const ratio = Math.min(1, (shown + 1) / 12);
      g.fillStyle = '#2a2024';
      g.fillRect(8, H - 10, W - 16, 5);
      g.fillStyle = '#3fd27a';
      g.fillRect(8, H - 10, (W - 16) * ratio * 0.85, 5);
      g.fillStyle = '#ff4d5e';
      g.fillRect(8 + (W - 16) * ratio * 0.85, H - 10, (W - 16) * ratio * 0.15, 5);
      return;
    }
    case 'think': {
      bg(g, '#140a12');
      for (let i = 0; i < 3; i++) {
        const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 3 - i * 0.7));
        g.fillStyle = `rgba(197,139,255,${a})`;
        g.beginPath();
        g.arc(W / 2 - 22 + i * 22, H / 2, 7, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    case 'ask': {
      bg(g, '#160c10');
      g.fillStyle = '#2b1a20';
      g.fillRect(40, 30, W - 80, H - 60);
      g.strokeStyle = '#ffe14d';
      g.lineWidth = 2;
      g.strokeRect(40, 30, W - 80, H - 60);
      const pulse = 1 + Math.sin(t * 4) * 0.12;
      g.fillStyle = '#ffe14d';
      g.beginPath();
      g.arc(W / 2, H / 2 - 6, 16 * pulse, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#160c10';
      g.font = 'bold 22px ui-sans-serif, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', W / 2, H / 2 - 5);
      g.fillStyle = '#6b5a32';
      g.fillRect(W / 2 - 40, H / 2 + 20, 80, 8);
      return;
    }
    case 'error': {
      bg(g, '#1a0507');
      g.fillStyle = '#ff3b3b';
      g.fillRect(0, 0, W, 16);
      g.fillStyle = Math.floor(t * 3) % 2 ? '#ff3b3b' : '#a01f25';
      g.beginPath();
      g.moveTo(W / 2, 46);
      g.lineTo(W / 2 + 30, 100);
      g.lineTo(W / 2 - 30, 100);
      g.closePath();
      g.fill();
      return;
    }
    case 'tasks': {
      bg(g, '#170d12');
      titleBar(g, '#2a1820');
      const cols = ['#8f8bff', '#ffb547', '#5fe0a0'];
      for (let c = 0; c < 3; c++) {
        g.fillStyle = '#21141b';
        g.fillRect(10 + c * 82, 20, 74, H - 28);
        g.fillStyle = cols[c]!;
        g.fillRect(14 + c * 82, 24, 30, 4);
        for (let k = 0; k < 4 - c; k++) {
          const moving = c === 0 && k === 0 ? (t * 30) % 82 : 0;
          g.fillStyle = '#3a2430';
          g.fillRect(14 + c * 82 + moving, 34 + k * 26, 66, 20);
          g.fillStyle = cols[c]!;
          g.fillRect(18 + c * 82 + moving, 40 + k * 26, 36, 3);
        }
      }
      return;
    }
    case 'idle': {
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#12060c');
      grad.addColorStop(1, '#25101a');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      const x = W / 2 + Math.sin(t * 0.4 + s.variant) * 80;
      const y = H / 2 + Math.cos(t * 0.31) * 40;
      const rg = g.createRadialGradient(x, y, 2, x, y, 30);
      rg.addColorStop(0, 'rgba(255,61,110,0.55)');
      rg.addColorStop(1, 'rgba(255,61,110,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
      return;
    }
    case 'dash': {
      bg(g, '#130910');
      // çizgi grafik
      g.fillStyle = '#1f121a';
      g.fillRect(8, 8, 150, 70);
      g.strokeStyle = '#ff6f9a';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 14; i++) {
        const x = 12 + i * 10;
        const y = 60 - Math.sin(i * 0.7 + t * 0.8) * 14 - i * 1.4;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      // çubuklar
      g.fillStyle = '#1f121a';
      g.fillRect(166, 8, 82, 70);
      for (let i = 0; i < 6; i++) {
        const h = 14 + Math.abs(Math.sin(i * 1.7 + t * 0.6)) * 44;
        g.fillStyle = i % 2 ? '#ffb547' : '#8f8bff';
        g.fillRect(172 + i * 12, 72 - h, 8, h);
      }
      // ekip kutucukları
      for (let i = 0; i < 8; i++) {
        g.fillStyle = '#1f121a';
        g.fillRect(8 + i * 30, 88, 26, 30);
        const st = ['#ff4f8b', '#4ee08a', '#6fb4ff', '#ffc04d', '#c58bff', '#9c7a86'][
          (i + Math.floor(t / 3)) % 6
        ]!;
        g.fillStyle = st;
        g.beginPath();
        g.arc(21 + i * 30, 99, 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#5a3a48';
        g.fillRect(12 + i * 30, 110, 18, 3);
      }
      g.fillStyle = '#1f121a';
      g.fillRect(8, 126, 240, 26);
      g.fillStyle = '#4ee08a';
      g.fillRect(12, 136, 180 + Math.sin(t * 0.5) * 20, 6);
      return;
    }
    case 'video':
      drawVideo(g, t, s.variant);
      return;
    case 'game':
      if (s.variant === 0) drawPlatformer(g, t);
      else drawRacer(g, t);
      return;
    case 'slides': {
      bg(g, '#1b0d14');
      g.fillStyle = '#ff9db3';
      g.fillRect(20, 18, 120, 10);
      for (let i = 0; i < 5; i++) {
        const h = 20 + ((i * 37 + Math.floor(t / 4) * 11) % 70);
        g.fillStyle = i === 2 ? '#ffb547' : '#ff4f8b';
        g.fillRect(30 + i * 40, 140 - h, 26, h);
      }
      return;
    }
  }
}

/** Video: sahte bir manzara (gün batımı tepeler ya da gece şehri) ve altta oynatma çubuğu. */
function drawVideo(g: CanvasRenderingContext2D, t: number, variant: number): void {
  const vh = 136;
  const sky = g.createLinearGradient(0, 0, 0, vh);
  if (variant === 0) {
    sky.addColorStop(0, '#2b1650');
    sky.addColorStop(0.55, '#ff6f9a');
    sky.addColorStop(1, '#ffb547');
  } else {
    sky.addColorStop(0, '#06091a');
    sky.addColorStop(1, '#1b2350');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, W, vh);
  if (variant === 0) {
    // güneş ve kayan tepeler (paralaks)
    g.fillStyle = '#ffe2a8';
    g.beginPath();
    g.arc(170, 78 + Math.sin(t * 0.1) * 4, 22, 0, Math.PI * 2);
    g.fill();
    const layers: [string, number, number, number][] = [
      ['#7a2b5a', 92, 18, 6],
      ['#4a1a40', 106, 14, 14],
      ['#2a0f26', 120, 10, 26],
    ];
    for (const [color, base, amp, speed] of layers) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, vh);
      for (let x = 0; x <= W; x += 8) {
        const u = (x + t * speed) / 40;
        g.lineTo(x, base - Math.sin(u) * amp - Math.sin(u * 2.3) * amp * 0.4);
      }
      g.lineTo(W, vh);
      g.fill();
    }
    // uçan kuşlar
    g.strokeStyle = '#2a0f26';
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const x = ((t * 18 + i * 60) % (W + 40)) - 20;
      const y = 40 + i * 9 + Math.sin(t * 2 + i) * 3;
      const flap = Math.sin(t * 8 + i) * 3;
      g.beginPath();
      g.moveTo(x - 5, y - flap);
      g.lineTo(x, y);
      g.lineTo(x + 5, y - flap);
      g.stroke();
    }
  } else {
    // gece şehri: pencereleri yanıp sönen binalar, akan araba ışıkları
    for (let i = 0; i < 12; i++) {
      const x = i * 22 - ((t * 4) % 22);
      const h = 40 + ((i * 37) % 50);
      g.fillStyle = i % 2 ? '#141a38' : '#0f1430';
      g.fillRect(x, vh - 22 - h, 20, h);
      for (let r = 0; r < h / 10 - 1; r++)
        for (let c = 0; c < 3; c++) {
          const on = (Math.floor(t * 0.5) + i * 7 + r * 3 + c) % 5 !== 0;
          if (!on) continue;
          g.fillStyle = (i + r + c) % 4 === 0 ? '#6fc8ff' : '#ffcf8a';
          g.fillRect(x + 3 + c * 6, vh - 18 - h + r * 10, 3, 4);
        }
    }
    g.fillStyle = '#0a0d1e';
    g.fillRect(0, vh - 22, W, 22);
    for (let i = 0; i < 8; i++) {
      const x = (t * 60 + i * 37) % (W + 20);
      g.fillStyle = i % 2 ? '#ff4f6e' : '#fff3c8';
      g.fillRect(i % 2 ? W - x : x - 10, vh - 14 + (i % 2) * 6, 6, 2);
    }
  }
  // oynatma çubuğu
  g.fillStyle = '#0b0b0e';
  g.fillRect(0, vh, W, H - vh);
  const progress = ((t / 90 + variant * 0.37) % 1) * (W - 60);
  g.fillStyle = '#3a3a44';
  g.fillRect(30, vh + 10, W - 60, 3);
  g.fillStyle = '#ff3d6e';
  g.fillRect(30, vh + 10, progress, 3);
  g.beginPath();
  g.arc(30 + progress, vh + 11.5, 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e9e0dc';
  g.beginPath();
  g.moveTo(10, vh + 6);
  g.lineTo(10, vh + 18);
  g.lineTo(20, vh + 12);
  g.fill();
  g.fillRect(W - 24, vh + 8, 12, 8);
}

/** Bilgisayarda oyun: kayan zeminde zıplayan kahraman, altınlar, engeller ve skor. */
function drawPlatformer(g: CanvasRenderingContext2D, t: number): void {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a1f5a');
  sky.addColorStop(1, '#5a3a8a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 18; i++) {
    const x = (i * 53 - t * 6) % W;
    g.fillRect(x < 0 ? x + W : x, (i * 29) % 70, 2, 2);
  }
  const ground = 124;
  const scroll = (t * 70) % 32;
  for (let x = -scroll; x < W; x += 32) {
    g.fillStyle = '#3e8a48';
    g.fillRect(x, ground, 32, 6);
    g.fillStyle = '#7a4a34';
    g.fillRect(x, ground + 6, 32, H - ground - 6);
    g.fillStyle = '#5e3a2c';
    g.fillRect(x + 4, ground + 14, 10, 6);
  }
  // havada platformlar ve altınlar
  for (let i = 0; i < 4; i++) {
    const x = ((i * 90 - t * 70) % 360) + 300;
    const px = x > W + 40 ? x - 360 : x;
    g.fillStyle = '#c99a3a';
    g.fillRect(px, 78 - (i % 2) * 18, 44, 8);
    g.fillStyle = '#ffd34d';
    g.beginPath();
    g.arc(px + 22, 66 - (i % 2) * 18 + Math.sin(t * 6 + i) * 2, 5, 0, Math.PI * 2);
    g.fill();
  }
  // engel
  const ex = W - ((t * 70) % (W + 40));
  g.fillStyle = '#d84a3a';
  g.fillRect(ex, ground - 14, 14, 14);
  // kahraman: zıplar
  const jump = Math.abs(Math.sin(t * 2.6)) * 42;
  const hy = ground - 18 - jump;
  g.fillStyle = '#ff6f9a';
  g.fillRect(56, hy, 16, 18);
  g.fillStyle = '#ffffff';
  g.fillRect(65, hy + 4, 4, 4);
  g.fillStyle = '#1a1216';
  g.fillRect(67, hy + 5, 2, 2);
  // skor ve can
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, W, 16);
  g.fillStyle = '#ffd34d';
  g.fillRect(6, 5, 30 + ((Math.floor(t * 3) * 7) % 40), 6);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = '#ff4f6e';
    g.fillRect(W - 14 - i * 12, 4, 8, 8);
  }
}

/** Konsolda iki kişilik yarış: bölünmüş ekran, kayan yol çizgileri, sallanan arabalar. */
function drawRacer(g: CanvasRenderingContext2D, t: number): void {
  const half = W / 2;
  for (let p = 0; p < 2; p++) {
    const ox = p * half;
    const speed = p === 0 ? 1 : 1.12;
    g.save();
    g.beginPath();
    g.rect(ox, 0, half, H);
    g.clip();
    const sky = g.createLinearGradient(0, 0, 0, 60);
    sky.addColorStop(0, p === 0 ? '#3a8ad8' : '#ff9d6e');
    sky.addColorStop(1, p === 0 ? '#9fd6ff' : '#ffd8a8');
    g.fillStyle = sky;
    g.fillRect(ox, 0, half, 60);
    g.fillStyle = p === 0 ? '#3e8a48' : '#c99a3a';
    g.fillRect(ox, 60, half, H - 60);
    // yol (perspektif)
    const cx = ox + half / 2 + Math.sin(t * 0.7 + p) * 10;
    g.fillStyle = '#3a3a44';
    g.beginPath();
    g.moveTo(cx - 6, 60);
    g.lineTo(cx + 6, 60);
    g.lineTo(ox + half - 4, H);
    g.lineTo(ox + 4, H);
    g.fill();
    // kayan şerit çizgileri
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const k = (i / 6 + t * 0.9 * speed) % 1;
      const y = 60 + k * k * (H - 60);
      const w = 1 + k * 4;
      g.fillRect(cx + (ox + half / 2 - cx) * k - w / 2, y, w, 2 + k * 8);
    }
    // yol kenarı ağaçları
    for (let i = 0; i < 3; i++) {
      const k = (i / 3 + t * 0.9 * speed) % 1;
      const y = 60 + k * k * (H - 60);
      const sz = 3 + k * 16;
      g.fillStyle = '#25553a';
      g.fillRect(ox + 8 + (1 - k) * 40 - sz / 2, y - sz, sz, sz);
      g.fillRect(ox + half - 8 - (1 - k) * 40 - sz / 2, y - sz, sz, sz);
    }
    // araba
    const carX = ox + half / 2 + Math.sin(t * 2.3 + p * 1.7) * 14 - 12;
    g.fillStyle = p === 0 ? '#ff3d6e' : '#6fc8ff';
    g.fillRect(carX, H - 30, 24, 14);
    g.fillStyle = '#1a1216';
    g.fillRect(carX + 3, H - 34, 18, 6);
    g.fillRect(carX - 2, H - 20, 4, 6);
    g.fillRect(carX + 22, H - 20, 4, 6);
    // sıra göstergesi
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(ox + 4, 4, 22, 12);
    g.fillStyle = '#ffd34d';
    g.fillRect(ox + 8, 8, 6 + ((Math.floor(t / 4) + p) % 2) * 8, 4);
    g.restore();
  }
  g.fillStyle = '#0b0b0e';
  g.fillRect(half - 1, 0, 2, H);
}
