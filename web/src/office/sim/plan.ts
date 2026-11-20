import type { Agent, AgentRole, TeamMember } from '../../../../shared/types.ts';
import { WalkGrid, findPath, type Point } from './pathfinding.ts';

/**
 * Tek bir projenin büyük ofisinin kat planı. Saf fonksiyon: aynı girdi → aynı plan.
 *
 * Koordinatlar (m): x sağa, z öne (kameraya doğru). Arka duvar z=0 (pencereler), sol duvar x=0 (kapı),
 * sağ duvar x=width. Ön tarafta duvar yok (kesit görünüm).
 *
 *   x=0                                                     x=width
 *   ┌────────────┬───────── pencereler ─────────┬────────────┐ z=0
 *   │ toplantı   │  [ada 1]          [ada 2]    │ lider      │
 *   │ odası (cam)│                              │ köşesi     │
 *   │            │  [ada 3]          [ada 4]    │ beyaz tahta│
 *   │ mutfak     │                              │ kitaplık   │
 *   │ kapı ⇥     │  …                           │ kanepe     │
 *   └────────────┴──────────────────────────────┴────────────┘ z=depth
 */

export const CELL = 0.5;
export const SIDE_W = 6;
export const DESK_W = 1.6;
export const DESK_D = 0.8;
/** Lider köşe masasının genişliği. */
export const LEAD_DESK_W = 2.2;
export const DESK_PITCH = 1.7;
/** Masa merkezinden sandalyedeki kişiye uzaklık (masanın yerel +z yönünde). */
export const SEAT_OFFSET = 0.72;
/** Bir adadaki en fazla masa. Fazlası aynı rolün ikinci adasına gider. */
export const ISLAND_MAX = 8;
const ISLAND_MIN = 4;
const SLOT_W = DESK_PITCH * 4 + 1.6;
const SLOT_D = 4.8;
const FIRST_ROW_Z = 3.0;
/** Arka duvarın ortasındaki marka duvarının genişliği (m). */
export const BRAND_WALL_W = 5;
/** Adalardaki sütun yerleri (merkezden): 2 sütun ortalı başlar, 3 ve 4'te iki yana büyür. */
const COL_ORDER = [-0.5, 0.5, -1.5, 1.5];
/** Adaların ızgaradaki sırası (sabit): yeni rol geldiğinde var olan adalar yerinden oynamaz. */
const ROLE_ORDER: readonly AgentRole[] = [
  'developer',
  'designer',
  'tester',
  'reviewer',
  'researcher',
  'architect',
  'other',
  'lead',
];

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Seat {
  id: string;
  role: AgentRole;
  /** Masa merkezi ve dönüşü (rotation.y). Masa yerel -z yönünde monitör, +z yönünde sandalye vardır. */
  deskX: number;
  deskZ: number;
  deskRot: number;
  /** Sandalyedeki kişinin yeri ve baktığı yön (rotation.y; karakter yerel +z'ye bakar). */
  x: number;
  z: number;
  heading: number;
  kind: 'desk' | 'lead-corner';
  /** Ekip listesindeki üyeye ayrılmışsa üyenin adı. */
  member?: string;
  /** Kişisel eşyalar için tohum. */
  variant: number;
}

export interface Island {
  id: string;
  role: AgentRole;
  /** Adanın merkezi (sütun yerleri buna göre). */
  x: number;
  z: number;
  /** Kullanılan sütun sayısı (2–4). */
  cols: number;
  seatIds: string[];
}

/** Oturma yeri olmayan, karakterin durduğu/oturduğu özel nokta (kahve makinesi, kanepe). */
export interface Spot extends Point {
  heading: number;
  /** Oturulacaksa yürünecek son boş nokta; oturma yeri bundan bir adım ötededir. */
  approach?: Point;
}

export interface OfficeZones {
  meeting: Rect;
  /** Toplantı odasının kapı boşluğu (güney cam duvarda, x aralığı). */
  meetingDoor: { x0: number; x1: number };
  kitchen: Rect;
  leadCorner: Rect;
  lounge: Rect;
  whiteboard: Rect;
  bookshelf: Rect;
  /** Kapı: sol duvarda, z merkezli. */
  door: { z: number; width: number };
  /** Arka duvarın ortasındaki dolu marka duvarı (x aralığı; pencereler iki yanında). */
  brandWall: { x0: number; x1: number };
  /** Kapının yanındaki karşılama totemi ve portmanto. */
  totem: Point;
  coatRack: Point;
  /** Dinlenme alanında kanepeye bakan iki koltuk ve aralarındaki yan sehpa. */
  armchairs: Spot[];
  sideTable: Point;
  /** Oyun köşesi: dinlenme alanının kuzeyinde TV sehpası (ekran +z'ye, kameraya bakar) ve önünde iki armut koltuk. */
  tv: Spot;
  beanbags: Point[];
  /** Teknoloji şirketi eşyaları (Sürüm 5); hepsi ada alanının dışında. */
  tech: TechZones;
}

