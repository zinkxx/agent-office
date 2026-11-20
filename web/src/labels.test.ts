import { describe, expect, it } from 'vitest';
import { activityText, toolName } from './labels.ts';

describe('toolName', () => {
  it('eklenti araçlarının uzun adını kısaltır, diğerlerine dokunmaz', () => {
    expect(toolName('mcp__plugin_playwright_playwright__browser_click')).toBe('browser_click');
    expect(toolName('mcp__github__create_issue')).toBe('create_issue');
    expect(toolName('Edit')).toBe('Edit');
    expect(toolName('mcp__')).toBe('mcp__');
  });

  it('işlem yazısı kısa adı ve (gizli değilse) dosya adını kullanır', () => {
    const a = { tool: 'mcp__srv__read_page', file: 'a.md', at: 0 };
    expect(activityText(a)).toBe('read_page · a.md');
    expect(activityText(a, true)).toBe('read_page');
  });
});
