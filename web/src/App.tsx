import { useMemo } from 'react';
import { AgentList, ListFilters, statusText, useServerNow } from './AgentList.tsx';
import { feedText } from './feed.ts';
import {
  ROLE_COLOR,
  STATUS_COLOR,
  activityText,
  agoText,
  durationText,
  entrypointLabel,
  isActive,
  roleLabel,
} from './labels.ts';
import { Office } from './office/Office.tsx';
import { visibleAgents } from './settings.ts';
import { EditLayoutButton, LayoutBar } from './LayoutBar.tsx';
import { SettingsButton, SettingsPanel } from './SettingsPanel.tsx';
import { brandTexts } from './office/brand.ts';
import { STATIC_DEMO, useBrand, useCurrentView, useLang, useOffice, useT, useTheme } from './store.ts';
import { ALL_PROJECTS, projectsOf, viewKey } from './view.ts';

function ConnectionBadge() {
  const connection = useOffice((s) => s.connection);
  const retryInMs = useOffice((s) => s.retryInMs);
  const t = useT();
  if (connection === 'open') {
    return (
      <span className="conn open" title={STATIC_DEMO ? t('conn.demoTitle') : t('conn.localTitle')}>
        <span className="conn-dot" /> <span className="conn-text">{t('conn.live')}</span>
      </span>
    );
  }
  return (
    <span className="conn waiting" role="status">
      <span className="conn-dot" />
      {connection === 'connecting'
        ? t('conn.connecting')
        : t('conn.retry', { s: Math.round((retryInMs ?? 1000) / 1000) })}
    </span>
  );
}

