import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  SphereGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  type Group,
  type Mesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Agent, AgentRole, TeamMember } from '../../../../shared/types.ts';
import { translator, type Translate } from '../../i18n.ts';
import { ROLE_COLOR, roleLabel } from '../../labels.ts';
import { useLang, useOffice } from '../../store.ts';
import {
  BUILD_COLOR,
  BUILD_TEXT,
  buildState,
  kanbanNotes,
  opsStats,
  presence,
  rackLevel,
  type BuildState,
  type KanbanNote,
  type OpsStats,
  type Presence,
} from '../ops.ts';
import { screenFps } from '../power.ts';
import type { OfficePlan } from '../sim/plan.ts';
import type { OfficeSim } from '../sim/sim.ts';
import {
  DASH,
  ENTRANCE,
  KANBAN,
  LAB_TOP,
  RACK,
  STACK_Y,
  rackFrontZ,
  rackXs,
  unitY,
} from './techFurniture.ts';

/**
 * Teknoloji eşyalarının canlı kısımları (Sürüm 5): sunucu ışıkları, duvar panosu, derleme lambası, kat bandındaki
 * durum LED'i, kanban, giriş ekranı ve deney masasındaki 3B yazıcı, robot kol, drone. Hepsi `ops.ts`'teki saf
 * hesaplardan beslenir; yalnızca sayı, renk, rol ve ad gösterir. Kanvaslar düşük kare hızında yeniden çizilir.
 */
export function TechOps({
  plan,
  agents,
  team,
  sim,
  reduced,
}: {
  plan: OfficePlan;
  agents: readonly Agent[];
  team: readonly TeamMember[];
  sim: OfficeSim;
  reduced: boolean;
}) {
  const lang = useLang();
  const data = useMemo(() => {
    // Ekip üyesinin masasında çalışan bir yardımcı varsa üye "çalışıyor"; yoksa ofiste boşta.
    const byId = new Map(agents.map((a) => [a.id, a]));
    const busyMembers = new Set<string>();
    const seatMember = new Map(plan.seats.filter((s) => s.member).map((s) => [s.id, s.member!]));
    for (const [agentId, seatId] of plan.assignment) {
      const member = seatMember.get(seatId);
      const a = byId.get(agentId);
      if (member && a && a.status !== 'idle' && a.status !== 'offline') busyMembers.add(member);
    }
    const members = team.filter((m) => [...seatMember.values()].includes(m.name));
    return {
      state: buildState(agents),
      level: rackLevel(agents),
      notes: kanbanNotes(agents),
      people: presence(agents, members, busyMembers, (r) => roleLabel(r, lang)),
      idleMembers: members.length - [...busyMembers].filter((m) => members.some((x) => x.name === m)).length,
      t: translator(lang),
    };
  }, [agents, plan, team, lang]);
  const live = useRef({ ...data, agents });
  live.current = { ...data, agents };

  return (
    <group name="tech-ops">
      <ServerLights plan={plan} live={live} reduced={reduced} />
      <StackLight plan={plan} live={live} reduced={reduced} />
      <FloorLed plan={plan} live={live} reduced={reduced} />
      <Dashboard plan={plan} live={live} reduced={reduced} />
      <Kanban plan={plan} live={live} reduced={reduced} />
      <Entrance plan={plan} live={live} />
      <LabToys plan={plan} sim={sim} reduced={reduced} />
    </group>
  );
}

interface Live {
  state: BuildState;
  level: number;
  notes: KanbanNote[];
  people: Presence[];
  idleMembers: number;
  agents: readonly Agent[];
  /** Kanvas yazıları için seçili dilde çeviri. */
  t: Translate;
}
type LiveRef = { current: Live };

// ---------- yardımcılar ----------

function useCanvas(w: number, h: number) {
  const c = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d')!;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: texture, toneMapped: false });
    return { g, texture, material };
  }, [w, h]);
  useEffect(
    () => () => {
      c.texture.dispose();
      c.material.dispose();
    },
    [c],
  );
  return c;
}

