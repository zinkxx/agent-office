import type { AgentRole, TeamMember } from '../../shared/types.ts';
import type { ParsedEvent } from './parser.ts';
import type { LiveSession } from './sessions.ts';
import type { OfficeStore } from './store.ts';

/**
 * Demo modu (AJAN_OFISI_DEMO=1): gerçek kayıtlar yerine UYDURMA, canlı değişen bir ofis üretir.
 * Görsel kontrol, ekran görüntüsü ve performans denemesi içindir. Hiçbir dosya okumaz.
 */

interface DemoProject {
  name: string;
  team: TeamMember[];
  sessions: { id: string; name: string; entrypoint: LiveSession['entrypoint'] }[];
}

const PROJECTS: DemoProject[] = [
  {
    name: 'Atlas',
    team: [
      { name: 'gelistirici', role: 'developer' },
      { name: 'inceleyici', role: 'reviewer' },
      { name: 'mimar', role: 'architect' },
      { name: 'tasarimci', role: 'designer' },
      { name: 'testci', role: 'tester' },
    ],
    sessions: [
      { id: 'demo-atlas-1', name: 'atlas-45', entrypoint: 'cli' },
      { id: 'demo-atlas-2', name: 'atlas-bf', entrypoint: 'claude-vscode' },
    ],
  },
  {
    name: 'Nova',
    team: [
      { name: 'gelistirici', role: 'developer' },
      { name: 'testci', role: 'tester' },
    ],
    sessions: [{ id: 'demo-nova-1', name: 'nova-12', entrypoint: 'claude-vscode' }],
  },
  {
    name: 'Pusula',
    team: [],
    sessions: [{ id: 'demo-pusula-1', name: 'pusula-7', entrypoint: 'cli' }],
  },
];

/** Rol → o rolün sık kullandığı (uydurma) işlemler. */
const WORK: Record<AgentRole, readonly (readonly [string, string?])[]> = {
  lead: [['Read', 'PLAN.md'], ['Edit', 'PLAN.md'], ['Bash'], ['Grep'], ['Read', 'README.md'], ['Skill']],
  designer: [
    ['Edit', 'theme.dart'],
    ['Edit', 'colors.dart'],
    ['Read', 'pressable.dart'],
    ['Write', 'profile_card.dart'],
    ['Edit', 'styles.css'],
  ],
  developer: [
    ['Edit', 'profile_screen.dart'],
    ['Read', 'api_client.dart'],
    ['Write', 'match_service.dart'],
    ['Bash'],
    ['Grep'],
    ['Edit', 'router.dart'],
  ],
  tester: [
    ['Bash'],
    ['Edit', 'profile_test.dart'],
    ['Bash'],
    ['Read', 'match_service.dart'],
    ['Write', 'login_test.dart'],
  ],
  reviewer: [
    ['Read', 'profile_screen.dart'],
    ['Grep'],
    ['Read', 'router.dart'],
    ['Glob'],
    ['Read', 'theme.dart'],
  ],
  researcher: [['Grep'], ['Glob'], ['WebSearch'], ['Read', 'pubspec.yaml'], ['WebFetch']],
  architect: [['Read', 'PLAN.md'], ['Glob'], ['Read', 'main.dart'], ['Grep']],
  other: [['Read', 'README.md'], ['Bash']],
};

/** Ekip listesinde olmayan yardımcılar için yerleşik türler. */
const BUILT_IN_TYPES = ['Explore', 'Plan', 'general-purpose'] as const;
const TASKS = [
  'Profil ekranını düzenle',
  'Testleri çalıştır',
  'Renk paletini güncelle',
  'Kodu incele',
  'Rotaları araştır',
  'Mimariyi planla',
  'Hata ayıkla',
  'Eşleşme servisini yaz',
];

/** Küçük, tohumlu rastgele sayı üreteci (her çalıştırmada aynı akış). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoSub {
  id: string;
  sessionId: string;
  project: string;
  role: AgentRole;
  agentType: string;
  label: string;
  endsAt: number;
  done: boolean;
}

interface DemoOptions {
  /** true: açılışta ofis dolu başlar (~20 karakter). */
  full?: boolean;
  /** Bir adımın aralığı (ms). */
  tickMs?: number;
  seed?: number;
}

