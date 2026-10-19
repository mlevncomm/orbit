/* Işıklar (RGB) sayfası — app.js'deki S, PAGES, I, h, $, toast, saveUi, saveSetting yardımcılarını kullanır */
const L = {
  status: null,
  busy: false,       // bağlanıyor
  applying: false,   // bir görünüm uygulanıyor
  error: '',
  draft: { name: '', effect: 'wave', colors: ['#00e5c0', '#7b2ff7'], speed: 3, brightness: 100 },
  devColor: {},
  devMode: {},
  liveApply: true,   // taslak değişince ışıklar anında güncellenir
  pending: null,     // uygulama sürerken gelen son istek
  liveTimer: null,
};

const DEVICE_ICON = { 'Klavye': 'keyboard', 'Fare': 'mouse', 'RAM': 'memory', 'Ekran Kartı': 'gpu', 'Anakart': 'board', 'Kasa': 'box', 'LED Şerit': 'light', 'Soğutucu': 'fan', 'Kulaklık': 'headphones' };
const saveDraft = () => saveUi({ lightsDraft: { ...L.draft } });

/** Efektin canlı CSS önizlemesi (hız, cihazdaki döngü süresiyle aynı ölçekte) */
function rgbPreview(p, tall) {
  const [a, b] = p.colors;
  const period = (16 - ((p.speed - 1) / 9) * 14).toFixed(2) + 's';
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
  return `<div class="rgb-prev ${tall ? 'tall' : ''}"><i style="background:${bg};animation:${anim};opacity:${op}"></i></div>`;
}

async function rgbLoad(connect) {
  try {
    L.status = connect ? await api.rgb.connect() : await api.rgb.status();
    L.error = '';
  } catch (e) { L.error = e.message; L.status = L.status || await api.rgb.status().catch(() => null); }
  if (S.page === 'lights') renderPage();
}

