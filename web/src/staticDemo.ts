import type { OfficeSnapshot } from '../../shared/types.ts';
import { startDemo } from '../../server/src/demo.ts';
import { OfficeStore } from '../../server/src/store.ts';

/** Statik demo: ofis verisi tarayıcıda üretilir (sunucu yok). Kalabalık başlangıçla, her değişimde anlık görüntü verir. */
export function runStaticDemo(onSnapshot: (snapshot: OfficeSnapshot) => void): () => void {
  const store = new OfficeStore();
  const emit = () => onSnapshot(store.snapshot());
  const stop = startDemo(store, emit, { full: true });
  emit();
  return stop;
}
