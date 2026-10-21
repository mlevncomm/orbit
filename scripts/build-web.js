// Orbit web arayüzü: masaüstü arayüzünün (src/renderer) birebir kopyası growth-os/public/app/ altına yazılır.
// orbit.wexon.dev'de her sayfa isteği bu index.html'e yönlenir (growth-os/src/proxy.ts); window.orbit'i orbit-web.js sağlar.
// Kullanım: node scripts/build-web.js   (npm run growth bunu kendisi de çalıştırır)
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'renderer');
const out = path.join(__dirname, '..', 'growth-os', 'public', 'app');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(src)) {
  const from = path.join(src, f);
  if (f === 'index.html') continue;
  if (fs.statSync(from).isDirectory() || /\.(js|css)$/.test(f)) fs.cpSync(from, path.join(out, f), { recursive: true });
}

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const swap = (a, b) => {
  if (!html.includes(a)) throw new Error(`index.html beklenen yerde değişmiş: ${a}`);
  html = html.replace(a, b);
};
// Her adreste (/, /musteriler, ...) dosyalar /app/ altından yüklensin
swap('<meta charset="utf-8" />', '<meta charset="utf-8" />\n  <base href="/app/" />');
swap('<title>Orbit · wexon.dev</title>', '<title>Orbit</title>');
// Masaüstündeki preload köprüsünün yerine web köprüsü, diğer betiklerden önce
swap('<script src="icons.js"></script>', '<script src="orbit-web.js"></script>\n  <script src="icons.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('Orbit web arayüzü hazır:', out);