PAGES.lights = () => {
  const st = L.status;
  const head = `<div class="page-head"><div><h1>Işıklar</h1><p>Klavye, fare, kasa, RAM, anakart ve ekran kartı RGB'leri</p></div>
    <div class="row">${st?.connected ? `<span class="chip"><span class="status-dot done"></span>${st.devices.length} cihaz bağlı</span>
      <div class="seg"><button class="${st.engine !== 'sync' ? 'active' : ''}" data-engine="hardware" title="Efekt cihazın kendi çipinde çalışır">Donanım</button><button class="${st.engine === 'sync' ? 'active' : ''}" data-engine="sync" title="Direct destekleyen cihazlar aynı saatle">Senkron</button></div>
      <button class="btn" data-rgb="refresh">${I('refresh')}Yenile</button>` : ''}</div></div>`;

  if (!st) return head + `<div class="card empty"><span class="spinner"></span><p>RGB cihazları aranıyor…</p></div>`;
  if (!st.installed) {
    const job = S.jobs.get('openrgb');
    return head + `<div class="card empty" style="padding:40px">${I('light', 34)}<h3 style="margin-top:12px">RGB kontrolü için OpenRGB gerekli</h3>
      <p>OpenRGB; Gigabyte RGB Fusion, ASUS Aura, MSI Mystic Light, Corsair, G.Skill, Kingston Fury, Logitech, Razer, SteelSeries ve yüzlerce cihazı destekler. Orbit onu arka planda kullanır.</p>
      <button class="btn primary" data-rgb="install" ${job && ['queued', 'running'].includes(job.status) ? 'disabled' : ''}>${I('download')}${job ? h(statusLabel(job) + ' · ' + (job.message || '')) : 'OpenRGB\'yi kur'}</button></div>`;
  }
  if (!st.connected) {
    return head + `<div class="card empty" style="padding:40px">${I('light', 34)}<p>${L.busy ? 'OpenRGB başlatılıyor ve cihazlar taranıyor (ilk seferde 10-20 sn)…' : 'OpenRGB kurulu ama bağlı değil.'}</p>
      ${L.error ? `<p style="color:var(--danger)">${h(L.error)}</p>` : ''}
      <button class="btn primary" data-rgb="connect" ${L.busy ? 'disabled' : ''}>${L.busy ? '<span class="spinner"></span>' : I('zap')}Bağlan</button>
      <p class="sub" style="margin-top:12px">RAM ve anakart ışıkları için Orbit'in yönetici olarak çalışması gerekir.</p></div>`;
  }

  const active = st.active;
  const dis = L.applying ? 'disabled' : '';
  const preset = (p, mine) => `<button class="preset ${active && active.id === p.id ? 'on' : ''}" data-rgb-apply="${h(p.id)}" ${dis}>
      ${rgbPreview(p)}<span class="pn"><b>${h(p.name)}</b><small>${h(st.effects[p.effect] || p.effect)}</small></span>
      ${active && active.id === p.id ? `<span class="on-badge">${I('check', 12)}</span>` : ''}
      ${mine ? `<span class="del" data-rgb-del="${h(p.id)}" title="Sil">${I('trash', 14)}</span>` : ''}</button>`;
  const d = L.draft;
  const effChips = Object.entries(st.effects).map(([k, v]) => `<button class="${d.effect === k ? 'active' : ''}" data-rgb-eff="${k}">${v}</button>`).join('');
  const twoColor = ['wave', 'breathing'].includes(d.effect);
  const noColor = ['rainbow', 'spectrum', 'off'].includes(d.effect);

  const devices = st.devices.map((dev) => {
    const ap = dev.applied;
    const method = ap ? `<span class="tag ${ap.method === 'Donanım' ? 'hw' : 'sw'}" title="${h(ap.note || '')}">${ap.method === 'Donanım' ? I('chip', 12) : I('zap', 12)} ${h(ap.method)} · ${h(ap.mode)}</span>` : '';
    return `
    <div class="dev">
      <div class="row" style="flex-wrap:nowrap"><span class="dev-ic">${I(DEVICE_ICON[dev.type] || 'chip')}</span>
        <div style="min-width:0;flex:1"><b>${h(dev.name)}</b><small>${h(dev.type)} · ${dev.leds} LED${dev.saves ? ' · ayar cihazda saklanır' : ''}</small></div></div>
      <div class="live-strip" data-live="${dev.id}"></div>
      ${method || ap?.note ? `<div class="row">${method}${ap?.note ? `<small class="sub">${h(ap.note)}</small>` : ''}</div>` : ''}
      <div class="row">
        <select class="input sm" data-rgb-devmode="${dev.id}">${dev.modes.map((m) => `<option ${(L.devMode[dev.id] || ap?.mode || dev.activeMode) === m ? 'selected' : ''}>${h(m)}</option>`).join('')}</select>
        <input type="color" class="swatch" data-rgb-devcolor="${dev.id}" value="${L.devColor[dev.id] || d.colors[0]}" title="Mod rengi">
        <button class="btn sm" data-rgb-native="${dev.id}" ${dis}>Uygula</button>
      </div>
    </div>`;
  }).join('');

  return head + `
    <div class="section-title" style="margin-top:0">Hazır görünümler</div>
    <div class="presets">${st.presets.map((p) => preset(p)).join('')}</div>
    ${st.profiles.length ? `<div class="section-title">Profillerim</div><div class="presets">${st.profiles.map((p) => preset(p, true)).join('')}</div>` : ''}
    <div class="two">
      <div class="card form">
        <h3>Kendi görünümünü oluştur</h3>
        ${rgbPreview(d, true)}
        <div class="seg wrap">${effChips}</div>
        ${noColor ? '' : `<div class="row">
          <label class="field" style="flex:1"><span class="sub">${twoColor ? 'Renk 1' : 'Renk'}</span><input type="color" class="swatch wide" data-rgb-c="0" value="${d.colors[0]}"></label>
          ${twoColor ? `<label class="field" style="flex:1"><span class="sub">Renk 2</span><input type="color" class="swatch wide" data-rgb-c="1" value="${d.colors[1]}"></label>` : ''}
        </div>`}
        ${['static', 'off'].includes(d.effect) ? '' : `<label class="field"><span class="sub">Hız · ${d.speed}/10</span><input type="range" min="1" max="10" value="${d.speed}" data-rgb-range="speed"></label>`}
        ${d.effect === 'off' ? '' : `<label class="field"><span class="sub">Parlaklık · %${d.brightness}</span><input type="range" min="5" max="100" step="5" value="${d.brightness}" data-rgb-range="brightness"></label>`}
        <label class="switch"><input type="checkbox" id="rgbLive" ${L.liveApply ? 'checked' : ''}><span>Değiştirdikçe ışıklara uygula<small>Renk, efekt, hız ve parlaklık değişince tüm cihazlar anında güncellenir.</small></span></label>
        <div class="row"><input class="input" id="rgbName" placeholder="Profil adı (ör. Gece Modu)" value="${h(d.name)}" style="flex:1;min-width:160px">
          <button class="btn" data-rgb="save">${I('star')}Profil olarak kaydet</button>
          <button class="btn primary" data-rgb="apply-draft" ${dis}>${L.applying ? '<span class="spinner"></span>' : I('zap')}Tümüne uygula</button></div>
      </div>
      <div class="card"><h3>Cihazlar</h3><p class="sub" style="margin-bottom:12px">Her cihaza kendi donanım modunu ve rengini ayrı ver. Seçimin hatırlanır.</p>
        <div class="devs">${devices || '<div class="empty">OpenRGB cihaz bulamadı. RAM / anakart için yönetici olarak çalıştırın, sonra "Yenile".</div>'}</div></div>
    </div>`;
};

