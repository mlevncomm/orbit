/* Orbit arayüzü — bağımlılıksız, tek dosya. Sayfalar PAGES nesnesinde. */
const api = window.orbit;
const I = window.ICONS;
const $ = (s, r = document) => r.querySelector(s);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => n.replace(/[^\p{L}\p{N} +]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const time = () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

const NAV = [
  { id: 'dashboard', label: 'Panel', icon: 'grid' },
  { id: 'drivers', label: 'Sürücüler', icon: 'chip' },
  { id: 'apps', label: 'Programlar', icon: 'package' },
  { id: 'lights', label: 'Işıklar', icon: 'light' },
  { id: 'assistant', label: 'Asistan', icon: 'sparkles' },
  { id: 'settings', label: 'Ayarlar', icon: 'settings' },
];

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
const appIcon = (a, size) => `<span class="app-ic" style="background:${h(a.color || '#111')}${size ? `;width:${size}px;height:${size}px` : ''}">${h(initials(a.name))}</span>`;
const boardName = (sys) => `${sys.board.vendor.replace(/\s*(Technology Co\., Ltd\.|COMPUTER INC\.|Co\., Ltd\.|Inc\.|Corporation)/gi, '')} ${sys.board.product}`;
const isInstalled =(a) => a.wingetId && S.installed.has(a.wingetId.toLowerCase());
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
  $('#pills').innerHTML = NAV.map((n) => `<button class="pill ${S.page === n.id ? 'active' : ''}" data-nav="${n.id}">${n.label}</button>`).join('');
  $('#rail').innerHTML = `
    <div class="rail-group">${NAV.map((n) => `<button class="rail-btn ${S.page === n.id ? 'active' : ''}" data-nav="${n.id}" title="${n.label}">${I(n.icon, 19)}</button>`).join('')}</div>
    <div class="rail-group theme">
      <button class="rail-btn ${S.settings.theme !== 'dark' ? 'active' : ''}" data-theme-set="light" title="Açık tema">${I('sun', 19)}</button>
      <button class="rail-btn ${S.settings.theme === 'dark' ? 'active' : ''}" data-theme-set="dark" title="Koyu tema">${I('moon', 19)}</button>
    </div>`;
  const name = S.settings.userName || S.sys?.userName || 'O';
  $('#avatar').textContent = initials(name);
  $('#avatar').title = name;
}

function navigate(page) {
  if (!PAGES[page]) page = 'dashboard';
  S.page = page;
  saveUi({ page });
  document.getElementById('app').classList.remove('feed-open');
  $('#scrim').classList.remove('show');
  renderChrome();
  renderPage();
  $('#content').scrollTop = 0;
}

