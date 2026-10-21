// Growth OS canlıya geçiş (alt süreç): yerel SQLite verisini PostgreSQL'e (Supabase) yazar.
// Satırlar birincil anahtara göre eklenir / güncellenir (yerel kazanır); uzakta olup yerelde olmayan hiçbir satır silinmez.
// Bağlantı adresini stdin'den okur (ortam / log görmez). Çıktının son satırı JSON: { counts } ya da { error }.
const path = require('path');
const { PrismaClient, Prisma } = require(path.join(process.env.GROWTH_ROOT, 'node_modules', '@prisma', 'client'));
const { Client } = require(process.env.ORBIT_PG);

const ORDER = ['Tenant', 'User', 'AppSettings', 'BrandPlaybook', 'Campaign', 'Lead', 'Template', 'OutreachJob', 'CoachMessage', 'IgThread', 'IgMessage', 'AuditLog'];
const lc = (m) => m[0].toLowerCase() + m.slice(1);
const q = (n) => `"${n.replace(/"/g, '')}"`;

async function main() {
  let url = '';
  for await (const chunk of process.stdin) url += chunk;
  url = url.trim();
  const dst = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, statement_timeout: 60000 });
  await dst.connect();
  const src = new PrismaClient();
  const models = Object.fromEntries(Prisma.dmmf.datamodel.models.map((m) => [m.name, m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum')]));
  const counts = {};
  try {
    // Tablolar uzakta yoksa (şema kurulmamış) hiçbir şey yazmadan dur
    const have = new Set((await dst.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows.map((r) => r.table_name));
    const missing = ORDER.filter((m) => models[m] && !have.has(m));
    if (missing.length) throw new Error(`Supabase'de Growth OS tabloları yok: ${missing.join(', ')}`);
    await dst.query('BEGIN');
    for (const m of ORDER) {
      if (!models[m]) continue;
      const fields = models[m];
      const id = fields.find((f) => f.isId)?.name;
      if (!id) throw new Error(`${m} için birincil anahtar bulunamadı`);
      const rows = await src[lc(m)].findMany();
      const cols = fields.map((f) => f.name);
      for (let i = 0; i < rows.length; i += 100) {
        const part = rows.slice(i, i + 100);
        const vals = [];
        const tuples = part.map((r) => `(${cols.map((c) => { vals.push(r[c] ?? null); return '$' + vals.length; }).join(', ')})`);
        const set = cols.filter((c) => c !== id).map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ');
        await dst.query(`INSERT INTO ${q(m)} (${cols.map(q).join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (${q(id)}) DO ${set ? 'UPDATE SET ' + set : 'NOTHING'}`, vals);
      }
      counts[m] = rows.length;
    }
    await dst.query('COMMIT');
  } catch (e) {
    await dst.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await dst.end().catch(() => {});
    await src.$disconnect().catch(() => {});
  }
  process.stdout.write('\n' + JSON.stringify({ counts }) + '\n');
}

main().catch((e) => { process.stdout.write('\n' + JSON.stringify({ error: String(e.message || e).replace(/postgres(ql)?:\/\/\S+/gi, '[adres]') }) + '\n'); process.exit(1); });
