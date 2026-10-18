/* Işıklar (RGB) sayfası — app.js'deki S, PAGES, I, h, $ yardımcılarını kullanır */
const L = {
  status: null,
  busy: false,
  error: '',
  draft: { name: '', effect: 'wave', colors: ['#00e5c0', '#7b2ff7'], speed: 4, brightness: 100 },
  devColor: {},
  devMode: {},
};

const DEVICE_ICON = { 'Klavye': 'keyboard', 'Fare': 'mouse', 'RAM': 'memory', 'Ekran Kartı': 'gpu', 'Anakart': 'board', 'Kasa': 'box', 'LED Şerit': 'light', 'Soğutucu': 'fan', 'Kulaklık': 'headphones' };

/** Efektin canlı CSS önizlemesi */
function rgbPreview(p, tall) {
  const [a, b] = p.colors;
  const dur = Math.max(0.6, 8 / (p.speed || 3)).toFixed(2) + 's';
  const op = p.effect === 'off' ? 1 : Math.max(0.15, (p.brightness ?? 100) / 100);
  let bg, anim = '';
  switch (p.effect) {
    case 'static': bg = a; break;
    case 'off': bg = '#16161a'; break;
    case 'breathing': bg = a; anim = `rgbBreath ${dur} ease-in-out infinite`; break;
    case 'pulse': bg = a; anim = `rgbPulse ${dur} ease-out infinite`; break;
    case 'spectrum': bg = '#ff3b3b'; anim = `rgbHue ${dur} linear infinite`; break;
    case 'rainbow': bg = 'linear-gradient(90deg,#ff3b3b,#ffb000,#3bff6b,#00d0ff,#7a3bff,#ff3bd0,#ff3b3b) 0 0/200% 100%'; anim = `rgbSlide ${dur} linear infinite`; break;
    case 'wave': bg = `linear-gradient(90deg,${a},${b},${a}) 0 0/200% 100%`; anim = `rgbSlide ${dur} linear infinite`; break;
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
  const head = `<div class="page-head"><div><h1>Işıklar</h1><p>Klavye, fare, kasa, RAM, anakart ve ekran kartı RGB'lerini tek yerden yönet</p></div>
    <div class="row">${st?.connected ? `<span class="chip"><span class="status-dot done"></span>OpenRGB bağlı · ${st.devices.length} cihaz</span><button class="btn" data-rgb="refresh">${I('refresh')}Cihazları yenile</button>` : ''}</div></div>`;

  if (!st) return head + `<div class="card empty"><span class="spinner"></span><p>RGB cihazları aranıyor…</p></div>`;
  if (!st.installed) {
    const job = S.jobs.get('openrgb');
    return head + `<div class="card empty" style="padding:40px">${I('light', 34)}<h3 style="margin-top:12px">RGB kontrolü için OpenRGB gerekli</h3>
      <p>OpenRGB; Gigabyte RGB Fusion, ASUS Aura, MSI Mystic Light, Corsair, G.Skill, Kingston Fury RAM, Logitech, Razer, SteelSeries ve yüzlerce cihazı destekler. Orbit arka planda onu kullanarak efektleri çalıştırır.</p>
      <button class="btn primary" data-rgb="install" ${job && ['queued', 'running'].includes(job.status) ? 'disabled' : ''}>${I('download')}${job ? h(statusLabel(job) + ' · ' + (job.message || '')) : 'OpenRGB\'yi kur'}</button></div>`;
  }
  if (!st.connected) {
    return head + `<div class="card empty" style="padding:40px">${I('light', 34)}<p>${L.busy ? 'OpenRGB başlatılıyor ve cihazlar taranıyor (ilk seferde 10-20 sn)…' : 'OpenRGB kurulu ama bağlı değil.'}</p>
      ${L.error ? `<p style="color:var(--danger)">${h(L.error)}</p>` : ''}
      <button class="btn primary" data-rgb="connect" ${L.busy ? 'disabled' : ''}>${L.busy ? '<span class="spinner"></span>' : I('zap')}Bağlan</button>
      <p class="sub" style="margin-top:12px">RAM ve anakart ışıkları için Orbit'in yönetici olarak çalışması gerekir.</p></div>`;
  }

  const active = st.active;
  const preset = (p, mine) => `<button class="preset ${active && active.id === p.id ? 'on' : ''}" data-rgb-apply="${h(p.id)}">
      ${rgbPreview(p)}<span class="pn"><b>${h(p.name)}</b><small>${h(st.effects[p.effect] || p.effect)}</small></span>
      ${mine ? `<span class="del" data-rgb-del="${h(p.id)}" title="Sil">${I('trash', 14)}</span>` : ''}</button>`;
  const d = L.draft;
  const effChips = Object.entries(st.effects).map(([k, v]) => `<button class="${d.effect === k ? 'active' : ''}" data-rgb-eff="${k}">${v}</button>`).join('');
  const twoColor = d.effect === 'wave';
  const devices = st.devices.map((dev) => `
    <div class="dev">
      <div class="row" style="flex-wrap:nowrap"><span class="dev-ic">${I(DEVICE_ICON[dev.type] || 'chip')}</span>
        <div style="min-width:0;flex:1"><b>${h(dev.name)}</b><small>${h(dev.type)} · ${dev.leds} LED${dev.activeMode ? ' · ' + h(dev.activeMode) : ''}</small></div></div>
      <div class="row">
        <input type="color" class="swatch" data-rgb-devcolor="${dev.id}" value="${L.devColor[dev.id] || '#ffffff'}">
        <button class="btn sm" data-rgb-devapply="${dev.id}">Renk ver</button>
        <select class="input sm" data-rgb-devmode="${dev.id}">${dev.modes.map((m) => `<option ${(L.devMode[dev.id] || dev.activeMode) === m ? 'selected' : ''}>${h(m)}</option>`).join('')}</select>
        <button class="btn sm" data-rgb-native="${dev.id}" title="Cihazın kendi donanım efekti">Mod</button>
      </div>
    </div>`).join('');

  return head + `
    <div class="section-title" style="margin-top:0">Hazır görünümler</div>
    <div class="presets">${st.presets.map((p) => preset(p)).join('')}</div>
    ${st.profiles.length ? `<div class="section-title">Profillerim</div><div class="presets">${st.profiles.map((p) => preset(p, true)).join('')}</div>` : ''}
    <div class="two">
      <div class="card form">
        <h3>Kendi görünümünü oluştur</h3>
        ${rgbPreview(d, true)}
        <div class="seg wrap">${effChips}</div>
        <div class="row">
          <label class="field" style="flex:1"><span class="sub">Renk ${twoColor ? '1' : ''}</span><input type="color" class="swatch wide" data-rgb-c="0" value="${d.colors[0]}"></label>
          ${twoColor ? `<label class="field" style="flex:1"><span class="sub">Renk 2</span><input type="color" class="swatch wide" data-rgb-c="1" value="${d.colors[1]}"></label>` : ''}
        </div>
        <label class="field"><span class="sub">Hız · ${d.speed}</span><input type="range" min="1" max="10" value="${d.speed}" data-rgb-range="speed"></label>
        <label class="field"><span class="sub">Parlaklık · %${d.brightness}</span><input type="range" min="5" max="100" value="${d.brightness}" data-rgb-range="brightness"></label>
        <div class="row"><input class="input" id="rgbName" placeholder="Profil adı (ör. Gece Modu)" value="${h(d.name)}" style="flex:1;min-width:160px">
          <button class="btn" data-rgb="save">${I('star')}Kaydet</button><button class="btn primary" data-rgb="apply-draft">${I('zap')}Tümüne uygula</button></div>
      </div>
      <div class="card"><h3>Cihazlar</h3><p class="sub" style="margin-bottom:12px">Tek bir cihaza renk ya da donanım modu ver</p>
        <div class="devs">${devices || '<div class="empty">OpenRGB cihaz bulamadı. RAM / anakart için yönetici olarak çalıştırın, sonra "Cihazları yenile".</div>'}</div></div>
    </div>`;
};
PAGES.lightsAfter = () => {
  if (!L.status) rgbLoad(false).then(() => { if (L.status?.installed && !L.status.connected && !L.busy) autoConnect(); });
  document.querySelectorAll('[data-rgb-c]').forEach((el) => el.addEventListener('input', () => { L.draft.colors[+el.dataset.rgbC] = el.value; refreshDraftPreview(); }));
  document.querySelectorAll('[data-rgb-range]').forEach((el) => el.addEventListener('input', () => {
    L.draft[el.dataset.rgbRange] = +el.value;
    el.previousElementSibling.textContent = el.dataset.rgbRange === 'speed' ? `Hız · ${el.value}` : `Parlaklık · %${el.value}`;
    refreshDraftPreview();
  }));
  document.querySelectorAll('[data-rgb-devcolor]').forEach((el) => el.addEventListener('input', () => (L.devColor[el.dataset.rgbDevcolor] = el.value)));
  document.querySelectorAll('[data-rgb-devmode]').forEach((el) => el.addEventListener('change', () => (L.devMode[el.dataset.rgbDevmode] = el.value)));
  const n = $('#rgbName'); if (n) n.addEventListener('input', () => (L.draft.name = n.value));
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
async function rgbApply(profile, deviceId) {
  try {
    await api.rgb.apply(profile, deviceId ?? null);
    if (deviceId == null) L.status = await api.rgb.status();
    toast(deviceId == null ? `“${profile.name || 'Görünüm'}” uygulandı` : 'Cihaza uygulandı');
    renderPage();
  } catch (e) { toast(e.message, true); }
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-rgb],[data-rgb-apply],[data-rgb-del],[data-rgb-eff],[data-rgb-devapply],[data-rgb-native]');
  if (!t) return;
  const d = t.dataset;
  if (d.rgbDel) {
    e.stopPropagation();
    await api.rgb.remove(d.rgbDel); L.status = await api.rgb.status(); return renderPage();
  }
  if (d.rgbApply) {
    const p = [...L.status.presets, ...L.status.profiles].find((x) => x.id === d.rgbApply);
    L.draft = { ...L.draft, effect: p.effect, colors: [...p.colors], speed: p.speed, brightness: p.brightness };
    return rgbApply(p);
  }
  if (d.rgbEff) { L.draft.effect = d.rgbEff; return renderPage(); }
  if (d.rgbDevapply) return rgbApply({ effect: 'static', colors: [L.devColor[d.rgbDevapply] || '#ffffff', '#000000'], speed: 1, brightness: 100 }, +d.rgbDevapply);
  if (d.rgbNative) {
    const dev = L.status.devices.find((x) => x.id === +d.rgbNative);
    return rgbApply({ native: L.devMode[dev.id] || dev.activeMode }, dev.id);
  }
  switch (d.rgb) {
    case 'install': {
      const a = S.catalog.apps.find((x) => x.key === 'openrgb');
      await startInstall([a], 'OpenRGB kur');
      return renderPage();
    }
    case 'connect': return autoConnect();
    case 'refresh': L.status = await api.rgb.refresh().catch((er) => { toast(er.message, true); return L.status; }); return renderPage();
    case 'apply-draft': return rgbApply({ ...L.draft, name: L.draft.name || 'Özel görünüm', id: 'draft' });
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
api.rgb.onStatus((st) => { L.status = st; if (S.page === 'lights') renderPage(); });