function renderPage() {
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
    <div class="person-chip"><span class="ic" style="background:var(--rose)">${I('gpu')}</span><div><b>${h(gpu?.name || '—')}</b><small>Ekran kartı</small></div></div>
    <div class="person-chip"><span class="ic" style="background:var(--sky)">${I('cpu')}</span><div><b>${h(S.sys.cpu.name)}</b><small>İşlemci</small></div></div>
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
  const tile = (bg, icon, title, meta, tag) => `<div class="tile" style="background:${bg}"><span class="tile-ic">${I(icon)}</span><div><div class="meta">${h(meta)}</div><b>${h(title)}</b></div><span class="tag">${tag}</span></div>`;
  const ctl = (key, icon, label) => `<button class="ctl ${S.opts[key] ? '' : 'off'}" data-opt="${key}" ${S.running ? 'disabled' : ''}>${I(icon)}<span>${label}</span></button>`;
  const waveBars = Array.from({ length: 44 }, (_, i) => `<i style="height:${8 + Math.round(Math.abs(Math.sin(i * 1.7) * 22))}px;animation-delay:${(i % 8) * 0.08}s"></i>`).join('');

  const summary = S.running
    ? `Kurulum devam ediyor: <b>${doneCount}/${total}</b> işlem tamamlandı (%${overall}). Pencereyi kapatmayın; ilerlemeyi sağdaki akıştan takip edebilirsiniz.`
    : `Merhaba${S.settings.userName ? ' ' + h(S.settings.userName) : ''}! Orbit bu bilgisayarı ${sys ? `<b>${h(sys.cpu.name)}</b>, <b>${h(gpu?.name || '')}</b> ve <b>${h(boardName(sys))}</b>` : 'tarıyor'} olarak algıladı.
       Tek tıkla önce donanımın için onaylı sürücüler (Windows Update + ${autoRecs.length ? autoRecs.map((r) => h(r.name)).join(', ') : 'üretici araçları'}), ardından seçtiğin <b>${apps.length}</b> program sessizce kurulur.`;

  const detail = `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${apps.slice(0, 12).map((a) => `<div class="row">${appIcon(a, 28)}<span>${h(a.name)}</span>${isInstalled(a) ? '<span class="badge">kurulu</span>' : ''}</div>`).join('') || '<span class="sub">Henüz program seçilmedi.</span>'}${apps.length > 12 ? `<span class="sub">+${apps.length - 12} daha</span>` : ''}</div>`;

  return `
    ${adminBanner()}
    <div class="page-head">
      <div><h1>Sıfırdan Başlayalım</h1><p>Format sonrası tek tıkla sürücüler ve programlar</p></div>
      ${hwChips()}
    </div>
    <div class="dash">
      <div class="tiles">
        ${tile('var(--lilac)', 'cpu', sys?.cpu.name || 'Algılanıyor…', sys ? `${sys.cpu.cores} çekirdek · ${sys.cpu.threads} iş parçacığı` : '', 'İşlemci')}
        ${tile('var(--peach)', 'gpu', gpu?.name || 'Algılanıyor…', gpu?.driver ? `Sürücü ${gpu.driver}` : '', 'Ekran Kartı')}
        ${tile('var(--sky)', 'board', sys ? boardName(sys) : 'Algılanıyor…', sys ? `${sys.ramGB} GB RAM · BIOS ${sys.bios.version}` : '', 'Anakart')}
      </div>
      <div class="hero">
        <div style="position:relative;z-index:1">
          <h2>Bilgisayarını tek tıkla hazırla</h2>
          <p>Ninite gibi ama sana özel: donanımına uygun güncel sürücüler, geliştirici araçların ve günlük programların, hepsi sessiz kurulum.</p>
        </div>
        <div class="hero-stats">
          <div class="stat"><b>${apps.length}</b><span>seçili program</span></div>
          <div class="stat"><b>${autoRecs.length + (S.opts.wu ? 1 : 0)}</b><span>sürücü kaynağı</span></div>
          <div class="stat"><b style="color:${problems ? 'var(--danger)' : 'inherit'}">${sys ? problems : '…'}</b><span>sorunlu cihaz</span></div>
          <div class="stat"><b>${S.installedLoaded ? S.catalog.apps.filter(isInstalled).length : '…'}</b><span>zaten kurulu</span></div>
        </div>
        <div class="controls">
          ${ctl('vendor', 'gpu', 'Üretici')}
          ${ctl('wu', 'chip', 'Windows Update')}
          ${ctl('apps', 'package', 'Programlar')}
          ${ctl('reboot', 'power', 'Yeniden başlat')}
          ${S.running
            ? `<button class="ctl go" data-action="cancel">${I('stop')}<span>Durdur</span></button>`
            : `<button class="ctl go" data-action="one-click">${I('zap')}<span>Hepsini Kur</span></button>`}
        </div>
      </div>
    </div>
    <div class="card transcript">
      <p>${S.dashTab === 'summary' ? summary : detail}</p>
      <div class="transcript-foot">
        <div class="seg">
          <button class="${S.dashTab === 'summary' ? 'active' : ''}" data-dash-tab="summary">Özet</button>
          <button class="${S.dashTab === 'detail' ? 'active' : ''}" data-dash-tab="detail">Kurulum listesi</button>
        </div>
        <div class="wave ${S.running ? 'live' : ''}">${waveBars}</div>
        <div class="row"><span class="sub">%${overall}</span><span class="rec ${S.running ? 'live' : ''}"><i></i></span></div>
      </div>
    </div>`;
};

