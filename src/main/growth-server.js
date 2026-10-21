// Gömülü Growth OS: Orbit'in içinde çalışan yerel sunucu (growth-os/ → Next.js standalone).
//
// - Sunucu yalnızca 127.0.0.1'de, Orbit'in seçtiği boş bir portta çalışır; internete açılmaz.
// - Veri: userData/growth/growth.db (SQLite). İlk açılışta boş şablon veritabanı kopyalanır.
// - Oturum sırrı (AUTH_SECRET) Orbit tarafından üretilir, Windows hesabıyla şifreli saklanır.
// - Profil şifrelerini (PIN) kullanıcı belirler; yalnızca scrypt özeti saklanır (şifreli). Doğrulamayı ve
//   yanlış denemede kilitlemeyi Growth OS sunucusu kendisi yapar.
// - Canlı mod (isteğe bağlı): veritabanı yerel dosya yerine Supabase (PostgreSQL) olur; orbit.wexon.dev ile aynı
//   veriyi kullanır. Bağlantı adresi Windows hesabıyla şifreli saklanır, hiçbir yere yazılmaz / loglanmaz.
//   Geçişte yerel veri Supabase'e (birincil anahtara göre, yerel kazanır), dönüşte Supabase verisi yerele kopyalanır.
const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app, safeStorage } = require('electron');
const store = require('./services/store');
const log = require('./services/log');

const ROOT = () => (app.isPackaged
  ? path.join(process.resourcesPath, 'growth')
  : path.join(__dirname, '..', '..', 'growth-os', '.next', 'standalone'));
const DATA = () => path.join(app.getPath('userData'), 'growth');
const DB = () => path.join(DATA(), 'growth.db');
const TENANTS = ['tnt_wexon_dev', 'tnt_aquails'];

let proc = null;
let port = null;
let starting = null;

const enc = (s) => (safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : 'raw:' + Buffer.from(s).toString('base64'));
const dec = (v) => (v.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : Buffer.from(v.slice(4), 'base64').toString());

/** Kalıcı sırlar: oturum anahtarı ve profil şifresi (+ özeti) */
function secrets() {
  const saved = store.get('growthSecrets');
  if (saved?.v) { try { return JSON.parse(dec(saved.v)); } catch { log.warn('Growth OS sırları okunamadı, yenileri üretiliyor'); } }
  const pin = String(crypto.randomInt(10000000, 99999999));
  const salt = crypto.randomBytes(16).toString('hex');
  const s = { authSecret: crypto.randomBytes(32).toString('hex'), pin, pinHash: `${salt}:${crypto.scryptSync(pin, salt, 64).toString('hex')}` };
  store.set('growthSecrets', { v: enc(JSON.stringify(s)) });
  return s;
}

