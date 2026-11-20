import { describe, expect, it } from 'vitest';
import type { Agent, OfficeSnapshot } from '../../shared/types.ts';
import { appendFeed, FEED_LIMIT, feedText, newFeedItems, type FeedItem } from './feed.ts';

const agent = (id: string, recent: Agent['recent'], role: Agent['role'] = 'designer'): Agent => ({
  id,
  name: id,
  project: 'P',
  kind: 'subagent',
  role,
  status: 'writing',
  lastActivityAt: 0,
  recent,
});
const snap = (agents: Agent[]): OfficeSnapshot => ({ agents, teams: [], letters: [], now: 0 });

describe('canlı akış', () => {
  it('ilk görüntüde boş; sonra yalnızca yeni işlemler', () => {
    const s1 = snap([agent('a', [{ tool: 'Read', at: 1 }])]);
    expect(newFeedItems(null, s1)).toEqual([]);
    const s2 = snap([
      agent('a', [
        { tool: 'Edit', file: 'theme.dart', at: 3 },
        { tool: 'Bash', at: 2 },
        { tool: 'Read', at: 1 },
      ]),
      agent(
        'b',
        [
          { tool: 'Grep', at: 5 },
          { tool: 'Glob', at: 4 },
        ],
        'tester',
      ),
    ]);
    const items = newFeedItems(s1, s2);
    expect(items.map((i) => `${i.agentId}:${i.tool}`)).toEqual(['a:Bash', 'a:Edit', 'b:Grep']);
  });

  it('metin: rol · araç · dosya; dosya adları gizlenebilir', () => {
    const item: FeedItem = {
      key: 'k',
      agentId: 'a',
      role: 'designer',
      name: 'a',
      tool: 'Edit',
      file: 'theme.dart',
      at: 0,
    };
    expect(feedText(item, false)).toBe('Tasarımcı · Edit · theme.dart');
    expect(feedText(item, true)).toBe('Tasarımcı · Edit');
  });

  it('sınırlı uzunluk, tekrar yok', () => {
    const items = Array.from({ length: 10 }, (_, i): FeedItem => ({
      key: `k${i}`,
      agentId: 'a',
      role: 'lead',
      name: 'a',
      tool: 'Read',
      at: i,
    }));
    const feed = appendFeed(appendFeed([], items), items);
    expect(feed).toHaveLength(FEED_LIMIT);
    expect(feed[feed.length - 1]!.key).toBe('k9');
  });
});
