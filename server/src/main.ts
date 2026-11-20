import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerMessage } from '../../shared/types.ts';
import { Collector } from './collector.ts';
import { startDemo } from './demo.ts';
import { parsePort } from './port.ts';
import { OfficeStore } from './store.ts';

/** Yalnızca bu bilgisayar: dışarıdan erişilemez. */
export const HOST = '127.0.0.1';
/** AJAN_OFISI_PORT geçersizse 5175 (uyarıyla); kural web/vite.config.ts ile aynı. */
export const PORT = parsePort(process.env.AJAN_OFISI_PORT, 5175, (m) => console.warn(`[Ajan Ofisi] ${m}`));

/**
 * Demo/test için başka bir klasör verilebilir: AJAN_OFISI_CLAUDE_HOME=fixtures/claude-home
 * Göreli yol, komutun çalıştırıldığı klasöre göre çözülür (npm, sunucuyu server/ içinde başlatır; INIT_CWD
 * komutun asıl yazıldığı klasördür).
 */
const customHome = process.env.AJAN_OFISI_CLAUDE_HOME;
const claudeHome = customHome
  ? path.resolve(process.env.INIT_CWD ?? process.cwd(), customHome)
  : path.join(os.homedir(), '.claude');
/** Örnek veri modunda kayıtlardaki süreçler gerçekte çalışmaz; hepsi "açık" sayılır. */
const demo = Boolean(customHome);
/** Uydurma, canlı değişen demo ofisi: AJAN_OFISI_DEMO=1 (ya da "dolu": kalabalık başlar). Hiçbir dosya okunmaz. */
const demoMode = process.env.AJAN_OFISI_DEMO;

const store = new OfficeStore();
const clients = new Set<WebSocket>();

function message(): string {
  const payload: ServerMessage = { type: 'snapshot', snapshot: store.snapshot() };
  return JSON.stringify(payload);
}

// Çok sık değişiklikte tarayıcıyı boğmamak için en fazla saniyede ~6 güncelleme.
let pending: NodeJS.Timeout | null = null;
function broadcast(): void {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    const data = message();
    for (const client of clients) if (client.readyState === client.OPEN) client.send(data);
  }, 160);
}

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, agents: store.snapshot().agents.length }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server: http,
  // Yalnızca yerel arayüzden gelen bağlantılar.
  verifyClient: ({ origin }: { origin?: string }) =>
    !origin || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin),
});
wss.on('connection', (socket) => {
  clients.add(socket);
  socket.send(message());
  socket.on('close', () => clients.delete(socket));
});

const collector = new Collector({
  claudeHome,
  store,
  onChange: broadcast,
  ...(demo ? { alive: () => true } : {}),
});

let stopDemo: (() => void) | null = null;

http.listen(PORT, HOST, () => {
  if (demoMode) {
    stopDemo = startDemo(store, broadcast, { full: demoMode === 'dolu' });
    console.log(`Ajan Ofisi sunucusu hazır: http://${HOST}:${PORT}  (DEMO modu: uydurma veriler)`);
    return;
  }
  void collector.start().then(() => {
    console.log(
      `Ajan Ofisi sunucusu hazır: http://${HOST}:${PORT}  (izlenen klasör: ${claudeHome}${demo ? ', örnek veri modu' : ''})`,
    );
  });
});

function shutdown(): void {
  stopDemo?.();
  void (demoMode ? Promise.resolve() : collector.stop()).finally(() => {
    // Açık tarayıcı bağlantıları kapanmayı bekletmesin.
    for (const client of clients) client.terminate();
    wss.close();
    http.closeAllConnections();
    http.close(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
