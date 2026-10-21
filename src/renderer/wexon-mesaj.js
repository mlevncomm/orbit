/* Growth OS: müşteriye WhatsApp mesajı penceresi + şablonlar. wexon.js'deki W, wx, wxLoad ve app.js yardımcılarını kullanır. */
const GCATS = [
  ['ilk_temas', 'İlk temas'], ['otomasyon', 'Otomasyon'], ['bakim', 'Bakım ve iyileştirme'], ['huni', 'Satış hunisi'],
  ['takip', 'Nazik takip'], ['ilgili', 'İlgilenene yanıt'], ['fiyat', 'Fiyat sorusu'], ['itiraz', 'İtiraz'], ['kapanis', 'Kapanış'],
];
const REFINE = [['kisa', 'Daha kısa'], ['dogal', 'Daha doğal'], ['profesyonel', 'Daha profesyonel'], ['baski', 'Baskıyı azalt'], ['ozel', 'Daha özel']];
const OPT_OUT = 'İstemezseniz yazmanız yeterli, tekrar yazmam.';
const mentionsOptOut = (m) => /(istemezseniz|uygun değilse|ilgilenmiyorsanız|rahatsız etmeyeyim|tekrar yazmam|yazmayayım|“hayır” yazmanız|bir daha yazmam)/iu.test(m);
const SENDER_KEY = 'orbit-growth-sender';
const waDigitsOf = (p) => String(p || '').replace(/\D/g, '').replace(/^0(?=5\d{9}$)/, '90');

