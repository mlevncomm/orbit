// Uzaktan yönetim: orbit.wexon.dev'deki Orbit arayüzü bu bilgisayardaki Orbit'i yönetir.
//
// - Bilgisayarda dışarıya açılan bir kapı YOKTUR. Web komutları Supabase'deki orbit_remote_cmd tablosuna yazar;
//   Orbit buradan saniyede bir okur, kendi IPC işleyicisiyle çalıştırır, sonucu aynı satıra yazar.
// - Arayüz olayları (kurulum ilerlemesi, ışık durumu...) orbit_remote_event tablosuna yazılır, web oradan izler.
// - Yalnızca kullanıcı "Uzaktan yönetime izin ver"i açtıysa ve Growth OS canlı veritabanı (Supabase) bağlıysa çalışır.
// - Riskli işler (yeniden başlatma, dosya açma, dosya diyalogları, API anahtarı yazma...) uzaktan yapılamaz.
// - Tablolarda satır düzeyi güvenlik açıktır: Supabase'in herkese açık REST anahtarı bu tablolara erişemez.
const crypto = require('crypto');
const store = require('./store');
const log = require('./log');

const DENY = new Set([
  'system:restart', 'system:relaunchAdmin', 'shell:open', 'shell:open-local', 'app:openLogs',
  'profile:export', 'profile:import', 'site:open', 'update:install', 'esp32:raw', 'bridge:info',
]);
// Web, satış ekranlarını kendi sunucusundan çalıştırır; bunlar ve canlı veritabanı ayarları uzaktan çağrılmaz
const DENY_PREFIX = ['growth:'];
const SETTINGS_LOCKED = ['apiKey', 'bridgeEnabled', 'remoteControl'];

const SQL_SETUP = `
CREATE TABLE IF NOT EXISTS orbit_remote_cmd (
  id uuid PRIMARY KEY, channel text NOT NULL, args jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending', result jsonb, error text,
  created_at timestamptz NOT NULL DEFAULT now(), done_at timestamptz);
CREATE INDEX IF NOT EXISTS orbit_remote_cmd_pending ON orbit_remote_cmd (status, created_at);
CREATE TABLE IF NOT EXISTS orbit_remote_event (
  id bigserial PRIMARY KEY, channel text NOT NULL, payload jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS orbit_remote_state (
  id int PRIMARY KEY, last_seen timestamptz NOT NULL, version text, pc text);
ALTER TABLE orbit_remote_cmd ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_remote_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_remote_state ENABLE ROW LEVEL SECURITY;`;

let client = null;
let timers = [];
let busy = false;
let opts = null;           // { handlers: Map, url: () => string|null, version, pc }
let pending = new Map();   // olay kanalı → son yük (yarım saniyede bir topluca yazılır)
let stopped = true;
let retry = 0;

function denied(ch) {
  return DENY.has(ch) || DENY_PREFIX.some((p) => ch.startsWith(p));
}

/** Uzaktan gelen tek komutu çalıştırır */
async function exec(ch, args) {
  if (typeof ch !== 'string' || denied(ch)) throw new Error('Bu işlem uzaktan yapılamaz');
  const fn = opts.handlers.get(ch);
  if (!fn) throw new Error('Bilinmeyen işlem');
  const a = Array.isArray(args) ? args : [];
  if (ch === 'settings:set' && a[0] && typeof a[0] === 'object') for (const k of SETTINGS_LOCKED) delete a[0][k];
  if (ch !== 'rgb:live') log.info(`Uzaktan komut: ${ch}`); // canlı ışık önizlemesi saniyede birkaç kez gelir
  return fn(...a);
}

async function tick() {
  if (busy || !client) return;
  busy = true;
  try {
    const { rows } = await client.query(`
      UPDATE orbit_remote_cmd SET status = 'running'
      WHERE id IN (SELECT id FROM orbit_remote_cmd WHERE status = 'pending' AND created_at > now() - interval '60 seconds'
                   ORDER BY created_at LIMIT 8 FOR UPDATE SKIP LOCKED)
      RETURNING id, channel, args`);
    // Her komut kendi başına çalışır: uzun süren biri (ör. sürücü taraması) diğerlerini bekletmez
    for (const r of rows) run(r);
  } catch (e) {
    fail(e);
  } finally {
    busy = false;
  }
}

