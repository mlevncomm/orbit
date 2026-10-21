// Growth OS istemcisi: Orbit'in Wexon sayfası, Orbit'in İÇİNDE çalışan Growth OS sunucusunu kullanır
// (growth-server.js → 127.0.0.1). Dışarıdaki bir sunucuya / Vercel'e bağlanılmaz.
//
// Güvenlik:
// - İstekler yalnızca ana süreçten gider; oturum çerezleri arayüze HİÇ verilmez ve yalnızca bellekte tutulur.
// - Profiller kullanıcının belirlediği şifreyle (PIN) açılır; doğrulama ve kilitleme Growth OS sunucusundadır.
const store = require('./store');
const log = require('./log');

const server = require('../growth-server');
const COOKIES = ['wexon_admin', 'wexon_profil'];
let jar = {};          // çerez adı → değer (yalnızca bellekte)
let profileName = null;

async function call(method, route, body) {
  if (!/^\/api\/[\w/\-[\]?=&.%]+$/.test(route)) throw new Error('Geçersiz istek');
  const base = await server.start();
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(base + route, {
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

const status = () => ({ connected: !!jar.wexon_admin && !!jar.wexon_profil, profile: profileName, local: !server.isLive(), live: server.isLive(), running: !!server.url() });

async function profiles() {
  const r = await call('GET', '/api/profil');
  return (r.profiller || []).map((p) => ({ pinSet: server.hasPin(p.tenantId), lockedUntil: p.kilitBitis, ...({ tenantId: p.tenantId, name: p.ad, desc: p.aciklama, field: p.alan, letter: p.harf, color: p.renk, accent: p.vurgu, lastOpened: p.sonAcilis }) }));
}

async function open(tenantId, pin) {
  if (!/^tnt_[\w-]+$/.test(String(tenantId))) throw new Error('Geçersiz profil');
  if (!/^\d{4,8}$/.test(String(pin || ''))) throw new Error('Şifre 4-8 rakam olmalı');
  jar = {};
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

// ---------- Ayarlar ve WhatsApp Web ----------
const settings = () => call('GET', '/api/settings');
function saveSettings(p) {
  const allow = ['googlePlacesApiKey', 'llmApiKey', 'llmModel', 'dailyCap', 'delayMinSec', 'delayMaxSec'];
  const body = {};
  for (const k of allow) if (p[k] !== undefined && p[k] !== '') body[k] = typeof p[k] === 'string' ? p[k].trim().slice(0, 300) : p[k];
  return call('PUT', '/api/settings', body);
}
const whatsapp = () => call('GET', '/api/whatsapp');
function whatsappAction(action) {
  if (!['connect', 'disconnect'].includes(action)) throw new Error('Geçersiz işlem');
  return call('POST', '/api/whatsapp', { action });
}
// ---------- Müşteriye mesaj (WhatsApp penceresi) ----------
const ID = /^[\w-]{6,40}$/;
const CATS = ['ilk_temas', 'otomasyon', 'bakim', 'huni', 'takip', 'ilgili', 'fiyat', 'itiraz', 'kapanis'];
function message(id) {
  if (!ID.test(String(id))) throw new Error('Geçersiz kayıt');
  return call('GET', `/api/leads/${id}/mesaj`);
}
function messageAction(id, b) {
  if (!ID.test(String(id))) throw new Error('Geçersiz kayıt');
  if (!['generate', 'refine', 'record'].includes(b.action)) throw new Error('Geçersiz işlem');
  if (!CATS.includes(b.category)) throw new Error('Mesaj türü geçersiz');
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
  return call('POST', `/api/leads/${id}/mesaj`, {
    action: b.action, category: b.category, senderName: s(b.senderName, 60), designLink: s(b.designLink, 300), customerReply: s(b.customerReply, 1500),
    mode: s(b.mode, 20), style: s(b.style, 20), message: s(b.message, 1500), phone: s(b.phone, 30),
  });
}
function deleteLead(id) {
  if (!ID.test(String(id))) throw new Error('Geçersiz kayıt');
  return call('DELETE', `/api/leads/${id}`);
}
// ---------- Şablonlar ----------
const templates = () => call('GET', '/api/templates');
function saveTemplate(t) {
  const body = { name: String(t.name || '').trim().slice(0, 80), body: String(t.body || '').slice(0, 2000) };
  if (!body.name || !body.body.trim()) throw new Error('Şablon adı ve metni gerekli');
  if (t.id) { if (!ID.test(String(t.id))) throw new Error('Geçersiz şablon'); return call('PATCH', `/api/templates/${t.id}`, body); }
  return call('POST', '/api/templates', body);
}
function deleteTemplate(id) {
  if (!ID.test(String(id))) throw new Error('Geçersiz şablon');
  return call('DELETE', `/api/templates/${id}`);
}
// ---------- Keşif ve kuyruk kontrolü ----------
function stopCampaign(id) {
  if (!ID.test(String(id))) throw new Error('Geçersiz keşif');
  return call('PATCH', `/api/campaigns/${id}`, { action: 'stop' });
}
function queueControl(action) {
  if (!['pause', 'resume', 'stop'].includes(action)) throw new Error('Geçersiz işlem');
  return call('POST', '/api/outreach/control', { action });
}
/** Müşteri listesini Excel olarak döndürür (Buffer) */
async function exportLeads({ q = '', status: st = '' } = {}) {
  const base = await server.start();
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(`${base}/api/leads/export?q=${encodeURIComponent(String(q).slice(0, 80))}&status=${encodeURIComponent(String(st).slice(0, 30))}`, { headers: { cookie } });
  if (!res.ok) throw new Error(`Dışa aktarılamadı (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Otomatik gönderim kilidini aç / kapat: sunucu yeni ayarla yeniden başlar */
async function setSending(on) {
  store.patch('settings', { growthSending: !!on });
  server.stop(); jar = {}; profileName = null;
  await server.start();
  log.info(`Growth OS otomatik WhatsApp gönderimi ${on ? 'açıldı' : 'kapatıldı'}`);
  return { sending: !!on };
}

/** Canlı veritabanına (Supabase) geç / yerele dön: veri taşındıktan sonra profil yeniden açılır */
async function goLive(url) { const r = await server.goLive(url); jar = {}; profileName = null; return r; }
async function goLocal() { const r = await server.goLocal(); jar = {}; profileName = null; return r; }

async function importData(url) {
  const r = await server.importFrom(url);
  jar = {}; profileName = null; // taşınan veriyle oturum yeniden açılır
  return r;
}

module.exports = { status, profiles, open, lock, overview, leads, updateLead, campaigns, startCampaign, queue, draft, moderate, settings, saveSettings, whatsapp, whatsappAction, importData, goLive, goLocal, pinDigest: () => server.pinDigest(), setSending, message, messageAction, deleteLead, templates, saveTemplate, deleteTemplate, stopCampaign, queueControl, exportLeads,
  setPin: (t, pin, cur) => server.setPin(t, pin, cur).then(() => { jar = {}; profileName = null; return true; }), sending: () => !!store.get('settings').growthSending, _jar: () => jar };