// ---------- Profil şifreleri ----------
function pinHashes() {
  const v = store.get('growthPins');
  if (!v) return {};
  try { return JSON.parse(dec(v)); } catch { return {}; }
}
const hasPin = (tenantId) => Boolean(pinHashes()[tenantId]);
function verifyPin(tenantId, pin) {
  const h = pinHashes()[tenantId];
  if (!h) return false;
  const [salt, hash] = h.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(String(pin), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/** Profil şifresini belirler / değiştirir. Değiştirirken mevcut şifre doğrulanır. Sunucu yeni özetle yeniden başlar. */
async function setPin(tenantId, pin, current) {
  if (!TENANTS.includes(tenantId)) throw new Error('Geçersiz profil');
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('Şifre 4-8 rakam olmalı');
  if (hasPin(tenantId) && !verifyPin(tenantId, current)) throw new Error('Mevcut şifre yanlış');
  const salt = crypto.randomBytes(16).toString('hex');
  const map = { ...pinHashes(), [tenantId]: `${salt}:${crypto.scryptSync(String(pin), salt, 64).toString('hex')}` };
  store.set('growthPins', enc(JSON.stringify(map)));
  log.info(`Growth OS profil şifresi ${current ? 'değiştirildi' : 'belirlendi'}: ${tenantId}`);
  stop();
  await start();
  return true;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

function ensureDb() {
  fs.mkdirSync(DATA(), { recursive: true });
  if (!fs.existsSync(DB())) {
    const tpl = path.join(ROOT(), 'template.db');
    if (!fs.existsSync(tpl)) throw new Error('Growth OS şablon veritabanı bulunamadı (growth-os derlenmemiş)');
    fs.copyFileSync(tpl, DB());
    log.info('Growth OS: yeni yerel veritabanı oluşturuldu');
  }
}

// ---------- Canlı veritabanı (Supabase) ----------
const PG_URL = /^postgres(ql)?:\/\/[^\s]+$/i;
function liveUrl() {
  const v = store.get('growthLive');
  if (!v) return null;
  try { return dec(v); } catch { return null; }
}
const isLive = () => Boolean(liveUrl());
const redact = (t) => String(t || '').replace(/postgres(ql)?:\/\/\S+/gi, '[adres]');
/** Veri aktarım alt sürecini (growth-import / growth-export) çalıştırır; adres stdin ile verilir */
function runChild(script, databaseUrl) {
  const s = secrets();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, script)], {
      cwd: ROOT(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...env(0, s, { local: true }), ORBIT_PG: require.resolve('pg'), GROWTH_ROOT: ROOT() },
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => {
      const last = out.trim().split(/\r?\n/).pop() || '{}';
      try { resolve({ code, ...JSON.parse(last) }); } catch { resolve({ code, error: (err || out).slice(-400) }); }
    });
    child.stdin.end(String(databaseUrl).trim()); // adres ortam değişkeni değil stdin ile verilir
  });
}
/** Canlıya geç: yerel veri Supabase'e yazılır, sonra sunucu Supabase ile açılır */
async function goLive(databaseUrl) {
  const u = String(databaseUrl || '').trim();
  if (!PG_URL.test(u)) throw new Error('Geçerli bir PostgreSQL bağlantı adresi girin (postgresql://…)');
  if (/\[YOUR-PASSWORD\]/i.test(u)) throw new Error('Adresteki [YOUR-PASSWORD] yerine veritabanı şifreni yaz');
  stop();
  ensureDb();
  const r = await runChild('growth-export.js', u);
  if (r.code !== 0 || r.error) {
    log.warn('Growth OS canlıya geçiş başarısız: ' + redact(r.error).slice(0, 300));
    await start().catch(() => {});
    throw new Error('Canlıya geçilemedi: ' + redact(r.error || 'bilinmeyen hata').slice(0, 200));
  }
  store.set('growthLive', enc(u));
  log.info('Growth OS canlı veritabanına geçti (Supabase), yerelden gönderilen: ' + JSON.stringify(r.counts));
  await start();
  return { counts: r.counts };
}
/** Yerele dön: Supabase'deki güncel veri yerel dosyaya kopyalanır (önce yedek alınır), sonra sunucu yerelde açılır */
async function goLocal() {
  const u = liveUrl();
  if (!u) return { counts: null };
  stop();
  ensureDb();
  const backup = DB() + '.' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.bak';
  fs.copyFileSync(DB(), backup);
  const r = await runChild('growth-import.js', u);
  if (r.code !== 0 || r.error) {
    fs.copyFileSync(backup, DB());
    log.warn('Growth OS yerele dönüş başarısız, canlı modda kalındı: ' + redact(r.error).slice(0, 300));
    await start().catch(() => {});
    throw new Error('Yerele dönülemedi (canlı modda kalındı): ' + redact(r.error || 'bilinmeyen hata').slice(0, 200));
  }
  store.set('growthLive', null);
  log.info("Growth OS yerel veritabanına döndü, Supabase'den alınan: " + JSON.stringify(r.counts));
  await start();
  return { counts: r.counts, backup };
}
/** Web sürümünün (Vercel) PROFIL_PIN_OZETLERI değeri: yalnızca scrypt özetleri, şifrenin kendisi değil */
const pinDigest = () => JSON.stringify(pinHashes());

function env(p, s, { local = false } = {}) {
  const live = !local && liveUrl();
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(p),
    HOSTNAME: '127.0.0.1',
    APP_URL: `http://127.0.0.1:${p}`,
    DATABASE_URL: live || 'file:' + DB().replace(/\\/g, '/'),
    ...(live ? { ORBIT_DB: 'pg' } : {}),
    AUTH_SECRET: s.authSecret,
    PROFIL_PIN_OZETLERI: JSON.stringify(pinHashes()),
    // Growth OS güvenlik kilidi: onaylı mesajların otomatik gönderimi yalnızca kullanıcı açarsa
    ...(store.get('settings').growthSending ? { WA_SENDING_ENABLED: '1' } : {}),
  };
}

