// Basit kalıcı JSON deposu (userData/orbit.json)
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  selection: [],            // seçili katalog anahtarları (varsayılan kurulum profili)
  customApps: [],           // kullanıcının eklediği programlar
  settings: {
    theme: 'light',
    aiProvider: 'anthropic', // 'anthropic' | 'ollama'
    model: 'claude-opus-5-5',
    ollamaModel: 'llama3.2',
    ollamaUrl: 'http://localhost:11434',
    includeWindowsUpdateDrivers: true,
    includeVendorTools: true,
    userName: '',
    minimizeToTray: true,
    startWithWindows: false,
  },
  rgbProfiles: [],          // kullanıcının RGB profilleri
  rgbActive: null,          // son uygulanan RGB görünümü (açılışta geri yüklenir)
  apiKeyEnc: null,
  history: [],              // kurulum geçmişi
};

let file, data;

function load() {
  file = path.join(app.getPath('userData'), 'orbit.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  } catch {
    data = structuredClone(DEFAULTS);
  }
  return data;
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const get = (k) => (data ?? load())[k];
function set(k, v) { (data ?? load())[k] = v; save(); return v; }

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
  if (kind === 'enc:') return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  return Buffer.from(b64, 'base64').toString('utf8');
}

module.exports = { load, get, set, setApiKey, getApiKey };
