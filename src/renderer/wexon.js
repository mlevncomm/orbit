/* Wexon sayfası — Growth OS (Orbit tasarımıyla) + Site İndirici. app.js'deki S, I, h, $, toast, renderPage, saveUi kullanır. */
const W = {
  status: null, profiles: null, pick: null, pin: '', tab: 'ozet', busy: false, err: '',
  overview: null, leads: null, q: '', st: '', sel: new Set(), queue: null, campaigns: null, edits: {},
  site: { status: null, history: [], url: '', maxPages: 30, maxDepth: 3, robots: true, zip: true, render: true, scripts: 'strip', authorized: false },
  timer: null,
};
const LEAD_STATUSES = [['yeni', 'Yeni'], ['yazildi', 'Yazıldı'], ['donus_var', 'Dönüş var'], ['geri_ara', 'Geri aranacak'], ['ulasilamadi', 'Açmadı'], ['ilgilenmiyor', 'İlgilenmiyor']];
const stLabel = (v) => (LEAD_STATUSES.find((x) => x[0] === v) || [v, v])[1];
const CAMP = { queued: 'Sırada', running: 'Aranıyor…', done: 'Bitti', error: 'Hata', stopped: 'Durduruldu', idle: 'Bekliyor' };
const fmtMB = (b) => (b / 1048576).toFixed(1) + ' MB';

async function wx(fn, after) {
  W.busy = true; W.err = '';
  try { const r = await fn(); if (after) after(r); } catch (e) { W.err = e.message; if (/Giriş gerekli|401/.test(e.message)) { W.status = await api.growth.status(); } toast(e.message, true); }
  W.busy = false;
  if (S.page === 'wexon') renderPage();
}

/** Wexon alt görünümünü seç (sol menüden) */
function wxTab(tab) {
  if (W.tab === tab) return;
  W.tab = tab; W.err = ''; saveUi({ wexonTab: tab });
  if (W.loaded) W.loaded[tab] = false;
}

async function wxLoad(tab = W.tab) {
  if (tab === 'site') {
    W.site.status = await api.site.status().catch(() => null);
    W.site.history = await api.site.history().catch(() => []);
    return renderPage();
  }
  if (!W.status?.connected) return;
  if (tab === 'ozet') return wx(() => api.growth.overview(), (r) => (W.overview = r));
  if (tab === 'musteriler') return wx(() => api.growth.leads({ q: W.q, status: W.st, take: 300 }), (r) => (W.leads = r));
  if (tab === 'bul') return wx(() => api.growth.campaigns(), (r) => (W.campaigns = r));
  if (tab === 'whatsapp') return wx(() => api.growth.queue(), (r) => (W.queue = r));
  if (tab === 'ayarlar') return wx(async () => [await api.growth.settings(), await api.growth.whatsapp(), await api.growth.sending()], ([st, wa, snd]) => { W.settings = st; W.wa = wa; W.sending = snd; });
}

PAGES.wexon = () => {
  const tabs = [['ozet', 'grid', 'Özet'], ['musteriler', 'users', 'Müşteriler'], ['bul', 'mappin', 'Müşteri Bul'], ['whatsapp', 'message', 'WhatsApp'], ['site', 'globe', 'Site İndirici']];
  const connected = W.status?.connected;
  const title = { ayarlar: ['Ayarlar ve WhatsApp', 'Growth OS anahtarları, gönderim sınırları ve WhatsApp Web bağlantısı'], ozet: ['Growth OS', 'wexon.dev müşteri ve satış merkezi'], musteriler: ['Müşteriler', 'Growth OS müşteri listesi'], bul: ['Müşteri Bul', 'Google Places ile yeni işletme keşfi'], whatsapp: ['WhatsApp', 'Onay bekleyen satış mesajları'], site: ['Site Klonlayıcı', 'wexon.dev web stüdyosu · bir siteyi birebir kopyala'] }[W.tab] || ['Wexon', ''];
  const head = `<div class="page-head"><div><h1>${title[0]}</h1><p>${title[1]}</p></div>
    <div class="row">${connected && W.tab !== 'site' ? `<span class="chip"><span class="status-dot done"></span>${h(W.status.profile || 'Profil açık')}</span><button class="btn" data-wx="lock">${I('lock')}Kilitle</button>` : ''}</div></div>`;

  if (W.tab === 'site') return head + siteView();
  if (!W.status) { api.growth.status().then((s) => { W.status = s; renderPage(); }); return head + `<div class="card empty"><span class="spinner"></span></div>`; }
  if (!connected) return head + loginView();
  if (W.tab === 'ozet') return head + overviewView();
  if (W.tab === 'musteriler') return head + leadsView();
  if (W.tab === 'bul') return head + findView();
  if (W.tab === 'whatsapp') return head + queueView();
  if (W.tab === 'ayarlar') return head + settingsView();
  return head;
};

