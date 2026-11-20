import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type Group } from 'three';
import { MascotSim, type MascotKind } from '../sim/mascot.ts';
import type { OfficePlan } from '../sim/plan.ts';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Palette {
  body: string;
  belly: string;
  dark: string;
  eye: string;
}

const PALETTE: Record<MascotKind, Palette> = {
  cat: { body: '#e08a3c', belly: '#f6e2c8', dark: '#3a2418', eye: '#2a1a12' },
  dog: { body: '#a8743e', belly: '#ecd6b4', dark: '#4a2e1a', eye: '#1a120c' },
  robot: { body: '#b8c0cc', belly: '#6f7a8a', dark: '#2a2f3a', eye: '#5fe0ff' },
};

/** Robotun gözleri ve anteni parlasın (parlama eşiğini aşan renk). */
const ROBOT_GLOW = new Color('#5fe0ff').multiplyScalar(2.4);

/**
 * Proje maskotu: ofiste yol bularak dolaşan kedi, köpek ya da robot. Konum ve duruş her karede `MascotSim`'den
 * okunur; bacaklar yürürken sallanır, otururken arka kısım iner, dururken kuyruk sallanır.
 */
export function Mascot({
  plan,
  kind,
  project,
  reduced,
}: {
  plan: OfficePlan;
  kind: MascotKind;
  project: string;
  reduced: boolean;
}) {
  const sim = useMemo(() => new MascotSim(plan, hash(`${project}:${kind}`)), [project, kind]);
  useEffect(() => sim.setPlan(plan), [sim, plan]);
  sim.reducedMotion = reduced;

  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const legs = useRef<(Group | null)[]>([]);
  const head = useRef<Group>(null);
  const phase = useRef(0);
  const sit = useRef(0);
  const c = PALETTE[kind];
  const robot = kind === 'robot';

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    sim.step(d);
    const s = sim.state;
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.position.set(s.x, 0, s.z);
      root.current.rotation.y = s.heading;
    }
    phase.current += d * s.speed * 9;
    const walking = s.mode === 'walk';
    const target = s.mode === 'sit' ? 1 : 0;
    sit.current += (target - sit.current) * (1 - Math.exp(-6 * d));
    const swing = walking ? Math.sin(phase.current) * 0.6 : 0;
    legs.current.forEach((leg, i) => {
      if (!leg) return;
      const front = i < 2;
      const side = i % 2 === 0 ? 1 : -1;
      // çapraz adım; otururken arka bacaklar öne katlanır
      leg.rotation.x = swing * side * (front ? 1 : -1) + (front ? 0 : -sit.current * 1.2);
    });
    if (body.current) {
      body.current.position.y = (walking ? Math.abs(Math.sin(phase.current)) * 0.02 : 0) - sit.current * 0.06;
      body.current.rotation.x = -sit.current * (robot ? 0.05 : 0.38);
    }
    if (head.current) {
      head.current.rotation.x = sit.current * 0.32;
      head.current.rotation.y = walking || reduced ? 0 : Math.sin(t * 0.7) * 0.4;
    }
    if (tail.current) {
      const wag = kind === 'dog' && !walking ? 2.2 : 0.6;
      tail.current.rotation.y = reduced ? 0 : Math.sin(t * (kind === 'dog' ? 12 : 2)) * 0.35 * wag;
    }
  });

  const legPos: [number, number][] = [
    [0.09, 0.14],
    [-0.09, 0.14],
    [0.09, -0.14],
    [-0.09, -0.14],
  ];
  const legH = robot ? 0.12 : 0.15;

  return (
    <group ref={root}>
      {legPos.map(([x, z], i) => (
        <group
          key={i}
          ref={(g) => {
            legs.current[i] = g;
          }}
          position={[x, legH, z]}
        >
          <mesh position={[0, -legH / 2, 0]} castShadow>
            <boxGeometry args={[0.06, legH, 0.06]} />
            <meshStandardMaterial color={robot ? c.dark : c.body} flatShading roughness={0.7} />
          </mesh>
        </group>
      ))}
      <group ref={body} position={[0, 0, 0]}>
        {/* gövde */}
        <mesh position={[0, legH + 0.09, 0]} castShadow>
          <boxGeometry args={[0.24, robot ? 0.2 : 0.17, kind === 'dog' ? 0.46 : 0.4]} />
          <meshStandardMaterial
            color={c.body}
            flatShading
            roughness={robot ? 0.35 : 0.8}
            metalness={robot ? 0.6 : 0}
          />
        </mesh>
        <mesh position={[0, legH + 0.02, 0.02]}>
          <boxGeometry args={[0.18, 0.04, 0.3]} />
          <meshStandardMaterial color={c.belly} flatShading roughness={0.8} />
        </mesh>
        {/* kafa */}
        <group ref={head} position={[0, legH + 0.22, kind === 'dog' ? 0.26 : 0.22]}>
          {robot ? (
            <>
              <mesh castShadow>
                <boxGeometry args={[0.2, 0.16, 0.16]} />
                <meshStandardMaterial color={c.body} flatShading roughness={0.35} metalness={0.6} />
              </mesh>
              <mesh position={[0, 0.01, 0.081]}>
                <boxGeometry args={[0.15, 0.06, 0.005]} />
                <meshStandardMaterial color={c.dark} roughness={0.3} />
              </mesh>
              {[-0.04, 0.04].map((x) => (
                <mesh key={x} position={[x, 0.01, 0.085]}>
                  <boxGeometry args={[0.025, 0.025, 0.005]} />
                  <meshBasicMaterial color={ROBOT_GLOW} toneMapped={false} />
                </mesh>
              ))}
              <mesh position={[0, 0.13, 0]}>
                <cylinderGeometry args={[0.008, 0.008, 0.1, 5]} />
                <meshStandardMaterial color={c.dark} />
              </mesh>
              <mesh position={[0, 0.19, 0]}>
                <sphereGeometry args={[0.022, 8, 6]} />
                <meshBasicMaterial color={ROBOT_GLOW} toneMapped={false} />
              </mesh>
            </>
          ) : (
            <>
              <mesh castShadow>
                <icosahedronGeometry args={[0.11, 0]} />
                <meshStandardMaterial color={c.body} flatShading roughness={0.8} />
              </mesh>
              {/* burun / ağız */}
              <mesh position={[0, -0.03, kind === 'dog' ? 0.11 : 0.085]}>
                <boxGeometry args={kind === 'dog' ? [0.09, 0.07, 0.1] : [0.07, 0.05, 0.04]} />
                <meshStandardMaterial color={c.belly} flatShading roughness={0.8} />
              </mesh>
              <mesh position={[0, -0.005, kind === 'dog' ? 0.165 : 0.108]}>
                <boxGeometry args={[0.03, 0.025, 0.02]} />
                <meshStandardMaterial color={c.dark} roughness={0.4} />
              </mesh>
              {[-0.045, 0.045].map((x) => (
                <mesh key={x} position={[x, 0.025, 0.095]}>
                  <sphereGeometry args={[0.015, 6, 5]} />
                  <meshStandardMaterial color={c.eye} roughness={0.2} />
                </mesh>
              ))}
              {/* kulaklar: kedide sivri, köpekte sarkık */}
              {[-1, 1].map((side) =>
                kind === 'cat' ? (
                  <mesh key={side} position={[side * 0.06, 0.1, -0.01]} rotation={[0, 0, -side * 0.2]}>
                    <coneGeometry args={[0.04, 0.08, 4]} />
                    <meshStandardMaterial color={c.body} flatShading roughness={0.8} />
                  </mesh>
                ) : (
                  <mesh key={side} position={[side * 0.1, 0.0, -0.01]} rotation={[0, 0, side * 0.25]}>
                    <boxGeometry args={[0.03, 0.11, 0.07]} />
                    <meshStandardMaterial color={c.dark} flatShading roughness={0.8} />
                  </mesh>
                ),
              )}
            </>
          )}
        </group>
        {/* kuyruk (robotta küçük anten-kuyruk) */}
        <group ref={tail} position={[0, legH + 0.14, kind === 'dog' ? -0.23 : -0.2]}>
          <mesh position={[0, 0.07, -0.05]} rotation={[robot ? -0.3 : -0.7, 0, 0]} castShadow>
            <cylinderGeometry args={[0.018, kind === 'cat' ? 0.022 : 0.03, robot ? 0.08 : 0.2, 5]} />
            <meshStandardMaterial color={robot ? c.dark : c.body} flatShading roughness={0.8} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
