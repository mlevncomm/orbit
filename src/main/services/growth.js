// Wexon Growth OS istemcisi: Orbit'in Wexon sayfası Growth OS sunucusunun API'sini kullanır.
// Veri ve iş mantığı (müşteriler, keşif, WhatsApp kuyruğu) sunucuda kalır; arayüz Orbit'tedir.
//
// Güvenlik:
// - İstekler yalnızca ana süreçten gider; oturum çerezleri arayüze HİÇ verilmez.
// - Oturum profil (Wexon.dev / Aquails) + PIN ile açılır, yalnızca BELLEKTE tutulur (diske yazılmaz):
//   Growth OS masaüstü programında olduğu gibi Orbit her açıldığında PIN yeniden istenir.
// - Sunucu adresi yalnızca https olabilir.
const store = require('./store');
const log = require('./log');

const DEFAULT_URL = 'https://wexon-growth-os.vercel.app';
const COOKIES = ['wexon_admin', 'wexon_profil'];
let jar = {};          // çerez adı → değer (yalnızca bellekte)
let profileName = null;

function base() {
  const u = String(store.get('settings').growthUrl || DEFAULT_URL).replace(/\/+$/, '');
  if (!/^https:\/\/[\w.-]+(:\d+)?$/i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u)) throw new Error('Growth OS adresi https olmalı');
  return u;
}

async function call(method, route, body) {
  if (!/^\/api\/[\w/\-[\]?=&.%]+$/.test(route)) throw new Error('Geçersiz istek');
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(base() + route, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(cookie ? { cookie } : {}), 'user-agent': 'Orbit (wexon.dev)' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  // Set-Cookie: yalnızca bilinen oturum çerezleri alınır
  for (const sc of res.headers.getSetCookie?.() || []) {
    const [pair, ...attrs] = sc.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim(); const value = pair.slice(i + 1).trim();
    if (!COOKIES.includes(name)) continue;
    const expired = attrs.some((a) => /max-age\s*=\s*0\b/i.test(a)) || !value;
    if (expired) delete jar[name]; else jar[name] = value;
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401) { jar = {}; profileName = null; }
  if (!res.ok) {
    const err = new Error(data?.error || `Growth OS yanıtı: HTTP ${res.status}`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

const status = () => ({ connected: !!jar.wexon_admin && !!jar.wexon_profil, profile: profileName, url: (() => { try { return base(); } catch { return null; } })() });

async function profiles() {
  const r = await call('GET', '/api/profil');
  return (r.profiller || []).map((p) => ({ tenantId: p.tenantId, name: p.ad, desc: p.aciklama, field: p.alan, letter: p.harf, color: p.renk, accent: p.vurgu, pinLength: p.pinUzunluk, pinSet: p.sifreAyarli, lockedUntil: p.kilitBitis, lastOpened: p.sonAcilis }));
}

async function open(tenantId, pin) {
  if (!/^tnt_[\w-]+$/.test(String(tenantId))) throw new Error('Geçersiz profil');
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN 4-8 rakam olmalı');
  const r = await call('POST', '/api/profil', { tenantId, pin: String(pin) });
  profileName = r.profil || null;
  log.info(`Growth OS profili açıldı: ${profileName}`);
  return status();
}

async function lock() {
  try { await call('DELETE', '/api/profil'); } catch {}
  jar = {}; profileName = null;
  return status();
}

/** Özet: işletme bilgisi, müşteri sayıları, kuyruk durumu, son keşifler */
async function overview() {
  const [me, leads, queue, campaigns] = await Promise.all([
    call('GET', '/api/me'),
    call('GET', '/api/leads?lite=1&take=400'),
    call('GET', '/api/outreach'),
    call('GET', '/api/campaigns'),
  ]);
  const byStatus = {};
  for (const l of leads) byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  const summary = {
    tenantName: me.tenantName, email: me.email, vertical: me.vertical,
    leads: leads.length, byStatus,
    pending: queue.pending ?? (queue.pendingJobs || []).length, queued: queue.queued, sentToday: queue.sentToday, failed: queue.failed,
    dailyCap: queue.dailyCap, paused: queue.paused, stopped: queue.stopped, sendingLocked: queue.sendingLocked,
    campaigns, recentLeads: leads.slice(0, 8),
  };
  try { require('./memory').noteGrowth(summary); } catch {}
  return summary;
}

const leads = ({ q = '', status: st = '', take = 150 } = {}) =>
  call('GET', `/api/leads?take=${Math.min(400, +take || 150)}${q ? '&q=' + encodeURIComponent(String(q).slice(0, 80)) : ''}${st ? '&status=' + encodeURIComponent(st) : ''}`);

function updateLead(id, patch) {
  if (!/^[\w-]{6,40}$/.test(String(id))) throw new Error('Geçersiz kayıt');
  const body = {};
  if (patch.status) body.status = String(patch.status);
  if (typeof patch.notes === 'string') body.notes = patch.notes.slice(0, 2000);
  return call('PATCH', `/api/leads/${id}`, body);
}

const campaigns = () => call('GET', '/api/campaigns');
function startCampaign(o) {
  const body = {
    query: String(o.query || '').trim().slice(0, 120),
    city: String(o.city || '').trim().slice(0, 80),
    district: String(o.district || '').trim().slice(0, 80),
    scope: 'city',
    targetCount: Math.min(60, Math.max(1, +o.targetCount || 20)),
    minRating: Math.min(5, Math.max(0, +o.minRating || 0)),
    requirePhone: o.requirePhone !== false,
    websiteFilter: ['with', 'without'].includes(o.websiteFilter) ? o.websiteFilter : 'any',
  };
  if (!body.query || !body.city) throw new Error('Arama kelimesi ve şehir gerekli');
  return call('POST', '/api/campaigns', body);
}

const queue = () => call('GET', '/api/outreach');
/** Seçili müşteriler için WhatsApp taslakları (onay kuyruğuna düşer, kendiliğinden gönderilmez) */
function draft(leadIds) {
  const ids = (leadIds || []).filter((x) => /^[\w-]{6,40}$/.test(String(x))).slice(0, 50);
  if (!ids.length) throw new Error('Müşteri seçilmedi');
  return call('POST', '/api/outreach', { leadIds: ids, templateId: 'auto' });
}
function moderate(ids, action, message) {
  if (!['approve', 'reject', 'edit'].includes(action)) throw new Error('Geçersiz işlem');
  const list = (ids || []).filter((x) => /^[\w-]{6,40}$/.test(String(x))).slice(0, 50);
  if (!list.length) throw new Error('İş seçilmedi');
  return call('POST', '/api/outreach/approve', { ids: list, action, ...(action === 'edit' ? { message: String(message || '').slice(0, 4000) } : {}) });
}

module.exports = { status, profiles, open, lock, overview, leads, updateLead, campaigns, startCampaign, queue, draft, moderate, DEFAULT_URL, _jar: () => jar };