async function run(r) {
  let result = null; let error = null;
  try { result = await exec(r.channel, r.args); } catch (e) { error = e.message || String(e); }
  let json = JSON.stringify(result === undefined ? null : result);
  if (json.length > 4_000_000) { json = 'null'; error = 'Sonuç çok büyük'; }
  try {
    await client?.query(`UPDATE orbit_remote_cmd SET status = $2, result = $3::jsonb, error = $4, done_at = now() WHERE id = $1`,
      [r.id, error ? 'error' : 'done', json, error]);
  } catch (e) { fail(e); }
}

async function flush() {
  if (!client || !pending.size) return;
  const batch = [...pending.entries()];
  pending = new Map();
  const vals = []; const rows = [];
  for (const [, [ch, payload]] of batch) {
    const json = JSON.stringify(payload === undefined ? null : payload);
    if (json.length > 500_000) continue;
    vals.push(ch, json);
    rows.push(`($${vals.length - 1}, $${vals.length}::jsonb)`);
  }
  if (!rows.length) return;
  try { await client.query(`INSERT INTO orbit_remote_event (channel, payload) VALUES ${rows.join(', ')}`, vals); } catch (e) { fail(e); }
}

async function heartbeat() {
  if (!client) return;
  try {
    await client.query(`INSERT INTO orbit_remote_state (id, last_seen, version, pc) VALUES (1, now(), $1, $2)
      ON CONFLICT (id) DO UPDATE SET last_seen = now(), version = EXCLUDED.version, pc = EXCLUDED.pc`, [opts.version, opts.pc]);
  } catch (e) { fail(e); }
}

async function cleanup() {
  if (!client) return;
  try {
    await client.query(`DELETE FROM orbit_remote_event WHERE created_at < now() - interval '10 minutes'`);
    await client.query(`DELETE FROM orbit_remote_cmd WHERE created_at < now() - interval '1 hour'`);
  } catch (e) { fail(e); }
}

function fail(e) {
  if (stopped) return;
  log.warn('Uzaktan yönetim bağlantısı koptu, yeniden denenecek: ' + String(e.message || e).replace(/postgres(ql)?:\/\/\S+/gi, '[adres]'));
  disconnect();
  const wait = Math.min(60_000, 2000 * 2 ** retry++);
  timers.push(setTimeout(() => connect().catch(() => {}), wait));
}

function disconnect() {
  for (const t of timers) { clearInterval(t); clearTimeout(t); }
  timers = [];
  const c = client; client = null;
  if (c) c.end().catch(() => {});
}

async function connect() {
  if (stopped) return;
  const url = opts.url();
  if (!url) { log.warn('Uzaktan yönetim için canlı veritabanı (Supabase) bağlı değil'); return; }
  const { Client } = require('pg');
  const c = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, statement_timeout: 30000 });
  c.on('error', fail);
  await c.connect();
  await c.query(SQL_SETUP);
  client = c; retry = 0;
  await heartbeat();
  timers.push(setInterval(tick, 1000), setInterval(flush, 500), setInterval(heartbeat, 5000), setInterval(cleanup, 60_000));
  log.info('Uzaktan yönetim açık: orbit.wexon.dev bu bilgisayarı yönetebilir');
}

/** Ayara göre başlatır / durdurur. opts: { handlers, url, version, pc } */
async function sync(o) {
  if (o) opts = o;
  const want = Boolean(store.get('settings').remoteControl) && Boolean(opts?.url());
  if (want && stopped) { stopped = false; await connect().catch(fail); }
  else if (!want && !stopped) { stopped = true; disconnect(); log.info('Uzaktan yönetim kapatıldı'); }
  return status();
}

/** Arayüz olayını web'e de iletir (aynı kanalın arka arkaya gelenlerinden yalnızca sonuncusu gider) */
function publish(channel, payload) {
  if (stopped || !client) return;
  if (channel === 'esp32:log') return; // seri port konsolu çok sık ve yalnızca yerelde anlamlı
  // Aynı kanaldaki farklı işler (ör. iki programın kurulum ilerlemesi) birbirini ezmesin
  pending.set(channel + '|' + (payload && typeof payload === 'object' && payload.key ? payload.key : ''), [channel, payload]);
}

const status = () => ({ enabled: Boolean(store.get('settings').remoteControl), connected: Boolean(client), live: Boolean(opts?.url()) });

module.exports = { sync, publish, status, exec, denied, _id: () => crypto.randomUUID() };
