import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { MeshStandardMaterial, PointLight } from 'three';
import type { Agent } from '../../../shared/types.ts';
import { STATUS_COLOR, STATUS_LABEL, isActive } from '../labels.ts';
import { useOffice, useRoleLook, useTheme } from '../store.ts';
import { Character, lookFor, type CharacterDrive } from './Character.tsx';
import { Icon, STATUS_ICON } from './icons.tsx';
import { Label } from './Label.tsx';
import { THEME } from './theme.ts';

/** Masada oturan ya da yanında duran karakter için sabit hareket bilgisi. */
function useStaticDrive(agent: Agent, pose: CharacterDrive['pose']) {
  const drive = useRef<CharacterDrive>({
    pose,
    speed: 0,
    gesture: 'none',
    holding: null,
    pastime: null,
    opacity: 1,
    status: agent.status,
  });
  drive.current.status = agent.status;
  drive.current.pose = agent.status === 'asking' ? 'stand' : pose;
  drive.current.gesture = agent.status === 'asking' ? 'wave' : 'none';
  return drive;
}

const DESK_TOP_Y = 0.76;

function phaseOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h / 37;
}

function clickSelect(id: string) {
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useOffice.getState().select(id);
  };
}

/** Karakterin üstündeki ad + durum simgesi. Sayfa yazısıyla çizilir (internetten yazı tipi indirilmez). */
function NameTag({
  agent,
  small = false,
  showName = true,
}: {
  agent: Agent;
  small?: boolean;
  showName?: boolean;
}) {
  const selected = useOffice((s) => s.selectedId === agent.id);
  return (
    <div
      className={`tag${small ? ' small' : ''}${selected ? ' selected' : ''}${
        agent.status === 'offline' ? ' offline' : ''
      }`}
      style={{ ['--tag-color' as string]: STATUS_COLOR[agent.status] }}
      onClick={() => useOffice.getState().select(agent.id)}
      title={`${agent.name} · ${STATUS_LABEL[agent.status]}`}
    >
      <span className="tag-icon">
        <Icon name={STATUS_ICON[agent.status]} size={small ? 11 : 13} label={STATUS_LABEL[agent.status]} />
      </span>
      {showName && <span className="tag-name">{agent.name}</span>}
    </div>
  );
}

