/* Işıklar (RGB) sayfası — app.js'deki S, PAGES, I, h, $, toast, saveUi, debounce yardımcılarını kullanır */
const L = {
  status: null,
  busy: false,       // bağlanıyor
  applying: false,   // bir görünüm uygulanıyor
  error: '',
  draft: { name: '', effect: 'wave', colors: ['#00e5c0', '#7b2ff7'], speed: 3, brightness: 100 },
  sel: null,         // seçili cihaz (sahne)
  devColor: {},
  devMode: {},
  pending: null,     // uygulama sürerken gelen son istek
  liveTimer: null,
  live: {},          // cihaz id -> son okunan renkler
  conflicts: [],     // ışıkları ele geçiren başka denetleyiciler (Windows Dinamik Aydınlatma)
};

const DEVICE_ICON = { 'Klavye': 'keyboard', 'Fare': 'mouse', 'RAM': 'memory', 'Ekran Kartı': 'gpu', 'Anakart': 'board', 'Kasa': 'box', 'LED Şerit': 'light', 'Soğutucu': 'fan', 'Kulaklık': 'headphones' };
const EFFECT_ICON = { static: 'light', breathing: 'breath', pulse: 'activity', spectrum: 'refresh', rainbow: 'rainbow', wave: 'wave', off: 'power' };
const SWATCHES = ['#ff1e3c', '#ff7a18', '#ffd400', '#00ff41', '#00e5c0', '#00c2ff', '#1e6bff', '#7b2ff7', '#ff4fd8', '#ffb46b', '#ffffff', '#9b5cff'];
const saveDraft = () => saveUi({ lightsDraft: { ...L.draft } });
const periodOf = (speed) => (16 - ((speed - 1) / 9) * 14).toFixed(2) + 's';

/** Efektin canlı CSS önizlemesi (hız, cihazdaki döngü süresiyle aynı ölçekte) */
function rgbPreview(p, cls = '') {
  const [a, b] = p.colors;
  const period = periodOf(p.speed);
  const op = p.effect === 'off' ? 1 : Math.max(0.12, Math.pow((p.brightness ?? 100) / 100, 0.8));
  let bg, anim = '';
  switch (p.effect) {
    case 'static': bg = a; break;
    case 'off': bg = '#16161a'; break;
    case 'breathing': bg = a; anim = `rgbBreath ${period} ease-in-out infinite`; break;
    case 'pulse': bg = a; anim = `rgbPulse ${period} ease-out infinite`; break;
    case 'spectrum': bg = '#ff3b3b'; anim = `rgbHue ${period} linear infinite`; break;
    case 'rainbow': bg = 'linear-gradient(90deg,#ff3b3b,#ffb000,#3bff6b,#00d0ff,#7a3bff,#ff3bd0,#ff3b3b) 0 0/200% 100%'; anim = `rgbSlide ${period} linear infinite`; break;
    case 'wave': bg = `linear-gradient(90deg,${a},${b},${a}) 0 0/200% 100%`; anim = `rgbSlide ${period} linear infinite`; break;
    default: bg = a;
  }
  return `<div class="rgb-prev ${cls}"><i style="background:${bg};animation:${anim};opacity:${op}"></i></div>`;
}

