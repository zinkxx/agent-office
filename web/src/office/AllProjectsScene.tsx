import { Grid, OrbitControls, RoundedBox } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import type { Agent, Letter } from '../../../shared/types.ts';
import { projectDisplayName } from '../projectActivity.ts';
import { useOffice, useTheme } from '../store.ts';
import { FlyingLetters } from './FlyingLetters.tsx';
import { computeLayout, positionOf, type IslandSlot, type OfficeLayout } from './layout.ts';
import { Label } from './Label.tsx';
import { THEME } from './theme.ts';
import { Helper, Workstation } from './Workstation.tsx';

/** OrbitControls'ten kullandığımız kısım (tip için). */
interface Controls {
  target: Vector3;
  update(): void;
  addEventListener(type: 'start', fn: () => void): void;
  removeEventListener(type: 'start', fn: () => void): void;
}

const FOCUS_OFFSET = new Vector3(3.4, 4.4, 6.2);
const OVERVIEW_DIR = new Vector3(0.45, 0.85, 1).normalize();

function overviewOf(
  bounds: OfficeLayout['bounds'],
  aspect = 16 / 9,
  fovDeg = 38,
): { pos: Vector3; target: Vector3 } {
  const target = new Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  const w = bounds.maxX - bounds.minX + 4;
  const d = bounds.maxZ - bounds.minZ + 4;
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  // Çapraz bakıldığı için genişlik ve derinlik ekranda karışır: ikisinin büyüğünü yatay görüşe sığdır.
  const distance = Math.min(
    80,
    Math.max((Math.hypot(w, d) * 0.44) / Math.tan(hfov / 2), (d * 0.6) / Math.tan(vfov / 2)) + 2,
  );
  return { pos: target.clone().addScaledVector(OVERVIEW_DIR, distance), target };
}

/** Seçilen ajana (ya da seçim yoksa tüm ofise) kamerayı yumuşakça götürür. */
function CameraRig({ layout }: { layout: OfficeLayout }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const focusTick = useOffice((s) => s.focusTick);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const anim = useRef<{ fromPos: Vector3; toPos: Vector3; fromT: Vector3; toT: Vector3; t: number } | null>(
    null,
  );
  /** Hangi kontrol için kadraj yapıldı: görünüm değişince yeni kontrol gelir, yeniden sığdırılır. */
  const fitted = useRef<Controls | null>(null);

  const flyTo = (pos: Vector3, target: Vector3) => {
    if (!controls) return;
    anim.current = {
      fromPos: camera.position.clone(),
      toPos: pos,
      fromT: controls.target.clone(),
      toT: target,
      t: 0,
    };
  };

  const focusCurrent = () => {
    const { selectedId, selectedProject, snapshot } = useOffice.getState();
    const l = layoutRef.current;
    const island = selectedProject ? l.islands.find((i) => i.project === selectedProject) : undefined;
    if (island) {
      // Tıklanan projenin odasını kadraja al: odanın büyüklüğüne göre uzaklaş.
      const target = new Vector3(island.x, 0.6, island.z);
      const k = Math.max(1.6, Math.max(island.w, island.d) / 4.5);
      flyTo(target.clone().addScaledVector(FOCUS_OFFSET, k), target);
      return;
    }
    if (selectedId) {
      // Yanında çizilmeyen (fazladan) yardımcı ajan seçildiyse ana masasına odaklan.
      const agent = snapshot?.agents.find((a) => a.id === selectedId);
      const p = positionOf(l, selectedId) ?? (agent?.parentId ? positionOf(l, agent.parentId) : undefined);
      if (p) {
        const target = new Vector3(p.x, 1.1, p.z);
        flyTo(target.clone().add(FOCUS_OFFSET), target);
        return;
      }
    }
    const o = overviewOf(l.bounds, aspect);
    flyTo(o.pos, o.target);
  };

  // İlk veri geldiğinde tüm ofisi kadraja al.
  useEffect(() => {
    if (controls && fitted.current !== controls && layout.desks.length > 0) {
      fitted.current = controls;
      focusCurrent();
    }
  });

  useEffect(() => {
    if (focusTick > 0) focusCurrent();
  }, [focusTick, controls]);

  // Kullanıcı fareyle sürüklemeye başlarsa animasyonu bırak.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      anim.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / 0.9);
    const k = 1 - Math.pow(1 - a.t, 3); // yavaşlayarak dur
    camera.position.lerpVectors(a.fromPos, a.toPos, k);
    controls.target.lerpVectors(a.fromT, a.toT, k);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });

  return null;
}

/**
 * Bir proje odası: yükseltilmiş zemin, arkada ve yanlarda cam duvar, ışıklı kenar, önde proje adı.
 * Zemine ya da tabelaya tıklayınca proje paneli açılır (masadaki karaktere tıklamak ajanı seçer).
 */
