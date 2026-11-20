import type { ReactElement } from 'react';
import type { AgentStatus } from '../../../shared/types.ts';
import type { BubbleIcon } from './sim/sim.ts';

/** Balonlardaki ve etiketlerdeki simgeler (SVG; içerik yok, yalnızca simge). */
export type IconName =
  BubbleIcon | 'thought' | 'question' | 'book' | 'pen' | 'terminal' | 'search' | 'gear' | 'alert' | 'moon';

/** Her durumun simgesi ("Tüm projeler" görünümündeki ad etiketleri). */
export const STATUS_ICON: Record<AgentStatus, IconName> = {
  thinking: 'thought',
  reading: 'book',
  writing: 'pen',
  terminal: 'terminal',
  searching: 'search',
  delegating: 'tasks',
  messaging: 'mail',
  asking: 'question',
  working: 'gear',
  error: 'alert',
  idle: 'coffee',
  offline: 'moon',
};

const PATHS: Record<IconName, ReactElement> = {
  mail: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3.5 7.5 12 13.5l8.5-6" />
    </>
  ),
  tasks: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1.3 1.3L7 5M3.5 12l1.3 1.3L7 11" />
      <rect x="3.5" y="16.5" width="3" height="3" rx="0.6" />
    </>
  ),
  check: <path d="m4.5 12.5 4.5 4.5 10.5-11" />,
  coffee: (
    <>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1 1 1 1 2s-1 1-1 2M12 3.5c0 1 1 1 1 2s-1 1-1 2" />
    </>
  ),
  thought: (
    <>
      <circle cx="7" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="17" cy="12" r="1.6" />
    </>
  ),
  question: (
    <>
      <path d="M9 9a3 3 0 1 1 4.2 2.75c-.75.33-1.2 1.07-1.2 1.9V14.5" />
      <circle cx="12" cy="18" r="0.6" />
    </>
  ),
  book: (
    <>
      <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h6v16H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M20.5 5.5A1.5 1.5 0 0 0 19 4h-6v16h6a1.5 1.5 0 0 0 1.5-1.5z" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="m7 9.5 3 2.5-3 2.5M12.5 15H17" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 5 5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17" r="0.6" />
    </>
  ),
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
};

const LABEL: Record<IconName, string> = {
  mail: 'mesaj',
  tasks: 'görev',
  check: 'tamamlandı',
  coffee: 'kahve',
  thought: 'düşünüyor',
  question: 'seni bekliyor',
  book: 'okuyor',
  pen: 'yazıyor',
  terminal: 'terminalde',
  search: 'arıyor',
  gear: 'çalışıyor',
  alert: 'hata',
  moon: 'kapalı',
};

export function Icon({ name, size = 18, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label ?? LABEL[name]}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Karakterin başının üstündeki balon. Düşünce balonu bulut biçiminde, diğerleri konuşma balonu. */
export function Bubble({ name }: { name: IconName }) {
  return (
    <div className={`bubble bubble-${name}${name === 'thought' ? ' cloud' : ''}`}>
      <Icon name={name} />
    </div>
  );
}
