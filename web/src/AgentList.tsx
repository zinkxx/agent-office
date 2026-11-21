import { useEffect, useMemo, useState } from 'react';
import type { Agent, AgentRole, TeamMember } from '../../shared/types.ts';
import type { Lang } from './i18n.ts';
import {
  ROLE_COLOR,
  STATUS_COLOR,
  activityText,
  agoText,
  entrypointLabel,
  groupByProject,
  isActive,
  roleLabel,
  statusLabel,
} from './labels.ts';
import { memberFor, memberNameMap } from './office/sim/plan.ts';
import { visibleAgents } from './settings.ts';
import { useCurrentView, useLang, useOffice, useT } from './store.ts';

/** Sunucu saatine göre "şimdi"; 15 sn'de bir ilerler ("3 dk önce" yazıları için). */
export function useServerNow(stepMs = 15_000): number {
  const offset = useOffice((s) => s.clockOffset);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now + offset;
}

/** Yardımcı ajan işini bitirdiyse ofisten ayrılmıştır; listede bunu söyler. */
export function statusText(agent: Agent, lang: Lang): string {
  if (agent.kind === 'subagent' && agent.status === 'idle') return statusLabel('finished', lang);
  return statusLabel(agent.status, lang);
}

function AgentRow({ agent, now, child = false }: { agent: Agent; now: number; child?: boolean }) {
  const selected = useOffice((s) => s.selectedId === agent.id);
  const select = useOffice((s) => s.select);
  const hideFiles = useOffice((s) => s.settings.hideFiles);
  const showTitles = useOffice((s) => s.settings.showTitles);
  const lang = useLang();
  const activity = activityText(agent.current, hideFiles);
  const entry = entrypointLabel(agent.entrypoint);
  const active = isActive(agent.status);
  const done = agent.kind === 'subagent' && !active;

  return (
    <li>
      <button
        type="button"
        className={`agent-row${child ? ' child' : ''}${selected ? ' selected' : ''}${
          agent.status === 'offline' || done ? ' offline' : ''
        }`}
        onClick={() => select(agent.id)}
        title={(showTitles && agent.title) || agent.name}
        aria-pressed={selected}
      >
        <span
          className={`dot${active ? ' pulse' : ''}`}
          style={{ background: STATUS_COLOR[agent.status], color: STATUS_COLOR[agent.status] }}
        />
        <span className="agent-main">
          <span className="agent-name">
            {child && <span className="branch">↳</span>}
            {agent.name}
          </span>
          <span className="agent-sub">
            <span className="status" style={{ color: active ? STATUS_COLOR[agent.status] : undefined }}>
              {statusText(agent, lang)}
            </span>
            {activity && <span className="activity"> · {activity}</span>}
            {!active && <span className="ago"> · {agoText(agent.lastActivityAt, now, lang)}</span>}
          </span>
        </span>
        <span className="row-badges">
          <span className="role-chip" style={{ ['--role-color' as string]: ROLE_COLOR[agent.role] }}>
            {roleLabel(agent.role, lang)}
          </span>
          {entry && <span className={`badge ${agent.entrypoint === 'cli' ? 'cli' : 'vscode'}`}>{entry}</span>}
        </span>
      </button>
    </li>
  );
}

function AbsentRow({ member }: { member: TeamMember }) {
  const t = useT();
  const lang = useLang();
  return (
    <li>
      <div className="agent-row absent" title={t('list.absentTitle')}>
        <span className="dot hollow" />
        <span className="agent-main">
          <span className="agent-name">{member.name}</span>
          <span className="agent-sub">{statusLabel('idle', lang)}</span>
        </span>
        <span className="row-badges">
          <span className="role-chip" style={{ ['--role-color' as string]: ROLE_COLOR[member.role] }}>
            {roleLabel(member.role, lang)}
          </span>
        </span>
      </div>
    </li>
  );
}

const ROLES: AgentRole[] = [
  'lead',
  'designer',
  'developer',
  'tester',
  'reviewer',
  'researcher',
  'architect',
  'other',
];

/**
 * Liste filtreleri: roller (seçilenler listede ve sahnede öne çıkar, diğerleri sahnede soluklaşır) ve
 * "Kapalıları gizle" (kapalı oturumlar, işini bitirmiş yardımcılar ve masada olmayan ekip üyeleri).
 */
export function ListFilters() {
  const hideOffline = useOffice((s) => s.settings.hideOffline);
  const update = useOffice((s) => s.updateSettings);
  const t = useT();
  return (
    <div className="list-filters">
      <RoleFilters />
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          checked={hideOffline}
          onChange={() => update({ hideOffline: !hideOffline })}
        />
        <span className="switch" aria-hidden="true" />
        {t('list.hideOffline')}
      </label>
    </div>
  );
}