/** Proje seçici: "Tüm projeler" ya da tek proje. Seçim tarayıcıda hatırlanır. */
function ProjectPicker() {
  const snapshot = useOffice((s) => s.snapshot);
  const setView = useOffice((s) => s.setView);
  const view = useCurrentView();
  const projects = useMemo(() => projectsOf(snapshot), [snapshot]);
  const current = viewKey(view);
  const t = useT();
  return (
    <label className="picker">
      <span className="picker-label">{t('picker.project')}</span>
      <select value={current} onChange={(e) => setView(e.target.value)} aria-label={t('picker.projectAria')}>
        <option value={ALL_PROJECTS}>{t('picker.all')}</option>
        {projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        {current !== ALL_PROJECTS && !projects.includes(current) && (
          <option value={current}>{current}</option>
        )}
      </select>
    </label>
  );
}

function Summary() {
  const agents = useOffice((s) => s.snapshot?.agents);
  const hideOffline = useOffice((s) => s.settings.hideOffline);
  const view = useCurrentView();
  const t = useT();
  if (!agents) return null;
  const inView = visibleAgents(
    view.kind === 'all' ? agents : agents.filter((a) => a.project === view.project),
    hideOffline,
  );
  const sessions = inView.filter((a) => a.kind === 'session');
  const working = inView.filter((a) => isActive(a.status)).length;
  const helpers = inView.filter((a) => a.kind === 'subagent' && isActive(a.status)).length;
  return (
    <span className="summary">
      {t('summary.sessions', { n: sessions.length })} · {t('summary.working', { n: working })}
      {helpers > 0 ? ` · ${t('summary.helpers', { n: helpers })}` : ''}
    </span>
  );
}

/** Seçili karakterin ayrıntıları: rol, ad, durum, şu anki işlem, son işlemler, çalışma süresi. */
function DetailPanel() {
  const selectedId = useOffice((s) => s.selectedId);
  const agent = useOffice((s) => s.snapshot?.agents.find((a) => a.id === s.selectedId));
  const parent = useOffice((s) => {
    const a = s.snapshot?.agents.find((x) => x.id === s.selectedId);
    return a?.parentId ? s.snapshot?.agents.find((x) => x.id === a.parentId) : undefined;
  });
  const hideFiles = useOffice((s) => s.settings.hideFiles);
  const showTitles = useOffice((s) => s.settings.showTitles);
  const select = useOffice((s) => s.select);
  const now = useServerNow(5_000);
  const t = useT();
  const lang = useLang();
  if (!selectedId || !agent) return null;
  const current = activityText(agent.current, hideFiles);
  const entry = entrypointLabel(agent.entrypoint);
  const active = isActive(agent.status);
  return (
    <section className="detail glass" aria-label={t('detail.aria')}>
      <header className="detail-head">
        <span className="role-chip big" style={{ ['--role-color' as string]: ROLE_COLOR[agent.role] }}>
          {roleLabel(agent.role, lang)}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => select(null)}
          aria-label={t('detail.close')}
        >
          ×
        </button>
      </header>
      <h2 className="detail-name">{agent.name}</h2>
      {showTitles && agent.title && <p className="detail-title">{agent.title}</p>}
      <dl className="detail-grid">
        <dt>{t('detail.status')}</dt>
        <dd>
          <span
            className={`dot${active ? ' pulse' : ''}`}
            style={{ background: STATUS_COLOR[agent.status], color: STATUS_COLOR[agent.status] }}
          />
          {statusText(agent, lang)}
        </dd>
        <dt>{t('detail.now')}</dt>
        <dd className="mono">{current ?? '—'}</dd>
        <dt>{t('detail.project')}</dt>
        <dd>{agent.project}</dd>
        {entry && (
          <>
            <dt>{t('detail.where')}</dt>
            <dd>{entry}</dd>
          </>
        )}
        {parent && (
          <>
            <dt>{t('detail.lead')}</dt>
            <dd>{parent.name}</dd>
          </>
        )}
        {agent.agentType && (
          <>
            <dt>{t('detail.type')}</dt>
            <dd>{agent.agentType}</dd>
          </>
        )}
        <dt>{t('detail.uptime')}</dt>
        <dd>{agent.startedAt ? durationText(now - agent.startedAt, lang) : '—'}</dd>
      </dl>
      {agent.recent.length > 0 && (
        <>
          <h3 className="detail-sub">
            {t('detail.recent')} <span className="count">{Math.min(20, agent.recent.length)}</span>
          </h3>
          <ol className="recent">
            {agent.recent.slice(0, 20).map((r, i) => (
              <li key={`${r.at}-${i}`}>
                <span className="mono">{activityText(r, hideFiles)}</span>
                <span className="ago">{agoText(r.at, now, lang)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Ekranın köşesindeki canlı işlem akışı: "Tasarımcı · Edit · theme.dart". */
function Feed() {
  const feed = useOffice((s) => s.feed);
  const hideFiles = useOffice((s) => s.settings.hideFiles);
  const agents = useOffice((s) => s.snapshot?.agents);
  const select = useOffice((s) => s.select);
  const editing = useOffice((s) => s.editingLayout);
  const view = useCurrentView();
  const t = useT();
  const lang = useLang();
  const items = useMemo(() => {
    if (view.kind === 'all') return feed;
    const ids = new Set((agents ?? []).filter((a) => a.project === view.project).map((a) => a.id));
    return feed.filter((f) => ids.has(f.agentId));
  }, [feed, agents, view]);
  // Düzenleme çubuğu ekranın altını kullanır; akış o sırada gizlenir.
  if (items.length === 0 || editing) return null;
  return (
    <ol className="feed" aria-label={t('feed.aria')} aria-live="off">
      {items.map((f, i) => (
        <li key={f.key} style={{ opacity: 0.65 + (0.35 * (i + 1)) / items.length }}>
          <button type="button" onClick={() => select(f.agentId)} title={f.name}>
            <span className="feed-dot" style={{ background: ROLE_COLOR[f.role] }} aria-hidden="true" />
            {feedText(f, hideFiles, lang)}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function App() {
  const panelOpen = useOffice((s) => s.panelOpen);
  const togglePanel = useOffice((s) => s.togglePanel);
  const select = useOffice((s) => s.select);
  const connected = useOffice((s) => s.connection === 'open');
  const hasData = useOffice((s) => s.snapshot !== null);
  const reduced = useOffice((s) => s.reducedMotion);
  const t = useT();
  const lang = useLang();
  const themeName = t(`theme.${useTheme().id}.name`);
  const brandInfo = brandTexts(useBrand(), lang);

  return (
    <div className={`app${panelOpen ? ' panel-open' : ''}${reduced ? ' reduce-motion' : ''}`}>
      <div className="stage">
        <Office />
        {!hasData && (
          <div className="stage-overlay">
            <div className="loader" />
            {STATIC_DEMO ? (
              <p>{t('loading.demo')}</p>
            ) : (
              <>
                <p>{t('loading.server')}</p>
                <p className="hint">
                  {t('loading.hintBefore')}
                  <code>npm start</code>
                  {t('loading.hintAfter')}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <header className="topbar glass">
        <h1 title={brandInfo.title}>
          {brandInfo.icon && (
            <img className="brand-icon" src={brandInfo.icon} alt="" width="22" height="22" />
          )}
          {t('app.name')} {brandInfo.suffix && <span className="brand-name">{brandInfo.suffix}</span>}
          <span className="theme-name">{themeName}</span>
        </h1>
        {STATIC_DEMO && (
          <a
            className="demo-badge"
            href="https://github.com/zinkxx/agent-office"
            target="_blank"
            rel="noreferrer"
            title={t('top.demoBadgeTitle')}
          >
            {t('top.demoBadge')}
          </a>
        )}
        <ConnectionBadge />
        {hasData && <ProjectPicker />}
        {connected && <Summary />}
        <div className="spacer" />
        <button
          type="button"
          className="ghost with-icon"
          onClick={() => select(null)}
          title={t('top.wholeOfficeTitle')}
          aria-label={t('top.wholeOffice')}
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
            <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
          </svg>
          <span className="label-text">{t('top.wholeOffice')}</span>
        </button>
        <EditLayoutButton />
        <SettingsButton />
        <button
          type="button"
          className="ghost with-icon"
          onClick={togglePanel}
          aria-expanded={panelOpen}
          aria-controls="side-panel"
          aria-label={panelOpen ? t('top.hidePanel') : t('top.agents')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="3.5" y="4" width="17" height="16" rx="2" />
            <path d="M14.5 4v16" />
          </svg>
          <span className="label-text">{panelOpen ? t('top.hidePanel') : t('top.agents')}</span>
        </button>
      </header>

      <SettingsPanel />
      <LayoutBar />
      <DetailPanel />
      <Feed />

      <aside id="side-panel" className="side-panel glass" aria-hidden={!panelOpen}>
        <ListFilters />
        <AgentList />
      </aside>
    </div>
  );
}
