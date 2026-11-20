import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';

/**
 * Toplu (instanced) çizim: sabit mobilyalar "parça" listesi olarak tanımlanır; aynı geometri + malzeme
 * türündeki tüm parçalar tek bir InstancedMesh ile, tek çizim çağrısında çizilir. Renk her parçada ayrı.
 */

export type Geo = 'box' | 'cyl' | 'cyl6' | 'cone' | 'sphere' | 'ico' | 'disc';
export type Mat = 'matte' | 'wood' | 'gloss' | 'metal' | 'fabric' | 'leaf' | 'glow';
export type V3 = readonly [number, number, number];

export interface Part {
  g: Geo;
  m: Mat;
  /** Dünya konumu, ölçek (birim geometriye göre) ve dönüş (Euler, radyan). */
  p: V3;
  s: V3;
  r?: V3;
  /** Renk; "glow" malzemede parlaklık çarpanı `glow` ile. */
  c: string;
  glow?: number;
  /** Gölge düşürsün mü (yalnızca büyük parçalar). */
  cast?: boolean;
}

/** Yerel koordinatlarda parça ekleyen kurucu: konum/dönüş yığını tutar. */
export class Kit {
  readonly parts: Part[] = [];
  private stack: Matrix4[] = [new Matrix4()];
  private readonly tmp = new Matrix4();

  private get top(): Matrix4 {
    return this.stack[this.stack.length - 1]!;
  }

  /** `fn` içinde eklenen parçalar (x,y,z) konumuna taşınır ve y ekseninde `rotY` döndürülür. */
  at(x: number, y: number, z: number, rotY: number, fn: () => void): void {
    const m = this.top
      .clone()
      .multiply(this.tmp.makeTranslation(x, y, z))
      .multiply(new Matrix4().makeRotationY(rotY));
    this.stack.push(m);
    try {
      fn();
    } finally {
      this.stack.pop();
    }
  }

  add(g: Geo, m: Mat, p: V3, s: V3, c: string, extra: { r?: V3; glow?: number; cast?: boolean } = {}): void {
    const local = new Matrix4().compose(
      new Vector3(...p),
      new Quaternion().setFromEuler(new Euler(...(extra.r ?? [0, 0, 0]))),
      new Vector3(1, 1, 1),
    );
    const world = this.top.clone().multiply(local);
    const pos = new Vector3();
    const quat = new Quaternion();
    const scl = new Vector3();
    world.decompose(pos, quat, scl);
    const e = new Euler().setFromQuaternion(quat);
    const part: Part = { g, m, p: [pos.x, pos.y, pos.z], s, r: [e.x, e.y, e.z], c };
    if (extra.glow !== undefined) part.glow = extra.glow;
    if (extra.cast) part.cast = true;
    this.parts.push(part);
  }

  /** Yerel bir noktanın dünya konumu ve y dönüşü (dinamik parçalar için: ekran, etiket). */
  point(p: V3): { p: V3; rotY: number } {
    const v = new Vector3(...p).applyMatrix4(this.top);
    const q = new Quaternion();
    this.top.decompose(new Vector3(), q, new Vector3());
    const e = new Euler().setFromQuaternion(q, 'YXZ');
    return { p: [v.x, v.y, v.z], rotY: e.y };
  }

  box(
    p: V3,
    s: V3,
    c: string,
    m: Mat = 'matte',
    extra: { r?: V3; glow?: number; cast?: boolean } = {},
  ): void {
    this.add('box', m, p, s, c, extra);
  }
}

const GEOS: Record<Geo, BufferGeometry> = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(0.5, 0.5, 1, 12),
  cyl6: new CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new ConeGeometry(0.5, 1, 10, 1, true),
  sphere: new SphereGeometry(0.5, 10, 8),
  ico: new IcosahedronGeometry(0.5, 0),
  disc: new CylinderGeometry(0.5, 0.5, 1, 20),
};

function makeMaterial(m: Mat): Material {
  switch (m) {
    case 'glow':
      return new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    case 'metal':
      return new MeshStandardMaterial({ color: '#ffffff', metalness: 0.75, roughness: 0.32 });
    case 'gloss':
      return new MeshStandardMaterial({ color: '#ffffff', metalness: 0.05, roughness: 0.28 });
    case 'wood':
      return new MeshStandardMaterial({ color: '#ffffff', metalness: 0.02, roughness: 0.55 });
    case 'fabric':
      return new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
    case 'leaf':
      return new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true });
    default:
      return new MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 });
  }
}

function Batch({ parts, geo, mat, cast }: { parts: Part[]; geo: Geo; mat: Mat; cast: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useMemo(() => makeMaterial(mat), [mat]);
  useLayoutEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const im = mesh.current;
    if (!im) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const color = new Color();
    parts.forEach((part, i) => {
      e.set(...(part.r ?? [0, 0, 0]));
      q.setFromEuler(e);
      m.compose(new Vector3(...part.p), q, new Vector3(...part.s));
      im.setMatrixAt(i, m);
      color.set(part.c);
      if (part.glow !== undefined) color.multiplyScalar(part.glow);
      im.setColorAt(i, color);
    });
    im.count = parts.length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.computeBoundingBox();
  }, [parts]);
  return (
    <instancedMesh
      ref={mesh}
      args={[GEOS[geo], material, parts.length]}
      castShadow={cast}
      receiveShadow={mat !== 'glow'}
      frustumCulled={false}
    />
  );
}

/** Parçaları geometri + malzeme + gölge türüne göre gruplayıp çizer. */
export function StaticBatch({ parts }: { parts: Part[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, { geo: Geo; mat: Mat; cast: boolean; parts: Part[] }>();
    for (const p of parts) {
      const cast = Boolean(p.cast) && p.m !== 'glow';
      const key = `${p.g}|${p.m}|${cast}`;
      let g = map.get(key);
      if (!g) map.set(key, (g = { geo: p.g, mat: p.m, cast, parts: [] }));
      g.parts.push(p);
    }
    return [...map.entries()];
  }, [parts]);
  return (
    <>
      {groups.map(([key, g]) => (
        // parça sayısı değişince InstancedMesh yeniden kurulsun (kapasite sabittir)
        <Batch key={`${key}:${g.parts.length}`} parts={g.parts} geo={g.geo} mat={g.mat} cast={g.cast} />
      ))}
    </>
  );
}
