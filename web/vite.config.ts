import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Ortam değişkeninden port okur; geçersizse varsayılan. */
function port(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

// İkinci bir örnek (ör. ölçüm için) başka portlarda çalışabilsin:
// AJAN_OFISI_PORT (sunucu, 5175), AJAN_OFISI_WEB_PORT (arayüz, 5174), AJAN_OFISI_NO_OPEN=1 (tarayıcı açılmaz).
const serverPort = port(process.env.AJAN_OFISI_PORT, 5175);
const webPort = port(process.env.AJAN_OFISI_WEB_PORT, 5174);
const open = process.env.AJAN_OFISI_NO_OPEN !== '1';

// Arayüz yalnızca bu bilgisayardan erişilebilir (127.0.0.1).
export default defineConfig({
  plugins: [react()],
  define: { __AJAN_OFISI_PORT__: JSON.stringify(serverPort) },
  server: { host: '127.0.0.1', port: webPort, strictPort: true, open },
  preview: { host: '127.0.0.1', port: webPort },
});
