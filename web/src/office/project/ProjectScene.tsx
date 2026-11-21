import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import type { Agent, AgentRole, Letter, TeamMember } from '../../../../shared/types.ts';
import { ROLE_COLOR, roleGroupLabel } from '../../labels.ts';
import { useBrand, useLang, useOffice, useTheme } from '../../store.ts';
import { frameBox, frameOffice } from '../framing.ts';
import { Label } from '../Label.tsx';
import type { ScreenBank } from '../screens.ts';
import { allSeatsReachable, buildPlan, canPlaceIsland, snapToLayout, type OfficePlan } from '../sim/plan.ts';
import { OfficeSim, residentId } from '../sim/sim.ts';
import { skyTexture } from '../textures.ts';
import { ActorView, SeatLabels } from './Actors.tsx';
import { StaticBatch } from './batch.tsx';
import { buildFurniture, type FurnitureLayout } from './furniture.ts';
import { LayoutEditor } from './LayoutEditor.tsx';
import { Mascot } from './Mascot.tsx';
import { Exterior } from './Exterior.tsx';
import { BrandSurfaces, Door, Floors, Glass, Lights, Tower, Whiteboard } from './Room.tsx';
import { Screens } from './Screens.tsx';
import { TechOps } from './TechOps.tsx';

interface Controls {
  target: Vector3;
  update(): void;
  addEventListener(type: 'start', fn: () => void): void;
  removeEventListener(type: 'start', fn: () => void): void;
}

const FOLLOW_OFFSET = new Vector3(2.6, 3.6, 5.2);

/**
 * Tüm ofisi ekrana sığdıran kamera konumu: açı ve hedef ekranın en-boy oranına göre seçilir (bkz. framing.ts).
 */
function overview(plan: OfficePlan, fovDeg: number, aspect: number): { pos: Vector3; target: Vector3 } {
  return frameOffice(frameBox(plan, aspect), fovDeg, aspect);
}

/**
 * Kamera: başta tüm ofis; bir karakter seçilince ona uçar ve yürürken takip eder. Kullanıcı sürükleyince
 * uçuş bırakılır ama takip sürer (karakterin etrafında dönülebilir). Kaydırma oda sınırında tutulur.
 */
