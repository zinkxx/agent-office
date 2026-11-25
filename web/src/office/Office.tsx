import { Canvas, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { shownAgents } from '../closedProjects.ts';
import { useCurrentView, useOffice, useTheme } from '../store.ts';
import { AllProjectsScene } from './AllProjectsScene.tsx';
import { registerCapture } from './capture.ts';
import { LabelHost, labelLayer } from './Label.tsx';
import { clockOrigin, clockSeconds, frameInterval, frameStep } from './power.ts';
import { ProjectScene } from './project/ProjectScene.tsx';
import { ScreenBank } from './screens.ts';

/**
 * Kare hızı sürücüsü (frameloop="never" ile tek çizim döngüsü budur): kendi requestAnimationFrame'inde,
 * çizim zamanı geldiyse aynı karede r3f'nin `advance`'ını çağırır. Pencere odaktayken her ekran karesinde,
 * odak başka yerdeyken ~12 kare/sn çizer; düşük güç modunda odakta en fazla 30, odak dışında 8 kare/sn
 * (bkz. power.ts). Sekme gizliyken hiç çizmez.
 *
 * Eskiden frameloop="demand" ile burada `invalidate()` çağrılıyordu; r3f çizimi bir sonraki karede yapıp
 * döngüsünü durdurduğu için sahne yalnızca her 2. karede çiziliyordu.
 *
 * `advance`'a gerçek zaman (saniye) verilir; r3f saati bununla ilerletir, böylece `useFrame` delta'ları ve
 * `clock.elapsedTime` atlanan karelerde de doğru birikir. OrbitControls ve parlama (EffectComposer) kendi
 * `useFrame`'leriyle her çizimde çalışır; controls'ün `invalidate()`'i "never" modunda etkisizdir, ama
 * odaktaki her ekran karesinde zaten çizildiği için sürükleme akıcı kalır.
 */
function FrameDriver({ lowPower }: { lowPower: boolean }) {
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);
  const lowPowerRef = useRef(lowPower);
  lowPowerRef.current = lowPower;
  useEffect(() => {
    let raf = 0;
    let next = 0;
    let origin: number | null = null;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      origin ??= clockOrigin(t, clock.elapsedTime);
      const step = frameStep(t, next, frameInterval(document.hasFocus(), lowPowerRef.current));
      next = step.next;
      if (step.draw) advance(clockSeconds(t, origin));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [advance, clock]);
  return null;
}

/**
 * "Görüntü kaydet" köprüsü: yakalama fonksiyonunu capture.ts'ye kaydeder. preserveDrawingBuffer kapalı
 * olduğu için tuval içeriği çizimden sonra silinebilir; bu yüzden yakalarken sahne aynı görevde yeniden
 * çizilir ve hemen ardından `toDataURL` okunur. Çizim `advance` ile yapılır (zaman ilerletilmeden, delta 0):
 * parlama katmanı açıksa çizimi EffectComposer üstlendiğinden düz `gl.render(scene, camera)` renk tonlaması
 * ve parlama olmadan farklı görünürdü; katman yokken `advance` zaten `gl.render(scene, camera)` çağırır.
 * Etiketler HTML katmanında olduğundan görüntüye girmez.
 */
function CaptureBridge() {
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);
  useEffect(
    () =>
      registerCapture(() => {
        advance(clock.elapsedTime);
        return gl.domElement.toDataURL('image/png');
      }),
    [gl, advance, clock],
  );
  return null;
}

/**
 * Parlama katmanı yokken (düşük güç) renk tonlamasını renderer yapar. EffectComposer açıkken kendi ACES
 * adımı olduğu için renderer'ın tonlamasını kapatır; burada aynı ACES'i geri veririz ki görüntü kabaca aynı
 * kalsın (yalnızca parlama eksik olur).
 */
function RendererToneMapping() {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
  }, [gl]);
  return null;
}

/** Parlama: yalnızca parlaklığı eşiği aşan yüzeyler (ekranlar, lambalar, neon şeritler, şehir ışıkları). */
function Effects() {
  const { bloom } = useTheme();
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        mipmapBlur
        luminanceThreshold={bloom.threshold}
        luminanceSmoothing={0.25}
        intensity={bloom.intensity}
        radius={0.7}
      />
      {/* hafif köşe karartma: göz ofise toplanır */}
      <Vignette eskil={false} offset={0.32} darkness={0.42} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

function Scenes() {
  const view = useCurrentView();
  const snapshot = useOffice((s) => s.snapshot);
  const hideOffline = useOffice((s) => s.settings.hideOffline);
  const closedProjects = useOffice((s) => s.settings.closedProjects);
  const bank = useMemo(() => new ScreenBank(), []);
  useEffect(() => () => bank.dispose(), [bank]);
  const letters = snapshot?.letters ?? [];
  // "Kapalıları gizle": tüm projeler görünümünde bitmiş yardımcılar da gizlenir; proje ofisinde onlar
  // kapıdan çıkarak ayrıldığı için sahneye verilmeye devam eder. Kapatılan projeler hiç çizilmez.
  const allAgents = useMemo(
    () => shownAgents(snapshot?.agents ?? [], { hideOffline, closedProjects }),
    [snapshot, hideOffline, closedProjects],
  );
  const projectAgents = useMemo(
    () =>
      view.kind === 'project'
        ? shownAgents(
            (snapshot?.agents ?? []).filter((a) => a.project === view.project),
            { hideOffline, closedProjects },
            { keepFinished: true },
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, hideOffline, closedProjects, view.kind === 'project' ? view.project : null],
  );
  const team = useMemo(
    () =>
      view.kind === 'project' ? (snapshot?.teams.find((t) => t.project === view.project)?.members ?? []) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot?.teams, view.kind === 'project' ? view.project : null],
  );
  if (view.kind === 'project') {
    return (
      <ProjectScene
        key={view.project}
        project={view.project}
        agents={projectAgents}
        team={team}
        letters={letters}
        bank={bank}
        serverNow={snapshot?.now ?? Date.now()}
      />
    );
  }
  return <AllProjectsScene agents={allAgents} letters={letters} />;
}

export function Office() {
  const select = useOffice((s) => s.select);
  const lowPower = useOffice((s) => s.settings.lowPower);
  return (
    <>
      <Canvas
        shadows={{ type: PCFShadowMap }}
        frameloop="never"
        dpr={lowPower ? 1 : [1, 2]}
        camera={{ position: [16, 18, 22], fov: 38, near: 0.3, far: 400 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onPointerMissed={(e) => {
          // Boşluğa çift tıklayınca tüm ofise dön.
          if (e.detail === 2) {
            select(null);
            useOffice.getState().selectProject(null);
          }
        }}
      >
        <FrameDriver lowPower={lowPower} />
        <CaptureBridge />
        <Scenes />
        {lowPower ? <RendererToneMapping /> : <Effects />}
      </Canvas>
      {/* yazı etiketleri bu katmana çizilir (bkz. Label.tsx) */}
      <div ref={labelLayer} className="label-layer" />
      <LabelHost />
    </>
  );
}
