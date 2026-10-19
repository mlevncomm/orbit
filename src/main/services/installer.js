// Kurulum kuyruğu: winget / doğrudan indirme / npm / Windows Update sürücüleri
//
// İlkeler:
//  - İlerleme dürüsttür: indirme yüzdesi gerçek bayttan hesaplanır; kurulum aşamasında yükleyici
//    yüzde vermediği için yüzde gösterilmez (percent: null = belirsiz ilerleme).
//  - Başarı yalnızca çıkış koduna bağlı değildir: kurulumdan sonra envanter yeniden taranır ve
//    tanımlıysa doğrulama komutu (ör. `node --version`) çalıştırılır.
//  - Kuyruk diske yazılır: uygulama/bilgisayar yeniden başlarsa yarım kalan işler devam ettirilebilir.
//  - Aynı paket aynı anda iki kez kuyruğa giremez.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { runProcess, refreshPath } = require('./ps');
const U = require('./install-utils');
const drivers = require('./drivers');
const store = require('./store');
const log = require('./log');

const ACTIVE = new Set(['queued', 'running']);
const PLAIN = ['key', 'name', 'source', 'wingetId', 'url', 'args', 'npmPkg', 'ids', 'color', 'upgrade'];

class Installer extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.running = false;
    this.cancelled = false;
    this.child = null;
    this.current = null;
  }

  snapshot(item) {
    return {
      key: item.key, name: item.name, status: item.status, phase: item.phase || null,
      percent: item.percent ?? null, message: item.message || '', version: item.version || null,
      error: item.error || null, verified: item.verified ?? null, color: item.color,
    };
  }

  emitItem(item, patch) {
    Object.assign(item, patch);
    this.emit('progress', this.snapshot(item));
    if (patch.status) this.persist();
  }

  /** Bekleyen işleri diske yazar (yeniden başlatma sonrası devam için) */
  persist() {
    const pending = this.queue.filter((q) => ACTIVE.has(q.status)).map((q) => Object.fromEntries(PLAIN.map((k) => [k, q[k]])));
    store.set('installQueue', pending);
  }

  /** Önceki oturumdan yarım kalan işler */
  pendingFromLastRun() {
    return this.running ? [] : (store.get('installQueue') || []);
  }
  resumePending() { const p = this.pendingFromLastRun(); store.set('installQueue', []); return this.enqueue(p); }
  discardPending() { store.set('installQueue', []); return true; }

  list() { return this.queue.map((q) => this.snapshot(q)); }

  enqueue(items) {
    const activeKeys = new Set(this.queue.filter((q) => ACTIVE.has(q.status)).map((q) => q.key));
    const activeIds = new Set(this.queue.filter((q) => ACTIVE.has(q.status) && q.wingetId).map((q) => q.wingetId.toLowerCase()));
    let added = 0;
    for (const raw of items || []) {
      const it = Object.fromEntries(PLAIN.map((k) => [k, raw[k]]));
      if (activeKeys.has(it.key) || (it.wingetId && activeIds.has(it.wingetId.toLowerCase()))) continue; // çakışan kurulum yok
      if (it.source === 'winget' && !U.safeWingetId(it.wingetId)) { this.emit('progress', { key: it.key, name: it.name, status: 'error', message: 'Geçersiz paket kimliği' }); continue; }
      if (it.source === 'npm' && !U.safeNpmName(it.npmPkg)) { this.emit('progress', { key: it.key, name: it.name, status: 'error', message: 'Geçersiz npm paket adı' }); continue; }
      // Aynı anahtarlı eski (bitmiş) kaydı kuyruktan kaldır
      this.queue = this.queue.filter((q) => q.key !== it.key);
      const item = { ...it, status: 'queued', phase: null, percent: null, message: 'Sırada', error: null, verified: null, version: null };
      this.queue.push(item);
      activeKeys.add(it.key);
      if (it.wingetId) activeIds.add(it.wingetId.toLowerCase());
      this.emitItem(item, { status: 'queued' });
      added++;
    }
    if (added && !this.running) this.process();
    return added;
  }

  /** Sıradaki tek bir işi atlar (çalışanı durdurmaz) */
  skip(key) {
    const q = this.queue.find((x) => x.key === key && x.status === 'queued');
    if (q) this.emitItem(q, { status: 'cancelled', message: 'Atlandı' });
    return !!q;
  }

  /** Başarısız / iptal edilmiş işi yeniden sıraya koyar */
  retry(key) {
    const q = this.queue.find((x) => x.key === key && ['error', 'cancelled', 'warn'].includes(x.status));
    if (!q) return false;
    return this.enqueue([q]) > 0;
  }

  cancel() {
    this.cancelled = true;
    this.queue.filter((q) => q.status === 'queued').forEach((q) => this.emitItem(q, { status: 'cancelled', message: 'İptal edildi' }));
    if (this.child) try { this.child.kill(); } catch {}
    this.persist();
  }

  async process() {
    this.running = true;
    this.cancelled = false;
    this.emit('state', { running: true });
    let next;
    while (!this.cancelled && (next = this.queue.find((q) => q.status === 'queued'))) {
      this.current = next;
      this.emitItem(next, { status: 'running', phase: 'prepare', percent: null, message: 'Hazırlanıyor…' });
      try {
        const res = await this.installOne(next);
        const fin = res.status === 'error' ? res : await this.verify(next, res);
        this.emitItem(next, { ...fin, phase: null, percent: fin.status === 'error' ? null : 100 });
      } catch (e) {
        this.emitItem(next, { status: 'error', phase: null, percent: null, message: e.message || String(e), error: e.message || String(e) });
      }
      log.info(`Kurulum: ${next.name} → ${next.status} (${next.message})`);
      const history = store.get('history') || [];
      store.set('history', [{ key: next.key, name: next.name, status: next.status, message: next.message, version: next.version, at: new Date().toISOString() }, ...history].slice(0, 300));
    }
    this.running = false;
    this.child = null;
    this.current = null;
    const fin = this.queue.filter((q) => !ACTIVE.has(q.status));
    const summary = {
      running: false,
      done: fin.filter((q) => ['done', 'skipped'].includes(q.status)).length,
      warn: fin.filter((q) => q.status === 'warn').length,
      failed: fin.filter((q) => q.status === 'error').length,
      reboot: this.queue.some((q) => q.reboot),
    };
    this.persist();
    this.emit('state', summary);
  }

  installOne(item) {
    switch (item.source) {
      case 'winget': return this.winget(item);
      case 'url': return this.download(item);
      case 'npm': return this.npm(item);
      case 'wudrivers': return this.wuDrivers(item);
      default: throw new Error('Bu kurulum türü desteklenmiyor: ' + item.source);
    }
  }

  // ---------- Kaynaklar ----------

  async winget(item) {
    const args = ['install', '--id', item.wingetId, '-e', '--source', 'winget', '--silent',
      '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'];
    let phase = 'download';
    const tail = [];
    this.emitItem(item, { phase, percent: null, message: 'Paket bilgisi alınıyor…' });
    // winget, çıktısı yönlendirildiğinde indirme ilerlemesi YAZMIYOR (doğrulandı). Gerçek ilerleme için
    // kurulum dosyasının boyutu resmi adresinden alınır ve winget'in geçici klasöründeki dosya izlenir.
    const meta = await resolveInstaller(item.wingetId).catch(() => null);
    const stopWatch = meta ? watchDownload(item.wingetId, meta, (bytes) => {
      if (phase !== 'download' || !bytes) return;
      const mb = (bytes / 1048576).toFixed(1);
      this.emitItem(item, meta.size
        ? { percent: Math.min(99, Math.round((bytes / meta.size) * 100)), message: `İndiriliyor ${mb} / ${(meta.size / 1048576).toFixed(1)} MB` }
        : { percent: null, message: `İndiriliyor ${mb} MB (toplam boyut bilinmiyor)` });
    }) : () => {};
    // Yüzde yalnızca gerçekten bayt indiğinde gösterilir (zaten kuruluysa indirme hiç olmaz)
    this.emitItem(item, { percent: null, message: `İndirme bekleniyor${meta?.version ? ' · v' + meta.version : ''}${meta?.size ? ' · ' + (meta.size / 1048576).toFixed(1) + ' MB' : ''}` });
    const toInstall = () => {
      if (phase !== 'download') return;
      phase = 'install';
      stopWatch();
      this.emitItem(item, { phase, percent: null, message: 'Kuruluyor… (yükleyici ilerleme bildirmiyor)' });
    };
    const r = await runProcess('winget', args, {
      onSpawn: (c) => (this.child = c),
      onChunk: (line) => {
        tail.push(line); if (tail.length > 12) tail.shift();
        // winget çıktısı Türkçe/İngilizce olabilir: indirme bitti / kurulum başladı
        if (/verified installer hash|starting package install|installing|karma doğrula|kurulum başlat|yükleniyor|paket yüklemesi/i.test(line)) toInstall();
      },
    });
    stopWatch();
    let ex = U.explainExit(r.code);
    if (ex.kind === 'needs-user') {
      // Orbit yönetici olarak çalışır; bazı yükleyiciler (Spotify vb.) bunu reddeder → kullanıcı yetkisiyle yeniden dene
      log.info(`${item.wingetId}: yönetici bağlamı reddedildi, normal kullanıcı olarak deneniyor`);
      this.emitItem(item, { phase: 'install', percent: null, message: 'Yönetici bağlamı reddedildi · normal kullanıcı olarak kuruluyor…' });
      const u = await runAsUser(['install', '--id', item.wingetId, '-e', '--source', 'winget', '--silent',
        '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--scope', 'user']);
      tail.push(...u.output.split(/\r?\n/).slice(-6));
      ex = u.code == null ? { kind: 'error', text: u.error || 'Kullanıcı olarak çalıştırılamadı' } : U.explainExit(u.code);
      if (ex.kind === 'needs-user') ex = { kind: 'error', text: 'Yükleyici kullanıcı bağlamında da çalışmadı' };
    }
    if (ex.kind === 'error') {
      log.warn(`winget ${item.wingetId} çıkış ${U.hex(r.code)}: ${tail.join(' | ')}`);
      return { status: 'error', message: ex.text, error: `${ex.text} · ${U.hex(r.code)}` };
    }
    if (ex.kind === 'reboot') item.reboot = true;
    return { status: ex.kind === 'already' ? 'skipped' : 'done', message: ex.text };
  }

  async download(item) {
    if (!/^https:\/\//i.test(item.url)) throw new Error('Yalnızca https bağlantıları desteklenir');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-dl-'));
    const name = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || 'setup.exe').replace(/[^\w.-]/g, '_');
    const file = path.join(dir, /\.(exe|msi)$/i.test(name) ? name : name + '.exe');
    this.emitItem(item, { phase: 'download', percent: null, message: 'İndiriliyor…' });
    const res = await fetch(item.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`İndirme başarısız: HTTP ${res.status}`);
    const total = +res.headers.get('content-length') || 0;
    let got = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', (c) => {
      got += c.length;
      this.emitItem(item, { percent: total ? Math.round((got / total) * 100) : null, message: `İndiriliyor ${(got / 1048576).toFixed(1)}${total ? ' / ' + (total / 1048576).toFixed(1) : ''} MB` });
    });
    await pipeline(body, fs.createWriteStream(file));
    // Doğrudan indirilen yükleyicinin dijital imzasını göster (imzasız dosyayı kullanıcıya bildir)
    const sig = await new Promise((resolve) => {
      const p = spawn('powershell.exe', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}').Status`], { windowsHide: true });
      let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', () => resolve(o.trim()));
    });
    if (sig !== 'Valid') log.warn(`İmzasız/geçersiz imzalı yükleyici (${sig}): ${item.url}`);
    this.emitItem(item, { phase: 'install', percent: null, message: `Kuruluyor… (imza: ${sig === 'Valid' ? 'geçerli' : sig || 'bilinmiyor'})` });
    const isMsi = /\.msi$/i.test(file);
    const extra = (item.args || (isMsi ? '' : '/S')).split(' ').filter(Boolean);
    const r = isMsi
      ? await runProcess('msiexec', ['/i', file, '/qn', '/norestart', ...extra], { onSpawn: (c) => (this.child = c) })
      : await runProcess(file, extra, { onSpawn: (c) => (this.child = c) });
    fs.rm(dir, { recursive: true, force: true }, () => {});
    const ex = U.explainExit(r.code);
    if (ex.kind === 'error') return { status: 'error', message: ex.text, error: ex.text };
    if (ex.kind === 'reboot') item.reboot = true;
    return { status: 'done', message: ex.text };
  }

  async npm(item) {
    await refreshPath(); // Node.js aynı oturumda kurulduysa npm'i bulabilmek için
    this.emitItem(item, { phase: 'install', percent: null, message: `npm install -g ${item.npmPkg}` });
    // Paket adı safeNpmName ile doğrulandı; .cmd dosyaları Node'da yalnızca kabuk üzerinden çalışır
    const r = await runProcess('npm', ['install', '-g', item.npmPkg], { shell: true, onSpawn: (c) => (this.child = c) });
    if (r.code !== 0) return { status: 'error', message: r.code === -1 ? 'npm bulunamadı: önce Node.js kurulmalı' : `npm kurulumu başarısız (kod ${r.code})`, error: 'npm' };
    return { status: 'done', message: 'npm paketi kuruldu' };
  }

  async wuDrivers(item) {
    this.emitItem(item, { phase: 'prepare', percent: null, message: 'Sistem geri yükleme noktası oluşturuluyor…' });
    const rp = await drivers.createRestorePoint().catch((e) => ({ ok: false, message: e.message }));
    log.info('Geri yükleme noktası: ' + rp.message);
    this.emitItem(item, { phase: 'download', percent: null, message: `${rp.message} · Windows Update taranıyor…` });
    const res = await drivers.installWindowsUpdate(item.ids || [], (p) =>
      this.emitItem(item, { phase: p.stage === 'download' ? 'download' : 'install', percent: null, message: `${p.index}/${p.total} ${p.stage === 'download' ? 'indiriliyor' : 'kuruluyor'}: ${p.title}` }));
    if (res.reboot) item.reboot = true;
    if (!res.installed && !res.failed) return { status: 'skipped', message: 'Tüm sürücüler güncel', verified: true };
    return {
      status: res.failed && !res.installed ? 'error' : res.failed ? 'warn' : 'done',
      message: `${res.installed} sürücü kuruldu${res.failed ? `, ${res.failed} başarısız` : ''}${res.reboot ? ' · yeniden başlatma gerekli' : ''} · ${rp.message}`,
      verified: !res.failed,
    };
  }

  // ---------- Doğrulama ----------

  /** Kurulumdan sonra programın gerçekten kurulu olduğunu ve çalıştığını kontrol eder */
  async verify(item, res) {
    if (item.source === 'wudrivers') return res;
    this.emitItem(item, { phase: 'verify', percent: null, message: 'Doğrulanıyor…' });
    const inventory = require('./inventory');
    const catalog = require('./catalog');
    const app = catalog.getCatalog().apps.find((a) => a.key === item.key || (item.wingetId && a.wingetId?.toLowerCase() === item.wingetId.toLowerCase()))
      || { key: item.key, name: item.name, wingetId: item.wingetId };
    let st = { installed: false };
    try { inventory.invalidate(); await inventory.get(true); st = inventory.statusOf(app) || st; } catch (e) { log.warn('Doğrulama envanteri', e); }
    let cmdOut = null;
    if (app.verify) {
      await refreshPath();
      cmdOut = await runVerify(app.verify);
    }
    const version = U.extractVersion(cmdOut?.out) || st.version || null;
    const cmdOk = app.verify ? cmdOut.ok : null;
    const verified = (st.installed || item.source === 'npm') && cmdOk !== false;
    if (verified) {
      return { ...res, status: res.status, verified: true, version, message: `${res.status === 'skipped' ? 'Zaten kurulu' : 'Kuruldu'}${version ? ' · v' + version : ''}${app.verify ? ` · "${app.verify}" çalışıyor` : ''}${item.reboot ? ' · yeniden başlatma gerekli' : ''}` };
    }
    const why = !st.installed ? 'program sistemde bulunamadı' : `"${app.verify}" çalışmadı${cmdOut?.out ? ': ' + cmdOut.out.slice(0, 80) : ''}`;
    return { ...res, status: 'warn', verified: false, version, message: `Kurulum komutu bitti ama doğrulanamadı (${why})${item.reboot ? ' · yeniden başlatma sonrası tekrar kontrol et' : ''}` };
  }
}

