import type { Agent, AgentStatus, Letter } from '../../../../shared/types.ts';
import { findPath, type Point } from './pathfinding.ts';
import { headingTo, seatOf, visitSpot, type OfficePlan, type Seat, type Spot } from './plan.ts';

/**
 * Ofis simülasyonu: karakterlerin nerede olduğu, nereye yürüdüğü, kiminle konuştuğu.
 *
 * Saf ve deterministik: React/Three.js kullanmaz; saat dışarıdan `step(dt)` ile ilerler, rastgelelik verilen
 * üreteçten gelir. Sahne her karede yalnızca `actors` içinden okuyup çizer.
 */

export type Pose = 'sit' | 'stand' | 'walk' | 'sofa';
/** Konuşma balonundaki simge (içerik yok). */
export type BubbleIcon = 'mail' | 'tasks' | 'check' | 'coffee';
export type Gesture = 'none' | 'talk' | 'wave' | 'stretch';
export type Holding = 'mug' | 'controller' | null;
/**
 * Boştaki karakterin oyalandığı şey: masada video izlemek ya da bilgisayarda oyun oynamak (masa ekranı buna göre
 * değişir), oyun köşesinde konsolda oynamak (TV oyun gösterir).
 */
export type Pastime = 'video' | 'pcgame' | 'console' | 'lab' | null;
/** Karakterin şu an yürüttüğü senaryo. Önemli olanlar (giriş, ziyaret, rapor, çıkış) durum değişince bölünmez. */
export type Script =
  | 'enter'
  | 'visit'
  | 'report'
  | 'exit'
  | 'coffee'
  | 'sofa'
  | 'lounge'
  | 'console'
  | 'video'
  | 'pcgame'
  | 'lab'
  | 'stretch'
  | 'return'
  | 'host';

const ESSENTIAL: ReadonlySet<Script> = new Set(['enter', 'visit', 'report', 'exit']);

export interface Actor {
  id: string;
  kind: Agent['kind'];
  parentId?: string;
  status: AgentStatus;
  x: number;
  z: number;
  /** Şu anki yön (rotation.y) ve varılmak istenen yön. */
  heading: number;
  targetHeading: number;
  pose: Pose;
  /** Yürüme hızı (m/sn); animasyonun adım sıklığı buna göre. */
  speed: number;
  /** Solup belirme için 0..1. */
  opacity: number;
  visible: boolean;
  bubble: BubbleIcon | null;
  gesture: Gesture;
  holding: Holding;
  pastime: Pastime;
  /** Kameraya dönsün mü (ör. "seni bekliyor"). Sahne bunu kameranın yönüyle çözer. */
  faceCamera: boolean;
  /** Kendi masasında oturuyor mu. */
  atHome: boolean;
  script: Script | null;
  tasks: Task[];
  /** Ayırdığı ya da oturduğu yer: "sofa:0", "arm:1", "game:0" (dinlenme alanı), "lab:0" (deney masası). */
  perch: string | null;
  idleSince: number | null;
  nextIdleAt: number;
  /** Ofisten çıktı: gizlendi, silinmeyi bekliyor. */
  gone: boolean;
  /** Yanına gidilen masanın sahibi (aynı masaya gelen ziyaretçiler ayrı noktalarda dursun diye). */
  visiting: string | null;
  /** Ekip üyesinin masasında oturuyorsa üyenin adı (her işte aynı kişi; iş bitince ofiste kalır). */
  member: string | null;
  /**
   * Çalışmayan ekip üyesi: sunucuda karşılığı olmayan, yalnızca ofiste boşta dolaşan karakter
   * (kimliği `residentId(üye adı)`). Üyeye iş gelince aynı karakter işe döner.
   */
  resident: boolean;
}

/** Çalışmayan ekip üyesinin ofisteki karakterinin kimliği. */
export function residentId(member: string): string {
  return `uye:${member}`;
}

type Task =
  | { t: 'walk'; to: Point | (() => Point | null); path?: Point[] }
  | { t: 'sitHome' }
  | { t: 'sitAt'; spot: Spot; pose: 'sit' | 'sofa' }
  | { t: 'stand' }
  | { t: 'face'; heading: number | (() => number) }
  | {
      t: 'wait';
      ms: number;
      elapsed?: number;
      bubble?: BubbleIcon;
      gesture?: Gesture;
      holding?: Holding;
      pastime?: Pastime;
    }
  | { t: 'waitFor'; cond: () => boolean; timeoutMs: number; elapsed?: number }
  | { t: 'meet'; other: string; icon: BubbleIcon; ms: number; elapsed?: number; started?: boolean }
  | { t: 'appear'; at: Spot }
  | { t: 'hide' }
  | { t: 'done'; fn?: () => void };

