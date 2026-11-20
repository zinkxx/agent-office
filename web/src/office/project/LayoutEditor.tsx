import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { Color, Plane, Vector3 } from 'three';
import { ROLE_COLOR } from '../../labels.ts';
import { useOffice } from '../../store.ts';
import {
  canPlaceIsland,
  islandFootprint,
  snapToLayout,
  type Island,
  type OfficePlan,
  type Rect,
} from '../sim/plan.ts';

/** OrbitControls'ten kullandığımız kısım. */
interface Controls {
  enabled: boolean;
}

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
const OK = new Color('#4ee08a');
const BAD = new Color('#ff4d5e');

/** Yere yatık dikdörtgen çerçeve (dört ince kutu). */
function Frame({
  r,
  color,
  y = 0.03,
  width = 0.06,
}: {
  r: Rect;
  color: Color | string;
  y?: number;
  width?: number;
}) {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const bars: [number, number, number, number][] = [
    [cx, r.z0, w, width],
    [cx, r.z1, w, width],
    [r.x0, cz, width, d],
    [r.x1, cz, width, d],
  ];
  return (
    <>
      {bars.map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[sx, 0.02, sz]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

interface Drag {
  id: string;
  /** İmlecin ada merkezine göre kayması (tutulan yer sabit kalsın). */
  dx: number;
  dz: number;
  x: number;
  z: number;
  valid: boolean;
}

/**
 * Düzenleme modu: her adanın altında tutulup sürüklenebilen yarı saydam zemin. Sürüklerken hayalet ada
 * ızgaraya oturur; geçerli yerde yeşil, geçersizde kırmızıdır. Bırakınca taşıma denenir (yol kapanıyorsa
 * reddedilir). Bileşen, odanın yerel koordinatlarındaki grubun içinde çizilir.
 */
export function LayoutEditor({ plan }: { plan: OfficePlan }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const canvas = useThree((s) => s.gl.domElement);
  const selected = useOffice((s) => s.editIsland);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const hit = useRef(new Vector3());
  const area = plan.area;
  const ox = plan.width / 2;
  const oz = plan.depth / 2;

  /** İmlecin yerdeki noktası (odanın yerel koordinatları). */
  const floorPoint = (e: ThreeEvent<PointerEvent>): { x: number; z: number } | null => {
    const p = e.ray.intersectPlane(FLOOR, hit.current);
    return p ? { x: p.x + ox, z: p.z + oz } : null;
  };

  const start = (island: Island) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = floorPoint(e);
    if (!p) return;
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    if (controls) controls.enabled = false;
    useOffice.getState().setEditIsland(island.id);
    setDrag({ id: island.id, dx: p.x - island.x, dz: p.z - island.z, x: island.x, z: island.z, valid: true });
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    e.stopPropagation();
    const p = floorPoint(e);
    if (!p) return;
    const x = snapToLayout(p.x - drag.dx);
    const z = snapToLayout(p.z - drag.dz);
    if (x === drag.x && z === drag.z) return;
    setDrag({ ...drag, x, z, valid: canPlaceIsland(plan, drag.id, x, z) });
  };

  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    e.stopPropagation();
    try {
      (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* zaten bırakılmış */
    }
    if (controls) controls.enabled = true;
    const island = plan.islands.find((i) => i.id === drag.id);
    const moved = island && (island.x !== drag.x || island.z !== drag.z);
    if (moved) {
      const result = useOffice.getState().layoutEditor?.move(drag.id, drag.x, drag.z);
      useOffice.setState({
        editNote:
          result === 'ok'
            ? 'Ada taşındı.'
            : result === 'path'
              ? 'Buraya konamaz: kapıdan bazı masalara yol kapanıyor.'
              : 'Buraya konamaz: odanın dışında ya da başka bir adaya çok yakın.',
      });
    }
    setDrag(null);
  };

  // R3F nesnedeki onPointerCancel/onLostPointerCapture'ı çağırmıyor: sürükleme sürerken tarayıcının iptalini
  // ve pencerenin odağı kaybetmesini doğrudan dinleyip sürüklemeyi bırakıyoruz.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const stop = () => {
      if (controls) controls.enabled = true;
      setDrag(null);
    };
    canvas.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      canvas.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [dragging, canvas, controls]);

  // Düzenleme kapanınca (ör. sürükleme sırasında Esc) kamera kontrolü ve imleç mutlaka eski haline döner.
  useEffect(
    () => () => {
      if (controls) controls.enabled = true;
      document.body.style.cursor = '';
    },
    [controls],
  );

  const ghost = drag ? plan.islands.find((i) => i.id === drag.id) : undefined;
  /** Sürüklenen adanın hayaletinin kapladığı yer. */
  const gf = drag && ghost ? islandFootprint({ ...ghost, x: drag.x, z: drag.z }) : null;

  return (
    <group>
      {/* adaların taşınabileceği alan */}
      <Frame r={area} color="#ffffff" y={0.015} width={0.04} />
      {plan.islands.map((island) => {
        const f = islandFootprint(island);
        const active = selected === island.id || hover === island.id || drag?.id === island.id;
        return (
          <group key={island.id}>
            <mesh
              position={[(f.x0 + f.x1) / 2, 0.02, (f.z0 + f.z1) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerDown={start(island)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(island.id);
                document.body.style.cursor = 'grab';
              }}
              onPointerOut={() => {
                setHover((h) => (h === island.id ? null : h));
                document.body.style.cursor = '';
              }}
            >
              <planeGeometry args={[f.x1 - f.x0, f.z1 - f.z0]} />
              <meshBasicMaterial
                color={ROLE_COLOR[island.role]}
                transparent
                opacity={active ? 0.32 : 0.14}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {active && <Frame r={f} color={ROLE_COLOR[island.role]} />}
          </group>
        );
      })}
      {drag && gf && (
        <group>
          <mesh position={[(gf.x0 + gf.x1) / 2, 0.05, (gf.z0 + gf.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[gf.x1 - gf.x0, gf.z1 - gf.z0]} />
            <meshBasicMaterial
              color={drag.valid ? OK : BAD}
              transparent
              opacity={0.35}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <Frame r={gf} color={drag.valid ? OK : BAD} y={0.06} />
        </group>
      )}
    </group>
  );
}