export interface TechZones {
  /** Cam duvarlı sunucu odası (sol şerit); dolapların önü +z'ye (kameraya) bakar. */
  server: Rect;
  /** Ayaklı büyük duvar panosu (sağ şerit); ekran +z'ye bakar. */
  dashboard: Spot;
  /** Derleme lambası direği (panonun yanında). */
  stackLight: Point;
  /** Tekerlekli kanban panosu (sol şerit, girişe yakın); yüzü +z'ye bakar. */
  kanban: Spot;
  /** Donanım/deney masası (sağ şerit). */
  labBench: Spot;
  /** Deney masasında çalışanın durduğu yer (masaya ve kameraya, +z'ye bakar). */
  labSpot: Spot;
  /** Atıştırmalık rafı: toplantı odasının cam duvarının önünde, +z'ye bakar. */
  snackShelf: Spot;
  /** Sol duvardaki yosun duvarı (z aralığı). */
  mossWall: { z0: number; z1: number };
}

export interface OfficePlan {
  project: string;
  width: number;
  depth: number;
  seats: Seat[];
  islands: Island[];
  /** agentId → seatId */
  assignment: Map<string, string>;
  zones: OfficeZones;
  /** Kapının hemen içi (giriş/çıkış noktası). */
  door: Spot;
  coffee: Spot;
  sofaSeats: Spot[];
  /** Koltuklarda oturma yerleri (boşta dinlenme). */
  armchairSeats: Spot[];
  /** Oyun köşesindeki armut koltuklar: TV'ye bakarak oturulur. */
  gameSeats: Spot[];
  /** Tavan lambaları (sarkıt) ve sıcak ışıklar. */
  lamps: {
    x: number;
    z: number;
    kind: 'island' | 'zone';
    zone?: 'kitchen' | 'lounge' | 'lead' | 'meeting';
  }[];
  plants: { x: number; z: number; size: number }[];
  /**
   * Adaların taşınabileceği alan. buildPlan kayıtlı konumları bu alanla denetler; düzenleyici de aynısını
   * kullanmalı (oda derinliği adalara göre büyüyebildiği için `depth`'ten yeniden hesaplanmaz).
   */
  area: Rect;
  grid: WalkGrid;
  /** Geometri değişti mi diye karşılaştırmak için (oda boyutu + adalar). */
  shapeKey: string;
}

/** Kullanıcının taşıdığı adaların merkezleri (ada kimliği → konum). */
export type IslandLayout = Readonly<Record<string, { x: number; z: number }>>;

/** Düzenleyicide adalar bu adımla ızgaraya oturur (m). */
export const LAYOUT_SNAP = 0.5;
/** Adalar arasında en az bu kadar boş koridor kalır (m). */
export const AISLE = 0.9;
/** Ada izinin masa kenarından sandalye arkasına kadar yarı derinliği. */
const ISLAND_HALF_D = DESK_D + 0.02 + SEAT_OFFSET + 0.35;
/** Test uzmanı panosu adanın sağında yer kaplar. */
const TESTER_BOARD_PAD = 0.8;

