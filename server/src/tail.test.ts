import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileTailer } from './tail.ts';

function tempFile(content: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ajan-ofisi-'));
  const file = path.join(dir, 'kayit.jsonl');
  writeFileSync(file, content);
  return file;
}

describe('FileTailer', () => {
  it('yalnızca tam satırları döndürür, yarım satırı saklar', async () => {
    const file = tempFile('{"a":1}\n{"a":2}\n{"a":');
    const tailer = new FileTailer(file);
    expect(await tailer.read()).toEqual(['{"a":1}', '{"a":2}']);
    appendFileSync(file, '3}\n{"a":4}\n');
    expect(await tailer.read()).toEqual(['{"a":3}', '{"a":4}']);
    expect(await tailer.read()).toEqual([]);
  });

  it('büyük dosyada yalnızca sondan okur ve ilk yarım satırı atar', async () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `{"satir":${i}}`);
    const file = tempFile(lines.join('\n') + '\n');
    const tailer = new FileTailer(file, 200);
    const read = await tailer.read();
    expect(read.length).toBeGreaterThan(0);
    expect(read.length).toBeLessThan(20);
    expect(read.at(-1)).toBe('{"satir":999}');
    for (const line of read) expect(() => JSON.parse(line)).not.toThrow();
  });

  it('dosya küçülürse baştan okur, dosya yoksa boş döner', async () => {
    const file = tempFile('{"a":1}\n{"a":2}\n');
    const tailer = new FileTailer(file);
    await tailer.read();
    writeFileSync(file, '{"b":1}\n');
    expect(await tailer.read()).toEqual(['{"b":1}']);
    expect(await new FileTailer('/olmayan/dosya.jsonl').read()).toEqual([]);
  });

  it('büyük artışı parça parça okur; çok baytlı karakterler ve parçadan uzun satırlar bozulmaz', async () => {
    const file = tempFile('');
    const tailer = new FileTailer(file, 256 * 1024, { chunkBytes: 7 });
    expect(await tailer.read()).toEqual([]);
    const lines = Array.from({ length: 50 }, (_, i) => `{"ad":"İşçi-ğüşöç-${i}","n":${'9'.repeat(i)}}`);
    appendFileSync(file, lines.join('\n') + '\n{"yarım":');
    const batches = [];
    for await (const batch of tailer.batches()) batches.push(batch);
    expect(batches.length).toBeGreaterThan(10);
    expect(batches.every((b) => !b.replay)).toBe(true);
    expect(batches.flatMap((b) => b.lines)).toEqual(lines);
    appendFileSync(file, '1}\n');
    expect(await tailer.read()).toEqual(['{"yarım":1}']);
  });

  it('bir parça en fazla chunkBytes kadar veriden gelir', async () => {
    const line = `{"x":"${'a'.repeat(90)}"}`; // 100 bayt + satır sonu
    const file = tempFile('');
    const tailer = new FileTailer(file, 256 * 1024, { chunkBytes: 1_000 });
    await tailer.read();
    appendFileSync(file, `${line}\n`.repeat(100));
    const sizes: number[] = [];
    for await (const batch of tailer.batches()) sizes.push(batch.lines.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(100);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(10);
  });

  it('ilk pencere satır ortasında başlıyorsa o satır sonraki okumalarda da atlanır', async () => {
    const file = tempFile(`{"uzun":"${'x'.repeat(500)}`);
    const tailer = new FileTailer(file, 100, { chunkBytes: 16 });
    expect(await tailer.read()).toEqual([]);
    appendFileSync(file, '"}\n{"a":1}\n');
    expect(await tailer.read()).toEqual(['{"a":1}']);
  });

  it('replayUntil: kaldığı yere kadarki satırları geçmiş olarak işaretler', async () => {
    const file = tempFile('{"a":1}\n{"a":2}\n{"a":');
    const first = new FileTailer(file);
    expect(await first.read()).toEqual(['{"a":1}', '{"a":2}']);
    const position = first.position!;
    expect(position).toBe(16); // yarım satır sayılmaz
    appendFileSync(file, '3}\n{"a":4}\n');
    const resumed = new FileTailer(file, 256 * 1024, { replayUntil: position, chunkBytes: 5 });
    const old: string[] = [];
    const fresh: string[] = [];
    for await (const batch of resumed.batches()) (batch.replay ? old : fresh).push(...batch.lines);
    expect(old).toEqual(['{"a":1}', '{"a":2}']);
    expect(fresh).toEqual(['{"a":3}', '{"a":4}']);
    appendFileSync(file, '{"a":5}\n');
    const next = [];
    for await (const batch of resumed.batches()) next.push(batch);
    expect(next).toEqual([{ lines: ['{"a":5}'], replay: false }]);
  });
});
