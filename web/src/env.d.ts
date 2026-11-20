/** Sunucu portu: derleme sırasında vite.config.ts'teki `define` ile verilir (AJAN_OFISI_PORT, varsayılan 5175). */
declare const __AJAN_OFISI_PORT__: number;

interface ImportMetaEnv {
  /** "1": sunucusuz statik demo derlemesi (GitHub Pages). */
  readonly VITE_STATIC_DEMO?: string;
}