function CameraRig({ plan, sim }: { plan: OfficePlan; sim: OfficeSim }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const fit = () =>
    overview(
      planRef.current,
      (camera as unknown as { fov: number }).fov ?? 38,
      sizeRef.current.width / Math.max(1, sizeRef.current.height),
    );
  const focusTick = useOffice((s) => s.focusTick);
  const planRef = useRef(plan);
  planRef.current = plan;
  const fly = useRef<{ fromPos: Vector3; toPos: Vector3; fromT: Vector3; toT: Vector3; t: number } | null>(
    null,
  );
  const followed = useRef<{ id: string; last: Vector3 } | null>(null);
  const started = useRef(false);
  /** Kullanıcı kamerayı elle oynattı mı (oynatmadıysa boyut değişince yeniden kadraj alınır). */
  const touched = useRef(false);
  const ox = plan.width / 2;
  const oz = plan.depth / 2;

  const actorWorld = (id: string): Vector3 | null => {
    const a = sim.actors.get(id);
    if (!a || !a.visible) return null;
    return new Vector3(a.x - planRef.current.width / 2, 1.0, a.z - planRef.current.depth / 2);
  };

  const focus = () => {
    if (!controls) return;
    const id = useOffice.getState().selectedId;
    const p = id ? actorWorld(id) : null;
    if (id && p) {
      followed.current = { id, last: p.clone() };
      fly.current = {
        fromPos: camera.position.clone(),
        toPos: p.clone().add(FOLLOW_OFFSET),
        fromT: controls.target.clone(),
        toT: p,
        t: 0,
      };
    } else {
      followed.current = null;
      const o = fit();
      fly.current = {
        fromPos: camera.position.clone(),
        toPos: o.pos,
        fromT: controls.target.clone(),
        toT: o.target,
        t: 0,
      };
    }
  };

  useEffect(() => {
    if (!controls) return;
    if (!started.current) {
      started.current = true;
      const o = fit();
      camera.position.copy(o.pos);
      controls.target.copy(o.target);
      controls.update();
      if (useOffice.getState().selectedId) focus();
      return;
    }
    focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick, controls]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      fly.current = null;
      touched.current = true;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  // Çizim alanının boyu ilk karede henüz kesin olmayabilir (panel açılırken daralır): kullanıcı kamerayı
  // oynatmadıysa ve kimse seçili değilse kadrajı yeni boyuta göre yeniden al.
  useEffect(() => {
    if (!controls || !started.current || touched.current || followed.current || fly.current) return;
    const o = fit();
    camera.position.copy(o.pos);
    controls.target.copy(o.target);
    controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, controls, plan.width, plan.depth]);

  useFrame((_, dt) => {
    if (!controls) return;
    const reduced = useOffice.getState().reducedMotion;
    const f = fly.current;
    if (f) {
      f.t = Math.min(1, f.t + dt / (reduced ? 0.01 : 0.9));
      const k = 1 - Math.pow(1 - f.t, 3);
      camera.position.lerpVectors(f.fromPos, f.toPos, k);
      controls.target.lerpVectors(f.fromT, f.toT, k);
      if (f.t >= 1) fly.current = null;
    } else if (followed.current) {
      // takip: karakter yürüdükçe kamera da aynı kadar kayar
      const p = actorWorld(followed.current.id);
      if (p) {
        const delta = p
          .clone()
          .sub(followed.current.last)
          .multiplyScalar(1 - Math.exp(-6 * Math.min(dt, 0.1)));
        followed.current.last.add(delta);
        camera.position.add(delta);
        controls.target.add(delta);
      }
    }
    // kaydırma sınırı: odanın dışına çok çıkılmasın
    const t = controls.target;
    const cx = Math.min(ox + 2, Math.max(-ox - 2, t.x));
    const cz = Math.min(oz + 2, Math.max(-oz - 2, t.z));
    const cy = Math.min(3, Math.max(0, t.y));
    if (cx !== t.x || cz !== t.z || cy !== t.y) {
      camera.position.x += cx - t.x;
      camera.position.z += cz - t.z;
      t.set(cx, cy, cz);
    }
    controls.update();
  });

  return null;
}

export function ProjectScene({
  project,
  agents,
  team,
  letters,
  bank,
  serverNow,
}: {
  project: string;
  agents: Agent[];
  team: TeamMember[];
  letters: Letter[];
  bank: ScreenBank;
  /** Anlık görüntünün sunucu saati (boşta kalma süreleri için). */
  serverNow: number;
}) {
  const reduced = useOffice((s) => s.reducedMotion);
  const roleFilter = useOffice((s) => s.roleFilter);
  const scene = useThree((s) => s.scene);
  const theme = useTheme();
  const brand = useBrand();
  const lang = useLang();

  // Kat planı: önceki atamalar korunur (karakterler yer değiştirmesin).
  const planRef = useRef<OfficePlan | null>(null);
  const savedLayout = useOffice((s) => s.layouts[project]);
  const editing = useOffice((s) => s.editingLayout);
  const mascot = useOffice((s) => s.settings.mascots[project]);
  const plan = useMemo(() => {
    const p = buildPlan({ project, agents, team, previous: planRef.current, layout: savedLayout });
    planRef.current = p;
    return p;
  }, [project, agents, team, savedLayout]);

  // Düzenleyiciye adaları ve taşıma işlemini sun (DOM'daki ok düğmeleri de bunu kullanır).
  useEffect(() => {
    useOffice.setState({
      layoutEditor: {
        project,
        islands: plan.islands.map((i) => ({ id: i.id, role: i.role, x: i.x, z: i.z })),
        move: (islandId, x, z) => {
          const nx = snapToLayout(x);
          const nz = snapToLayout(z);
          if (!canPlaceIsland(plan, islandId, nx, nz)) return 'blocked';
          const layout = { ...(savedLayout ?? {}), [islandId]: { x: nx, z: nz } };
          const candidate = buildPlan({ project, agents, team, previous: plan, layout });
          const moved = candidate.islands.find((i) => i.id === islandId);
          if (!moved || moved.x !== nx || moved.z !== nz) return 'blocked';
          if (!allSeatsReachable(candidate)) return 'path';
          useOffice.getState().saveIsland(project, islandId, { x: nx, z: nz });
          return 'ok';
        },
      },
    });
  }, [plan, project, agents, team, savedLayout]);
  useEffect(() => () => useOffice.setState({ layoutEditor: null }), []);

  // Mobilyalar yalnızca odanın biçimi değişince yeniden kurulur.
  const layoutRef = useRef<{ key: string; layout: FurnitureLayout } | null>(null);
  const furnitureKey = `${plan.shapeKey}|${theme.id}|${brand}`;
  if (!layoutRef.current || layoutRef.current.key !== furnitureKey) {
    layoutRef.current = { key: furnitureKey, layout: buildFurniture(plan, theme) };
  }
  const layout = layoutRef.current.layout;

  const sim = useMemo(() => new OfficeSim({ reducedMotion: reduced }), [project]);
  sim.reducedMotion = reduced;
  // Geliştirme sırasında tarayıcı konsolundan incelemek için (üretim derlemesinde yok).
  const gl = useThree((s) => s.gl);
  const debugCamera = useThree((s) => s.camera);
  const debugControls = useThree((s) => s.controls);
  if (import.meta.env.DEV)
    (window as unknown as { __ajanOfisi?: unknown }).__ajanOfisi = {
      sim,
      plan,
      agents,
      gl,
      scene,
      camera: debugCamera,
      controls: debugControls,
    };
  // Proje ofisi kapanınca eski simülasyon bellekte kalmasın (yalnızca hâlâ bizimkiyse silinir).
  useEffect(
    () => () => {
      if (!import.meta.env.DEV) return;
      const w = window as unknown as { __ajanOfisi?: { sim?: unknown } };
      if (w.__ajanOfisi?.sim === sim) delete w.__ajanOfisi;
    },
    [sim],
  );

  useLayoutEffect(() => {
    sim.setPlan(plan);
    sim.sync(
      agents,
      letters.filter((l) => agents.some((a) => a.id === l.fromId)),
      serverNow,
    );
  }, [sim, plan, agents, letters, serverNow]);

  useFrame((_, dt) => sim.step(dt), -1);

  // temanın gökyüzü
  useEffect(() => {
    const prev = scene.background;
    scene.background = skyTexture(theme.sky);
    return () => {
      scene.background = prev;
    };
  }, [scene, theme.sky]);

  // Çalışmayan ekip üyeleri: ofiste boşta dolaşan karakterler (yalnızca sahnede; listede ve panelde yoklar).
  const memberKey = plan.seats
    .filter((s) => s.member)
    .map((s) => `${s.member}/${s.role}`)
    .join(',');
  const residents = useMemo<Agent[]>(
    () =>
      plan.seats
        .filter((s) => s.member)
        .map((s) => ({
          id: residentId(s.member!),
          name: s.member!,
          project,
          kind: 'subagent',
          role: s.role,
          agentType: s.member!,
          status: 'idle',
          lastActivityAt: 0,
          recent: [],
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberKey, project],
  );
  // Ekip üyesinin masasındaki yardımcı, boştaki hâliyle aynı kişi görünür.
  const lookKeyOf = (a: Agent): string | undefined => {
    const seatId = plan.assignment.get(a.id);
    const member = seatId ? plan.seats.find((s) => s.id === seatId)?.member : undefined;
    return member && a.kind === 'subagent' ? residentId(member) : undefined;
  };

  const hidden = useMemo(() => {
    if (roleFilter.length === 0) return new Set<AgentRole>();
    return new Set<AgentRole>(
      (
        [
          'lead',
          'designer',
          'developer',
          'tester',
          'reviewer',
          'researcher',
          'architect',
          'other',
        ] as AgentRole[]
      ).filter((r) => !roleFilter.includes(r)),
    );
  }, [roleFilter]);

  return (
    <>
      <fog attach="fog" args={[theme.fog.color, theme.fog.near, theme.fog.far]} />
      <Lights plan={plan} theme={theme} />
      <group position={[-plan.width / 2, 0, -plan.depth / 2]}>
        <Floors plan={plan} layout={layout} theme={theme} />
        <StaticBatch parts={layout.parts} />
        <Glass layout={layout} theme={theme} />
        <Whiteboard layout={layout} />
        <Door layout={layout} sim={sim} reduced={reduced} theme={theme} />
        <Exterior plan={plan} theme={theme} reduced={reduced} />
        <Tower plan={plan} theme={theme} />
        <BrandSurfaces layout={layout} theme={theme} brand={brand} lang={lang} />
        <Screens spots={layout.screens} plan={plan} agents={agents} sim={sim} bank={bank} reduced={reduced} />
        <TechOps plan={plan} agents={agents} team={team} sim={sim} reduced={reduced} />
        {agents.map((a) => (
          <ActorView
            key={a.id}
            agent={a}
            sim={sim}
            dimmed={hidden.has(a.role)}
            reduced={reduced}
            lookKey={lookKeyOf(a)}
          />
        ))}
        {residents.map((a) => (
          <ActorView
            key={a.id}
            agent={a}
            sim={sim}
            dimmed={hidden.has(a.role)}
            reduced={reduced}
            lookKey={a.id}
            selectable={false}
          />
        ))}
        <SeatLabels plan={plan} agents={agents} sim={sim} hiddenRoles={hidden} />
        {editing && <LayoutEditor plan={plan} />}
        {mascot && <Mascot plan={plan} kind={mascot} project={project} reduced={reduced} />}
        {layout.islandLabels.map((l, i) => (
          <Label key={`${l.role}${i}`} kind="sign" position={[l.x, 0.05, l.z]}>
            <div className="island-sign" style={{ ['--role-color' as string]: ROLE_COLOR[l.role] }}>
              {roleGroupLabel(l.role, lang)}
            </div>
          </Label>
        ))}
      </group>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.3}
        maxPolarAngle={1.2}
        minAzimuthAngle={-1.05}
        maxAzimuthAngle={1.05}
        minDistance={3}
        maxDistance={60}
        screenSpacePanning={false}
      />
      <CameraRig plan={plan} sim={sim} />
    </>
  );
}