PAGES.wexonAfter = () => {
  clearInterval(W.timer);
  const sf2 = $('#wxSettings');
  if (sf2) sf2.addEventListener('submit', (e) => {
    e.preventDefault();
    const o = Object.fromEntries(new FormData(sf2).entries());
    for (const k of ['dailyCap', 'delayMinSec', 'delayMaxSec']) if (o[k] !== '') o[k] = +o[k];
    wx(() => api.growth.saveSettings(o), (r) => { W.settings = r; toast('Growth OS ayarları kaydedildi'); });
  });
  const imp = $('#wxImport');
  if (imp) imp.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('#wxImportUrl').value.trim();
    if (!confirm('Eski Growth OS verileri bu bilgisayara taşınsın mı?\n\nOrbit\'teki mevcut Growth OS verileri silinip yerine aktarılır (önce yedeği alınır). Bağlantı adresi kaydedilmez.')) return;
    W.importing = true; renderPage();
    api.growth.importData(url).then((r) => {
      W.importResult = r; W.status = { connected: false }; W.profiles = null; W.loaded = {}; W.overview = null;
      toast(`Taşındı: ${r.counts.Lead || 0} müşteri, ${r.counts.Campaign || 0} keşif, ${r.counts.OutreachJob || 0} mesaj`);
    }).catch((err) => toast(err.message, true)).finally(() => { W.importing = false; renderPage(); });
  });
  // WhatsApp Web QR beklenirken durumu yenile
  if (W.tab === 'ayarlar' && ['starting', 'qr'].includes(W.wa?.local?.state)) W.timer = setInterval(() => (S.page === 'wexon' && W.tab === 'ayarlar') ? api.growth.whatsapp().then((r) => { W.wa = r; renderPage(); }).catch(() => {}) : clearInterval(W.timer), 2500);
  const q = $('#wxQ');
  if (q) q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { W.q = q.value; wxLoad('musteriler'); } });
  const f = $('#wxFind');
  if (f) f.addEventListener('submit', (e) => {
    e.preventDefault();
    const o = Object.fromEntries(new FormData(f).entries());
    wx(() => api.growth.campaign(o), () => { toast('Keşif başladı; bulunan işletmeler Müşteriler listesine düşecek'); wxLoad('bul'); });
  });
  const sf = $('#wxSite');
  if (sf) sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(sf);
    W.site.url = fd.get('url'); W.site.maxPages = +fd.get('maxPages'); W.site.maxDepth = +fd.get('maxDepth');
    W.site.robots = !!fd.get('robots'); W.site.zip = !!fd.get('zip');
    W.site.render = fd.get('mode') !== 'fast'; W.site.scripts = fd.get('scripts') ? 'keep' : 'strip'; W.site.authorized = !!fd.get('authorized');
    if (!W.site.authorized) { toast('Önce sitenin sana ait olduğunu ya da izin aldığını onayla', true); return renderPage(); }
    try { W.site.status = await api.site.start(W.site.url, { maxPages: W.site.maxPages, maxDepth: W.site.maxDepth, robots: W.site.robots, zip: W.site.zip, render: W.site.render, scripts: W.site.scripts, authorized: true }); } catch (err) { toast(err.message, true); }
    renderPage();
  });
  document.querySelectorAll('[data-wx-edit]').forEach((el) => el.addEventListener('input', () => (W.edits[el.dataset.wxEdit] = el.value)));
  // Devam eden keşif varken listeyi yenile
  if (W.tab === 'bul' && (W.campaigns || []).some((c) => ['queued', 'running'].includes(c.status))) W.timer = setInterval(() => S.page === 'wexon' && W.tab === 'bul' ? api.growth.campaigns().then((r) => { W.campaigns = r; renderPage(); }).catch(() => {}) : clearInterval(W.timer), 5000);
  if (!W.loaded?.[W.tab]) { W.loaded = { ...(W.loaded || {}), [W.tab]: true }; wxLoad(); }
};

function wxOpen(tenantId) {
  wx(() => api.growth.open(tenantId), async (st) => {
    W.status = st; W.pick = null; W.loaded = {}; toast(`${st.profile} açıldı`); wxLoad();
  });
}

function loginView() {
  if (!W.profiles && !W.busy) wx(() => api.growth.profiles(), (r) => (W.profiles = r));
  const cards = (W.profiles || []).map((p) => `
    <button class="wx-profile ${W.pick === p.tenantId ? 'on' : ''}" data-wx-pick="${h(p.tenantId)}" style="--pc:${h(p.color)};--pa:${h(p.accent)}">
      <span class="wx-letter">${h(p.letter)}</span>
      <b>${h(p.name)}</b><small>${h(p.desc)}</small>
      ${p.lockedUntil ? `<span class="badge fw">Kilitli</span>` : ''}
    </button>`).join('');
  return `
    <section class="page-banner mesh sky">
      <div><span class="kicker">Growth OS · Orbit'in içinde</span><h2>Profilini seç</h2>
        <p>Müşteri bulma, satış mesajları ve onaylı WhatsApp kuyruğu bu bilgisayarda çalışır; veriler burada saklanır, dışarıda bir sunucuya bağlanılmaz.</p></div>
    </section>
    <div class="wx-profiles">${cards || (W.err ? `<div class="card empty small"><p>${h(W.err)}</p><button class="btn sm" data-wx="retry">${I('refresh')}Tekrar dene</button></div>` : '<div class="card empty small"><span class="spinner"></span></div>')}</div>
    ${importCard()}`;
}