PAGES.lightsAfter = () => {
  if (!L.status) rgbLoad(false).then(() => { if (L.status?.installed && !L.status.connected && !L.busy) autoConnect(); });
  document.querySelectorAll('[data-rgb-c]').forEach((el) => {
    el.addEventListener('input', () => { L.draft.colors[+el.dataset.rgbC] = el.value; refreshDraftPreview(); saveDraft(); liveApply(); });
  });
  // Kaydırıcı sürüklenirken yalnızca önizleme güncellenir; cihaza komut gönderilmez
  document.querySelectorAll('[data-rgb-range]').forEach((el) => el.addEventListener('input', () => {
    L.draft[el.dataset.rgbRange] = +el.value;
    el.previousElementSibling.textContent = el.dataset.rgbRange === 'speed' ? `Hız · ${el.value}/10` : `Parlaklık · %${el.value}`;
    refreshDraftPreview();
    saveDraft();
  }));
  // Kaydırıcı bırakılınca (change) uygula; sürüklerken komut gönderilmez
  document.querySelectorAll('[data-rgb-range]').forEach((el) => el.addEventListener('change', liveApply));
  const live = $('#rgbLive'); if (live) live.addEventListener('change', () => { L.liveApply = live.checked; saveUi({ rgbLiveApply: live.checked }); });
  startLivePoll();
  document.querySelectorAll('[data-rgb-devcolor]').forEach((el) => el.addEventListener('input', () => (L.devColor[el.dataset.rgbDevcolor] = el.value)));
  document.querySelectorAll('[data-rgb-devmode]').forEach((el) => el.addEventListener('change', () => (L.devMode[el.dataset.rgbDevmode] = el.value)));
  const n = $('#rgbName'); if (n) n.addEventListener('input', () => { L.draft.name = n.value; saveDraft(); });
};

function refreshDraftPreview() {
  const box = document.querySelector('.form .rgb-prev.tall');
  if (box) box.outerHTML = rgbPreview(L.draft, true);
}

async function autoConnect() {
  L.busy = true; renderPage();
  await rgbLoad(true);
  L.busy = false; renderPage();
}

const liveApply = debounce(() => {
  if (!L.liveApply || !L.status?.connected) return;
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

/** Cihazların o an gösterdiği renkleri kartlardaki şeritte günceller */
function startLivePoll() {
  clearInterval(L.liveTimer);
  if (!L.status?.connected) return;
  const tick = async () => {
    if (S.page !== 'lights') return clearInterval(L.liveTimer);
    const list = await api.rgb.live().catch(() => null);
    for (const d of list || []) {
      const el = document.querySelector(`[data-live="${d.id}"]`);
      if (!el) continue;
      el.classList.toggle('hw', d.hardwareAnim);
      el.title = d.hardwareAnim ? `${d.mode}: efekt cihazın kendi çipinde çalışıyor (mod renkleri gösteriliyor)` : 'Cihazdaki LED renkleri (canlı)';
      el.innerHTML = (d.colors.length ? d.colors : ['#000000']).map((c) => `<i style="background:${c}"></i>`).join('') + (d.hardwareAnim ? `<em>${h(d.mode)}</em>` : '');
    }
  };
  tick();
  L.liveTimer = setInterval(tick, 900);
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

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-rgb],[data-rgb-apply],[data-rgb-del],[data-rgb-eff],[data-rgb-native]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.rgbDel) {
    e.stopPropagation();
    await api.rgb.remove(d.rgbDel); L.status = await api.rgb.status(); return renderPage();
  }
  if (d.rgbApply) {
    const p = [...L.status.presets, ...L.status.profiles].find((x) => x.id === d.rgbApply);
    L.draft = { ...L.draft, effect: p.effect, colors: [...p.colors], speed: p.speed, brightness: p.brightness };
    saveDraft();
    return rgbRun(() => api.rgb.apply(p), `“${p.name}” uygulandı`);
  }
  if (d.rgbEff) { L.draft.effect = d.rgbEff; saveDraft(); renderPage(); return liveApply(); }
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
    case 'refresh': return rgbRun(() => api.rgb.refresh());
    case 'apply-draft': return rgbRun(() => api.rgb.apply({ ...L.draft, name: L.draft.name || 'Özel görünüm', id: 'draft' }), 'Görünüm uygulandı');
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
api.rgb.onStatus((st) => { L.status = st; if (S.page === 'lights' && !L.applying) renderPage(); });
// Kayıtlı taslak görünümü geri yükle
api.ui.get().then((ui) => {
  if (ui?.lightsDraft) L.draft = { ...L.draft, ...ui.lightsDraft };
  if (typeof ui?.rgbLiveApply === 'boolean') L.liveApply = ui.rgbLiveApply;
}).catch(() => {});