/** Ana ajanın masası: masa, bilgisayar, lamba, sandalye ve oturan karakter. */
export function Workstation({ agent, x, z }: { agent: Agent; x: number; z: number }) {
  const status = agent.status;
  const color = STATUS_COLOR[status];
  const active = isActive(status);
  const offline = status === 'offline';
  const selected = useOffice((s) => s.selectedId === agent.id);
  const accent = useTheme().ui.accent;
  const screen = useRef<MeshStandardMaterial>(null);
  const lamp = useRef<PointLight>(null);
  const phase = phaseOf(agent.id);
  const custom = useRoleLook(agent.role);
  const look = useMemo(() => lookFor(agent.id, agent.role, custom), [agent.id, agent.role, custom]);
  const drive = useStaticDrive(agent, 'sit');

  // Ekran ve lamba etkinken hafifçe titreşir (canlı his).
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const flicker = active ? 1 + Math.sin(t * 6) * 0.08 + Math.sin(t * 13) * 0.04 : 1;
    if (screen.current) screen.current.emissiveIntensity = (offline ? 0 : active ? 2.2 : 0.45) * flicker;
    if (lamp.current) lamp.current.intensity = (offline ? 0 : active ? 2.6 : 0.7) * flicker;
  });

  const wood = offline ? THEME.deskOff : THEME.desk;

  return (
    <group position={[x, THEME.islandTop, z]} onClick={clickSelect(agent.id)}>
      {/* seçim halkası */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.2]}>
          <ringGeometry args={[1.45, 1.56, 48]} />
          <meshBasicMaterial color={accent} transparent opacity={0.9} />
        </mesh>
      )}

      {/* masa */}
      <mesh position={[0, DESK_TOP_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.07, 0.95]} />
        <meshStandardMaterial color={wood} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* masa önündeki ışık şeridi */}
      <mesh position={[0, DESK_TOP_Y - 0.045, 0.476]}>
        <boxGeometry args={[1.9, 0.015, 0.01]} />
        <meshBasicMaterial color={offline ? '#2a1218' : color} toneMapped={false} />
      </mesh>
      {(
        [
          [-0.88, -0.4],
          [0.88, -0.4],
          [-0.88, 0.4],
          [0.88, 0.4],
        ] as const
      ).map(([lx, lz]) => (
        <mesh key={`${lx}${lz}`} position={[lx, DESK_TOP_Y / 2, lz]} castShadow>
          <boxGeometry args={[0.06, DESK_TOP_Y, 0.06]} />
          <meshStandardMaterial color={THEME.metal} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* bilgisayar: ayak + ekran; ekran yüzü kameraya (+z) bakar */}
      <mesh position={[0, DESK_TOP_Y + 0.12, -0.28]} castShadow>
        <boxGeometry args={[0.08, 0.22, 0.08]} />
        <meshStandardMaterial color={THEME.metal} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, DESK_TOP_Y + 0.42, -0.3]} castShadow>
        <boxGeometry args={[0.98, 0.58, 0.05]} />
        <meshStandardMaterial color="#12070b" roughness={0.4} />
      </mesh>
      <mesh position={[0, DESK_TOP_Y + 0.42, -0.274]}>
        <planeGeometry args={[0.9, 0.5]} />
        <meshStandardMaterial
          ref={screen}
          color="#0b0507"
          emissive={offline ? '#000000' : color}
          emissiveIntensity={1}
          roughness={0.2}
          toneMapped={false}
        />
      </mesh>
      {/* klavye */}
      <mesh position={[0, DESK_TOP_Y + 0.045, 0.12]} castShadow>
        <boxGeometry args={[0.6, 0.025, 0.2]} />
        <meshStandardMaterial color="#2d1a21" roughness={0.7} />
      </mesh>
      {/* kupa */}
      <mesh position={[0.62, DESK_TOP_Y + 0.08, 0.16]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 0.13, 8]} />
        <meshStandardMaterial color={THEME.accentSoft} roughness={0.5} />
      </mesh>

      {/* masa lambası: duruma göre renk */}
      <group position={[-0.7, DESK_TOP_Y + 0.035, -0.22]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.09, 0.11, 0.035, 10]} />
          <meshStandardMaterial color={THEME.metal} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0.05, 0.22, 0]} rotation={[0, 0, -0.35]} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.46, 6]} />
          <meshStandardMaterial color={THEME.metal} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0.15, 0.44, 0.02]} rotation={[0, 0, 0.6]} castShadow>
          <coneGeometry args={[0.11, 0.16, 10, 1, true]} />
          <meshStandardMaterial color={THEME.accentSoft} side={2} roughness={0.5} />
        </mesh>
        <mesh position={[0.18, 0.39, 0.02]}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshBasicMaterial color={offline ? '#2a1218' : color} toneMapped={false} />
        </mesh>
        <pointLight
          ref={lamp}
          position={[0.22, 0.3, 0.1]}
          color={color}
          distance={3.2}
          decay={1.6}
          intensity={1}
        />
      </group>

      {/* sandalye */}
      <group position={[0, 0, 0.78]}>
        <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.52, 0.07, 0.5]} />
          <meshStandardMaterial color={THEME.chair} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.8, 0.24]} castShadow>
          <boxGeometry args={[0.5, 0.62, 0.07]} />
          <meshStandardMaterial color={THEME.chair} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.44, 6]} />
          <meshStandardMaterial color={THEME.metal} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.03, 0]} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.04, 5]} />
          <meshStandardMaterial color={THEME.metal} metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      {/* karakter (kapalıysa masa boş kalır) */}
      {!offline && (
        <group position={[0, 0, 0.74]} rotation={[0, Math.PI, 0]}>
          <Character look={look} drive={drive} phase={phase} />
        </group>
      )}

      <Label position={[0, offline ? 1.55 : 2.15, 0.6]}>
        <NameTag agent={agent} />
      </Label>
    </group>
  );
}

/** Yardımcı ajan: ana masanın yanında ayakta duran küçük karakter. */
export function Helper({ agent, x, z, showName }: { agent: Agent; x: number; z: number; showName: boolean }) {
  const custom = useRoleLook(agent.role);
  const look = useMemo(() => lookFor(agent.id, agent.role, custom), [agent.id, agent.role, custom]);
  const drive = useStaticDrive(agent, 'stand');
  return (
    <group position={[x, THEME.islandTop, z]} onClick={clickSelect(agent.id)}>
      <group scale={0.58} rotation={[0, -Math.PI / 2 + 0.5, 0]}>
        <Character look={look} drive={drive} phase={phaseOf(agent.id)} />
      </group>
      <Label position={[0, 1.15, 0]}>
        <NameTag agent={agent} small showName={showName} />
      </Label>
    </group>
  );
}
