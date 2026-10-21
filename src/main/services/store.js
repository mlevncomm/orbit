// Kalıcı ayar deposu (userData/orbit.json)
// - Atomik yazma: önce .tmp dosyasına yazılır, sonra yerine taşınır; bozulursa .bak'tan geri yüklenir
// - Yazmalar birleştirilir (debounce) ve uygulama kapanırken flush() ile diske garanti yazılır
// - Şema sürümü ile eski kayıtlar yeni varsayılanlara taşınır
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const SCHEMA = 2;

const DEFAULTS = {
  schema: SCHEMA,
  selection: [],            // seçili katalog anahtarları (varsayılan kurulum profili)
  customApps: [],           // kullanıcının eklediği programlar
  settings: {
    theme: 'light',
    aiProvider: 'anthropic', // 'anthropic' | 'ollama'
    model: 'claude-opus-5-5',
    ollamaModel: 'llama3.2',
    ollamaUrl: 'http://localhost:11434',
    userName: '',
    minimizeToTray: true,
    startWithWindows: true,  // RGB görünümünün açılışta geri gelmesi için varsayılan açık
    remoteControl: false,    // orbit.wexon.dev'den uzaktan yönetim: yalnızca kullanıcı açarsa
    rgbEngine: 'hardware',   // 'hardware' (cihazın kendi efekti) | 'sync' (yazılım senkron)
    esp32LedAuto: true,      // ESP32 LED'i bilgisayarın durumunu yansıtsın
    esp32AutoConnect: true,  // açılışta / kart takılınca son porta kendiliğinden bağlan
    esp32LastPort: null,
    esp32Buttons: {          // BOOT tuşu → izinli eylem
      short: { action: 'lights.power', arg: 'toggle' },
      long: { action: 'lights.next', arg: '' },
    },
    esp32Token: null,
    bridgeEnabled: false,    // Claude / MCP yerel köprüsü        // Wi-Fi paneli gizli anahtarı (Wi-Fi şifresi Orbit'te SAKLANMAZ)
  },
  ui: {                     // arayüz durumu (sayfa, filtreler, Panel seçenekleri…)
    page: 'dashboard',
    cat: 'all',
    dashTab: 'summary',
    opts: { vendor: true, wu: true, apps: true, reboot: false },
    lightsDraft: null,
  },
  window: null,             // pencere boyutu / konumu
  chat: [],                 // asistan sohbet geçmişi
  rgbProfiles: [],          // kullanıcının RGB profilleri
  rgbState: { global: null, devices: {} }, // son uygulanan RGB görünümü (açılışta geri yüklenir)
  apiKeyEnc: null,
  history: [],              // kurulum geçmişi
};

let file, data, timer = null;

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function migrate(raw) {
  const out = {
    ...structuredClone(DEFAULTS),
    ...raw,
    settings: { ...DEFAULTS.settings, ...(raw.settings || {}) },
    ui: { ...DEFAULTS.ui, ...(raw.ui || {}), opts: { ...DEFAULTS.ui.opts, ...(raw.ui?.opts || {}) } },
  };
  if ((raw.schema || 1) < 2) {
    // 1.0.0: başlangıçta çalışma kapalıydı ve RGB durumu tek alan olarak tutuluyordu
    out.settings.startWithWindows = true;
    if (raw.rgbActive) out.rgbState = { global: raw.rgbActive, devices: {} };
    delete out.rgbActive;
    delete out.settings.includeWindowsUpdateDrivers;
    delete out.settings.includeVendorTools;
  }
  out.schema = SCHEMA;
  return out;
}

function load() {
  file = path.join(app.getPath('userData'), 'orbit.json');
  const raw = readJson(file) || readJson(file + '.bak');
  data = migrate(raw || {});
  if (!raw || raw.schema !== SCHEMA) writeNow();
  return data;
}

function writeNow() {
  if (!data) return;
  clearTimeout(timer); timer = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const json = JSON.stringify(data, null, 2);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json);
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
    fs.renameSync(tmp, file);
  } catch (e) {
    require('./log').error('Ayarlar yazılamadı', e);
  }
}

function save() {
  clearTimeout(timer);
  timer = setTimeout(writeNow, 120);
}

const flush = () => writeNow();
const get = (k) => (data ?? load())[k];
function set(k, v) { (data ?? load())[k] = v; save(); return v; }
/** Nesne alanını birleştirerek günceller (ör. patch('settings', { theme: 'dark' })) */
function patch(k, obj) { return set(k, { ...(get(k) || {}), ...obj }); }

function setApiKey(key) {
  if (!key) return set('apiKeyEnc', null);
  const enc = safeStorage.isEncryptionAvailable()
    ? 'enc:' + safeStorage.encryptString(key).toString('base64')
    : 'raw:' + Buffer.from(key).toString('base64');
  set('apiKeyEnc', enc);
}

function getApiKey() {
  const v = get('apiKeyEnc');
  if (!v) return process.env.ANTHROPIC_API_KEY || null;
  const [kind, b64] = [v.slice(0, 4), v.slice(4)];
  try {
    if (kind === 'enc:') return safeStorage.decryptString(Buffer.from(b64, 'base64'));
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch { return null; }
}

module.exports = { load, get, set, patch, flush, setApiKey, getApiKey, DEFAULTS };
