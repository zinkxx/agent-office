import { describe, expect, it } from 'vitest';
import { parsePort } from './port.ts';

describe('parsePort', () => {
  it('geçerli portu kullanır', () => {
    expect(parsePort('6001', 5175)).toBe(6001);
  });

  it('verilmemişse sessizce varsayılan', () => {
    const warned: string[] = [];
    expect(parsePort(undefined, 5175, (m) => warned.push(m))).toBe(5175);
    expect(parsePort('', 5175, (m) => warned.push(m))).toBe(5175);
    expect(warned).toEqual([]);
  });

  it('geçersizse varsayılan ve uyarı', () => {
    for (const bad of ['abc', '0', '-1', '65536', '80.5']) {
      const warned: string[] = [];
      expect(
        parsePort(bad, 5175, (m) => warned.push(m)),
        bad,
      ).toBe(5175);
      expect(warned).toHaveLength(1);
    }
  });
});
