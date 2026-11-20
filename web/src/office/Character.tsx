import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MathUtils,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type Group,
  type Mesh,
} from 'three';
import type { AgentRole, AgentStatus } from '../../../shared/types.ts';
import type { Gesture, Holding, Pastime, Pose } from './sim/sim.ts';

/**
 * Düşük poligonlu, eklemli karakter. Yüzü yerel +z yönüne bakar; ayakları y=0'da.
 * Hareket her karede `drive` nesnesinden okunur (React yeniden çizimi gerekmez).
 */

export interface CharacterDrive {
  pose: Pose;
  /** m/sn; 0'dan büyükse yürüme adımları. */
  speed: number;
  gesture: Gesture;
  holding: Holding;
  /** Boşta oyalanma: masada video/oyun ya da konsolda oyun (duruş buna göre). */
  pastime: Pastime;
  opacity: number;
  status: AgentStatus;
}

export type Hair = 'short' | 'bun' | 'long' | 'buzz' | 'curly';

export interface Look {
  role: AgentRole;
  skin: string;
  hair: string;
  hairStyle: Hair;
  top: string;
  sleeves: string;
  pants: string;
  shoes: string;
  /** Rol aksesuarının rengi (yelek, bere, kulaklık, kravat…). */
  accent: string;
  accent2: string;
  /** Rol aksesuarı (kravat, yelek, kulaklık, bere, gözlük…) çizilsin mi. */
  accessories: boolean;
}

/** Kullanıcının rol için seçtiği özelleştirme (Ayarlar → Karakterler). */
export interface LookCustom {
  outfit?: string;
  accessories?: boolean;
}