export const WALK_SPEED = 1.35;
const FADE_PER_SEC = 4;
const TALK_MS = 2600;
/** Boşta kalan bu kadar sonra çoğunlukla dinlenme alanına geçer (kanepe, koltuk, konsol). */
export const SOFA_AFTER_MS = 150_000;

export interface SimOptions {
  random?: () => number;
  reducedMotion?: boolean;
}

const isWorking = (s: AgentStatus) => s !== 'idle' && s !== 'offline';

export class OfficeSim {
  readonly actors = new Map<string, Actor>();
  /** Simülasyon saati (ms). */
  time = 0;
  reducedMotion: boolean;
  private plan: OfficePlan | null = null;
  private readonly random: () => number;
  private readonly seenLetters = new Set<string>();
  private synced = false;
  private coffeeBusy: string | null = null;

  constructor(options: SimOptions = {}) {
    this.random = options.random ?? Math.random;
    this.reducedMotion = options.reducedMotion ?? false;
  }

  /** Kat planını ayarlar; masasında oturanlar yeni masa yerine taşınır. */
  setPlan(plan: OfficePlan): void {
    this.plan = plan;
    for (const a of this.actors.values()) {
      if (a.atHome && a.tasks.length === 0) this.snapHome(a);
    }
  }

  private home(id: string): Spot | undefined {
    if (!this.plan) return undefined;
    const member = this.actors.get(id)?.member;
    const seat = member ? this.memberSeat(member) : seatOf(this.plan, id);
    return seat ? { x: seat.x, z: seat.z, heading: seat.heading } : undefined;
  }

  private memberSeat(member: string): Seat | undefined {
    return this.plan?.seats.find((s) => s.member === member);
  }

  private snapHome(a: Actor): void {
    const h = this.home(a.id);
    if (!h) return;
    a.x = h.x;
    a.z = h.z;
    a.heading = a.targetHeading = h.heading;
    a.pose = 'sit';
    a.atHome = true;
  }

  private create(agent: Agent, at: Spot | undefined, visible: boolean): Actor {
    const a: Actor = {
      id: agent.id,
      kind: agent.kind,
      ...(agent.parentId ? { parentId: agent.parentId } : {}),
      status: agent.status,
      x: at?.x ?? 0,
      z: at?.z ?? 0,
      heading: at?.heading ?? 0,
      targetHeading: at?.heading ?? 0,
      pose: 'sit',
      speed: 0,
      opacity: visible ? 1 : 0,
      visible,
      bubble: null,
      gesture: 'none',
      holding: null,
      pastime: null,
      faceCamera: false,
      atHome: false,
      script: null,
      tasks: [],
      perch: null,
      idleSince: agent.status === 'idle' ? this.time : null,
      nextIdleAt: this.time + this.rand(12_000, 30_000),
      gone: false,
      visiting: null,
      member: null,
      resident: false,
    };
    this.actors.set(agent.id, a);
    return a;
  }

