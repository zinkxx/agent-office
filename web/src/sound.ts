import type { OfficeSnapshot } from '../../shared/types.ts';
import type { MessageKey } from './i18n.ts';
import { isActive } from './labels.ts';

/**
 * Sesli uyarılar:
 * - `ask`: bir ajan seni beklemeye başladı (soru sordu)
 * - `done`: bir yardımcı ajan işini bitirdi
 * - `letter`: oturumlar arası yeni mesaj
 */
export type Cue = 'ask' | 'done' | 'letter';

/** Uyarının açıklamasının sözlük anahtarı ("Biri seni bekliyor" / "Someone is waiting for you"). */
export const CUE_LABEL: Record<Cue, MessageKey> = {
  ask: 'cue.ask',
  done: 'cue.done',
  letter: 'cue.letter',
};

/** İki anlık görüntü arasındaki uyarılar. İlk görüntüde (sayfa açılışı) hiçbir ses çalınmaz. */
export function soundCues(prev: OfficeSnapshot | null, next: OfficeSnapshot): Cue[] {
  if (!prev) return [];
  const cues = new Set<Cue>();
  const before = new Map(prev.agents.map((a) => [a.id, a]));
  for (const a of next.agents) {
    const old = before.get(a.id);
    if (!old) continue; // yeni gelen ajan: önceki durumu bilinmiyor
    if (a.status === 'asking' && old.status !== 'asking') cues.add('ask');
    if (a.kind === 'subagent' && isActive(old.status) && !isActive(a.status) && a.status !== 'offline')
      cues.add('done');
  }
  const seen = new Set(prev.letters.map((l) => l.id));
  if (next.letters.some((l) => !seen.has(l.id) && l.toId)) cues.add('letter');
  // Sıra önem sırasıdır: aynı anda birkaç uyarı olursa en önemlisi önce çalar.
  return (['ask', 'done', 'letter'] as const).filter((c) => cues.has(c));
}

/** Aynı uyarı bu süreden sık çalmaz (kalabalık ofiste ses yağmuru olmasın). */
export const CUE_COOLDOWN_MS = 2500;

interface Note {
  /** Başlangıçtan gecikme (sn). */
  at: number;
  freq: number;
  /** Süre (sn). */
  dur: number;
  type: OscillatorType;
  gain: number;
  /** Varsa frekans bu değere kayar (ör. "pop" için düşüş). */
  slideTo?: number;
}

const NOTES: Record<Cue, Note[]> = {
  // iki tonlu yumuşak zil (Mi → La)
  ask: [
    { at: 0, freq: 659.25, dur: 0.5, type: 'sine', gain: 0.5 },
    { at: 0.16, freq: 880, dur: 0.7, type: 'sine', gain: 0.45 },
  ],
  // yükselen kısa akor: "tamam"
  done: [
    { at: 0, freq: 523.25, dur: 0.28, type: 'triangle', gain: 0.32 },
    { at: 0.08, freq: 659.25, dur: 0.28, type: 'triangle', gain: 0.3 },
    { at: 0.16, freq: 783.99, dur: 0.45, type: 'triangle', gain: 0.3 },
  ],
  // zarf düşme sesi: kısa, aşağı kayan "pop"
  letter: [{ at: 0, freq: 1100, dur: 0.18, type: 'sine', gain: 0.4, slideTo: 520 }],
};

type AudioCtor = typeof AudioContext;

/**
 * Sesleri dosya indirmeden, tarayıcının ses motoruyla (Web Audio) kodla üretir. Tarayıcılar ses motorunu
 * ancak bir tıklama ya da tuş vuruşundan sonra açtığı için ilk kullanıcı hareketinde `unlock` çağrılır.
 */
export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private last = new Map<Cue, number>();

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: AudioCtor | undefined =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext);
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** Kullanıcı hareketinden sonra ses motorunu açar. */
  unlock(): void {
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
  }

  /** Bir uyarıyı çalar; `force` bekleme süresini yok sayar ("Dene" düğmesi için). */
  play(cue: Cue, volume: number, force = false): void {
    const now = Date.now();
    if (!force && now - (this.last.get(cue) ?? 0) < CUE_COOLDOWN_MS) return;
    const ctx = this.context();
    if (!ctx || volume <= 0) return;
    if (ctx.state === 'suspended') {
      // Henüz kullanıcı hareketi olmadıysa sessizce geç; sonraki uyarılar çalar.
      void ctx.resume().catch(() => {});
      if (ctx.state === 'suspended') return;
    }
    this.last.set(cue, now);
    const master = ctx.createGain();
    // Algılanan ses düzeyi için kare eğrisi; en yüksekte bile yumuşak.
    master.gain.value = volume * volume * 0.35;
    master.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.01;
    let end = t0;
    for (const n of NOTES[cue]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = n.type;
      const start = t0 + n.at;
      osc.frequency.setValueAtTime(n.freq, start);
      if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, start + n.dur);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(n.gain, start + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
      osc.connect(env).connect(master);
      osc.start(start);
      osc.stop(start + n.dur + 0.05);
      end = Math.max(end, start + n.dur + 0.1);
    }
    setTimeout(() => master.disconnect(), (end - ctx.currentTime) * 1000 + 100);
  }
}