function Island({ island, label, selected }: { island: IslandSlot; label: string; selected: boolean }) {
  const o = useTheme().overview;
  const { x, z, w, d } = island;
  const selectProject = useOffice((s) => s.selectProject);
  const open = () => selectProject(island.project);
  const wallH = 1.1;
  const t = 0.05;
  const walls: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, wallH / 2 + THEME.islandTop, -d / 2], size: [w, wallH, t] },
    { pos: [-w / 2, wallH / 2 + THEME.islandTop, 0], size: [t, wallH, d] },
    { pos: [w / 2, wallH / 2 + THEME.islandTop, 0], size: [t, wallH, d] },
  ];
  return (
    <group position={[x, 0, z]}>
      <RoundedBox
        args={[w, THEME.islandTop, d]}
        radius={0.06}
        position={[0, THEME.islandTop / 2, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <meshStandardMaterial
          color={o.island}
          roughness={0.85}
          metalness={0.05}
          emissive={o.islandEdge}
          emissiveIntensity={selected ? 0.12 : 0}
        />
      </RoundedBox>
      {/* ön ve arka ışıklı kenar şeritleri (seçili odada kalın) */}
      {[d / 2 + 0.005, -d / 2 - 0.005].map((ez) => (
        <mesh key={ez} position={[0, THEME.islandTop - 0.03, ez]}>
          <boxGeometry args={[w - 0.1, selected ? 0.06 : 0.025, selected ? 0.03 : 0.012]} />
          <meshBasicMaterial color={o.islandEdge} toneMapped={false} />
        </mesh>
      ))}
      {/* cam duvarlar ve üst kenarlarındaki ışık */}
      {walls.map((wall, i) => (
        <group key={i}>
          <mesh position={wall.pos}>
            <boxGeometry args={wall.size} />
            <meshPhysicalMaterial
              color={o.glass}
              transparent
              opacity={0.1}
              roughness={0.05}
              metalness={0.1}
              clearcoat={1}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[wall.pos[0], THEME.islandTop + wallH, wall.pos[2]]}>
            <boxGeometry args={[Math.max(wall.size[0], 0.03), 0.025, Math.max(wall.size[2], 0.03)]} />
            <meshBasicMaterial color={o.islandEdge} toneMapped={false} transparent opacity={0.85} />
          </mesh>
        </group>
      ))}
      {/* odanın sıcak tavan ışığı */}
      <pointLight
        position={[0, 4.2, 0]}
        color={o.roomLight}
        intensity={6}
        distance={Math.max(w, d) + 4}
        decay={1.4}
      />
      <Label position={[0, THEME.islandTop + 0.05, d / 2 + 0.55]}>
        <button
          type="button"
          className={`project-sign clickable${selected ? ' selected' : ''}`}
          onClick={open}
          aria-pressed={selected}
          title={label === island.project ? undefined : island.project}
        >
          {label}
        </button>
      </Label>
    </group>
  );
}

/** "Tüm projeler" görünümü: her proje küçük, cam duvarlı bir oda; projeler arası mesajda uçan mektup. */
export function AllProjectsScene({ agents, letters }: { agents: Agent[]; letters: Letter[] }) {
  const layout = useMemo(() => computeLayout(agents), [agents]);
  const selectedId = useOffice((s) => s.selectedId);
  const selectedProject = useOffice((s) => s.selectedProject);
  const showTitles = useOffice((s) => s.settings.showTitles);
  const lowPower = useOffice((s) => s.settings.lowPower);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const theme = useTheme();
  const o = theme.overview;
  const b = layout.bounds;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 4;

  return (
    <>
      <color attach="background" args={[o.background]} />
      <fog attach="fog" args={[o.fog, 35, 110]} />

      <ambientLight intensity={theme.night ? 0.8 : 0.9} color={o.ambient} />
      <hemisphereLight args={[o.hemiSky, o.hemiGround, 1.0]} />
      <directionalLight
        position={[12, 22, 10]}
        intensity={theme.night ? 1.15 : 1.8}
        color={theme.lights.sun.color}
        castShadow={!lowPower}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      {/* yandan gelen sıcak kızıl dolgu ışığı */}
      <directionalLight position={[-14, 8, -6]} intensity={0.5} color={o.fillLight} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={o.floor} roughness={0.9} />
      </mesh>
      <Grid
        position={[0, 0.002, 0]}
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.6}
        cellColor={o.gridCell}
        sectionSize={5}
        sectionThickness={1}
        sectionColor={o.gridSection}
        fadeDistance={70}
        fadeStrength={1.5}
        infiniteGrid
      />

      {layout.islands.map((island) => (
        <Island
          key={island.project}
          island={island}
          label={projectDisplayName(agents, island.project, showTitles)}
          selected={selectedProject === island.project}
        />
      ))}
      {layout.desks.map((desk) => {
        const agent = byId.get(desk.agentId);
        return agent ? <Workstation key={desk.agentId} agent={agent} x={desk.x} z={desk.z} /> : null;
      })}
      {layout.subs.map((slot) => {
        const agent = byId.get(slot.agentId);
        if (!agent) return null;
        const showName = selectedId === agent.id || selectedId === slot.parentId;
        return <Helper key={slot.agentId} agent={agent} x={slot.x} z={slot.z} showName={showName} />;
      })}
      {[...layout.hiddenSubs].map(([parentId, extra]) => {
        const desk = layout.desks.find((d) => d.agentId === parentId);
        return desk ? (
          <Label key={parentId} position={[desk.x + 1.75, 0.5, desk.z + 1.6]}>
            <div className="more-helpers">+{extra}</div>
          </Label>
        ) : null;
      })}

      <FlyingLetters letters={letters} layout={layout} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.25}
        maxPolarAngle={1.2}
        minDistance={3.5}
        maxDistance={80}
        screenSpacePanning={false}
      />
      <CameraRig layout={layout} />
    </>
  );
}
