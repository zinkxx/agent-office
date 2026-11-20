import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { Vector3, type Group } from 'three';
import type { Agent, AgentRole } from '../../../../shared/types.ts';
import { ROLE_COLOR, ROLE_LABEL, STATUS_COLOR, STATUS_LABEL } from '../../labels.ts';
import { useOffice, useRoleLook } from '../../store.ts';
import { Character, lookFor, type CharacterDrive } from '../Character.tsx';
import { Bubble, type IconName } from '../icons.tsx';
import { Label } from '../Label.tsx';
import type { OfficePlan } from '../sim/plan.ts';
import { residentId, type OfficeSim } from '../sim/sim.ts';

function phaseOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h / 37;
}

const camLocal = new Vector3();

/** Tek bir karakter: konumu, yönü ve hareketi her karede simülasyondan okunur. */
export function ActorView({
  agent,
  sim,
  dimmed,
  reduced,
  lookKey,
  selectable = true,
}: {
  agent: Agent;
  sim: OfficeSim;
  /** Rol filtresi dışında: soluk ve etiketsiz. */
  dimmed: boolean;
  reduced: boolean;
  /** Görünümün (saç, ten, kıyafet) türetildiği anahtar; ekip üyesi her işte aynı kişi görünsün diye. */
  lookKey?: string;
  /** Çalışmayan ekip üyesinin karakteri seçilemez (ayrıntı panelinde karşılığı yok). */
  selectable?: boolean;
}) {
  const group = useRef<Group>(null);
  const label = useRef<Group>(null);
  const selected = useOffice((s) => s.selectedId === agent.id);
  const custom = useRoleLook(agent.role);
  const key = lookKey ?? agent.id;
  const look = useMemo(() => lookFor(key, agent.role, custom), [key, agent.role, custom]);
  const drive = useRef<CharacterDrive>({
    pose: 'sit',
    speed: 0,
    gesture: 'none',
    holding: null,
    pastime: null,
    opacity: 1,
    status: agent.status,
  });
  const status = useRef(agent.status);
  status.current = agent.status;
  const dimRef = useRef(dimmed);
  dimRef.current = dimmed;
  const [bubble, setBubble] = useState<IconName | null>(null);
  const [visible, setVisible] = useState(false);
  const [compact, setCompact] = useState(true);
  const world = useRef(new Vector3());

  useFrame(({ camera }) => {
    const a = sim.actors.get(agent.id);
    const g = group.current;
    if (!g) return;
    if (!a || !a.visible) {
      if (g.visible) g.visible = false;
      if (visible) setVisible(false);
      return;
    }
    if (!g.visible) g.visible = true;
    if (!visible) setVisible(true);
    if (a.faceCamera && g.parent) {
      camLocal.copy(camera.position);
      g.parent.worldToLocal(camLocal);
      a.targetHeading = Math.atan2(camLocal.x - a.x, camLocal.z - a.z);
    }
    g.position.set(a.x, 0, a.z);
    g.rotation.y = a.heading;
    const d = drive.current;
    d.pose = a.pose;
    d.speed = a.speed;
    d.gesture = a.gesture;
    d.holding = a.holding;
    d.pastime = a.pastime;
    d.opacity = a.opacity * (dimRef.current ? 0.22 : 1);
    d.status = a.atHome ? status.current : 'working';
    if (label.current) {
      const sitting = a.pose === 'sit' || a.pose === 'sofa';
      label.current.position.y += ((sitting ? 1.62 : 2.02) - label.current.position.y) * 0.2;
    }
    const s = status.current;
    const next: IconName | null =
      a.bubble ??
      (a.script === null && a.atHome
        ? s === 'asking'
          ? 'question'
          : s === 'thinking'
            ? 'thought'
            : null
        : null);
    if (next !== bubble) setBubble(next);
    // Uzaktan bakınca etiket sade (yalnızca nokta + rol), yakında tam ad.
    g.getWorldPosition(world.current);
    const far = camera.position.distanceTo(world.current) > 15;
    if (far !== compact) setCompact(far);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useOffice.getState().select(agent.id);
  };

  return (
    <group ref={group} onClick={selectable ? onClick : undefined}>
      <Character look={look} drive={drive} phase={phaseOf(agent.id)} reduced={reduced} />
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.5, 0.58, 40]} />
          <meshBasicMaterial color="#ff3d6e" toneMapped={false} transparent opacity={0.95} />
        </mesh>
      )}
      <group ref={label} position={[0, 1.62, 0]}>
        {visible && !dimmed && (
          <Label position={[0, 0, 0]}>
            <div className="actor-label">
              {bubble && <Bubble name={bubble} />}
              <NameTag
                agent={agent}
                selected={selected}
                compact={compact && !selected}
                selectable={selectable}
              />
            </div>
          </Label>
        )}
      </group>
    </group>
  );
}

