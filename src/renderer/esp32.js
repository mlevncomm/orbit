/* ESP32 Hub sayfası — app.js yardımcılarını kullanır (S, PAGES, I, h, $, toast, safe, renderPage) */
const E = {
  ports: null,
  status: { state: 'disconnected', logs: [] },
  busy: false,
  baud: 115200,
  port: null,
  devStatus: null,
  lastPing: null,
  boards: {},
  identifying: false,
};
const BAUDS = [115200, 74880, 9600, 57600, 230400, 460800, 921600];
const STATE_TEXT = { disconnected: 'Bağlı değil', connecting: 'Bağlanıyor…', connected: 'Bağlı', reconnecting: 'Yeniden bağlanıyor…' };

async function espLoadPorts() {
  E.ports = await safe(() => api.esp32.ports(), 'Portlar okunamadı') || [];
  if (!E.port) E.port = (E.ports.find((p) => p.likelyEsp) || E.ports[0])?.port || null;
  if (S.page === 'esp32') renderPage();
}

function espLogHtml() {
  const logs = E.status.logs || [];
  if (!logs.length) return '<div class="sub" style="padding:10px">Henüz veri yok.</div>';
  return logs.slice(-150).map((l) => `<div class="log-line ${l.dir}"><span>${new Date(l.at).toLocaleTimeString('tr-TR')}</span><em>${{ in: '←', out: '→', sys: '•', err: '!' }[l.dir] || ''}</em><code>${h(l.text)}</code></div>`).join('');
}