/**
 * Paketin sürümünü ve resmi kurulum dosyası adresini `winget show` ile, boyutunu HEAD isteğiyle bulur.
 * Dönüş: { version, url, size } (size bilinmiyorsa 0)
 */
async function resolveInstaller(wingetId) {
  const r = await new Promise((resolve) => {
    const p = spawn('winget', ['show', '--id', wingetId, '-e', '--source', 'winget', '--accept-source-agreements', '--disable-interactivity'], { windowsHide: true });
    let out = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} }, 45000);
    p.stdout.on('data', (d) => (out += d));
    p.on('close', () => { clearTimeout(t); resolve(out); });
    p.on('error', () => { clearTimeout(t); resolve(''); });
  });
  const info = U.parseShow(r);
  if (!info.version) return null;
  let size = 0;
  if (info.url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(info.url, { method: 'HEAD', redirect: 'follow', signal: ctl.signal });
      size = +res.headers.get('content-length') || 0;
    } catch {} finally { clearTimeout(t); }
  }
  return { ...info, size };
}

/** winget'in geçici indirme klasöründeki (%TEMP%\WinGet\<Kimlik>.<Sürüm>) dosya büyümesini izler */
function watchDownload(wingetId, meta, onBytes) {
  const dir = path.join(os.tmpdir(), 'WinGet', `${wingetId}.${meta.version}`);
  const start = Date.now();
  let last = -1;
  const timer = setInterval(() => {
    let bytes = 0;
    try {
      for (const f of fs.readdirSync(dir)) {
        const st = fs.statSync(path.join(dir, f));
        if (st.isFile() && st.mtimeMs >= start - 2000) bytes += st.size;
      }
    } catch { return; }
    if (bytes !== last) { last = bytes; onBytes(bytes); }
  }, 400);
  return () => clearInterval(timer);
}

