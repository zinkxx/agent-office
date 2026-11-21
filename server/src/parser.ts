import { lastPathSegment } from './paths.ts';

/**
 * Bir kayıt satırından çıkarılan, gizlilik filtresinden geçmiş olay.
 *
 * Bilerek dar tutuldu: metin, düşünce, komut, kod, mesaj içeriği ya da tam yol buraya HİÇ kopyalanmaz.
 */
export type ParsedEvent =
  | { kind: 'title'; title: string }
  | { kind: 'human'; at: number } // kullanıcı yeni bir mesaj yazdı
  | { kind: 'peer'; at: number; from?: string } // başka bir oturumdan mesaj geldi (yalnızca gönderenin adı)
  | { kind: 'thinking'; at: number }
  | {
      kind: 'tool';
      at: number;
      tool: string;
      file?: string;
      to?: string;
      spawnLabel?: string;
      /** Test çalıştırıyor ya da test dosyasıyla çalışıyor (yalnızca işaret; komut metni alınmaz). */
      test?: true;
    }
  | { kind: 'reply'; at: number } // metin cevabı verdi (sıra devam ediyor olabilir)
  | { kind: 'turn-end'; at: number } // sırasını bitirdi
  | { kind: 'error'; at: number }
  | { kind: 'compact'; at: number };

export interface ParsedLine {
  sessionId?: string;
  /** Alt ajan satırlarında dolu. */
  agentId?: string;
  /** Proje klasörünün adı (yalnızca son parça, ör. "Atlas"). */
  project?: string;
  events: ParsedEvent[];
}

/** Okunmadan atlanan satır türleri (kimlik ve istek ayrıntıları). */
const SKIPPED_TYPES = new Set([
  'session-owner',
  'api-request',
  'api-request-blob',
  'api-request-shape',
  'atis-latch',
  'queue-operation', // gelen mesajın sarmalı (metni) burada durur
]);

/** Girdisinde dosya yolu bulunan araçlar ve alan adları. */
const FILE_FIELDS: Record<string, readonly string[]> = {
  Read: ['file_path'],
  Edit: ['file_path'],
  MultiEdit: ['file_path'],
  Write: ['file_path', 'path'],
  NotebookEdit: ['notebook_path'],
};

const SPAWN_TOOLS = new Set(['Agent', 'Task']);

/** Test çalıştıran komutlar. Komut yalnızca bu desenle sınanır; metni hiçbir yere kopyalanmaz. */
const TEST_COMMAND =
  /\b(vitest|jest|pytest|mocha|playwright\s+test|cypress\s+run|(npm|pnpm|yarn|bun)\s+(run\s+)?test|(go|cargo|flutter|dart|deno|swift|mix|dotnet)\s+test|rspec|phpunit|xcodebuild\s+test|gradlew?\s+test|mvn\s+test)\b/;

/** Test dosyası adları: a.test.ts, a.spec.js, a_test.go, test_a.py, widget_test.dart … */
export function isTestFile(name: string | undefined): boolean {
  if (!name) return false;
  return /(\.|_)(test|spec)\.[a-z0-9]+$/i.test(name) || /^test_.+\.[a-z0-9]+$/i.test(name);
}

/** Bir Bash komutu test çalıştırıyor mu? Yalnızca evet/hayır döner. */
export function isTestCommand(command: unknown): boolean {
  return typeof command === 'string' && TEST_COMMAND.test(command);
}

/** Başlıkların ekranda taşmaması ve uzun metin sızmaması için üst sınır. */
const MAX_LABEL = 60;

function toMs(timestamp: unknown): number {
  if (typeof timestamp === 'string') {
    const ms = Date.parse(timestamp);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

function shortLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > MAX_LABEL ? `${clean.slice(0, MAX_LABEL - 1)}…` : clean;
}

/** Tam yoldan yalnızca dosya adı. Yol değilse ya da boşsa undefined. */
export function fileNameOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return lastPathSegment(value);
}