PAGES.esp32 = () => {
  const st = E.status;
  const dev = st.device;
  const connected = st.state === 'connected';
  const port = (E.ports || []).find((p) => p.port === (st.port || E.port));
  const caps = dev?.caps || [];
  const board = E.boards[(st.port || E.port || '').toUpperCase()];
  const portList = E.ports === null
    ? '<div class="empty small"><span class="spinner"></span><p>Portlar taranıyor…</p></div>'
    : !E.ports.length ? `<div class="empty small">${I('usb', 26)}<p>Bilgisayara bağlı seri port yok. Kartı USB veri kablosuyla tak (bazı kablolar yalnızca şarj eder).</p></div>`
    : E.ports.map((p) => `<label class="port ${E.port === p.port ? 'sel' : ''}"><input type="radio" name="espPort" value="${h(p.port)}" ${E.port === p.port ? 'checked' : ''}>
        <span class="port-ic">${I('usb', 18)}</span><span><b>${h(p.port)}</b> · ${h(p.bridge || 'Bilinmeyen köprü')}<small>${E.boards[p.port]?.chip ? `${h(E.boards[p.port].chip)} · ${h(E.boards[p.port].flashSize || '')} (esptool ile doğrulandı)` : h(p.guess || p.name)}</small><small class="mono">VID ${h(p.vid || '?')} · PID ${h(p.pid || '?')} · ${h(p.status || '')}</small></span></label>`).join('');

  const firmwareBox = connected && !dev
    ? `<div class="note warnbox">${I('alert', 14)}<div><b>Kartta Orbit firmware yok (ya da baud hızı farklı).</b> Bağlantı ham seri konsol olarak çalışıyor: kartın yazdıklarını görebilir, satır gönderebilirsin.
        Çift yönlü Orbit komutları (LED, durum, ping) için <code>firmware/orbit-companion</code> karta yüklenmeli. Yükleme karttaki mevcut programı siler; bu yüzden Orbit kendiliğinden yüklemez.</div></div>` : '';

  return `
    <div class="page-head"><div><h1>ESP32 Hub</h1><p>USB ile bağlı kartın bağlantısı, firmware'i ve iki yönlü haberleşmesi</p></div>
      <div class="row"><span class="chip"><span class="status-dot ${connected ? 'done' : st.state === 'disconnected' ? '' : 'running'}"></span>${STATE_TEXT[st.state] || st.state}${st.port ? ' · ' + h(st.port) : ''}</span>
      <button class="btn" data-esp="scan">${I('refresh')}Portları tara</button></div></div>
    <div class="esp-grid">
      <div class="card form">
        <h3>Kart ve port</h3>
        <div class="ports">${portList}</div>
        <div class="row"><label class="sub">Baud</label><select class="input sm" id="espBaud">${BAUDS.map((b) => `<option ${E.baud === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
          <span class="spacer"></span>
          ${st.state === 'disconnected'
            ? `<button class="btn primary" data-esp="connect" ${!E.port || E.busy ? 'disabled' : ''}>${E.busy ? '<span class="spinner"></span>' : I('zap')}Bağlan</button>`
            : `<button class="btn" data-esp="disconnect">${I('x')}Bağlantıyı kes</button>`}</div>
        <p class="sub">Port DTR/RTS kapalı açılır: kart resetlenmez, firmware'e dokunulmaz. Arduino IDE seri monitörü açıksa port meşgul görünür. Bağlantı koparsa Orbit 3 sn'de bir yeniden bağlanmayı dener.</p>
      </div>
      <div class="card form">
        <h3>Firmware</h3>
        ${dev ? `<div class="kv">
            <span>Firmware</span><b>${h(dev.fw)} v${h(dev.ver)}</b>
            <span>Çip</span><b>${h(dev.chip || '?')} rev ${h(dev.rev ?? '?')} · ${h(dev.cores ?? '?')} çekirdek · ${h(dev.mhz ?? '?')} MHz</b>
            <span>Flash</span><b>${dev.flash ? Math.round(dev.flash / 1048576) + ' MB' : '?'}</b>
            <span>MAC</span><b class="mono">${h(dev.mac || '?')}</b>
            <span>Yetenekler</span><b>${caps.map((c) => `<span class="badge">${h(c)}</span>`).join(' ') || '-'}</b>
          </div>` : `<div class="kv"><span>Durum</span><b>${connected ? 'Orbit firmware yanıt vermiyor' : 'Bağlı değil'}</b>
            ${board ? `<span>Çip</span><b>${h(board.chip)}${board.revision ? ' (rev ' + h(board.revision) + ')' : ''} <span class="badge">esptool ile doğrulandı</span></b>
              <span>Özellikler</span><b>${h(board.features || '-')}</b><span>Flash</span><b>${h(board.flashSize || '?')} · kristal ${h(board.crystal || '?')}</b>
              <span>MAC</span><b class="mono">${h(board.mac || '?')}</b><span>Tanımlandı</span><b>${new Date(board.at).toLocaleString('tr-TR')}</b>`
            : `<span>Model</span><b>${h(port?.guess || 'bilinmiyor')}</b>`}</div>`}
        <div class="row"><button class="btn sm" data-esp="identify" ${!(st.port || E.port) || E.identifying ? 'disabled' : ''}>${E.identifying ? '<span class="spinner"></span>' : I('search')}${board ? 'Çipi yeniden tanımla' : 'Çipi esptool ile tanımla'}</button>
          <span class="sub">Salt okunur: kart kısa süre yeniden başlar, flash'a yazılmaz.</span></div>
        ${firmwareBox}
        <details class="fw-help"><summary>Firmware nasıl yüklenir?</summary>
          <ol><li>Karttaki mevcut programı yedekle: <code>esptool --port ${h(st.port || E.port || 'COM3')} read_flash 0 ALL yedek.bin</code></li>
          <li>Çipi doğrula: <code>esptool --port ${h(st.port || E.port || 'COM3')} chip_id</code> (ESP8266 çıkarsa bu firmware uyumsuz)</li>
          <li><code>firmware/orbit-companion</code> klasörünü Arduino IDE / arduino-cli ile derleyip yükle (README içinde komutlar).</li></ol>
          <p class="sub">Orbit'in kendisinden tek tıkla yükleme, kartın modeli doğrulanıp açık onay verildiğinde eklenecek.</p></details>
      </div>
    </div>
    <div class="esp-grid">
      <div class="card form">
        <h3>Testler ve komutlar</h3>
        <div class="row">
          <button class="btn" data-esp="ping" ${dev ? '' : 'disabled'}>${I('activity')}Ping</button>
          <button class="btn" data-esp="status" ${dev ? '' : 'disabled'}>${I('chip')}Durum oku</button>
          ${caps.includes('led') ? `<button class="btn" data-esp="led-on">${I('light')}LED aç</button><button class="btn" data-esp="led-off">LED kapat</button><button class="btn" data-esp="led-blink">${I('zap')}Yanıp sön</button>`
            : `<span class="sub">${dev ? 'Kart dahili LED bildirmiyor: LED komutları gizli.' : 'Komutlar Orbit firmware ile çalışır.'}</span>`}
        </div>
        ${E.lastPing ? `<p class="sub">Son ping: <b>${E.lastPing.rttMs} ms</b> gidiş-dönüş · kart çalışma süresi ${Math.round((E.lastPing.uptimeMs || 0) / 1000)} sn</p>` : ''}
        ${E.devStatus ? `<div class="kv"><span>Çalışma süresi</span><b>${Math.round(E.devStatus.uptimeMs / 1000)} sn</b><span>Boş bellek</span><b>${Math.round(E.devStatus.heapFree / 1024)} KB (en düşük ${Math.round(E.devStatus.heapMin / 1024)} KB)</b><span>LED</span><b>${E.devStatus.led ? 'açık' : 'kapalı'}</b></div>` : ''}
        <form class="row" id="espNotify"><input class="input" id="espNotifyText" placeholder="Karta durum mesajı gönder (notify)" maxlength="120" style="flex:1" ${dev ? '' : 'disabled'}><button class="btn" ${dev ? '' : 'disabled'}>${I('send')}Gönder</button></form>
      </div>
      <div class="card form">
        <div class="row"><h3>Seri konsol</h3><span class="spacer"></span><span class="sub">${(st.logs || []).length} satır</span></div>
        <div class="console" id="espConsole">${espLogHtml()}</div>
        <form class="row" id="espRaw"><input class="input mono" id="espRawText" placeholder="Karta ham satır yaz (yalnızca karta gider)" maxlength="256" style="flex:1" ${connected ? '' : 'disabled'}><button class="btn" ${connected ? '' : 'disabled'}>${I('send')}</button></form>
      </div>
    </div>`;
};

PAGES.esp32After = () => {
  if (E.ports === null) espLoadPorts();
  document.querySelectorAll('input[name=espPort]').forEach((el) => el.addEventListener('change', () => { E.port = el.value; renderPage(); }));
  const baud = $('#espBaud'); if (baud) baud.addEventListener('change', () => (E.baud = +baud.value));
  const c = $('#espConsole'); if (c) c.scrollTop = c.scrollHeight;
  const raw = $('#espRaw'); if (raw) raw.addEventListener('submit', async (e) => { e.preventDefault(); const t = $('#espRawText').value; if (!t) return; await safe(() => api.esp32.raw(t)); $('#espRawText').value = ''; });
  const nf = $('#espNotify'); if (nf) nf.addEventListener('submit', async (e) => {
    e.preventDefault(); const t = $('#espNotifyText').value.trim(); if (!t) return;
    const r = await safe(() => api.esp32.command('notify', { text: t }), 'Gönderilemedi');
    if (r) { toast(`Kart aldı (${r.rttMs} ms)`); $('#espNotifyText').value = ''; }
  });
};

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-esp]');
  if (!t || t.disabled) return;
  switch (t.dataset.esp) {
    case 'scan': E.ports = null; renderPage(); return espLoadPorts();
    case 'connect':
      E.busy = true; renderPage();
      E.status = await safe(() => api.esp32.connect(E.port, E.baud), 'Bağlanılamadı') || E.status;
      E.busy = false; return renderPage();
    case 'disconnect': E.status = await safe(() => api.esp32.disconnect()) || E.status; E.devStatus = null; E.lastPing = null; return renderPage();
    case 'ping': { const r = await safe(() => api.esp32.command('ping'), 'Ping başarısız'); if (r) { E.lastPing = r; renderPage(); } return; }
    case 'status': { const r = await safe(() => api.esp32.readStatus(), 'Durum okunamadı'); if (r) { E.devStatus = r; renderPage(); } return; }
    case 'identify': {
      const p = E.status.port || E.port;
      if (!confirm(`${p} üzerindeki kart esptool ile tanımlanacak. Kart birkaç saniyeliğine önyükleme moduna alınıp yeniden başlatılır; içindeki program silinmez. Devam edilsin mi?`)) return;
      E.identifying = true; renderPage();
      const info = await safe(() => api.esp32.identify(p), 'Tanımlanamadı');
      E.identifying = false;
      if (info) { E.boards[info.port] = info; E.status = await api.esp32.status(); toast(`${info.chip} · ${info.flashSize || ''}`); }
      return renderPage();
    }
    case 'led-on': return safe(() => api.esp32.command('led', { state: 'on' }), 'LED');
    case 'led-off': return safe(() => api.esp32.command('led', { state: 'off' }), 'LED');
    case 'led-blink': return safe(() => api.esp32.command('led', { state: 'blink', ms: 3000 }), 'LED');
  }
});

api.esp32.onStatus((st) => { E.status = st; if (S.page === 'esp32' && !document.activeElement?.matches('input')) renderPage(); });
api.esp32.onLog((l) => {
  E.status.logs = [...(E.status.logs || []), l].slice(-500);
  if (S.page !== 'esp32') return;
  const c = $('#espConsole');
  if (c) { c.innerHTML = espLogHtml(); c.scrollTop = c.scrollHeight; }
});
api.esp32.status().then((st) => { E.status = st; }).catch(() => {});
api.esp32.boards().then((b) => { E.boards = b || {}; }).catch(() => {});
