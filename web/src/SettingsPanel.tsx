import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AGENT_ROLES, type AgentRole } from '../../shared/types.ts';
import { ROLE_COLOR, ROLE_LABEL } from './labels.ts';
import { MASCOT_KINDS, type MascotKind } from './office/sim/mascot.ts';
import { THEMES } from './office/themes.ts';
import { MASCOT_LABEL, OUTFIT_COLORS, type MotionPref, type RoleLook } from './settings.ts';
import { CUE_LABEL, type Cue } from './sound.ts';
import { sounds, useCurrentView, useOffice } from './store.ts';

/** Açma/kapama anahtarı: gerçek onay kutusu (klavye ve ekran okuyucu için), görünüşü anahtar. */
function Switch({
  checked,
  onChange,
  children,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  hint?: string;
}) {
  const hintId = useId();
  return (
    <div className="setting-item">
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? hintId : undefined}
        />
        <span className="switch" aria-hidden="true" />
        {children}
      </label>
      {hint && (
        <p id={hintId} className="setting-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

const MOTION_OPTIONS: { value: MotionPref; label: string }[] = [
  { value: 'system', label: 'Sistem gibi' },
  { value: 'reduce', label: 'Azalt' },
  { value: 'full', label: 'Tam' },
];

const CUES: Cue[] = ['ask', 'done', 'letter'];
const CUE_SHORT: Record<Cue, string> = { ask: 'Bekliyor', done: 'Bitti', letter: 'Mesaj' };

export function SettingsButton() {
  const open = useOffice((s) => s.settingsOpen);
  const setOpen = useOffice((s) => s.setSettingsOpen);
  return (
    <button
      type="button"
      id="settings-button"
      className="ghost with-icon"
      onClick={() => setOpen(!open)}
      aria-label="Ayarlar"
      aria-expanded={open}
      aria-controls="settings-panel"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" strokeLinecap="round" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
      <span className="label-text">Ayarlar</span>
    </button>
  );
}

/** Rol başına kıyafet rengi ve aksesuar. */
function CharacterSettings() {
  const looks = useOffice((s) => s.settings.looks);
  const update = useOffice((s) => s.updateSettings);
  const [role, setRole] = useState<AgentRole>('developer');
  const id = useId();
  const look = looks[role] ?? {};
  const setLook = (patch: RoleLook) => {
    const next: RoleLook = { ...look, ...patch };
    if (next.outfit === undefined) delete next.outfit;
    if (next.accessories !== false) delete next.accessories;
    const all = { ...looks };
    if (Object.keys(next).length === 0) delete all[role];
    else all[role] = next;
    update({ looks: all });
  };
  return (
    <fieldset className="settings-group">
      <legend>Karakterler</legend>
      <div className="setting-item">
        <label className="setting-label" htmlFor={`${id}-role`}>
          Rol
        </label>
        <select
          id={`${id}-role`}
          className="settings-select"
          value={role}
          onChange={(e) => setRole(e.target.value as AgentRole)}
        >
          {AGENT_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
              {looks[r] ? ' (özel)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-item">
        <span className="setting-label" id={`${id}-outfit`}>
          Kıyafet rengi
        </span>
        <div className="swatches" role="radiogroup" aria-labelledby={`${id}-outfit`}>
          <label className={`swatch-option auto${look.outfit ? '' : ' on'}`} title="Otomatik (role göre)">
            <input
              type="radio"
              name={`${id}-outfit`}
              checked={!look.outfit}
              onChange={() => setLook({ outfit: undefined })}
              aria-label="Otomatik"
            />
            <span style={{ ['--swatch' as string]: ROLE_COLOR[role] }}>A</span>
          </label>
          {OUTFIT_COLORS.map((c) => (
            <label
              key={c.color}
              className={`swatch-option${look.outfit === c.color ? ' on' : ''}`}
              title={c.name}
            >
              <input
                type="radio"
                name={`${id}-outfit`}
                checked={look.outfit === c.color}
                onChange={() => setLook({ outfit: c.color })}
                aria-label={c.name}
              />
              <span style={{ ['--swatch' as string]: c.color }} />
            </label>
          ))}
        </div>
      </div>
      <Switch
        checked={look.accessories !== false}
        onChange={(v) => setLook({ accessories: v ? undefined : false })}
        hint="Kravat, yelek, kulaklık, bere, gözlük gibi role özgü eşyalar."
      >
        Rol aksesuarı
      </Switch>
    </fieldset>
  );
}

/** Bu projenin maskotu (yalnızca proje görünümünde). */
function MascotSettings() {
  const view = useCurrentView();
  const mascots = useOffice((s) => s.settings.mascots);
  const update = useOffice((s) => s.updateSettings);
  const id = useId();
  if (view.kind !== 'project') return null;
  const current = mascots[view.project];
  const set = (kind: MascotKind | null) => {
    const next = { ...mascots };
    if (kind) next[view.project] = kind;
    else delete next[view.project];
    update({ mascots: next });
  };
  const options: { value: MascotKind | null; label: string }[] = [
    { value: null, label: 'Yok' },
    ...MASCOT_KINDS.map((k) => ({ value: k, label: MASCOT_LABEL[k] })),
  ];
  return (
    <fieldset className="settings-group">
      <legend>Maskot</legend>
      <div className="setting-item">
        <div className="segmented" role="radiogroup" aria-label={`${view.project} maskotu`}>
          {options.map((o) => (
            <label key={o.label} className={(current ?? null) === o.value ? 'on' : ''}>
              <input
                type="radio"
                name={`${id}-mascot`}
                checked={(current ?? null) === o.value}
                onChange={() => set(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
        <p className="setting-hint">{view.project} ofisinde dolaşır, ara sıra oturup dinlenir.</p>
      </div>
    </fieldset>
  );
}

/** Ayarlar penceresi: görünüm, gizlilik, liste ve ses. Değişiklikler hemen uygulanır ve tarayıcıda saklanır. */
export function SettingsPanel() {
  const open = useOffice((s) => s.settingsOpen);
  const setOpen = useOffice((s) => s.setSettingsOpen);
  const settings = useOffice((s) => s.settings);
  const systemReduced = useOffice((s) => s.systemReducedMotion);
  const update = useOffice((s) => s.updateSettings);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();

  // Açılınca ilk denetime odaklan; Esc ya da dışarı tıklama kapatır, odak düğmeye döner.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('input, button')?.focus();
    const close = () => {
      setOpen(false);
      document.getElementById('settings-button')?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || document.getElementById('settings-button')?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, setOpen]);

  if (!open) return null;

  const setSound = (on: boolean) => {
    update({ sound: on });
    if (on) {
      sounds.unlock();
      sounds.play('done', settings.volume, true);
    }
  };

  return (
    <section
      id="settings-panel"
      ref={panel}
      className="settings glass"
      role="dialog"
      aria-labelledby={titleId}
    >
      <header className="settings-head">
        <h2 id={titleId}>Ayarlar</h2>
        <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Ayarları kapat">
          ×
        </button>
      </header>

      <fieldset className="settings-group">
        <legend>Görünüm</legend>
        <div className="setting-item">
          <span className="setting-label">Tema</span>
          <div className="theme-options" role="radiogroup" aria-label="Tema">
            {THEMES.map((t) => (
              <label key={t.id} className={`theme-option${settings.theme === t.id ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="theme"
                  value={t.id}
                  checked={settings.theme === t.id}
                  onChange={() => update({ theme: t.id })}
                />
                <span className="swatch" aria-hidden="true">
                  {t.swatch.map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </span>
                {t.name}
              </label>
            ))}
          </div>
          <p className="setting-hint">{THEMES.find((t) => t.id === settings.theme)?.description}</p>
        </div>
        <div className="setting-item">
          <span className="setting-label" id={`${titleId}-motion`}>
            Hareket
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby={`${titleId}-motion`}>
            {MOTION_OPTIONS.map((o) => (
              <label key={o.value} className={settings.motion === o.value ? 'on' : ''}>
                <input
                  type="radio"
                  name="motion"
                  value={o.value}
                  checked={settings.motion === o.value}
                  onChange={() => update({ motion: o.value })}
                />
                {o.label}
              </label>
            ))}
          </div>
          <p className="setting-hint">
            Azaltınca karakterler yürümek yerine solup yeniden belirir, süslü animasyonlar durur.
            {settings.motion === 'system' &&
              (systemReduced ? ' Bilgisayarında şu an azaltılmış.' : ' Bilgisayarında şu an tam.')}
          </p>
        </div>
        <Switch
          checked={settings.lowPower}
          onChange={(v) => update({ lowPower: v })}
          hint="Pil ve ısı için: daha az kare, parlama ve gölge kapalı, ekranlar yavaş."
        >
          Düşük güç modu
        </Switch>
      </fieldset>

      <CharacterSettings />
      <MascotSettings />

      <fieldset className="settings-group">
        <legend>Gizlilik</legend>
        <Switch
          checked={settings.hideFiles}
          onChange={(v) => update({ hideFiles: v })}
          hint="Ekran paylaşırken işe yarar: yalnızca işlem türü görünür, ör. “Edit”."
        >
          Dosya adlarını gizle
        </Switch>
        <Switch
          checked={settings.showTitles}
          onChange={(v) => update({ showTitles: v })}
          hint="Claude'un her oturuma verdiği kısa özet başlık. Kapatınca yalnızca oturum adı görünür."
        >
          Oturum başlıklarını göster
        </Switch>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Liste ve ofis</legend>
        <Switch
          checked={settings.hideOffline}
          onChange={(v) => update({ hideOffline: v })}
          hint="Kapalı oturumlar, işini bitiren yardımcılar ve masada olmayan ekip üyeleri gösterilmez."
        >
          Kapalıları gizle
        </Switch>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Ses</legend>
        <Switch
          checked={settings.sound}
          onChange={setSound}
          hint="Biri seni beklediğinde, yardımcı işini bitirdiğinde ve oturumlar arası mesaj geldiğinde kısa bir ses."
        >
          Sesli uyarılar
        </Switch>
        <div className={`setting-item volume${settings.sound ? '' : ' disabled'}`}>
          <label className="setting-label" htmlFor={`${titleId}-volume`}>
            Ses düzeyi
          </label>
          <input
            id={`${titleId}-volume`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.volume * 100)}
            disabled={!settings.sound}
            onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
            aria-valuetext={`yüzde ${Math.round(settings.volume * 100)}`}
          />
          <span className="volume-value" aria-hidden="true">
            {Math.round(settings.volume * 100)}
          </span>
        </div>
        <div className="cue-tests" role="group" aria-label="Sesleri dene">
          <span className="setting-label">Dene</span>
          {CUES.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              disabled={!settings.sound}
              onClick={() => {
                sounds.unlock();
                sounds.play(c, settings.volume, true);
              }}
              title={CUE_LABEL[c]}
            >
              {CUE_SHORT[c]}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
