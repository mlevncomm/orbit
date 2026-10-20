/* Hafıza sekmesi (Asistan sayfasında) — app.js'deki S, I, h, $, toast, renderPage yardımcılarını kullanır */
const M = { state: null, filter: 'all', editing: null, busy: false };

async function memLoad() {
  M.state = await api.memory.state().catch(() => null);
  if (S.page === 'assistant' && S.asstTab === 'memory') renderPage();
}
api.memory.onChanged((st) => { M.state = st; if (S.page === 'assistant' && S.asstTab === 'memory' && !document.activeElement?.matches('input,textarea')) renderPage(); });

const SRC_ICON = { elle: 'plus', kullanim: 'activity', sohbet: 'sparkles', growth: 'zap' };
const ago = (t) => {
  const d = Math.round((Date.now() - t) / 60000);
  return d < 1 ? 'az önce' : d < 60 ? `${d} dk önce` : d < 1440 ? `${Math.round(d / 60)} sa önce` : new Date(t).toLocaleDateString('tr-TR');
};

function memoryView() {
  const st = M.state;
  if (!st) { memLoad(); return `<div class="card empty"><span class="spinner"></span><p>Hafıza açılıyor…</p></div>`; }
  const items = st.items.filter((x) => M.filter === 'all' || x.cat === M.filter || x.source === M.filter);
  const count = (fn) => st.items.filter(fn).length;
  const learnNote = !S.settings.hasApiKey
    ? 'Sohbetten öğrenmek için Ayarlar\'dan Claude API anahtarı ekle.'
    : st.lastLearn ? `Sohbetten en son ${ago(st.lastLearn)} öğrendi.` : 'Her sohbetten sonra arka planda öğrenir.';

  const row = (x) => M.editing === x.id
    ? `<div class="mem-row editing">
        <select class="input sm" id="memEditCat">${Object.entries(st.cats).map(([k, v]) => `<option value="${k}" ${x.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input class="input" id="memEditText" value="${h(x.text)}" maxlength="400">
        <button class="btn primary sm" data-mem="save" data-id="${x.id}">Kaydet</button><button class="btn sm" data-mem="cancel">Vazgeç</button></div>`
    : `<div class="mem-row ${x.pinned ? 'pinned' : ''}">
        <span class="mem-src" title="${h(st.sourceNames[x.source] || x.source)}">${I(SRC_ICON[x.source] || 'sparkles', 15)}</span>
        <div class="mem-txt"><p>${h(x.text)}</p><small>${h(st.cats[x.cat] || x.cat)} · ${h(st.sourceNames[x.source] || x.source)} · ${ago(x.updatedAt)}</small></div>
        <button class="icon-btn sm ${x.pinned ? 'on' : ''}" data-mem="pin" data-id="${x.id}" title="${x.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle: asistan her zaman bilsin'}">${I('star', 15)}</button>
        <button class="icon-btn sm" data-mem="edit" data-id="${x.id}" title="Düzenle">${I('settings', 15)}</button>
        <button class="icon-btn sm" data-mem="del" data-id="${x.id}" title="Sil">${I('trash', 15)}</button></div>`;

  const chips = [['all', 'Tümü', st.items.length], ...Object.entries(st.cats).map(([k, v]) => [k, v, count((x) => x.cat === k)])]
    .filter(([k, , n]) => k === 'all' || n)
    .map(([k, v, n]) => `<button class="cat ${M.filter === k ? 'active' : ''}" data-mem-filter="${k}">${h(v)}<em>${n}</em></button>`).join('');

  return `
    <section class="page-banner mesh lilac">
      <div><span class="kicker">Orbit hafızası</span><h2>${st.items.length ? `Seni ${st.items.length} bilgiyle tanıyor` : 'Seni tanımaya hazır'}</h2>
        <p>Bilgiler yalnızca bu bilgisayarda${st.encrypted ? ', Windows hesabınla şifreli' : ''} saklanır. Şifre, API anahtarı ve kart numarası hiçbir zaman kaydedilmez. ${h(learnNote)}</p></div>
      <div class="banner-stats">
        ${Object.entries(st.sourceNames).map(([k, v]) => `<label class="stat glass mem-toggle"><b>${count((x) => x.source === k)}</b><span>${h(v)}</span>
          <span class="switch compact"><input type="checkbox" data-mem-src="${k}" ${st.sources[k] ? 'checked' : ''} ${k === 'elle' ? 'disabled' : ''}></span></label>`).join('')}
      </div>
    </section>
    <div class="card">
      <form class="row" id="memAdd" style="flex-wrap:nowrap">
        <select class="input sm" id="memCat">${Object.entries(st.cats).map(([k, v]) => `<option value="${k}" ${k === 'not' ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input class="input" id="memText" placeholder="Orbit'in bilmesini istediğin bir şey… (ör. wexon.dev'in sahibiyim, müşterilerim esnaf)" maxlength="400" style="flex:1">
        <button class="btn primary" type="submit">${I('plus')}Hatırla</button>
      </form>
    </div>
    <div class="cats" style="margin-top:14px">${chips}</div>
    <div class="card mem-list">${items.length ? items.map(row).join('') : `<div class="empty small"><p>${st.items.length ? 'Bu filtrede bilgi yok.' : 'Henüz bir şey öğrenmedi. Bir not ekle ya da asistanla konuş.'}</p></div>`}</div>
    <div class="row" style="margin-top:12px;justify-content:flex-end">
      ${S.settings.hasApiKey ? `<button class="btn sm" data-mem="learn" ${M.busy ? 'disabled' : ''}>${M.busy ? '<span class="spinner"></span>' : I('sparkles')}Sohbetten şimdi öğren</button>` : ''}
      <button class="btn sm" data-mem="clear">${I('trash')}Hafızayı temizle</button>
    </div>`;
}

function memoryAfter() {
  const f = $('#memAdd');
  if (f) f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#memText').value.trim();
    if (!text) return;
    try { M.state = await api.memory.add(text, $('#memCat').value); toast('Hatırlanacak'); renderPage(); } catch (err) { toast(err.message, true); }
  });
  document.querySelectorAll('[data-mem-src]').forEach((el) => el.addEventListener('change', async () => {
    M.state = await api.memory.sources({ [el.dataset.memSrc]: el.checked });
    toast(el.checked ? 'Bu kaynaktan öğrenme açık' : 'Bu kaynaktan öğrenme kapalı');
    renderPage();
  }));
  const t = $('#memEditText'); if (t) { t.focus(); t.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-mem="save"]').click(); if (e.key === 'Escape') { M.editing = null; renderPage(); } }); }
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-mem],[data-mem-filter]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.memFilter) { M.filter = d.memFilter; return renderPage(); }
  try {
    switch (d.mem) {
      case 'pin': { const x = M.state.items.find((i) => i.id === d.id); M.state = await api.memory.update(d.id, { pinned: !x.pinned }); break; }
      case 'edit': M.editing = d.id; break;
      case 'cancel': M.editing = null; break;
      case 'save': M.state = await api.memory.update(d.id, { text: $('#memEditText').value, cat: $('#memEditCat').value }); M.editing = null; toast('Güncellendi'); break;
      case 'del': M.state = await api.memory.remove(d.id); break;
      case 'clear':
        if (!confirm('Orbit\'in senin hakkında öğrendiği her şey silinsin mi? Bu geri alınamaz.')) return;
        M.state = await api.memory.clear(); toast('Hafıza temizlendi'); break;
      case 'learn': {
        M.busy = true; renderPage();
        const r = await api.memory.learn().finally(() => { M.busy = false; });
        await memLoad();
        toast(r.learned ? `${r.learned} yeni bilgi öğrenildi` : 'Yeni bir bilgi bulunmadı');
        break;
      }
    }
  } catch (err) { toast(err.message, true); }
  renderPage();
});