function toolEvent(block: Record<string, unknown>, at: number): ParsedEvent | undefined {
  const tool = typeof block.name === 'string' && block.name ? block.name : undefined;
  if (!tool) return undefined;
  const input = (typeof block.input === 'object' && block.input !== null ? block.input : {}) as Record<
    string,
    unknown
  >;
  const event: Extract<ParsedEvent, { kind: 'tool' }> = { kind: 'tool', at, tool };
  for (const field of FILE_FIELDS[tool] ?? []) {
    const file = fileNameOf(input[field]);
    if (file) {
      event.file = file;
      break;
    }
  }
  if (tool === 'Bash' ? isTestCommand(input.command) : isTestFile(event.file)) {
    if (tool !== 'Read') event.test = true; // test dosyasını okumak test etmek sayılmaz
  }
  if (tool === 'SendMessage') {
    // Yalnızca alıcının adı; mesaj ve özet metni alınmaz.
    // `to` asıl alan; yeni sürümlerde aynı değer `recipient` olarak da yazılıyor.
    const to = shortLabel(input.to) ?? shortLabel(input.recipient);
    if (to) event.to = to;
  }
  if (SPAWN_TOOLS.has(tool)) {
    // Alt ajanın kısa iş tanımı (ör. "Testleri incele"); görevin kendisi (prompt) alınmaz.
    const label = shortLabel(input.description);
    if (label) event.spawnLabel = label;
  }
  return event;
}

/**
 * Tek bir JSONL satırını güvenle ayrıştırır. Bozuk, boş ya da tanınmayan satırda `null` döner; asla fırlatmaz.
 */
export function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== 'string' || SKIPPED_TYPES.has(type)) return null;

  const result: ParsedLine = { events: [] };
  if (typeof record.sessionId === 'string') result.sessionId = record.sessionId;
  if (typeof record.agentId === 'string' && record.agentId) result.agentId = record.agentId;
  const project = fileNameOf(record.cwd);
  if (project) result.project = project;
  const at = toMs(record.timestamp);
  const message = (
    typeof record.message === 'object' && record.message !== null ? record.message : {}
  ) as Record<string, unknown>;
  const content = Array.isArray(message.content) ? (message.content as unknown[]) : [];

  switch (type) {
    case 'ai-title': {
      const title = shortLabel(record.aiTitle);
      if (title) result.events.push({ kind: 'title', title });
      break;
    }
    case 'user': {
      const origin = record.origin as Record<string, unknown> | undefined;
      if (origin?.kind === 'human') result.events.push({ kind: 'human', at });
      else if (origin?.kind === 'peer') {
        // Başka oturumdan gelen mesaj. Yalnızca gönderenin oturum adı (`origin.name`) alınır;
        // `origin.body` ve `message.content` mesaj metnidir, okunmaz.
        const from = shortLabel(origin.name);
        result.events.push(from ? { kind: 'peer', at, from } : { kind: 'peer', at });
      }
      break;
    }
    case 'assistant': {
      let replied = false;
      for (const block of content) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;
        if (b.type === 'thinking' || b.type === 'redacted_thinking')
          result.events.push({ kind: 'thinking', at });
        else if (b.type === 'tool_use') {
          const event = toolEvent(b, at);
          if (event) result.events.push(event);
        } else if (b.type === 'text') replied = true;
      }
      if (replied) result.events.push({ kind: 'reply', at });
      if (message.stop_reason === 'end_turn') result.events.push({ kind: 'turn-end', at });
      break;
    }
    case 'system': {
      if (record.subtype === 'api_error') result.events.push({ kind: 'error', at });
      else if (record.subtype === 'compact_boundary') result.events.push({ kind: 'compact', at });
      break;
    }
    default:
      break;
  }
  return result.events.length || result.sessionId ? result : null;
}
