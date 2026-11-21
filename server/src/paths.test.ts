import { describe, expect, it } from 'vitest';
import { lastPathSegment } from './paths.ts';

describe('lastPathSegment', () => {
  it('POSIX yollarında son parçayı verir', () => {
    expect(lastPathSegment('/Users/kullanici/Atlas')).toBe('Atlas');
    expect(lastPathSegment('/Users/kullanici/Atlas/')).toBe('Atlas');
    expect(lastPathSegment('/a/b/c.ts')).toBe('c.ts');
  });

  it('Windows yollarında tam yolu değil son parçayı verir', () => {
    expect(lastPathSegment('C:\\Users\\kullanici\\Atlas')).toBe('Atlas');
    expect(lastPathSegment('C:\\Users\\kullanici\\Nova\\src\\main.ts')).toBe('main.ts');
    expect(lastPathSegment('C:/Users/kullanici/Pusula')).toBe('Pusula');
    expect(lastPathSegment('\\\\sunucu\\paylasim\\Atlas\\')).toBe('Atlas');
  });

  it('karışık ayırıcıları tanır', () => {
    expect(lastPathSegment('C:\\Users/kullanici\\Atlas/lib/app.dart')).toBe('app.dart');
  });

  it('anlamlı parça yoksa undefined', () => {
    expect(lastPathSegment('')).toBeUndefined();
    expect(lastPathSegment('/')).toBeUndefined();
    expect(lastPathSegment('\\')).toBeUndefined();
    expect(lastPathSegment('C:\\')).toBeUndefined();
    expect(lastPathSegment('./..')).toBeUndefined();
  });

  it('yalnızca ad verilirse adı döner', () => {
    expect(lastPathSegment('README.md')).toBe('README.md');
  });
});
