import { create } from 'zustand';
import type { AgentRole, OfficeSnapshot, ServerMessage } from '../../shared/types.ts';
import { appendFeed, newFeedItems, type FeedItem } from './feed.ts';
import { LAYOUTS_KEY, parseLayouts, withIsland, withoutProject, type SavedLayouts } from './layouts.ts';
import {
  LEGACY_HIDE_FILES_KEY,
  SETTINGS_KEY,
  effectiveReducedMotion,
  parseSettings,
  type RoleLook,
  type Settings,
} from './settings.ts';
import { SoundPlayer, soundCues } from './sound.ts';
import type { BrandId } from './office/brand.ts';
import { cssVariables, themeById, type OfficeTheme, type ThemeId } from './office/themes.ts';

/** Temanın arayüz renklerini sayfaya uygular (CSS değişkenleri). */
function applyTheme(id: ThemeId): void {
  try {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(cssVariables(themeById(id))))
      root.style.setProperty(name, value);
    root.dataset.theme = id;
  } catch {
    /* test ortamında sayfa yok */
  }
}
import { ALL_PROJECTS, keepPanelWhileEditing, resolveView, viewKey, type View } from './view.ts';

/**
 * Yerel sunucu: yalnızca bu bilgisayar. Port derleme sabitinden gelir (AJAN_OFISI_PORT); Vite dışında (testler)
 * tanımsızsa 5175.
 */
const SERVER_PORT = typeof __AJAN_OFISI_PORT__ === 'number' ? __AJAN_OFISI_PORT__ : 5175;
export const SERVER_URL = `ws://127.0.0.1:${SERVER_PORT}`;

export type Connection = 'connecting' | 'open' | 'closed';

interface OfficeState {
  connection: Connection;
  /** Bağlantı koptuysa bir sonraki denemeye kalan süre (ms), gösterim için. */
  retryInMs?: number;
  snapshot: OfficeSnapshot | null;
  /** Sunucu saati ile tarayıcı saati arasındaki fark (ms); süre hesapları için. */
  clockOffset: number;
  /** Listede/sahnede seçili ajan; kamera buna odaklanır. */
  selectedId: string | null;
  /** Her seçimde artar: aynı ajana tekrar tıklanınca da kamera yeniden odaklansın. */
  focusTick: number;
  panelOpen: boolean;
  /** Kullanıcı ayarları (tarayıcıda saklanır). */
  settings: Settings;
  settingsOpen: boolean;
  /** Proje başına taşınmış adalar (tarayıcıda saklanır). */
  layouts: SavedLayouts;
  /** Düzen düzenleme modu açık mı (yalnızca proje görünümünde). */
  editingLayout: boolean;
  /** Düzenleyicide seçili ada (klavyeyle taşımak için). */
  editIsland: string | null;
  /** Düzenleyicinin son bildirimi ("Ada taşındı." vb.). */
  editNote: string | null;
  /** Proje sahnesinin düzenleyiciye sunduğu adalar ve taşıma işlemi (sahne açıkken dolu). */
  layoutEditor: LayoutEditorApi | null;
  /** Hatırlanan proje seçimi: "*" = tüm projeler, null = otomatik (en son etkin proje). */
  savedView: string | null;
  /** Boşsa tüm roller görünür; doluysa yalnızca bu roller (liste ve sahne birlikte). */
  roleFilter: AgentRole[];
  /** Ekran köşesindeki canlı işlem akışı. */
  feed: FeedItem[];
  /** İşletim sisteminde "hareketi azalt" açık mı. */
  systemReducedMotion: boolean;
  /** Geçerli karar: ayardaki tercih + işletim sistemi (bkz. effectiveReducedMotion). */
  reducedMotion: boolean;
  select: (id: string | null) => void;
  togglePanel: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setSettingsOpen: (open: boolean) => void;
  setEditingLayout: (on: boolean) => void;
  setEditIsland: (id: string | null) => void;
  saveIsland: (project: string, islandId: string, pos: { x: number; z: number }) => void;
  resetLayout: (project: string) => void;
  setView: (key: string) => void;
  toggleRole: (role: AgentRole) => void;
  clearRoles: () => void;
}

