import { useEffect } from 'react';
import { ROLE_GROUP_LABEL } from './labels.ts';
import { LAYOUT_SNAP } from './office/sim/plan.ts';
import { useCurrentView, useOffice, type LayoutEditorApi } from './store.ts';

/** Düzen düzenleme modunu açan düğme (yalnızca proje görünümünde). */
export function EditLayoutButton() {
  const view = useCurrentView();
  const editing = useOffice((s) => s.editingLayout);
  const setEditing = useOffice((s) => s.setEditingLayout);
  if (view.kind !== 'project') return null;
  return (
    <button
      type="button"
      className={`ghost with-icon${editing ? ' on' : ''}`}
      onClick={() => setEditing(!editing)}
      aria-pressed={editing}
      aria-label="Düzeni düzenle"
      title="Masa adalarını sürükleyerek yerleştir"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
      </svg>
      <span className="label-text">Düzenle</span>
    </button>
  );
}

/** "Geliştirme", birden fazla aynı rol adası varsa "Geliştirme 2". */
function islandName(editor: LayoutEditorApi, id: string): string {
  const island = editor.islands.find((i) => i.id === id);
  if (!island) return id;
  const same = editor.islands.filter((i) => i.role === island.role);
  const n = same.indexOf(island) + 1;
  return same.length > 1 ? `${ROLE_GROUP_LABEL[island.role]} ${n}` : ROLE_GROUP_LABEL[island.role];
}

const NOTES = {
  ok: 'Ada taşındı.',
  blocked: 'Buraya konamaz: odanın dışında ya da başka bir adaya çok yakın.',
  path: 'Buraya konamaz: kapıdan bazı masalara yol kapanıyor.',
} as const;

/**
 * Düzenleme çubuğu: ne yapılacağını söyler, klavye için ada seçimi ve ok düğmeleri, "Varsayılana dön" ve
 * "Bitti". Ok tuşları da seçili adayı taşır (bir yazı alanında değilken).
 */
export function LayoutBar() {
  const editing = useOffice((s) => s.editingLayout);
  const editor = useOffice((s) => s.layoutEditor);
  const selected = useOffice((s) => s.editIsland);
  const note = useOffice((s) => s.editNote);
  const hasSaved = useOffice((s) => (editor ? Boolean(s.layouts[editor.project]) : false));
  const setEditing = useOffice((s) => s.setEditingLayout);
  const setSelected = useOffice((s) => s.setEditIsland);
  const reset = useOffice((s) => s.resetLayout);
  const view = useCurrentView();
  const active = editing && view.kind === 'project' && editor !== null;
  const current =
    selected && editor?.islands.some((i) => i.id === selected) ? selected : editor?.islands[0]?.id;

  const nudge = (dx: number, dz: number) => {
    if (!editor || !current) return;
    const island = editor.islands.find((i) => i.id === current);
    if (!island) return;
    const result = editor.move(current, island.x + dx * LAYOUT_SNAP, island.z + dz * LAYOUT_SNAP);
    useOffice.setState({ editNote: NOTES[result], editIsland: current });
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const dir: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = dir[e.key];
      if (d) {
        e.preventDefault();
        nudge(d[0], d[1]);
      } else if (e.key === 'Escape') setEditing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!active || !editor) return null;
  return (
    <section className="layout-bar glass" aria-label="Düzen düzenleme">
      <p className="layout-help">
        Masa adalarını sürükleyip bırak. Yeşil yere bırakılabilir, kırmızıya bırakılamaz.
      </p>
      <div className="layout-controls">
        <label className="picker">
          <span className="picker-label">Ada</span>
          <select
            value={current ?? ''}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Taşınacak ada"
          >
            {editor.islands.map((i) => (
              <option key={i.id} value={i.id}>
                {islandName(editor, i.id)}
              </option>
            ))}
          </select>
        </label>
        <div className="nudge" role="group" aria-label="Seçili adayı taşı">
          <button type="button" className="icon-btn" onClick={() => nudge(-1, 0)} aria-label="Sola taşı">
            ←
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => nudge(0, -1)}
            aria-label="Pencereye doğru taşı"
          >
            ↑
          </button>
          <button type="button" className="icon-btn" onClick={() => nudge(0, 1)} aria-label="Öne taşı">
            ↓
          </button>
          <button type="button" className="icon-btn" onClick={() => nudge(1, 0)} aria-label="Sağa taşı">
            →
          </button>
        </div>
        <button
          type="button"
          className="ghost"
          disabled={!hasSaved}
          onClick={() => {
            reset(editor.project);
            useOffice.setState({ editNote: 'Düzen varsayılana döndü.' });
          }}
        >
          Varsayılana dön
        </button>
        <button type="button" className="primary" onClick={() => setEditing(false)}>
          Bitti
        </button>
      </div>
      <p className="layout-note" role="status" aria-live="polite">
        {note ?? ' '}
      </p>
    </section>
  );
}