/** Demo ofisini çalıştırır; durdurmak için dönen fonksiyonu çağır. */
export function startDemo(store: OfficeStore, onChange: () => void, options: DemoOptions = {}): () => void {
  const random = rng(options.seed ?? 7);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const startedAt = Date.now() - 40 * 60_000;
  const busy = new Map<string, boolean>();
  const subs: DemoSub[] = [];
  let seq = 0;

  for (const p of PROJECTS) store.setTeam(p.name, p.team);
  for (const p of PROJECTS) for (const s of p.sessions) busy.set(s.id, true);

  const setLive = () => {
    const sessions: LiveSession[] = [];
    let pid = 9000;
    for (const p of PROJECTS)
      for (const s of p.sessions)
        sessions.push({
          pid: pid++,
          sessionId: s.id,
          name: s.name,
          cwd: `/demo/${p.name}`,
          entrypoint: s.entrypoint,
          status: busy.get(s.id) ? 'busy' : 'idle',
          startedAt,
          updatedAt: Date.now(),
        });
    store.setLiveSessions(sessions);
  };

  const emit = (sessionId: string, project: string, events: ParsedEvent[], sub?: DemoSub) => {
    store.ingest(
      sub ? { sessionId, agentId: sub.id, label: sub.label, agentType: sub.agentType } : { sessionId },
      { project, events },
    );
  };

  const work = (role: AgentRole, at: number): ParsedEvent => {
    if (random() < 0.18) return { kind: 'thinking', at };
    const [tool, file] = pick(WORK[role]);
    const event: Extract<ParsedEvent, { kind: 'tool' }> = { kind: 'tool', tool, at };
    if (file) event.file = file;
    if (role === 'tester' && (tool === 'Bash' || tool === 'Write' || tool === 'Edit')) event.test = true;
    return event;
  };

  const spawn = (project: DemoProject, sessionId: string, at: number) => {
    const fromTeam = project.team.length > 0 && random() < 0.7 ? pick(project.team) : undefined;
    const agentType = fromTeam?.name ?? pick(BUILT_IN_TYPES);
    const role: AgentRole =
      fromTeam?.role ??
      (agentType === 'Explore' ? 'researcher' : agentType === 'Plan' ? 'architect' : 'developer');
    const sub: DemoSub = {
      id: `demo-sub-${++seq}`,
      sessionId,
      project: project.name,
      role,
      agentType,
      label: pick(TASKS),
      endsAt: at + 50_000 + random() * 130_000,
      done: false,
    };
    subs.push(sub);
    emit(sessionId, project.name, [{ kind: 'tool', tool: 'Agent', spawnLabel: sub.label, at }]);
    emit(sessionId, project.name, [work(role, at + 1)], sub);
  };

  /** Çalışan yardımcılar ve henüz ofisten çıkmamış (yeni bitmiş) olanlar. */
  const subCount = () => subs.length;

  // Açılış: herkes çalışıyor; "dolu" modda ofis kalabalık başlar.
  const t0 = Date.now();
  setLive();
  for (const p of PROJECTS)
    for (const s of p.sessions)
      emit(s.id, p.name, [{ kind: 'title', title: `${p.name} üzerinde çalışma` }, work('lead', t0)]);
  if (options.full) {
    const atlas = PROJECTS[0]!;
    for (let i = 0; i < 11; i++) spawn(atlas, atlas.sessions[i % 2]!.id, t0 + i);
    const nova = PROJECTS[1]!;
    for (let i = 0; i < 3; i++) spawn(nova, nova.sessions[0]!.id, t0 + 20 + i);
  }

  const tick = () => {
    const now = Date.now();
    for (const p of PROJECTS) {
      for (const s of p.sessions) {
        const r = random();
        if (busy.get(s.id)) {
          if (r < 0.04) {
            busy.set(s.id, false);
            emit(s.id, p.name, [{ kind: 'turn-end', at: now }]);
          } else if (
            r < 0.07 + (options.full && subs.filter((x) => !x.done).length < 12 ? 0.2 : 0) &&
            subCount() < 18
          ) {
            spawn(p, s.id, now);
          } else if (r < 0.09) {
            // Mesaj: çoğunlukla aynı projedeki diğer oturuma, bazen başka projeye.
            const same = p.sessions.filter((o) => o.id !== s.id);
            const target =
              same.length > 0 && random() < 0.6
                ? pick(same)
                : pick(PROJECTS.filter((o) => o !== p).flatMap((o) => o.sessions));
            emit(s.id, p.name, [{ kind: 'tool', tool: 'SendMessage', to: target.name, at: now }]);
          } else if (r < 0.1) {
            emit(s.id, p.name, [{ kind: 'tool', tool: 'AskUserQuestion', at: now }]);
          } else if (r < 0.55) {
            emit(s.id, p.name, [work('lead', now)]);
          }
        } else if (r < 0.05) {
          busy.set(s.id, true);
          emit(s.id, p.name, [{ kind: 'human', at: now }]);
        }
      }
    }
    for (const sub of subs) {
      if (sub.done) continue;
      if (now >= sub.endsAt) {
        sub.done = true;
        emit(sub.sessionId, sub.project, [{ kind: 'turn-end', at: now }], sub);
      } else if (random() < 0.5) {
        emit(sub.sessionId, sub.project, [work(sub.role, now)], sub);
      }
    }
    // Eski, bitmiş yardımcıları unut (store zaten bir süre sonra gizler).
    for (let i = subs.length - 1; i >= 0; i--)
      if (subs[i]!.done && now - subs[i]!.endsAt > 95_000) subs.splice(i, 1);
    setLive();
    onChange();
  };

  const timer = setInterval(tick, options.tickMs ?? 1_500);
  onChange();
  return () => clearInterval(timer);
}