  private rand(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * Sunucudan gelen yeni durumu uygular: yeni gelenler kapıdan girer, işini bitiren yardımcı rapor verip çıkar,
   * kapanan oturum ofisten ayrılır, yeni mesajlar için karakterler birbirinin masasına yürür.
   * `agents` yalnızca bu planın projesindeki ajanlardır.
   */
  sync(agents: readonly Agent[], letters: readonly Letter[] = [], serverNow?: number): void {
    const initial = !this.synced;
    /** Gerçekte ne kadar süredir boşta (sunucu saatine göre); bilinmiyorsa 0. */
    const idleFor = (agent: Agent) =>
      serverNow !== undefined ? Math.max(0, serverNow - agent.lastActivityAt) : 0;
    this.synced = true;
    const present = new Set<string>();
    for (const agent of agents) {
      present.add(agent.id);
      const home = this.home(agent.id);
      let a = this.actors.get(agent.id);
      const working = isWorking(agent.status);
      if (!a) {
        if (!home) continue;
        // Kapalı oturum ya da işini çoktan bitirmiş yardımcı: masası boş görünür, karakter yok.
        if (agent.status === 'offline' || (agent.kind === 'subagent' && !working)) continue;
        const member = (agent.kind === 'subagent' && seatOf(this.plan!, agent.id)?.member) || null;
        const resident = member ? this.actors.get(residentId(member)) : undefined;
        if (initial) {
          a = this.create(agent, home, true);
          a.member = member;
          this.snapHome(a);
          if (agent.status === 'idle') a.idleSince = this.time - idleFor(agent);
        } else if (resident && !resident.gone && resident.visible && resident.script !== 'exit') {
          // Ofiste boşta dolaşan ekip üyesine iş geldi: aynı karakter elindekini bırakıp masasına döner.
          a = this.adopt(resident, agent);
          if (agent.parentId) this.assignTask(agent.parentId, a.id);
        } else {
          a = this.create(agent, this.plan!.door, false);
          a.member = member;
          this.enter(a);
          if (agent.kind === 'subagent' && agent.parentId) this.assignTask(agent.parentId, a.id);
        }
        continue;
      }
      const before = a.status;
      a.status = agent.status;
      if (a.gone) {
        // Geri döndü (ör. oturum yeniden açıldı).
        if (working) {
          a.gone = false;
          a.x = this.plan!.door.x;
          a.z = this.plan!.door.z;
          this.enter(a);
        }
        continue;
      }
      if (before === agent.status) continue;
      if (agent.kind === 'subagent' && isWorking(before) && !working) this.report(a);
      else if (agent.kind === 'session' && agent.status === 'offline') this.leave(a);
      else if (working) {
        a.idleSince = null;
        // Kahvede, kanepede ya da gerinirken iş geldi: masaya dön.
        if (a.script ? !ESSENTIAL.has(a.script) : !a.atHome) this.goBackToWork(a);
      } else if (agent.status === 'idle') {
        a.idleSince = this.time - idleFor(agent);
        a.nextIdleAt = this.time + this.rand(12_000, 30_000);
      }
    }
    // Görünümden düşenler kapıdan çıkar; ekip üyesi ise ofiste kalır (boşta karakterine döner).
    for (const a of [...this.actors.values()]) {
      if (present.has(a.id) || a.resident) continue;
      if (a.gone) this.actors.delete(a.id);
      else if (a.script === 'exit' || a.script === 'report') continue;
      else if (a.member) this.retire(a);
      else this.leave(a);
    }
    this.syncResidents(initial);
    // Mektuplar
    for (const letter of letters) {
      if (this.seenLetters.has(letter.id)) continue;
      this.seenLetters.add(letter.id);
      if (initial) continue;
      this.deliver(letter);
    }
  }

  // ---------- ekip üyeleri: çalışmıyorken de ofiste ----------

  /**
   * Masası olan her ekip üyesi için, o masada çalışan biri yoksa boşta bir karakter tutar. Açılışta masasında
   * oturur; sonradan gelen (ör. ekibe yeni eklenen) kapıdan girer. Ekipten çıkan üye kapıdan çıkar.
   */
  private syncResidents(initial: boolean): void {
    const plan = this.plan;
    if (!plan) return;
    const members = new Map<string, Seat>();
    for (const seat of plan.seats) if (seat.member) members.set(seat.member, seat);
    const busy = new Set<string>();
    for (const a of this.actors.values()) {
      if (a.resident) {
        if (members.has(a.member!)) continue;
        if (a.gone) this.actors.delete(a.id);
        else if (a.script !== 'exit') this.leave(a);
      } else if (a.member && !a.gone) busy.add(a.member);
    }
    for (const [name, seat] of members) {
      if (busy.has(name)) continue;
      const id = residentId(name);
      const existing = this.actors.get(id);
      if (existing && !existing.gone) continue;
      if (existing) this.actors.delete(id);
      const agent: Agent = {
        id,
        name,
        project: plan.project,
        kind: 'subagent',
        role: seat.role,
        status: 'idle',
        lastActivityAt: 0,
        recent: [],
      };
      const home = { x: seat.x, z: seat.z, heading: seat.heading };
      const a = this.create(agent, initial ? home : plan.door, initial);
      a.member = name;
      a.resident = true;
      // Ofis açılır açılmaz canlı görünsün: ilk etkinlikler birkaç saniye içinde, aynı anda değil.
      a.idleSince = this.time - this.rand(0, SOFA_AFTER_MS);
      a.nextIdleAt = this.time + this.rand(1_500, 14_000);
      if (initial) this.snapHome(a);
      else this.enter(a);
    }
  }

  /** Boşta dolaşan ekip üyesi işe çağrıldı: karakter yerinde kalır, kimliği yardımcınınki olur, masasına döner. */
  private adopt(r: Actor, agent: Agent): Actor {
    this.cleanup(r);
    const a: Actor = {
      ...r,
      id: agent.id,
      kind: agent.kind,
      status: agent.status,
      resident: false,
      idleSince: null,
      script: null,
      tasks: [],
    };
    if (agent.parentId) a.parentId = agent.parentId;
    else delete a.parentId;
    this.actors.delete(r.id);
    this.actors.set(a.id, a);
    this.goBackToWork(a);
    return a;
  }

  /** İşi biten ekip üyesi ofisten çıkmaz: yerinde boşta karakterine döner. */
  private retire(a: Actor): void {
    const member = a.member;
    const id = member ? residentId(member) : null;
    const taken = id ? this.actors.get(id) : undefined;
    if (!member || !id || (taken && !taken.gone)) {
      this.leave(a);
      return;
    }
    this.cleanup(a);
    const r: Actor = {
      ...a,
      id,
      kind: 'subagent',
      status: 'idle',
      resident: true,
      script: null,
      tasks: [],
      idleSince: this.time,
      nextIdleAt: this.time + this.rand(4_000, 12_000),
    };
    delete r.parentId;
    this.actors.delete(a.id);
    this.actors.set(id, r);
  }

  // ---------- senaryolar ----------

  private run(a: Actor, script: Script, tasks: Task[]): void {
    this.cleanup(a);
    a.script = script;
    a.tasks = tasks;
  }

  /**
   * Senaryo yarıda kesilirken balon, oyun kolu, kahve sırası gibi şeyleri bırak. Dinlenme alanında oturuyorsa
   * yeri, kalkarken ('stand') bırakılır; daha yoldayken kesildiyse ayırdığı yer hemen boşalır.
   */
  private cleanup(a: Actor): void {
    a.visiting = null;
    a.bubble = null;
    a.gesture = 'none';
    a.faceCamera = false;
    a.pastime = null;
    if (a.holding === 'controller') a.holding = null;
    if (a.perch !== null && a.pose !== 'sofa') a.perch = null;
    if (this.coffeeBusy === a.id) this.coffeeBusy = null;
  }

  /** `a`, `hostId`'nin masasının yanında duracağı noktayı alır (başka ziyaretçilerle çakışmadan). */
  private spotNear(a: Actor, hostId: string): Point | null {
    const seat = this.plan ? seatOf(this.plan, hostId) : undefined;
    if (!seat) return null;
    let nth = 0;
    for (const other of this.actors.values()) if (other !== a && other.visiting === hostId) nth++;
    a.visiting = hostId;
    return visitSpot(this.plan!, seat, nth);
  }

  private walkHome(): Task[] {
    return [{ t: 'walk', to: () => null }, { t: 'sitHome' }];
  }

  private enter(a: Actor): void {
    const door = this.plan!.door;
    this.run(a, 'enter', [{ t: 'appear', at: door }, ...this.walkHome()]);
  }

  private leave(a: Actor): void {
    const door = this.plan!.door;
    this.run(a, 'exit', [{ t: 'stand' }, { t: 'walk', to: door }, { t: 'hide' }]);
  }

  private goBackToWork(a: Actor): void {
    if (a.atHome && a.pose === 'sit') {
      this.cleanup(a);
      a.script = null;
      a.tasks = [];
      a.holding = null;
      return;
    }
    this.run(a, 'return', [{ t: 'stand' }, ...this.walkHome(), { t: 'wait', ms: 0, holding: null }]);
  }

  /** Lider, yeni yardımcının masasına gidip iş verir. */
  private assignTask(leadId: string, subId: string): void {
    const lead = this.actors.get(leadId);
    if (!lead || lead.gone || !lead.visible) return;
    if (lead.script && ESSENTIAL.has(lead.script)) {
      // Lider zaten bir işte: kuyruğa çok iş biriktirme, yalnızca masasında görev balonu.
      if (lead.script === 'visit' && lead.tasks.length > 8) return;
    }
    const seatSpot = () => this.spotNear(lead, subId);
    const sub = () => this.actors.get(subId);
    const tasks: Task[] = [
      { t: 'stand' },
      { t: 'walk', to: seatSpot },
      {
        t: 'waitFor',
        cond: () => sub()?.atHome === true || sub()?.gone === true || !sub(),
        timeoutMs: 25_000,
      },
      { t: 'meet', other: subId, icon: 'tasks', ms: TALK_MS },
      { t: 'done', fn: () => (lead.visiting = null) },
      ...this.walkHome(),
    ];
    if (lead.script === 'visit') lead.tasks.push(...tasks);
    else this.run(lead, 'visit', tasks);
  }

  /** İşini bitiren yardımcı lidere rapor verir, sonra kapıdan çıkar. */
  private report(a: Actor): void {
    const door = this.plan!.door;
    const lead = a.parentId ? this.actors.get(a.parentId) : undefined;
    const leadSeat = a.parentId && this.plan ? seatOf(this.plan, a.parentId) : undefined;
    const tasks: Task[] = [{ t: 'stand' }];
    if (lead && !lead.gone && leadSeat) {
      tasks.push(
        { t: 'walk', to: () => this.spotNear(a, lead.id) },
        { t: 'meet', other: lead.id, icon: 'check', ms: TALK_MS },
        { t: 'done', fn: () => (a.visiting = null) },
      );
    }
    if (a.member) tasks.push(...this.walkHome(), { t: 'done', fn: () => this.retire(a) });
    else tasks.push({ t: 'walk', to: door }, { t: 'hide' });
    this.run(a, 'report', tasks);
  }

  /** Aynı projede mesaj: gönderen alıcının masasına yürür; alıcı burada değilse yalnızca balon. */
  private deliver(letter: Letter): void {
    const from = this.actors.get(letter.fromId);
    if (!from || from.gone || !from.visible) return;
    const to = letter.toId ? this.actors.get(letter.toId) : undefined;
    const toSeat = to && this.plan ? seatOf(this.plan, to.id) : undefined;
    if (!to || to.gone || !toSeat || to.id === from.id) {
      if (!from.script || !ESSENTIAL.has(from.script)) {
        this.run(from, 'stretch', [{ t: 'wait', ms: TALK_MS, bubble: 'mail' }, { t: 'done' }]);
      }
      return;
    }
    const tasks: Task[] = [
      { t: 'stand' },
      { t: 'walk', to: () => this.spotNear(from, to.id) },
      { t: 'meet', other: to.id, icon: 'mail', ms: TALK_MS },
      { t: 'done', fn: () => (from.visiting = null) },
      ...this.walkHome(),
    ];
    if (from.script && ESSENTIAL.has(from.script)) from.tasks.push(...tasks);
    else this.run(from, 'visit', tasks);
  }

  /** Ayrılabilir yerlerin listesi: kanepe, koltuk, armut koltuk, deney masası. */
  private perchList(kind: string): readonly Spot[] {
    const plan = this.plan;
    if (!plan) return [];
    if (kind === 'sofa') return plan.sofaSeats;
    if (kind === 'arm') return plan.armchairSeats;
    if (kind === 'game') return plan.gameSeats;
    if (kind === 'lab') return [plan.zones.tech.labSpot];
    return [];
  }

  /** Ayrılan yerin noktası ("sofa:0", "arm:1", "game:0", "lab:0"). */
  private perchSpot(key: string): Spot | undefined {
    const [kind, i] = key.split(':') as [string, string];
    return this.perchList(kind)[Number(i)];
  }

  /** Bu türdeki boş yerlerin anahtarları. */
  private freePerches(kind: 'sofa' | 'arm' | 'game' | 'lab'): string[] {
    const taken = new Set<string>();
    for (const x of this.actors.values()) if (x.perch) taken.add(x.perch);
    return this.perchList(kind)
      .map((_, i) => `${kind}:${i}`)
      .filter((k) => !taken.has(k));
  }

  /** Etkinlik bitip masaya dönünce bir süre oturur (hemen yenisine kalkmasın). */
  private rest(a: Actor): Task {
    return { t: 'done', fn: () => (a.nextIdleAt = this.time + this.rand(6_000, 16_000)) };
  }

  /** Dinlenme alanında bir yere gidip oturur, bir süre kalır (konsoldaysa oynar), sonra masasına döner. */
  private visitPerch(a: Actor, key: string, script: Script, ms: number): void {
    const spot = this.perchSpot(key)!;
    const stay: Task[] =
      script === 'console'
        ? [
            { t: 'wait', ms: 0, holding: 'controller' },
            { t: 'wait', ms, pastime: 'console' },
            { t: 'wait', ms: 0, holding: null },
          ]
        : [{ t: 'wait', ms }];
    this.run(a, script, [
      { t: 'stand' },
      { t: 'walk', to: spot.approach ?? spot },
      { t: 'sitAt', spot, pose: 'sofa' },
      ...stay,
      { t: 'stand' },
      ...this.walkHome(),
      this.rest(a),
    ]);
    a.perch = key;
  }

  /**
   * Boştaki karakterin (ana oturum ya da çalışmayan ekip üyesi) ara sıra yaptıkları: masada video izlemek ya da
   * oyun oynamak, konsolda oyun, kanepe ya da koltukta dinlenmek, kahve, gerinmek. Uzun süredir boştaysa
   * çoğunlukla dinlenme alanına gider. Hareketi azalt açıkken hiçbiri olmaz.
   */
  private idleTick(a: Actor): void {
    if (this.reducedMotion || a.status !== 'idle' || !(a.kind === 'session' || a.resident)) return;
    if (a.script || !a.atHome || a.idleSince === null || this.time < a.nextIdleAt) return;
    a.nextIdleAt = this.time + this.rand(10_000, 25_000);
    const plan = this.plan!;
    const long = this.time - a.idleSince >= SOFA_AFTER_MS;
    const sofa = this.freePerches('sofa');
    const arm = this.freePerches('arm');
    const game = this.freePerches('game');
    const lab = this.freePerches('lab');
    // Biri konsolda oynuyorsa yanına oturmak daha çekici (iki kişilik oyun).
    const someonePlaying = game.length < plan.gameSeats.length;
    const options: [weight: number, act: () => void][] = [
      [long ? 1 : 3, () => this.atDesk(a, 'video', this.rand(20_000, 45_000))],
      [long ? 1 : 2, () => this.atDesk(a, 'pcgame', this.rand(15_000, 35_000))],
      [
        game.length ? (someonePlaying ? 5 : 3) + (long ? 2 : 0) : 0,
        () => this.visitPerch(a, this.pick(game), 'console', this.rand(25_000, 55_000)),
      ],
      [
        sofa.length ? (long ? 5 : 1.5) : 0,
        () => this.visitPerch(a, this.pick(sofa), 'sofa', this.rand(30_000, 80_000)),
      ],
      [
        arm.length ? (long ? 2 : 1) : 0,
        () => this.visitPerch(a, this.pick(arm), 'lounge', this.rand(20_000, 45_000)),
      ],
      [lab.length ? (long ? 0.5 : 2) : 0, () => this.tinker(a, this.rand(18_000, 40_000))],
      [this.coffeeBusy === null ? 2 : 0, () => this.coffee(a)],
      [1, () => this.run(a, 'stretch', [{ t: 'wait', ms: 2600, gesture: 'stretch' }, { t: 'done' }])],
    ];
    const total = options.reduce((n, [w]) => n + w, 0);
    let r = this.random() * total;
    for (const [w, act] of options) {
      if (w <= 0) continue;
      r -= w;
      if (r <= 0) return act();
    }
    options[options.length - 1]![1]();
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.min(list.length - 1, Math.floor(this.random() * list.length))]!;
  }