async function waitReady(p, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!proc) throw new Error('Growth OS sunucusu başlarken kapandı');
    try { const r = await fetch(`http://127.0.0.1:${p}/api/profil`, { signal: AbortSignal.timeout(2000) }); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Growth OS sunucusu 60 sn içinde açılmadı');
}

/** Sunucuyu başlatır (zaten çalışıyorsa adresini döndürür) */
function start() {
  if (proc && port) return Promise.resolve(url());
  if (starting) return starting;
  starting = (async () => {
    ensureDb();
    const s = secrets();
    const p = await freePort();
    // orbit-db.js: canlı modda PostgreSQL istemcisini seçip server.js'i başlatır (yerel modda doğrudan başlatır)
    const child = spawn(process.execPath, [fs.existsSync(path.join(ROOT(), 'orbit-db.js')) ? 'orbit-db.js' : 'server.js'], { cwd: ROOT(), env: env(p, s), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    proc = child; port = p;
    const tail = [];
    const keep = (d) => { for (const l of String(d).split(/\r?\n/).filter(Boolean)) { tail.push(l); if (tail.length > 30) tail.shift(); } };
    child.stdout.on('data', keep);
    child.stderr.on('data', (d) => { keep(d); log.warn('[growth] ' + String(d).trim().slice(0, 400)); });
    child.on('exit', (code) => {
      if (proc === child) { proc = null; port = null; }
      if (code) log.warn(`Growth OS sunucusu kapandı (kod ${code}): ${tail.slice(-3).join(' | ')}`);
    });
    try { await waitReady(p); } catch (e) { stop(); throw e; }
    log.info(`Growth OS ${isLive() ? 'sunucusu (canlı veritabanı: Supabase)' : 'yerel sunucusu'} açıldı: 127.0.0.1:${p}`);
    return url();
  })().finally(() => { starting = null; });
  return starting;
}

function stop() {
  if (proc) { try { proc.kill(); } catch {} }
  proc = null; port = null;
}

const url = () => (port ? `http://127.0.0.1:${port}` : null);

/**
 * Eski Growth OS (PostgreSQL / Supabase) verilerini bir kerelik yerel veritabanına taşır.
 * Bağlantı adresi kaydedilmez ve loglanmaz. Mevcut yerel veriler silinip yerine aktarılır.
 */
async function importFrom(databaseUrl) {
  if (isLive()) throw new Error("Canlı moddayken veri taşınmaz: veriler zaten Supabase'den okunuyor");
  if (!/^postgres(ql)?:\/\/[^\s]+$/i.test(String(databaseUrl || '').trim())) throw new Error('Geçerli bir PostgreSQL bağlantı adresi girin (postgresql://…)');
  stop();
  ensureDb();
  const backup = DB() + '.' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.bak';
  fs.copyFileSync(DB(), backup);
  const s = secrets();
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'growth-import.js')], {
      cwd: ROOT(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...env(0, s), ORBIT_PG: require.resolve('pg'), GROWTH_ROOT: ROOT() },
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => {
      const last = out.trim().split(/\r?\n/).pop() || '{}';
      try { resolve({ code, ...JSON.parse(last) }); } catch { resolve({ code, error: (err || out).slice(-400) }); }
    });
    child.stdin.end(String(databaseUrl).trim()); // adres ortam değişkeni değil stdin ile verilir
  });
  if (result.code !== 0 || result.error) {
    fs.copyFileSync(backup, DB());
    log.warn('Growth OS veri taşıma başarısız, yerel veritabanı geri yüklendi: ' + String(result.error || '').replace(/postgres(ql)?:\/\/\S+/gi, '[adres]').slice(0, 300));
    await start().catch(() => {});
    throw new Error('Taşıma başarısız: ' + String(result.error || 'bilinmeyen hata').replace(/postgres(ql)?:\/\/\S+/gi, '[adres]').slice(0, 200));
  }
  log.info('Growth OS verileri taşındı: ' + JSON.stringify(result.counts));
  await start();
  return { counts: result.counts, backup };
}

module.exports = { start, stop, url, secrets, importFrom, hasPin, setPin, isLive, liveUrl, goLive, goLocal, pinDigest, DB, ROOT, TENANTS };
