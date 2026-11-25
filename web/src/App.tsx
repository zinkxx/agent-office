import { useMemo } from 'react';
import type { Agent } from '../../shared/types.ts';
import { projectDisplayName, projectOverview } from './projectActivity.ts';
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
import { shownAgents } from './closedProjects.ts';
import { visibleAgents } from './settings.ts';
import { EditLayoutButton, LayoutBar } from './LayoutBar.tsx';
import { SettingsButton, SettingsPanel } from './SettingsPanel.tsx';
import { brandTexts } from './office/brand.ts';
import { captureView, dataUrlToBytes, snapshotFileName } from './office/capture.ts';
import {
  STATIC_DEMO,
  useBrand,
  useCurrentView,
  useLang,
  useOffice,
  useOpenSnapshot,
  useT,
  useTheme,
} from './store.ts';
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
  // Kapatılan projeler seçicide yer almaz.
  const snapshot = useOpenSnapshot();
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
  const closedProjects = useOffice((s) => s.settings.closedProjects);
  const view = useCurrentView();
  const t = useT();
  if (!agents) return null;
  const inView = shownAgents(
    view.kind === 'all' ? agents : agents.filter((a) => a.project === view.project),
    { hideOffline, closedProjects },
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
  // Kapalı projelerin ajanları açılamaz: seçim açık anlık görüntüde aranır.
  const openSnap = useOpenSnapshot();
  const agent = openSnap?.agents.find((a) => a.id === selectedId);
  const parent = agent?.parentId ? openSnap?.agents.find((x) => x.id === agent.parentId) : undefined;
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

/** Bir ajan satırı (proje panelindeki oturum ve yardımcı listeleri). */
function ProjectAgentRow({ agent }: { agent: Agent }) {
  const select = useOffice((s) => s.select);
  const showTitles = useOffice((s) => s.settings.showTitles);
  const lang = useLang();
  const active = isActive(agent.status);
  return (
    <li>
      <button type="button" onClick={() => select(agent.id)} title={agent.name}>
        <span
          className={`dot${active ? ' pulse' : ''}`}
          style={{ background: STATUS_COLOR[agent.status], color: STATUS_COLOR[agent.status] }}
        />
        <span className="who">
          <span className="who-name">{agent.name}</span>
          {agent.kind === 'session' && showTitles && agent.title ? (
            <span className="who-title">{agent.title}</span>
          ) : agent.kind === 'subagent' ? (
            <span className="who-title">{roleLabel(agent.role, lang)}</span>
          ) : null}
        </span>
        <span className="who-status">{statusText(agent, lang)}</span>
      </button>
    </li>
  );
}

/**
 * "Tüm projeler" görünümünde tıklanan projenin paneli: oturumlar, yardımcılar ve tüm ajanların işlemleri tek
 * zaman çizelgesinde. Satıra tıklayınca o ajan seçilir.
 */
function ProjectPanel() {
  const project = useOffice((s) => s.selectedProject);
  const agents = useOffice((s) => s.snapshot?.agents);
  const hideOffline = useOffice((s) => s.settings.hideOffline);
  const hideFiles = useOffice((s) => s.settings.hideFiles);
  const showTitles = useOffice((s) => s.settings.showTitles);
  const selectProject = useOffice((s) => s.selectProject);
  const select = useOffice((s) => s.select);
  const setView = useOffice((s) => s.setView);
  const closeProject = useOffice((s) => s.closeProject);
  const view = useCurrentView();
  const now = useServerNow(5_000);
  const t = useT();
  const lang = useLang();
  const overview = useMemo(
    () => (project && agents ? projectOverview(visibleAgents(agents, hideOffline), project) : null),
    [project, agents, hideOffline],
  );
  if (view.kind !== 'all' || !project || !overview) return null;
  return (
    <section className="detail project-panel glass" aria-label={t('projectPanel.aria')}>
      <header className="detail-head">
        <span className="role-chip big" style={{ ['--role-color' as string]: ROLE_COLOR.lead }}>
          {t('projectPanel.kicker')}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => selectProject(null)}
          aria-label={t('projectPanel.close')}
        >
          ×
        </button>
      </header>
      <h2 className="detail-name">{projectDisplayName(agents ?? [], project, showTitles)}</h2>
      {projectDisplayName(agents ?? [], project, showTitles) !== project && (
        <p className="detail-title mono">{project}</p>
      )}
      <p className="detail-title">
        {t('summary.sessions', { n: overview.sessions.length })} ·{' '}
        {t('summary.working', { n: overview.working })}
        {overview.lastActivityAt > 0 &&
          ` · ${t('projectPanel.lastActive')} ${agoText(overview.lastActivityAt, now, lang)}`}
      </p>
      <div className="project-actions">
        <button type="button" className="ghost" onClick={() => setView(project)}>
          {t('projectPanel.openProject')}
        </button>
        <button
          type="button"
          className="ghost"
          title={t('projectPanel.closeProjectTitle')}
          // closeProject seçili projeyi de siler (bkz. closedProjects.ts selectionAfterClose).
          onClick={() => closeProject(project)}
        >
          {t('projectPanel.closeProject')}
        </button>
      </div>

      {overview.sessions.length > 0 && (
        <>
          <h3 className="detail-sub">
            {t('projectPanel.sessions')} <span className="count">{overview.sessions.length}</span>
          </h3>
          <ul className="project-sessions">
            {overview.sessions.map((a) => (
              <ProjectAgentRow key={a.id} agent={a} />
            ))}
          </ul>
        </>
      )}
      {overview.helpers.length > 0 && (
        <>
          <h3 className="detail-sub">
            {t('projectPanel.helpers')} <span className="count">{overview.helpers.length}</span>
          </h3>
          <ul className="project-sessions">
            {overview.helpers.map((a) => (
              <ProjectAgentRow key={a.id} agent={a} />
            ))}
          </ul>
        </>
      )}

      <h3 className="detail-sub">
        {t('projectPanel.timeline')} <span className="count">{overview.items.length}</span>
      </h3>
      {overview.items.length === 0 ? (
        <p className="project-empty">{t('projectPanel.empty')}</p>
      ) : (
        <ol className="project-timeline">
          {overview.items.map((item, i) => (
            <li key={`${item.agentId}-${item.activity.at}-${i}`}>
              <button type="button" onClick={() => select(item.agentId)} title={item.name}>
                <span
                  className="feed-dot inline"
                  style={{ background: ROLE_COLOR[item.role] }}
                  aria-hidden="true"
                />
                <span className="what mono">{activityText(item.activity, hideFiles)}</span>
                <span className="by">{item.name}</span>
                <span className="ago">{agoText(item.activity.at, now, lang)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Ekranın köşesindeki canlı işlem akışı: "Tasarımcı · Edit · theme.dart". */
function Feed() {
  const feed = useOffice((s) => s.feed);
  const hideFiles = useOffice((s) => s.settings.hideFiles);
  // Kapalı projelerin ajanları çıkarılmış: akışta onların işlemleri görünmez, tıklanıp seçilemez.
  const agents = useOpenSnapshot()?.agents;
  const select = useOffice((s) => s.select);
  const editing = useOffice((s) => s.editingLayout);
  const view = useCurrentView();
  const t = useT();
  const lang = useLang();
  const items = useMemo(() => {
    const ids = new Set(
      (agents ?? []).filter((a) => view.kind === 'all' || a.project === view.project).map((a) => a.id),
    );
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

/**
 * Sahnenin o anki görünümünü PNG olarak indirir. Dosya tarayıcıda oluşur, hiçbir yere yüklenmez; yalnızca
 * 3B tuval yakalanır, HTML etiketleri (adlar, dosya adları) görüntüye girmez.
 */
function saveImage() {
  const data = dataUrlToBytes(captureView() ?? '');
  if (!data) return;
  const url = URL.createObjectURL(new Blob([data.bytes], { type: data.type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = snapshotFileName(new Date());
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SaveImageButton({ disabled }: { disabled: boolean }) {
  const t = useT();
  return (
    <button
      type="button"
      className="ghost with-icon"
      onClick={saveImage}
      disabled={disabled}
      title={t('top.saveImageTitle')}
      aria-label={t('top.saveImage')}
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
        <path d="M4 8a1 1 0 0 1 1-1h3l1.5-2h5L16 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
      <span className="label-text">{t('top.saveImage')}</span>
    </button>
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
          onClick={() => {
            select(null);
            useOffice.getState().selectProject(null);
          }}
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
        <SaveImageButton disabled={!hasData} />
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
      <ProjectPanel />
      <Feed />

      <aside id="side-panel" className="side-panel glass" aria-hidden={!panelOpen}>
        <ListFilters />
        <AgentList />
      </aside>
    </div>
  );
}