const SKINS = ['#f3cdb8', '#e5b294', '#c98e6b', '#a8704e', '#7d5139', '#f6d9c6'];
const HAIRS = ['#2b1218', '#4a2a1a', '#7a4a2a', '#c99a5a', '#1b1b22', '#8a2b3a', '#d9d2c8'];
const STYLES: Hair[] = ['short', 'bun', 'long', 'buzz', 'curly'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Karakterin görünümü: rol kıyafeti + kimliğe göre sabit ten/saç çeşitliliği. Kullanıcı rol için kıyafet rengi
 * seçtiyse üst (ve kollar) o renk olur; aksesuar kapatıldıysa rol aksesuarı çizilmez.
 */
export function lookFor(id: string, role: AgentRole, custom?: LookCustom): Look {
  const look = baseLook(id, role);
  if (custom?.outfit) {
    look.top = custom.outfit;
    look.sleeves = custom.outfit;
  }
  if (custom?.accessories === false) look.accessories = false;
  return look;
}

function baseLook(id: string, role: AgentRole): Look {
  const h = hash(id);
  const pick = <T,>(list: readonly T[], shift: number): T => list[(h >>> shift) % list.length]!;
  const base: Look = {
    role,
    skin: pick(SKINS, 0),
    hair: pick(HAIRS, 4),
    hairStyle: pick(STYLES, 8),
    top: '#5a4650',
    sleeves: '#5a4650',
    pants: '#2a1d26',
    shoes: '#1a1014',
    accent: '#ffb547',
    accent2: '#ffffff',
    accessories: true,
  };
  switch (role) {
    case 'lead': {
      const jacket = pick(['#3a1a2a', '#2a2238', '#4a1f28'], 12);
      return {
        ...base,
        top: jacket,
        sleeves: jacket,
        pants: '#1f1820',
        accent: '#ffb547',
        accent2: '#f4e6ea',
      };
    }
    case 'designer': {
      const tops = ['#ff6fb5', '#2ec4b6', '#ffbf47', '#8f6bff', '#ff7a4d'];
      const t = pick(tops, 12);
      const s = pick(tops, 16) === t ? '#ffe36b' : pick(tops, 16);
      return {
        ...base,
        top: t,
        sleeves: s,
        pants: pick(['#2b3a6b', '#3d2a5c', '#1f4a4a'], 20),
        accent: pick(['#e0304b', '#2b2b38', '#ffe36b'], 24),
        accent2: s,
      };
    }
    case 'developer': {
      const hoodie = pick(['#4b3f72', '#3a3f4a', '#5a2a3e', '#24424a'], 12);
      return {
        ...base,
        top: hoodie,
        sleeves: hoodie,
        pants: '#1e2230',
        accent: '#141418',
        accent2: '#ff3d6e',
      };
    }
    case 'tester':
      return {
        ...base,
        top: '#d9d0d4',
        sleeves: '#d9d0d4',
        pants: '#2a2f3a',
        accent: '#ffb02e',
        accent2: '#fff4c2',
      };
    case 'reviewer': {
      const t = pick(['#6b4a5a', '#3d5a6b', '#5a5a3d'], 12);
      return { ...base, top: t, sleeves: t, pants: '#2a2228', accent: '#1a1014', accent2: '#c8a0ff' };
    }
    case 'researcher': {
      const t = pick(['#7a5a3a', '#4a6a5a', '#6a4a6a'], 12);
      return {
        ...base,
        top: t,
        sleeves: t,
        accent: pick(['#e0304b', '#ffb547', '#6fc8ff'], 16),
        accent2: '#f4e6ea',
      };
    }
    case 'architect':
      return {
        ...base,
        top: '#1c1820',
        sleeves: '#1c1820',
        pants: '#2a2630',
        accent: '#c69bff',
        accent2: '#ffffff',
      };
    default:
      return base;
  }
}

// Paylaşılan geometriler (tüm karakterler kullanır; sahne kapanınca kalır, küçükler).
const BOX = new BoxGeometry(1, 1, 1);
const TORSO = new CylinderGeometry(0.21, 0.25, 0.58, 6);
const HEAD = new IcosahedronGeometry(0.2, 1);
const HAIR_CAP = new SphereGeometry(0.215, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
const BALL = new IcosahedronGeometry(0.1, 0);
const BAND = new TorusGeometry(0.215, 0.022, 4, 12, Math.PI);
const CUP = new CylinderGeometry(0.07, 0.07, 0.05, 8);
const RIM = new TorusGeometry(0.045, 0.009, 4, 10);
const MUG = new CylinderGeometry(0.045, 0.04, 0.1, 8);
const BERET = new CylinderGeometry(0.2, 0.22, 0.07, 10);
const BEANIE = new SphereGeometry(0.225, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
const NECK = new CylinderGeometry(0.11, 0.12, 0.14, 8);

const HIP_Y = 0.84;
const SEAT_DROP = 0.36;
const SOFA_DROP = 0.44;

function useMaterials(look: Look) {
  const mats = useMemo(() => {
    const m = (color: string, rough = 0.75) =>
      new MeshStandardMaterial({ color, roughness: rough, flatShading: true });
    return {
      skin: m(look.skin, 0.6),
      hair: m(look.hair, 0.8),
      top: m(look.top),
      sleeves: m(look.sleeves),
      pants: m(look.pants, 0.85),
      shoes: m(look.shoes, 0.6),
      accent: m(look.accent, 0.5),
      accent2: m(look.accent2, 0.5),
      dark: m('#120a0e', 0.4),
      mug: m('#ff9db3', 0.4),
      pad: m('#24202a', 0.45),
      padKeys: m('#ff6f9a', 0.4),
    };
  }, [look]);
  useEffect(() => () => Object.values(mats).forEach((x) => x.dispose()), [mats]);
  return mats;
}

interface Props {
  look: Look;
  /** Her karede okunan hareket bilgisi. */
  drive: { current: CharacterDrive };
  /** Animasyonlar aynı anda olmasın diye. */
  phase?: number;
  reduced?: boolean;
}

export function Character({ look, drive, phase = 0, reduced = false }: Props) {
  const mats = useMaterials(look);
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const hipL = useRef<Group>(null);
  const hipR = useRef<Group>(null);
  const kneeL = useRef<Group>(null);
  const kneeR = useRef<Group>(null);
  const shL = useRef<Group>(null);
  const shR = useRef<Group>(null);
  const elL = useRef<Group>(null);
  const elR = useRef<Group>(null);
  const mug = useRef<Mesh>(null);
  const pad = useRef<Group>(null);
  const state = useRef({ sit: 1, sofa: 0, walk: 0, cycle: phase, opacity: -1 });

  useFrame(({ clock }, rawDt) => {
    const d = drive.current;
    const s = state.current;
    const dt = Math.min(rawDt, 0.1);
    const t = clock.elapsedTime + phase;
    const sitting = d.pose === 'sit' || d.pose === 'sofa';
    s.sit = MathUtils.damp(s.sit, sitting ? 1 : 0, reduced ? 30 : 9, dt);
    s.sofa = MathUtils.damp(s.sofa, d.pose === 'sofa' ? 1 : 0, 9, dt);
    s.walk = MathUtils.damp(s.walk, d.speed > 0 ? 1 : 0, 10, dt);
    s.cycle += dt * d.speed * 4.6;
    const w = s.walk;
    const c = s.cycle;
    const calm = reduced ? 0 : 1;

    // --- bacaklar ---
    const sitHip = -Math.PI / 2 + s.sofa * 0.25;
    const swing = Math.sin(c) * 0.55 * w;
    const kneeWalk = (x: number) => Math.max(0, Math.sin(x)) * 0.75 * w;
    if (hipL.current && hipR.current && kneeL.current && kneeR.current) {
      hipL.current.rotation.x = MathUtils.lerp(swing, sitHip, s.sit);
      hipR.current.rotation.x = MathUtils.lerp(-swing, sitHip, s.sit);
      kneeL.current.rotation.x = MathUtils.lerp(
        kneeWalk(c + Math.PI * 0.6),
        Math.PI / 2 - s.sofa * 0.2,
        s.sit,
      );
      kneeR.current.rotation.x = MathUtils.lerp(
        kneeWalk(c + Math.PI * 1.6),
        Math.PI / 2 - s.sofa * 0.2,
        s.sit,
      );
    }

    // --- gövde: oturunca alçalır, yürürken hafif zıplar ---
    if (root.current) {
      root.current.position.y =
        -s.sit * MathUtils.lerp(SEAT_DROP, SOFA_DROP, s.sofa) + Math.abs(Math.sin(c)) * 0.035 * w;
    }

    // --- kollar ve baş: duruma ve harekete göre ---
    let shLx = 0;
    let shRx = 0;
    let shLz = -0.06;
    let shRz = 0.06;
    let elLx = -0.15;
    let elRx = -0.15;
    let elRz = 0;
    let lean = 0;
    let headX = 0;
    let headY = 0;
    let headZ = 0;

    if (w <= 0.05 && s.sit < 0.5 && d.pastime === 'lab') {
      // deney masasında ayakta kurcalama: eller masada, baş eğik, küçük hızlı hareketler
      shLx = -0.75;
      shRx = -0.6 + Math.sin(t * 3.1) * 0.12 * calm;
      elLx = -0.7;
      elRx = -0.85 + Math.sin(t * 9) * 0.1 * calm;
      lean = 0.22;
      headX = 0.32;
      headY = Math.sin(t * 0.7) * 0.12 * calm;
    } else if (w > 0.05) {
      shLx = -Math.sin(c) * 0.5 * w;
      shRx = Math.sin(c) * 0.5 * w;
      elLx = elRx = -0.35 * w;
      headX = Math.sin(c * 2) * 0.035 * w * calm;
      lean = 0.05 * w;
    } else if (s.sit > 0.5 && s.sofa < 0.5 && d.pastime === 'video') {
      // masada video: arkaya yaslanmış, eller dizde, baş hafif yana eğik
      shLx = shRx = -0.22;
      elLx = elRx = -0.5;
      lean = -0.2;
      headX = -0.04;
      headZ = 0.08 + Math.sin(t * 0.3) * 0.03 * calm;
    } else if (s.sit > 0.5 && s.sofa < 0.5 && d.pastime === 'pcgame') {
      // bilgisayarda oyun: öne eğilmiş, sol el klavyede hızlı, sağ el farede
      shLx = -0.6;
      shRx = -0.5;
      elLx = -1.0 + Math.sin(t * 22) * 0.07 * calm;
      elRx = -0.9 + Math.sin(t * 7.3) * 0.12 * calm;
      lean = 0.16;
      headX = 0.12;
      headY = Math.sin(t * 3.1) * 0.05 * calm;
    } else if (s.sit > 0.5 && s.sofa < 0.5) {
      // masada
      switch (d.status) {
        case 'writing':
        case 'terminal':
        case 'working':
          shLx = shRx = -0.55;
          elLx = -0.95 + Math.sin(t * 16) * 0.09 * calm;
          elRx = -0.95 + Math.sin(t * 16 + 2.1) * 0.09 * calm;
          lean = 0.1;
          headX = 0.1 + Math.sin(t * 1.3) * 0.02 * calm;
          break;
        case 'reading':
        case 'searching':
          shLx = -0.3;
          elLx = -0.7;
          shRx = -0.5;
          elRx = -0.95 + Math.sin(t * 2.5) * 0.05 * calm;
          lean = 0.06;
          headX = 0.14 + Math.sin(t * 0.9) * 0.05 * calm;
          headY =
            d.status === 'searching' ? Math.sin(t * 1.2) * 0.25 * calm : Math.sin(t * 0.5) * 0.06 * calm;
          break;
        case 'thinking':
          // el çenede
          shRx = -0.65;
          elRx = -2.2;
          shLx = -0.35;
          elLx = -0.7;
          headZ = Math.sin(t * 0.8) * 0.12 * calm;
          headX = -0.12;
          lean = -0.04;
          break;
        case 'delegating':
        case 'messaging':
          shLx = shRx = -0.5;
          elLx = -0.9;
          elRx = -0.9 + Math.sin(t * 5) * 0.12 * calm;
          headY = Math.sin(t * 1.6) * 0.18 * calm;
          lean = 0.05;
          break;
        case 'idle':
          shLx = shRx = -0.28;
          elLx = elRx = -0.55;
          lean = -0.16;
          headX = -0.08 + Math.sin(t * 0.6) * 0.03 * calm;
          break;
        default:
          shLx = shRx = -0.3;
          elLx = elRx = -0.6;
      }
    } else if (s.sit > 0.5) {
      // kanepede yaslanmış
      shLx = shRx = -0.2;
      elLx = elRx = -0.4;
      lean = -0.3;
      headX = -0.1;
      headZ = Math.sin(t * 0.4) * 0.05 * calm;
    }

    // jestler her şeyin üstüne
    if (d.gesture === 'wave') {
      shRz = 2.5;
      shRx = -0.1;
      elRz = 0.25 + Math.sin(t * 9) * 0.45 * (reduced ? 0.3 : 1);
      elRx = 0;
      headX = -0.05;
    } else if (d.gesture === 'stretch') {
      shLz = -2.85;
      shRz = 2.85;
      shLx = shRx = 0;
      elLx = elRx = -0.15;
      lean = -0.22;
      headX = -0.25;
    } else if (d.gesture === 'talk') {
      shLx = -0.45 + Math.sin(t * 4.2) * 0.18 * calm;
      shRx = -0.55 + Math.sin(t * 3.4 + 1) * 0.22 * calm;
      elLx = -0.9;
      elRx = -1.0;
      headX = Math.sin(t * 5) * 0.05 * calm;
    }
    if (d.holding === 'mug' && d.gesture !== 'wave' && d.gesture !== 'stretch') {
      shRx = -0.45;
      elRx = -1.35;
    }
    if (d.holding === 'controller') {
      // iki elle oyun kolu: kollar öne ve içe, başparmaklar hızlı, oyunla birlikte hafif yana yatma
      const jab = Math.sin(t * 18) * 0.05 * calm;
      shLx = shRx = -0.8;
      elLx = -0.85 + jab;
      elRx = -0.85 - jab;
      shLz = 0.42;
      shRz = -0.42;
      lean = 0.1;
      headX = 0.04;
      headZ = Math.sin(t * 1.7) * 0.08 * calm;
    }

    const k = 1 - Math.exp(-14 * dt);
    const lerpRot = (g: Group | null, x: number, y = 0, z = 0) => {
      if (!g) return;
      g.rotation.x += (x - g.rotation.x) * k;
      g.rotation.y += (y - g.rotation.y) * k;
      g.rotation.z += (z - g.rotation.z) * k;
    };
    lerpRot(shL.current, shLx, 0, shLz);
    lerpRot(shR.current, shRx, 0, shRz);
    lerpRot(elL.current, elLx);
    lerpRot(elR.current, elRx, 0, elRz);
    lerpRot(torso.current, lean);
    lerpRot(head.current, headX, headY, headZ);
    if (mug.current) mug.current.visible = d.holding === 'mug';
    if (pad.current) {
      pad.current.visible = d.holding === 'controller';
      if (pad.current.visible) pad.current.rotation.z = Math.sin(t * 1.7) * 0.12 * calm;
    }

    // solup belirme
    if (d.opacity !== s.opacity) {
      s.opacity = d.opacity;
      const fading = d.opacity < 0.999;
      for (const m of Object.values(mats)) {
        if (m.transparent !== fading) {
          m.transparent = fading;
          m.needsUpdate = true;
        }
        m.opacity = d.opacity;
        m.depthWrite = !fading;
      }
    }
  });

  const style = look.hairStyle;
  // Aksesuar kapalıysa rol aksesuarlarının hiçbiri çizilmez.
  const role: AgentRole | null = look.accessories ? look.role : null;

  return (
    <group ref={root}>
      {/* bacaklar: kalçadan döner, dizden kırılır */}
      {(
        [
          [-0.11, hipL, kneeL],
          [0.11, hipR, kneeR],
        ] as const
      ).map(([x, hip, knee]) => (
        <group key={x} ref={hip} position={[x, HIP_Y, 0]}>
          <mesh
            geometry={BOX}
            material={mats.pants}
            position={[0, -0.21, 0]}
            scale={[0.17, 0.44, 0.19]}
            castShadow
          />
          <group ref={knee} position={[0, -0.42, 0]}>
            <mesh
              geometry={BOX}
              material={mats.pants}
              position={[0, -0.19, 0]}
              scale={[0.15, 0.4, 0.17]}
              castShadow
            />
            <mesh
              geometry={BOX}
              material={mats.shoes}
              position={[0, -0.39, 0.05]}
              scale={[0.16, 0.08, 0.27]}
              castShadow
            />
          </group>
        </group>
      ))}

      <group ref={torso} position={[0, HIP_Y, 0]}>
        {/* kalça bloğu */}
        <mesh
          geometry={BOX}
          material={mats.pants}
          position={[0, 0.02, 0]}
          scale={[0.42, 0.14, 0.24]}
          castShadow
        />
        {/* gövde */}
        <mesh geometry={TORSO} material={mats.top} position={[0, 0.34, 0]} castShadow />
        {role === 'lead' && (
          <>
            {/* gömlek yakası ve kravat */}
            <mesh
              geometry={BOX}
              material={mats.accent2}
              position={[0, 0.5, 0.2]}
              rotation={[0.25, 0, 0]}
              scale={[0.14, 0.16, 0.02]}
            />
            <mesh
              geometry={BOX}
              material={mats.accent}
              position={[0, 0.4, 0.235]}
              rotation={[0.18, 0, 0]}
              scale={[0.05, 0.26, 0.02]}
            />
          </>
        )}
        {role === 'tester' && (
          <>
            {/* yelek: iki ön panel ve sırt, yansıtıcı şerit */}
            {[-0.1, 0.1].map((x) => (
              <mesh
                key={x}
                geometry={BOX}
                material={mats.accent}
                position={[x, 0.32, 0.2]}
                rotation={[0.06, 0, 0]}
                scale={[0.15, 0.5, 0.06]}
                castShadow
              />
            ))}
            <mesh
              geometry={BOX}
              material={mats.accent}
              position={[0, 0.34, -0.2]}
              scale={[0.4, 0.52, 0.05]}
            />
            <mesh
              geometry={BOX}
              material={mats.accent2}
              position={[0, 0.22, 0.235]}
              scale={[0.36, 0.035, 0.02]}
            />
            <mesh
              geometry={BOX}
              material={mats.accent2}
              position={[0, 0.22, -0.23]}
              scale={[0.38, 0.035, 0.02]}
            />
          </>
        )}
        {role === 'developer' && (
          <>
            {/* kapüşon (arkada) ve ipleri */}
            <mesh
              geometry={BOX}
              material={mats.top}
              position={[0, 0.64, -0.13]}
              rotation={[-0.3, 0, 0]}
              scale={[0.34, 0.14, 0.16]}
              castShadow
            />
            {[-0.06, 0.06].map((x) => (
              <mesh
                key={x}
                geometry={BOX}
                material={mats.accent2}
                position={[x, 0.46, 0.235]}
                scale={[0.018, 0.16, 0.018]}
              />
            ))}
            <mesh geometry={BOX} material={mats.dark} position={[0, 0.2, 0.235]} scale={[0.24, 0.1, 0.02]} />
          </>
        )}
        {role === 'designer' && (
          <mesh geometry={BOX} material={mats.accent2} position={[0, 0.3, 0.232]} scale={[0.3, 0.06, 0.02]} />
        )}
        {(role === 'architect' || role === 'researcher') && (
          <mesh
            geometry={NECK}
            material={role === 'architect' ? mats.top : mats.accent}
            position={[0, 0.66, 0]}
            scale={role === 'researcher' ? [1.35, 0.8, 1.35] : [1, 1, 1]}
          />
        )}

        {/* oyun kolu: iki elin arasında (yalnızca konsolda oynarken görünür) */}
        <group ref={pad} position={[0, 0.41, 0.46]} visible={false}>
          <mesh geometry={BOX} material={mats.pad} scale={[0.22, 0.05, 0.1]} />
          {[-1, 1].map((sx) => (
            <mesh
              key={sx}
              geometry={BOX}
              material={mats.pad}
              position={[sx * 0.1, -0.015, -0.03]}
              rotation={[0, 0, sx * 0.25]}
              scale={[0.07, 0.05, 0.12]}
            />
          ))}
          <mesh
            geometry={BOX}
            material={mats.padKeys}
            position={[0.05, 0.028, 0.01]}
            scale={[0.03, 0.01, 0.03]}
          />
          <mesh
            geometry={BOX}
            material={mats.padKeys}
            position={[-0.05, 0.028, 0.01]}
            scale={[0.04, 0.01, 0.015]}
          />
        </group>

        {/* kollar: omuzdan ve dirsekten döner */}
        {(
          [
            [-0.3, shL, elL],
            [0.3, shR, elR],
          ] as const
        ).map(([x, sh, el]) => (
          <group key={x} ref={sh} position={[x, 0.56, 0]}>
            <mesh
              geometry={BOX}
              material={mats.sleeves}
              position={[0, -0.14, 0]}
              scale={[0.12, 0.3, 0.13]}
              castShadow
            />
            <group ref={el} position={[0, -0.28, 0]}>
              <mesh
                geometry={BOX}
                material={mats.sleeves}
                position={[0, -0.12, 0]}
                scale={[0.11, 0.26, 0.12]}
                castShadow
              />
              <mesh geometry={BOX} material={mats.skin} position={[0, -0.28, 0]} scale={[0.09, 0.09, 0.1]} />
              {x > 0 && (
                <mesh
                  ref={mug}
                  geometry={MUG}
                  material={mats.mug}
                  position={[0, -0.3, 0.06]}
                  visible={false}
                />
              )}
            </group>
          </group>
        ))}

        {/* baş */}
        <group ref={head} position={[0, 0.79, 0]}>
          <mesh geometry={BOX} material={mats.skin} position={[0, -0.12, 0]} scale={[0.1, 0.08, 0.1]} />
          <mesh geometry={HEAD} material={mats.skin} castShadow />
          {/* saç */}
          {style !== 'buzz' && (
            <mesh
              geometry={HAIR_CAP}
              material={mats.hair}
              position={[0, 0.02, -0.015]}
              rotation={[-0.25, 0, 0]}
              castShadow
            />
          )}
          {style === 'buzz' && (
            <mesh
              geometry={HAIR_CAP}
              material={mats.hair}
              position={[0, 0.035, -0.01]}
              rotation={[-0.2, 0, 0]}
              scale={[0.97, 0.75, 0.97]}
            />
          )}
          {style === 'bun' && (
            <mesh geometry={BALL} material={mats.hair} position={[0, 0.2, -0.12]} castShadow />
          )}
          {style === 'long' && (
            <mesh
              geometry={BOX}
              material={mats.hair}
              position={[0, -0.12, -0.12]}
              scale={[0.38, 0.34, 0.12]}
              castShadow
            />
          )}
          {style === 'curly' &&
            [-0.13, 0, 0.13].map((x) => (
              <mesh key={x} geometry={BALL} material={mats.hair} position={[x, 0.15, -0.04]} scale={0.95} />
            ))}
          {/* gözler */}
          {[-0.07, 0.07].map((x) => (
            <mesh
              key={x}
              geometry={BOX}
              material={mats.dark}
              position={[x, 0.01, 0.185]}
              scale={[0.035, 0.05, 0.02]}
            />
          ))}
          <mesh geometry={BOX} material={mats.dark} position={[0, -0.08, 0.18]} scale={[0.07, 0.015, 0.02]} />

          {role === 'developer' && (
            <>
              {/* kulaklık */}
              <mesh
                geometry={BAND}
                material={mats.accent}
                position={[0, 0.02, 0]}
                rotation={[0, Math.PI / 2, 0]}
              />
              {[-0.2, 0.2].map((x) => (
                <mesh
                  key={x}
                  geometry={CUP}
                  material={mats.accent}
                  position={[x, 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                />
              ))}
              <mesh
                geometry={BOX}
                material={mats.accent2}
                position={[0.225, 0, 0]}
                scale={[0.01, 0.07, 0.07]}
              />
            </>
          )}
          {role === 'reviewer' && (
            <>
              {/* gözlük */}
              {[-0.075, 0.075].map((x) => (
                <mesh key={x} geometry={RIM} material={mats.accent} position={[x, 0.012, 0.205]} />
              ))}
              <mesh
                geometry={BOX}
                material={mats.accent}
                position={[0, 0.02, 0.205]}
                scale={[0.06, 0.012, 0.012]}
              />
            </>
          )}
          {role === 'designer' && (
            // bere
            <group position={[0.03, 0.17, -0.01]} rotation={[-0.2, 0, -0.28]}>
              <mesh geometry={BERET} material={mats.accent} castShadow />
              <mesh
                geometry={BOX}
                material={mats.accent}
                position={[0, 0.05, 0]}
                scale={[0.03, 0.04, 0.03]}
              />
            </group>
          )}
          {role === 'researcher' && (
            <mesh
              geometry={BEANIE}
              material={mats.accent}
              position={[0, 0.04, -0.01]}
              rotation={[-0.15, 0, 0]}
              castShadow
            />
          )}
        </group>
      </group>
    </group>
  );
}

/** Karakter boyları (etiketler için): ayakta ve otururken başın üstü. */
export const HEAD_TOP_STANDING = 1.9;
export const HEAD_TOP_SEATED = HEAD_TOP_STANDING - SEAT_DROP;