function importCard() {
  const r = W.importResult;
  return `<div class="card" style="margin-top:14px"><div class="card-head"><div><h3>Eski Growth OS verilerini taşı</h3>
      <p class="sub">Supabase'deki müşteriler, keşifler, şablonlar, mesaj geçmişi ve ayarlar (Places / Gemini anahtarları dahil) bir kerelik bu bilgisayara aktarılır. WhatsApp bağlantısı taşınmaz; Orbit'te QR ile yeniden bağlanırsın.</p></div></div>
    ${r ? `<div class="note">${I('check', 14)}<span>Taşındı: ${Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${h(k)}`).join(' · ')}. Önceki yerel veri yedeği: ${h(r.backup.split(/[\\\\/]/).pop())}</span></div>` : ''}
    <form class="row" id="wxImport" style="flex-wrap:nowrap;margin-top:12px">
      <input class="input" id="wxImportUrl" type="password" autocomplete="off" placeholder="postgresql://… (Supabase › Project Settings › Database › Connection string)" required ${W.importing ? 'disabled' : ''} style="flex:1">
      <button class="btn primary" type="submit" ${W.importing ? 'disabled' : ''}>${W.importing ? '<span class="spinner"></span>Taşınıyor…' : I('download') + 'Taşı'}</button>
    </form>
    <p class="sub" style="margin-top:8px">Bağlantı adresi kaydedilmez ve günlüğe yazılmaz; yalnızca bu taşıma için kullanılır.</p></div>`;
}

function settingsView() {
  const s = W.settings, wa = W.wa?.local;
  if (!s) return `<div class="card empty"><span class="spinner"></span></div>`;
  const waText = { ready: 'Bağlı', qr: 'QR kodu telefonla okut', starting: 'Bağlanıyor…', error: 'Hata', disconnected: 'Bağlı değil' }[wa?.state] || 'Bağlı değil';
  return `
    <div class="two" style="margin-top:0">
      <div class="card form">
        <h3>WhatsApp Web</h3>
        <p class="sub">Telefonundaki WhatsApp'ı bağla: WhatsApp › Bağlı cihazlar › Cihaz bağla ile QR kodu okut. Mesajlar yalnızca sen onayladıktan sonra, senin numarandan gider.</p>
        <div class="row"><span class="chip"><span class="status-dot ${wa?.state === 'ready' ? 'done' : wa?.state === 'error' ? 'error' : ['qr', 'starting'].includes(wa?.state) ? 'running' : ''}"></span>${h(waText)}</span>
          <span class="spacer"></span>
          ${wa?.state === 'ready' ? `<button class="btn" data-wx="wa-off">${I('x')}Bağlantıyı kes</button>` : `<button class="btn primary" data-wx="wa-on" ${W.busy ? 'disabled' : ''}>${I('message')}${wa?.state === 'qr' ? 'Yeni QR' : 'Bağla'}</button>`}</div>
        ${wa?.qrDataUrl && wa.state === 'qr' ? `<img class="wx-qr" src="${h(wa.qrDataUrl)}" alt="WhatsApp QR">` : ''}
        ${wa?.error ? `<p class="note">${I('alert', 14)}<span>${h(wa.error)}</span></p>` : ''}
        <label class="switch"><input type="checkbox" id="wxSending" ${W.sending ? 'checked' : ''}><span>Onaylanan mesajları otomatik gönder<small>Kapalıyken mesajlar kuyrukta bekler, hiçbiri gönderilmez (güvenlik kilidi). Açınca onayladıkların günlük sınır ve bekleme süresiyle sırayla gider.</small></span></label>
      </div>
      <form class="card form" id="wxSettings">
        <h3>Anahtarlar ve sınırlar</h3>
        ${s.ortakAnahtar ? `<p class="note">${I('alert', 14)}<span>Bu profil Google ve Gemini anahtarlarını ${h(s.ortakAnahtar)} profilinden kullanır.</span></p>` : ''}
        <label class="field"><span class="label">Google Places API anahtarı</span><input class="input" name="googlePlacesApiKey" type="password" autocomplete="off" placeholder="${s.hasPlacesKey ? h(s.googlePlacesApiKey) + ' (kayıtlı)' : 'AIza…'}"></label>
        <label class="field"><span class="label">Gemini API anahtarı (mesaj taslakları)</span><input class="input" name="llmApiKey" type="password" autocomplete="off" placeholder="${s.hasLlmKey ? h(s.llmApiKey) + ' (kayıtlı)' : 'Gemini anahtarı'}"></label>
        <div class="row">
          <label class="field"><span class="sub">Günlük mesaj sınırı</span><input class="input sm" name="dailyCap" type="number" min="1" max="200" value="${s.dailyCap}"></label>
          <label class="field"><span class="sub">Bekleme (sn) en az</span><input class="input sm" name="delayMinSec" type="number" min="5" max="600" value="${s.delayMinSec}"></label>
          <label class="field"><span class="sub">en çok</span><input class="input sm" name="delayMaxSec" type="number" min="5" max="900" value="${s.delayMaxSec}"></label>
        </div>
        <div class="row"><span class="sub">Anahtarlar yalnızca bu bilgisayardaki Growth OS veritabanında tutulur.</span><span class="spacer"></span><button class="btn primary" type="submit" ${W.busy ? 'disabled' : ''}>Kaydet</button></div>
      </form>
    </div>
    ${importCard()}`;
}

function overviewView() {
  const o = W.overview;
  if (!o) return `<div class="card empty"><span class="spinner"></span><p>Growth OS özeti alınıyor…</p></div>`;
  const stats = [[o.leads, 'müşteri adayı'], [o.pending ?? 0, 'onay bekleyen mesaj'], [o.sentToday ?? 0, `bugün gönderilen / ${o.dailyCap ?? '—'}`], [o.failed ?? 0, 'başarısız']];
  const queueState = o.sendingLocked ? 'Gönderim kilitli' : o.stopped ? 'Kuyruk durduruldu' : o.paused ? 'Kuyruk duraklatıldı' : 'Kuyruk çalışıyor';
  return `
    <section class="page-banner mesh mint">
      <div><span class="kicker">${h(o.email || '')}</span><h2>${h(o.tenantName || 'Growth OS')}</h2>
        <p>${h(queueState)} · mesajlar yalnızca sen onayladıktan sonra, günlük sınır ve bekleme süresiyle gönderilir.</p>
        <div class="row"><button class="btn primary" data-wx-tab="bul">${I('mappin')}Müşteri bul</button><button class="btn" data-wx-tab="whatsapp">${I('message')}Onay bekleyenler (${o.pending ?? 0})</button></div></div>
      <div class="banner-stats">${stats.map(([n, l]) => `<div class="stat glass"><b>${n}</b><span>${h(l)}</span></div>`).join('')}</div>
    </section>
    <div class="row" style="margin-bottom:14px">${LEAD_STATUSES.map(([k, n]) => `<button class="chip" data-wx-status="${k}">${h(n)} <b>${o.byStatus?.[k] || 0}</b></button>`).join('')}</div>
    <div class="two" style="margin-top:0">
      <div class="card"><div class="card-head"><div><h3>Son eklenen müşteriler</h3></div><button class="btn sm" data-wx-tab="musteriler">Tümü</button></div>
        <div class="rec-list">${(o.recentLeads || []).map((l) => `<div class="rec-item"><span class="wx-av">${h(l.name.slice(0, 1))}</span><div class="txt"><b>${h(l.name)}</b><p>${h([l.district, l.city].filter(Boolean).join(', '))} · ${h(stLabel(l.status))}</p></div></div>`).join('') || '<div class="empty small">Henüz müşteri yok.</div>'}</div></div>
      <div class="card"><div class="card-head"><div><h3>Son keşifler</h3></div><button class="btn sm" data-wx-tab="bul">Yeni</button></div>
        <div class="rec-list">${(o.campaigns || []).slice(0, 6).map(campRow).join('') || '<div class="empty small">Henüz keşif yok.</div>'}</div></div>
    </div>`;
}

const campRow = (c) => `<div class="rec-item"><span class="status-dot ${c.status === 'done' ? 'done' : c.status === 'error' ? 'error' : ['queued', 'running'].includes(c.status) ? 'running' : ''}"></span>
  <div class="txt"><b>${h(c.query)}</b><p>${h([c.district, c.city].filter(Boolean).join(', '))} · ${h(CAMP[c.status] || c.status)} · ${c.foundCount}/${c.targetCount} bulundu${c.error ? ' · ' + h(c.error) : ''}</p></div>
  <small class="sub">${new Date(c.createdAt).toLocaleDateString('tr-TR')}</small></div>`;

function leadsView() {
  const list = W.leads;
  const toolbar = `<div class="toolbar"><label class="search">${I('search')}<input id="wxQ" placeholder="İşletme, telefon, ilçe ara… (Enter)" value="${h(W.q)}"></label>
    <select class="input sm" data-wx-filter style="max-width:180px"><option value="">Tüm durumlar</option>${LEAD_STATUSES.map(([k, n]) => `<option value="${k}" ${W.st === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <button class="btn primary" data-wx="draft" ${W.sel.size && !W.busy ? '' : 'disabled'}>${I('message')}WhatsApp taslağı (${W.sel.size})</button></div>`;
  if (!list) return toolbar + `<div class="card empty"><span class="spinner"></span></div>`;
  if (!list.length) return toolbar + `<div class="card empty small"><p>Sonuç yok.</p></div>`;
  return toolbar + `<div class="card"><div class="table-wrap"><table class="table wx-leads"><thead><tr><th><input type="checkbox" data-wx-all ${list.every((l) => W.sel.has(l.id)) ? 'checked' : ''}></th><th>İşletme</th><th>Telefon</th><th>Web</th><th>Durum</th><th>Not</th></tr></thead><tbody>
    ${list.map((l) => `<tr><td><input type="checkbox" data-wx-sel="${l.id}" ${W.sel.has(l.id) ? 'checked' : ''}></td>
      <td><b>${h(l.name)}</b><br><small class="sub">${h([l.district, l.city].filter(Boolean).join(', '))}${l.rating ? ` · ★ ${l.rating}` : ''}</small></td>
      <td class="mono">${h(l.phone || '—')}</td>
      <td>${l.website ? `<button class="btn sm ghost" data-open="${h(l.website)}">${I('external', 14)}</button>` : '<span class="sub">yok</span>'}</td>
      <td><select class="input sm" data-wx-lead-status="${l.id}">${LEAD_STATUSES.map(([k, n]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
      <td><input class="input sm wx-note" data-wx-note="${l.id}" value="${h(l.notes || '')}" placeholder="not…" style="max-width:none"></td></tr>`).join('')}
    </tbody></table></div><p class="sub" style="margin-top:10px">${list.length} müşteri · taslaklar onay kuyruğuna düşer, sen onaylamadan hiçbir mesaj gönderilmez.</p></div>`;
}

function findView() {
  return `
    <section class="page-banner mesh peach">
      <div><span class="kicker">Google Places keşfi</span><h2>Yeni müşteri bul</h2><p>Sektör ve şehir yaz; bulunan işletmeler müşteri listene eklenir. Mesaj göndermek ayrı bir adımdır ve her zaman senin onayını ister.</p></div>
    </section>
    <form class="card form wx-find" id="wxFind">
      <div class="two" style="margin-top:0">
        <label class="field"><span class="label">Ne arıyorsun?</span><input class="input" name="query" placeholder="ör. kuaför, diş kliniği, kafe" required maxlength="120"></label>
        <label class="field"><span class="label">Şehir</span><input class="input" name="city" placeholder="ör. İstanbul" required maxlength="80"></label>
        <label class="field"><span class="label">İlçe (isteğe bağlı)</span><input class="input" name="district" placeholder="ör. Kadıköy" maxlength="80"></label>
        <label class="field"><span class="label">Kaç işletme</span><input class="input" name="targetCount" type="number" min="1" max="60" value="20"></label>
        <label class="field"><span class="label">Web sitesi</span><select class="input" name="websiteFilter"><option value="without">Web sitesi OLMAYANLAR (wexon.dev için en iyisi)</option><option value="any">Fark etmez</option><option value="with">Web sitesi olanlar</option></select></label>
        <label class="field"><span class="label">En düşük puan</span><input class="input" name="minRating" type="number" min="0" max="5" step="0.5" value="0"></label>
      </div>
      <div class="row"><span class="spacer"></span><button class="btn primary" type="submit" ${W.busy ? 'disabled' : ''}>${W.busy ? '<span class="spinner"></span>' : I('search')}Keşfi başlat</button></div>
    </form>
    <div class="card" style="margin-top:14px"><div class="card-head"><div><h3>Keşifler</h3><p class="sub">Devam edenler 5 saniyede bir yenilenir</p></div><button class="btn sm" data-wx="reload">${I('refresh')}Yenile</button></div>
      <div class="rec-list">${W.campaigns ? (W.campaigns.map(campRow).join('') || '<div class="empty small">Henüz keşif yok.</div>') : '<div class="empty small"><span class="spinner"></span></div>'}</div></div>`;
}

function queueView() {
  const q = W.queue;
  if (!q) return `<div class="card empty"><span class="spinner"></span><p>Kuyruk alınıyor…</p></div>`;
  const jobs = q.pendingJobs || [];
  const state = q.sendingLocked ? ['error', 'Gönderim kilitli (Growth OS ayarı)'] : q.stopped ? ['error', 'Kuyruk durduruldu'] : q.paused ? ['warn', 'Kuyruk duraklatıldı'] : ['done', 'Kuyruk çalışıyor'];
  return `
    <section class="page-banner mesh lilac">
      <div><span class="kicker">WhatsApp onay kuyruğu</span><h2>${jobs.length ? `${jobs.length} mesaj onayını bekliyor` : 'Onay bekleyen mesaj yok'}</h2>
        <p><span class="status-dot ${state[0]}"></span> ${h(state[1])} · günlük sınır ${q.dailyCap ?? '—'} · mesajlar arası ${q.delayMinSec ?? '?'}-${q.delayMaxSec ?? '?'} sn. Onaylanan mesajlar sırayla gönderilir.</p>
        ${jobs.length > 1 ? `<div class="row"><button class="btn primary" data-wx="approve-all" ${W.busy ? 'disabled' : ''}>${I('check')}Hepsini onayla (${jobs.length})</button></div>` : ''}</div>
      <div class="banner-stats">${[[q.pending ?? jobs.length, 'onay bekliyor'], [q.queued ?? 0, 'gönderim sırasında'], [q.sentToday ?? 0, 'bugün gönderildi'], [q.failed ?? 0, 'başarısız']].map(([n, l]) => `<div class="stat glass"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
    </section>
    <div class="stack" style="margin-top:0">${jobs.map((j) => `
      <div class="card wx-job">
        <div class="card-head"><div><h3>${h(j.lead?.name || 'Müşteri')}</h3><p class="sub mono">${h(j.lead?.phone || '')}${j.lead?.consented ? ' · izinli' : ''}</p></div>
          <button class="btn sm" data-wx-job="reject" data-id="${j.id}" ${W.busy ? 'disabled' : ''}>${I('x')}Reddet</button>
          <button class="btn primary sm" data-wx-job="approve" data-id="${j.id}" ${W.busy ? 'disabled' : ''}>${I('check')}${W.edits[j.id] !== undefined && W.edits[j.id] !== j.message ? 'Düzenle ve onayla' : 'Onayla'}</button></div>
        <textarea class="input wx-msg" data-wx-edit="${j.id}" rows="4">${h(W.edits[j.id] ?? j.message)}</textarea>
      </div>`).join('') || '<div class="card empty small"><p>Müşteriler sekmesinden müşteri seçip "WhatsApp taslağı" ile taslak hazırlayabilirsin.</p></div>'}</div>`;
}

const PHASE = { pages: 'Sayfalar tarayıcıda çiziliyor', assets: 'Dosyalar indiriliyor', write: 'Bağlantılar yerel dosyalara çevriliyor', verify: 'Klon orijinalle karşılaştırılıyor', done: '' };
const simClass = (v) => (v >= 97 ? 'ok' : v >= 85 ? 'warn' : 'old');

function siteView() {
  const st = W.site.status;
  const o = W.site;
  const running = st?.state === 'running';
  const pct = st ? Math.min(100, Math.round((st.pages / Math.max(1, Math.min(st.pageLimit, st.pages + st.queued))) * 100)) : 0;
  const sim = st?.similarity;
  const hist = (o.history || []).map((x) => `<div class="rec-item"><span class="wx-av">${I('globe', 16)}</span>
    <div class="txt"><b>${h(x.host)}</b><p>${x.pages} sayfa · ${x.assets} dosya · ${fmtMB(x.bytes)}${x.similarity != null ? ` · benzerlik %${x.similarity}` : ''}${x.errors ? ` · ${x.errors} hata` : ''} · ${new Date(x.at).toLocaleString('tr-TR')}${x.state === 'cancelled' ? ' · yarıda kesildi' : ''}</p></div>
    <button class="btn sm" data-site-open="${h(x.dir)}" data-what="index">${I('external', 14)}Aç</button>
    <button class="btn sm" data-site-open="${h(x.dir)}" data-what="show">${I('folder', 14)}Klasör</button>
    ${x.zip ? `<button class="btn sm" data-site-open="${h(x.zip)}" data-what="show">Zip</button>` : ''}</div>`).join('');
  const phaseText = running ? (PHASE[st.phase] || '') + (st.current ? ' · ' + st.current : '') : st?.state === 'done' ? 'Tamamlandı' : st?.state === 'cancelled' ? 'Durduruldu' : 'Hata';
  const bar = running ? (st.phase === 'pages' ? pct : st.phase === 'verify' ? 95 : 80) : 100;
  return `
    <section class="page-banner mesh rose">
      <div><span class="kicker">wexon.dev · web stüdyosu</span><h2>Bir siteyi birebir klonla</h2>
        <p>Her sayfa gerçek bir tarayıcıda çizilir; JavaScript ile oluşan içerik, yazı tipleri ve sonradan yüklenen görseller dahil kopyalanır, internetsiz açılır. Sonunda klon orijinalle ekran ekran karşılaştırılır.</p></div>
      ${sim ? `<div class="banner-stats"><div class="stat glass"><b>%${sim.avg}</b><span>ortalama benzerlik</span></div><div class="stat glass"><b>${sim.pages.length}</b><span>sayfa karşılaştırıldı</span></div><div class="stat glass"><b>${sim.blocked}</b><span>internet isteği (çevrimdışı)</span></div><div class="stat glass"><b>${st.assets}</b><span>dosya</span></div></div>` : ''}
    </section>
    <form class="card form" id="wxSite">
      <div class="row" style="flex-wrap:nowrap"><label class="search" style="box-shadow:none;background:var(--surface-2)">${I('globe')}<input name="url" placeholder="https://ornek.com" value="${h(o.url)}" required ${running ? 'disabled' : ''}></label>
        ${running ? `<button class="btn danger" type="button" data-wx="site-cancel">${I('stop')}Durdur</button>` : `<button class="btn primary" type="submit">${I('download')}Klonla</button>`}</div>
      <div class="row wx-site-opts">
        <div class="seg"><label class="${o.render ? 'active' : ''}"><input type="radio" name="mode" value="render" ${o.render ? 'checked' : ''} hidden>Birebir (tarayıcıda çiz)</label><label class="${o.render ? '' : 'active'}"><input type="radio" name="mode" value="fast" ${o.render ? '' : 'checked'} hidden>Hızlı (yalnızca HTML)</label></div>
        <label class="field"><span class="sub">En çok sayfa</span><input class="input sm" name="maxPages" type="number" min="1" max="500" value="${o.maxPages}"></label>
        <label class="field"><span class="sub">Derinlik</span><input class="input sm" name="maxDepth" type="number" min="0" max="6" value="${o.maxDepth}"></label>
        <label class="switch compact"><input type="checkbox" name="scripts" ${o.scripts === 'keep' ? 'checked' : ''}><span>Betikleri koru<small>Kapalı: statik, birebir görünüm (önerilen)</small></span></label>
        <label class="switch compact"><input type="checkbox" name="robots" ${o.robots ? 'checked' : ''}><span>robots.txt'ye uy</span></label>
        <label class="switch compact"><input type="checkbox" name="zip" ${o.zip ? 'checked' : ''}><span>Zip oluştur</span></label>
      </div>
      <label class="switch wx-auth"><input type="checkbox" name="authorized" ${o.authorized ? 'checked' : ''}><span>Bu site bana (ya da müşterime) ait veya sahibinden kopyalama izni aldım<small>Başkasının sitesini izinsiz kopyalamak telif hakkı ihlali olabilir; klonu başkasının adıyla yayınlamak dolandırıcılık sayılır.</small></span></label>
    </form>
    ${st ? `<div class="card" style="margin-top:14px"><div class="card-head"><div><h3>${h(st.host)}</h3><p class="sub">${h(phaseText)}</p></div>
        ${!running && st.dir ? `<button class="btn primary sm" data-site-open="${h(st.dir)}" data-what="index">${I('external', 14)}Klonu aç</button><button class="btn sm" data-site-open="${h(st.dir)}" data-what="show">${I('folder', 14)}Klasör</button>` : ''}</div>
      <div class="upbar" style="margin-bottom:10px"><i style="width:${bar}%"></i></div>
      <div class="row">${[[`${st.pages}/${st.pageLimit}`, 'sayfa'], [st.assets, 'dosya'], [fmtMB(st.bytes), 'indirildi'], [st.errors, 'hata'], [st.skippedRobots, 'robots ile atlandı']].map(([n, l]) => `<span class="chip"><b>${n}</b> ${l}</span>`).join('')}</div>
      ${sim?.pages?.length ? `<div class="section-title" style="margin-top:18px">Orijinal ile klon karşılaştırması</div><div class="rec-list">${sim.pages.map((p) => `<div class="rec-item"><span class="age ${simClass(p.score)}">%${p.score}</span><div class="txt"><b>${h(p.page)}</b></div>
          <button class="btn sm" data-site-open="${h(p.original)}" data-what="file">Orijinal</button><button class="btn sm" data-site-open="${h(p.clone)}" data-what="file">Klon</button></div>`).join('')}</div>` : ''}
      ${st.errorList?.length && !running ? `<details style="margin-top:10px"><summary class="sub">Hatalar (${st.errors})</summary><div class="mono" style="margin-top:6px">${st.errorList.map((e) => `${h(e.url)} — ${h(e.error)}`).join('<br>')}</div></details>` : ''}</div>` : ''}
    <div class="card" style="margin-top:14px"><div class="card-head"><div><h3>Klonlar</h3><p class="sub">Belgeler › Orbit Siteler</p></div></div>
      <div class="rec-list">${hist || '<div class="empty small">Henüz site klonlanmadı.</div>'}</div></div>`;
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-wx],[data-wx-tab],[data-wx-pick],[data-wx-status],[data-wx-job],[data-wx-sel],[data-wx-all],[data-site-open]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.wxTab) { const sec = SECTIONS.find((s) => s.id === 'wexon'); const it = sec.items.find((i) => i.on && (wxTab(d.wxTab), i.on())); return it ? goSub(it) : (renderPage(), wxLoad()); }
  if (d.wxPick) { W.err = ''; return wxOpen(d.wxPick); }
  if (d.wxStatus) { W.tab = 'musteriler'; W.st = d.wxStatus; W.leads = null; renderPage(); return wxLoad('musteriler'); }
  if (d.wxSel) { W.sel.has(d.wxSel) ? W.sel.delete(d.wxSel) : W.sel.add(d.wxSel); return renderPage(); }
  if (d.wxAll !== undefined) { const all = (W.leads || []).every((l) => W.sel.has(l.id)); (W.leads || []).forEach((l) => (all ? W.sel.delete(l.id) : W.sel.add(l.id))); return renderPage(); }
  if (d.siteOpen) { try { await api.site.open(d.siteOpen, d.what); } catch (err) { toast(err.message, true); } return; }
  if (d.wxJob) {
    const job = (W.queue?.pendingJobs || []).find((j) => j.id === d.id);
    const edited = W.edits[d.id] !== undefined && W.edits[d.id] !== job?.message;
    if (d.wxJob === 'approve' && !confirm(`${job?.lead?.name || 'Bu müşteri'} için mesaj onaylansın mı? Onaylanınca WhatsApp kuyruğuna girer ve gönderilir.`)) return;
    return wx(() => api.growth.moderate([d.id], d.wxJob === 'reject' ? 'reject' : edited ? 'edit' : 'approve', W.edits[d.id]), () => {
      delete W.edits[d.id]; toast(d.wxJob === 'reject' ? 'Taslak reddedildi' : 'Onaylandı, gönderim sırasına girdi'); wxLoad('whatsapp');
    });
  }
  switch (d.wx) {
    case 'lock': return wx(() => api.growth.lock(), (st) => { W.status = st; W.overview = W.leads = W.queue = W.campaigns = null; W.profiles = null; W.loaded = {}; toast('Growth OS kilitlendi'); });
    case 'retry': W.err = ''; W.profiles = null; return renderPage();
    case 'wa-on': return wx(() => api.growth.whatsappAction('connect'), (r) => { W.wa = r; });
    case 'wa-off':
      if (!confirm('WhatsApp Web bağlantısı kesilsin mi? Yeniden bağlamak için QR okutman gerekir.')) return;
      return wx(() => api.growth.whatsappAction('disconnect'), (r) => { W.wa = r; });
    case 'reload': return wxLoad();
    case 'draft':
      if (!confirm(`${W.sel.size} müşteri için WhatsApp mesaj taslağı hazırlansın mı? Taslaklar onay kuyruğuna düşer; sen onaylamadan gönderilmez.`)) return;
      return wx(() => api.growth.draft([...W.sel]), () => { W.sel.clear(); toast('Taslaklar hazırlandı: WhatsApp sekmesinden onayla'); W.tab = 'whatsapp'; wxLoad('whatsapp'); });
    case 'approve-all': {
      const ids = (W.queue?.pendingJobs || []).map((j) => j.id);
      if (!confirm(`${ids.length} mesajın hepsi onaylansın mı? Hepsi WhatsApp kuyruğuna girer ve günlük sınırla gönderilir.`)) return;
      return wx(() => api.growth.moderate(ids, 'approve'), () => { toast('Hepsi onaylandı'); wxLoad('whatsapp'); });
    }
    case 'site-cancel': await api.site.cancel(); return;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('#wxSite input[name=mode]')) { W.site.render = t.value !== 'fast'; return renderPage(); }
  if (t.matches('#wxSite input[name=authorized]')) { W.site.authorized = t.checked; return; }
  if (t.matches('#wxSending')) {
    if (t.checked && !confirm('Onayladığın WhatsApp mesajları otomatik gönderilmeye başlasın mı? Günlük sınır ve bekleme süresi uygulanır.')) { t.checked = false; return; }
    return wx(() => api.growth.sending(t.checked), (r) => { W.sending = r.sending; W.status = { connected: false }; W.loaded = {}; toast(r.sending ? 'Otomatik gönderim açık' : 'Otomatik gönderim kapalı'); });
  }
  if (t.matches('[data-wx-filter]')) { W.st = t.value; W.leads = null; renderPage(); return wxLoad('musteriler'); }
  if (t.matches('[data-wx-lead-status]')) return wx(() => api.growth.lead(t.dataset.wxLeadStatus, { status: t.value }), () => toast('Durum güncellendi'));
  if (t.matches('[data-wx-note]')) return wx(() => api.growth.lead(t.dataset.wxNote, { notes: t.value }), () => toast('Not kaydedildi'));
});

api.site.onStatus((st) => { W.site.status = st; if (S.page === 'wexon' && W.tab === 'site' && !document.activeElement?.matches('input')) renderPage(); });
api.site.onHistory((list) => { W.site.history = list; if (S.page === 'wexon' && W.tab === 'site') renderPage(); });
api.ui.get().then((ui) => { if (ui?.wexonTab) W.tab = ui.wexonTab; }).catch(() => {});
