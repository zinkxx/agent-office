import { findPath, type Point } from './pathfinding.ts';
import type { OfficePlan } from './plan.ts';

/**
 * Proje maskotu (kedi, köpek, robot): ofiste yol bularak dolaşır, varınca bir süre oturur ya da durur.
 * Saf mantık; çizim her karede `state`'i okur. Rastgelelik tohumlu (aynı tohum → aynı dolaşma).
 */

export type MascotKind = 'cat' | 'dog' | 'robot';
export const MASCOT_KINDS: readonly MascotKind[] = ['cat', 'dog', 'robot'];

export type MascotMode = 'walk' | 'sit' | 'stand';

export interface MascotState {
  x: number;
  z: number;
  /** rotation.y (yüz yerel +z'ye bakar). */
  heading: number;
  mode: MascotMode;
  /** m/sn (yürüme animasyonu için). */
  speed: number;
}

/** Yürüme hızı (m/sn): insanlardan biraz yavaş, telaşsız. */
export const MASCOT_SPEED = 0.8;
const REST_MIN_MS = 4_000;
const REST_MAX_MS = 11_000;
/** Hedef ararken en fazla bu kadar deneme (ulaşılamayan hücreler atlanır). */
const TRIES = 24;

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

export class MascotSim {
  readonly state: MascotState;
  reducedMotion = false;
  private plan: OfficePlan;
  private path: Point[] = [];
  /** Dinlenme bitince (ms, sim saatiyle) yeni hedef seçilir. */
  private restUntil = 0;
  private time = 0;
  private readonly random: () => number;

  constructor(plan: OfficePlan, seed = 1) {
    this.plan = plan;
    this.random = rng(seed);
    // Başlangıç: kanepenin yanı (yoksa kapının içi).
    const start = plan.sofaSeats[0]?.approach ?? plan.door;
    const p = this.free(start);
    this.state = { x: p.x, z: p.z, heading: 0, mode: 'sit', speed: 0 };
    this.restUntil = this.restTime();
  }

  /** Kat planı değişti (ada taşındı, oda büyüdü): engelin içinde kaldıysa en yakın boş yere geçer. */
  setPlan(plan: OfficePlan): void {
    this.plan = plan;
    const p = this.free(this.state);
    this.state.x = p.x;
    this.state.z = p.z;
    this.path = [];
    if (this.state.mode === 'walk') this.rest();
  }

  /** `dt` saniye ilerletir. */
  step(dt: number): void {
    const s = this.state;
    this.time += dt * 1000;
    if (this.reducedMotion) {
      // Hareketi azalt: maskot yerinde oturur.
      this.path = [];
      s.mode = 'sit';
      s.speed = 0;
      return;
    }
    if (this.path.length === 0) {
      s.speed = 0;
      if (this.time >= this.restUntil) this.pickTarget();
      return;
    }
    let budget = MASCOT_SPEED * dt;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0]!;
      const dx = next.x - s.x;
      const dz = next.z - s.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-6) s.heading = turn(s.heading, Math.atan2(dx, dz), dt);
      if (dist <= budget) {
        s.x = next.x;
        s.z = next.z;
        budget -= dist;
        this.path.shift();
      } else {
        s.x += (dx / dist) * budget;
        s.z += (dz / dist) * budget;
        budget = 0;
      }
    }
    s.mode = 'walk';
    s.speed = MASCOT_SPEED;
    if (this.path.length === 0) this.rest();
  }

  private rest(): void {
    this.state.mode = this.random() < 0.65 ? 'sit' : 'stand';
    this.state.speed = 0;
    this.restUntil = this.time + this.restTime();
  }

  private restTime(): number {
    return REST_MIN_MS + this.random() * (REST_MAX_MS - REST_MIN_MS);
  }

  /** Yakın, boş ve ulaşılabilir bir hedef seçer; bulamazsa biraz daha dinlenir. */
  private pickTarget(): void {
    const g = this.plan.grid;
    const s = this.state;
    for (let i = 0; i < TRIES; i++) {
      // Çoğunlukla yakına (≤ 7 m), bazen odanın herhangi bir yerine.
      const far = this.random() < 0.25;
      const target = far
        ? { x: this.random() * this.plan.width, z: this.random() * this.plan.depth }
        : { x: s.x + (this.random() - 0.5) * 14, z: s.z + (this.random() - 0.5) * 14 };
      const cell = g.toCell(target);
      if (!g.isFree(cell.c, cell.r)) continue;
      const to = g.toWorld(cell.c, cell.r);
      if (Math.hypot(to.x - s.x, to.z - s.z) < 1.5) continue;
      const path = findPath(g, s, to);
      if (!path || path.length === 0) continue;
      this.path = path;
      s.mode = 'walk';
      return;
    }
    this.restUntil = this.time + 2_000;
  }

  /** Nokta engelliyse en yakın boş hücrenin merkezi. */
  private free(p: Point): Point {
    const g = this.plan.grid;
    const c = g.toCell(p);
    if (g.isFree(c.c, c.r)) return { x: p.x, z: p.z };
    const n = g.nearestFree(p);
    return n ? g.toWorld(n.c, n.r) : { x: p.x, z: p.z };
  }
}

/** Yumuşak dönüş: hedef açıya kısa yoldan yaklaşır. */
function turn(from: number, to: number, dt: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * (1 - Math.exp(-10 * dt));
}
