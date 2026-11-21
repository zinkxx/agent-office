import type { AgentRole, OfficeSnapshot } from '../../shared/types.ts';
import type { Lang } from './i18n.ts';
import { roleLabel, toolName } from './labels.ts';

/** Ekran köşesindeki canlı akışın bir satırı. Yalnızca rol, araç adı ve (varsa) dosya adı. */
export interface FeedItem {
  key: string;
  agentId: string;
  role: AgentRole;
  /** Ajanın adı (yalnızca ipucu olarak gösterilir). */
  name: string;
  tool: string;
  file?: string;
  at: number;
}

export const FEED_LIMIT = 7;

/**
 * İki anlık görüntü arasında yeni yapılan işlemler. İlk görüntüde akış boş başlar (geçmiş tekrar oynamaz).
 * Yeni beliren ajanın yalnızca son işlemi alınır.
 */
export function newFeedItems(prev: OfficeSnapshot | null, next: OfficeSnapshot): FeedItem[] {
  if (!prev) return [];
  const before = new Map(prev.agents.map((a) => [a.id, a.recent[0]?.at ?? -Infinity]));
  const out: FeedItem[] = [];
  for (const a of next.agents) {
    const seen = before.get(a.id);
    const fresh = a.recent.filter((r) => (seen === undefined ? r === a.recent[0] : r.at > seen));
    for (const r of fresh) {
      const item: FeedItem = {
        key: `${a.id}:${r.at}:${r.tool}`,
        agentId: a.id,
        role: a.role,
        name: a.name,
        tool: r.tool,
        at: r.at,
      };
      if (r.file) item.file = r.file;
      out.push(item);
    }
  }
  return out.sort((x, y) => x.at - y.at);
}

/** Akışa ekler; en yeni sonda, en fazla FEED_LIMIT satır, aynı satır iki kez eklenmez. */
export function appendFeed(feed: readonly FeedItem[], items: readonly FeedItem[]): FeedItem[] {
  const keys = new Set(feed.map((f) => f.key));
  // Akıştan çoktan düşmüş eski satırlar geri gelmesin.
  const oldest = feed.length >= FEED_LIMIT ? feed[0]!.at : -Infinity;
  const merged = [...feed, ...items.filter((i) => !keys.has(i.key) && i.at >= oldest)];
  return merged.slice(-FEED_LIMIT);
}

/** "Tasarımcı · Edit · theme.dart"; dosya adları gizliyse "Tasarımcı · Edit". */
export function feedText(item: FeedItem, hideFiles: boolean, lang: Lang): string {
  const parts = [roleLabel(item.role, lang), toolName(item.tool)];
  if (item.file && !hideFiles) parts.push(item.file);
  return parts.join(' · ');
}
