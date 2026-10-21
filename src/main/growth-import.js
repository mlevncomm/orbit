// Growth OS veri taşıma (alt süreç): eski PostgreSQL veritabanından yerel SQLite'a.
// Gömülü sunucunun Prisma istemcisiyle yazar; bağlantı adresini stdin'den okur (ortam / log görmez).
// Çıktının son satırı JSON: { counts } ya da { error }.
const path = require('path');
const { PrismaClient, Prisma } = require(path.join(process.env.GROWTH_ROOT, 'node_modules', '@prisma', 'client'));
const { Client } = require(process.env.ORBIT_PG);

// Yabancı anahtar sırası (önce üst tablolar)
const ORDER = ['Tenant', 'User', 'AppSettings', 'BrandPlaybook', 'Campaign', 'Lead', 'Template', 'OutreachJob', 'CoachMessage', 'IgThread', 'IgMessage', 'AuditLog'];
const lc = (m) => m[0].toLowerCase() + m.slice(1);

async function main() {
  let url = '';
  for await (const chunk of process.stdin) url += chunk;
  url = url.trim();
  const src = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, statement_timeout: 60000 });
  await src.connect();
  const dst = new PrismaClient();
  const models = Object.fromEntries(Prisma.dmmf.datamodel.models.map((m) => [m.name, m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum')]));
  const counts = {};
  try {
    // Var olan yerel veriyi sil (alttan üste)
    for (const m of [...ORDER].reverse()) if (models[m]) await dst[lc(m)].deleteMany();
    for (const m of ORDER) {
      if (!models[m]) continue;
      let rows;
      try { rows = (await src.query(`SELECT * FROM "${m}"`)).rows; } catch (e) { if (/does not exist/.test(e.message)) { counts[m] = 0; continue; } throw e; }
      const fields = models[m];
      const clean = rows.map((r) => {
        const o = {};
        for (const f of fields) {
          if (!(f.name in r)) continue;
          let v = r[f.name];
          if (v == null) { o[f.name] = null; continue; }
          if (f.type === 'Int') v = Number(v);
          if (f.type === 'Float') v = Number(v);
          if (f.type === 'Boolean') v = Boolean(v);
          if (f.type === 'DateTime') v = new Date(v);
          if (f.type === 'String' && typeof v !== 'string') v = typeof v === 'object' ? JSON.stringify(v) : String(v);
          o[f.name] = v;
        }
        // WhatsApp Web oturumu taşınmaz: aynı oturumun iki yerde açık kalması bağlantıyı bozar, Orbit'te QR ile yeniden bağlanılır
        if (m === 'AppSettings') Object.assign(o, { waWebState: 'disconnected', waWebQr: '', waWebError: '', waWebCreds: '', waWebPairId: '', waWebPairingUntil: null });
        return o;
      });
      for (let i = 0; i < clean.length; i += 200) await dst[lc(m)].createMany({ data: clean.slice(i, i + 200) });
      counts[m] = clean.length;
    }
  } finally {
    await src.end().catch(() => {});
    await dst.$disconnect().catch(() => {});
  }
  process.stdout.write('\n' + JSON.stringify({ counts }) + '\n');
}

main().catch((e) => { process.stdout.write('\n' + JSON.stringify({ error: String(e.message || e).replace(/postgres(ql)?:\/\/\S+/gi, '[adres]') }) + '\n'); process.exit(1); });
