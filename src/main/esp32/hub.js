// ESP32 Hub: USB seri kart algılama, bağlantı, Orbit protokolü, otomatik yeniden bağlanma.
//
// Seri port erişimi için yerel (native) Node modülü yerine Windows'un yerleşik
// System.IO.Ports.SerialPort sınıfını kullanan küçük bir PowerShell köprüsü çalıştırılır:
// paketlenmiş uygulamada derleme/uyumluluk sorunu olmaz. Köprü <-> Node arası çerçeve:
//   köprü → Node : "O" (açıldı) | "D <base64>" (veri) | "E <mesaj>" (hata)
//   Node → köprü : "W <base64>" (yaz) | "Q" (kapat)
// DTR/RTS kapalı açılır: çoğu ESP32 kartında bu hatlar kartı resetler / boot moduna sokar.
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { runPSJson } = require('../services/ps');
const P = require('./protocol');

// Bilinen USB-seri köprüleri. Köprü çipi kartın modelini KESİN söylemez.
const BRIDGES = {
  '1A86:7523': { bridge: 'WCH CH340', guess: 'ESP32 / ESP8266 / Arduino klonu (köprüden model anlaşılamaz)' },
  '1A86:55D4': { bridge: 'WCH CH9102', guess: 'ESP32 geliştirme kartı (muhtemel; model kesin değil)' },
  '1A86:7522': { bridge: 'WCH CH340K', guess: 'ESP32 / Arduino klonu (model kesin değil)' },
  '10C4:EA60': { bridge: 'Silicon Labs CP210x', guess: 'ESP32 DevKit (muhtemel; model kesin değil)' },
  '0403:6001': { bridge: 'FTDI FT232', guess: 'Seri kart (model kesin değil)' },
  '0403:6010': { bridge: 'FTDI FT2232', guess: 'ESP-Prog / ESP32-WROVER-KIT (muhtemel)' },
  '303A:1001': { bridge: 'Espressif yerleşik USB (JTAG/serial)', guess: 'ESP32-S3 / C3 / C6 / H2 (yerleşik USB)' },
  '303A:0002': { bridge: 'Espressif yerleşik USB (TinyUSB)', guess: 'ESP32-S2 / S3 (yerleşik USB)' },
};