  /** Deney masasına gidip ayakta kurcalar (lehim, robot kol, drone), sonra masasına döner. */
  private tinker(a: Actor, ms: number): void {
    const spot = this.plan!.zones.tech.labSpot;
    this.run(a, 'lab', [
      { t: 'stand' },
      { t: 'walk', to: spot },
      { t: 'face', heading: spot.heading },
      { t: 'wait', ms, pastime: 'lab' },
      { t: 'done', fn: () => (a.perch = a.perch === 'lab:0' ? null : a.perch) },
      ...this.walkHome(),
      this.rest(a),
    ]);
    a.perch = 'lab:0';
  }

  /** Masasından kalkmadan: video izler ya da bilgisayarda oyun oynar (ekran buna göre değişir). */
  private atDesk(a: Actor, pastime: 'video' | 'pcgame', ms: number): void {
    this.run(a, pastime, [{ t: 'wait', ms, pastime }, this.rest(a)]);
  }

  private coffee(a: Actor): void {
    const plan = this.plan!;
    this.run(a, 'coffee', [
      { t: 'stand' },
      { t: 'walk', to: plan.coffee },
      { t: 'face', heading: plan.coffee.heading },
      { t: 'wait', ms: 3200, bubble: 'coffee' },
      { t: 'done', fn: () => (this.coffeeBusy = this.coffeeBusy === a.id ? null : this.coffeeBusy) },
      { t: 'wait', ms: 0, holding: 'mug' },
      ...this.walkHome(),
      // kahvesini içerken çoğu zaman bir video da açar
      this.random() < 0.5
        ? { t: 'wait', ms: 9000, holding: 'mug', pastime: 'video' }
        : { t: 'wait', ms: 7000, holding: 'mug' },
      { t: 'wait', ms: 0, holding: null },
      this.rest(a),
    ]);
    this.coffeeBusy = a.id;
  }

