// README ekran görüntüleri: görünmez Chrome + DevTools protokolü (ek paket yok).
//
// Kullanım (önce demo ofisi başka portlarda açılır, sonra bu betik çalıştırılır):
//   AJAN_OFISI_DEMO=dolu AJAN_OFISI_PORT=5185 AJAN_OFISI_WEB_PORT=5184 AJAN_OFISI_NO_OPEN=1 npm start
//   npm run screenshots                 # hepsi
//   npm run screenshots -- tum-projeler # yalnızca adı verilenler
//
// Ortam: APP_URL (varsayılan http://127.0.0.1:5184/), OUT_DIR (varsayılan docs/ekran-goruntuleri), CHROME_PATH.
// Geliştirme modundaki `window.__ajanOfisiStore` kancasını kullanır (üretim derlemesinde yoktur).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const URL_APP = process.env.APP_URL ?? 'http://127.0.0.1:5184/';
const OUT = path.resolve(process.env.OUT_DIR ?? 'docs/ekran-goruntuleri');
const PORT = 9333;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const profile = '/tmp/ajan-ofisi-shots-profile';
rmSync(profile, { recursive: true, force: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1600,900',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome açılmadı');
}

const ws = new WebSocket(await pageWs());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const size = (width, height, mobile = false) =>
  send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
const shot = async (name) => {
  if (only.length && !only.includes(name)) return;
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('kaydedildi:', name);
};
const S = 'window.__ajanOfisiStore.getState()';

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await size(1600, 900);
await send('Page.navigate', { url: URL_APP });
await sleep(1500);
await evaluate(`localStorage.clear(); localStorage.setItem('ajan-ofisi:proje', 'Atlas'); true`);
// Not: görünüm seçimi localStorage'da; telefon adımında yeniden yüklenince Atlas'e döner.
await send('Page.navigate', { url: URL_APP });
// Demo ofisi dolsun, karakterler masalarına otursun.
await sleep(14000);
console.log(
  'webgl:',
  await evaluate(
    `(() => { const c = document.querySelector('canvas'); return c ? (c.width + 'x' + c.height) : 'yok'; })()`,
  ),
);

// 1) Proje ofisi, panel kapalı (kahraman görseli)
await evaluate(`${S}.panelOpen && ${S}.togglePanel(); true`);
await sleep(2500);
await shot('proje-ofisi');

// 2) Panel açık
await evaluate(`${S}.togglePanel(); true`);
await sleep(2500);
await shot('ajan-paneli');

// 3) Detay paneli: Atlas'de çalışan bir yardımcı ya da lider
const picked = await evaluate(`(() => {
  const a = ${S}.snapshot.agents.filter(x => x.project === 'Atlas' && x.status !== 'offline' && x.status !== 'idle');
  const sub = a.find(x => x.kind === 'subagent' && x.recent.length > 2) ?? a.find(x => x.recent.length > 0) ?? a[0];
  if (sub) ${S}.select(sub.id);
  return sub ? sub.name : null;
})()`);
console.log('seçilen:', picked);
await sleep(4000);
await shot('detay-paneli');
await evaluate(`${S}.select(null); true`);
await sleep(2500);

// 3b) DevTechnic marka duvarı ve dinlenme alanı (yakın çekim, panel kapalı)
await evaluate(`${S}.panelOpen && ${S}.togglePanel(); true`);
await sleep(800);
await evaluate(`(() => {
  const o = window.__ajanOfisi;
  o.controls.target.set(0, 1.4, 0.5 - o.plan.depth / 2);
  o.camera.position.set(0, 3.6, 8 - o.plan.depth / 2);
  o.controls.update();
  return true;
})()`);
await sleep(2500);
await shot('marka-duvari');
await evaluate(`(() => {
  const o = window.__ajanOfisi;
  o.controls.target.set(o.plan.width / 2 - 2.6, 0.6, o.plan.depth / 2 - 2.5);
  o.camera.position.set(o.plan.width / 2 - 8.1, 5.1, o.plan.depth / 2 + 2);
  o.controls.update();
  return true;
})()`);
await sleep(2500);
await shot('dinlenme-alani');
await evaluate(`${S}.togglePanel(); ${S}.select(null); true`);
await sleep(2500);

// 4) Ayarlar
await evaluate(`${S}.setSettingsOpen(true); true`);
await sleep(1200);
await shot('ayarlar');
await evaluate(`${S}.setSettingsOpen(false); true`);

// 5) Düzen düzenleyicisi
await evaluate(`${S}.setEditingLayout(true); true`);
await sleep(2500);
await shot('duzen-duzenleyici');
await evaluate(`${S}.setEditingLayout(false); true`);
await sleep(1000);

// 6) Temalar (panel kapalı)
await evaluate(`${S}.panelOpen && ${S}.togglePanel(); true`);
await evaluate(`${S}.updateSettings({ theme: 'gunisigi' }); true`);
await sleep(3500);
await shot('tema-gun-isigi');
await evaluate(`${S}.updateSettings({ theme: 'kuzey' }); true`);
await sleep(3500);
await shot('tema-kuzey');
await evaluate(`${S}.updateSettings({ theme: 'gece' }); true`);
await sleep(2000);

// 7) Tüm projeler
await evaluate(`${S}.setView('*'); true`);
await sleep(4000);
await shot('tum-projeler');

// 8) Telefon genişliği
// Kadraj ilk açılışta alınır: telefon boyutunda sayfayı yeniden yükle.
await evaluate(`${S}.setView('Atlas'); true`);
await size(390, 844, true);
await send('Page.navigate', { url: URL_APP });
await sleep(10000);
await evaluate(`${S}.panelOpen && ${S}.togglePanel(); true`);
await sleep(1500);
await shot('telefon');

ws.close();
chrome.kill();
process.exit(0);
