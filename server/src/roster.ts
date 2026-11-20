import { open, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { TeamMember } from '../../shared/types.ts';
import { roleForMember } from './roles.ts';

/**
 * Projenin ekip listesi: `<proje>/.claude/agents/*.md` dosyalarında tanımlı özel ajanlar.
 *
 * Gizlilik: Her dosyadan YALNIZCA baştaki `---` ön bilgi bloğu okunur (en fazla FRONT_MATTER_MAX_BYTES bayt);
 * ajanın talimatlarını taşıyan gövde hiç okunmaz. `description` yalnızca rol tahmininde kullanılır, dışarı verilmez.
 * Hiçbir dosyaya yazılmaz.
 */

export const FRONT_MATTER_MAX_BYTES = 4096;
const MAX_FILES = 40;
const MAX_NAME = 40;

/** Dosyanın başından en fazla `max` bayt okur; ön bilgi kapanınca durur. Bulunamazsa null. */
export async function readFrontMatter(file: string, max = FRONT_MATTER_MAX_BYTES): Promise<string | null> {
  let handle;
  try {
    handle = await open(file, 'r');
    const buffer = Buffer.alloc(max);
    let length = 0;
    // Küçük parçalarla oku; kapanış çizgisi görülünce dur (gövdeye inme).
    while (length < max) {
      const { bytesRead } = await handle.read(buffer, length, Math.min(512, max - length), length);
      if (bytesRead === 0) break;
      length += bytesRead;
      const text = buffer.subarray(0, length).toString('utf8');
      const block = extractFrontMatter(text);
      if (block !== undefined) return block;
      if (!/^﻿?---\r?\n/.test(text) && length >= 4) return null; // ön bilgi yok
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

/** Metnin başındaki `---\n…\n---` bloğu; blok henüz kapanmadıysa undefined. */
export function extractFrontMatter(text: string): string | undefined {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  return match ? match[1] : undefined;
}

/** Basit YAML: yalnızca `name` ve `description` (tırnaklı, tek satır ya da `>`/`|` ile çok satırlı). */
export function parseFrontMatter(block: string): { name?: string; description?: string } {
  const out: { name?: string; description?: string } = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(name|description)\s*:\s*(.*)$/.exec(lines[i] ?? '');
    if (!m) continue;
    const key = m[1] as 'name' | 'description';
    let value = (m[2] ?? '').trim();
    if (value === '|' || value === '>' || value === '|-' || value === '>-') {
      const parts: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1] ?? '')) parts.push(lines[++i]!.trim());
      value = parts.join(' ');
    }
    value = value.replace(/^(['"])(.*)\1$/, '$2').trim();
    if (value) out[key] = value;
  }
  return out;
}

/** Bir proje klasörünün ekip listesi. Klasör yoksa boş liste. Ada göre sıralı. */
export async function readTeam(projectDir: string): Promise<TeamMember[]> {
  const dir = path.join(projectDir, '.claude', 'agents');
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return [];
  }
  const members: TeamMember[] = [];
  const seen = new Set<string>();
  for (const file of names.slice(0, MAX_FILES)) {
    const block = await readFrontMatter(path.join(dir, file));
    const meta = block ? parseFrontMatter(block) : {};
    const raw = (meta.name ?? file.slice(0, -'.md'.length)).replace(/\s+/g, ' ').trim();
    const name = raw.length > MAX_NAME ? raw.slice(0, MAX_NAME) : raw;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    members.push({ name, role: roleForMember(name, meta.description) });
  }
  return members.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}
