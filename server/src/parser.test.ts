import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileNameOf, isTestCommand, isTestFile, parseLine } from './parser.ts';

const S1 = '11111111-1111-4111-8111-111111111111';
const FIXTURE = `fixtures/claude-home/projects/-Users-demo-Desktop-Atlas/${S1}.jsonl`;
const lines = readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean);
const parsed = lines.map(parseLine);

describe('parseLine', () => {
  it('kimlik ve istek satırlarını okumadan atlar', () => {
    expect(parsed[0]).toBeNull(); // session-owner
    expect(parsed[1]).toBeNull(); // api-request
  });

  it('bozuk satırda ve bilinmeyen türde çökmez', () => {
    expect(() => parseLine('{"type":"assistant", bozuk')).not.toThrow();
    expect(parseLine('{"type":"assistant", bozuk')).toBeNull();
    expect(parseLine('[]')).toBeNull();
    expect(parseLine('')).toBeNull();
    const unknown = parseLine('{"type":"yepyeni-tur","sessionId":"x"}');
    expect(unknown?.events).toEqual([]);
  });

  it('dosya araçlarından yalnızca dosya adını alır', () => {
    const read = parsed.flatMap((p) => p?.events ?? []).find((e) => e.kind === 'tool' && e.tool === 'Read');
    expect(read).toMatchObject({ kind: 'tool', tool: 'Read', file: 'profile_screen.dart' });
  });

  it('terminal komutunu ve açıklamasını almaz', () => {
    const bash = parsed.flatMap((p) => p?.events ?? []).find((e) => e.kind === 'tool' && e.tool === 'Bash');
    expect(bash).toEqual({ kind: 'tool', tool: 'Bash', at: expect.any(Number) });
  });

  it('mesajdan yalnızca alıcıyı, alt ajandan yalnızca kısa iş tanımını alır', () => {
    const events = parsed.flatMap((p) => p?.events ?? []);
    expect(events).toContainEqual({
      kind: 'tool',
      tool: 'SendMessage',
      to: 'nova-demo',
      at: expect.any(Number),
    });
    expect(events).toContainEqual({
      kind: 'tool',
      tool: 'Agent',
      spawnLabel: 'Testleri incele',
      at: expect.any(Number),
    });
  });

  it('düşünme, cevap, sıra sonu, hata ve başlık olaylarını çıkarır', () => {
    const kinds = parsed.flatMap((p) => p?.events ?? []).map((e) => e.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['title', 'human', 'thinking', 'reply', 'turn-end', 'error']),
    );
  });

  it('başka oturumdan gelen mesajdan yalnızca gönderenin adını alır', () => {
    const nova = readFileSync(
      'fixtures/claude-home/projects/-Users-demo-Desktop-Nova/22222222-2222-4222-8222-222222222222.jsonl',
      'utf8',
    )
      .split('\n')
      .filter(Boolean)
      .map(parseLine);
    const events = nova.flatMap((p) => p?.events ?? []);
    expect(events).toContainEqual({ kind: 'peer', from: 'atlas-demo', at: expect.any(Number) });
    // queue-operation satırı mesaj metni taşır: olay üretmemeli
    expect(nova[1]?.events ?? []).toEqual([]);
    expect(JSON.stringify(nova)).not.toMatch(/GİZLİ|GIZLI|cross-session/);
  });

  it('alıcıyı yeni `recipient` alanından da okur', () => {
    const line = JSON.stringify({
      type: 'assistant',
      sessionId: 's',
      message: {
        content: [
          { type: 'tool_use', name: 'SendMessage', input: { recipient: 'nova-demo', content: 'GİZLİ' } },
        ],
      },
    });
    expect(parseLine(line)?.events[0]).toMatchObject({ tool: 'SendMessage', to: 'nova-demo' });
  });

  it('proje adını klasörün son parçasından alır', () => {
    expect(parsed.find((p) => p?.project)?.project).toBe('Atlas');
  });

  it('çıktıda hiçbir gizli içerik ya da tam yol yoktur', () => {
    const json = JSON.stringify(parsed);
    expect(json).not.toMatch(/GİZLİ|GIZLI|\/Users\//);
  });

  it('fileNameOf yol olmayan değerlerde güvenli', () => {
    expect(fileNameOf('/a/b/c.ts')).toBe('c.ts');
    expect(fileNameOf('C:\\Users\\kullanici\\Nova\\lib\\main.dart')).toBe('main.dart');
    expect(fileNameOf('C:\\')).toBeUndefined();
    expect(fileNameOf('')).toBeUndefined();
    expect(fileNameOf(42)).toBeUndefined();
    expect(fileNameOf('/')).toBeUndefined();
  });
});

describe('test işareti', () => {
  const tool = (name: string, input: Record<string, unknown>) =>
    parseLine(
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-11-19T10:00:00Z',
        message: { content: [{ type: 'tool_use', name, input }] },
      }),
    )!.events[0];

  it('test komutunu tanır ama komut metnini taşımaz', () => {
    const event = tool('Bash', { command: 'cd x && npm test -- GİZLİ', description: 'GİZLİ' });
    expect(event).toEqual({ kind: 'tool', tool: 'Bash', at: expect.any(Number), test: true });
    expect(tool('Bash', { command: 'ls -la' })).not.toHaveProperty('test');
  });

  it('test dosyası düzenlemek test sayılır, okumak sayılmaz', () => {
    expect(tool('Edit', { file_path: '/a/b/widget_test.dart' })).toMatchObject({ test: true });
    expect(tool('Read', { file_path: '/a/b/widget_test.dart' })).not.toHaveProperty('test');
    expect(tool('Write', { file_path: '/a/b/app.ts' })).not.toHaveProperty('test');
  });

  it('desenler', () => {
    expect(isTestCommand('npx vitest run')).toBe(true);
    expect(isTestCommand('flutter test')).toBe(true);
    expect(isTestCommand('npm run test:unit')).toBe(true);
    expect(isTestCommand('git status')).toBe(false);
    expect(isTestCommand(42)).toBe(false);
    expect(isTestFile('a.test.ts')).toBe(true);
    expect(isTestFile('a.spec.js')).toBe(true);
    expect(isTestFile('test_api.py')).toBe(true);
    expect(isTestFile('latest.ts')).toBe(false);
    expect(isTestFile(undefined)).toBe(false);
  });
});