  // ---------- adım ----------

  /** Simülasyonu `dt` saniye ilerletir. */
  step(dt: number): void {
    const d = Math.min(dt, 0.25);
    this.time += d * 1000;
    for (const a of this.actors.values()) {
      if (a.gone) continue;
      this.idleTick(a);
      this.runTasks(a, d);
      this.updateStanding(a);
      // yumuşak dönüş
      let diff = a.targetHeading - a.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.heading += diff * (1 - Math.exp(-(this.reducedMotion ? 30 : 9) * d));
    }
  }

  /** "Seni bekliyor": masasında ayağa kalkıp kameraya döner ve el sallar. */
  private updateStanding(a: Actor): void {
    if (a.script || !a.atHome) return;
    const asking = a.status === 'asking';
    a.faceCamera = asking;
    a.gesture = asking ? 'wave' : a.gesture === 'wave' ? 'none' : a.gesture;
    a.pose = asking ? 'stand' : 'sit';
    if (!asking) {
      const h = this.home(a.id);
      if (h) a.targetHeading = h.heading;
    }
  }

  private runTasks(a: Actor, dt: number): void {
    let budget = 8; // aynı karede art arda biten anlık görevler
    while (budget-- > 0) {
      const task = a.tasks[0];
      if (!task) {
        if (a.script) {
          a.script = null;
          a.bubble = null;
          if (a.gesture !== 'wave') a.gesture = 'none';
        }
        a.speed = 0;
        return;
      }
      if (!this.runTask(a, task, dt)) return;
      a.tasks.shift();
    }
  }