const VIEW_KEY = 'ajan-ofisi:proje';

/** Taşıma sonucu: tamam, yer yok (oda dışı / çakışma), yol kapanıyor. */
export type MoveResult = 'ok' | 'blocked' | 'path';

export interface LayoutEditorApi {
  project: string;
  islands: { id: string; role: AgentRole; x: number; z: number }[];
  /** Adayı (x, z)'ye taşımayı dener; başarılıysa kaydeder. */
  move: (islandId: string, x: number, z: number) => MoveResult;
}

function loadLayouts(): SavedLayouts {
  try {
    return parseLayouts(localStorage.getItem(LAYOUTS_KEY));
  } catch {
    return {};
  }
}

function storeLayouts(layouts: SavedLayouts): void {
  try {
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
  } catch {
    /* depolama yoksa yalnızca bu oturumda */
  }
}

function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY), localStorage.getItem(LEGACY_HIDE_FILES_KEY));
  } catch {
    return parseSettings(null);
  }
}

function loadView(): string | null {
  try {
    return localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}

/** Pencere genişliği (pencere yoksa geniş sayılır). */
function windowWidth(): number {
  return typeof window === 'undefined' ? Infinity : window.innerWidth;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const initialSettings = loadSettings();
applyTheme(initialSettings.theme);
const initialSystemReduced = prefersReducedMotion();

/** Sesli uyarıları çalan tek çalar. */
export const sounds = new SoundPlayer();

export const useOffice = create<OfficeState>((set, get) => ({
  connection: 'connecting',
  snapshot: null,
  clockOffset: 0,
  selectedId: null,
  focusTick: 0,
  panelOpen: true,
  settings: initialSettings,
  settingsOpen: false,
  layouts: loadLayouts(),
  editingLayout: false,
  editIsland: null,
  editNote: null,
  layoutEditor: null,
  savedView: loadView(),
  roleFilter: [],
  feed: [],
  systemReducedMotion: initialSystemReduced,
  reducedMotion: effectiveReducedMotion(initialSettings.motion, initialSystemReduced),
  select: (id) => set((s) => ({ selectedId: id, focusTick: s.focusTick + 1 })),
  setView: (key) => {
    try {
      localStorage.setItem(VIEW_KEY, key);
    } catch {
      /* depolama yoksa yalnızca bu oturumda */
    }
    set((s) => ({
      savedView: key,
      selectedId: null,
      focusTick: s.focusTick + 1,
      editingLayout: false,
      editIsland: null,
    }));
  },
  toggleRole: (role) =>
    set((s) => ({
      roleFilter: s.roleFilter.includes(role)
        ? s.roleFilter.filter((r) => r !== role)
        : [...s.roleFilter, role],
    })),
  clearRoles: () => set({ roleFilter: [] }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    if (settings.theme !== get().settings.theme) applyTheme(settings.theme);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* gizli pencerede depolama olmayabilir: ayar yalnızca bu oturumda geçerli */
    }
    set((s) => ({
      settings,
      reducedMotion: effectiveReducedMotion(settings.motion, s.systemReducedMotion),
    }));
  },
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setEditingLayout: (on) =>
    set((s) => ({
      editingLayout: on,
      editIsland: on ? s.editIsland : null,
      editNote: null,
      ...(on ? { selectedId: null, settingsOpen: false, focusTick: s.focusTick + 1 } : {}),
      // Dar pencerede yan panel sahneyi kapatıyor: düzenlerken kapanır.
      ...(on && !keepPanelWhileEditing(windowWidth()) ? { panelOpen: false } : {}),
    })),
  setEditIsland: (id) => set({ editIsland: id }),
  saveIsland: (project, islandId, pos) => {
    const layouts = withIsland(get().layouts, project, islandId, pos);
    storeLayouts(layouts);
    set({ layouts });
  },
  resetLayout: (project) => {
    const layouts = withoutProject(get().layouts, project);
    storeLayouts(layouts);
    set({ layouts });
  },
}));

/** Sunucudan geleni doğrular; tanınmayan mesajı yok sayar. */
export function parseServerMessage(data: unknown): OfficeSnapshot | null {
  if (typeof data !== 'string') return null;
  try {
    const msg = JSON.parse(data) as ServerMessage;
    if (msg?.type === 'snapshot' && Array.isArray(msg.snapshot?.agents)) return msg.snapshot;
  } catch {
    /* bozuk mesaj */
  }
  return null;
}

/** Gelen anlık görüntüyü işler: akış, ses ipuçları, saat farkı, seçim. WebSocket ve statik demo ortak kullanır. */
export function applySnapshot(snapshot: OfficeSnapshot): void {
  const state = useOffice.getState();
  const selectedId = state.selectedId;
  const stillThere = selectedId && snapshot.agents.some((a) => a.id === selectedId);
  const fresh = newFeedItems(state.snapshot, snapshot);
  if (state.settings.sound) {
    // En önemli uyarı çalar; aynı anda birkaç ses üst üste binmesin.
    const cue = soundCues(state.snapshot, snapshot)[0];
    if (cue) sounds.play(cue, state.settings.volume);
  }
  useOffice.setState({
    snapshot,
    ...(fresh.length > 0 ? { feed: appendFeed(state.feed, fresh) } : {}),
    clockOffset: snapshot.now - Date.now(),
    ...(selectedId && !stillThere ? { selectedId: null } : {}),
  });
}

/** Derleme bayrağı VITE_STATIC_DEMO=1: sunucu yok, demo tarayıcıda çalışır (GitHub Pages). */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

let started = false;

/** Sunucuya bağlanır; koparsa artan aralıklarla (1 sn → en fazla 5 sn) yeniden dener. Bir kez çağrılır. */
export function startConnection(): void {
  if (started) return;
  started = true;
  let attempt = 0;

  const connect = () => {
    useOffice.setState({ connection: 'connecting', retryInMs: undefined });
    let socket: WebSocket;
    try {
      socket = new WebSocket(SERVER_URL);
    } catch {
      scheduleRetry();
      return;
    }
    socket.onopen = () => {
      attempt = 0;
      useOffice.setState({ connection: 'open' });
    };
    socket.onmessage = (event) => {
      const snapshot = parseServerMessage(event.data);
      if (snapshot) applySnapshot(snapshot);
    };
    socket.onclose = () => scheduleRetry();
    // Hata olayının ardından her zaman close gelir; yeniden deneme orada.
    socket.onerror = () => {};
  };

  const scheduleRetry = () => {
    attempt += 1;
    const delay = Math.min(5000, 1000 * attempt);
    useOffice.setState({ connection: 'closed', retryInMs: delay });
    setTimeout(connect, delay);
  };

  if (STATIC_DEMO) {
    useOffice.setState({ connection: 'open' });
    void import('./staticDemo.ts').then((m) => m.runStaticDemo(applySnapshot));
  } else connect();

  // "Hareketi azalt" ayarı değişirse hemen uygula.
  try {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) =>
      useOffice.setState((s) => ({
        systemReducedMotion: e.matches,
        reducedMotion: effectiveReducedMotion(s.settings.motion, e.matches),
      })),
    );
  } catch {
    /* eski tarayıcı */
  }

  // Tarayıcı ses motorunu ancak kullanıcı hareketinden sonra açar: ses açıksa ilk tıklamada hazırla.
  const unlock = () => {
    if (useOffice.getState().settings.sound) sounds.unlock();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

/** Rolün kullanıcı özelleştirmesi (kıyafet rengi, aksesuar). */
export function useRoleLook(role: AgentRole): RoleLook | undefined {
  return useOffice((s) => s.settings.looks[role]);
}

/** Seçili tema (sahne bileşenleri için). */
export function useBrand(): BrandId {
  return useOffice((s) => s.settings.brand);
}

export function useTheme(): OfficeTheme {
  return themeById(useOffice((s) => s.settings.theme));
}

/** Çizilecek görünüm: hatırlanan seçim ya da en son etkin proje (bkz. view.ts). */
export function useCurrentView(): View {
  const key = useOffice((s) => viewKey(resolveView(s.savedView, s.snapshot)));
  return key === ALL_PROJECTS ? { kind: 'all' } : { kind: 'project', project: key };
}