/** Kanvasın en fazla kaç kez/sn çizileceği: ekranlarla aynı kural (hareketi azalt ve düşük güçte yavaş). */
function useThrottle(maxFps: number, reduced: boolean) {
  const lowPower = useOffice((s) => s.settings.lowPower);
  const last = useRef(-Infinity);
  return (now: number): boolean => {
    const fps = Math.min(maxFps, screenFps(reduced, lowPower));
    if (now - last.current < 1000 / fps) return false;
    last.current = now;
    return true;
  };
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function clock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

// ---------- sunucu ışıkları ----------

const LEDS_PER_UNIT = 4;
const LED_ON = ['#3fe07f', '#3fe07f', '#3fe07f', '#4fa8ff', '#ffc23a'].map((c) =>
  new Color(c).multiplyScalar(1.6),
);
const LED_OFF = new Color('#0c2018');
const LED_ERR = new Color('#ff3b4e').multiplyScalar(1.6);

function ServerLights({ plan, live, reduced }: { plan: OfficePlan; live: LiveRef; reduced: boolean }) {
  const xs = rackXs(plan);
  const count = xs.length * RACK.units * LEDS_PER_UNIT;
  const mesh = useMemo(() => {
    const m = new InstancedMesh(
      new BoxGeometry(0.035, 0.022, 0.012),
      new MeshBasicMaterial({ toneMapped: false }),
      count,
    );
    const o = new Object3D();
    const fz = rackFrontZ(plan) + 0.012;
    let i = 0;
    for (const x of xs)
      for (let u = 0; u < RACK.units; u++)
        for (let l = 0; l < LEDS_PER_UNIT; l++) {
          o.position.set(x + 0.15 + l * 0.045, unitY(u), fz);
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);
          m.setColorAt(i, LED_OFF);
          i++;
        }
    m.frustumCulled = false;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.shapeKey, count]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    },
    [mesh],
  );
  const due = useThrottle(10, reduced);
  useFrame(() => {
    if (!due(performance.now())) return;
    const { level, state } = live.current;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let c = LED_OFF;
      if (state === 'error' && i % 7 === 0) c = r < 0.6 ? LED_ERR : LED_OFF;
      else if (i % LEDS_PER_UNIT === 0)
        c = LED_ON[0]!; // her birimin güç ışığı hep yanar
      else if (r < 0.15 + level * 0.55) c = LED_ON[(i * 7 + Math.floor(r * 50)) % LED_ON.length]!;
      mesh.setColorAt(i, c);
    }
    mesh.instanceColor!.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

// ---------- derleme lambası ve LED şerit ----------

const LAMP_ORDER: BuildState[] = ['busy', 'asking', 'error']; // alttan üste: yeşil, sarı, kırmızı
const LAMP_DIM = LAMP_ORDER.map((st) => new Color(BUILD_COLOR[st]).multiplyScalar(0.12));

/** Üç lamba tek çizimde (örnekli): yanan lamba parlak, diğerleri sönük renkli cam. */
function StackLight({ plan, live, reduced }: { plan: OfficePlan; live: LiveRef; reduced: boolean }) {
  const sl = plan.zones.tech.stackLight;
  const mesh = useMemo(() => {
    const m = new InstancedMesh(
      new CylinderGeometry(0.075, 0.075, 0.15, 16),
      new MeshBasicMaterial({ toneMapped: false }),
      LAMP_ORDER.length,
    );
    const o = new Object3D();
    STACK_Y.forEach((y, i) => {
      o.position.set(sl.x, y, sl.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, LAMP_DIM[i]!);
    });
    m.frustumCulled = false;
    return m;
  }, [sl.x, sl.z]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    },
    [mesh],
  );
  const on = useMemo(() => new Color(), []);
  useFrame(({ clock: c }) => {
    const { state } = live.current;
    const lit = state === 'quiet' ? 'busy' : state;
    const blink = state === 'asking' && !reduced ? (Math.sin(c.elapsedTime * 6) > -0.2 ? 1 : 0.3) : 1;
    LAMP_ORDER.forEach((st, i) => {
      if (st === lit)
        mesh.setColorAt(i, on.set(BUILD_COLOR[st]).multiplyScalar((state === 'quiet' ? 0.7 : 2) * blink));
      else mesh.setColorAt(i, LAMP_DIM[i]!);
    });
    mesh.instanceColor!.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/** Kat bandının önünde, derleme durumuna göre renk değiştiren LED şerit (çalışırken yavaşça "nefes alır"). */
function FloorLed({ plan, live, reduced }: { plan: OfficePlan; live: LiveRef; reduced: boolean }) {
  const mat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const target = useMemo(() => new Color(), []);
  useFrame(({ clock: c }, dt) => {
    const { state } = live.current;
    const breathe = state === 'busy' && !reduced ? 0.8 + Math.sin(c.elapsedTime * 1.6) * 0.35 : 1;
    const k = state === 'quiet' ? 0.45 : state === 'error' ? 2.2 : 1.6;
    target.set(BUILD_COLOR[state]).multiplyScalar(k * breathe);
    mat.color.lerp(target, 1 - Math.exp(-6 * Math.min(dt, 0.1)));
  });
  return (
    <mesh position={[plan.width / 2, -0.32, plan.depth + 0.156]} material={mat}>
      <boxGeometry args={[plan.width + 0.6, 0.035, 0.01]} />
    </mesh>
  );
}

// ---------- duvar panosu ----------

function Dashboard({ plan, live, reduced }: { plan: OfficePlan; live: LiveRef; reduced: boolean }) {
  const { g, texture, material } = useCanvas(512, 290);
  const due = useThrottle(2, reduced);
  const serverNow = useOffice((s) => s.clockOffset);
  useFrame(() => {
    if (!due(performance.now())) return;
    const { agents, idleMembers, state, t } = live.current;
    drawDashboard(g, opsStats(agents, idleMembers, Date.now() + serverNow), state, t);
    texture.needsUpdate = true;
  });
  const db = plan.zones.tech.dashboard;
  return (
    <mesh position={[db.x, DASH.y, db.z + 0.001]} rotation={[0, db.heading, 0]} material={material}>
      <planeGeometry args={[DASH.w, DASH.h]} />
    </mesh>
  );
}

function drawDashboard(g: CanvasRenderingContext2D, s: OpsStats, state: BuildState, t: Translate): void {
  const W = 512;
  const H = 290;
  g.fillStyle = '#0d1020';
  g.fillRect(0, 0, W, H);
  // başlık ve saat
  g.fillStyle = '#e9ecf5';
  g.font = `700 22px ${FONT}`;
  g.textBaseline = 'middle';
  g.fillText(t('ops.title'), 20, 26);
  g.font = `600 22px ${FONT}`;
  g.textAlign = 'right';
  g.fillText(clock(), W - 20, 26);
  g.textAlign = 'left';
  // durum
  g.fillStyle = BUILD_COLOR[state];
  roundRect(g, 20, 48, 200, 30, 15);
  g.fillStyle = '#0d1020';
  g.font = `700 16px ${FONT}`;
  g.fillText(t(BUILD_TEXT[state]), 36, 64);
  // sayılar
  const tile = (x: number, label: string, value: number, color: string) => {
    g.fillStyle = '#161a30';
    roundRect(g, x, 92, 150, 78, 10);
    g.fillStyle = color;
    g.font = `800 38px ${FONT}`;
    g.fillText(String(value), x + 14, 122);
    g.fillStyle = '#9aa3c0';
    g.font = `600 15px ${FONT}`;
    g.fillText(label, x + 14, 154);
  };
  tile(20, t('ops.working'), s.working, '#3fe07f');
  tile(181, t('ops.idle'), s.idle, '#ffc23a');
  tile(342, t('ops.actions'), s.total, '#6fc8ff');
  // son 10 dakika
  g.fillStyle = '#161a30';
  roundRect(g, 20, 184, 472, 90, 10);
  const max = Math.max(4, ...s.perMinute);
  const bw = 36;
  s.perMinute.forEach((n, i) => {
    const h = (n / max) * 58;
    g.fillStyle = i === s.perMinute.length - 1 ? '#ff6f9a' : '#8f8bff';
    g.fillRect(36 + i * 45, 262 - h, bw, Math.max(2, h));
  });
  g.fillStyle = '#5c6688';
  g.font = `500 12px ${FONT}`;
  g.fillText(t('ops.last10'), 36, 198);
}

// ---------- kanban ----------

const KB_W = 512;
const KB_H = 290;
const COLS = ['kanban.todo', 'kanban.doing', 'kanban.done'] as const;

function Kanban({ plan, live, reduced }: { plan: OfficePlan; live: LiveRef; reduced: boolean }) {
  const { g, texture, material } = useCanvas(KB_W, KB_H);
  const pos = useRef(new Map<string, { x: number; y: number }>());
  const due = useThrottle(10, reduced);
  const lastStill = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (!due(now)) return;
    const targets = noteTargets(live.current.notes);
    // notlar hedefe doğru kayar; hareket bitince saniyede bir çizilir
    let moving = false;
    const p = pos.current;
    for (const [id, t] of targets) {
      const cur = p.get(id);
      if (!cur || reduced) {
        p.set(id, { ...t });
        moving = true;
        continue;
      }
      const dx = t.x - cur.x;
      const dy = t.y - cur.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) {
        cur.x += dx * 0.25;
        cur.y += dy * 0.25;
        moving = true;
      } else {
        cur.x = t.x;
        cur.y = t.y;
      }
    }
    for (const id of [...p.keys()]) if (!targets.has(id)) p.delete(id);
    if (!moving && now - lastStill.current < 1000) return;
    lastStill.current = now;
    drawKanban(g, live.current.notes, p, live.current.t);
    texture.needsUpdate = true;
  });
  const kb = plan.zones.tech.kanban;
  return (
    <mesh position={[kb.x, KANBAN.y, kb.z - 0.004]} rotation={[0, kb.heading, 0]} material={material}>
      <planeGeometry args={[KANBAN.w, KANBAN.h]} />
    </mesh>
  );
}

