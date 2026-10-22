// Vercel derlemesi (orbit.wexon.dev): veritabanı PostgreSQL (Supabase) olduğu için Prisma şeması derleme
// makinesinde schema.postgres.prisma'dan üretilir. Depodaki schema.prisma (Orbit'in yerel SQLite'ı) değişmez;
// bu betik yalnızca Vercel'in geçici derleme kopyasında çalışır.
const fs = require('fs');
const path = require('path');

if (!process.env.VERCEL) {
  console.error('vercel-db.js yalnızca Vercel derlemesinde çalışır');
  process.exit(1);
}
const dir = path.join(__dirname, '..', 'prisma');
let s = fs.readFileSync(path.join(dir, 'schema.postgres.prisma'), 'utf8');
// Varsayılan istemci yolu (@prisma/client) ve Vercel'in Linux motoru
s = s.replace(/^\s*output\s*=.*$/m, '  binaryTargets = ["native", "rhel-openssl-3.0.x"]');
// Göç / doğrudan bağlantı (Supabase oturum havuzu)
s = s.replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")');
fs.writeFileSync(path.join(dir, 'schema.prisma'), s);
console.log('Prisma şeması PostgreSQL olarak ayarlandı');