/** Müşteriye mesaj penceresi (Growth OS "WhatsApp'tan yaz") */
async function openLeadMessage(lead) {
  const m = {
    lead, boot: null, cat: null, sender: '', link: '', reply: '', drafts: [], pick: null, text: '', style: null,
    phone: lead.phone || '', busy: '', err: '', info: '',
  };
  try { m.sender = localStorage.getItem(SENDER_KEY) || S.settings.userName || ''; } catch {}
  const root = $('#modalRoot');
  const close = () => closeOverlays();
  const body = (extra) => ({ category: m.cat, senderName: m.sender.trim(), designLink: m.link.trim(), customerReply: m.reply.trim(), ...extra });
  const draw = () => {
    const b = m.boot;
    const pol = b?.policy;
    const needsReply = ['ilgili', 'fiyat', 'itiraz'].includes(m.cat);
    root.innerHTML = `<div class="modal wx-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>${h(lead.name)}</h3><p class="sub">${h([lead.district, lead.city].filter(Boolean).join(', '))}${lead.phone ? ' · ' + h(lead.phone) : ''}</p></div><button class="icon-btn sm" data-wm="close">${I('x')}</button></div>
      ${!b ? `<div class="empty small"><span class="spinner"></span><p>Müşteri bilgisi alınıyor…</p></div>` : `
      ${pol && !pol.allowed ? `<p class="note">${I('alert', 14)}<span>${h(pol.reason || 'Bu müşteriye şu an mesaj açılamaz.')}</span></p>` : ''}
      ${b.recent?.length ? `<p class="sub">Son temas: ${b.recent.slice(0, 2).map((r) => `${new Date(r.sentAt || r.createdAt).toLocaleDateString('tr-TR')} · ${h(r.category || r.templateId || '')}`).join(' · ')}</p>` : ''}
      <div class="form">
        <div class="row">
          <label class="field" style="flex:1"><span class="label">Mesaj türü</span><select class="input" id="wmCat">${GCATS.map(([k, l]) => `<option value="${k}" ${m.cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field" style="flex:1"><span class="label">Adın (mesajda)</span><input class="input" id="wmSender" value="${h(m.sender)}" placeholder="ör. Mehmet"></label>
        </div>
        <label class="field"><span class="label">Tasarım / örnek linki (isteğe bağlı)</span><input class="input" id="wmLink" value="${h(m.link)}" placeholder="https://…"></label>
        ${needsReply ? `<label class="field"><span class="label">Müşterinin yazdığı</span><textarea class="input" id="wmReply" rows="2" placeholder="Müşterinin son mesajını buraya yapıştır">${h(m.reply)}</textarea></label>` : ''}
        <div class="row"><button class="btn primary" data-wm="generate" ${m.busy ? 'disabled' : ''}>${m.busy === 'gen' ? '<span class="spinner"></span>' : I('sparkles')}Taslak üret</button>
          <span class="sub">${b.hasLlm ? 'Gemini ile kişiselleştirilir' : 'Gemini anahtarı yok: hazır kalıplardan üretilir'}</span></div>
        ${m.drafts.length ? `<div class="wm-drafts">${m.drafts.map((d, i) => `<button class="wm-draft ${m.pick === i ? 'on' : ''}" data-wm-pick="${i}"><b>${h(d.label)}</b><span>${h(d.message.slice(0, 140))}${d.message.length > 140 ? '…' : ''}</span></button>`).join('')}</div>` : ''}
        <label class="field"><span class="label">Gidecek mesaj</span><textarea class="input wx-msg" id="wmText" rows="6" placeholder="Taslak seç ya da kendin yaz">${h(m.text)}</textarea></label>
        ${pol?.retHakkiGerekli ? `<p class="sub">Açık onay olmadığı için sonuna ret cümlesi eklenecek: “${OPT_OUT}”</p>` : ''}
        <div class="row">${REFINE.map(([k, l]) => `<button class="chip" data-wm-refine="${k}" ${!m.text.trim() || m.busy ? 'disabled' : ''}>${m.busy === k ? '<span class="spinner" style="width:12px;height:12px"></span>' : ''}${l}</button>`).join('')}</div>
        <div class="row">
          <label class="field" style="flex:1"><span class="label">WhatsApp numarası</span><input class="input" id="wmPhone" value="${h(m.phone)}" placeholder="+90 5xx xxx xx xx"></label>
        </div>
        ${m.err ? `<p class="note warnbox">${I('alert', 14)}<span>${h(m.err)}</span></p>` : ''}${m.info ? `<p class="sub">${h(m.info)}</p>` : ''}
        <div class="row"><button class="btn" data-wm="template" ${!m.text.trim() ? 'disabled' : ''}>${I('star')}Şablon olarak kaydet</button><span class="spacer"></span>
          <button class="btn primary" data-wm="send" ${!m.text.trim() || m.busy || (pol && !pol.allowed) ? 'disabled' : ''}>${m.busy === 'send' ? '<span class="spinner"></span>' : I('message')}WhatsApp'ta aç</button></div>
        <p class="sub">Mesaj WhatsApp'ta hazır açılır; göndermek sende. Müşteri durumu ve not kendiliğinden güncellenir.</p>
      </div>`}
    </div>`;
    const bind = (id, key) => { const el = $('#' + id); if (el) el.addEventListener('input', () => { m[key] = el.value; if (key === 'text') syncButtons(); }); };
    bind('wmSender', 'sender'); bind('wmLink', 'link'); bind('wmReply', 'reply'); bind('wmText', 'text'); bind('wmPhone', 'phone');
    const c = $('#wmCat'); if (c) c.addEventListener('change', () => { m.cat = c.value; m.drafts = []; m.pick = null; draw(); });
  };
  const syncButtons = () => {
    const empty = !m.text.trim();
    root.querySelectorAll('[data-wm-refine],[data-wm="template"],[data-wm="send"]').forEach((b) => { b.disabled = empty || !!m.busy || (b.dataset.wm === 'send' && m.boot?.policy && !m.boot.policy.allowed); });
  };
  const act = async (fn) => { m.err = ''; try { await fn(); } catch (e) { m.err = e.message; } m.busy = ''; draw(); };

  root.onclick = async (e) => {
    const t = e.target.closest('[data-wm],[data-wm-pick],[data-wm-refine]');
    if (!t || t.disabled) return;
    if (t.dataset.wmPick !== undefined) { const d = m.drafts[+t.dataset.wmPick]; m.pick = +t.dataset.wmPick; m.text = d.message; m.style = d.style; m.info = d.reason || ''; return draw(); }
    if (t.dataset.wmRefine) {
      m.busy = t.dataset.wmRefine; draw();
      return act(async () => { const r = await api.growth.messageAction(lead.id, body({ action: 'refine', mode: t.dataset.wmRefine, style: m.style, message: m.text })); m.text = r.draft.message; m.style = 'elle'; m.info = [r.draft.reason, ...(r.warnings || [])].filter(Boolean).join(' '); });
    }
    switch (t.dataset.wm) {
      case 'close': return close();
      case 'generate':
        m.busy = 'gen'; draw();
        try { localStorage.setItem(SENDER_KEY, m.sender.trim()); } catch {}
        return act(async () => { const r = await api.growth.messageAction(lead.id, body({ action: 'generate' })); m.drafts = r.result.drafts || []; m.pick = r.result.recommended ?? 0; const d = m.drafts[m.pick]; if (d) { m.text = d.message; m.style = d.style; } m.info = (r.result.warnings || []).join(' '); });
      case 'template':
        return act(async () => {
          let gov = m.text.trim();
          if (lead.name) gov = gov.split(lead.name).join('{ad}');
          await api.growth.saveTemplate({ name: `${(GCATS.find((c) => c[0] === m.cat) || [, 'Mesaj'])[1]} · ${new Date().toLocaleDateString('tr-TR')}`, body: gov });
          m.info = 'Şablon kaydedildi'; W.templates = null;
        });
      case 'send': {
        const digits = waDigitsOf(m.phone);
        if (!/^\d{10,15}$/.test(digits)) { m.err = 'Geçerli bir WhatsApp (cep) numarası gir'; return draw(); }
        const gidecek = m.boot?.policy?.retHakkiGerekli && !mentionsOptOut(m.text) ? `${m.text.trim()} ${OPT_OUT}` : m.text.trim();
        m.busy = 'send'; draw();
        return act(async () => {
          // Önce sunucu kuralları (izin, tekrar, kalite) uygulanır; uygunsa kaydedilir ve WhatsApp açılır
          const r = await api.growth.messageAction(lead.id, body({ action: 'record', style: m.style || 'elle', message: gidecek, phone: m.phone }));
          await api.growth.openWhatsApp(digits, gidecek);
          toast(`WhatsApp açıldı; müşteri “${stLabel(r.lead?.status || lead.status)}” olarak işaretlendi`);
          close();
          W.leads = null; W.loaded = {}; wxLoad();
        });
      }
    }
  };

  $('#scrim').classList.add('show');
  draw();
  try {
    m.boot = await api.growth.message(lead.id);
    m.cat = m.boot.category || 'ilk_temas';
    if (!m.phone && m.boot.ctx?.phone) m.phone = m.boot.ctx.phone;
  } catch (e) { m.boot = { policy: { allowed: false, reason: e.message } }; m.cat = 'ilk_temas'; }
  draw();
}

/** Şablonlar sekmesi */
function templatesView() {
  if (!W.templates && !W.busy) wx(() => api.growth.templates(), (r) => (W.templates = r));
  const list = W.templates;
  const ed = W.tplEdit;
  const form = ed ? `<form class="card form" id="wxTpl">
      <h3>${ed.id ? 'Şablonu düzenle' : 'Yeni şablon'}</h3>
      <label class="field"><span class="label">Ad</span><input class="input" name="name" value="${h(ed.name || '')}" required maxlength="80"></label>
      <label class="field"><span class="label">Metin</span><textarea class="input wx-msg" name="body" rows="6" required>${h(ed.body || '')}</textarea><small>{ad} yazdığın yere müşterinin adı gelir.</small></label>
      <div class="row"><span class="spacer"></span><button class="btn" type="button" data-wt="cancel">Vazgeç</button><button class="btn primary" type="submit">Kaydet</button></div>
    </form>` : '';
  return `${form}
    <div class="card" style="margin-top:${ed ? 14 : 0}px"><div class="card-head"><div><h3>Mesaj şablonları</h3><p class="sub">Müşteri penceresinde kaydettiğin ya da buradan eklediğin hazır mesajlar</p></div>
      <button class="btn primary sm" data-wt="new">${I('plus')}Yeni şablon</button></div>
      <div class="rec-list">${!list ? '<div class="empty small"><span class="spinner"></span></div>' : list.length ? list.map((t) => `<div class="rec-item"><div class="txt"><b>${h(t.name)}</b><p>${h(t.body.slice(0, 220))}${t.body.length > 220 ? '…' : ''}</p></div>
        <button class="btn sm" data-wt="edit" data-id="${t.id}">Düzenle</button><button class="btn sm" data-wt="del" data-id="${t.id}">${I('trash', 14)}</button></div>`).join('') : '<div class="empty small">Henüz şablon yok.</div>'}</div></div>`;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-wt],[data-wx-msg],[data-wx-del]');
  if (!t || t.disabled) return;
  if (t.dataset.wxMsg) { const l = (W.leads || []).find((x) => x.id === t.dataset.wxMsg) || (W.overview?.recentLeads || []).find((x) => x.id === t.dataset.wxMsg); return l && openLeadMessage(l); }
  if (t.dataset.wxDel) {
    const l = (W.leads || []).find((x) => x.id === t.dataset.wxDel);
    if (!confirm(`${l?.name || 'Bu müşteri'} silinsin mi? Mesaj geçmişi de silinir.`)) return;
    return wx(() => api.growth.deleteLead(t.dataset.wxDel), () => { W.leads = (W.leads || []).filter((x) => x.id !== t.dataset.wxDel); W.sel.delete(t.dataset.wxDel); toast('Müşteri silindi'); });
  }
  switch (t.dataset.wt) {
    case 'new': W.tplEdit = {}; return renderPage();
    case 'edit': W.tplEdit = { ...(W.templates || []).find((x) => x.id === t.dataset.id) }; return renderPage();
    case 'cancel': W.tplEdit = null; return renderPage();
    case 'del':
      if (!confirm('Şablon silinsin mi?')) return;
      return wx(() => api.growth.deleteTemplate(t.dataset.id), () => { W.templates = null; toast('Şablon silindi'); });
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'wxTpl') return;
  e.preventDefault();
  const o = Object.fromEntries(new FormData(e.target).entries());
  wx(() => api.growth.saveTemplate({ ...o, id: W.tplEdit?.id }), () => { W.tplEdit = null; W.templates = null; toast('Şablon kaydedildi'); });
});
