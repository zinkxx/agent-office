import { describe, expect, it } from 'vitest';
import { captureView, dataUrlToBytes, registerCapture, snapshotFileName } from './capture.ts';

describe('görüntü dosya adı', () => {
  it('yerel tarih ve saatle, sıfır dolgulu', () => {
    expect(snapshotFileName(new Date(2026, 10, 21, 10, 30))).toBe('ajan-ofisi-2026-11-21-1030.png');
    expect(snapshotFileName(new Date(2027, 0, 5, 7, 4))).toBe('ajan-ofisi-2027-01-05-0704.png');
  });

  it('yalnızca güvenli karakterler içerir', () => {
    expect(snapshotFileName(new Date(2026, 11, 31, 23, 59))).toMatch(/^ajan-ofisi-[0-9-]+\.png$/);
  });
});

describe('veri adresinden baytlar', () => {
  it('base64 PNG adresini çözer', () => {
    const out = dataUrlToBytes('data:image/png;base64,iVBORw==');
    expect(out?.type).toBe('image/png');
    expect([...(out?.bytes ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('boş ya da tanınmayan adreste null', () => {
    expect(dataUrlToBytes('data:,')).toBeNull();
    expect(dataUrlToBytes('data:image/png;base64,')).toBeNull();
    expect(dataUrlToBytes('https://ornek.test/a.png')).toBeNull();
    expect(dataUrlToBytes('data:image/png;base64,%%%')).toBeNull();
  });
});

describe('yakalama kaydı', () => {
  it('kayıt yokken null, kayıtlıyken fonksiyonun sonucu', () => {
    expect(captureView()).toBeNull();
    const off = registerCapture(() => 'data:image/png;base64,AA==');
    expect(captureView()).toBe('data:image/png;base64,AA==');
    off();
    expect(captureView()).toBeNull();
  });

  it('eski kaydın silinmesi yeni kaydı bozmaz', () => {
    const offOld = registerCapture(() => 'eski');
    const offNew = registerCapture(() => 'yeni');
    offOld();
    expect(captureView()).toBe('yeni');
    offNew();
  });

  it('yakalama hata verirse null', () => {
    const off = registerCapture(() => {
      throw new Error('bağlam kayboldu');
    });
    expect(captureView()).toBeNull();
    off();
  });
});
