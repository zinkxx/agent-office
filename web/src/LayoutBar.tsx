import { useEffect } from 'react';
import type { Lang, MessageKey } from './i18n.ts';
import { roleGroupLabel } from './labels.ts';
import { LAYOUT_SNAP } from './office/sim/plan.ts';
import { useCurrentView, useLang, useOffice, useT, type EditNote, type LayoutEditorApi } from './store.ts';

/** Düzen düzenleme modunu açan düğme (yalnızca proje görünümünde). */
export function EditLayoutButton() {
  const view = useCurrentView();
  const editing = useOffice((s) => s.editingLayout);
  const setEditing = useOffice((s) => s.setEditingLayout);
  const t = useT();
  if (view.kind !== 'project') return null;
  return (
    <button
      type="button"
      className={`ghost with-icon${editing ? ' on' : ''}`}
      onClick={() => setEditing(!editing)}
      aria-pressed={editing}
      aria-label={t('layout.editAria')}
      title={t('layout.editTitle')}
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
      <span className="label-text">{t('layout.edit')}</span>
    </button>
  );
}

/** "Geliştirme", birden fazla aynı rol adası varsa "Geliştirme 2". */
function islandName(editor: LayoutEditorApi, id: string, lang: Lang): string {
  const island = editor.islands.find((i) => i.id === id);
  if (!island) return id;
  const same = editor.islands.filter((i) => i.role === island.role);
  const n = same.indexOf(island) + 1;
  const name = roleGroupLabel(island.role, lang);
  return same.length > 1 ? `${name} ${n}` : name;
}

const NOTES: Record<EditNote, MessageKey> = {
  ok: 'layout.note.ok',
  blocked: 'layout.note.blocked',
  path: 'layout.note.path',
  reset: 'layout.note.reset',
};

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
  const t = useT();
  const lang = useLang();
  const active = editing && view.kind === 'project' && editor !== null;
  const current =
    selected && editor?.islands.some((i) => i.id === selected) ? selected : editor?.islands[0]?.id;

  const nudge = (dx: number, dz: number) => {
    if (!editor || !current) return;
    const island = editor.islands.find((i) => i.id === current);
    if (!island) return;
    const result = editor.move(current, island.x + dx * LAYOUT_SNAP, island.z + dz * LAYOUT_SNAP);
    useOffice.setState({ editNote: result, editIsland: current });
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
    <section className="layout-bar glass" aria-label={t('layout.aria')}>
      <p className="layout-help">{t('layout.help')}</p>
      <div className="layout-controls">
        <label className="picker">
          <span className="picker-label">{t('layout.island')}</span>
          <select
            value={current ?? ''}
            onChange={(e) => setSelected(e.target.value)}
            aria-label={t('layout.islandAria')}
          >
            {editor.islands.map((i) => (
              <option key={i.id} value={i.id}>
                {islandName(editor, i.id, lang)}
              </option>
            ))}
          </select>
        </label>
        <div className="nudge" role="group" aria-label={t('layout.nudgeAria')}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => nudge(-1, 0)}
            aria-label={t('layout.left')}
          >
            ←
          </button>
          <button type="button" className="icon-btn" onClick={() => nudge(0, -1)} aria-label={t('layout.up')}>
            ↑
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => nudge(0, 1)}
            aria-label={t('layout.down')}
          >
            ↓
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => nudge(1, 0)}
            aria-label={t('layout.right')}
          >
            →
          </button>
        </div>
        <button
          type="button"
          className="ghost"
          disabled={!hasSaved}
          onClick={() => {
            reset(editor.project);
            useOffice.setState({ editNote: 'reset' });
          }}
        >
          {t('layout.reset')}
        </button>
        <button type="button" className="primary" onClick={() => setEditing(false)}>
          {t('layout.done')}
        </button>
      </div>
      <p className="layout-note" role="status" aria-live="polite">
        {note ? t(NOTES[note]) : ' '}
      </p>
    </section>
  );
}
