import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { Color, Vector3, type Group } from 'three';
import type { Letter } from '../../../shared/types.ts';
import { useOffice } from '../store.ts';
import { Bubble } from './icons.tsx';
import { Label } from './Label.tsx';
import { positionOf, type OfficeLayout } from './layout.ts';

const FLIGHT_MS = 1700;
const ARRIVED_MS = 2200;
const POOL = 6;

interface Flight {
  id: string;
  from: Vector3;
  to: Vector3;
  start: number;
}

const GLOW = new Color('#ffd1dc').multiplyScalar(2.2);

/**
 * Oturumlar arası mesaj ("Tüm projeler" görünümü): gönderenden alıcıya kavisli yoldan uçan zarf, varınca alıcının
 * üstünde zarf balonu. İçerik taşımaz. Hareketi azalt açıkken uçuş atlanır, yalnızca balon görünür.
 */
export function FlyingLetters({ letters, layout }: { letters: Letter[]; layout: OfficeLayout }) {
  const seen = useRef<Set<string> | null>(null);
  const flights = useRef<Flight[]>([]);
  const groups = useRef<(Group | null)[]>([]);
  const [arrivals, setArrivals] = useState<{ id: string; at: Vector3 }[]>([]);
  const reduced = useOffice((s) => s.reducedMotion);

  useEffect(() => {
    // İlk açılıştaki eski mektuplar tekrar uçmaz.
    if (seen.current === null) {
      seen.current = new Set(letters.map((l) => l.id));
      return;
    }
    for (const l of letters) {
      if (seen.current.has(l.id)) continue;
      seen.current.add(l.id);
      const a = positionOf(layout, l.fromId);
      const b = l.toId ? positionOf(layout, l.toId) : undefined;
      if (!a || !b) continue;
      const from = new Vector3(a.x, 2.3, a.z);
      const to = new Vector3(b.x, 2.3, b.z);
      if (reduced) {
        arrive(l.id, to);
        continue;
      }
      flights.current.push({ id: l.id, from, to, start: performance.now() });
      if (flights.current.length > POOL) flights.current.shift();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letters, layout]);

  const arrive = (id: string, at: Vector3) => {
    setArrivals((list) => [...list.filter((x) => x.id !== id), { id, at }]);
    setTimeout(() => setArrivals((list) => list.filter((x) => x.id !== id)), ARRIVED_MS);
  };

  const mid = useRef(new Vector3());
  useFrame(({ clock }) => {
    const now = performance.now();
    const done: Flight[] = [];
    for (let i = 0; i < POOL; i++) {
      const g = groups.current[i];
      const f = flights.current[i];
      if (!g) continue;
      if (!f) {
        g.visible = false;
        continue;
      }
      const t = Math.min(1, (now - f.start) / FLIGHT_MS);
      const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const dist = f.from.distanceTo(f.to);
      mid.current.lerpVectors(f.from, f.to, 0.5).setY(2.3 + Math.max(2, dist * 0.35));
      // ikinci derece Bezier
      const a = (1 - k) * (1 - k);
      const b = 2 * (1 - k) * k;
      const c = k * k;
      g.position.set(
        a * f.from.x + b * mid.current.x + c * f.to.x,
        a * f.from.y + b * mid.current.y + c * f.to.y,
        a * f.from.z + b * mid.current.z + c * f.to.z,
      );
      g.rotation.set(
        0,
        Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z),
        Math.sin(clock.elapsedTime * 9) * 0.25,
      );
      g.visible = true;
      if (t >= 1) done.push(f);
    }
    for (const f of done) {
      flights.current = flights.current.filter((x) => x !== f);
      arrive(f.id, f.to);
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
          visible={false}
        >
          <mesh>
            <boxGeometry args={[0.42, 0.03, 0.3]} />
            <meshStandardMaterial color="#fff1f4" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.02, -0.04]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[0.4, 0.01, 0.2]} />
            <meshStandardMaterial color="#ff9db3" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.04, 0.02]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshBasicMaterial color={GLOW} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {arrivals.map((a) => (
        <Label key={a.id} position={[a.at.x, a.at.y + 0.2, a.at.z]}>
          <Bubble name="mail" />
        </Label>
      ))}
    </>
  );
}
