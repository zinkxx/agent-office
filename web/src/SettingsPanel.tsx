import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AGENT_ROLES, type AgentRole } from '../../shared/types.ts';
import { LANG_NAME, LANGS, type MessageKey } from './i18n.ts';
import { ROLE_COLOR, roleLabel } from './labels.ts';
import { MASCOT_KINDS, type MascotKind } from './office/sim/mascot.ts';
import type { BrandId } from './office/brand.ts';
import { THEMES } from './office/themes.ts';
import { MASCOT_LABEL, OUTFIT_COLORS, type MotionPref, type RoleLook } from './settings.ts';
import { CUE_LABEL, type Cue } from './sound.ts';
import { sounds, useCurrentView, useLang, useOffice, useT } from './store.ts';

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

/** Seçenek adı: sözlük anahtarı ya da (marka adı gibi) çevrilmeyen sabit metin. */
const BRAND_OPTIONS: { value: BrandId; label: MessageKey | { text: string } }[] = [
  { value: 'sade', label: 'settings.brandPlain' },
  { value: 'devtechnic', label: { text: 'DevTechnic' } },
];

const MOTION_OPTIONS: { value: MotionPref; label: MessageKey }[] = [
  { value: 'system', label: 'settings.motion.system' },
  { value: 'reduce', label: 'settings.motion.reduce' },
  { value: 'full', label: 'settings.motion.full' },
];

const CUES: Cue[] = ['ask', 'done', 'letter'];
const CUE_SHORT: Record<Cue, MessageKey> = {
  ask: 'cueShort.ask',
  done: 'cueShort.done',
  letter: 'cueShort.letter',
};

export function SettingsButton() {
  const open = useOffice((s) => s.settingsOpen);
  const setOpen = useOffice((s) => s.setSettingsOpen);
  const t = useT();
  return (
    <button
      type="button"
      id="settings-button"
      className="ghost with-icon"
      onClick={() => setOpen(!open)}
      aria-label={t('settings.title')}
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
      <span className="label-text">{t('settings.title')}</span>
    </button>
  );
}

