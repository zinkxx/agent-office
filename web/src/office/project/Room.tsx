import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, type Group, type Texture } from 'three';
import { useOffice } from '../../store.ts';
import { ambientBoost, pickPointLights } from '../power.ts';
import type { OfficePlan } from '../sim/plan.ts';
import type { OfficeTheme } from '../themes.ts';
import type { OfficeSim } from '../sim/sim.ts';
import type { BrandId } from '../brand.ts';
import {
  BRAND,
  brandIconTexture,
  brandLogoTexture,
  brandPlaqueTexture,
  brandWordTexture,
  carpetTexture,
  entranceMatTexture,
  rugTexture,
  tileTexture,
  towerTextures,
  whiteboardTexture,
  woodFloorTexture,
} from '../textures.ts';
import { OUTSIDE_Y } from './exterior.ts';
import type { Decal, FurnitureLayout } from './furniture.ts';

/**
 * Ofis bir kulenin katıdır: dışarısı (şehir, yol, zemin; bkz. Exterior) bu kadar aşağıdadır. Odanın altında alt
 * katların cephesi görünür (bkz. Tower).
 */
export { OUTSIDE_Y };
/** Odanın zemininin altındaki kat bandının (döşeme) kalınlığı. */
const SLAB_H = 0.9;

/** Zemin: parke, ada altlarında halı karo, kilimler; dışarıda karanlık zemin. */
export function Floors({
  plan,
  layout,
  theme,
}: {
  plan: OfficePlan;
  layout: FurnitureLayout;
  theme: OfficeTheme;
}) {
  const wood = useMemo(() => {
    const t = woodFloorTexture(theme.floor).clone();
    t.repeat.set(plan.width / 2.2, plan.depth / 2.2);
    t.needsUpdate = true;
    return t;
  }, [plan.width, plan.depth, theme.floor]);
  const carpets = useMemo(
    () =>
      layout.carpets.map((c) => {
        const t = carpetTexture(theme.carpet).clone();
        t.repeat.set(c.w, c.d);
        t.needsUpdate = true;
        return { ...c, t };
      }),
    [layout.carpets, theme.carpet],
  );
  const rugTex = {
    lounge: rugTexture(3, ...theme.rugs.lounge),
    lead: rugTexture(8, ...theme.rugs.lead),
    meeting: rugTexture(12, ...theme.rugs.meeting),
  };
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[plan.width / 2, 0, plan.depth / 2]} receiveShadow>
        <planeGeometry args={[plan.width, plan.depth]} />
        <meshStandardMaterial map={wood} roughness={0.5} metalness={0.05} color={theme.floor.tint} />
      </mesh>
      {carpets.map((c, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[c.x, 0.004, c.z]} receiveShadow>
          <planeGeometry args={[c.w, c.d]} />
          <meshStandardMaterial map={c.t} roughness={0.95} />
        </mesh>
      ))}
      {layout.rugs.map((r, i) => (
        <mesh key={`r${i}`} rotation={[-Math.PI / 2, 0, r.rotY]} position={[r.x, 0.008, r.z]} receiveShadow>
          <planeGeometry args={[r.w, r.d]} />
          <meshStandardMaterial map={rugTex[r.kind]} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Pencere camları ve toplantı odası camları (tek, paylaşılan saydam malzeme). */
export function Glass({ layout, theme }: { layout: FurnitureLayout; theme: OfficeTheme }) {
  return (
    <group>
      {layout.glass.map((g, i) => (
        <mesh key={i} position={g.p as [number, number, number]} rotation={[0, g.rotY, 0]}>
          <boxGeometry args={g.s as [number, number, number]} />
          <meshPhysicalMaterial
            color={theme.room.glass}
            transparent
            opacity={0.12}
            roughness={0.05}
            metalness={0.1}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Whiteboard({ layout }: { layout: FurnitureLayout }) {
  const wb = layout.whiteboard;
  return (
    <mesh position={wb.p as [number, number, number]} rotation={[0, wb.rotY, 0]}>
      <planeGeometry args={[wb.w, wb.h]} />
      <meshStandardMaterial map={whiteboardTexture()} roughness={0.35} />
    </mesh>
  );
}

/** Kayar cam kapı: yakınında biri varken açılır. */
export function Door({
  layout,
  sim,
  reduced,
  theme,
}: {
  layout: FurnitureLayout;
  sim: OfficeSim;
  reduced: boolean;
  theme: OfficeTheme;
}) {
  const panel = useRef<Group>(null);
  const open = useRef(0);
  const d = layout.door;
  useFrame((_, dt) => {
    let near = false;
    for (const a of sim.actors.values()) {
      if (!a.visible) continue;
      if (Math.abs(a.x - d.x) < 1.8 && Math.abs(a.z - d.z) < 1.6) near = true;
    }
    const target = near ? 1 : 0;
    open.current += (target - open.current) * (reduced ? 1 : 1 - Math.exp(-6 * Math.min(dt, 0.1)));
    if (panel.current) panel.current.position.z = d.z - open.current * (d.width - 0.1);
  });
  return (
    <group ref={panel} position={[d.x + 0.02, 0, d.z]}>
      <mesh position={[0, 1.17, 0]}>
        <boxGeometry args={[0.04, 2.3, d.width - 0.06]} />
        <meshPhysicalMaterial
          color={theme.room.door}
          transparent
          opacity={0.22}
          roughness={0.1}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0.03, 1.1, d.width / 2 - 0.15]}>
        <boxGeometry args={[0.03, 0.5, 0.03]} />
        <meshStandardMaterial color="#c8c0c4" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Işıklar: sıcak ortam ışığı, gölgeli ay ışığı, sarkıt lambaların sıcak noktaları (en fazla 8; düşük güç
 * modunda 4, en az biri bölge lambası, gölgesiz ve ortam ışığı biraz güçlü; bkz. power.ts).
 * Dünya koordinatlarında çizilir: oda (0,0) merkezlidir, yönlü ışığın hedefi varsayılan (0,0,0) kalır.
 */
export function Lights({ plan, theme }: { plan: OfficePlan; theme: OfficeTheme }) {
  const L = theme.lights;
  const W = plan.width;
  const D = plan.depth;
  const span = Math.max(W, D) / 2 + 2;
  const lowPower = useOffice((s) => s.settings.lowPower);
  const points = useMemo(() => pickPointLights(plan.lamps, lowPower), [plan.lamps, lowPower]);
  const boost = ambientBoost(lowPower);
  return (
    <>
      <ambientLight intensity={L.ambient.intensity * boost} color={L.ambient.color} />
      <hemisphereLight args={[L.hemi.sky, L.hemi.ground, L.hemi.intensity * boost]} />
      <directionalLight
        position={L.sun.position}
        intensity={L.sun.intensity}
        color={L.sun.color}
        castShadow={!lowPower}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
      {/* pencerelerden gelen soğuk-pembe şehir ışığı */}
      <directionalLight position={[0, 6, -20 - D / 2]} intensity={L.fill.intensity} color={L.fill.color} />
      {points.map((l, i) => (
        <pointLight
          key={i}
          position={[l.x - W / 2, 2.3, l.z - D / 2]}
          color={l.kind === 'island' ? L.island.color : L.zone[i % 2]}
          intensity={l.kind === 'island' ? L.island.intensity : L.zoneIntensity}
          distance={l.kind === 'island' ? 9 : 7}
          decay={1.5}
        />
      ))}
    </>
  );
}

/** Dokulu düz yüzey: ışıktan bağımsız (tabela gibi) ya da ışıkla aydınlanan (karo, paspas). */
function DecalMesh({
  d,
  map,
  glow = 1,
  lit = false,
  floor = false,
  repeat,
}: {
  d: Decal;
  map: Texture;
  /** Işıktan bağımsız yüzeyde renk çarpanı (>1 parlama eşiğini aşar). */
  glow?: number;
  /** true: MeshStandardMaterial (sahnenin ışığıyla aydınlanır). */
  lit?: boolean;
  floor?: boolean;
  repeat?: [number, number];
}) {
  const tex = useMemo(() => {
    if (!repeat) return map;
    const t = map.clone();
    t.repeat.set(repeat[0], repeat[1]);
    t.needsUpdate = true;
    return t;
  }, [map, repeat?.[0], repeat?.[1]]);
  const color = useMemo(() => new Color(glow, glow, glow), [glow]);
  return (
    <mesh
      position={d.p as [number, number, number]}
      rotation={floor ? [-Math.PI / 2, 0, d.rotY] : [0, d.rotY, 0]}
      receiveShadow={lit}
    >
      <planeGeometry args={[d.w, d.h]} />
      {lit ? (
        <meshStandardMaterial
          map={tex}
          roughness={floor ? 0.95 : 0.35}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      ) : (
        <meshBasicMaterial map={tex} color={color} transparent toneMapped={false} depthWrite={false} />
      )}
    </mesh>
  );
}

/**
 * DevTechnic marka yüzeyleri: marka duvarındaki ışıklı logo ve yazı, lider köşesindeki plaket, dinlenme
 * alanındaki neon simge, karşılama totemi, giriş paspası ve mutfak karosu. Dokular yerel dosyalardan üretilir.
 */
export function BrandSurfaces({
  layout,
  theme,
  brand,
}: {
  layout: FurnitureLayout;
  theme: OfficeTheme;
  brand: BrandId;
}) {
  const b = layout.brand;
  const night = theme.night;
  const tiles = layout.tiles;
  return (
    <group>
      <DecalMesh d={b.logo} map={brandLogoTexture(brand)} glow={night ? 1.75 : 1.05} />
      <DecalMesh d={b.word} map={brandWordTexture('#e2e8f0', brand)} glow={night ? 1.15 : 0.95} />
      <DecalMesh d={b.plaque} map={brandPlaqueTexture(brand)} glow={night ? 1.05 : 0.95} />
      <DecalMesh d={b.neon} map={brandIconTexture(brand)} glow={night ? 2.4 : 1.2} />
      <DecalMesh d={b.totem} map={brandIconTexture(brand)} glow={night ? 1.8 : 1.1} />
      <DecalMesh d={b.mat} map={entranceMatTexture(brand)} lit floor />
      <DecalMesh d={tiles} map={tileTexture()} lit repeat={[tiles.w / 0.6, tiles.h / 0.3]} />
    </group>
  );
}

/**
 * Ofisin bulunduğu kule: odanın altında lacivert kat bandı (önünde altın şerit) ve alt katların cephesi (gece
 * pencerelerin bir kısmı yanar). Odanın önündeki boş alanı anlamlı hale getirir. Bandın önüne yazı konmadı: genel
 * görünümde dik yüzey çok basık göründüğü için okunmuyordu.
 */
export function Tower({ plan, theme }: { plan: OfficePlan; theme: OfficeTheme }) {
  const W = plan.width;
  const D = plan.depth;
  const facadeTop = -SLAB_H;
  const facadeH = facadeTop - OUTSIDE_Y;
  const floors = 3;
  const front = towerTextures(
    floors,
    Math.round((W + 0.4) / 1.6),
    theme.city,
    theme.tower.facade,
    theme.tower.glass,
  );
  const side = towerTextures(
    floors,
    Math.round((D + 0.1) / 1.6),
    theme.city,
    theme.tower.facade,
    theme.tower.glass,
  );
  const gold = useMemo(() => new Color(BRAND.gold).multiplyScalar(theme.night ? 2 : 1.1), [theme.night]);
  const glowColor = useMemo(() => new Color('#ffffff'), []);
  const facadeMat = (t: { map: Texture; glow: Texture }) => (
    <meshStandardMaterial
      map={t.map}
      emissiveMap={t.glow}
      emissive={glowColor}
      emissiveIntensity={theme.city.glow * 0.45}
      roughness={0.6}
      metalness={0.1}
    />
  );
  return (
    <group>
      {/* kat bandı (döşeme) */}
      <mesh position={[W / 2, (-SLAB_H - 0.02) / 2, D / 2]}>
        <boxGeometry args={[W + 0.6, SLAB_H - 0.02, D + 0.3]} />
        <meshStandardMaterial color={BRAND.navy} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[W / 2, -0.17, D + 0.152]}>
        <boxGeometry args={[W + 0.6, 0.035, 0.01]} />
        <meshBasicMaterial color={gold} toneMapped={false} />
      </mesh>
      {/* alt katlar */}
      <mesh position={[W / 2, (facadeTop + OUTSIDE_Y) / 2, D / 2]}>
        <boxGeometry args={[W + 0.4, facadeH, D + 0.1]} />
        <meshStandardMaterial color={theme.tower.facade} roughness={0.8} />
      </mesh>
      <mesh position={[W / 2, (facadeTop + OUTSIDE_Y) / 2, D + 0.06]}>
        <planeGeometry args={[W + 0.4, facadeH]} />
        {facadeMat(front)}
      </mesh>
      {([-1, 1] as const).map((sgn) => (
        <mesh
          key={sgn}
          position={[sgn < 0 ? -0.21 : W + 0.21, (facadeTop + OUTSIDE_Y) / 2, D / 2]}
          rotation={[0, (sgn * Math.PI) / 2, 0]}
        >
          <planeGeometry args={[D + 0.1, facadeH]} />
          {facadeMat(side)}
        </mesh>
      ))}
    </group>
  );
}