/**
 * winget'i oturum açmış kullanıcı olarak, SINIRLI yetkiyle çalıştırır (yönetici bağlamını reddeden
 * yükleyiciler için). Geçici bir zamanlanmış görev kullanılır ve iş bitince silinir.
 * Argümanlar yalnızca sabit bayraklar + doğrulanmış winget kimliğidir.
 * Dönüş: { code, output, error }
 */
async function runAsUser(args, { timeoutMs = 15 * 60 * 1000 } = {}) {
  if (!args.every((a) => /^[A-Za-z0-9.+\-_]+$/.test(a))) return { code: null, output: '', error: 'Geçersiz argüman' };
  const { runPS } = require('./ps');
  const name = `Orbit-kullanici-kurulum-${Date.now()}`;
  const out = path.join(os.tmpdir(), `${name}.txt`);
  const q = (s) => s.replace(/'/g, "''");
  const inner = `winget ${args.join(' ')} *> '${q(out)}'; Add-Content -LiteralPath '${q(out)}' ('EXIT:' + $LASTEXITCODE)`;
  const encoded = Buffer.from(inner, 'utf16le').toString('base64');
  const r = await runPS(`
    $user = (Get-CimInstance Win32_ComputerSystem).UserName
    if (-not $user) { 'NOUSER'; exit }
    $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ${encoded}'
    $p = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName '${name}' -Action $a -Principal $p -Settings $s -Force | Out-Null
    Start-ScheduledTask -TaskName '${name}'
    $deadline = (Get-Date).AddMilliseconds(${timeoutMs})
    # Görev durumu "sırada"dan "çalışıyor"a gecikmeli geçebilir: bitişi sonuç dosyasındaki EXIT satırından anla
    while ((Get-Date) -lt $deadline) {
      if ((Test-Path -LiteralPath '${q(out)}') -and (Select-String -LiteralPath '${q(out)}' -Pattern '^EXIT:' -Quiet)) { break }
      Start-Sleep -Milliseconds 700
    }
    Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false
    'DONE'
  `, { timeoutMs: timeoutMs + 60000 });
  let output = '';
  try {
    // Windows PowerShell'in *> yönlendirmesi UTF-16 LE (BOM'lu) yazar
    const buf = fs.readFileSync(out);
    output = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le').slice(1) : buf.toString('utf8');
    fs.rmSync(out, { force: true });
  } catch {}
  if (r.stdout.includes('NOUSER')) return { code: null, output, error: 'Oturum açmış kullanıcı bulunamadı' };
  const m = output.match(/EXIT:(-?\d+)/);
  return m ? { code: parseInt(m[1], 10), output } : { code: null, output, error: r.stderr.split('\n')[0] || 'Görev sonucu okunamadı' };
}

/** Katalogdaki sabit doğrulama komutunu (kullanıcı girdisi DEĞİL) zaman aşımıyla çalıştırır */
function runVerify(cmd) {
  return new Promise((resolve) => {
    const p = spawn('cmd.exe', ['/d', '/s', '/c', cmd], { windowsHide: true, env: process.env });
    let out = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} resolve({ ok: false, out: 'zaman aşımı' }); }, 20000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', () => { clearTimeout(t); resolve({ ok: false, out: 'çalıştırılamadı' }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ ok: code === 0 && !/is not recognized|tanınmıyor/i.test(out), out: out.trim().split(/\r?\n/)[0] || '' }); });
  });
}

module.exports = new Installer();
module.exports.runVerify = runVerify;
module.exports.resolveInstaller = resolveInstaller;
module.exports.watchDownload = watchDownload;
module.exports.runAsUser = runAsUser;