const NOTE = 46;

function noteTargets(notes: readonly KanbanNote[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const n = [0, 0, 0];
  for (const note of notes) {
    const i = n[note.column]!++;
    const colX = 12 + note.column * 168;
    out.set(note.id, { x: colX + 8 + (i % 3) * 52, y: 52 + Math.floor(i / 3) * 54 });
  }
  return out;
}

function drawKanban(
  g: CanvasRenderingContext2D,
  notes: readonly KanbanNote[],
  pos: ReadonlyMap<string, { x: number; y: number }>,
  t: Translate,
): void {
  g.fillStyle = '#f4f5f7';
  g.fillRect(0, 0, KB_W, KB_H);
  COLS.forEach((name, i) => {
    const x = 12 + i * 168;
    g.fillStyle = '#e3e6ec';
    g.fillRect(x, 10, 160, KB_H - 20);
    g.fillStyle = ['#8a8e96', '#2b6bd8', '#1f9a5a'][i]!;
    g.font = `700 17px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(t(name), x + 10, 28);
  });
  for (const note of notes) {
    const p = pos.get(note.id);
    if (!p) continue;
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(p.x + 2, p.y + 3, NOTE, NOTE);
    g.fillStyle = ROLE_COLOR[note.role];
    g.fillRect(p.x, p.y, NOTE, NOTE);
    // sahte yazı satırları
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(p.x + 6, p.y + 10, 32, 4);
    g.fillRect(p.x + 6, p.y + 19, 24, 4);
    g.fillRect(p.x + 6, p.y + 28, 28, 4);
    if (note.column === 2) {
      g.strokeStyle = '#1b6b3a';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(p.x + 26, p.y + 36);
      g.lineTo(p.x + 32, p.y + 42);
      g.lineTo(p.x + 42, p.y + 30);
      g.stroke();
    }
  }
}

// ---------- giriş ekranı ----------

function Entrance({ plan, live }: { plan: OfficePlan; live: LiveRef }) {
  const { g, texture, material } = useCanvas(576, 200);
  const last = useRef('');
  useFrame(() => {
    // yalnızca liste ya da saat değişince çizilir
    const { people, t } = live.current;
    const key = `${clock()}|${t('entrance.today', { n: '' })}|${people.map((p) => `${p.role}:${p.label}:${p.working}`).join(',')}`;
    if (key === last.current) return;
    last.current = key;
    drawEntrance(g, people, t);
    texture.needsUpdate = true;
  });
  return (
    <mesh
      position={[0.059, ENTRANCE.y, plan.zones.door.z]}
      rotation={[0, Math.PI / 2, 0]}
      material={material}
    >
      <planeGeometry args={[ENTRANCE.w, ENTRANCE.h]} />
    </mesh>
  );
}

function drawEntrance(g: CanvasRenderingContext2D, people: readonly Presence[], t: Translate): void {
  const W = 576;
  const H = 200;
  g.fillStyle = '#0d1020';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'middle';
  g.fillStyle = '#d9a441';
  g.font = `700 24px ${FONT}`;
  g.fillText(t('entrance.today', { n: people.length }), 18, 26);
  g.fillStyle = '#e9ecf5';
  g.textAlign = 'right';
  g.fillText(clock(), W - 18, 26);
  g.textAlign = 'left';
  people.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 18 + col * 280;
    const y = 64 + row * 27;
    g.fillStyle = ROLE_COLOR[p.role as AgentRole];
    g.beginPath();
    g.arc(x + 8, y, 7, 0, Math.PI * 2);
    g.fill();
    if (!p.working) {
      g.fillStyle = '#0d1020';
      g.beginPath();
      g.arc(x + 8, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = p.working ? '#e9ecf5' : '#9aa3c0';
    g.font = `600 18px ${FONT}`;
    const text = p.label.length > 22 ? `${p.label.slice(0, 21)}…` : p.label;
    g.fillText(text, x + 24, y);
  });
}

// ---------- deney masası: 3B yazıcı, robot kol, drone, lehim kıvılcımı ----------

/** Birkaç kutuyu tek geometride birleştirir (her parça ayrı çizilmesin). */
function boxes(list: readonly { s: [number, number, number]; p: [number, number, number]; ry?: number }[]) {
  const geos = list.map((b) => {
    const g = new BoxGeometry(...b.s);
    if (b.ry) g.rotateY(b.ry);
    g.translate(...b.p);
    return g;
  });
  const merged = mergeGeometries(geos)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

function useLabGeometry() {
  const geo = useMemo(() => {
    const droneParts: { s: [number, number, number]; p: [number, number, number]; ry?: number }[] = [
      { s: [0.1, 0.04, 0.1], p: [0, 0, 0] },
    ];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * 0.1;
      const z = Math.sin(a) * 0.1;
      droneParts.push({ s: [0.1, 0.015, 0.015], p: [x / 2, 0, z / 2], ry: -a });
      droneParts.push({ s: [0.1, 0.006, 0.02], p: [x, 0.025, z], ry: a * 2 });
    }
    return {
      drone: boxes(droneParts),
      head: boxes([
        { s: [0.08, 0.06, 0.08], p: [0, 0, 0] },
        { s: [0.46, 0.02, 0.025], p: [0, 0.02, 0] },
      ]),
      base: new CylinderGeometry(0.05, 0.06, 0.06, 12).translate(0, 0.03, 0),
      upper: new BoxGeometry(0.05, 0.24, 0.05).translate(0, 0.12, 0),
      fore: boxes([
        { s: [0.04, 0.18, 0.04], p: [0, 0.09, 0] },
        { s: [0.07, 0.03, 0.03], p: [0, 0.19, 0] },
      ]),
      part: new BoxGeometry(0.14, 1, 0.14),
      spark: new SphereGeometry(0.025, 8, 8),
    };
  }, []);
  const mats = useMemo(
    () => ({
      orange: new MeshStandardMaterial({ color: '#ff8a2a', roughness: 0.4 }),
      white: new MeshStandardMaterial({ color: '#e9e6ea', roughness: 0.4 }),
      dark: new MeshStandardMaterial({ color: '#2a2a30', roughness: 0.4, metalness: 0.4 }),
      print: new MeshStandardMaterial({ color: '#5fe0a0', roughness: 0.5 }),
      spark: new MeshBasicMaterial({ color: new Color('#ffe2a8').multiplyScalar(3), toneMapped: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );
  return { geo, mats };
}

function LabToys({ plan, sim, reduced }: { plan: OfficePlan; sim: OfficeSim; reduced: boolean }) {
  const lb = plan.zones.tech.labBench;
  const { geo, mats } = useLabGeometry();
  const part = useRef<Mesh>(null);
  const head = useRef<Mesh>(null);
  const armYaw = useRef<Group>(null);
  const armUp = useRef<Group>(null);
  const armFore = useRef<Group>(null);
  const drone = useRef<Mesh>(null);
  const spark = useRef<Mesh>(null);
  const hover = useRef(0);
  useFrame(({ clock: c }, dt) => {
    const t = reduced ? Math.floor(c.elapsedTime / 4) * 4 : c.elapsedTime;
    let busy = false;
    for (const a of sim.actors.values()) if (a.pastime === 'lab' && a.visible) busy = true;
    // 3B yazıcı: 90 sn'de bir parça basar, sonra baştan
    const h = 0.02 + ((t % 90) / 90) * 0.2;
    if (part.current) {
      part.current.scale.y = h;
      part.current.position.y = LAB_TOP + 0.065 + h / 2;
    }
    head.current?.position.set(
      0.85 + Math.sin(t * 2.3) * 0.12,
      LAB_TOP + 0.075 + h + 0.03,
      Math.cos(t * 1.7) * 0.1,
    );
    // robot kol: yavaşça döner, uzanıp geri çekilir
    if (armYaw.current) armYaw.current.rotation.y = Math.sin(t * 0.4) * 1.2;
    if (armUp.current) armUp.current.rotation.x = -0.4 + Math.sin(t * 0.7) * 0.35;
    if (armFore.current) armFore.current.rotation.x = 0.9 + Math.sin(t * 0.7 + 1) * 0.4;
    // drone: biri kurcalarken havalanır ve yavaşça kendi etrafında döner
    hover.current += ((busy ? 1 : 0) - hover.current) * (1 - Math.exp(-2 * Math.min(dt, 0.1)));
    const d = drone.current;
    if (d) {
      d.position.y = LAB_TOP + 0.04 + hover.current * (0.28 + (reduced ? 0 : Math.sin(t * 3) * 0.03));
      if (!reduced) d.rotation.y += dt * 1.5 * hover.current;
    }
    if (spark.current) spark.current.visible = busy && !reduced && Math.sin(t * 23) > 0.3;
  });
  return (
    <group position={[lb.x, 0, lb.z]} rotation={[0, lb.heading, 0]}>
      <mesh ref={part} position={[0.85, LAB_TOP + 0.07, 0]} geometry={geo.part} material={mats.print} />
      <mesh ref={head} geometry={geo.head} material={mats.white} />
      <group ref={armYaw} position={[0.3, LAB_TOP + 0.07, 0.05]}>
        <mesh geometry={geo.base} material={mats.orange} />
        <group ref={armUp} position={[0, 0.06, 0]}>
          <mesh geometry={geo.upper} material={mats.orange} />
          <group ref={armFore} position={[0, 0.24, 0]}>
            <mesh geometry={geo.fore} material={mats.white} />
          </group>
        </group>
      </group>
      <mesh ref={drone} position={[-0.2, LAB_TOP + 0.04, 0.18]} geometry={geo.drone} material={mats.dark} />
      <mesh
        ref={spark}
        position={[-0.86, LAB_TOP + 0.06, -0.02]}
        geometry={geo.spark}
        material={mats.spark}
        visible={false}
      />
    </group>
  );
}
