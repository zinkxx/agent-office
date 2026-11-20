import { useFrame, useThree } from '@react-three/fiber';
import {
  createRef,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera, type Group } from 'three';

/**
 * Sahnedeki tüm yazı etiketlerinin (ad, durum simgesi, proje tabelası) eklendiği sabit katman (Office.tsx).
 */
export const labelLayer = createRef<HTMLDivElement>();

/** "sign": yerdeki ada tabelaları, her zaman ad/masa etiketlerinin altında çizilir. */
export type LabelKind = 'tag' | 'sign';

/*
 * Neden drei <Html> değil: her <Html> kendi React kökünü kurar ve kaldırılırken root.unmount()'u senkron
 * çağırır. Etiket sahne güncellemesi sırasında kalkınca React "Attempted to synchronously unmount a root while
 * React was already rendering" uyarısı veriyordu. Burada sahnedeki <Label> yalnızca kendi kutusunu (div) konumlar
 * ve içeriğini küçük bir listeye yazar; içerik sayfa ağacındaki tek <LabelHost> tarafından portal ile çizilir.
 * Etiket kalkınca listeden çıkar ve içerik sıradan (ertelenmiş) bir güncellemeyle kaldırılır.
 */
interface Entry {
  id: number;
  el: HTMLDivElement;
  children: ReactNode;
}

const entries = new Map<number, Entry>();
let snapshot: readonly Entry[] = [];
const listeners = new Set<() => void>();
let queued = false;

/** Liste değişti: aynı anda gelen değişiklikleri toplayıp bir sonraki mikro görevde LabelHost'a bildirir. */
function changed() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    snapshot = [...entries.values()];
    for (const l of listeners) l();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;

/** drei <Html center> ile aynı: kutu, konumun tam ortasına oturur. */
const CENTER: CSSProperties = { position: 'absolute', transform: 'translate3d(-50%,-50%,0)' };

/** Etiket içeriklerini çizer; sayfa ağacında (Canvas'ın dışında) tek bir kez kullanılır. */
export function LabelHost() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <>{list.map((e) => createPortal(<div style={CENTER}>{e.children}</div>, e.el, String(e.id)))}</>;
}

const vPos = new Vector3();
const vCam = new Vector3();
const vDir = new Vector3();
const vLook = new Vector3();
const EPS = 0.001;
let nextId = 1;

/** Yakındaki etiket üstte (drei'deki gibi mesafeye göre); tabelalar hep en altta. */
function zIndexFor(kind: LabelKind, dist: number, camera: Camera): number {
  if (kind === 'sign') return 0;
  if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)) return 1;
  const t = (camera.far - dist) / (camera.far - camera.near);
  return 1 + Math.round(9 * Math.min(1, Math.max(0, t)));
}

export function Label({
  position,
  children,
  kind = 'tag',
}: {
  position: [number, number, number];
  children: ReactNode;
  kind?: LabelKind;
}) {
  const group = useRef<Group>(null);
  const [id] = useState(() => nextId++);
  const [el] = useState(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0;';
    return d;
  });
  const last = useRef<{ x: number; y: number; visible: boolean } | null>(null);
  const fallback = useThree((s) => s.gl.domElement.parentElement);
  const get = useThree((s) => s.get);

  /** Kutuyu nesnenin ekrandaki yerine taşır; kamera arkasındaysa gizler. */
  const place = (camera: Camera, width: number, height: number) => {
    const g = group.current;
    if (!g) return;
    camera.updateMatrixWorld();
    g.updateWorldMatrix(true, false);
    const p = vPos.setFromMatrixPosition(g.matrixWorld);
    const cam = vCam.setFromMatrixPosition(camera.matrixWorld);
    const dist = p.distanceTo(cam);
    const behind = vDir.subVectors(p, cam).angleTo(camera.getWorldDirection(vLook)) > Math.PI / 2;
    p.project(camera);
    const x = p.x * (width / 2) + width / 2;
    const y = -p.y * (height / 2) + height / 2;
    const prev = last.current;
    if (prev && Math.abs(prev.x - x) <= EPS && Math.abs(prev.y - y) <= EPS) return;
    const visible = !behind;
    if ((prev?.visible ?? true) !== visible) el.style.display = visible ? 'block' : 'none';
    el.style.zIndex = String(zIndexFor(kind, dist, camera));
    el.style.transform = `translate3d(${x}px,${y}px,0) scale(1)`;
    last.current = { x, y, visible };
  };

  // Kutuyu katmana ekle (tabelalar başa: eşit z-index'te de altta kalır) ve hemen doğru yere koy.
  useLayoutEffect(() => {
    const target = labelLayer.current ?? fallback;
    if (!target) return;
    if (kind === 'sign') target.prepend(el);
    else target.appendChild(el);
    last.current = null;
    const s = get();
    place(s.camera, s.size.width, s.size.height);
    return () => el.remove();
  }, [el, kind, fallback, get]);

  // İçerik her çizimde güncellenir (drei <Html> gibi).
  useLayoutEffect(() => {
    entries.set(id, { id, el, children });
    changed();
  });
  useLayoutEffect(
    () => () => {
      entries.delete(id);
      changed();
    },
    [id],
  );

  useFrame((s) => place(s.camera, s.size.width, s.size.height));

  return <group ref={group} position={position} />;
}