  /** Görevi ilerletir; bittiyse true. */
  private runTask(a: Actor, task: Task, dt: number): boolean {
    switch (task.t) {
      case 'appear':
        a.x = task.at.x;
        a.z = task.at.z;
        a.heading = a.targetHeading = task.at.heading;
        a.visible = true;
        a.pose = 'stand';
        a.atHome = false;
        a.opacity = Math.min(1, a.opacity + dt * FADE_PER_SEC);
        return a.opacity >= 1;
      case 'hide':
        a.speed = 0;
        a.opacity = Math.max(0, a.opacity - dt * FADE_PER_SEC);
        if (a.opacity > 0) return false;
        a.visible = false;
        a.gone = true;
        a.atHome = false;
        a.tasks = [];
        a.script = null;
        a.holding = null;
        this.cleanup(a);
        a.perch = null;
        return false;
      case 'stand':
        if (a.pose === 'sofa' && a.perch !== null) {
          // kanepeden, koltuktan ya da armut koltuktan kalkınca önce önündeki boş noktaya
          const spot = this.perchSpot(a.perch);
          if (spot?.approach) {
            a.x = spot.approach.x;
            a.z = spot.approach.z;
          }
          a.perch = null;
        }
        a.pose = 'stand';
        a.atHome = false;
        a.faceCamera = false;
        return true;
      case 'walk':
        return this.walk(a, task, dt);
      case 'sitHome': {
        const h = this.home(a.id);
        if (!h) return true;
        a.x = h.x;
        a.z = h.z;
        a.targetHeading = h.heading;
        a.pose = 'sit';
        a.atHome = true;
        a.speed = 0;
        return true;
      }
      case 'sitAt':
        a.x = task.spot.x;
        a.z = task.spot.z;
        a.targetHeading = task.spot.heading;
        a.pose = task.pose;
        a.speed = 0;
        return true;
      case 'face':
        a.targetHeading = typeof task.heading === 'function' ? task.heading() : task.heading;
        return true;
      case 'wait':
        if (task.bubble !== undefined) a.bubble = task.bubble;
        if (task.gesture !== undefined) a.gesture = task.gesture;
        if (task.holding !== undefined) a.holding = task.holding;
        if (task.pastime !== undefined) a.pastime = task.pastime;
        task.elapsed = (task.elapsed ?? 0) + dt * 1000;
        if (task.elapsed < task.ms) return false;
        if (task.bubble) a.bubble = null;
        if (task.gesture) a.gesture = 'none';
        if (task.pastime) a.pastime = null;
        return true;
      case 'waitFor':
        task.elapsed = (task.elapsed ?? 0) + dt * 1000;
        return task.cond() || task.elapsed >= task.timeoutMs;
      case 'meet':
        return this.meet(a, task, dt);
      case 'done':
        task.fn?.();
        return true;
    }
  }