PAGES.drivers = () => {
  const sys = S.sys;
  const hw = (bg, icon, label, title, meta) => `<div class="hw" style="background:${bg}"><span class="ic">${I(icon)}</span><small>${label}</small><b>${h(title)}</b><small>${h(meta || '')}</small></div>`;
  const gpus = sys?.gpus || [];
  const recs = S.recs.map((r) => {
    const job = S.jobs.get(r.key);
    return `<div class="rec-item">
      ${appIcon(r)}
      <div class="txt"><span class="kicker">${h(r.target)}</span><br><b>${h(r.name)}</b><p>${h(r.desc)}</p></div>
      ${r.source === 'winget'
        ? `<button class="btn primary sm" data-install-rec="${r.key}" ${job && ['queued', 'running'].includes(job.status) ? 'disabled' : ''}>${I('download')}${job ? h(statusLabel(job)) : 'Kur'}</button>`
        : `<button class="btn sm" data-open="${h(r.url)}">${I('external')}Resmi sayfa</button>`}
    </div>`;
  }).join('');

  let wu;
  if (S.scanning) wu = `<div class="empty"><span class="spinner"></span><p>Windows Update sorgulanıyor… (1-3 dakika)</p></div>`;
  else if (!S.wu) wu = `<div class="empty"><p>Donanım kimliklerine göre Microsoft'un onayladığı sürücüleri bulmak için tarayın.</p><button class="btn primary" data-action="scan-wu">${I('search')}Sürücüleri tara</button></div>`;
  else if (!S.wu.length) wu = `<div class="empty">${I('check', 28)}<p>Bekleyen sürücü güncellemesi yok. Her şey güncel.</p><button class="btn sm" data-action="scan-wu">${I('refresh')}Tekrar tara</button></div>`;
  else wu = `<table class="table"><thead><tr><th><input type="checkbox" data-wu-all ${S.wuSel.size === S.wu.length ? 'checked' : ''}></th><th>Sürücü</th><th>Sınıf</th><th>Tarih</th><th>Boyut</th></tr></thead><tbody>
      ${S.wu.map((d) => `<tr><td><input type="checkbox" data-wu="${h(d.id)}" ${S.wuSel.has(d.id) ? 'checked' : ''}></td><td><b>${h(d.title)}</b><br><small class="sub">${h(d.vendor || '')}</small></td><td>${h(d.cls || '-')}</td><td>${h(d.date || '-')}</td><td>${d.sizeMB} MB</td></tr>`).join('')}
    </tbody></table>
    <div class="row" style="margin-top:12px"><span class="sub">${S.wuSel.size} / ${S.wu.length} seçili</span><span class="spacer"></span><button class="btn sm" data-action="scan-wu">${I('refresh')}Yeniden tara</button><button class="btn primary sm" data-action="install-wu" ${S.wuSel.size ? '' : 'disabled'}>${I('download')}Seçilenleri kur</button></div>`;

  const problems = sys?.problemDevices || [];
  return `
    ${adminBanner()}
    <div class="page-head"><div><h1>Sürücüler</h1><p>Anakartın ve donanımın desteklediği güncel sürücüler</p></div>
      <button class="btn" data-action="refresh-sys">${I('refresh')}Donanımı yeniden algıla</button></div>
    <div class="hw-grid">
      ${hw('var(--lilac)', 'cpu', 'İşlemci', sys?.cpu.name || '…', sys ? `${sys.cpu.cores} çekirdek / ${sys.cpu.threads} iş parçacığı` : '')}
      ${gpus.map((g) => hw('var(--peach)', 'gpu', 'Ekran kartı', g.name, g.driver ? `Sürücü ${g.driver}${g.date ? ' · ' + g.date : ''}` : '')).join('') || hw('var(--peach)', 'gpu', 'Ekran kartı', '…')}
      ${hw('var(--sky)', 'board', 'Anakart', sys ? boardName(sys) : '…', sys ? `BIOS ${sys.bios.version}` : '')}
      ${hw('var(--mint)', 'windows', 'Sistem', sys?.os.name || '…', sys ? `Derleme ${sys.os.build} · ${sys.ramGB} GB RAM · C: ${sys.disk.freeGB}/${sys.disk.totalGB} GB boş` : '')}
    </div>
    <div class="two">
      <div class="card"><h3>Üretici araçları</h3><p class="sub" style="margin-bottom:12px">Algılanan donanıma göre öneriler</p><div class="rec-list">${recs || '<div class="empty"><span class="spinner"></span></div>'}</div></div>
      <div class="card"><h3>Sorunlu cihazlar</h3><p class="sub" style="margin-bottom:12px">Aygıt Yöneticisi'nde sürücüsü eksik veya hatalı görünenler</p>
        ${problems.length ? `<div class="rec-list">${problems.map((p) => `<div class="rec-item"><span style="color:var(--danger)">${I('alert')}</span><div class="txt"><b>${h(p.name || 'Bilinmeyen aygıt')}</b><p>Hata kodu ${p.code} · ${h(p.id)}</p></div></div>`).join('')}</div><p class="sub" style="margin-top:10px">Windows Update taraması bu cihazların çoğu için sürücü bulur.</p>`
          : `<div class="empty">${I('shield', 28)}<p>${sys ? 'Tüm cihazlar çalışıyor.' : 'Kontrol ediliyor…'}</p></div>`}
      </div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Windows Update sürücüleri</h3><p class="sub" style="margin-bottom:8px">Yonga seti, ses, ağ, Wi-Fi, Bluetooth ve ekran kartı için donanım kimliğine göre eşleşen sürücüler</p>${wu}</div>`;
};