/** Rol başına kıyafet rengi ve aksesuar. */
function CharacterSettings() {
  const looks = useOffice((s) => s.settings.looks);
  const update = useOffice((s) => s.updateSettings);
  const [role, setRole] = useState<AgentRole>('developer');
  const id = useId();
  const t = useT();
  const lang = useLang();
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
      <legend>{t('settings.characters')}</legend>
      <div className="setting-item">
        <label className="setting-label" htmlFor={`${id}-role`}>
          {t('settings.role')}
        </label>
        <select
          id={`${id}-role`}
          className="settings-select"
          value={role}
          onChange={(e) => setRole(e.target.value as AgentRole)}
        >
          {AGENT_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r, lang)}
              {looks[r] ? t('settings.custom') : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-item">
        <span className="setting-label" id={`${id}-outfit`}>
          {t('settings.outfit')}
        </span>
        <div className="swatches" role="radiogroup" aria-labelledby={`${id}-outfit`}>
          <label
            className={`swatch-option auto${look.outfit ? '' : ' on'}`}
            title={t('settings.outfitAutoTitle')}
          >
            <input
              type="radio"
              name={`${id}-outfit`}
              checked={!look.outfit}
              onChange={() => setLook({ outfit: undefined })}
              aria-label={t('settings.outfitAuto')}
            />
            <span style={{ ['--swatch' as string]: ROLE_COLOR[role] }}>A</span>
          </label>
          {OUTFIT_COLORS.map((c) => (
            <label
              key={c.color}
              className={`swatch-option${look.outfit === c.color ? ' on' : ''}`}
              title={t(c.name)}
            >
              <input
                type="radio"
                name={`${id}-outfit`}
                checked={look.outfit === c.color}
                onChange={() => setLook({ outfit: c.color })}
                aria-label={t(c.name)}
              />
              <span style={{ ['--swatch' as string]: c.color }} />
            </label>
          ))}
        </div>
      </div>
      <Switch
        checked={look.accessories !== false}
        onChange={(v) => setLook({ accessories: v ? undefined : false })}
        hint={t('settings.accessoriesHint')}
      >
        {t('settings.accessories')}
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
  const t = useT();
  if (view.kind !== 'project') return null;
  const current = mascots[view.project];
  const set = (kind: MascotKind | null) => {
    const next = { ...mascots };
    if (kind) next[view.project] = kind;
    else delete next[view.project];
    update({ mascots: next });
  };
  const options: { value: MascotKind | null; label: string }[] = [
    { value: null, label: t('settings.mascotNone') },
    ...MASCOT_KINDS.map((k) => ({ value: k, label: t(MASCOT_LABEL[k]) })),
  ];
  return (
    <fieldset className="settings-group">
      <legend>{t('settings.mascot')}</legend>
      <div className="setting-item">
        <div
          className="segmented"
          role="radiogroup"
          aria-label={t('settings.mascotAria', { project: view.project })}
        >
          {options.map((o) => (
            <label key={o.value ?? 'none'} className={(current ?? null) === o.value ? 'on' : ''}>
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
        <p className="setting-hint">{t('settings.mascotHint', { project: view.project })}</p>
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
  const t = useT();

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
        <h2 id={titleId}>{t('settings.title')}</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen(false)}
          aria-label={t('settings.close')}
        >
          ×
        </button>
      </header>

      <fieldset className="settings-group">
        <legend>{t('settings.language')}</legend>
        <div className="setting-item">
          <div className="segmented" role="radiogroup" aria-label={t('settings.language')}>
            {LANGS.map((l) => (
              <label key={l} className={settings.language === l ? 'on' : ''} lang={l}>
                <input
                  type="radio"
                  name="language"
                  value={l}
                  checked={settings.language === l}
                  onChange={() => update({ language: l })}
                />
                {LANG_NAME[l]}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="settings-group">
        <legend>{t('settings.appearance')}</legend>
        <div className="setting-item">
          <span className="setting-label">{t('settings.theme')}</span>
          <div className="theme-options" role="radiogroup" aria-label={t('settings.theme')}>
            {THEMES.map((theme) => (
              <label key={theme.id} className={`theme-option${settings.theme === theme.id ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="theme"
                  value={theme.id}
                  checked={settings.theme === theme.id}
                  onChange={() => update({ theme: theme.id })}
                />
                <span className="swatch" aria-hidden="true">
                  {theme.swatch.map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </span>
                {t(`theme.${theme.id}.name`)}
              </label>
            ))}
          </div>
          <p className="setting-hint">{t(`theme.${settings.theme}.description`)}</p>
        </div>
        <div className="setting-item">
          <span className="setting-label" id={`${titleId}-brand`}>
            {t('settings.brand')}
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby={`${titleId}-brand`}>
            {BRAND_OPTIONS.map((o) => (
              <label key={o.value} className={settings.brand === o.value ? 'on' : ''}>
                <input
                  type="radio"
                  name="brand"
                  value={o.value}
                  checked={settings.brand === o.value}
                  onChange={() => update({ brand: o.value })}
                />
                {typeof o.label === 'string' ? t(o.label) : o.label.text}
              </label>
            ))}
          </div>
        </div>
        <div className="setting-item">
          <span className="setting-label" id={`${titleId}-motion`}>
            {t('settings.motion')}
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
                {t(o.label)}
              </label>
            ))}
          </div>
          <p className="setting-hint">
            {t('settings.motionHint')}
            {settings.motion === 'system' &&
              (systemReduced ? t('settings.motionSystemReduced') : t('settings.motionSystemFull'))}
          </p>
        </div>
        <Switch
          checked={settings.lowPower}
          onChange={(v) => update({ lowPower: v })}
          hint={t('settings.lowPowerHint')}
        >
          {t('settings.lowPower')}
        </Switch>
      </fieldset>

      <CharacterSettings />
      <MascotSettings />

      <fieldset className="settings-group">
        <legend>{t('settings.privacy')}</legend>
        <Switch
          checked={settings.hideFiles}
          onChange={(v) => update({ hideFiles: v })}
          hint={t('settings.hideFilesHint')}
        >
          {t('settings.hideFiles')}
        </Switch>
        <Switch
          checked={settings.showTitles}
          onChange={(v) => update({ showTitles: v })}
          hint={t('settings.showTitlesHint')}
        >
          {t('settings.showTitles')}
        </Switch>
      </fieldset>

      <fieldset className="settings-group">
        <legend>{t('settings.listOffice')}</legend>
        <Switch
          checked={settings.hideOffline}
          onChange={(v) => update({ hideOffline: v })}
          hint={t('settings.hideOfflineHint')}
        >
          {t('list.hideOffline')}
        </Switch>
      </fieldset>

      <fieldset className="settings-group">
        <legend>{t('settings.sound')}</legend>
        <Switch checked={settings.sound} onChange={setSound} hint={t('settings.soundHint')}>
          {t('settings.soundAlerts')}
        </Switch>
        <div className={`setting-item volume${settings.sound ? '' : ' disabled'}`}>
          <label className="setting-label" htmlFor={`${titleId}-volume`}>
            {t('settings.volume')}
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
            aria-valuetext={t('settings.volumeText', { n: Math.round(settings.volume * 100) })}
          />
          <span className="volume-value" aria-hidden="true">
            {Math.round(settings.volume * 100)}
          </span>
        </div>
        <div className="cue-tests" role="group" aria-label={t('settings.tryAria')}>
          <span className="setting-label">{t('settings.try')}</span>
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
              title={t(CUE_LABEL[c])}
            >
              {t(CUE_SHORT[c])}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