function RoleFilters() {
  const snapshot = useOffice((s) => s.snapshot);
  const filter = useOffice((s) => s.roleFilter);
  const toggle = useOffice((s) => s.toggleRole);
  const clear = useOffice((s) => s.clearRoles);
  const view = useCurrentView();
  const t = useT();
  const lang = useLang();
  const present = useMemo(() => {
    const set = new Set<AgentRole>();
    for (const a of snapshot?.agents ?? [])
      if (view.kind === 'all' || a.project === view.project) set.add(a.role);
    for (const t of snapshot?.teams ?? [])
      if (view.kind === 'all' || t.project === view.project) for (const m of t.members) set.add(m.role);
    for (const r of filter) set.add(r);
    return ROLES.filter((r) => set.has(r));
  }, [snapshot, view, filter]);
  if (present.length < 2) return null;
  return (
    <div className="role-filters" role="group" aria-label={t('list.roleFilter')}>
      <button
        type="button"
        className={`chip${filter.length === 0 ? ' on' : ''}`}
        onClick={clear}
        aria-pressed={filter.length === 0}
      >
        {t('list.all')}
      </button>
      {present.map((r) => (
        <button
          key={r}
          type="button"
          className={`chip${filter.includes(r) ? ' on' : ''}`}
          style={{ ['--role-color' as string]: ROLE_COLOR[r] }}
          onClick={() => toggle(r)}
          aria-pressed={filter.includes(r)}
        >
          <span className="chip-dot" aria-hidden="true" />
          {roleLabel(r, lang)}
        </button>
      ))}
    </div>
  );
}

export function AgentList() {
  const snapshot = useOffice((s) => s.snapshot);
  const hideOffline = useOffice((s) => s.settings.hideOffline);
  const filter = useOffice((s) => s.roleFilter);
  const view = useCurrentView();
  const now = useServerNow();
  const t = useT();
  const groups = useMemo(() => {
    const roleOk = (r: AgentRole) => filter.length === 0 || filter.includes(r);
    const inView = (snapshot?.agents ?? []).filter(
      (a) => (view.kind === 'all' || a.project === view.project) && roleOk(a.role),
    );
    const agents = visibleAgents(inView, hideOffline);
    const hiddenBy = new Map<string, number>();
    for (const a of inView)
      if (!agents.includes(a)) hiddenBy.set(a.project, (hiddenBy.get(a.project) ?? 0) + 1);
    return groupByProject(agents).map((g) => {
      const team = snapshot?.teams.find((t) => t.project === g.project)?.members ?? [];
      // Çalışan yardımcının ekip üyesi: türü üyenin adıysa ya da iş tanımı üyenin adıyla başlıyorsa (masa ataması
      // ile aynı kural, bkz. plan.ts memberFor).
      const byName = memberNameMap(team);
      const working = new Set(
        (snapshot?.agents ?? [])
          .filter((a) => a.project === g.project && a.kind === 'subagent' && isActive(a.status))
          .map((a) => memberFor(a, byName)?.name)
          .filter(Boolean),
      );
      const absent = hideOffline ? [] : team.filter((m) => !working.has(m.name) && roleOk(m.role));
      return { ...g, absent, hidden: hiddenBy.get(g.project) ?? 0 };
    });
  }, [snapshot, view, filter, hideOffline]);
  const allHidden = useMemo(
    () =>
      hideOffline && (snapshot?.agents ?? []).some((a) => view.kind === 'all' || a.project === view.project),
    [snapshot, view, hideOffline],
  );

  return (
    <div className="agent-list">
      {snapshot && groups.length === 0 && (
        <p className="empty">
          {filter.length > 0 ? t('list.emptyFiltered') : allHidden ? t('list.emptyHidden') : t('list.empty')}
        </p>
      )}
      {groups.map((g) => {
        const count = g.sessions.reduce((n, s) => n + 1 + s.subagents.length, g.orphans.length);
        return (
          <section key={g.project} className="project">
            <h2>
              {g.project}
              <span className="count">
                {t('list.agents', { n: count })}
                {g.absent.length > 0 ? ` · ${t('list.idleMembers', { n: g.absent.length })}` : ''}
                {g.hidden > 0 ? ` · ${t('list.hidden', { n: g.hidden })}` : ''}
              </span>
            </h2>
            <ul>
              {g.sessions.map(({ agent, subagents }) => (
                <li key={agent.id} className="session-group">
                  <ul>
                    <AgentRow agent={agent} now={now} />
                    {subagents.map((sub) => (
                      <AgentRow key={sub.id} agent={sub} now={now} child />
                    ))}
                  </ul>
                </li>
              ))}
              {g.orphans.map((sub) => (
                <AgentRow key={sub.id} agent={sub} now={now} child />
              ))}
              {g.absent.map((m) => (
                <AbsentRow key={`absent-${m.name}`} member={m} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