PAGES.apps = () => {
  const q = S.query.toLowerCase();
  const visible = S.catalog.apps.filter((a) => (S.cat === 'all' || a.category === S.cat) && (!q || a.name.toLowerCase().includes(q) || (a.desc || '').toLowerCase().includes(q)));
  const count = (id) => S.catalog.apps.filter((a) => a.category === id).length;
  const cats = [{ id: 'all', name: 'Tümü' }, ...S.catalog.categories].filter((c) => c.id === 'all' || count(c.id) || c.id === 'custom');
  const card = (a) => {
    const job = S.jobs.get(a.key);
    return `<button class="app-card ${S.selection.has(a.key) ? 'sel' : ''}" data-toggle="${a.key}">
      ${appIcon(a)}
      <span class="txt"><b>${h(a.name)}</b><small>${h(job ? `${statusLabel(job)} · ${job.message}` : a.desc || sourceLabel(a))}</small>
        ${isInstalled(a) ? '<span class="badge">Kurulu</span>' : a.recommended ? '<span class="badge star">Önerilen</span>' : ''}</span>
      <span class="check">${I('check', 14)}</span>
      ${a.custom ? `<span class="del" data-remove="${a.key}" title="Kaldır">${I('trash', 14)}</span>` : ''}
      ${job && job.status === 'running' ? `<span class="mini-prog"><i style="width:${job.percent}%"></i></span>` : ''}
    </button>`;
  };
  const groups = S.cat === 'all' && !q
    ? S.catalog.categories.map((c) => {
      const items = visible.filter((a) => a.category === c.id);
      if (!items.length) return '';
      return `<div class="section-title">${h(c.name)}</div><div class="grid">${items.map(card).join('')}</div>`;
    }).join('')
    : `<div class="grid">${visible.map(card).join('')}</div>${visible.length ? '' : '<div class="empty">Sonuç yok.</div>'}`;
  const sel = S.selection.size;
  return `
    ${adminBanner()}
    <div class="page-head"><div><h1>Programlar</h1><p>Seç, tek tıkla sessizce kur. Seçimin otomatik kaydedilir.</p></div>
      <div class="row"><button class="btn" data-action="select-rec">${I('star')}Önerilenleri seç</button><button class="btn primary" data-action="add-app">${I('plus')}Program ekle</button></div></div>
    <div class="toolbar"><label class="search">${I('search')}<input id="appSearch" placeholder="Program ara…" value="${h(S.query)}"></label></div>
    <div class="cats">${cats.map((c) => `<button class="cat ${S.cat === c.id ? 'active' : ''}" data-cat="${c.id}">${h(c.name)}<em>${c.id === 'all' ? S.catalog.apps.length : count(c.id)}</em></button>`).join('')}</div>
    ${S.cat === 'custom' && !count('custom') ? `<div class="card empty">${I('plus', 28)}<p>Kendi programlarını ekle: winget kataloğundan ara, indirme bağlantısı ver, npm paketi ya da PowerShell komutu yaz.</p><button class="btn primary" data-action="add-app">Program ekle</button></div>` : groups}
    ${sel ? `<div class="sticky-bar"><b>${sel} program seçili</b><span class="spacer"></span><button class="btn sm" data-action="clear-sel">Temizle</button><button class="btn sm go" data-action="install-sel" ${S.running ? 'disabled' : ''}>${I('download')}Seçilenleri kur</button></div>` : ''}`;
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
  return `
    <div class="page-head"><div><h1>Asistan</h1><p>Bilgisayarına bağlı kişisel yapay zekan · ${h(provider)}</p></div>
      <div class="row"><button class="btn" data-action="clear-chat">${I('trash')}Sohbeti temizle</button></div></div>
    ${ready ? '' : `<div class="banner">${I('sparkles')}<p>Asistanı kullanmak için Ayarlar'dan Claude API anahtarı ekleyin veya yerel model (Ollama) seçin.</p><button class="btn primary sm" data-nav="settings">Ayarlara git</button></div>`}
    <div class="card chat">
      <div class="chat-list" id="chatList">
        ${msgs || `<div class="msg"><span class="av">${I('sparkles', 16)}</span><div class="bubble"><div class="who"><span>Orbit</span></div>Merhaba! Donanımını okuyabilir, sürücü güncellemelerini tarayabilir ve senin onayınla program kurabilirim. Ne yapalım?</div></div>`}
        ${S.thinking ? `<div class="msg"><span class="av">${I('sparkles', 16)}</span><div class="bubble"><span class="spinner"></span></div></div>` : ''}
      </div>
      <div class="suggest">
        ${['Bilgisayarımın donanımını özetle', 'Web geliştirme için ne kurmalıyım?', 'Eksik sürücü var mı?', 'Oyun için gerekli programları öner'].map((s) => `<button class="chip" data-suggest="${h(s)}">${h(s)}</button>`).join('')}
      </div>
      <form class="composer" id="chatComposer"><input id="chatInput" placeholder="Bir şey sor veya iste…" autocomplete="off" ${S.thinking ? 'disabled' : ''}><button class="send" type="submit">${I('send')}</button></form>
    </div>`;
};
PAGES.assistantAfter = () => {
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
        <div class="field"><label>Tema</label><div class="seg"><button class="${s.theme !== 'dark' ? 'active' : ''}" data-theme-set="light">Açık</button><button class="${s.theme === 'dark' ? 'active' : ''}" data-theme-set="dark">Koyu</button></div></div>
        <div class="field"><label>Kurulum profili</label><small>Seçtiğin programlar, özel programların ve RGB profillerin tek dosyada. Format öncesi dışa aktarıp USB'de sakla; format sonrası içe aktar ve "Hepsini Kur".</small>
          <div class="row"><button class="btn" data-action="export">${I('upload')}Dışa aktar</button><button class="btn" data-action="import">${I('download')}İçe aktar</button></div></div>
      </div>
      <div class="card form">
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
      <div class="card form">
        <h3>Başlangıç ve arka plan</h3>
        ${sw('startWithWindows', 'Windows açılınca arka planda başlat', 'Son RGB görünümün her açılışta otomatik geri gelir.')}
        ${sw('minimizeToTray', 'Kapatınca sistem tepsisine küçült', 'Işık efektleri ve güncelleme denetimi çalışmaya devam eder.')}
        <div class="field"><label>RGB motoru</label>
          <div class="seg"><button class="${s.rgbEngine !== 'sync' ? 'active' : ''}" data-engine="hardware">Donanım (önerilen)</button><button class="${s.rgbEngine === 'sync' ? 'active' : ''}" data-engine="sync">Senkron</button></div>
          <small>Donanım: her cihaz efekti kendi çipinde çalıştırır; akıcıdır ve Orbit kapalıyken de sürer. Senkron: Direct destekleyen cihazlar tek saatle aynı anda yanar.</small></div>
      </div>
      <div class="card form">
        <h3>Güncellemeler ve hakkında</h3>
        <p class="sub">Orbit <b>v${h(S.version)}</b> · ${h(updateText())}</p>
        <div class="row"><button class="btn" data-action="update-check">${I('refresh')}Güncellemeleri denetle</button>
          ${S.update.state === 'available' ? `<button class="btn primary" data-action="update-download">v${h(S.update.version)} indir</button>` : ''}
          ${S.update.state === 'ready' ? `<button class="btn primary" data-action="update-install">Yeniden başlat ve güncelle</button>` : ''}</div>
        <div class="row"><button class="btn" data-action="open-logs">${I('terminal')}Günlük klasörü</button><button class="btn" data-open="https://github.com/mlevncomm/orbit/releases">${I('external')}Sürüm notları</button></div>
      </div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Kurulum geçmişi</h3><div class="sub" style="margin-top:8px">
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
  return { queued: 'Sırada', running: 'Kuruluyor', done: 'Tamamlandı', skipped: 'Zaten güncel', error: 'Hata', cancelled: 'İptal' }[j.status] || j.status;
}
function sourceLabel(a) {
  return { winget: `winget · ${a.wingetId}`, url: 'Doğrudan indirme', npm: `npm · ${a.npmPkg}`, command: 'PowerShell komutu' }[a.source] || '';
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
          <div class="bar"><i style="width:${['done', 'skipped', 'error'].includes(j.status) ? 100 : j.percent || 0}%"></i></div><small>${h(statusLabel(j))}${j.message ? ' · ' + h(j.message) : ''}</small></div></div></div>`;
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
    S.jobs.set(it.key, { key: it.key, name: it.name, color: it.color, status: 'queued', percent: 0, message: 'Sırada' });
    if (!prev || !S.feed.some((f) => f.type === 'job' && f.key === it.key)) pushFeed({ type: 'job', key: it.key });
    else { S.feed = S.feed.filter((f) => !(f.type === 'job' && f.key === it.key)); pushFeed({ type: 'job', key: it.key }); }
  });
  pushFeed({ type: 'me', text: label || `${items.length} öğeyi kur` });
  const plain = items.map(({ key, name, source, wingetId, url, args, npmPkg, command, ids, color }) => ({ key, name, source, wingetId, url, args, npmPkg, command, ids, color }));
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
      html: `Kurulum bitti: <b>${st.done}</b> başarılı${st.failed ? `, <b style="color:var(--danger)">${st.failed}</b> hatalı` : ''}.${reboot ? `<div class="row" style="margin-top:8px"><button class="btn primary sm" data-action="restart">${I('power')}Yeniden başlat</button></div>` : ''}`,
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
      <div class="seg" style="margin-bottom:14px">${[['winget', 'Katalogdan ara'], ['url', 'İndirme linki'], ['npm', 'npm paketi'], ['command', 'Komut']].map(([k, l]) => `<button type="button" class="${m.tab === k ? 'active' : ''}" data-mtab="${k}">${l}</button>`).join('')}</div>
      <form class="form" id="addForm">
        ${m.tab === 'winget' ? `
          <div class="row"><input class="input" id="mq" placeholder="ör. obsidian, blender, unity" style="flex:1"><button type="button" class="btn primary" id="msearch">${m.searching ? '<span class="spinner"></span>' : I('search')}Ara</button></div>
          <div class="results">${m.results.map((r, i) => `<button type="button" class="result ${m.picked === i ? 'active' : ''}" data-pick="${i}"><span><b>${h(r.name)}</b><br><small>${h(r.id)}</small></span><small>${h(r.version)}</small></button>`).join('') || '<p class="sub">winget deposunda 10.000+ program var. Arayıp seç.</p>'}</div>`
        : `<div class="field"><label>Program adı</label><input class="input" name="name" required placeholder="ör. Benim Aracım"></div>
          ${m.tab === 'url' ? `<div class="field"><label>İndirme bağlantısı (.exe / .msi)</label><input class="input" name="url" required placeholder="https://…/setup.exe"></div>
            <div class="field"><label>Sessiz kurulum parametreleri</label><input class="input" name="args" placeholder="/S  (NSIS) · /VERYSILENT (Inno) · boş = .msi için /qn"><small>Kurulum dosyasının türüne göre değişir.</small></div>` : ''}
          ${m.tab === 'npm' ? `<div class="field"><label>Paket adı</label><input class="input" name="npmPkg" required placeholder="ör. typescript, @angular/cli"><small>npm install -g ile kurulur; Node.js gerekir.</small></div>` : ''}
          ${m.tab === 'command' ? `<div class="field"><label>PowerShell komutu</label><textarea class="input" name="command" required placeholder="ör. wsl --install -d Ubuntu"></textarea><small>Yönetici yetkisiyle çalışır. Sadece güvendiğin komutları ekle.</small></div>` : ''}`}
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
        def = { ...f, source: m.tab, desc: { url: 'Doğrudan indirme', npm: `npm · ${f.npmPkg}`, command: 'PowerShell komutu' }[m.tab] };
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
  const t = e.target.closest('[data-nav],[data-action],[data-toggle],[data-remove],[data-cat],[data-opt],[data-theme-set],[data-install-rec],[data-open],[data-wu],[data-wu-all],[data-suggest],[data-proposal],[data-dash-tab],[data-engine]');
  if (!t) return;
  const d = t.dataset;

  if (d.remove) {
    e.stopPropagation();
    await safe(() => api.catalog.removeCustom(d.remove));
    S.selection.delete(d.remove);
    S.catalog = await api.catalog.get();
    return renderPage();
  }
  if (d.nav) { navigate(d.nav); if ('focusSearch' in d) $('#appSearch')?.focus(); return; }
  if (d.toggle) { S.selection.has(d.toggle) ? S.selection.delete(d.toggle) : S.selection.add(d.toggle); persistSelection(); return renderPage(); }
  if (d.cat) { S.cat = d.cat; saveUi({ cat: d.cat }); return renderPage(); }
  if (d.dashTab) { S.dashTab = d.dashTab; saveUi({ dashTab: d.dashTab }); return renderPage(); }
  if (d.opt) { S.opts[d.opt] = !S.opts[d.opt]; saveUi({ opts: { ...S.opts } }); return renderPage(); }
  if (d.engine) { await saveSetting({ rgbEngine: d.engine }); return renderPage(); }
  if (d.themeSet) return setTheme(d.themeSet);
  if (d.open) return safe(() => api.system.open(d.open));
  if (d.installRec) { const r = S.recs.find((x) => x.key === d.installRec); return startInstall([r], `${r.name} kur`); }
  if (d.wuAll !== undefined) { S.wuSel = t.checked ? new Set(S.wu.map((x) => x.id)) : new Set(); return renderPage(); }
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
    case 'install-wu': return startInstall([{ key: 'wu_drivers', name: 'Windows Update Sürücüleri', source: 'wudrivers', color: '#0078d4', ids: [...S.wuSel] }], `${S.wuSel.size} sürücüyü kur`);
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
    S.wu = list; S.wuSel = new Set(list.map((x) => x.id));
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
async function loadInstalled() {
  const ids = await safe(() => api.system.installed());
  S.installed = new Set(ids || []);
  S.installedLoaded = true;
  if (S.page !== 'assistant') renderPage();
}

// Arayüz hatalarını günlüğe yaz
window.addEventListener('error', (e) => api.app.log('error', `${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => api.app.log('error', 'Promise: ' + (e.reason?.stack || e.reason)));

(async function init() {
  S.settings = await api.settings.get();
  const ui = await api.ui.get().catch(() => ({}));
  if (ui.cat) S.cat = ui.cat;
  if (ui.dashTab) S.dashTab = ui.dashTab;
  if (ui.opts) S.opts = { ...S.opts, ...ui.opts };
  if (ui.page && ui.page !== 'assistant') S.page = ui.page;
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
})();
