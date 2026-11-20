import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import type { OfficePlan } from '../sim/plan.ts';
import { buildingTextures } from '../textures.ts';
import type { OfficeTheme } from '../themes.ts';
import { StaticBatch } from './batch.tsx';
import {
  BUILDING_CLASSES,
  CAR_COLORS,
  CURB_H,
  OUTSIDE_Y,
  buildExterior,
  type BuildingSpot,
  type Road,
} from './exterior.ts';

/**
 * Kulenin çevresindeki şehir (Sürüm 6): uzak zemin, asfalt, kaldırımlı bloklar ve eşyalar (toplu çizim), pencereli
 * bina gövdeleri (çatıları düz renk) ve yollarda dolaşan arabalar. Yerleşim `exterior.ts`'te (saf, testli).
 */
export function Exterior({
  plan,
  theme,
  reduced,
}: {
  plan: OfficePlan;
  theme: OfficeTheme;
  reduced: boolean;
}) {
  const layout = useMemo(
    () => buildExterior({ width: plan.width, depth: plan.depth }, theme),
    [plan.width, plan.depth, theme],
  );
  const byClass = useMemo(() => {
    const groups = BUILDING_CLASSES.map(() => [] as BuildingSpot[]);
    for (const b of layout.buildings) groups[b.cls]!.push(b);
    return groups;
  }, [layout]);
  const a = layout.asphalt;
  const O = theme.outside;
  return (
    <group name="exterior">
      {/* uzak zemin ve asfalt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[plan.width / 2, OUTSIDE_Y - 0.03, plan.depth / 2]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={O.ground} roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(a.x0 + a.x1) / 2, OUTSIDE_Y - 0.005, (a.z0 + a.z1) / 2]}
        receiveShadow
      >
        <planeGeometry args={[a.x1 - a.x0, a.z1 - a.z0]} />
        <meshStandardMaterial color={O.road} roughness={0.92} />
      </mesh>
      <StaticBatch parts={layout.parts} />
      {BUILDING_CLASSES.map((cls, i) => (
        <Buildings key={i} index={i} items={byClass[i]!} theme={theme} />
      ))}
      <Traffic roads={layout.traffic} night={theme.night} reduced={reduced} />
      {theme.night && <LampPools pools={layout.pools} color={theme.city.streetLamp} />}
    </group>
  );
}

/** Bir sınıfın binaları tek örnekli çizimde: yan yüzlerde pencere dokusu, üstte düz çatı. */
function Buildings({ index, items, theme }: { index: number; items: BuildingSpot[]; theme: OfficeTheme }) {
  const cls = BUILDING_CLASSES[index]!;
  const mesh = useRef<InstancedMesh>(null);
  const materials = useMemo(() => {
    const { map, glow } = buildingTextures(index + 11, cls.cols, cls.rows, theme.city);
    const side = new MeshStandardMaterial({
      map,
      emissiveMap: glow,
      emissive: new Color('#ffffff'),
      emissiveIntensity: theme.city.glow,
      roughness: 0.9,
    });
    const roof = new MeshStandardMaterial({ color: theme.outside.roofs[index % 3], roughness: 0.95 });
    return [side, roof] as Material[];
  }, [index, cls, theme]);
  useLayoutEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const geometry = useMemo(() => sideRoofBox(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const im = mesh.current;
    if (!im) return;
    const m = new Matrix4();
    items.forEach((it, i) => {
      const h = cls.h * it.s;
      m.compose(
        new Vector3(it.x, OUTSIDE_Y + CURB_H + h / 2, it.z),
        new Quaternion(),
        new Vector3(cls.w * it.s, h, cls.d * it.s),
      );
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [items, cls]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={items.length}
      ref={mesh}
      args={[geometry, materials, items.length]}
      frustumCulled={false}
      receiveShadow
    />
  );
}

/**
 * Birim kutu, yüzleri iki gruba ayrılmış: 0 yanlar (pencereli doku), 1 üst ve alt (düz çatı). BoxGeometry'nin
 * altı yüz grubu her sınıfı altı kez çizdirirdi.
 */
function sideRoofBox(): BoxGeometry {
  const g = new BoxGeometry(1, 1, 1);
  const index = g.getIndex()!;
  const src = Array.from(index.array);
  // yüz sırası: +x, -x, +y, -y, +z, -z; her yüz 6 indis
  const face = (f: number) => src.slice(f * 6, f * 6 + 6);
  const order = [...face(0), ...face(1), ...face(4), ...face(5), ...face(2), ...face(3)];
  g.setIndex(order);
  g.clearGroups();
  g.addGroup(0, 24, 0);
  g.addGroup(24, 12, 1);
  return g;
}

// ---------- trafik ----------

interface Car {
  road: Road;
  u0: number;
  speed: number;
  dir: 1 | -1;
}

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

/** Sağdan akan trafik: her yolda iki yönde birkaç araba, yolun sonunda baştan girer (sis içinde). */
function Traffic({ roads, night, reduced }: { roads: Road[]; night: boolean; reduced: boolean }) {
  const cars = useMemo(() => {
    const r = seeded(4242);
    const out: Car[] = [];
    for (const road of roads) {
      const n = Math.max(2, Math.floor((road.to - road.from) / 24));
      for (let i = 0; i < n; i++)
        out.push({
          road,
          u0: r() * (road.to - road.from),
          speed: 5 + r() * 4,
          dir: i % 2 === 0 ? 1 : -1,
        });
    }
    return out;
  }, [roads]);
  const meshes = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    const make = (mat: Material, count: number) => {
      const m = new InstancedMesh(box, mat, count);
      m.frustumCulled = false;
      return m;
    };
    const body = make(new MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }), cars.length);
    const cabin = make(
      new MeshStandardMaterial({ color: night ? '#1a2230' : '#3a4a5a', roughness: 0.2, metalness: 0.4 }),
      cars.length,
    );
    const lights = make(new MeshBasicMaterial({ toneMapped: false }), cars.length * 2);
    const c = new Color();
    const r = seeded(99);
    cars.forEach((_, i) => {
      body.setColorAt(i, c.set(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]!));
      lights.setColorAt(i * 2, c.set(night ? '#fff2c8' : '#e9e6ea').multiplyScalar(night ? 2.4 : 1));
      lights.setColorAt(i * 2 + 1, c.set(night ? '#ff3b4e' : '#8a2a2a').multiplyScalar(night ? 2 : 1));
    });
    return { box, body, cabin, lights };
  }, [cars, night]);
  useEffect(
    () => () => {
      meshes.box.dispose();
      for (const m of [meshes.body, meshes.cabin, meshes.lights]) (m.material as Material).dispose();
    },
    [meshes],
  );
  const o = useMemo(() => new Object3D(), []);
  const place = (t: number) => {
    const y = OUTSIDE_Y;
    cars.forEach((car, i) => {
      const { road } = car;
      const len = road.to - road.from;
      const u = (((car.u0 + car.speed * t) % len) + len) % len;
      const along = car.dir > 0 ? road.from + u : road.to - u;
      // ileri yön ve sağ şerit
      const fx = road.axis === 'x' ? car.dir : 0;
      const fz = road.axis === 'z' ? car.dir : 0;
      const lane = 1.75;
      const x = (road.axis === 'x' ? along : road.at) - fz * lane;
      const z = (road.axis === 'z' ? along : road.at) + fx * lane;
      const yaw = Math.atan2(fx, fz);
      const set = (
        mesh: InstancedMesh,
        idx: number,
        ox: number,
        oy: number,
        oz: number,
        sx: number,
        sy: number,
        sz: number,
      ) => {
        o.position.set(
          x + Math.sin(yaw) * oz + Math.cos(yaw) * ox,
          y + oy,
          z + Math.cos(yaw) * oz - Math.sin(yaw) * ox,
        );
        o.rotation.set(0, yaw, 0);
        o.scale.set(sx, sy, sz);
        o.updateMatrix();
        mesh.setMatrixAt(idx, o.matrix);
      };
      set(meshes.body, i, 0, 0.55, 0, 1.8, 0.7, 4.1);
      set(meshes.cabin, i, 0, 1.15, -0.25, 1.6, 0.6, 2.1);
      set(meshes.lights, i * 2, 0, 0.6, 2.06, 1.5, 0.16, 0.04);
      set(meshes.lights, i * 2 + 1, 0, 0.62, -2.06, 1.5, 0.14, 0.04);
    });
    for (const m of [meshes.body, meshes.cabin, meshes.lights]) m.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => place(0), [meshes]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }) => {
    if (!reduced) place(clock.elapsedTime);
  });
  return (
    <group>
      <primitive object={meshes.body} />
      <primitive object={meshes.cabin} />
      <primitive object={meshes.lights} />
    </group>
  );
}

/** Gece lambaların yerde bıraktığı yumuşak ışık lekeleri: kenara doğru solan, ışığa eklenen (saydam) tek çizim. */
function LampPools({ pools, color }: { pools: { x: number; z: number }[]; color: string }) {
  const mesh = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const map = new CanvasTexture(c);
    const material = new MeshBasicMaterial({
      map,
      color: new Color(color),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const m = new InstancedMesh(
      new PlaneGeometry(6.5, 6.5).rotateX(-Math.PI / 2),
      material,
      Math.max(1, pools.length),
    );
    const o = new Object3D();
    pools.forEach((p, i) => {
      o.position.set(p.x, OUTSIDE_Y + CURB_H + 0.03, p.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = pools.length;
    m.frustumCulled = false;
    m.renderOrder = 1;
    return m;
  }, [pools, color]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      const mat = mesh.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}
