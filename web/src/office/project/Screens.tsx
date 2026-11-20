import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshBasicMaterial, type Mesh } from 'three';
import type { Agent } from '../../../../shared/types.ts';
import { useOffice } from '../../store.ts';
import { pastimeScreen, screenKindFor, type ScreenBank, type ScreenKind } from '../screens.ts';
import type { OfficePlan } from '../sim/plan.ts';
import { residentId, type OfficeSim } from '../sim/sim.ts';
import type { ScreenSpot } from './furniture.ts';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BRIGHT = new Color(1.15, 1.15, 1.15);
const DIM = new Color(0.55, 0.55, 0.55);

/**
 * Masalardaki ekranlar: oturanın durumuna (ve rolüne) göre sahte içerik gösterir. Kimsenin oturmadığı ya da
 * sahibi kapalı olan masada ekran kapalıdır. Boştaki karakter masasında video izliyor ya da oyun oynuyorsa onu,
 * oyun köşesindeki TV biri konsolda oynarken yarış oyununu gösterir. Dokular ScreenBank'ten paylaşılır.
 */
export function Screens({
  spots,
  plan,
  agents,
  sim,
  bank,
  reduced,
}: {
  spots: ScreenSpot[];
  plan: OfficePlan;
  agents: readonly Agent[];
  sim: OfficeSim;
  bank: ScreenBank;
  reduced: boolean;
}) {
  const meshes = useRef<(Mesh | null)[]>([]);
  // Her ekranın son gösterdiği tür, malzemeyle birlikte kurulur: malzemeler yenilenince (yeni malzemenin
  // rengi BRIGHT) eski türler kalıp parlaklığı yanlış bırakmasın.
  const { materials, kinds } = useMemo(
    () => ({
      materials: spots.map(() => new MeshBasicMaterial({ color: BRIGHT.clone(), toneMapped: false })),
      kinds: [] as (ScreenKind | null)[],
    }),
    [spots],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  // masa → oturan ajan (en güncel durum her karede okunur)
  const bySeat = useRef(new Map<string, Agent>());
  const map = new Map<string, Agent>();
  const byId = new Map(agents.map((a) => [a.id, a]));
  for (const [agentId, seatId] of plan.assignment) {
    const a = byId.get(agentId);
    if (a) map.set(seatId, a);
  }
  bySeat.current = map;
  const memberOf = useRef(new Map<string, string>());
  memberOf.current = new Map(plan.seats.filter((s) => s.member).map((s) => [s.id, s.member!]));

  const lowPower = useOffice((s) => s.settings.lowPower);
  useFrame(() => {
    const now = performance.now();
    bank.tick(now, reduced, lowPower);
    spots.forEach((spot, i) => {
      const mat = materials[i];
      if (!mat) return;
      let kind: ScreenKind;
      let variant = hash(spot.id) % 2;
      if (spot.kind === 'meeting') kind = 'slides';
      else if (spot.kind === 'tv') {
        let playing = false;
        for (const x of sim.actors.values())
          if (x.pastime === 'console' && x.pose === 'sofa' && x.visible) playing = true;
        kind = playing ? 'game' : 'off';
        variant = 1;
      } else {
        const a = spot.seatId ? bySeat.current.get(spot.seatId) : undefined;
        const member = spot.seatId ? memberOf.current.get(spot.seatId) : undefined;
        const real = a ? sim.actors.get(a.id) : undefined;
        const resident = member ? sim.actors.get(residentId(member)) : undefined;
        const actor = real && !real.gone ? real : resident && !resident.gone ? resident : undefined;
        const fun = actor?.atHome ? pastimeScreen(spot.kind, actor.pastime) : null;
        if (fun) {
          kind = fun.kind;
          if (fun.variant !== undefined) variant = fun.variant;
        } else if (a && (actor === real || !actor)) {
          kind = screenKindFor(a.status, a.role);
          // liderin büyük ekranı çalışırken pano gösterir; yan ekran asıl işi
          if (spot.kind === 'big' && kind !== 'off' && kind !== 'idle')
            kind = a.status === 'asking' ? 'ask' : 'dash';
        } else kind = actor ? 'idle' : 'off';
      }
      const tex = bank.get(kind, variant, now);
      if (mat.map !== tex) {
        const hadMap = mat.map !== null;
        mat.map = tex;
        if (!hadMap) mat.needsUpdate = true;
      }
      if (kinds[i] !== kind) {
        kinds[i] = kind;
        mat.color.copy(kind === 'idle' || kind === 'off' ? DIM : BRIGHT);
      }
    });
  });

  return (
    <group>
      {spots.map((s, i) => (
        <mesh
          key={s.id}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          position={s.p as [number, number, number]}
          rotation={[0, s.rotY, 0]}
          material={materials[i]}
        >
          <planeGeometry args={[s.w, s.h]} />
        </mesh>
      ))}
    </group>
  );
}