export interface PlanInput {
  project: string;
  /** Bu projenin görünen ajanları (ana oturumlar + yardımcılar). */
  agents: readonly Agent[];
  team: readonly TeamMember[];
  /** Önceki plan: masa atamaları ve adalar korunur. */
  previous?: OfficePlan | null;
  /** Kullanıcının taşıdığı adalar. Geçersiz konumlar (oda dışı, çakışma) yok sayılır. */
  layout?: IslandLayout;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Yerel (x,z) noktayı y ekseni etrafında `rot` kadar döndürüp ekler (three.js rotation.y ile aynı yön). */
export function localToWorld(cx: number, cz: number, rot: number, lx: number, lz: number): Point {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return { x: cx + lx * cos + lz * sin, z: cz - lx * sin + lz * cos };
}

/** rotation.y = h olan karakterin baktığı yön birim vektörü. */
export function facing(h: number): Point {
  return { x: Math.sin(h), z: Math.cos(h) };
}

/** Bir noktadan diğerine bakan rotation.y. */
export function headingTo(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function deskSeat(
  id: string,
  role: AgentRole,
  deskX: number,
  deskZ: number,
  deskRot: number,
  kind: Seat['kind'] = 'desk',
): Seat {
  const p = localToWorld(deskX, deskZ, deskRot, 0, SEAT_OFFSET);
  return {
    id,
    role,
    deskX,
    deskZ,
    deskRot,
    x: p.x,
    z: p.z,
    heading: deskRot + Math.PI,
    kind,
    variant: hash(id),
  };
}

/** Türkçe harfleri sadeleştirip küçük harfe çevirir ("Geliştirici" → "gelistirici"). */
export function plain(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/**
 * Yardımcının ekip üyesi: türü üyenin adıysa o üye; değilse (genel tür) iş tanımı üyenin adıyla başlıyorsa
 * ("Geliştirici: düşük güç modu" → gelistirici) ve rolü üyenin rolüyle aynıysa. `byName` anahtarları
 * `plain(üye adı)` olmalı (bkz. memberNameMap).
 */
export function memberFor(sub: Agent, byName: ReadonlyMap<string, TeamMember>): TeamMember | undefined {
  if (sub.agentType) {
    const m = byName.get(plain(sub.agentType));
    if (m) return m;
  }
  const first = plain(sub.name).split(/[^a-z0-9-]+/)[0];
  const m = first ? byName.get(first) : undefined;
  return m && m.role === sub.role ? m : undefined;
}

/** memberFor için ad → üye haritası (anahtar: Türkçe harfleri sadeleştirilmiş küçük harfli ad). */
export function memberNameMap(team: readonly TeamMember[]): Map<string, TeamMember> {
  return new Map(team.map((m) => [plain(m.name), m]));
}

export function buildPlan(input: PlanInput): OfficePlan {
  const { agents, team, previous } = input;
  const prevSeatOf = new Map<string, Seat>();
  if (previous && previous.project === input.project) {
    for (const [agentId, seatId] of previous.assignment) {
      const seat = previous.seats.find((s) => s.id === seatId);
      if (seat) prevSeatOf.set(agentId, seat);
    }
  }

  // --- 1) Kim nereye: liderler, ekip üyeleri, yardımcılar ---
  const sessions = agents
    .filter((a) => a.kind === 'session')
    .sort((a, b) => {
      // Önceki planda köşede oturan yerini korusun.
      const pa = prevSeatOf.get(a.id)?.id ?? '~';
      const pb = prevSeatOf.get(b.id)?.id ?? '~';
      return pa.localeCompare(pb) || a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id);
    });
  const subs = agents
    .filter((a) => a.kind === 'subagent')
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.id.localeCompare(b.id));
  const members = [...team].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const memberNames = memberNameMap(members);

  /** rol → bu rolde masa isteyenler: ekip üyeleri (ad) ve ekip masası olmayan yardımcılar (id). */
  const demand = new Map<AgentRole, { members: TeamMember[]; subs: Agent[] }>();
  const want = (role: AgentRole) => {
    let d = demand.get(role);
    if (!d) demand.set(role, (d = { members: [], subs: [] }));
    return d;
  };
  for (const m of members) want(m.role === 'lead' ? 'other' : m.role).members.push(m);
  const memberTaken = new Set<string>();
  const subToMember = new Map<string, TeamMember>();
  for (const s of subs) {
    const m = memberFor(s, memberNames);
    if (m && !memberTaken.has(m.name)) {
      memberTaken.add(m.name);
      subToMember.set(s.id, m);
    } else want(s.role === 'lead' ? 'other' : s.role).subs.push(s);
  }
  const extraLeads = sessions.slice(2);
  for (const s of extraLeads) want('lead').subs.push(s);

  // --- 2) Adalar: önceki adalar yerinde kalır, yeni roller sona eklenir ---
  const islandSpecs: { role: AgentRole; part: number }[] = [];
  if (previous && previous.project === input.project) {
    for (const isl of previous.islands) {
      const [role, part] = [isl.role, Number(isl.id.split('#')[1] ?? 0)];
      islandSpecs.push({ role, part });
    }
  }
  const needed = new Map<AgentRole, number>();
  for (const [role, d] of demand) needed.set(role, d.members.length + d.subs.length);
  // Ofis çok boş görünmesin: en az iki ada (geliştirici + bir rol daha).
  if (needed.size === 0) needed.set('developer', 0);
  if (needed.size === 1) {
    const extra = ROLE_ORDER.find((r) => r !== 'lead' && !needed.has(r))!;
    needed.set(extra, 0);
  }
  for (const role of ROLE_ORDER) {
    const n = needed.get(role);
    if (n === undefined) continue;
    const parts = Math.max(1, Math.ceil(n / ISLAND_MAX));
    for (let part = 0; part < parts; part++)
      if (!islandSpecs.some((s) => s.role === role && s.part === part)) islandSpecs.push({ role, part });
  }

  const rows = Math.max(1, Math.ceil(islandSpecs.length / 2));
  const width = SIDE_W * 2 + SLOT_W * 2;
  const baseDepth = Math.max(16, FIRST_ROW_Z + (rows - 1) * SLOT_D + 1.45 + 3.2);

  // --- 3) Adaların yeri: önce kullanıcının taşıdıkları (geçerliyse), sonra diğerleri kendi yuvasına ya da
  //        ilk boş yuvaya. Böylece taşınan ada başka bir adanın üstüne düşmez, yeni adalar boş yere gelir. ---
  const specs = islandSpecs.map((spec) => {
    const id = `${spec.role}#${spec.part}`;
    const total = needed.get(spec.role) ?? 0;
    const inThis = Math.max(0, Math.min(ISLAND_MAX, total - spec.part * ISLAND_MAX));
    const prevIsland = previous?.islands.find((x) => x.id === id);
    const count = Math.max(ISLAND_MIN, Math.ceil(inThis / 2) * 2, prevIsland?.seatIds.length ?? 0);
    return { ...spec, id, cols: Math.min(4, count / 2) };
  });
  const area = islandArea(width, baseDepth);
  const placedAt = new Map<string, Point>();
  const footprints: Rect[] = [];
  const fits = (spec: (typeof specs)[number], x: number, z: number) => {
    const f = islandFootprint({ x, z, cols: spec.cols, role: spec.role });
    return footprints.every((o) => !rectsTouch(f, o, AISLE)) ? f : null;
  };
  for (const spec of specs) {
    const want = input.layout?.[spec.id];
    if (!want || !Number.isFinite(want.x) || !Number.isFinite(want.z)) continue;
    const f = fits(spec, want.x, want.z);
    if (f && rectInside(f, area)) {
      placedAt.set(spec.id, { x: want.x, z: want.z });
      footprints.push(f);
    }
  }
  const slot = (n: number): Point => ({
    x: SIDE_W + SLOT_W * ((n % 2) + 0.5),
    z: FIRST_ROW_Z + Math.floor(n / 2) * SLOT_D,
  });
  specs.forEach((spec, i) => {
    if (placedAt.has(spec.id)) return;
    for (let n = 0; ; n++) {
      const p = slot(n === 0 ? i : n - 1);
      const f = fits(spec, p.x, p.z);
      if (f) {
        placedAt.set(spec.id, p);
        footprints.push(f);
        return;
      }
    }
  });
  const depth = Math.max(baseDepth, ...footprints.map((f) => f.z1 + 2.8));

  // --- 4) Masalar ---
  const seats: Seat[] = [];
  const islands: Island[] = [];
  specs.forEach((spec) => {
    const { x: cx, z: cz } = placedAt.get(spec.id)!;
    const { role, cols } = spec;
    const island: Island = { id: spec.id, role, x: cx, z: cz, cols, seatIds: [] };
    for (let k = 0; k < cols * 2; k++) {
      const c = Math.floor(k / 2);
      const south = k % 2 === 0; // önce kameraya sırtı dönük (ekranı görünen) sıra
      const dx = cx + COL_ORDER[c]! * DESK_PITCH;
      const dz = south ? cz + DESK_D / 2 + 0.02 : cz - DESK_D / 2 - 0.02;
      const seat = deskSeat(`${island.id}:${k}`, role, dx, dz, south ? 0 : Math.PI);
      seats.push(seat);
      island.seatIds.push(seat.id);
    }
    islands.push(island);
  });

  // Lider köşesi: büyük köşe masa + yanında ikinci bir lider masası.
  const leadCorner: Rect = { x0: width - SIDE_W + 0.4, z0: 0, x1: width, z1: 5.2 };
  seats.push(deskSeat('lead-corner:0', 'lead', width - 3.2, 1.25, 0, 'lead-corner'));
  seats.push(deskSeat('lead-corner:1', 'lead', width - 1.15, 3.7, -Math.PI / 2));

  // --- 5) Atama ---
  const assignment = new Map<string, string>();
  const taken = new Set<string>();
  const seatById = new Map(seats.map((s) => [s.id, s]));
  const assign = (agentId: string, seatId: string) => {
    assignment.set(agentId, seatId);
    taken.add(seatId);
  };
  // Ekip üyelerinin masaları (ada sırasıyla)
  const memberSeat = new Map<string, string>();
  for (const role of ROLE_ORDER) {
    const d = demand.get(role);
    if (!d) continue;
    const roleSeats = islands.filter((x) => x.role === role).flatMap((x) => x.seatIds);
    // Önceki planda bu üyeye ayrılmış masa varsa koru.
    for (const m of d.members) {
      const prev = previous?.seats.find((s) => s.member === m.name && s.role === role);
      if (prev && seatById.has(prev.id) && !taken.has(prev.id)) {
        memberSeat.set(m.name, prev.id);
        taken.add(prev.id);
      }
    }
    for (const m of d.members) {
      if (memberSeat.has(m.name)) continue;
      const free = roleSeats.find((id) => !taken.has(id));
      if (free) {
        memberSeat.set(m.name, free);
        taken.add(free);
      }
    }
  }
  for (const [name, seatId] of memberSeat) seatById.get(seatId)!.member = name;

  // Liderler
  sessions.slice(0, 2).forEach((s, i) => assign(s.id, `lead-corner:${i}`));
  // Ekip masası olan yardımcılar
  for (const [subId, m] of subToMember) {
    const seatId = memberSeat.get(m.name);
    if (seatId) assignment.set(subId, seatId);
  }
  // Diğerleri: önceki masası hâlâ uygunsa o, değilse rolünün boş masası
  const rest = [...extraLeads, ...subs.filter((s) => !subToMember.has(s.id))];
  for (const a of rest) {
    const prev = prevSeatOf.get(a.id);
    if (prev && seatById.has(prev.id) && !taken.has(prev.id) && !seatById.get(prev.id)!.member) {
      assign(a.id, prev.id);
    }
  }
  for (const a of rest) {
    if (assignment.has(a.id)) continue;
    const role: AgentRole = a.kind === 'session' ? 'lead' : a.role === 'lead' ? 'other' : a.role;
    const free = islands
      .filter((x) => x.role === role)
      .flatMap((x) => x.seatIds)
      .find((id) => !taken.has(id) && !seatById.get(id)!.member);
    if (free) assign(a.id, free);
  }

  // --- 6) Bölgeler ---
  const loungeZ0 = depth - 4.6;
  const loungeZ1 = depth - 0.4;
  const lzMid = (loungeZ0 + loungeZ1) / 2;
  const zones: OfficeZones = {
    meeting: { x0: 0, z0: 0, x1: SIDE_W - 0.4, z1: 5.2 },
    meetingDoor: { x0: SIDE_W - 2.2, x1: SIDE_W - 1.0 },
    kitchen: { x0: 0, z0: 6.0, x1: 3.4, z1: 10.2 },
    leadCorner,
    whiteboard: { x0: width - 0.12, z0: 6.0, x1: width, z1: 8.6 },
    bookshelf: { x0: width - 0.45, z0: 9.0, x1: width, z1: 11.0 },
    lounge: { x0: width - SIDE_W + 0.6, z0: loungeZ0, x1: width, z1: loungeZ1 },
    door: { z: depth - 2.2, width: 1.4 },
    brandWall: { x0: width / 2 - BRAND_WALL_W / 2, x1: width / 2 + BRAND_WALL_W / 2 },
    totem: { x: 0.55, z: depth - 3.6 },
    coatRack: { x: 0.45, z: depth - 0.75 },
    armchairs: [-0.8, 0.8].map((dz) => ({ x: width - 4.15, z: lzMid + dz, heading: Math.PI / 2 })),
    sideTable: { x: width - 4.2, z: lzMid },
    tv: { x: width - 2.7, z: depth - 5.25, heading: 0 },
    beanbags: [width - 3.15, width - 2.25].map((x) => ({ x, z: depth - 3.8 })),
    tech: {
      server: { x0: 3.7, x1: 6.2, z0: 9.6, z1: 11.8 },
      dashboard: { x: width - 3.8, z: 6.1, heading: 0 },
      stackLight: { x: width - 2.15, z: 6.1 },
      kanban: { x: 4.6, z: 13.0, heading: 0 },
      labBench: { x: width - 3.4, z: 9.2, heading: 0 },
      labSpot: { x: width - 3.4, z: 8.4, heading: 0 },
      snackShelf: { x: 1.15, z: 5.5, heading: 0 },
      mossWall: { z0: 10.5, z1: 12.2 },
    },
  };
  const door: Spot = { x: 0.7, z: zones.door.z, heading: Math.PI / 2 };
  const coffee: Spot = { x: 1.35, z: 7.0, heading: -Math.PI / 2 };
  const loungeZ = (zones.lounge.z0 + zones.lounge.z1) / 2;
  const sofaSeats: Spot[] = [-0.75, 0, 0.75].map((dz) => ({
    x: width - 0.85,
    z: loungeZ + dz,
    heading: -Math.PI / 2,
    approach: { x: width - 1.85, z: loungeZ + dz },
  }));
  // Koltuklara dış yanlarından (kuzeydekine kuzeyden, güneydekine güneyden) yaklaşılır.
  const armchairSeats: Spot[] = zones.armchairs.map((a) => ({
    ...a,
    approach: { x: a.x, z: a.z + (a.z < lzMid ? -0.75 : 0.75) },
  }));
  // Armut koltuklara arkalarından (TV ile koltuk arasından) yaklaşılır; oturan TV'ye (-z) bakar.
  const gameSeats: Spot[] = zones.beanbags.map((b) => ({
    x: b.x,
    z: b.z,
    heading: Math.PI,
    approach: { x: b.x, z: b.z - 0.62 },
  }));

  const lamps: OfficePlan['lamps'] = islands.map((x) => ({ x: x.x, z: x.z, kind: 'island' as const }));
  lamps.push(
    { x: 3.2, z: 8.0, kind: 'zone', zone: 'kitchen' },
    { x: width - 3.2, z: loungeZ, kind: 'zone', zone: 'lounge' },
    { x: width - 3.0, z: 2.4, kind: 'zone', zone: 'lead' },
    { x: (zones.meeting.x0 + zones.meeting.x1) / 2, z: 2.6, kind: 'zone', zone: 'meeting' },
  );
  const plants = [
    { x: SIDE_W + 0.45, z: 0.45, size: 1.2 },
    { x: width - SIDE_W + 0.2, z: 0.45, size: 1 },
    { x: width - 0.45, z: 5.4, size: 0.9 },
    { x: width - SIDE_W + 1.0, z: depth - 0.6, size: 1.1 },
    // marka duvarının iki yanı
    { x: zones.brandWall.x0 - 0.45, z: 0.5, size: 0.9 },
    { x: zones.brandWall.x1 + 0.45, z: 0.5, size: 0.9 },
  ];

  // --- 7) Yürüme ızgarası ---
  const grid = WalkGrid.covering(0, width, 0, depth, CELL);
  // dış kenar (duvarlar)
  grid.blockRect(width / 2, 0.12, width, 0.3);
  grid.blockRect(0.12, depth / 2, 0.3, depth);
  grid.blockRect(width - 0.12, depth / 2, 0.3, depth);
  for (const s of seats) {
    const w = s.kind === 'lead-corner' ? LEAD_DESK_W : DESK_W;
    grid.blockRect(s.deskX, s.deskZ, w + 0.2, DESK_D + 0.2 + (s.kind === 'lead-corner' ? 0.2 : 0), s.deskRot);
  }
  // lider köşe masasının L kolu ve büyük ekran rafı
  grid.blockRect(width - 4.6, 2.0, 0.8, 1.6);
  // oyuncu kasası (masanın sağ yanı)
  grid.blockRect(width - 1.8, 1.23, 0.5, 0.7);
  // toplantı odası: cam duvarlar (kapı boşluğu hariç) ve masa
  const m = zones.meeting;
  grid.blockRect(m.x1, (m.z0 + m.z1) / 2, 0.2, m.z1 - m.z0);
  grid.blockRect((m.x0 + zones.meetingDoor.x0) / 2, m.z1, zones.meetingDoor.x0 - m.x0, 0.2);
  grid.blockRect((zones.meetingDoor.x1 + m.x1) / 2, m.z1, m.x1 - zones.meetingDoor.x1, 0.2);
  grid.blockRect((m.x0 + m.x1) / 2, 2.4, 3.6, 2.2);
  // mutfak: tezgah, buzdolabı, bar masası ve tabureler
  grid.blockRect(0.45, 8.0, 0.9, 4.0);
  grid.blockRect(2.6, 8.6, 1.2, 1.6);
  // beyaz tahta ve kitaplık
  grid.blockRect(width - 0.25, 7.3, 0.5, 2.6);
  grid.blockRect(width - 0.3, 10.0, 0.6, 2.0);
  // kanepe köşesi: kanepe, sehpa, lambader
  grid.blockRect(width - 0.85, loungeZ, 1.1, 2.6);
  grid.blockRect(width - 2.9, loungeZ, 0.9, 1.4);
  for (const p of plants) grid.blockRect(p.x, p.z, 0.6, 0.6);
  // giriş: totem ve portmanto; dinlenme alanı: koltuklar, yan sehpa, oyun köşesi (TV sehpası, armut koltuklar)
  grid.blockRect(zones.totem.x, zones.totem.z, 0.5, 0.5);
  grid.blockRect(zones.coatRack.x, zones.coatRack.z, 0.5, 0.5);
  for (const a of zones.armchairs) grid.blockRect(a.x, a.z, 0.85, 0.85);
  grid.blockRect(zones.sideTable.x, zones.sideTable.z, 0.6, 0.6);
  grid.blockRect(zones.tv.x, zones.tv.z, 1.7, 0.45);
  for (const b of zones.beanbags) grid.blockRect(b.x, b.z, 0.7, 0.7);
  // teknoloji eşyaları: sunucu odası, pano ve derleme lambası, kanban, deney masası, atıştırmalık rafı
  const t = zones.tech;
  grid.blockRect(
    (t.server.x0 + t.server.x1) / 2,
    (t.server.z0 + t.server.z1) / 2,
    t.server.x1 - t.server.x0,
    t.server.z1 - t.server.z0,
  );
  grid.blockRect(t.dashboard.x, t.dashboard.z, 2.5, 0.5);
  grid.blockRect(t.stackLight.x, t.stackLight.z, 0.4, 0.4);
  grid.blockRect(t.kanban.x, t.kanban.z, 2.0, 0.5);
  grid.blockRect(t.labBench.x, t.labBench.z, 2.7, 0.9);
  grid.blockRect(t.snackShelf.x, t.snackShelf.z, 1.7, 0.5);
  // test uzmanı panosu: adanın yanında
  for (const isl of islands)
    if (isl.role === 'tester') {
      const b = testerBoardOf(isl);
      grid.blockRect(b.x, b.z, 0.4, 1.0);
    }
  // oturma yerleri ve özel noktalar her zaman boş kalsın
  for (const s of seats) grid.setAt(s, 0);
  grid.setAt(door, 0);
  grid.setAt(coffee, 0);
  for (const s of [...sofaSeats, ...armchairSeats, ...gameSeats]) grid.setAt(s.approach!, 0);
  grid.setAt(t.labSpot, 0);

  const shapeKey = `${width}x${depth}|${islands.map((x) => `${x.id}/${x.cols}@${x.x},${x.z}`).join(',')}`;
  return {
    project: input.project,
    width,
    depth,
    seats,
    islands,
    assignment,
    zones,
    door,
    coffee,
    sofaSeats,
    armchairSeats,
    gameSeats,
    lamps,
    plants,
    area,
    grid,
    shapeKey,
  };
}

/** İki dikdörtgen arada `gap`'ten az boşlukla değiyor ya da çakışıyor mu. */
function rectsTouch(a: Rect, b: Rect, gap: number): boolean {
  gap -= 1e-6; // tam koridor genişliği yeterli (kayan nokta payı)
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;
}

function rectInside(r: Rect, area: Rect): boolean {
  return r.x0 >= area.x0 - 1e-6 && r.x1 <= area.x1 + 1e-6 && r.z0 >= area.z0 - 1e-6 && r.z1 <= area.z1 + 1e-6;
}

/**
 * Adaların taşınabileceği alan: toplantı odası/mutfak ile lider köşesi/kanepe arasındaki orta bölge; arka
 * duvardaki bitkilerden ve ön kenardan pay bırakılır.
 */
export function islandArea(width: number, depth: number): Rect {
  return { x0: SIDE_W + 0.5, x1: width - SIDE_W + 0.4, z0: 1.0, z1: depth - 0.4 };
}

/** Adanın kapladığı yer: masalar, sandalyeler ve (test uzmanında) yanındaki pano. */
export function islandFootprint(island: Pick<Island, 'x' | 'z' | 'cols' | 'role'>): Rect {
  const cols = COL_ORDER.slice(0, island.cols);
  const left = island.x + Math.min(...cols) * DESK_PITCH - DESK_W / 2;
  const right = island.x + Math.max(...cols) * DESK_PITCH + DESK_W / 2;
  return {
    x0: left,
    x1: right + (island.role === 'tester' ? TESTER_BOARD_PAD : 0),
    z0: island.z - ISLAND_HALF_D,
    z1: island.z + ISLAND_HALF_D,
  };
}

/** Değeri düzenleyici ızgarasına oturtur. */
export function snapToLayout(v: number): number {
  return Math.round(v / LAYOUT_SNAP) * LAYOUT_SNAP;
}

/** Ada (x, z)'ye taşınabilir mi: alanın içinde ve diğer adalarla arasında koridor kalıyor. */
export function canPlaceIsland(plan: OfficePlan, islandId: string, x: number, z: number): boolean {
  const island = plan.islands.find((i) => i.id === islandId);
  if (!island) return false;
  const f = islandFootprint({ ...island, x, z });
  if (!rectInside(f, plan.area)) return false;
  return plan.islands.every((o) => o.id === islandId || !rectsTouch(f, islandFootprint(o), AISLE));
}

/** Kapıdan her masaya, kahve makinesine ve kanepeye yürünebiliyor mu (taşıma yol kapatmasın). */
export function allSeatsReachable(plan: OfficePlan): boolean {
  const targets: Point[] = [
    ...plan.seats,
    plan.coffee,
    ...[...plan.sofaSeats, ...plan.armchairSeats, ...plan.gameSeats].map((s) => s.approach ?? s),
    plan.zones.tech.labSpot,
  ];
  return targets.every((t) => findPath(plan.grid, plan.door, t) !== null);
}

/** Adanın sağ kenarı (x). */
export function islandRightEdge(island: Island): number {
  return island.x + Math.max(...COL_ORDER.slice(0, island.cols)) * DESK_PITCH + DESK_W / 2;
}

/** Adanın sol kenarı (x). */
export function islandLeftEdge(island: Island): number {
  return island.x + Math.min(...COL_ORDER.slice(0, island.cols)) * DESK_PITCH - DESK_W / 2;
}

/** Test uzmanı panosunun yeri (adanın sağ ucunda). */
export function testerBoardOf(island: Island): Point {
  return { x: islandRightEdge(island) + 0.55, z: island.z };
}

/**
 * Bir oturma yerinin yanında, ziyaretçinin duracağı boş nokta (oturan kişiye dönük).
 * Önce sağ, sonra sol, sonra arka denenir.
 */
export function visitSpot(plan: OfficePlan, seat: Seat, nth = 0): Spot {
  const candidates: [number, number][] = [
    [0.85, 0.1],
    [-0.85, 0.1],
    [0, 0.95],
    [1.1, 0.6],
    [-1.1, 0.6],
    [0.6, 1.3],
    [-0.6, 1.3],
  ];
  const deskRot = seat.heading - Math.PI;
  const free: Point[] = [];
  for (const [lx, lz] of candidates) {
    const p = localToWorld(seat.x, seat.z, deskRot, lx, lz);
    const c = plan.grid.toCell(p);
    if (plan.grid.isFree(c.c, c.r)) free.push(p);
  }
  // Aynı masaya aynı anda gelen ziyaretçiler ayrı noktalarda dursun.
  if (free.length > 0) {
    const p = free[nth % free.length]!;
    return { ...p, heading: headingTo(p, seat) };
  }
  const near = plan.grid.nearestFree(seat)!;
  const p = plan.grid.toWorld(near.c, near.r);
  return { ...p, heading: headingTo(p, seat) };
}

/** Bir ajanın masası (yoksa undefined). */
export function seatOf(plan: OfficePlan, agentId: string): Seat | undefined {
  const id = plan.assignment.get(agentId);
  return id ? plan.seats.find((s) => s.id === id) : undefined;
}