const avgColor = (list) => {
  const c = (list || []).map((x) => parseInt(x.slice(1), 16)).map((n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  if (!c.length) return null;
  const s = c.reduce((a, x) => [a[0] + x[0], a[1] + x[1], a[2] + x[2]], [0, 0, 0]).map((v) => Math.round(v / c.length));
  return Math.max(...s) < 12 ? null : `rgb(${s.join(',')})`;
};

async function rgbLoad(connect) {
  try {
    L.status = connect ? await api.rgb.connect() : await api.rgb.status();
    L.error = '';
  } catch (e) { L.error = e.message; L.status = L.status || await api.rgb.status().catch(() => null); }
  if (S.page === 'lights') renderPage();
}

function activeLabel(st) {
  const a = st.active;
  if (!a) return { name: 'Henüz seçilmedi', sub: 'Bir görünüm seç' };
  const preset = [...st.presets, ...st.profiles].find((x) => x.id === a.id);
  return { name: preset?.name || a.name || 'Özel görünüm', sub: st.effects[a.effect] || a.effect };
}

/** Banner zemini: etkin görünümün renklerinden mesh */
function heroStyle(p) {
  if (!p || p.effect === 'off') return '';
  const [a, b] = p.colors;
  const rainbow = ['#ff5a5a', '#ffc83d', '#4fd18b', '#4aa8ff', '#a66bff'];
  const c = ['rainbow', 'spectrum'].includes(p.effect) ? rainbow : p.effect === 'static' ? [a, a, a, a] : [a, b, a, b];
  const soft = (x) => `color-mix(in srgb, ${x} 62%, #ffffff)`;
  return `--c1:${soft(c[0])};--c2:${soft(c[1])};--c3:${soft(c[2])};--c4:${soft(c[3] || c[0])};--period:${Math.max(4, 22 - p.speed * 1.8)}s`;
}

PAGES.lights = () => {
  const st = L.status;
  const head = (extra = '') => `<div class="page-head"><div><h1>Işıklar</h1><p>Klavye, fare, RAM ve anakart ışıkları tek yerden</p></div><div class="row">${extra}</div></div>`;

  if (!st) return head() + `<div class="card empty"><span class="spinner"></span><p>RGB cihazları aranıyor…</p></div>`;
  if (!st.installed) {
    const job = S.jobs.get('openrgb');
    return head() + `<section class="page-banner mesh lilac"><div><span class="kicker">Kurulum gerekli</span><h2>Işık kontrolü için OpenRGB</h2>
      <p>Gigabyte, ASUS, MSI, Corsair, Logitech, Razer ve yüzlerce cihazı destekler. Orbit onu arka planda kullanır.</p>
      <div class="row"><button class="btn primary" data-rgb="install" ${job && ['queued', 'running'].includes(job.status) ? 'disabled' : ''}>${I('download')}${job ? h(statusLabel(job) + ' · ' + (job.message || '')) : 'OpenRGB\'yi kur'}</button></div></div></section>`;
  }
  if (!st.connected) {
    return head() + `<section class="page-banner mesh lilac"><div><span class="kicker">Bağlantı</span><h2>${L.busy ? 'Cihazlar taranıyor…' : 'OpenRGB bağlı değil'}</h2>
      <p>${L.busy ? 'İlk seferde 10-20 saniye sürebilir.' : 'RAM ve anakart ışıkları için Orbit\'in yönetici olarak çalışması gerekir.'}</p>
      ${L.error ? `<p style="color:var(--danger)">${h(L.error)}</p>` : ''}
      <div class="row"><button class="btn primary" data-rgb="connect" ${L.busy ? 'disabled' : ''}>${L.busy ? '<span class="spinner"></span>' : I('zap')}Bağlan</button></div></div></section>`;
  }

  const dis = L.applying ? 'disabled' : '';
  const isOff = !st.active || st.active.effect === 'off';
  const act = activeLabel(st);
  const d = L.draft;
  const inSync = st.devices.filter((x) => !x.excluded).length;

  // ---- Cihazlar: sade kartlar, canlı renk şeridi; tıklayınca ayrıntı ----
  const devices = st.devices.map((dev) => `
    <button class="device ${L.sel === dev.id ? 'sel' : ''} ${dev.excluded ? 'excluded' : ''}" data-rgb-sel="${dev.id}">
      <span class="dev-ic">${I(DEVICE_ICON[dev.type] || 'chip', 20)}</span>
      <b>${h(dev.name)}</b>
      <span class="dev-sync ${dev.excluded ? '' : 'on'}" data-rgb-ex="${dev.id}" title="${dev.excluded ? 'Görünümlere dahil et' : 'Görünümlerden çıkar (kendi ayarında kalsın)'}">${I('check', 13)}</span>
      <small>${h(dev.type)} · ${dev.leds} LED</small>
      <span class="live-strip" data-live="${dev.id}"></span>
    </button>`).join('');

  // ---- Seçili cihaz (yalnızca seçilince görünür) ----
  const selDev = st.devices.find((x) => x.id === L.sel);
  const devPanel = selDev ? `
    <div class="card form dev-panel">
      <div class="card-head"><div><h3>${h(selDev.name)}</h3><p class="sub">${h(selDev.type)} · ${selDev.leds} LED${selDev.applied ? ` · şu an ${h(selDev.applied.mode)}` : ''}${selDev.saves ? ' · ayar cihazda saklanır' : ''}</p></div>
        <button class="icon-btn sm" data-rgb-sel="${selDev.id}" title="Kapat">${I('x')}</button></div>
      ${selDev.applied?.note ? `<p class="note">${I('alert', 14)}<span>${h(selDev.applied.note)}</span></p>` : ''}
      <div class="field"><span class="label">Cihazın kendi efektleri</span>
        <div class="mode-chips">${selDev.modes.map((m) => `<button class="${(L.devMode[selDev.id] || selDev.applied?.mode || selDev.activeMode) === m ? 'active' : ''}" data-rgb-devmode="${selDev.id}" data-mode="${h(m)}">${h(m)}</button>`).join('')}</div></div>
      <div class="row"><span class="sub">Renk</span><input type="color" class="swatch" data-rgb-devcolor="${selDev.id}" value="${L.devColor[selDev.id] || d.colors[0]}">
        <span class="spacer"></span>
        <button class="btn" data-rgb-devprofile="${selDev.id}" ${dis}>Özelleştir'dekini uygula</button>
        <button class="btn primary" data-rgb-native="${selDev.id}" ${dis}>${I('zap')}Efekti uygula</button></div>
      <label class="switch"><input type="checkbox" data-rgb-exsw="${selDev.id}" ${selDev.excluded ? '' : 'checked'}><span>Görünümlere dahil<small>Kapalıysa bu cihaz hazır görünümler uygulanırken kendi ayarında kalır.</small></span></label>
    </div>` : '';

  const effBtns = Object.entries(st.effects).map(([k, v]) => `<button class="eff ${d.effect === k ? 'active' : ''}" data-rgb-eff="${k}">${I(EFFECT_ICON[k] || 'light', 16)}${v}</button>`).join('');
  const twoColor = ['wave', 'breathing'].includes(d.effect);
  const noColor = ['rainbow', 'spectrum', 'off'].includes(d.effect);

  const preset = (p, mine) => `<button class="preset ${st.active && st.active.id === p.id ? 'on' : ''}" data-rgb-apply="${h(p.id)}" ${dis}>
      ${rgbPreview(p)}<span class="pn"><b>${h(p.name)}</b><small>${h(st.effects[p.effect] || p.effect)}</small></span>
      ${st.active && st.active.id === p.id ? `<span class="on-badge">${I('check', 12)}</span>` : ''}
      ${mine ? `<span class="del" data-rgb-del="${h(p.id)}" title="Sil">${I('trash', 14)}</span>` : ''}</button>`;

  return head(`<button class="btn" data-rgb="refresh" ${dis}>${I('refresh')}Cihazları yenile</button>`) + `
    <section class="light-hero ${isOff ? 'off card' : 'mesh'}" style="${heroStyle(st.active)}">
      <div><span class="kicker">Şu an</span><h2>${h(isOff ? 'Işıklar kapalı' : act.name)}</h2>
        <p>${h(isOff ? (st.lastOn ? 'Açınca “' + (st.lastOn.name || 'son görünüm') + '” geri gelir' : 'Bir görünüm seç') : act.sub)} · ${inSync}/${st.devices.length} cihaz</p></div>
      <button class="power ${isOff ? '' : 'on'}" data-rgb-power="${isOff ? 1 : 0}" ${dis} title="${isOff ? 'Işıkları aç' : 'Işıkları kapat'}">${L.applying ? '<span class="spinner"></span>' : I('power', 26)}</button>
    </section>

    ${L.conflicts.map((c) => `<div class="banner">${I('alert')}<p><b>${h(c.title)}.</b> ${h(c.text)}</p><button class="btn primary sm" data-open="ms-settings:personalization-lighting">Ayarı aç</button><button class="btn sm" data-rgb="recheck">Tekrar kontrol et</button></div>`).join('')}
    <div class="devices">${devices}</div>
    ${devPanel}

    <div class="section-title">Görünümler</div>
    <div class="presets">${st.presets.map((p) => preset(p)).join('')}</div>
    ${st.profiles.length ? `<div class="section-title">Profillerim</div><div class="presets">${st.profiles.map((p) => preset(p, true)).join('')}</div>` : ''}

    <div class="section-title">Özelleştir <em>değişiklikler ışıklara anında uygulanır</em></div>
    <div class="card studio">
      <div class="form">
        ${rgbPreview(d, 'tall')}
        <div class="effects">${effBtns}</div>
      </div>
      <div class="form">
        ${noColor ? '' : `<div class="field"><span class="label">Renk${twoColor ? 'ler' : ''}</span>
          <div class="color-row">
            <label class="cpick"><input type="color" data-rgb-c="0" value="${d.colors[0]}"><span style="background:${d.colors[0]}"></span><small>${twoColor ? '1' : ''}</small></label>
            ${twoColor ? `<button class="icon-btn sm" data-rgb="swap" title="Renkleri değiştir">${I('refresh', 14)}</button>
            <label class="cpick"><input type="color" data-rgb-c="1" value="${d.colors[1]}"><span style="background:${d.colors[1]}"></span><small>2</small></label>` : ''}
            <div class="swatches">${SWATCHES.map((c) => `<button style="background:${c}" data-rgb-swatch="${c}" title="${c}"></button>`).join('')}</div>
          </div></div>`}
        ${['static', 'off'].includes(d.effect) ? '' : `<label class="field slider"><span class="sub">Hız <b>${d.speed}/10</b></span><input type="range" min="1" max="10" value="${d.speed}" data-rgb-range="speed"></label>`}
        ${d.effect === 'off' ? '' : `<label class="field slider"><span class="sub">Parlaklık <b>%${d.brightness}</b></span><input type="range" min="5" max="100" step="5" value="${d.brightness}" data-rgb-range="brightness"></label>`}
        <div class="row"><input class="input" id="rgbName" placeholder="Profil adı (ör. Gece Modu)" value="${h(d.name)}" style="flex:1;min-width:150px">
          <button class="btn primary" data-rgb="save">${I('star')}Profil olarak kaydet</button></div>
      </div>
    </div>`;
};

PAGES.lightsAfter = () => {
  if (!L.status) rgbLoad(false).then(() => { if (L.status?.installed && !L.status.connected && !L.busy) autoConnect(); });
  document.querySelectorAll('[data-rgb-c]').forEach((el) => el.addEventListener('input', () => {
    L.draft.colors[+el.dataset.rgbC] = el.value;
    el.nextElementSibling.style.background = el.value;
    refreshDraftPreview(); saveDraft(); liveApply();
  }));
  // Kaydırıcı sürüklenirken yalnızca önizleme güncellenir; bırakılınca (change) uygulanır
  document.querySelectorAll('[data-rgb-range]').forEach((el) => {
    el.addEventListener('input', () => {
      L.draft[el.dataset.rgbRange] = +el.value;
      el.previousElementSibling.querySelector('b').textContent = el.dataset.rgbRange === 'speed' ? `${el.value}/10` : `%${el.value}`;
      refreshDraftPreview(); saveDraft();
    });
    el.addEventListener('change', liveApply);
  });
  document.querySelectorAll('[data-rgb-devcolor]').forEach((el) => el.addEventListener('input', () => (L.devColor[el.dataset.rgbDevcolor] = el.value)));
  const n = $('#rgbName'); if (n) n.addEventListener('input', () => { L.draft.name = n.value; saveDraft(); });
  document.querySelectorAll('[data-rgb-exsw]').forEach((el) => el.addEventListener('change', () => setExcluded(+el.dataset.rgbExsw, !el.checked)));
  paintLive();
  startLivePoll();
  if (!L.conflictsAt || Date.now() - L.conflictsAt > 30000) loadConflicts();
};

function refreshDraftPreview() {
  const box = document.querySelector('.studio .rgb-prev.tall');
  if (box) box.outerHTML = rgbPreview(L.draft, 'tall');
}

async function loadConflicts() {
  L.conflictsAt = Date.now();
  const list = await api.rgb.conflicts().catch(() => []);
  const changed = JSON.stringify(list) !== JSON.stringify(L.conflicts);
  L.conflicts = list;
  if (changed && S.page === 'lights') renderPage();
}

async function autoConnect() {
  L.busy = true; renderPage();
  await rgbLoad(true);
  L.busy = false; renderPage();
}

async function rgbRun(fn, okMsg) {
  if (L.applying) return;
  L.applying = true; renderPage();
  try {
    L.status = await fn();
    if (okMsg) toast(okMsg);
  } catch (e) { toast(e.message, true); }
  L.applying = false;
  if (S.page === 'lights') renderPage();
}

async function setExcluded(id, ex) {
  await rgbRun(() => api.rgb.exclude(id, ex), ex ? 'Cihaz genel görünümden çıkarıldı' : 'Cihaz genel görünüme eklendi');
}

const liveApply = debounce(() => {
  if (!L.status?.connected) return;
  queueApply({ ...L.draft, name: L.draft.name || 'Özel görünüm', id: 'draft' });
}, 350);

/** Uygulama sürerken gelen istekleri birleştirir: yalnızca en sonuncusu uygulanır */
async function queueApply(profile) {
  if (L.applying) { L.pending = profile; return; }
  L.applying = true;
  try { L.status = await api.rgb.apply(profile); } catch (e) { toast(e.message, true); }
  L.applying = false;
  if (L.pending) { const next = L.pending; L.pending = null; return queueApply(next); }
  if (S.page === 'lights' && !document.activeElement?.matches('input[type=color],input[type=range]')) renderPage();
}

/** Son okunan renkleri sahnedeki karolara boyar */
function paintLive() {
  for (const [id, dl] of Object.entries(L.live)) {
    const strip = document.querySelector(`[data-live="${id}"]`);
    if (strip) {
      strip.classList.toggle('hwanim', dl.hardwareAnim);
      strip.title = dl.hardwareAnim ? `${dl.mode}: efekt cihazın kendi çipinde çalışıyor (mod renkleri)` : 'Cihazdaki LED renkleri (canlı)';
      strip.innerHTML = (dl.colors.length ? dl.colors : ['#000000']).map((c) => `<i style="background:${c}"></i>`).join('');
    }
  }
}

/** Cihazların o an gösterdiği renkleri okur */
function startLivePoll() {
  clearInterval(L.liveTimer);
  if (!L.status?.connected) return;
  const tick = async () => {
    if (S.page !== 'lights') return clearInterval(L.liveTimer);
    const list = await api.rgb.live().catch(() => null);
    for (const d of list || []) L.live[d.id] = d;
    paintLive();
  };
  tick();
  L.liveTimer = setInterval(tick, 900);
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-rgb],[data-rgb-apply],[data-rgb-del],[data-rgb-eff],[data-rgb-native],[data-rgb-sel],[data-rgb-ex],[data-rgb-swatch],[data-rgb-devmode],[data-rgb-devprofile],[data-rgb-power]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.rgbEx) { e.stopPropagation(); const dev = L.status.devices.find((x) => x.id === +d.rgbEx); return setExcluded(dev.id, !dev.excluded); }
  if (d.rgbDel) {
    e.stopPropagation();
    await api.rgb.remove(d.rgbDel); L.status = await api.rgb.status(); return renderPage();
  }
  if (d.rgbSel) { L.sel = L.sel === +d.rgbSel ? null : +d.rgbSel; return renderPage(); }
  if (d.rgbPower !== undefined) return rgbRun(() => api.rgb.power(d.rgbPower === '1'), d.rgbPower === '1' ? 'Işıklar açıldı' : 'Işıklar kapatıldı');
  if (d.rgbApply) {
    const p = [...L.status.presets, ...L.status.profiles].find((x) => x.id === d.rgbApply);
    L.draft = { ...L.draft, effect: p.effect, colors: [...p.colors], speed: p.speed, brightness: p.brightness };
    saveDraft();
    return rgbRun(() => api.rgb.apply(p), `“${p.name}” uygulandı`);
  }
  if (d.rgbEff) { L.draft.effect = d.rgbEff; saveDraft(); renderPage(); return liveApply(); }
  if (d.rgbSwatch) {
    // Hazır renk: tek renkli efektlerde rengi, iki renklide boş olanı/ilkini değiştirir
    const two = ['wave', 'breathing'].includes(L.draft.effect);
    const idx = two && L.swatchNext === 1 ? 1 : 0;
    L.draft.colors[idx] = d.rgbSwatch;
    L.swatchNext = two ? 1 - idx : 0;
    saveDraft(); renderPage(); return liveApply();
  }
  if (d.rgbDevmode) { L.devMode[+d.rgbDevmode] = d.mode; return renderPage(); }
  if (d.rgbDevprofile) return rgbRun(() => api.rgb.apply({ ...L.draft, name: L.draft.name || 'Özel görünüm', id: 'draft' }, +d.rgbDevprofile), 'Cihaza uygulandı');
  if (d.rgbNative) {
    const dev = L.status.devices.find((x) => x.id === +d.rgbNative);
    const mode = L.devMode[dev.id] || dev.applied?.mode || dev.activeMode;
    const color = L.devColor[dev.id] || L.draft.colors[0];
    return rgbRun(() => api.rgb.native(dev.id, mode, { colors: [color, L.draft.colors[1]], speed: L.draft.speed, brightness: L.draft.brightness }), `${dev.name}: ${mode}`);
  }
  switch (d.rgb) {
    case 'install': {
      const a = S.catalog.apps.find((x) => x.key === 'openrgb');
      await startInstall([a], 'OpenRGB kur');
      return renderPage();
    }
    case 'connect': return autoConnect();
    case 'recheck': L.conflictsAt = 0; await loadConflicts(); return toast(L.conflicts.length ? 'Çakışma hâlâ sürüyor' : 'Çakışma yok, ışıklar Orbit\'te');
    case 'refresh': return rgbRun(() => api.rgb.refresh());
    case 'swap': L.draft.colors.reverse(); saveDraft(); renderPage(); return liveApply();
    case 'save': {
      const p = await api.rgb.save({ ...L.draft, name: L.draft.name || 'Profilim' });
      L.status = await api.rgb.status(); toast(`“${p.name}” kaydedildi`); return renderPage();
    }
  }
});

// OpenRGB kurulumu bitince otomatik bağlan
api.install.onProgress((p) => {
  if (p.key === 'openrgb' && ['done', 'skipped'].includes(p.status)) { L.status = null; if (S.page === 'lights') renderPage(); }
});
api.rgb.onStatus((st) => {
  const same = L.status && JSON.stringify(L.status) === JSON.stringify(st);
  L.status = st;
  if (!same && S.page === 'lights' && !L.applying && !document.activeElement?.matches('input')) renderPage();
});
// Kayıtlı taslak görünümü geri yükle
api.ui.get().then((ui) => {
  if (ui?.lightsDraft) L.draft = { ...L.draft, ...ui.lightsDraft };
}).catch(() => {});