/** Sahnede kalabalık olmasın: yardımcının iş tanımından ilk sözcükler (tam ad panelde). */
function shortName(name: string): string {
  return name.length > 16 ? `${name.slice(0, 15)}…` : name;
}

function NameTag({
  agent,
  selected,
  compact,
  selectable,
}: {
  agent: Agent;
  selected: boolean;
  compact: boolean;
  selectable: boolean;
}) {
  const className = `tag role-tag${selected ? ' selected' : ''}${compact ? ' compact' : ''}`;
  const style = {
    ['--tag-color' as string]: STATUS_COLOR[agent.status],
    ['--role-color' as string]: ROLE_COLOR[agent.role],
  };
  const title = `${ROLE_LABEL[agent.role]} · ${agent.name} · ${STATUS_LABEL[agent.status]}`;
  const body = (
    <>
      <span className="tag-dot" aria-hidden="true" />
      <span className="tag-role">{ROLE_LABEL[agent.role]}</span>
      {!compact && (
        <span className="tag-name">{agent.kind === 'session' ? agent.name : shortName(agent.name)}</span>
      )}
    </>
  );
  if (!selectable)
    return (
      <span className={`${className} passive`} style={style} title={title}>
        {body}
      </span>
    );
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => useOffice.getState().select(agent.id)}
      title={title}
    >
      {body}
    </button>
  );
}

/** Boş masaların etiketi: ekip üyesi çalışmıyorsa "masada değil", oturum kapalıysa "kapalı". */
export function SeatLabels({
  plan,
  agents,
  sim,
  hiddenRoles,
}: {
  plan: OfficePlan;
  agents: readonly Agent[];
  sim: OfficeSim;
  hiddenRoles: ReadonlySet<AgentRole>;
}) {
  // "Kapalıları gizle" açıkken boş masalar etiketsiz kalır (liste ile tutarlı).
  const hideOffline = useOffice((s) => s.settings.hideOffline);
  if (hideOffline) return null;
  const byId = new Map(agents.map((a) => [a.id, a]));
  const occupied = new Map<string, Agent>();
  for (const [agentId, seatId] of plan.assignment) {
    const a = byId.get(agentId);
    if (a) occupied.set(seatId, a);
  }
  const labels: { key: string; x: number; z: number; text: string; name: string; role: AgentRole }[] = [];
  for (const seat of plan.seats) {
    const a = occupied.get(seat.id);
    if (hiddenRoles.has(seat.role)) continue;
    if (a && a.status === 'offline' && a.kind === 'session') {
      labels.push({ key: seat.id, x: seat.x, z: seat.z, text: 'kapalı', name: a.name, role: a.role });
      // Aktörü henüz kurulmamış (ilk çizim) üye masada sayılır: etiket bir an kurulup hemen kalkmasın.
    } else if (
      seat.member &&
      (!a || sim.actors.get(a.id)?.gone === true) &&
      // Çalışmayan üye ofiste boşta dolaşır; yalnızca o da ayrıldıysa (ör. ekipten çıkarılırken) masa boş.
      sim.actors.get(residentId(seat.member))?.gone === true
    ) {
      labels.push({
        key: seat.id,
        x: seat.x,
        z: seat.z,
        text: 'masada değil',
        name: seat.member,
        role: seat.role,
      });
    }
  }
  return (
    <>
      {labels.map((l) => (
        <Label key={l.key} position={[l.x, 1.15, l.z]}>
          <div className="seat-label" style={{ ['--role-color' as string]: ROLE_COLOR[l.role] }}>
            <span className="seat-name">{l.name}</span>
            <span className="seat-state">{l.text}</span>
          </div>
        </Label>
      ))}
    </>
  );
}
