// Ortam değişkeni verip komut çalıştırır; macOS, Linux ve Windows'ta aynı biçimde çalışır.
// Kullanım: node scripts/ortam.mjs AD=değer [AD2=değer2 …] -- komut [argümanlar…]
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const sep = args.indexOf('--');
if (sep < 1 || sep === args.length - 1) {
  console.error('Kullanım: node scripts/ortam.mjs AD=değer -- komut [argümanlar]');
  process.exit(2);
}

const env = { ...process.env };
for (const pair of args.slice(0, sep)) {
  const eq = pair.indexOf('=');
  if (eq < 1) {
    console.error(`Geçersiz atama: ${pair}`);
    process.exit(2);
  }
  env[pair.slice(0, eq)] = pair.slice(eq + 1);
}

// Boşluk ya da kabuk karakteri içeren argümanlar çift tırnağa alınır (sh ve Windows cmd ikisi de anlar).
const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `"${a.replace(/(["\\$`])/g, '\\$1')}"`);
const child = spawn(
  args
    .slice(sep + 1)
    .map(quote)
    .join(' '),
  { env, stdio: 'inherit', shell: true },
);
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
