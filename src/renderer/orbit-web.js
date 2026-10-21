// Orbit web köprüsü (orbit.wexon.dev): masaüstündeki window.orbit (preload.js) yerine geçer.
// Aynı Orbit arayüzü tarayıcıda çalışır:
// - Satış ekranları (growth.*) aynı sitenin /api uçlarına gider (çerezleri tarayıcı yönetir).
// - Diğer her şey (kurulum, ışıklar, ESP32, site klonlayıcı, asistan, ayarlar...) bilgisayardaki Orbit'te çalışır
//   (uzaktan yönetim; aşağıda). Bilgisayar kapalıysa yalnızca satış ekranları açılır.
(() => {
  const DESKTOP = 'Bu işlem yalnızca masaüstü Orbit\'te yapılır';
  const desktopOnly = () => Promise.reject(new Error(DESKTOP));
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let profileName = null;
  async function call(method, route, body) {
    if (!/^\/api\/[\w/\-[\]?=&.%]+$/.test(route)) throw new Error('Geçersiz istek');
    const res = await fetch(route, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.status === 401) profileName = null;
    if (!res.ok) {
      const err = new Error(data?.error || (res.status === 403 ? 'Oturum süresi doldu, sayfayı yenileyin' : `Sunucu yanıtı: HTTP ${res.status}`));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  const ID = /^[\w-]{6,40}$/;
  const CATS = ['ilk_temas', 'otomasyon', 'bakim', 'huni', 'takip', 'ilgili', 'fiyat', 'itiraz', 'kapanis'];
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };

  const growth = {
    async status() {
      try {
        const me = await call('GET', '/api/me');
        profileName = me.tenantName || profileName;
        return { connected: true, profile: profileName, local: false, live: true, web: true, running: true };
      } catch {
        return { connected: false, profile: null, local: false, live: true, web: true, running: true };
      }
    },
    async profiles() {
      const r = await call('GET', '/api/profil');
      return (r.profiller || []).map((p) => ({ pinSet: Boolean(p.sifreAyarli), lockedUntil: p.kilitBitis, tenantId: p.tenantId, name: p.ad, desc: p.aciklama, field: p.alan, letter: p.harf, color: p.renk, accent: p.vurgu, lastOpened: p.sonAcilis }));
    },
    async open(tenantId, pin) {
      need(/^tnt_[\w-]+$/.test(String(tenantId)), 'Geçersiz profil');
      need(/^\d{4,8}$/.test(String(pin || '')), 'Şifre 4-8 rakam olmalı');
      const r = await call('POST', '/api/profil', { tenantId, pin: String(pin) });
      profileName = r.profil || null;
      return growth.status();
    },
    async lock() { try { await call('DELETE', '/api/profil'); } catch {} profileName = null; return growth.status(); },
    async overview() {
      const [me, leads, queue, campaigns] = await Promise.all([
        call('GET', '/api/me'), call('GET', '/api/leads?lite=1&take=400'), call('GET', '/api/outreach'), call('GET', '/api/campaigns'),
      ]);
      const byStatus = {};
      for (const l of leads) byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      return {
        tenantName: me.tenantName, email: me.email, vertical: me.vertical, leads: leads.length, byStatus,
        pending: queue.pending ?? (queue.pendingJobs || []).length, queued: queue.queued, sentToday: queue.sentToday, failed: queue.failed,
        dailyCap: queue.dailyCap, paused: queue.paused, stopped: queue.stopped, sendingLocked: queue.sendingLocked,
        campaigns, recentLeads: leads.slice(0, 8),
      };
    },
    leads: ({ q = '', status = '', take = 150 } = {}) =>
      call('GET', `/api/leads?take=${Math.min(400, +take || 150)}${q ? '&q=' + encodeURIComponent(String(q).slice(0, 80)) : ''}${status ? '&status=' + encodeURIComponent(status) : ''}`),
    lead(id, patch = {}) {
      need(ID.test(String(id)), 'Geçersiz kayıt');
      const body = {};
      if (patch.status) body.status = String(patch.status);
      if (typeof patch.notes === 'string') body.notes = patch.notes.slice(0, 2000);
      return call('PATCH', `/api/leads/${id}`, body);
    },
    campaigns: () => call('GET', '/api/campaigns'),
    campaign(o = {}) {
      const body = {
        query: String(o.query || '').trim().slice(0, 120), city: String(o.city || '').trim().slice(0, 80), district: String(o.district || '').trim().slice(0, 80),
        scope: 'city', targetCount: Math.min(60, Math.max(1, +o.targetCount || 20)), minRating: Math.min(5, Math.max(0, +o.minRating || 0)),
        requirePhone: o.requirePhone !== false, websiteFilter: ['with', 'without'].includes(o.websiteFilter) ? o.websiteFilter : 'any',
      };
      need(body.query && body.city, 'Arama kelimesi ve şehir gerekli');
      return call('POST', '/api/campaigns', body);
    },
    queue: () => call('GET', '/api/outreach'),
    draft(ids) {
      const list = (ids || []).filter((x) => ID.test(String(x))).slice(0, 50);
      need(list.length, 'Müşteri seçilmedi');
      return call('POST', '/api/outreach', { leadIds: list, templateId: 'auto' });
    },
    moderate(ids, action, message) {
      need(['approve', 'reject', 'edit'].includes(action), 'Geçersiz işlem');
      const list = (ids || []).filter((x) => ID.test(String(x))).slice(0, 50);
      need(list.length, 'İş seçilmedi');
      return call('POST', '/api/outreach/approve', { ids: list, action, ...(action === 'edit' ? { message: String(message || '').slice(0, 4000) } : {}) });
    },
    settings: () => call('GET', '/api/settings'),
    saveSettings(p = {}) {
      const body = {};
      for (const k of ['googlePlacesApiKey', 'llmApiKey', 'llmModel', 'dailyCap', 'delayMinSec', 'delayMaxSec']) if (p[k] !== undefined && p[k] !== '') body[k] = typeof p[k] === 'string' ? p[k].trim().slice(0, 300) : p[k];
      return call('PUT', '/api/settings', body);
    },
    whatsapp: () => call('GET', '/api/whatsapp'),
    whatsappAction: desktopOnly,
    message(id) { need(ID.test(String(id)), 'Geçersiz kayıt'); return call('GET', `/api/leads/${id}/mesaj`); },
    messageAction(id, b = {}) {
      need(ID.test(String(id)), 'Geçersiz kayıt');
      need(['generate', 'refine', 'record'].includes(b.action), 'Geçersiz işlem');
      need(CATS.includes(b.category), 'Mesaj türü geçersiz');
      const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
      return call('POST', `/api/leads/${id}/mesaj`, {
        action: b.action, category: b.category, senderName: s(b.senderName, 60), designLink: s(b.designLink, 300), customerReply: s(b.customerReply, 1500),
        mode: s(b.mode, 20), style: s(b.style, 20), message: s(b.message, 1500), phone: s(b.phone, 30),
      });
    },
    deleteLead(id) { need(ID.test(String(id)), 'Geçersiz kayıt'); return call('DELETE', `/api/leads/${id}`); },
    templates: () => call('GET', '/api/templates'),
    saveTemplate(t = {}) {
      const body = { name: String(t.name || '').trim().slice(0, 80), body: String(t.body || '').slice(0, 2000) };
      need(body.name && body.body.trim(), 'Şablon adı ve metni gerekli');
      if (t.id) { need(ID.test(String(t.id)), 'Geçersiz şablon'); return call('PATCH', `/api/templates/${t.id}`, body); }
      return call('POST', '/api/templates', body);
    },
    deleteTemplate(id) { need(ID.test(String(id)), 'Geçersiz şablon'); return call('DELETE', `/api/templates/${id}`); },
    stopCampaign(id) { need(ID.test(String(id)), 'Geçersiz keşif'); return call('PATCH', `/api/campaigns/${id}`, { action: 'stop' }); },
    queueControl(action) { need(['pause', 'resume', 'stop'].includes(action), 'Geçersiz işlem'); return call('POST', '/api/outreach/control', { action }); },
    /** Excel dosyasını tarayıcıda indirir */
    async exportLeads({ q = '', status = '' } = {}) {
      const res = await fetch(`/api/leads/export?q=${encodeURIComponent(String(q).slice(0, 80))}&status=${encodeURIComponent(String(status).slice(0, 30))}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Dışa aktarılamadı (HTTP ${res.status})`);
      const name = `musteriler-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return name;
    },
    /** WhatsApp'ı hazır mesajla yeni sekmede açar (telefonda uygulama, bilgisayarda WhatsApp Web) */
    async openWhatsApp(digits, text) {
      need(/^\d{8,15}$/.test(String(digits)), 'Geçersiz WhatsApp numarası');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(String(text || '').slice(0, 1500))}`, '_blank', 'noopener');
      return 'web';
    },
    sending: (on) => (on === undefined ? Promise.resolve(false) : desktopOnly()),
    setPin: desktopOnly, importData: desktopOnly, goLive: desktopOnly, goLocal: desktopOnly, copyPinDigest: desktopOnly,
  };
  for (const [k, f] of Object.entries(growth)) growth[k] = (...a) => { try { return Promise.resolve(f(...a)); } catch (e) { return Promise.reject(e); } };

  // ---------- Uzaktan yönetim: bilgisayardaki Orbit ----------
  // Masaüstünün preload.js'i (orbit-preload.js) burada AYNEN çalışır; yalnızca ipcRenderer'ı bu köprü sağlar:
  // invoke → /api/orbit/call (komut Supabase üzerinden bilgisayardaki Orbit'e gider), on → /api/orbit/events.
  const remote = { online: false, pc: null, version: null, last: null, listeners: new Map(), timer: null };
  async function poll() {
    try {
      const q = remote.last === null ? '' : `?after=${remote.last}`;
      const r = await fetch(`/api/orbit/events${q}`, { credentials: 'same-origin', cache: 'no-store' }).then((x) => x.json());
      remote.online = Boolean(r.state?.online); remote.pc = r.state?.pc || null; remote.version = r.state?.version || null;
      remote.last = r.last ?? remote.last;
      for (const e of r.events || []) for (const fn of remote.listeners.get(e.channel) || []) { try { fn(null, e.payload); } catch {} }
    } catch {}
  }
  const startPolling = () => {
    if (remote.timer) return;
    remote.timer = setInterval(() => { if (document.visibilityState === 'visible') poll(); }, 1500);
  };
  const ipcRenderer = {
    async invoke(channel, ...args) {
      if (/^growth:/.test(channel)) return { ok: false, error: 'İç hata: satış istekleri web sunucusuna gider' };
      try {
        const res = await fetch('/api/orbit/call', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, args }) });
        const j = await res.json().catch(() => ({}));
        if (res.status === 503) remote.online = false;
        return res.ok ? { ok: true, data: j.data } : { ok: false, error: j.error || `Bilgisayara ulaşılamadı (HTTP ${res.status})` };
      } catch (e) {
        return { ok: false, error: 'Bilgisayara ulaşılamadı' };
      }
    },
    on(channel, fn) { if (!remote.listeners.has(channel)) remote.listeners.set(channel, new Set()); remote.listeners.get(channel).add(fn); },
    removeListener(channel, fn) { remote.listeners.get(channel)?.delete(fn); },
    send() {}, // günlük ve tepsi bildirimleri yalnızca masaüstünde
  };

  const DEFAULTS = { theme: 'dark', userName: '' };
  // Bilgisayar kapalıyken: tema / arayüz durumu bu tarayıcıda tutulur, yalnızca satış ekranları açılır
  const offline = {
    settings: {
      get: async () => ({ ...DEFAULTS, ...read('orbit.settings', {}) }),
      set: async (p) => { const v = { ...DEFAULTS, ...read('orbit.settings', {}), ...p }; write('orbit.settings', v); return v; },
    },
    ui: {
      get: async () => read('orbit.ui', {}),
      set: async (p) => { write('orbit.ui', { ...read('orbit.ui', {}), ...p }); return true; },
    },
    app: { log: () => {}, openLogs: desktopOnly },
    update: { status: async () => ({ current: 'web', state: 'idle' }), onStatus: () => () => {}, check: desktopOnly, download: desktopOnly, install: desktopOnly },
  };
  const stub = new Proxy({}, { get: (_, k) => (typeof k === 'string' && /^on[A-Z]/.test(k) ? () => () => {} : desktopOnly) });

  let desktop = {};
  const web = {
    web: true,
    growth,
    /** Bilgisayardaki Orbit çevrimiçi mi? Açılışta bir kez sorulur, sonra olaylar izlenir */
    async remoteCheck() { await poll(); startPolling(); return remote.online; },
    remoteInfo: () => ({ online: remote.online, pc: remote.pc, version: remote.version }),
  };
  window.__orbitElectron = {
    ipcRenderer,
    contextBridge: { exposeInMainWorld: (_name, api) => { desktop = api; } },
  };
  window.orbit = new Proxy({}, {
    get(_, k) {
      if (k in web) return web[k];
      if (!remote.online && k in offline) return offline[k];
      if (k in desktop) return desktop[k];
      return typeof k === 'string' && /^on[A-Z]/.test(k) ? () => () => {} : stub;
    },
  });
})();
