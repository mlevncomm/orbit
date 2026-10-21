/* Orbit arayüzü — bağımlılıksız, tek dosya. Sayfalar PAGES nesnesinde. */
const api = window.orbit;
const I = window.ICONS;
const $ = (s, r = document) => r.querySelector(s);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => n.replace(/[^\p{L}\p{N} +]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const time = () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/*
 * Menü: üstte ana bölümler, solda seçili bölümün alt menüleri.
 * Alt menü öğesi: { label, icon, page, set?() (sayfanın alt görünümünü seçer), on?() (etkin mi), anchor? (sayfada kaydırılacak bölüm), group? }
 */
const SECTIONS = [
  { id: 'panel', label: 'Panel', icon: 'grid', items: [
    { label: 'Genel bakış', icon: 'grid', page: 'dashboard', set: () => (S.bootOpen = false), on: () => !S.bootOpen },
    { label: 'Hazırlık kontrolü', icon: 'shield', page: 'dashboard', set: () => (S.bootOpen = true), on: () => S.bootOpen, anchor: 'ready' },
  ] },
  { id: 'kurulum', label: 'Kurulum', icon: 'package', items: [
    { group: 'Programlar', label: 'Katalog', icon: 'package', page: 'apps', set: () => (S.appsView = 'catalog'), on: () => (S.appsView || 'catalog') === 'catalog' },
    { label: 'Bu bilgisayar', icon: 'windows', page: 'apps', set: () => (S.appsView = 'pc'), on: () => S.appsView === 'pc', badge: () => S.inv?.programs.length },
    { label: 'Güncellemeler', icon: 'download', page: 'apps', set: () => (S.appsView = 'updates'), on: () => S.appsView === 'updates', badge: () => S.inv?.upgrades.length, hot: true },
    { group: 'Sürücüler', label: 'Sürücü durumu', icon: 'chip', page: 'drivers', anchor: '' },
    { label: 'Windows Update', icon: 'refresh', page: 'drivers', anchor: 'wu' },
    { label: 'Üretici araçları', icon: 'gpu', page: 'drivers', anchor: 'vendor' },
    { label: 'Kurulu sürücüler', icon: 'board', page: 'drivers', anchor: 'installed' },
  ] },
  { id: 'donanim', label: 'Donanım', icon: 'board', items: [
    { group: 'Işıklar', label: 'Cihazlar', icon: 'light', page: 'lights', anchor: '' },
    { label: 'Görünümler', icon: 'rainbow', page: 'lights', anchor: 'rgb-presets' },
    { label: 'Özelleştir', icon: 'wave', page: 'lights', anchor: 'rgb-custom' },
    { group: 'ESP32', label: 'Kart ve port', icon: 'usb', page: 'esp32', anchor: '' },
    { label: 'Testler ve konsol', icon: 'terminal', page: 'esp32', anchor: 'esp-test' },
    { label: 'İkiz kontrol', icon: 'activity', page: 'esp32', anchor: 'esp-twin' },
    { label: 'Wi-Fi paneli', icon: 'globe', page: 'esp32', anchor: 'esp-wifi' },
  ] },
  { id: 'wexon', label: 'Wexon', icon: 'wexon', items: [
    { group: 'Growth OS', label: 'Özet', icon: 'grid', page: 'wexon', set: () => wxTab('ozet'), on: () => W.tab === 'ozet' },
    { label: 'Müşteriler', icon: 'users', page: 'wexon', set: () => wxTab('musteriler'), on: () => W.tab === 'musteriler' },
    { label: 'Müşteri Bul', icon: 'mappin', page: 'wexon', set: () => wxTab('bul'), on: () => W.tab === 'bul' },
    { label: 'WhatsApp', icon: 'message', page: 'wexon', set: () => wxTab('whatsapp'), on: () => W.tab === 'whatsapp', badge: () => W.overview?.pending || W.queue?.pendingJobs?.length, hot: true },
    { label: 'Şablonlar', icon: 'star', page: 'wexon', set: () => wxTab('sablonlar'), on: () => W.tab === 'sablonlar' },
    { label: 'Ayarlar ve WhatsApp', icon: 'settings', page: 'wexon', set: () => wxTab('ayarlar'), on: () => W.tab === 'ayarlar' },
    { group: 'Web stüdyosu', label: 'Site Klonlayıcı', icon: 'globe', page: 'wexon', set: () => wxTab('site'), on: () => W.tab === 'site' },
  ] },
  { id: 'asistan', label: 'Asistan', icon: 'sparkles', items: [
    { label: 'Sohbet', icon: 'sparkles', page: 'assistant', set: () => (S.asstTab = 'chat'), on: () => S.asstTab !== 'memory' },
    { label: 'Hafıza', icon: 'star', page: 'assistant', set: () => (S.asstTab = 'memory'), on: () => S.asstTab === 'memory', badge: () => M?.state?.items.length },
  ] },
  { id: 'ayarlar', label: 'Ayarlar', icon: 'settings', items: [
    { label: 'Profil ve tema', icon: 'settings', page: 'settings', anchor: '' },
    { label: 'Yapay zeka', icon: 'sparkles', page: 'settings', anchor: 'ai' },
    { label: 'Başlangıç', icon: 'power', page: 'settings', anchor: 'startup' },
    { label: 'Güncellemeler', icon: 'download', page: 'settings', anchor: 'update' },
    { label: 'Kurulum geçmişi', icon: 'refresh', page: 'settings', anchor: 'history' },
  ] },
];
// Eski düz liste (başka yerlerde sayfa adı / simgesi için)
const NAV = SECTIONS.flatMap((s) => s.items.map((i) => ({ id: i.page, label: i.label, icon: i.icon })));
const sectionOf = (page) => SECTIONS.find((s) => s.items.some((i) => i.page === page)) || SECTIONS[0];
/** Bölümdeki etkin alt menü öğesi */
function activeItem(sec) {
  const cands = sec.items.filter((i) => i.page === S.page);
  if (!cands.length) return null;
  if (S.sub && cands.includes(S.sub)) return S.sub;
  return cands.find((i) => i.on && i.on()) || cands[0];
}

const S = {
  page: 'dashboard',
  sys: null,
  admin: true,
  catalog: { categories: [], apps: [] },
  selection: new Set(),
  installed: new Set(),
  installedLoaded: false,
  recs: [],
  wu: null,            // Windows Update sürücü listesi
  wuSel: new Set(),
  scanning: false,
  jobs: new Map(),     // key -> ilerleme
  feed: [],
  running: false,
  settings: {},
  cat: 'all',
  query: '',
  chat: [],
  thinking: false,
  opts: { vendor: true, wu: true, apps: true, reboot: false },
  dashTab: 'summary',
  update: { state: 'idle' },
  version: '',
};

/* ---------- Yardımcılar ---------- */
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
async function safe(fn, msg) {
  try { return await fn(); } catch (e) { toast((msg ? msg + ': ' : '') + e.message, true); return null; }
}
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.hydrated) return;
    el.insertAdjacentHTML('afterbegin', I(el.dataset.icon, el.classList.contains('logo') ? 22 : 18));
    el.dataset.hydrated = '1';
  });
}
/** Rengin açık olup olmadığı (logo zemini için) */
const isLight = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 170; };
/**
 * Program simgesi: kuruluysa Windows'taki gerçek simgesi, değilse resmi sitesindeki simgesi ya da
 * markanın logosu (Simple Icons), o da yoksa marka renginde baş harfler.
 */
const appIcon = (a, size) => {
  const dim = size ? `;width:${size}px;height:${size}px` : '';
  const file = a.status?.icon || a.icon;
  const real = file && S.fileIcons?.[file];
  if (real) return `<span class="app-ic real" style="${dim.slice(1)}"><img src="${real}" alt=""></span>`;
  // Programın resmi sitesindeki / deposundaki kendi simgesi (gömülü, scripts/gen-site-icons.js)
  const site = window.SITE_ICONS?.[a.key];
  if (site) return `<span class="app-ic real" style="${dim.slice(1)}"><img src="${site}" alt=""></span>`;
  const b = window.BRAND_ICONS?.[a.key];
  if (b) {
    const hex = '#' + b.h;
    return `<span class="app-ic brand ${isLight(b.h) ? 'light' : ''}" style="--brand:${hex}${dim}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${b.p}"/></svg></span>`;
  }
  return `<span class="app-ic" style="background:${h(a.color || '#111')}${dim}">${h(initials(a.name))}</span>`;
};

