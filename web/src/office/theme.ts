import type { Agent } from '../../../shared/types.ts';

/**
 * "Tüm projeler" görünümündeki küçük masaların sabit ölçü ve renkleri. Temaya göre değişen renkler
 * `themes.ts`'tedir (overview); buradakiler tüm temalarda aynıdır.
 */
export const THEME = {
  background: '#0e0407',
  fog: '#12050a',
  floor: '#1a070d',
  gridCell: '#2c0d17',
  gridSection: '#5c1a2e',
  island: '#2a0c15',
  islandEdge: '#ff4d78',
  glass: '#ff7d9c',
  desk: '#4a1d2a',
  deskOff: '#24111a',
  chair: '#3a1520',
  metal: '#6b4a55',
  accent: '#ff3d6e',
  accentSoft: '#ff9db3',
  helper: '#ffb0c2',
  /** Ada üst yüzeyinin yüksekliği: masalar bunun üstüne oturur. */
  islandTop: 0.18,
} as const;

/** Karakterin gövde rengi: terminal / VS Code / diğer. Listede rozet renkleriyle aynıdır. */
export function bodyColor(entrypoint: Agent['entrypoint']): string {
  if (entrypoint === 'cli') return '#ff5a78';
  if (entrypoint === 'claude-vscode') return '#7b8bff';
  return '#d29bff';
}