  private walk(a: Actor, task: Extract<Task, { t: 'walk' }>, dt: number): boolean {
    if (!task.path) {
      let to = typeof task.to === 'function' ? task.to() : task.to;
      if (!to) to = this.home(a.id) ?? null; // eve dönüş
      if (!to) return true;
      if (this.reducedMotion) {
        task.path = [to];
      } else {
        task.path = findPath(this.plan!.grid, a, to) ?? [to];
      }
      a.pose = 'walk';
      a.atHome = false;
    }
    if (this.reducedMotion) {
      // Yürümek yerine: sol, yerini değiştir, belir.
      const target = task.path[task.path.length - 1]!;
      if (a.x !== target.x || a.z !== target.z) {
        a.opacity = Math.max(0, a.opacity - dt * FADE_PER_SEC * 1.5);
        if (a.opacity > 0) return false;
        a.x = target.x;
        a.z = target.z;
        a.pose = 'stand';
        return false;
      }
      a.opacity = Math.min(1, a.opacity + dt * FADE_PER_SEC * 1.5);
      return a.opacity >= 1;
    }
    let remaining = WALK_SPEED * dt;
    while (remaining > 0 && task.path.length > 0) {
      const next = task.path[0]!;
      const dx = next.x - a.x;
      const dz = next.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4) a.targetHeading = Math.atan2(dx, dz);
      if (dist <= remaining) {
        a.x = next.x;
        a.z = next.z;
        remaining -= dist;
        task.path.shift();
      } else {
        a.x += (dx / dist) * remaining;
        a.z += (dz / dist) * remaining;
        remaining = 0;
      }
    }
    a.speed = WALK_SPEED;
    a.pose = 'walk';
    if (task.path.length > 0) return false;
    a.speed = 0;
    a.pose = 'stand';
    return true;
  }

  /** İki karakter karşılıklı durur, balonla konuşur. Karşıdaki masasındaysa ayağa kalkıp döner. */
  private meet(a: Actor, task: Extract<Task, { t: 'meet' }>, dt: number): boolean {
    const other = this.actors.get(task.other);
    if (!task.started) {
      task.started = true;
      a.pose = 'stand';
      if (other && !other.gone && other.visible) {
        a.targetHeading = headingTo(a, other);
        const free =
          !other.script ||
          other.script === 'stretch' ||
          other.script === 'host' ||
          other.script === 'video' ||
          other.script === 'pcgame';
        if (free && other.atHome) {
          this.cleanup(other);
          other.script = 'host';
          other.tasks = [
            { t: 'stand' },
            { t: 'face', heading: () => headingTo(other, a) },
            { t: 'wait', ms: 350 },
            { t: 'wait', ms: task.ms - 350, bubble: task.icon, gesture: 'talk' },
            { t: 'sitHome' },
          ];
        }
      }
    }
    task.elapsed = (task.elapsed ?? 0) + dt * 1000;
    a.bubble = task.icon;
    a.gesture = 'talk';
    if (task.elapsed < task.ms) return false;
    a.bubble = null;
    a.gesture = 'none';
    return true;
  }
}