/** Kurulu programların gerçek simgelerini (bir kez) yükler */
async function loadFileIcons() {
  const want = new Set();
  for (const a of S.catalog.apps || []) if (a.status?.icon) want.add(a.status.icon);
  for (const p of S.inv?.programs || []) if (p.icon) want.add(p.icon);
  S.fileIcons = S.fileIcons || {};
  const todo = [...want].filter((x) => !(x in S.fileIcons));
  if (!todo.length) return;
  const got = await api.icons.files(todo).catch(() => ({}));
  Object.assign(S.fileIcons, got);
  if (['apps', 'drivers', 'dashboard'].includes(S.page)) renderPage();
}
const boardName = (sys) => `${sys.board.vendor.replace(/\s*(Technology Co\., Ltd\.|COMPUTER INC\.|Co\., Ltd\.|Inc\.|Corporation)/gi, '')} ${sys.board.product}`;
const isInstalled = (a) => !!a.status?.installed;
const PALETTE = ['#6d5bd0', '#1a73e8', '#e0245e', '#13aa52', '#f58220', '#0b8a8a', '#7c3aed', '#c2410c', '#2563eb', '#be185d'];
const colorFor = (name) => PALETTE[[...String(name)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
const selectedApps = () => S.catalog.apps.filter((a) => S.selection.has(a.key));
const persistSelection = () => api.selection.set([...S.selection]);
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
/** Arayüz durumunu (sayfa, filtre, Panel seçenekleri…) kalıcı kaydeder */
const saveUi = debounce((patch) => api.ui.set(patch).catch(() => {}), 250);
const persistChat = debounce(() => api.chat.set(S.chat.filter((m) => m.role !== 'tool').slice(-200)).catch(() => {}), 400);
/** Ayarı anında kaydeder ve "Kaydedildi" göstergesini yakar */
async function saveSetting(patch) {
  const next = await safe(() => api.settings.set(patch), 'Kaydedilemedi');
  if (!next) return null;
  S.settings = next;
  renderChrome();
  const chip = $('#savedChip');
  if (chip) { chip.hidden = false; clearTimeout(saveSetting.t); saveSetting.t = setTimeout(() => (chip.hidden = true), 1600); }
  return next;
}

function pushFeed(entry) {
  S.feed.push({ id: Math.random().toString(36).slice(2), time: time(), ...entry });
  if (S.feed.length > 200) S.feed.shift();
  renderFeed();
}

/* ---------- Çerçeve ---------- */
function renderChrome() {
  const sec = sectionOf(S.page);
  const act = activeItem(sec);
  $('#pills').innerHTML = SECTIONS.map((s) => `<button class="pill ${s === sec ? 'active' : ''}" data-section="${s.id}">${s.label}</button>`).join('');
  const items = sec.items.map((it, i) => {
    const b = it.badge?.();
    return `${it.group ? `<span class="rail-label">${h(it.group)}</span>` : ''}<button class="rail-btn ${it === act ? 'active' : ''}" data-sub="${sec.id}:${i}" title="${h(it.label)}">${I(it.icon, 19)}<span class="rail-text">${h(it.label)}</span>${b ? `<em class="${it.hot ? 'hot' : ''}">${b}</em>` : ''}</button>`;
  }).join('');
  $('#rail').innerHTML = `
    <div class="rail-group"><span class="rail-title">${I(sec.icon, 16)}<span class="rail-text">${h(sec.label)}</span></span>${items}</div>
    <div class="rail-group theme">
      <button class="rail-btn ${S.settings.theme !== 'dark' ? 'active' : ''}" data-theme-set="light" title="Açık tema">${I('sun', 19)}</button>
      <button class="rail-btn ${S.settings.theme === 'dark' ? 'active' : ''}" data-theme-set="dark" title="Koyu tema">${I('moon', 19)}</button>
    </div>`;
  const name = S.settings.userName || S.sys?.userName || 'O';
  $('#avatar').textContent = initials(name);
  $('#avatar').title = name;
}

/** Alt menü öğesine git: alt görünümü seç, sayfayı aç, gerekiyorsa bölüme kaydır */
function goSub(item) {
  item.set?.();
  S.sub = item;
  S.lastSub = { ...(S.lastSub || {}), [sectionOf(item.page).id]: item };
  if (S.page !== item.page) navigate(item.page);
  else { renderChrome(); renderPage(); }
  scrollToAnchor(item.anchor);
}
function scrollToAnchor(anchor) {
  const c = $('#content');
  if (!anchor) return c.scrollTo({ top: 0, behavior: 'smooth' });
  // Bölüm, sayfa verisi gelince çizilebilir: kısa süre bekle
  let n = 0;
  const tryIt = () => {
    const el = document.querySelector(`[data-anchor="${anchor}"]`);
    if (el) return c.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
    if (++n < 20) setTimeout(tryIt, 150);
  };
  tryIt();
}

function navigate(page) {
  if (!PAGES[page]) page = 'dashboard';
  if (S.page !== page) S.sub = null;
  S.page = page;
  saveUi({ page });
  document.getElementById('app').classList.remove('feed-open');
  $('#scrim').classList.remove('show');
  renderChrome();
  renderPage();
  $('#content').scrollTop = 0;
}

function renderPage() {
  if (typeof PAGES[S.page] !== 'function') {
    api.app.log('error', `Geçersiz sayfa: ${JSON.stringify(S.page)} — panele dönülüyor`);
    S.page = 'dashboard';
  }
  $('#content').innerHTML = updateBanner() + PAGES[S.page]();
  hydrateIcons($('#content'));
  PAGES[S.page + 'After']?.();
}

/* ---------- Sayfalar ---------- */
const PAGES = {};

function hwChips() {
  if (!S.sys) return '';
  const gpu = S.sys.gpus.find((g) => !/basic|microsoft/i.test(g.name)) || S.sys.gpus[0];
  return `<div class="head-chips">
    <div class="person-chip"><span class="ic mesh peach">${I('gpu')}</span><div><b>${h(gpu?.name || '—')}</b><small>Ekran kartı</small></div></div>
    <div class="person-chip"><span class="ic mesh lilac">${I('cpu')}</span><div><b>${h(S.sys.cpu.name)}</b><small>İşlemci</small></div></div>
  </div>`;
}

function updateBanner() {
  const u = S.update;
  if (u.state === 'available') return `<div class="banner update">${I('download')}<p><b>Yeni güncelleme: v${h(u.version)}</b> · şu an v${h(S.version)}${u.notes ? ` — ${h(u.notes.slice(0, 140))}` : ''}</p><button class="btn primary sm" data-action="update-download">Güncellemeyi indir</button></div>`;
  if (u.state === 'downloading') return `<div class="banner update">${I('download')}<p><b>Güncelleme indiriliyor… %${u.percent || 0}</b></p><div class="upbar"><i style="width:${u.percent || 0}%"></i></div></div>`;
  if (u.state === 'ready') return `<div class="banner update">${I('refresh')}<p><b>v${h(u.version)} hazır.</b> Kurmak için Orbit yeniden başlatılacak.</p><button class="btn primary sm" data-action="update-install">Yeniden başlat ve güncelle</button></div>`;
  return '';
}

function adminBanner() {
  if (S.admin) return '';
  return `<div class="banner">${I('shield')}<p><b>Yönetici izni yok.</b> Sessiz kurulum ve sürücü yüklemesi için Orbit'i yönetici olarak yeniden başlatın.</p><button class="btn primary sm" data-action="relaunch-admin">Yönetici olarak başlat</button></div>`;
}

/* ---------- Format sonrası hazırlık ---------- */
const CHECK_ICON = { ok: 'check', warn: 'alert', fail: 'x' };
const REPAIR_LABEL = { 'winget-install': "winget'i kur / onar", 'winget-source-reset': 'Kaynağı sıfırla', 'relaunch-admin': 'Yönetici olarak başlat' };

function pendingBanner() {
  if (!S.pendingQueue?.length) return '';
  return `<div class="banner">${I('refresh')}<p><b>Yarım kalan kurulum:</b> önceki oturumdan ${S.pendingQueue.length} öğe (${h(S.pendingQueue.slice(0, 4).map((x) => x.name).join(', '))}${S.pendingQueue.length > 4 ? '…' : ''}) bekliyor.</p>
      <button class="btn primary sm" data-action="resume-queue">Devam et</button><button class="btn sm" data-action="discard-queue">Vazgeç</button></div>`;
}

/** Hazırlık kontrolünün ayrıntıları (banner'daki durum etiketine tıklayınca ya da sorun varsa) */
function readinessCard() {
  const b = S.boot;
  if (!b) return '';
  const ok = b.checks.filter((c) => c.status === 'ok').length;
  return `<div class="card" style="margin-top:12px" data-anchor="ready">
    <div class="card-head"><div><h3>Hazırlık kontrolü</h3><p class="sub">${ok}/${b.checks.length} kontrol geçti · ${new Date(b.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p></div>
      <button class="btn sm" data-action="boot-check" ${S.bootBusy ? 'disabled' : ''}>${S.bootBusy ? '<span class="spinner"></span>' : I('refresh')}Yeniden kontrol</button>
      ${b.ready ? `<button class="icon-btn sm" data-action="boot-toggle" title="Kapat">${I('x')}</button>` : ''}</div>
    <div class="checks">${b.checks.map((c) => `<div class="check-row ${c.status}"><span>${I(CHECK_ICON[c.status], 14)}</span><b>${h(c.title)}</b><small>${h(c.detail)}</small>
      ${c.fix ? `<button class="btn sm" data-repair="${c.fix}" ${S.bootBusy ? 'disabled' : ''}>${h(REPAIR_LABEL[c.fix] || 'Onar')}</button>` : '<span></span>'}</div>`).join('')}</div>
  </div>`;
}

async function runBootCheck() {
  S.bootBusy = true; if (S.page === 'dashboard') renderPage();
  S.boot = await safe(() => api.bootstrap.check(), 'Hazırlık kontrolü yapılamadı') || S.boot;
  S.bootBusy = false; if (S.page === 'dashboard') renderPage();
}

async function runRepair(action) {
  if (action === 'relaunch-admin') return safe(() => api.system.relaunchAdmin());
  const text = action === 'winget-install'
    ? "winget, Microsoft'un resmi PowerShell modülü (Microsoft.WinGet.Client) ile kurulacak/onarılacak. İnternetten indirme yapılır ve birkaç dakika sürebilir. Devam edilsin mi?"
    : 'winget paket kaynakları sıfırlanıp yeniden indirilecek. Devam edilsin mi?';
  if (!confirm(text)) return;
  S.bootBusy = true; renderPage();
  pushFeed({ type: 'sys', text: `Onarım başladı: ${REPAIR_LABEL[action]}` });
  const r = await safe(() => api.bootstrap.repair(action), 'Onarım başarısız');
  S.bootBusy = false;
  if (r) { S.boot = r; pushFeed({ type: 'sys', text: 'Onarım bitti, kontrol yenilendi.' }); }
  renderPage();
}

/** Hazır profil: kurulu olmayanları bulur */
function profileState(p) {
  const apps = p.keys.map((k) => S.catalog.apps.find((a) => a.key === k)).filter(Boolean);
  const missing = apps.filter((a) => !isInstalled(a));
  const updates = apps.filter((a) => a.status?.available);
  return { apps, missing, updates };
}

function profilesRow() {
  const list = S.catalog.profiles || [];
  if (!list.length) return '';
  return `<div class="profiles">${list.map((p) => {
    const st = profileState(p);
    return `<div class="profile-card"><div><b>${h(p.name)}</b><small>${h(p.desc)}</small>
      <div class="sub">${st.apps.length - st.missing.length}/${st.apps.length} kurulu${st.updates.length ? ` · ${st.updates.length} güncelleme` : ''}${st.missing.length ? ` · eksik: ${h(st.missing.slice(0, 5).map((a) => a.name).join(', '))}${st.missing.length > 5 ? '…' : ''}` : ''}</div></div>
      <button class="btn ${st.missing.length ? 'primary' : ''} sm" data-profile="${h(p.id)}" ${S.running || !st.missing.length ? 'disabled' : ''}>${I('download')}${st.missing.length ? `${st.missing.length} eksiği kur` : 'Hepsi kurulu'}</button></div>`;
  }).join('')}</div>`;
}

PAGES.dashboard = () => {
  const sys = S.sys;
  const apps = selectedApps();
  const autoRecs = S.recs.filter((r) => r.auto);
  const problems = sys?.problemDevices?.length ?? 0;
  const jobs = [...S.jobs.values()];
  const doneCount = jobs.filter((j) => ['done', 'skipped'].includes(j.status)).length;
  const total = jobs.length;
  const overall = total ? Math.round(jobs.reduce((s, j) => s + (['done', 'skipped', 'error'].includes(j.status) ? 100 : j.percent || 0), 0) / total) : 0;
  const gpu = sys?.gpus.find((g) => !/basic|microsoft/i.test(g.name)) || sys?.gpus?.[0];
  // Referanstaki portre kareleri: mesh zemin, büyük ince çizgi simge, cam isim etiketi
  const tile = (tone, icon, title, meta, tag) => `<button class="tile mesh ${tone}" data-nav="drivers" title="${h(tag)}: ${h(title)}">
      <span class="tile-ic glass">${I(icon)}</span><span class="tile-big">${I(icon, 120)}</span>
      <span class="tile-label glass"><small>${h(tag)}${meta ? ' · ' + h(meta) : ''}</small><b>${h(title)}</b></span></button>`;
  const ctl = (key, icon, label) => `<button class="ctl ${S.opts[key] ? '' : 'off'}" data-opt="${key}" data-tip="${label}${S.opts[key] ? '' : ' (kapalı)'}" aria-label="${label}" ${S.running ? 'disabled' : ''}>${I(icon)}<span>${label}</span></button>`;
  const waveBars = Array.from({ length: 44 }, (_, i) => `<i style="height:${8 + Math.round(Math.abs(Math.sin(i * 1.7) * 22))}px;animation-delay:${(i % 8) * 0.08}s"></i>`).join('');

  const summary = S.running
    ? `Kurulum devam ediyor: <b>${doneCount}/${total}</b> işlem tamamlandı (%${overall}). Pencereyi kapatmayın; ilerlemeyi sağdaki akıştan takip edebilirsiniz.`
    : `Merhaba${S.settings.userName ? ' ' + h(S.settings.userName) : ''}! Orbit bu bilgisayarı ${sys ? `<b>${h(sys.cpu.name)}</b>, <b>${h(gpu?.name || '')}</b> ve <b>${h(boardName(sys))}</b>` : 'tarıyor'} olarak algıladı.
       Tek tıkla önce donanımın için onaylı sürücüler (Windows Update + ${autoRecs.length ? autoRecs.map((r) => h(r.name)).join(', ') : 'üretici araçları'}), ardından seçtiğin <b>${apps.length}</b> program sessizce kurulur.`;

  const detail = `<span class="mini-list">${apps.slice(0, 12).map((a) => `<span class="row">${appIcon(a, 28)}<span>${h(a.name)}</span>${isInstalled(a) ? '<span class="badge">kurulu</span>' : ''}</span>`).join('') || '<span class="sub">Henüz program seçilmedi.</span>'}${apps.length > 12 ? `<span class="sub">+${apps.length - 12} daha</span>` : ''}</span>`;
  const b = S.boot;
  const bad = b ? b.checks.filter((c) => c.status !== 'ok') : [];
  const readyText = !b ? 'Sistem kontrol ediliyor…' : !b.ready ? 'Kurulum öncesi düzeltme gerekli' : bad.length ? `Hazır · ${bad.length} uyarı` : 'Sistem kuruluma hazır';
  const readyDot = !b ? 'running' : !b.ready ? 'error' : bad.length ? 'warn' : 'done';

  return `
    ${adminBanner()}${pendingBanner()}
    <div class="page-head">
      <div><h1>Sıfırdan Başlayalım</h1><p>Format sonrası tek tıkla sürücüler ve programlar</p></div>
      ${hwChips()}
    </div>
    <div class="dash">
      <div class="tiles">
        ${tile('lilac', 'cpu', sys?.cpu.name || 'Algılanıyor…', sys ? `${sys.cpu.cores} çekirdek` : '', 'İşlemci')}
        ${tile('peach', 'gpu', gpu?.name || 'Algılanıyor…', gpu?.driver ? `sürücü ${shortVer(gpu.driver)}` : '', 'Ekran kartı')}
        ${tile('sky', 'board', sys ? boardName(sys) : 'Algılanıyor…', sys ? `${sys.ramGB} GB RAM` : '', 'Anakart')}
      </div>
      <div class="hero mesh rose">
        <div class="hero-top">
          <button class="hero-status glass" data-action="boot-toggle" title="Hazırlık kontrolünün ayrıntıları"><span class="status-dot ${readyDot}"></span>${readyText}${b ? ` · ${b.checks.length - bad.length}/${b.checks.length}` : ''}</button>
          <div class="hero-stats">
            <div class="stat glass"><b>${apps.length}</b><span>seçili program</span></div>
            <button class="stat glass" data-apps-view="updates"><b>${S.inv ? S.inv.upgrades.length : '…'}</b><span>güncelleme</span></button>
            <div class="stat glass"><b style="${problems ? 'color:var(--danger)' : ''}">${sys ? problems : '…'}</b><span>sorunlu cihaz</span></div>
          </div>
        </div>
        <div class="hero-copy">
          <h2>Bilgisayarını tek tıkla hazırla</h2>
          <p>Donanımına uygun güncel sürücüler, geliştirici araçların ve günlük programların — hepsi sessiz kurulum.</p>
        </div>
        <div class="controls">
          ${ctl('vendor', 'gpu', 'Üretici araçları')}
          ${ctl('wu', 'chip', 'Windows Update sürücüleri')}
          ${ctl('apps', 'package', 'Programlar')}
          ${ctl('reboot', 'power', 'Bitince yeniden başlat')}
          ${S.running
            ? `<button class="ctl go" data-action="cancel">${I('stop')}<span>Durdur</span></button>`
            : `<button class="ctl go" data-action="one-click">${I('zap')}<span>Hepsini Kur</span></button>`}
        </div>
      </div>
    </div>
    ${S.bootOpen || (b && !b.ready) ? readinessCard() : ''}
    <div class="card transcript">
      <p>${S.dashTab === 'summary' ? summary : detail}</p>
      <div class="transcript-foot">
        <div class="seg dark">
          <button class="${S.dashTab === 'summary' ? 'active' : ''}" data-dash-tab="summary">Özet</button>
          <button class="${S.dashTab === 'detail' ? 'active' : ''}" data-dash-tab="detail">Kurulum listesi</button>
        </div>
        <div class="wave ${S.running ? 'live' : ''}">${waveBars}</div>
        <div class="row"><span class="sub">%${overall}</span><span class="rec ${S.running ? 'live' : ''}"><i></i></span></div>
      </div>
    </div>`;
};

const shortVer = (v) => String(v || '').split('.').slice(0, 3).join('.');
const ageClass = (m) => (m == null ? '' : m < 12 ? 'ok' : m < 24 ? 'warn' : 'old');
const ageText = (m) => (m == null ? 'Windows yerleşik' : m < 1 ? 'bu ay' : m < 12 ? `${m} ay önce` : `${Math.floor(m / 12)} yıl ${m % 12 ? (m % 12) + ' ay ' : ''}önce`);

/** Programlar ve sürücüler için "bu bilgisayar" özeti */
function invSummary() {
  if (!S.inv) return `<span class="chip"><span class="spinner" style="width:12px;height:12px"></span>Bilgisayar taranıyor…</span>`;
  const inst = S.catalog.apps.filter(isInstalled).length;
  const t = new Date(S.inv.scannedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `<span class="chip"><span class="status-dot done"></span>${S.inv.programs.length} program kurulu</span>
    <span class="chip">${I('check', 13)}${inst} katalog programı</span>
    ${S.inv.upgrades.length ? `<button class="chip warn" data-apps-view="updates">${I('download', 13)}${S.inv.upgrades.length} güncelleme</button>` : `<span class="chip ok">${I('shield', 13)}Hepsi güncel</span>`}
    <button class="chip" data-action="rescan" title="Son tarama ${t}">${I('refresh', 13)}${S.invLoading ? 'Taranıyor…' : t}</button>`;
}

PAGES.drivers = () => {
  const sys = S.sys;
  const hw = (bg, icon, label, title, meta) => `<div class="hw"><span class="ic">${I(icon, 22)}</span><small>${label}</small><b>${h(title)}</b><small>${h(meta || '')}</small></div>`;
  const gpus = sys?.gpus || [];
  const drv = S.drivers;
  const gpuDrv = drv?.find((d) => d.cls === 'DISPLAY' && !d.generic);
  const recs = S.recs.map((r) => {
    const job = S.jobs.get(r.key);
    const st = r.status || (r.wingetId ? S.catalog.apps.find((a) => a.wingetId === r.wingetId)?.status : null);
    const installed = st?.installed;
    return `<div class="rec-item">
      ${appIcon(r)}
      <div class="txt"><span class="kicker">${h(r.target)}</span><br><b>${h(r.name)}</b>${installed ? ` <span class="badge">Kurulu${st.version ? ' · v' + h(shortVer(st.version)) : ''}</span>` : ''}${amdNote(r, st)}<p>${h(r.desc)}</p></div>
      ${r.source === 'amd'
        ? `<button class="btn ${installed && !amdNewer(r, st) ? '' : 'primary'} sm" data-install-amd="${r.key}" ${job && ['queued', 'running'].includes(job.status) ? 'disabled' : ''}>${I('download')}${job ? h(statusLabel(job)) : !installed ? 'Kur' : amdNewer(r, st) ? 'Güncelle' : 'Yeniden kur'}</button>`
        : r.source === 'winget'
        ? `<button class="btn ${installed && !st.available ? '' : 'primary'} sm" data-install-rec="${r.key}" ${job && ['queued', 'running'].includes(job.status) ? 'disabled' : ''}>${I(installed ? 'refresh' : 'download')}${job ? h(statusLabel(job)) : installed ? (st.available ? 'Güncelle' : 'Yeniden kur') : 'Kur'}</button>`
        : `<button class="btn sm" data-open="${h(r.url)}">${I('external')}${installed ? 'Güncelini kontrol et' : 'Resmi sayfa'}</button>`}
    </div>`;
  }).join('');

  let wu;
  if (S.scanning) wu = `<div class="empty small"><span class="spinner"></span><p>Windows Update sorgulanıyor… (1-3 dakika)</p></div>`;
  else if (!S.wu) wu = `<div class="empty small"><p>Henüz taranmadı.</p></div>`;
  else if (!S.wu.length) wu = `<div class="empty small"><p>${I('check', 16)}</p><p>Bekleyen sürücü yok, hepsi güncel.</p></div>`;
  else {
    const COMPARE = {
      vendor: ['vendor', 'Genel sürücü yerine üretici sürücüsü'], newer: ['newer', 'Daha yeni sürüm'], same: ['same', 'Aynı sürüm'],
      older: ['older', 'Daha eski sürüm'], different: ['diff', 'Farklı sağlayıcı (sürümler karşılaştırılamaz)'], unknown: ['', 'Eşleşen cihaz bulunamadı'],
    };
    const row = (d) => {
      const [cls, txt] = COMPARE[d.compare] || COMPARE.unknown;
      return `<tr class="${d.firmware ? 'fw-row' : ''}"><td><input type="checkbox" data-wu="${h(d.id)}" ${S.wuSel.has(d.id) ? 'checked' : ''}></td>
        <td><b>${h(d.title)}</b><br><small class="sub mono">${h(d.hwId || '')}${d.hw?.vendor ? ' · ' + h(d.hw.vendor) : ''}</small>${d.firmware ? '<br><span class="badge fw">BIOS / firmware — ayrı onay</span>' : ''}</td>
        <td>${d.devices.length ? d.devices.map((x) => `<b>${h(x.name)}</b>`).join('<br>') : '<span class="sub">—</span>'}</td>
        <td>${d.currentVersion ? `<code>${h(d.currentVersion)}</code> <small class="sub">${h(d.currentProvider || '')}</small>` : '<span class="sub">—</span>'}<br>→ <code class="new">${h(d.newVersion || '?')}</code> <small class="sub">${h(d.provider || '')}</small><br><span class="cmp ${cls}">${h(txt)}</span></td>
        <td>${h(d.date || '-')}<br><small class="sub">${d.sizeMB} MB · yeniden başlatma: ${h(d.rebootText || '?')}</small></td></tr>`;
    };
    const normal = S.wu.filter((d) => !d.firmware), fw = S.wu.filter((d) => d.firmware);
    wu = `<table class="table wu"><thead><tr><th><input type="checkbox" data-wu-all ${normal.length && normal.every((d) => S.wuSel.has(d.id)) ? 'checked' : ''}></th><th>Sürücü</th><th>Hedef cihaz</th><th>Mevcut → yeni</th><th>Tarih</th></tr></thead><tbody>
      ${normal.map(row).join('')}
      ${fw.length ? `<tr><td colspan="5" class="fw-head">${I('alert', 14)} BIOS / UEFI / firmware güncellemeleri otomatik seçilmez; kurulum sırasında elektrik kesilirse kart açılmayabilir.</td></tr>${fw.map(row).join('')}` : ''}
    </tbody></table>
    <div class="row" style="margin-top:12px"><span class="sub">${S.wuSel.size} / ${S.wu.length} seçili · kurulumdan önce sistem geri yükleme noktası alınır</span><span class="spacer"></span><button class="btn primary sm" data-action="install-wu" ${S.wuSel.size ? '' : 'disabled'}>${I('download')}Seçilenleri kur</button></div>`;
  }

  const installedTable = !drv
    ? `<div class="empty"><span class="spinner"></span><p>Kurulu sürücüler okunuyor…</p></div>`
    : `<table class="table drv"><thead><tr><th>Aygıt</th><th>Donanım kimliği</th><th>Sağlayıcı</th><th>Sürüm</th><th>Tarih</th></tr></thead><tbody>
      ${drv.map((d) => `<tr><td><span class="kicker">${h(d.group)}</span><br><b>${h(d.name)}</b></td>
        <td>${d.hw?.vendorId ? `<span class="mono">${h(d.hw.bus)} ${h(d.hw.vendorId)}:${h(d.hw.deviceId || '----')}</span><br><small class="sub">${h(d.hw.vendor || 'bilinmeyen üretici')}</small>` : '<span class="sub">—</span>'}</td>
        <td>${h(d.provider || '-')}</td><td><code>${h(d.version)}</code></td>
        <td><span class="age ${ageClass(d.ageMonths)}">${h(d.generic ? 'Temel sürücü!' : d.date || '-')}</span><br><small class="sub">${h(ageText(d.ageMonths))}</small></td></tr>`).join('')}
    </tbody></table>`;
  const old = (drv || []).filter((d) => d.ageMonths >= 24).length;
  const problems = sys?.problemDevices || [];
  const wuCount = S.wu ? S.wu.filter((d) => !d.firmware).length : null;
  const title = S.scanning ? 'Sürücüler taranıyor…' : problems.length ? `${problems.length} cihazın sürücüsü sorunlu` : wuCount ? `${wuCount} sürücü güncellemesi var` : S.wu ? 'Tüm sürücüler güncel' : 'Sürücü durumu';
  const lead = S.scanning ? 'Windows Update donanım kimliklerine göre sorgulanıyor (1-3 dakika).'
    : problems.length ? "Aygıt Yöneticisi'nde sürücüsü eksik ya da hatalı görünen cihazlar var."
    : wuCount ? 'Microsoft\'un bu bilgisayar için onayladığı sürücüler. Kurmadan önce geri yükleme noktası alınır.'
    : 'Donanımın Microsoft ve üretici kaynaklarıyla karşılaştırıldı.';
  return `
    ${adminBanner()}
    <div class="page-head"><div><h1>Sürücüler</h1><p>Bu bilgisayardaki sürücülerin durumu ve güncel sürümleri</p></div>
      <button class="btn" data-action="refresh-sys">${I('refresh')}Yeniden algıla</button></div>
    <section class="page-banner mesh lilac">
      <div><span class="kicker">Durum</span><h2>${title}</h2><p>${lead}</p>
        <div class="row">${wuCount ? `<button class="btn primary" data-action="install-wu" ${S.wuSel.size ? '' : 'disabled'}>${I('download')}Seçilenleri kur (${S.wuSel.size})</button>` : ''}
          <button class="btn" data-action="scan-wu" ${S.scanning ? 'disabled' : ''}>${S.scanning ? '<span class="spinner"></span>' : I('search')}${S.wu ? 'Yeniden tara' : 'Tara'}</button></div></div>
      <div class="banner-stats">
        <div class="stat glass"><b>${drv ? drv.length : '…'}</b><span>donanım sürücüsü</span></div>
        <div class="stat glass"><b style="${problems.length ? 'color:var(--danger)' : ''}">${sys ? problems.length : '…'}</b><span>sorunlu cihaz</span></div>
        <div class="stat glass"><b>${S.wu ? S.wu.length : S.scanning ? '…' : '—'}</b><span>Windows Update</span></div>
        <div class="stat glass"><b>${drv ? old : '…'}</b><span>2 yıldan eski</span></div>
      </div>
    </section>
    <div class="hw-grid">
      ${hw('', 'cpu', 'İşlemci', sys?.cpu.name || '…', sys ? `${sys.cpu.cores} çekirdek / ${sys.cpu.threads} iş parçacığı` : '')}
      ${gpus.filter((g) => !/basic|microsoft/i.test(g.name) || gpus.length === 1).map((g) => hw('', 'gpu', 'Ekran kartı', g.name, g.driver ? `Sürücü ${g.driver}${gpuDrv ? ' · ' + ageText(gpuDrv.ageMonths) : ''}` : '')).join('') || hw('', 'gpu', 'Ekran kartı', '…')}
      ${hw('', 'board', 'Anakart', sys ? boardName(sys) : '…', sys ? `BIOS ${sys.bios.version}` : '')}
      ${hw('', 'windows', 'Sistem', sys?.os.name || '…', sys ? `Derleme ${sys.os.build} · ${sys.ramGB} GB RAM · C: ${sys.disk.freeGB}/${sys.disk.totalGB} GB boş` : '')}
    </div>
    ${problems.length ? `<div class="card" style="margin-top:14px"><div class="card-head"><div><h3>Sorunlu cihazlar</h3><p class="sub">Aygıt Yöneticisi'nde sürücüsü eksik veya hatalı görünenler</p></div></div>
      <div class="rec-list">${problems.map((p) => `<div class="rec-item"><span style="color:var(--danger)">${I('alert')}</span><div class="txt"><b>${h(p.name || 'Bilinmeyen aygıt')}</b><p>Hata kodu ${p.code} · ${h(p.id)}</p></div></div>`).join('')}</div></div>` : ''}
    <div class="card" style="margin-top:14px" data-anchor="wu"><div class="card-head"><div><h3>Windows Update sürücüleri</h3><p class="sub">Donanım kimliğine göre bu bilgisayar için onaylı, henüz kurulmamış sürücüler</p></div></div><div class="table-wrap">${wu}</div></div>
    <div class="card" style="margin-top:14px" data-anchor="vendor"><div class="card-head"><div><h3>Üretici araçları</h3><p class="sub">Algılanan donanıma göre; kurulu olanlar işaretli</p></div></div><div class="rec-list">${recs || '<div class="empty"><span class="spinner"></span></div>'}</div></div>
    <div class="card" style="margin-top:14px" data-anchor="installed"><div class="card-head"><div><h3>Kurulu sürücüler</h3><p class="sub">Yeşil: 1 yıldan yeni · Sarı: 1-2 yıl · Kırmızı: 2 yıldan eski</p></div><button class="btn sm" data-action="reload-drivers">${I('refresh')}Yenile</button></div><div class="table-wrap">${installedTable}</div></div>`;
};
/** AMD paketinin resmi sayfadaki güncel sürümü (öneri kartında) */
const amdLatestOf = (r) => S.amdLatest?.[r.amdKind];
const amdNewer = (r, st) => {
  const v = amdLatestOf(r)?.version;
  if (!v || !st?.version) return false;
  const a = v.split('.').map(Number), b = String(st.version).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};
function amdNote(r, st) {
  if (r.source !== 'amd') return '';
  const l = amdLatestOf(r);
  if (!S.amdLatest) return ' <span class="badge star">güncel sürüm denetleniyor…</span>';
  if (!l || l.error) return ` <span class="badge fw">${h(l?.error || 'AMD sayfası okunamadı')}</span>`;
  return ` <span class="badge ${!st?.installed || amdNewer(r, st) ? 'upd' : ''}">amd.com: v${h(l.version)} · ${(l.size / 1048576).toFixed(0)} MB</span>`;
}

PAGES.driversAfter = () => {
  if (!S.amdLatest && !S.amdLoading && S.recs.some((r) => r.source === 'amd')) {
    S.amdLoading = true;
    api.drivers.amdLatest().then((x) => { S.amdLatest = x; }).catch((e) => { S.amdLatest = { gpu: { error: e.message }, chipset: { error: e.message } }; })
      .finally(() => { S.amdLoading = false; if (S.page === 'drivers') renderPage(); });
  }
  if (!S.drivers && !S.driversLoading) loadDrivers();
  if (!S.wu && !S.scanning && !S.wuAuto) { S.wuAuto = true; scanWU(); }
};

PAGES.apps = () => {
  const q = S.query.toLowerCase();
  const view = S.appsView || 'catalog';
  const tabs = `<div class="seg view-tabs">
      <button class="${view === 'catalog' ? 'active' : ''}" data-apps-view="catalog">${I('package', 14)}Katalog</button>
      <button class="${view === 'pc' ? 'active' : ''}" data-apps-view="pc">${I('windows', 14)}Bu bilgisayar${S.inv ? ` <em>${S.inv.programs.length}</em>` : ''}</button>
      <button class="${view === 'updates' ? 'active' : ''}" data-apps-view="updates">${I('download', 14)}Güncellemeler${S.inv?.upgrades.length ? ` <em class="hot">${S.inv.upgrades.length}</em>` : ''}</button>
    </div>`;
  const head = `
    ${adminBanner()}
    <div class="page-head"><div><h1>Programlar</h1><p>Bu bilgisayarda ne kurulu, hangi sürümde, neyin güncellemesi var — hepsi tek yerde</p></div>
      <div class="row">${view === 'catalog' ? `<button class="btn" data-action="select-rec">${I('star')}Önerilenleri seç</button>` : ''}<button class="btn primary" data-action="add-app">${I('plus')}Program ekle</button></div></div>
    <div class="row inv-row">${invSummary()}</div>
    ${(S.appsView || 'catalog') === 'catalog' ? profilesRow() : ''}
    <div class="toolbar"><label class="search">${I('search')}<input id="appSearch" placeholder="${view === 'pc' ? 'Bu bilgisayarda ara…' : 'Program ara…'}" value="${h(S.query)}"></label></div>`;

  if (view === 'pc') {
    const list = (S.inv?.programs || []).filter((p) => !q || p.name.toLowerCase().includes(q) || (p.publisher || '').toLowerCase().includes(q));
    return head + (!S.inv ? `<div class="card empty"><span class="spinner"></span><p>Kurulu programlar okunuyor…</p></div>` : `
      <div class="card"><div class="table-wrap"><table class="table progs"><thead><tr><th>Program</th><th>Sürüm</th><th>Yayıncı</th><th>Boyut</th><th></th></tr></thead><tbody>
      ${list.map((p) => {
        const job = p.wingetId && S.jobs.get('upg_' + p.wingetId);
        return `<tr><td><div class="row" style="flex-wrap:nowrap">${appIcon({ name: p.name, color: colorFor(p.name), icon: p.icon }, 30)}<div><b>${h(p.name)}</b>${p.wingetId ? `<br><small class="sub mono">${h(p.wingetId)}</small>` : p.store ? '<br><small class="sub">Microsoft Store</small>' : ''}</div></div></td>
        <td><code>${h(shortVer(p.version) || '-')}</code></td><td class="sub">${h(p.publisher || '-')}</td><td class="sub">${p.sizeMB ? (p.sizeMB >= 1024 ? (p.sizeMB / 1024).toFixed(1) + ' GB' : p.sizeMB + ' MB') : '-'}</td>
        <td>${p.available ? `<button class="btn primary sm" data-upgrade="${h(p.wingetId)}" data-upgrade-name="${h(p.name)}" ${job && ['queued', 'running'].includes(job.status) ? 'disabled' : ''}>${I('download')}${job ? h(statusLabel(job)) : `v${h(shortVer(p.available))}`}</button>` : p.wingetId ? `<span class="badge">Güncel</span>` : ''}</td></tr>`;
      }).join('')}
      </tbody></table></div>${list.length ? '' : '<div class="empty">Sonuç yok.</div>'}</div>`);
  }

  if (view === 'updates') {
    const ups = (S.inv?.upgrades || []).filter((u) => !q || u.name.toLowerCase().includes(q));
    return head + (!S.inv ? `<div class="card empty"><span class="spinner"></span><p>Güncellemeler denetleniyor…</p></div>`
      : !ups.length ? `<div class="card empty small">${I('shield', 26)}<h3>Her şey güncel</h3><p>winget ile yönetilen tüm programlar en son sürümde.</p></div>`
      : `<div class="card"><div class="row" style="margin-bottom:10px"><b>${ups.length} programın yeni sürümü var</b><span class="spacer"></span><button class="btn primary" data-action="upgrade-all" ${S.running ? 'disabled' : ''}>${I('download')}Tümünü güncelle</button></div>
        <div class="rec-list">${ups.map((u) => {
          const job = S.jobs.get('upg_' + u.id);
          return `<div class="rec-item">${appIcon({ name: u.name, color: colorFor(u.name) })}<div class="txt"><b>${h(u.name)}</b><p><code>${h(shortVer(u.version))}</code> → <code class="new">${h(shortVer(u.available))}</code> · <span class="mono">${h(u.id)}</span></p></div>
            ${job?.needsReinstall
              ? `<button class="btn sm" data-job-reinstall="${h(job.key)}" title="${h(job.message)}">${I('refresh')}Kaldırıp yeniden kur</button>`
              : `<button class="btn primary sm" data-upgrade="${h(u.id)}" data-upgrade-name="${h(u.name)}" ${job && ['queued', 'running'].includes(job.status) ? 'disabled' : ''}>${I('download')}${job ? h(statusLabel(job) + (job.status === 'running' ? ' %' + job.percent : '')) : 'Güncelle'}</button>`}</div>
            ${job?.needsReinstall ? `<p class="sub" style="margin:-4px 0 6px 58px;font-size:12.5px">${h(job.message)}</p>` : ''}`;
        }).join('')}</div></div>`);
  }

  const visible = S.catalog.apps.filter((a) => (S.cat === 'all' || a.category === S.cat) && (!q || a.name.toLowerCase().includes(q) || (a.desc || '').toLowerCase().includes(q)));
  const count = (id) => S.catalog.apps.filter((a) => a.category === id).length;
  const cats = [{ id: 'all', name: 'Tümü' }, { id: 'installed', name: 'Kurulu' }, ...S.catalog.categories].filter((c) => ['all', 'installed', 'custom'].includes(c.id) || count(c.id));
  const shown = S.cat === 'installed' ? S.catalog.apps.filter((a) => isInstalled(a) && (!q || a.name.toLowerCase().includes(q))) : visible;
  const card = (a) => {
    const job = S.jobs.get(a.key);
    const st = a.status || {};
    const badge = st.installed
      ? (st.available ? `<span class="badge upd">${I('download', 11)} v${h(shortVer(st.available))} mevcut</span>` : `<span class="badge">${I('check', 11)} Kurulu${st.version ? ' · v' + h(shortVer(st.version)) : ''}</span>`)
      : a.recommended ? '<span class="badge star">Önerilen</span>' : '';
    return `<button class="app-card ${S.selection.has(a.key) ? 'sel' : ''} ${st.installed ? 'inst' : ''}" data-toggle="${a.key}" title="${st.installed ? (st.available ? 'Seçersen güncellenir' : 'Kurulu — seçersen yeniden kurulur/onarılır') : 'Seçersen kurulur'}">
      ${appIcon(a)}
      <span class="txt"><b>${h(a.name)}</b><small>${h(job ? `${statusLabel(job)} · ${job.message}` : a.desc || sourceLabel(a))}</small>${badge}</span>
      <span class="check">${I('check', 14)}</span>
      ${a.custom ? `<span class="del" data-remove="${a.key}" title="Kaldır">${I('trash', 14)}</span>` : ''}
      ${job && job.status === 'running' ? `<span class="mini-prog"><i style="width:${job.percent}%"></i></span>` : ''}
    </button>`;
  };
  const groups = S.cat === 'all' && !q
    ? S.catalog.categories.map((c) => {
      const items = visible.filter((a) => a.category === c.id);
      if (!items.length) return '';
      return `<div class="section-title">${h(c.name)} <em>${items.filter(isInstalled).length}/${items.length} kurulu</em></div><div class="grid">${items.map(card).join('')}</div>`;
    }).join('')
    : `<div class="grid">${shown.map(card).join('')}</div>${shown.length ? '' : '<div class="empty">Sonuç yok.</div>'}`;
  const selApps = selectedApps();
  const toInstall = selApps.filter((a) => !isInstalled(a)).length;
  const toUpdate = selApps.filter((a) => a.status?.available).length;
  return head + `
    <div class="cats">${cats.map((c) => `<button class="cat ${S.cat === c.id ? 'active' : ''}" data-cat="${c.id}">${h(c.name)}<em>${c.id === 'all' ? S.catalog.apps.length : c.id === 'installed' ? S.catalog.apps.filter(isInstalled).length : count(c.id)}</em></button>`).join('')}</div>
    ${S.cat === 'custom' && !count('custom') ? `<div class="card empty">${I('plus', 28)}<p>Kendi programlarını ekle: winget kataloğundan ara, indirme bağlantısı ver, npm paketi ya da PowerShell komutu yaz.</p><button class="btn primary" data-action="add-app">Program ekle</button></div>` : groups}
    ${selApps.length ? `<div class="sticky-bar"><b>${selApps.length} seçili</b><span class="sub-light">${toInstall} kurulacak${toUpdate ? ` · ${toUpdate} güncellenecek` : ''}${selApps.length - toInstall - toUpdate > 0 ? ` · ${selApps.length - toInstall - toUpdate} zaten güncel` : ''}</span><span class="spacer"></span><button class="btn sm" data-action="clear-sel">Temizle</button><button class="btn sm go" data-action="install-sel" ${S.running ? 'disabled' : ''}>${I('download')}Seçilenleri kur</button></div>` : ''}`;
};
PAGES.appsAfter = () => {
  const inp = $('#appSearch');
  inp.addEventListener('input', () => {
    S.query = inp.value;
    const pos = inp.selectionStart;
    renderPage();
    const n = $('#appSearch'); n.focus(); n.setSelectionRange(pos, pos);
  });
};

PAGES.assistant = () => {
  const msgs = S.chat.map((m) => {
    if (m.role === 'tool') return `<div class="tool-note">${I('terminal', 13)} ${h(m.content)}</div>`;
    if (m.role === 'proposal') return `<div class="msg"><span class="av">${I('sparkles', 16)}</span><div class="bubble"><div class="proposal"><b>Kurulum önerisi</b><p class="sub" style="margin:4px 0 0">${h(m.reason)}</p><div class="row">${m.apps.map((a) => `<span class="chip">${appIcon(a, 18)}${h(a.name)}</span>`).join('')}</div><button class="btn primary sm" data-proposal="${m.id}" ${m.used ? 'disabled' : ''}>${I('download')}${m.used ? 'Kuyruğa eklendi' : 'Onayla ve kur'}</button></div></div></div>`;
    const me = m.role === 'user';
    return `<div class="msg ${me ? 'me' : ''}">${me ? '' : `<span class="av">${I('sparkles', 16)}</span>`}<div class="bubble"><div class="who"><span>${me ? 'Sen' : 'Orbit'}</span><span>${m.time}</span></div>${h(m.content)}</div></div>`;
  }).join('');
  const provider = S.settings.aiProvider === 'ollama' ? `Ollama · ${S.settings.ollamaModel}` : `Claude · ${S.settings.model}`;
  const ready = S.settings.aiProvider === 'ollama' || S.settings.hasApiKey;
  const tabs = `<div class="seg dark"><button class="${S.asstTab !== 'memory' ? 'active' : ''}" data-asst-tab="chat">${I('sparkles', 15)}Sohbet</button><button class="${S.asstTab === 'memory' ? 'active' : ''}" data-asst-tab="memory">${I('star', 15)}Hafıza</button></div>`;
  if (S.asstTab === 'memory') {
    return `<div class="page-head"><div><h1>Hafıza</h1><p>Orbit'in senin hakkında bildikleri · ${h(provider)}</p></div></div>${memoryView()}`;
  }
  return `
    <div class="page-head"><div><h1>Asistan</h1><p>Seni tanıyan ve sürekli öğrenen kişisel yapay zekan · ${h(provider)}</p></div>
      <div class="row"><button class="btn" data-action="clear-chat">${I('trash')}Sohbeti temizle</button></div></div>
    ${ready ? '' : `<div class="banner">${I('sparkles')}<p>Asistanı kullanmak için Ayarlar'dan Claude API anahtarı ekleyin veya yerel model (Ollama) seçin.</p><button class="btn primary sm" data-nav="settings">Ayarlara git</button></div>`}
    <div class="card chat">
      <div class="chat-list" id="chatList">
        ${msgs ? '' : `<div class="chat-hero"><div class="orb mesh lilac"></div><h2>Bugün ne yapalım?</h2><p class="sub">Donanımını okuyabilir, sürücüleri tarayabilir ve senin onayınla program kurabilirim.</p></div>`}
        ${msgs}
        ${S.thinking ? `<div class="msg"><span class="av">${I('sparkles', 16)}</span><div class="bubble"><span class="spinner"></span></div></div>` : ''}
      </div>
      <div class="suggest">
        ${['Bilgisayarımın donanımını özetle', 'Web geliştirme için ne kurmalıyım?', 'Eksik sürücü var mı?', 'Oyun için gerekli programları öner'].map((s) => `<button class="chip" data-suggest="${h(s)}">${h(s)}</button>`).join('')}
      </div>
      <form class="composer" id="chatComposer"><input id="chatInput" placeholder="Bir şey sor veya iste…" autocomplete="off" ${S.thinking ? 'disabled' : ''}><button class="send" type="submit">${I('send')}</button></form>
    </div>`;
};
PAGES.assistantAfter = () => {
  if (S.asstTab === 'memory') return memoryAfter();
  const list = $('#chatList'); list.scrollTop = list.scrollHeight;
  $('#chatComposer').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('#chatInput').value); });
  if (!S.thinking) $('#chatInput').focus();
};

PAGES.settings = () => {
  const s = S.settings;
  const sw = (key, label, hint) => `<label class="switch"><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
  const hist = (S.historyCache || []).slice(0, 40);
  return `
    <div class="page-head"><div><h1>Ayarlar</h1><p>Her değişiklik anında kaydedilir</p></div>
      <span class="chip saved" id="savedChip" hidden>${I('check', 14)}Kaydedildi</span></div>
    <div class="two" style="margin-top:0">
      <div class="card form">
        <h3>Profil</h3>
        <div class="field"><label>Adın</label><input class="input" data-auto="userName" value="${h(s.userName)}" placeholder="Asistan sana böyle hitap eder"></div>
        <div class="field"><label>Tema</label><div class="seg dark" style="justify-self:start"><button class="${s.theme !== 'dark' ? 'active' : ''}" data-theme-set="light">Açık</button><button class="${s.theme === 'dark' ? 'active' : ''}" data-theme-set="dark">Koyu</button></div></div>
        <div class="field"><label>Kurulum profili</label><small>Seçtiğin programlar, özel programların ve RGB profillerin tek dosyada. Format öncesi dışa aktarıp USB'de sakla; format sonrası içe aktar ve "Hepsini Kur".</small>
          <div class="row"><button class="btn" data-action="export">${I('upload')}Dışa aktar</button><button class="btn" data-action="import">${I('download')}İçe aktar</button></div></div>
      </div>
      <div class="card form" data-anchor="ai">
        <h3>Yapay Zeka</h3>
        <div class="field"><label>Sağlayıcı</label>
          <select class="input" data-auto="aiProvider"><option value="anthropic" ${s.aiProvider === 'anthropic' ? 'selected' : ''}>Claude (Anthropic API)</option><option value="ollama" ${s.aiProvider === 'ollama' ? 'selected' : ''}>Ollama (yerel, internetsiz)</option></select></div>
        <div class="field"><label>Claude modeli</label>
          <select class="input" data-auto="model">${['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].map((m) => `<option ${s.model === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Claude API anahtarı</label>
          <div class="row"><input class="input" id="setKey" type="password" autocomplete="off" placeholder="${s.hasApiKey ? '•••••••••••• kayıtlı' : 'sk-ant-…  (yapıştırınca otomatik kaydedilir)'}" style="flex:1">
          ${s.hasApiKey ? `<button class="btn" data-action="clear-key">${I('trash')}Sil</button>` : ''}</div>
          <small>${s.hasApiKey ? '✓ Anahtar kayıtlı. ' : ''}Windows hesabınla şifrelenerek yalnızca bu bilgisayarda saklanır.</small></div>
        <div class="field"><label>Ollama modeli / adresi</label><div class="row"><input class="input" data-auto="ollamaModel" value="${h(s.ollamaModel)}" style="flex:1"><input class="input" data-auto="ollamaUrl" value="${h(s.ollamaUrl)}" style="flex:1.4"></div></div>
      </div>
    </div>
    <div class="two">
      <div class="card form" data-anchor="startup">
        <h3>Başlangıç ve arka plan</h3>
        ${sw('startWithWindows', 'Windows açılınca arka planda başlat', 'Son RGB görünümün her açılışta otomatik geri gelir.')}
        ${sw('minimizeToTray', 'Kapatınca sistem tepsisine küçült', 'Işık efektleri ve güncelleme denetimi çalışmaya devam eder.')}
      </div>
      <div class="card form" data-anchor="update">
        <h3>Güncellemeler ve hakkında</h3>
        <p class="sub"><b>Orbit</b>, wexon.dev'in ürünüdür ve yalnızca ${h(S.settings.userName || 'sana')} için özelleştirilir.</p>
        <p class="sub">Orbit <b>v${h(S.version)}</b> · ${h(updateText())}</p>
        <div class="row"><button class="btn" data-action="update-check">${I('refresh')}Güncellemeleri denetle</button>
          ${S.update.state === 'available' ? `<button class="btn primary" data-action="update-download">v${h(S.update.version)} indir</button>` : ''}
          ${S.update.state === 'ready' ? `<button class="btn primary" data-action="update-install">Yeniden başlat ve güncelle</button>` : ''}</div>
        <label class="switch"><input type="checkbox" data-setting="bridgeEnabled" ${s.bridgeEnabled ? 'checked' : ''}><span>Claude bağlantısı (MCP eklentisi)<small>Yalnızca bu bilgisayardan, gizli anahtarla erişilen yerel köprü. Claude durumu okuyabilir, sayfaları test edebilir; kurulum gibi işlemler yine senin onayını ister.</small></span></label>
        ${s.bridgeEnabled && S.bridgeInfo ? `<div class="panel-url"><span class="mono" style="font-size:11.5px">${h(S.bridgeInfo.command)}</span><button class="btn sm" data-action="copy-mcp">Kopyala</button></div><small class="sub">Bu komutu bir terminalde çalıştırınca Claude Code, Orbit'i araç olarak görür (Node.js gerekir).</small>` : ''}
        <div class="row"><button class="btn" data-action="open-logs">${I('terminal')}Günlük klasörü</button><button class="btn" data-open="https://github.com/mlevncomm/orbit/releases">${I('external')}Sürüm notları</button></div>
      </div>
    </div>
    <div class="card" style="margin-top:14px" data-anchor="history"><h3>Kurulum geçmişi</h3><div class="sub" style="margin-top:8px">
      ${hist.length ? `<table class="table"><tbody>${hist.map((x) => `<tr><td>${h(x.name)}</td><td><span class="status-dot ${x.status}" style="display:inline-block"></span> ${h(statusLabel(x))}</td><td>${new Date(x.at).toLocaleString('tr-TR')}</td></tr>`).join('')}</tbody></table>` : 'Henüz kurulum yapılmadı.'}
    </div></div>`;
};
PAGES.settingsAfter = () => {
  // Metin alanları yazmayı bırakınca, seçimler anında kaydedilir
  document.querySelectorAll('[data-auto]').forEach((el) => {
    const commit = () => saveSetting({ [el.dataset.auto]: el.value.trim() });
    if (el.tagName === 'SELECT') el.addEventListener('change', commit);
    else { el.addEventListener('input', debounce(commit, 500)); el.addEventListener('blur', commit); }
  });
  const key = $('#setKey');
  const saveKey = async () => {
    const v = key.value.trim();
    if (!v) return;
    if (!/^sk-ant-/.test(v)) return toast('Anahtar "sk-ant-" ile başlamalı', true);
    await saveSetting({ apiKey: v });
    toast('API anahtarı kaydedildi');
    renderPage();
  };
  key.addEventListener('change', saveKey);
  key.addEventListener('paste', () => setTimeout(saveKey, 50));
  if (!S.historyCache) safe(() => api.history.get()).then((hst) => { S.historyCache = hst || []; if (S.page === 'settings') renderPage(); });
  api.bridge.info().then((b) => { const changed = JSON.stringify(b) !== JSON.stringify(S.bridgeInfo); S.bridgeInfo = b; if (changed && S.page === 'settings') renderPage(); }).catch(() => {});
};

function updateText() {
  const u = S.update;
  return {
    dev: 'geliştirme modunda güncelleme denetlenmez',
    idle: 'henüz denetlenmedi',
    checking: 'denetleniyor…',
    latest: 'en güncel sürümü kullanıyorsun',
    available: `v${u.version} mevcut`,
    downloading: `indiriliyor %${u.percent || 0}`,
    ready: `v${u.version} kurulmaya hazır`,
    error: `denetlenemedi (${u.error || 'bağlantı'})`,
  }[u.state] || u.state;
}

/* ---------- Akış ---------- */
function statusLabel(j) {
  return { queued: 'Sırada', running: { download: 'İndiriliyor', install: 'Kuruluyor', verify: 'Doğrulanıyor' }[j.phase] || 'Hazırlanıyor', done: 'Tamamlandı', skipped: 'Zaten güncel', warn: 'Doğrulanamadı', error: 'Hata', cancelled: 'İptal' }[j.status] || j.status;
}
function sourceLabel(a) {
  return { winget: `winget · ${a.wingetId}`, url: 'Doğrudan indirme', npm: `npm · ${a.npmPkg}`, command: 'Komut (güvenlik nedeniyle artık desteklenmiyor)' }[a.source] || '';
}

function renderFeed() {
  const list = $('#feedList');
  if (!S.feed.length) {
    list.innerHTML = `<div class="msg"><span class="av">${I('logo', 16)}</span><div class="bubble"><div class="who"><span>Orbit</span><span>${time()}</span></div>Hazırım. Panelden “Hepsini Kur”a bas ya da programları tek tek seç.</div></div>`;
  } else {
    list.innerHTML = S.feed.map((f) => {
      if (f.type === 'job') {
        const j = S.jobs.get(f.key) || {};
        const color = j.color || '#555';
        return `<div class="msg"><span class="av">${I('download', 15)}</span><div class="bubble" style="padding:6px;min-width:220px">
          <div class="job ${j.status}"><div class="job-head"><span class="app-ic" style="background:${h(color)}">${h(initials(j.name || '?'))}</span><b>${h(j.name)}</b><span class="status-dot ${j.status}"></span></div>
          ${j.status === 'running' && j.percent == null
            ? '<div class="bar indet"><i></i></div>'
            : `<div class="bar"><i style="width:${['done', 'skipped', 'error', 'warn'].includes(j.status) ? 100 : j.percent || 0}%"></i></div>`}
          <small title="${h(j.error || j.message || '')}">${h(statusLabel(j))}${j.message ? ' · ' + h(j.message) : ''}</small>
          ${j.needsReinstall ? `<div class="job-actions"><button data-job-reinstall="${h(j.key)}">${I('refresh', 12)}Kaldırıp yeniden kur</button></div>`
            : ['error', 'warn', 'cancelled'].includes(j.status) ? `<div class="job-actions"><button data-job-retry="${h(j.key)}">${I('refresh', 12)}Yeniden dene</button></div>` : ''}
          ${j.status === 'queued' ? `<div class="job-actions"><button data-job-skip="${h(j.key)}">${I('x', 12)}Atla</button></div>` : ''}</div></div></div>`;
      }
      const me = f.type === 'me';
      return `<div class="msg ${me ? 'me' : ''}">${me ? '' : `<span class="av">${I('logo', 16)}</span>`}<div class="bubble"><div class="who"><span>${me ? 'Sen' : 'Orbit'}</span><span>${f.time}</span></div>${f.html || h(f.text)}</div></div>`;
    }).join('');
  }
  list.scrollTop = list.scrollHeight;
  const live = $('#feedLive');
  const active = [...S.jobs.values()].filter((j) => ['queued', 'running'].includes(j.status)).length;
  live.className = 'live' + (S.running ? ' busy' : '');
  live.innerHTML = `<i></i> ${S.running ? `${active} işlem sürüyor` : S.admin ? 'Hazır · yönetici' : 'Hazır'}`;
}

/* ---------- Kurulum ---------- */
async function startInstall(items, label) {
  if (!items.length) return toast('Kurulacak bir şey seçilmedi');
  items.forEach((it) => {
    const prev = S.jobs.get(it.key);
    S.jobs.set(it.key, { key: it.key, name: it.name, color: it.color, status: 'queued', percent: null, message: 'Sırada' });
    if (!prev || !S.feed.some((f) => f.type === 'job' && f.key === it.key)) pushFeed({ type: 'job', key: it.key });
    else { S.feed = S.feed.filter((f) => !(f.type === 'job' && f.key === it.key)); pushFeed({ type: 'job', key: it.key }); }
  });
  pushFeed({ type: 'me', text: label || `${items.length} öğeyi kur` });
  const plain = items.map(({ key, name, source, wingetId, wingetSource, url, args, npmPkg, ids, color, amdKind }) => ({ key, name, source, wingetId, wingetSource, url, args, npmPkg, ids, color, amdKind }));
  await safe(() => api.install.run(plain), 'Kurulum başlatılamadı');
}

function oneClickItems() {
  const items = [];
  if (S.opts.vendor) S.recs.filter((r) => r.auto && r.source === 'winget').forEach((r) => items.push(r));
  if (S.opts.wu) items.push({ key: 'wu_drivers', name: 'Windows Update Sürücüleri', source: 'wudrivers', color: '#0078d4', ids: [] });
  if (S.opts.apps) selectedApps().forEach((a) => items.push(a));
  return items;
}

api.install.onProgress((p) => {
  const j = S.jobs.get(p.key) || { key: p.key, name: p.name };
  Object.assign(j, p);
  S.jobs.set(p.key, j);
  renderFeed();
  // Sayfa açıkken yalnızca ilgili sayfayı yenile (input odak kaybını önlemek için arama sayfasında hafif güncelleme)
  if (S.page === 'dashboard' || S.page === 'drivers') renderPage();
  else if (S.page === 'apps' && document.activeElement?.id !== 'appSearch') renderPage();
});

api.install.onState(async (st) => {
  S.running = st.running;
  $('#bellDot').hidden = st.running;
  if (!st.running) {
    $('#bellDot').hidden = false;
    const reboot = st.reboot || S.opts.reboot;
    pushFeed({
      type: 'sys',
      html: `Kurulum bitti: <b>${st.done}</b> doğrulandı${st.warn ? `, <b style="color:var(--warn)">${st.warn}</b> doğrulanamadı` : ''}${st.failed ? `, <b style="color:var(--danger)">${st.failed}</b> hatalı` : ''}.${reboot ? `<div class="row" style="margin-top:8px"><button class="btn primary sm" data-action="restart">${I('power')}Yeniden başlat</button></div>` : ''}`,
    });
    if (S.opts.reboot && !st.failed) safe(() => api.system.restart());
    loadInstalled();
    hydrateIcons($('#feedList'));
  }
  renderPage();
  renderFeed();
});

/* ---------- Asistan ---------- */
async function sendChat(text) {
  text = String(text || '').trim();
  if (!text || S.thinking) return;
  S.chat.push({ role: 'user', content: text, time: time() });
  S.thinking = true;
  if (S.page !== 'assistant') navigate('assistant'); else renderPage();
  const history = S.chat.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));
  try {
    const r = await api.ai.chat(history);
    S.chat.push({ role: 'assistant', content: r.text || '…', time: time() });
    persistChat();
  } catch (e) {
    S.chat.push({ role: 'assistant', content: '⚠ ' + e.message, time: time() });
  }
  S.thinking = false;
  if (S.page === 'assistant') renderPage();
}
api.ai.onTool((t) => {
  const names = { get_system_info: 'Donanım bilgisi okunuyor', list_catalog: 'Program kataloğu inceleniyor', propose_install: 'Kurulum önerisi hazırlanıyor', scan_driver_updates: 'Windows Update sürücüleri taranıyor' };
  S.chat.push({ role: 'tool', content: names[t.name] || t.name });
  if (S.page === 'assistant') renderPage();
});
api.ai.onProposal((p) => {
  S.chat.push({ role: 'proposal', id: 'p' + Date.now(), ...p });
  persistChat();
  if (S.page === 'assistant') renderPage();
});

/* ---------- Program ekleme penceresi ---------- */
function openAddModal() {
  const m = { tab: 'winget', results: [], picked: null, searching: false };
  const root = $('#modalRoot');
  const draw = () => {
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>Program ekle</h3><button class="icon-btn sm" data-action="close-overlays">${I('x')}</button></div>
      <div class="seg" style="margin-bottom:14px">${[['winget', 'Katalogdan ara'], ['url', 'İndirme linki'], ['npm', 'npm paketi']].map(([k, l]) => `<button type="button" class="${m.tab === k ? 'active' : ''}" data-mtab="${k}">${l}</button>`).join('')}</div>
      <form class="form" id="addForm">
        ${m.tab === 'winget' ? `
          <div class="row"><input class="input" id="mq" placeholder="ör. obsidian, blender, unity" style="flex:1"><button type="button" class="btn primary" id="msearch">${m.searching ? '<span class="spinner"></span>' : I('search')}Ara</button></div>
          <div class="results">${m.results.map((r, i) => `<button type="button" class="result ${m.picked === i ? 'active' : ''}" data-pick="${i}"><span><b>${h(r.name)}</b><br><small>${h(r.id)}</small></span><small>${h(r.version)}</small></button>`).join('') || '<p class="sub">winget deposunda 10.000+ program var. Arayıp seç.</p>'}</div>`
        : `<div class="field"><label>Program adı</label><input class="input" name="name" required placeholder="ör. Benim Aracım"></div>
          ${m.tab === 'url' ? `<div class="field"><label>İndirme bağlantısı (.exe / .msi)</label><input class="input" name="url" required placeholder="https://…/setup.exe"></div>
            <div class="field"><label>Sessiz kurulum parametreleri</label><input class="input" name="args" placeholder="/S  (NSIS) · /VERYSILENT (Inno) · boş = .msi için /qn"><small>Kurulum dosyasının türüne göre değişir.</small></div>` : ''}
          ${m.tab === 'npm' ? `<div class="field"><label>Paket adı</label><input class="input" name="npmPkg" required placeholder="ör. typescript, @angular/cli"><small>npm install -g ile kurulur; Node.js gerekir.</small></div>` : ''}
`}
        <div class="field"><label>Renk</label><input class="input" type="color" name="color" value="#6d5bd0" style="width:80px;padding:4px"></div>
        <div class="row"><span class="spacer"></span><button type="button" class="btn" data-action="close-overlays">Vazgeç</button><button class="btn primary" type="submit">${I('plus')}Ekle ve seç</button></div>
      </form></div>`;
    hydrateIcons(root);
    root.querySelectorAll('[data-mtab]').forEach((b) => b.onclick = () => { m.tab = b.dataset.mtab; draw(); });
    root.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { m.picked = +b.dataset.pick; draw(); });
    const doSearch = async () => {
      const q = $('#mq').value; if (!q.trim()) return;
      m.searching = true; m.q = q; draw(); $('#mq').value = q;
      m.results = (await safe(() => api.catalog.search(q), 'Arama başarısız')) || [];
      m.searching = false; m.picked = null; draw(); $('#mq').value = q;
    };
    if ($('#msearch')) {
      $('#msearch').onclick = doSearch;
      if (m.q) $('#mq').value = m.q;
      $('#mq').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
      $('#mq').focus();
    }
    $('#addForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      let def;
      if (m.tab === 'winget') {
        const r = m.results[m.picked];
        if (!r) return toast('Listeden bir program seçin');
        def = { name: r.name, wingetId: r.id, source: 'winget', desc: `winget · ${r.id}`, color: f.color };
      } else {
        def = { ...f, source: m.tab, desc: { url: 'Doğrudan indirme', npm: `npm · ${f.npmPkg}` }[m.tab] };
        if (m.tab === 'url' && !/^https:\/\//i.test(f.url)) return toast('Bağlantı https:// ile başlamalı', true);
      }
      const item = await safe(() => api.catalog.addCustom(def));
      if (!item) return;
      S.catalog = await api.catalog.get();
      S.selection.add(item.key); persistSelection();
      closeOverlays(); S.cat = 'custom'; renderPage();
      toast(`${item.name} eklendi ve seçildi`);
    };
  };
  $('#scrim').classList.add('show');
  draw();
}
function closeOverlays() {
  $('#modalRoot').innerHTML = '';
  $('#scrim').classList.remove('show');
  $('#app').classList.remove('feed-open');
}

/* ---------- Olaylar ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-section],[data-sub],[data-nav],[data-action],[data-toggle],[data-remove],[data-cat],[data-opt],[data-theme-set],[data-install-rec],[data-install-amd],[data-asst-tab],[data-open],[data-wu],[data-wu-all],[data-suggest],[data-proposal],[data-dash-tab],[data-engine],[data-apps-view],[data-upgrade],[data-job-retry],[data-job-reinstall],[data-job-skip],[data-repair],[data-profile]');
  if (!t) return;
  const d = t.dataset;

  if (d.remove) {
    e.stopPropagation();
    await safe(() => api.catalog.removeCustom(d.remove));
    S.selection.delete(d.remove);
    S.catalog = await api.catalog.get();
    return renderPage();
  }
  if (d.section) {
    const sec = SECTIONS.find((s) => s.id === d.section);
    return goSub(S.lastSub?.[sec.id] || sec.items[0]);
  }
  if (d.sub) { const [sid, i] = d.sub.split(':'); return goSub(SECTIONS.find((s) => s.id === sid).items[+i]); }
  if (d.nav) { navigate(d.nav); if ('focusSearch' in d) $('#appSearch')?.focus(); return; }
  if (d.toggle) { S.selection.has(d.toggle) ? S.selection.delete(d.toggle) : S.selection.add(d.toggle); persistSelection(); return renderPage(); }
  if (d.cat) { S.cat = d.cat; saveUi({ cat: d.cat }); return renderPage(); }
  if (d.dashTab) { S.dashTab = d.dashTab; saveUi({ dashTab: d.dashTab }); return renderPage(); }
  if (d.opt) { S.opts[d.opt] = !S.opts[d.opt]; saveUi({ opts: { ...S.opts } }); return renderPage(); }
  if (d.engine) { await saveSetting({ rgbEngine: d.engine }); return renderPage(); }
  if (d.jobReinstall) {
    const j = S.jobs.get(d.jobReinstall) || {};
    if (!confirm(`${j.name || 'Bu program'} yeni sürümü farklı bir kurulum türünde, üstüne güncellenemiyor.

Eski sürüm kaldırılıp yenisi kurulsun mu? Ayarları genelde korunur; kaldırma başarısız olursa program olduğu gibi bırakılır.`)) return;
    const ok = await safe(() => api.install.reinstall(d.jobReinstall)); if (!ok) toast('Yeniden kurulum başlatılamadı'); return;
  }
  if (d.jobRetry) { const ok = await safe(() => api.install.retry(d.jobRetry)); if (!ok) toast('Yeniden denenemedi'); return; }
  if (d.jobSkip) { await safe(() => api.install.skip(d.jobSkip)); return; }
  if (d.repair) return runRepair(d.repair);
  if (d.profile) {
    const p = S.catalog.profiles.find((x) => x.id === d.profile);
    const st = profileState(p);
    if (!st.missing.length) return toast(`${p.name}: hepsi zaten kurulu`);
    st.missing.forEach((a) => S.selection.add(a.key)); persistSelection();
    return startInstall(st.missing, `${p.name}: ${st.missing.length} eksik program`).then(renderPage);
  }
  if (d.appsView) { S.appsView = d.appsView; S.query = ''; saveUi({ appsView: d.appsView }); if (S.page !== 'apps') return navigate('apps'); return renderPage(); }
  if (d.upgrade) return startInstall([{ key: 'upg_' + d.upgrade, name: d.upgradeName || d.upgrade, source: 'winget', wingetId: d.upgrade, color: colorFor(d.upgradeName || d.upgrade) }], `${d.upgradeName || d.upgrade} güncelle`).then(renderPage);
  if (d.themeSet) return setTheme(d.themeSet);
  if (d.open) return safe(() => api.system.open(d.open));
  if (d.asstTab) { S.asstTab = d.asstTab; saveUi({ asstTab: d.asstTab }); return renderPage(); }
  if (d.installRec) { const r = S.recs.find((x) => x.key === d.installRec); return startInstall([r], `${r.name} kur`); }
  if (d.installAmd) {
    const r = S.recs.find((x) => x.key === d.installAmd);
    const l = amdLatestOf(r);
    const gpu = r.amdKind === 'gpu';
    const msg = `${r.name}${l?.version ? ' v' + l.version : ''} kurulsun mu?\n\n`
      + `• Kaynak: yalnızca amd.com (${l?.size ? (l.size / 1048576).toFixed(0) + ' MB' : 'boyut bilinmiyor'})\n`
      + `• İmza denetlenir: imzalayan "Advanced Micro Devices" değilse kurulmaz\n`
      + `• Kurulumdan önce sistem geri yükleme noktası denenir\n`
      + (gpu ? '• Ekran sürücüsü değişirken ekran birkaç kez kararabilir; açık oyun/video varsa kapat\n' : '')
      + '• Bitince yeniden başlatma önerilir (Orbit kendisi başlatmaz)';
    if (!confirm(msg)) return;
    return startInstall([r], `${r.name} kur`);
  }
  if (d.wuAll !== undefined) { S.wuSel = t.checked ? new Set(S.wu.filter((x) => !x.firmware).map((x) => x.id)) : new Set(); return renderPage(); }
  if (d.wu) { t.checked ? S.wuSel.add(d.wu) : S.wuSel.delete(d.wu); return renderPage(); }
  if (d.suggest) return sendChat(d.suggest);
  if (d.proposal) {
    const p = S.chat.find((m) => m.id === d.proposal);
    p.used = true;
    persistChat();
    const keys = new Set(p.apps.map((a) => a.key));
    keys.forEach((k) => S.selection.add(k)); persistSelection();
    await startInstall(S.catalog.apps.filter((a) => keys.has(a.key)), 'Asistanın önerisini kur');
    return renderPage();
  }

  switch (d.action) {
    case 'one-click': return startInstall(oneClickItems(), 'Hepsini kur');
    case 'cancel': await safe(() => api.install.cancel()); return pushFeed({ type: 'sys', text: 'Kalan işlemler iptal edildi. Çalışan kurulum tamamlanınca durur.' });
    case 'install-sel': return startInstall(selectedApps(), `Seçili ${S.selection.size} programı kur`);
    case 'select-rec': S.catalog.apps.filter((a) => a.recommended).forEach((a) => S.selection.add(a.key)); persistSelection(); return renderPage();
    case 'clear-sel': S.selection.clear(); persistSelection(); return renderPage();
    case 'add-app': return openAddModal();
    case 'close-overlays': return closeOverlays();
    case 'toggle-feed': { const open = $('#app').classList.toggle('feed-open'); $('#scrim').classList.toggle('show', open); $('#bellDot').hidden = true; return; }
    case 'clear-feed': S.feed = []; return renderFeed();
    case 'scan-wu': return scanWU();
    case 'install-wu': {
      const sel = S.wu.filter((d) => S.wuSel.has(d.id));
      const fw = sel.filter((d) => d.firmware);
      const lines = sel.map((d) => `• ${d.title}${d.devices[0] ? ' → ' + d.devices[0].name : ''}`).join('\n');
      if (!confirm(`Şu sürücüler Windows Update'ten kurulacak:\n\n${lines}\n\nKurulumdan önce sistem geri yükleme noktası oluşturulmaya çalışılır (Windows 24 saatte bir izin verir; Sistem Koruması kapalıysa oluşturulamaz). Devam edilsin mi?`)) return;
      if (fw.length && !confirm(`DİKKAT: ${fw.length} BIOS/firmware güncellemesi seçili. Kurulum sırasında elektrik kesilirse kart açılmayabilir. Bunları da kurmak istediğinden emin misin?`)) return;
      return startInstall([{ key: 'wu_drivers', name: 'Windows Update Sürücüleri', source: 'wudrivers', color: '#0078d4', ids: [...S.wuSel] }], `${S.wuSel.size} sürücüyü kur`);
    }
    case 'refresh-sys': S.sys = null; renderPage(); return loadSystem(true);
    case 'relaunch-admin': return safe(() => api.system.relaunchAdmin());
    case 'restart': return safe(() => api.system.restart()).then(() => toast('Bilgisayar 15 saniye içinde yeniden başlatılacak'));
    case 'clear-chat': S.chat = []; persistChat(); return renderPage();
    case 'export': { const p = await safe(() => api.profile.export()); if (p) toast('Profil kaydedildi'); return; }
    case 'import': {
      const ok = await safe(() => api.profile.import());
      if (ok) { S.catalog = await api.catalog.get(); S.selection = new Set(await api.selection.get()); toast('Profil içe aktarıldı'); renderPage(); }
      return;
    }
    case 'open-logs': return safe(() => api.app.openLogs());
    case 'copy-mcp': try { await navigator.clipboard.writeText(S.bridgeInfo.command); toast('Komut kopyalandı'); } catch { toast('Kopyalanamadı', true); } return;
    case 'boot-check': return runBootCheck();
    case 'boot-toggle': S.bootOpen = !S.bootOpen; return renderPage();
    case 'resume-queue': {
      const items = S.pendingQueue || []; S.pendingQueue = [];
      items.forEach((it) => { S.jobs.set(it.key, { ...it, status: 'queued', percent: null, message: 'Sırada' }); pushFeed({ type: 'job', key: it.key }); });
      await safe(() => api.install.resume()); return renderPage();
    }
    case 'discard-queue': S.pendingQueue = []; await safe(() => api.install.discard()); return renderPage();
    case 'rescan': return loadInstalled(true);
    case 'reload-drivers': S.drivers = null; renderPage(); return loadDrivers(true);
    case 'upgrade-all': {
      const ups = S.inv?.upgrades || [];
      await startInstall(ups.map((u) => ({ key: 'upg_' + u.id, name: u.name, source: 'winget', wingetId: u.id, color: colorFor(u.name) })), `${ups.length} programı güncelle`);
      return renderPage();
    }
    case 'update-check': S.update = await safe(() => api.update.check()) || S.update; return renderPage();
    case 'update-download': return safe(() => api.update.download());
    case 'update-install': return safe(() => api.update.install());
    case 'clear-key': await saveSetting({ apiKey: '' }); renderPage(); return toast('Anahtar silindi');
  }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlays(); });
document.addEventListener('change', async (e) => {
  const k = e.target.dataset?.setting;
  if (k) await saveSetting({ [k]: e.target.checked });
});
api.update.onStatus((u) => {
  const prev = S.update.state;
  S.update = u;
  if (u.state === 'available' && prev !== 'available') {
    pushFeed({ type: 'sys', html: `Yeni güncelleme var: <b>v${h(u.version)}</b>. <button class="btn primary sm" data-action="update-download" style="margin-top:6px">İndir</button>` });
    $('#bellDot').hidden = false;
  }
  if (u.state === 'ready' && prev !== 'ready') pushFeed({ type: 'sys', html: `v${h(u.version)} indirildi. <button class="btn primary sm" data-action="update-install" style="margin-top:6px">Yeniden başlat ve güncelle</button>` });
  if (['available', 'downloading', 'ready'].includes(u.state) || S.page === 'settings') renderPage();
});
$('#feedComposer').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#feedInput').value; $('#feedInput').value = ''; pushFeed({ type: 'me', text: v }); sendChat(v); });

async function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  S.settings = await api.settings.set({ theme });
  renderChrome();
  if (S.page === 'settings') renderPage();
}

async function scanWU() {
  S.scanning = true; renderPage();
  pushFeed({ type: 'sys', text: 'Windows Update üzerinde bu bilgisayara uygun sürücüler aranıyor…' });
  const list = await safe(() => api.drivers.scan(), 'Tarama başarısız');
  S.scanning = false;
  if (list) {
    S.wu = list; S.wuSel = new Set(list.filter((x) => !x.firmware).map((x) => x.id));
    pushFeed({ type: 'sys', text: list.length ? `${list.length} sürücü güncellemesi bulundu.` : 'Tüm sürücüler güncel.' });
  }
  renderPage();
}

/* ---------- Açılış ---------- */
async function loadSystem(force) {
  S.sys = await safe(() => api.system.info(force), 'Donanım okunamadı');
  S.recs = (await safe(() => api.drivers.recommend())) || [];
  renderChrome(); renderPage();
  if (S.sys && force !== true) {
    const p = S.sys.problemDevices.length;
    pushFeed({ type: 'sys', html: `Donanım algılandı: <b>${h(S.sys.cpu.name)}</b>, <b>${h(boardName(S.sys))}</b>.${p ? ` <b style="color:var(--danger)">${p}</b> cihazın sürücüsü eksik.` : ' Tüm cihazlar çalışıyor.'}` });
  }
}
/** Bilgisayardaki tüm programları, sürümleri ve güncellemeleri okur; katalog rozetlerini yeniler */
async function loadInstalled(force = false) {
  S.invLoading = true;
  if (['apps', 'dashboard'].includes(S.page)) renderPage();
  const inv = await safe(() => api.inventory.get(force), 'Envanter okunamadı');
  S.invLoading = false;
  if (inv) S.inv = inv;
  S.catalog = await api.catalog.get();
  S.installedLoaded = true;
  if (S.page !== 'assistant' && S.page !== 'lights') renderPage();
  renderChrome(); // alt menü rozetleri (Güncellemeler sayısı) da yenilensin
  loadFileIcons();
}
async function loadDrivers(force = false) {
  S.driversLoading = true;
  S.drivers = await safe(() => api.drivers.installed(force), 'Sürücüler okunamadı') || [];
  S.driversLoading = false;
  if (S.page === 'drivers') renderPage();
}
api.inventory.onChanged(async () => { await loadInstalled(); S.recs = (await safe(() => api.drivers.recommend())) || S.recs; if (S.page === 'drivers') renderPage(); });

// Ayar başka bir yerden (ör. ESP32) değişirse ekranı güncelle
api.onSettingsChanged((s) => {
  S.settings = s;
  document.documentElement.dataset.theme = s.theme;
  renderChrome();
  if (S.page === 'settings') renderPage();
});

// Arayüz hatalarını günlüğe yaz
window.__orbitErrors = 0;
window.addEventListener('error', (e) => { window.__orbitErrors++; api.app.log('error', `${e.message} @ ${e.filename}:${e.lineno}`); });
window.addEventListener('unhandledrejection', (e) => { window.__orbitErrors++; api.app.log('error', 'Promise: ' + (e.reason?.stack || e.reason)); });

// Açılış, TÜM betikler (lights.js, esp32.js) yüklendikten sonra başlar: aksi halde kayıtlı sayfa
// (ör. ESP32) henüz tanımlanmamışken çizilmeye çalışılıyordu (yarış durumu).
async function init() {
  S.settings = await api.settings.get();
  const ui = await api.ui.get().catch(() => ({}));
  if (ui.cat) S.cat = ui.cat;
  if (ui.dashTab) S.dashTab = ui.dashTab;
  if (ui.asstTab) S.asstTab = ui.asstTab;
  if (ui.opts) S.opts = { ...S.opts, ...ui.opts };
  if (ui.page && ui.page !== 'assistant' && typeof PAGES[ui.page] === 'function') S.page = ui.page; // kaldırılmış sayfa (ör. eski "projects") sessizce yok sayılır
  if (ui.appsView) S.appsView = ui.appsView;
  S.chat = await api.chat.get().catch(() => []);
  document.documentElement.dataset.theme = S.settings.theme;
  S.update = await api.update.status();
  S.version = S.update.current;
  S.catalog = await api.catalog.get();
  const sel = await api.selection.get();
  // İlk açılışta önerilenleri seçili getir
  S.selection = new Set(sel.length ? sel : S.catalog.apps.filter((a) => a.recommended).map((a) => a.key));
  if (!sel.length) persistSelection();
  hydrateIcons();
  renderChrome(); renderPage(); renderFeed();
  S.admin = await safe(() => api.system.isAdmin()) ?? false;
  renderPage(); renderFeed();
  loadSystem();
  loadInstalled();
  S.pendingQueue = await api.install.pending().catch(() => []);
  runBootCheck();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