const BRIDGE_PS = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::ASCII
$sp = New-Object System.IO.Ports.SerialPort $env:ORBIT_PORT, ([int]$env:ORBIT_BAUD), 'None', 8, 'One'
$sp.DtrEnable = $false; $sp.RtsEnable = $false; $sp.ReadTimeout = 50; $sp.WriteTimeout = 1000
try { $sp.Open() } catch { [Console]::Out.WriteLine('E ' + $_.Exception.Message); exit 2 }
# Seri okuma AYRI iş parçacığında: Windows PowerShell 5.1'de Console.In.ReadLineAsync gerçekte
# eşzamanlı çalışır ve döngüyü bloke eder (yanıtlar ancak bir sonraki yazmada okunuyordu).
$rs = [runspacefactory]::CreateRunspace(); $rs.Open(); $rs.SessionStateProxy.SetVariable('sp', $sp)
$reader = [powershell]::Create(); $reader.Runspace = $rs
[void]$reader.AddScript({
  $buf = New-Object byte[] 4096
  while ($sp.IsOpen) {
    try {
      $n = $sp.Read($buf, 0, $buf.Length)
      if ($n -gt 0) { [Console]::Out.WriteLine('D ' + [Convert]::ToBase64String($buf, 0, $n)); [Console]::Out.Flush() }
    } catch [System.TimeoutException] { }
    catch { if ($sp.IsOpen) { [Console]::Out.WriteLine('E ' + $_.Exception.Message); [Console]::Out.Flush() }; break }
  }
})
$job = $reader.BeginInvoke()
# Okuyucu çalışmaya başladıktan sonra 'hazır' de: el sıkışma yanıtı kaçmasın
while ($reader.InvocationStateInfo.State -ne 'Running') { Start-Sleep -Milliseconds 20 }
[Console]::Out.WriteLine('O'); [Console]::Out.Flush()
try {
  while ($true) {
    $cmd = [Console]::In.ReadLine()
    if ($cmd -eq $null -or $cmd -eq 'Q') { break }
    if ($cmd.StartsWith('W ')) { $b = [Convert]::FromBase64String($cmd.Substring(2)); $sp.Write($b, 0, $b.Length) }
  }
} catch { [Console]::Out.WriteLine('E ' + $_.Exception.Message) }
finally { if ($sp.IsOpen) { $sp.Close() }; $reader.Stop(); $rs.Close() }
`;

const ALLOWED_COMMANDS = new Set(['led', 'ping', 'notify', 'info', 'wifi', 'wifi_off', 'result']); // ESP32'ye gönderilebilen komutlar
const SECRET_KEYS = ['pass', 'token']; // günlükte asla açık yazılmaz
const redact = (line) => line.replace(/"(pass|token)":"[^"]*"/g, '"$1":"***"');

class Esp32Hub extends EventEmitter {
  constructor({ log } = {}) {
    super();
    this.log = log || { info() {}, warn() {}, error() {} };
    this.proc = null;
    this.port = null;
    this.baud = 115200;
    this.state = 'disconnected'; // disconnected | connecting | connected | reconnecting
    this.device = null;          // HELLO yanıtı (Orbit firmware) ya da null
    this.lastSeen = 0;
    this.logs = [];
    this.nextId = 1;
    this.pendingReq = new Map();
    this.heartbeat = null;
    this.reconnectTimer = null;
    this.wanted = false;         // kullanıcı bağlı kalmak istiyor mu (otomatik yeniden bağlanma)
    this.decoder = new P.LineDecoder((line) => this.onLine(line));
  }

  /** Bilgisayara bağlı COM portlarını ve bilinen USB köprülerini listeler */
  async listPorts() {
    const list = await runPSJson(`
      @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\\(COM\\d+\\)' } | ForEach-Object {
        $m = [regex]::Match([string]$_.PNPDeviceID, 'VID_([0-9A-F]{4})&PID_([0-9A-F]{4})')
        @{ name = $_.Name; port = [regex]::Match($_.Name, 'COM\\d+').Value; status = $_.Status;
           vid = if ($m.Success) { $m.Groups[1].Value } else { '' }; pid = if ($m.Success) { $m.Groups[2].Value } else { '' } } }) | ConvertTo-Json -Compress
    `, { timeoutMs: 30000 });
    return [].concat(list || []).map((p) => {
      const known = BRIDGES[`${p.vid}:${p.pid}`];
      return { ...p, bridge: known?.bridge || null, guess: known?.guess || null, likelyEsp: !!known };
    }).sort((a, b) => b.likelyEsp - a.likelyEsp);
  }

  status() {
    return {
      state: this.state, port: this.port, baud: this.baud, device: this.device,
      orbitFirmware: !!this.device, lastSeen: this.lastSeen, logs: this.logs.slice(-200),
    };
  }

  pushLog(dir, text) {
    const e = { at: Date.now(), dir, text: String(text).slice(0, 500) };
    this.logs.push(e);
    if (this.logs.length > 500) this.logs.shift();
    this.emit('log', e);
  }

  setState(s) { this.state = s; this.emit('status', this.status()); }

  /** Porta bağlanır, Orbit firmware'i varsa el sıkışır. Firmware yoksa ham konsol olarak kalır. */
  async connect(port, baud = 115200) {
    if (!/^COM\d+$/i.test(port)) throw new Error('Geçersiz port');
    if (this.proc) this.closeBridge();
    this.port = port.toUpperCase(); this.baud = +baud || 115200;
    this.wanted = true;
    this.device = null;
    this.setState('connecting');
    await this.openBridge();
    this.setState('connected');
    this.pushLog('sys', `${this.port} açıldı (${this.baud} baud)`);
    await this.handshake();
    return this.status();
  }

  openBridge() {
    return new Promise((resolve, reject) => {
      const encoded = Buffer.from(BRIDGE_PS, 'utf16le').toString('base64');
      const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true, env: { ...process.env, ORBIT_PORT: this.port, ORBIT_BAUD: String(this.baud) },
      });
      this.proc = proc;
      let opened = false, out = '';
      const timer = setTimeout(() => { if (!opened) { proc.kill(); reject(new Error('Port açılamadı (zaman aşımı)')); } }, 8000);
      proc.stdout.on('data', (d) => {
        out += d.toString('ascii');
        let i;
        while ((i = out.indexOf('\n')) >= 0) {
          const line = out.slice(0, i).trim(); out = out.slice(i + 1);
          if (line === 'O') { opened = true; clearTimeout(timer); resolve(); }
          else if (line.startsWith('D ')) { this.lastSeen = Date.now(); this.decoder.push(Buffer.from(line.slice(2), 'base64').toString('utf8')); }
          else if (line.startsWith('E ')) {
            const msg = line.slice(2);
            this.pushLog('err', msg);
            if (!opened) { clearTimeout(timer); reject(new Error(/denied|erişim|access/i.test(msg) ? `${this.port} başka bir program tarafından kullanılıyor (Arduino IDE seri monitörü açık olabilir)` : msg)); }
            // Açıkken okuma hatası (ör. kablo çekildi): köprüyü kapat → 'exit' yeniden bağlanmayı başlatır
            else { try { proc.kill(); } catch {} }
          }
        }
      });
      proc.on('exit', () => {
        if (this.proc !== proc) return;
        this.proc = null;
        this.stopHeartbeat();
        for (const [, r] of this.pendingReq) r.reject(new Error('Bağlantı kesildi'));
        this.pendingReq.clear();
        if (opened && this.wanted) { this.pushLog('sys', 'Bağlantı kesildi, yeniden bağlanılacak'); this.scheduleReconnect(); }
        else this.setState('disconnected');
      });
    });
  }

  scheduleReconnect() {
    this.setState('reconnecting');
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      if (!this.wanted) return;
      try {
        const ports = await this.listPorts();
        if (!ports.some((p) => p.port === this.port)) return this.scheduleReconnect();
        await this.connect(this.port, this.baud);
      } catch { this.scheduleReconnect(); }
    }, 3000);
  }

  closeBridge() {
    const p = this.proc;
    this.proc = null;
    if (p) { try { p.stdin.write('Q\n'); } catch {} setTimeout(() => { try { p.kill(); } catch {} }, 500); }
  }

  disconnect() {
    this.wanted = false;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.closeBridge();
    this.device = null;
    this.pushLog('sys', 'Bağlantı kapatıldı');
    this.setState('disconnected');
    return this.status();
  }

  writeRaw(text) {
    if (!this.proc) throw new Error('Bağlı değil');
    this.proc.stdin.write('W ' + Buffer.from(text, 'utf8').toString('base64') + '\n');
  }

  /** Protokol isteği gönderir ve aynı id'li yanıtı bekler */
  request(t, payload = {}, timeoutMs = 2500) {
    const id = this.nextId++;
    const line = P.encode({ id, t, ...payload });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingReq.delete(id); reject(new Error(`${t} yanıtı gelmedi (${timeoutMs} ms)`)); }, timeoutMs);
      this.pendingReq.set(id, { resolve: (m) => { clearTimeout(timer); resolve(m); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      try { this.writeRaw(line); this.pushLog('out', redact(line.trim())); } catch (e) { clearTimeout(timer); this.pendingReq.delete(id); reject(e); }
    });
  }

  async handshake() {
    try {
      const hello = await this.request('HELLO', { app: 'orbit' }, 2500);
      this.device = hello;
      this.pushLog('sys', `Orbit firmware: ${hello.fw || '?'} v${hello.ver || '?'} · ${hello.chip || 'çip bilinmiyor'}`);
      this.startHeartbeat();
      this.emit('connected', hello);
    } catch {
      this.device = null;
      this.pushLog('sys', 'Kartta Orbit firmware yanıt vermedi: ham seri konsol modunda bağlı');
    }
    this.emit('status', this.status());
  }

  startHeartbeat() {
    this.stopHeartbeat();
    let missed = 0;
    this.heartbeat = setInterval(async () => {
      try { await this.request('HEARTBEAT', {}, 2000); missed = 0; } catch {
        if (++missed >= 3) { this.pushLog('err', '3 yaşam sinyali yanıtsız kaldı'); this.device = null; this.stopHeartbeat(); this.emit('status', this.status()); }
      }
    }, 5000);
  }
  stopHeartbeat() { clearInterval(this.heartbeat); this.heartbeat = null; }

  onLine(line) {
    const r = P.parseLine(line);
    if (r.kind === 'raw') return this.pushLog('in', r.text);
    if (r.kind === 'invalid') return this.pushLog('err', `${r.error}: ${r.text}`);
    const m = r.msg;
    this.pushLog('in', line);
    if (m.id !== undefined && this.pendingReq.has(m.id)) {
      const req = this.pendingReq.get(m.id);
      this.pendingReq.delete(m.id);
      if (m.t === 'ERROR') req.reject(new Error(m.error || 'Kart hata döndürdü'));
      else req.resolve(m);
      return;
    }
    // Karttan kendiliğinden gelen olaylar (ör. buton): yalnızca olay olarak yayınlanır,
    // ASLA doğrudan komuta dönüştürülmez — izinli eylem eşlemesi automation katmanının işidir.
    if (m.t === 'EVENT') this.emit('device-event', m);
  }

  /** İzin listesindeki bir komutu gönderir */
  async command(cmd, args = {}) {
    if (!ALLOWED_COMMANDS.has(cmd)) throw new Error(`İzin verilmeyen komut: ${cmd}`);
    if (!this.device) throw new Error('Kartta Orbit firmware çalışmıyor');
    if (cmd === 'led' && !(this.device.caps || []).includes('led')) throw new Error('Bu kart dahili LED bildirmiyor');
    const max = cmd === 'result' ? 400 : 120;
    const clean = Object.fromEntries(Object.entries(args).filter(([k, v]) => /^[a-z]{1,16}$/i.test(k) && ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, max) : v]));
    const t0 = Date.now();
    const res = await this.request('COMMAND', { cmd, ...clean }, 3000);
    return { ...res, rttMs: Date.now() - t0 };
  }

  /** Orbit'in anlık durumunu karta gönderir (ikiz). Yanıt beklenmez, günlüğe yazılmaz (3 sn'de bir). */
  sendState(state) {
    // Eski firmware (0.1) STATE türünü tanımaz: yalnızca "state" yeteneği bildiren karta gönder
    if (!this.proc || !this.device || !(this.device.caps || []).includes('state')) return false;
    this.writeRaw(P.encode({ t: 'STATE', ...state }));
    return true;
  }

  async readStatus() {
    if (!this.device) throw new Error('Kartta Orbit firmware çalışmıyor');
    return this.request('STATUS');
  }
}

/**
 * esptool çıktısını ayrıştırır (esptool v4/v5, `flash-id` / `chip-id`).
 * Dönüş: { chip, revision, features, crystal, mac, flashSize } — bulunamayan alanlar null
 */
function parseEsptool(text) {
  const get = (re) => (String(text).match(re) || [])[1]?.trim() || null;
  const chipLine = get(/Chip (?:type|is):\s*(.+)/i);
  const m = chipLine && chipLine.match(/^(.*?)\s*\(revision (v?[\d.]+)\)/i);
  return {
    chip: m ? m[1] : chipLine,
    revision: m ? m[2] : null,
    family: get(/Detecting chip type\.*\s*(ESP\S+)/i) || get(/Connected to (ESP\S+)/i),
    features: get(/Features:\s*(.+)/i),
    crystal: get(/Crystal (?:frequency|is):\s*(\S+)/i),
    mac: get(/MAC:\s*([0-9a-f:]{17})/i),
    flashSize: get(/Detected flash size:\s*(\S+)/i),
  };
}

/**
 * Çipi esptool ile SALT OKUNUR tanımlar (`flash-id`): kart kısa süre önyükleme moduna alınıp
 * yeniden başlatılır; flash belleğe yazılmaz. esptool kurulu değilse anlaşılır hata verir.
 */
function identifyWithEsptool(port) {
  if (!/^COM\d+$/i.test(port)) return Promise.reject(new Error('Geçersiz port'));
  return new Promise((resolve, reject) => {
    const p = spawn('py', ['-3', '-m', 'esptool', '--port', port.toUpperCase(), 'flash-id'], { windowsHide: true });
    let out = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} reject(new Error('esptool zaman aşımı (kart önyükleme moduna girmedi; BOOT tuşuna basılı tutarak tekrar dene)')); }, 60000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', () => { clearTimeout(t); reject(new Error('Python bulunamadı (py)')); });
    p.on('close', (code) => {
      clearTimeout(t);
      if (/No module named esptool/i.test(out)) return reject(new Error('esptool kurulu değil: py -3 -m pip install --user esptool'));
      if (code !== 0) return reject(new Error((out.split(/\r?\n/).filter((l) => /error|fatal|could not/i.test(l))[0] || `esptool başarısız (kod ${code})`).trim()));
      const info = parseEsptool(out);
      if (!info.chip) return reject(new Error('esptool çıktısında çip bilgisi bulunamadı'));
      resolve({ ...info, port: port.toUpperCase(), at: Date.now() });
    });
  });
}

/**
 * Otomatik bağlanılacak portu seçer. Son kullanılan port takılıysa o; hiç bağlanılmamışsa
 * yalnızca TEK bir bilinen ESP32 USB köprüsü (CH340, CP210x…) takılıysa o. Belirsizse null.
 */
function pickAutoPort(ports, lastPort) {
  if (lastPort) return ports.some((p) => p.port === lastPort) ? lastPort : null;
  const esp = ports.filter((p) => p.likelyEsp);
  return esp.length === 1 ? esp[0].port : null;
}

module.exports = { Esp32Hub, pickAutoPort, BRIDGES, ALLOWED_COMMANDS, SECRET_KEYS, redact, BRIDGE_PS, parseEsptool, identifyWithEsptool };
