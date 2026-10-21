// Gömülü Growth OS'u derler: growth-os/ → growth-os/.next/standalone (Orbit kurulumuna "growth" olarak girer)
// Kullanım: node scripts/build-growth.js   (npm run growth)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'growth-os');
const out = path.join(dir, '.next', 'standalone');
const tpl = path.join(dir, 'prisma', 'template.db');
const env = { ...process.env, DATABASE_URL: 'file:./template.db', NEXT_TELEMETRY_DISABLED: '1' };
const run = (cmd) => execSync(cmd, { cwd: dir, stdio: 'inherit', env });

if (!fs.existsSync(path.join(dir, 'node_modules'))) run('npm ci --no-audit --no-fund');
run('npx prisma generate');
fs.rmSync(tpl, { force: true });
run('npx prisma db push --skip-generate'); // boş şablon veritabanı (şemanın birebir kopyası)
fs.rmSync(path.join(dir, '.next'), { recursive: true, force: true });
run('npx next build');
// standalone sunucu statik dosyaları ve public klasörünü içermez: kopyala
fs.cpSync(path.join(dir, '.next', 'static'), path.join(out, '.next', 'static'), { recursive: true });
fs.cpSync(path.join(dir, 'public'), path.join(out, 'public'), { recursive: true });
fs.copyFileSync(tpl, path.join(out, 'template.db'));
// geliştirme kalıntıları pakete girmesin
for (const f of ['.env', 'derleme.db', 'template.db-journal']) fs.rmSync(path.join(out, f), { force: true });
console.log('Growth OS derlendi:', out);
