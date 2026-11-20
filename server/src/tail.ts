import { open } from 'node:fs/promises';

const EMPTY = Buffer.alloc(0);
const NEWLINE = 0x0a;

/** Bir okumada dönen satır grubu. */
export interface TailBatch {
  lines: string[];
  /**
   * true: bu satırlar daha önce (bırakılmış bir takipçi tarafından) işlenmişti; yalnızca geçmişi yeniden kurmak
   * için tekrar okundu (bkz. `TailerOptions.replayUntil`).
   */
  replay: boolean;
}

export interface TailerOptions {
  /** Bir seferde belleğe alınan en büyük parça (bayt). */
  chunkBytes?: number;
  /**
   * Önceki bir takipçinin kaldığı bayt. Verilirse ilk okuma yine "son `initialBytes`" kuralıyla yapılır, ama bu
   * konuma kadar biten satırlar `replay: true` olarak işaretlenir (çift mektup/olay üretmemek için).
   */
  replayUntil?: number;
}

/**
 * Bir JSONL dosyasını sondan takip eder: her okumada yalnızca son okumadan bu yana eklenen TAM satırları
 * döndürür. Yarım kalan son satır bir sonraki okumaya saklanır. Büyük artışlar `chunkBytes`'lık parçalarla okunur;
 * böylece bellek kullanımı eklenen veri miktarından bağımsız kalır (en uzun tek satır hariç).
 *
 * Dosya yalnızca okuma kipinde açılır; asla yazılmaz.
 */
export class FileTailer {
  private offset: number | null = null;
  /** Henüz yeni satır karakteri gelmemiş son satırın baytları. */
  private remainder: Buffer = EMPTY;
  /** Başını okumadığımız bir satırın ortasındayız: ilk yeni satır karakterine kadar atlanır. */
  private skipPartial = false;
  private replayUntil: number | null;
  private readonly chunkBytes: number;

  /**
   * @param initialBytes İlk okumada dosyanın sonundan en fazla bu kadar bayt okunur (büyük dosyada geçmişin
   *   tamamını işlememek için). İlk kısmi satır atılır.
   */
  constructor(
    readonly filePath: string,
    private readonly initialBytes = 256 * 1024,
    options: TailerOptions = {},
  ) {
    this.chunkBytes = Math.max(1, options.chunkBytes ?? 1024 * 1024);
    this.replayUntil = options.replayUntil ?? null;
  }

  /** İşlenmiş son tam satırın bittiği bayt (henüz hiç okunmadıysa null). */
  get position(): number | null {
    return this.offset === null ? null : this.offset - this.remainder.length;
  }

  /** Eklenen tüm tam satırlar (geçmiş yeniden okunduysa onlar da). */
  async read(): Promise<string[]> {
    const out: string[] = [];
    for await (const batch of this.batches()) out.push(...batch.lines);
    return out;
  }

  /** Eklenen tam satırları parça parça verir; her parça en fazla ~`chunkBytes` veriden gelir. */
  async *batches(): AsyncGenerator<TailBatch> {
    let handle;
    try {
      handle = await open(this.filePath, 'r');
    } catch {
      return;
    }
    try {
      const { size } = await handle.stat();
      let start: number;
      if (this.offset === null) {
        start = Math.max(0, size - this.initialBytes);
        this.skipPartial = start > 0;
      } else if (size < this.offset) {
        // Dosya küçüldü (yeniden yazıldı): baştan başla.
        start = 0;
        this.remainder = EMPTY;
        this.skipPartial = false;
      } else {
        start = this.offset;
      }
      const replayUntil = this.replayUntil;
      this.replayUntil = null;
      // Dosya küçüldüyse eski konum anlamsızdır.
      const boundary = replayUntil !== null && replayUntil <= size ? replayUntil : null;

      let pos = start;
      this.offset = pos;
      while (pos < size) {
        let end = Math.min(pos + this.chunkBytes, size);
        // Parçalar geçmiş sınırında bölünür: bir parçanın satırları ya tamamen eski ya tamamen yenidir.
        if (boundary !== null && boundary > pos && boundary < end) end = boundary;
        const chunk = Buffer.allocUnsafe(end - pos);
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, pos);
        if (bytesRead === 0) break;
        pos += bytesRead;
        this.offset = pos;
        const lines = this.split(chunk.subarray(0, bytesRead));
        if (lines.length > 0) yield { lines, replay: boundary !== null && pos <= boundary };
      }
    } finally {
      await handle.close();
    }
  }

  /** Yeni gelen baytları saklı yarım satırla birleştirip tam satırlara böler. */
  private split(data: Buffer): string[] {
    let buffer = this.remainder.length > 0 ? Buffer.concat([this.remainder, data]) : data;
    if (this.skipPartial) {
      const nl = buffer.indexOf(NEWLINE);
      if (nl === -1) {
        // Atlanan satır hâlâ bitmedi: baytlarını tutmaya gerek yok.
        this.remainder = EMPTY;
        return [];
      }
      buffer = buffer.subarray(nl + 1);
      this.skipPartial = false;
    }
    const last = buffer.lastIndexOf(NEWLINE);
    if (last === -1) {
      // Kopyala: büyük parçanın tamamı bellekte tutulmasın.
      this.remainder = Buffer.from(buffer);
      return [];
    }
    this.remainder = last + 1 < buffer.length ? Buffer.from(buffer.subarray(last + 1)) : EMPTY;
    // Yeni satır baytı (0x0a) çok baytlı bir UTF-8 karakterinin içinde geçmez; bölmek güvenlidir.
    return buffer
      .toString('utf8', 0, last)
      .split('\n')
      .filter((p) => p.trim().length > 0);
  }
}
