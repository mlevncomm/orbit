// Orbit hafızası: kullanıcıyı tanır ve sürekli öğrenir.
//
// - Yalnızca bu bilgisayarda, userData/memory.json içinde Windows hesabıyla şifreli (safeStorage/DPAPI) saklanır.
// - Kaynaklar: elle eklenen notlar, Orbit kullanımı (kurulumlar, ışık tercihleri, donanım, ayarlar),
//   asistan sohbetleri (Claude ile bilgi çıkarma) ve Growth OS özetleri. Her kaynak ayrı açılıp kapatılabilir.
// - Hassas bilgi (API anahtarı, şifre, kart / IBAN numarası, özel anahtar) hafızaya HİÇ yazılmaz.
// - Asistan her yanıttan önce mesajla en ilgili bilgileri sistem istemine alır.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');
const log = require('./log');

const FILE = () => path.join(app.getPath('userData'), 'memory.json');
const MAX_ITEMS = 600;
const CATS = { kimlik: 'Kimlik', is: 'İş & Projeler', tercih: 'Tercihler', bilgisayar: 'Bilgisayar', aliskanlik: 'Alışkanlıklar', not: 'Notlar' };
const SOURCES = { elle: 'Elle', kullanim: 'Orbit kullanımı', sohbet: 'Sohbet', growth: 'Growth OS' };

// Hafızaya asla girmemesi gerekenler
const SENSITIVE = [
  /sk-ant-[\w-]{10,}/i, /\bsk-[A-Za-z0-9]{20,}/, /\bAIza[0-9A-Za-z_-]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bTR\d{2}[ ]?(\d{4}[ ]?){5}\d{2}\b/i, /\b(?:\d[ -]?){13,19}\b/,
  /(şifre|parola|password|passwd|pin kodu|api[_ -]?key|secret|token)\s*[:=]\s*\S+/i,
  // "şifrem 12345", "parolası abc123", "pinim 4321" gibi iki nokta olmadan yazılanlar
  /(?<![a-zçğıöşü])(şifre\S*|parola\S*|password|passwd|pin(?:im|i|in)?|api[_ -]?key|secret|token)\s+(?:(?:şu|is|olarak)\s+)?\S*\d\S*/i,
];
const isSensitive = (t) => SENSITIVE.some((re) => re.test(t));

let data = null;
let saveTimer = null;

function blank() {
  return { v: 1, items: [], sources: { elle: true, kullanim: true, sohbet: true, growth: true }, counters: { presets: {}, installs: [] }, lastLearn: 0 };
}

function load() {
  if (data) return data;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    const json = raw.enc ? safeStorage.decryptString(Buffer.from(raw.enc, 'base64')) : JSON.stringify(raw.plain || {});
    data = { ...blank(), ...JSON.parse(json) };
    data.sources = { ...blank().sources, ...(data.sources || {}) };
    data.counters = { ...blank().counters, ...(data.counters || {}) };
  } catch (e) {
    if (e.code !== 'ENOENT') log.warn('Hafıza okunamadı, boş başlatılıyor', e);
    data = blank();
  }
  return data;
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!data) return;
  const json = JSON.stringify(data);
  const body = safeStorage.isEncryptionAvailable()
    ? { enc: safeStorage.encryptString(json).toString('base64') }
    : { plain: data };
  const tmp = FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(body));
  fs.renameSync(tmp, FILE());
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { saveNow(); } catch (e) { log.warn('Hafıza kaydedilemedi', e); } }, 400); }

const norm = (t) => String(t).toLocaleLowerCase('tr').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => new Set(norm(t).split(' ').filter((w) => w.length > 2));

/**
 * Bilgi ekler / günceller. key verilirse aynı anahtarlı bilgi güncellenir (ör. "fav-light").
 * Dönüş: eklenen/güncellenen kayıt ya da null (hassas, boş, kaynak kapalı).
 */
function remember(text, { cat = 'not', source = 'elle', key = null, pinned = false } = {}) {
  const d = load();
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (text.length < 3) return null;
  if (!d.sources[source] && source !== 'elle') return null;
  if (isSensitive(text)) { log.info('Hafıza: hassas bilgi içerdiği için kaydedilmedi'); return null; }
  if (!CATS[cat]) cat = 'not';
  const now = Date.now();
  let item = key ? d.items.find((x) => x.key === key) : null;
  if (!item) item = d.items.find((x) => norm(x.text) === norm(text));
  if (item) {
    if (item.text !== text) { item.text = text; item.updatedAt = now; }
    item.cat = cat; if (pinned) item.pinned = true;
  } else {
    item = { id: crypto.randomUUID(), key, text, cat, source, pinned, createdAt: now, updatedAt: now, hits: 0 };
    d.items.unshift(item);
    if (d.items.length > MAX_ITEMS) {
      // en eski, sabitlenmemiş, az kullanılan kayıtlar düşer
      const drop = d.items.filter((x) => !x.pinned).sort((a, b) => a.hits - b.hits || a.updatedAt - b.updatedAt)[0];
      d.items = d.items.filter((x) => x !== drop);
    }
  }
  save();
  return item;
}

function list() { return load().items; }
function update(id, patch) {
  const item = load().items.find((x) => x.id === id);
  if (!item) throw new Error('Kayıt bulunamadı');
  if (typeof patch.text === 'string') {
    const t = patch.text.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (t.length < 3) throw new Error('Bilgi çok kısa');
    if (isSensitive(t)) throw new Error('Bu metin hassas bilgi (anahtar, şifre, kart numarası) içeriyor; hafızaya yazılmaz.');
    item.text = t;
  }
  if (typeof patch.pinned === 'boolean') item.pinned = patch.pinned;
  if (patch.cat && CATS[patch.cat]) item.cat = patch.cat;
  item.updatedAt = Date.now();
  save();
  return item;
}
function remove(id) { const d = load(); d.items = d.items.filter((x) => x.id !== id); save(); return true; }
function clear(source = null) { const d = load(); d.items = source ? d.items.filter((x) => x.source !== source) : []; if (!source) d.counters = blank().counters; save(); return true; }
function setSources(patch) { const d = load(); for (const k of Object.keys(SOURCES)) if (typeof patch[k] === 'boolean') d.sources[k] = patch[k]; save(); return d.sources; }
function state() { const d = load(); return { items: d.items, sources: d.sources, cats: CATS, sourceNames: SOURCES, encrypted: safeStorage.isEncryptionAvailable(), lastLearn: d.lastLearn }; }

/** Mesajla en ilgili bilgiler: sabitlenenler + kelime örtüşmesi + yenilik */
function relevant(query, limit = 30) {
  const d = load();
  const q = words(query || '');
  const now = Date.now();
  const scored = d.items.map((x) => {
    const w = words(x.text);
    let overlap = 0; for (const t of q) if (w.has(t)) overlap++;
    const ageDays = (now - x.updatedAt) / 86400000;
    const base = { kimlik: 6, is: 4, tercih: 3, bilgisayar: 2, aliskanlik: 2, not: 3 }[x.cat] || 1;
    return { x, s: (x.pinned ? 100 : 0) + overlap * 12 + base + Math.max(0, 5 - ageDays / 7) };
  });
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((r) => r.x);
}

/** Asistanın sistem istemine eklenecek blok */
function promptBlock(query) {
  const items = relevant(query, 30);
  if (!items.length) return '';
  for (const x of items) x.hits = (x.hits || 0) + 1;
  save();
  return 'Kullanıcı hakkında bildiklerin (Orbit hafızası; doğal biçimde kullan, listeyi okuma):\n'
    + items.map((x) => `- [${CATS[x.cat] || x.cat}] ${x.text}`).join('\n');
}

// ---------- Orbit kullanımından öğrenme (kurallı, yapay zekâ gerekmez) ----------
const day = () => new Date().toLocaleDateString('tr-TR');

function noteSystem(sys) {
  if (!sys) return;
  const gpu = (sys.gpus || []).find((g) => !/basic|microsoft/i.test(g.name)) || sys.gpus?.[0];
  remember(`Bilgisayarı: ${sys.cpu?.name}, ${gpu?.name || '?'}, ${sys.board?.vendor || ''} ${sys.board?.product || ''}, ${sys.ramGB} GB RAM, ${sys.os?.name || 'Windows'}`.replace(/\s+/g, ' '),
    { cat: 'bilgisayar', source: 'kullanim', key: 'pc' });
}
function noteInstall(name) {
  const d = load();
  if (!d.sources.kullanim || !name) return;
  d.counters.installs = [name, ...d.counters.installs.filter((x) => x !== name)].slice(0, 40);
  remember(`Orbit ile kurduğu programlar (en yeni önce): ${d.counters.installs.join(', ')}`, { cat: 'aliskanlik', source: 'kullanim', key: 'installs' });
}
function notePreset(name) {
  const d = load();
  if (!d.sources.kullanim || !name) return;
  d.counters.presets[name] = (d.counters.presets[name] || 0) + 1;
  const top = Object.entries(d.counters.presets).sort((a, b) => b[1] - a[1]).slice(0, 3);
  remember(`En çok kullandığı ışık görünümleri: ${top.map(([n, c]) => `${n} (${c} kez)`).join(', ')}`, { cat: 'tercih', source: 'kullanim', key: 'fav-light' });
}
function noteSettings(s) {
  if (!s) return;
  if (s.userName) remember(`Adı ${s.userName}.`, { cat: 'kimlik', source: 'kullanim', key: 'name' });
  if (s.theme) remember(`Orbit'i ${s.theme === 'dark' ? 'koyu' : 'açık'} temada kullanıyor.`, { cat: 'tercih', source: 'kullanim', key: 'theme' });
}
function noteEsp32(st) {
  if (!st?.port || st.state !== 'connected') return;
  const fw = st.device ? ` (firmware ${st.device.fw || '?'} v${st.device.ver || '?'})` : '';
  remember(`ESP32 kartı var, Orbit ile ${st.port} portundan bağlanıyor${fw}.`, { cat: 'bilgisayar', source: 'kullanim', key: 'esp32' });
}
function noteGrowth(summary) {
  if (!summary?.tenantName) return;
  remember(`Growth OS (${summary.tenantName}): ${summary.leads ?? '?'} müşteri adayı, ${summary.pending ?? 0} onay bekleyen WhatsApp taslağı, bugün ${summary.sentToday ?? 0} mesaj gönderildi (${day()}).`,
    { cat: 'is', source: 'growth', key: 'growth:' + summary.tenantName });
}

// ---------- Sohbetten öğrenme (Claude) ----------
const EXTRACT = `Sen bir hafıza çıkarıcısın. Kullanıcı ile Orbit asistanı arasındaki son konuşmayı oku ve KULLANICI hakkında
kalıcı ve ileride işe yarayacak bilgileri çıkar: kimliği, işi ve projeleri (ör. wexon.dev), müşterileri, hedefleri,
tercihleri, çalışma alışkanlıkları, kullandığı araçlar. Geçici şeyleri (bugünkü hava, tek seferlik soru), asistanın
kendi söylediklerini ve HASSAS bilgileri (şifre, API anahtarı, kart/IBAN, kimlik numarası, sağlık) ASLA yazma.
Var olan bir bilgiyi güncelliyorsan "replaces" alanına o bilginin tam metnini yaz.
Yalnızca JSON döndür: {"facts":[{"text":"kısa Türkçe cümle","cat":"kimlik|is|tercih|bilgisayar|aliskanlik|not","replaces":"(isteğe bağlı)"}]}
Yeni bilgi yoksa {"facts":[]} döndür.`;

async function learnFromChat(history, { apiKey }) {
  const d = load();
  if (!d.sources.sohbet || !apiKey) return { learned: 0, skipped: !apiKey ? 'anahtar yok' : 'kapalı' };
  const recent = history.filter((m) => typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-8);
  if (!recent.some((m) => m.role === 'user')) return { learned: 0 };
  const known = relevant(recent.filter((m) => m.role === 'user').map((m) => m.content).join(' '), 40).map((x) => '- ' + x.text).join('\n');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 1200,
    system: EXTRACT,
    messages: [{ role: 'user', content: `Bilinenler:\n${known || '(yok)'}\n\nKonuşma:\n${recent.map((m) => `${m.role === 'user' ? 'KULLANICI' : 'ASİSTAN'}: ${m.content.slice(0, 2000)}`).join('\n')}` }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let facts = [];
  try { facts = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).facts || []; } catch { return { learned: 0 }; }
  let n = 0;
  for (const f of facts.slice(0, 8)) {
    if (f.replaces) { const old = d.items.find((x) => norm(x.text) === norm(f.replaces)); if (old && !old.pinned) d.items = d.items.filter((x) => x !== old); }
    if (remember(f.text, { cat: f.cat, source: 'sohbet' })) n++;
  }
  d.lastLearn = Date.now();
  save();
  if (n) log.info(`Hafıza: sohbetten ${n} bilgi öğrenildi`);
  return { learned: n };
}

function flush() { if (saveTimer) saveNow(); }

module.exports = {
  remember, list, update, remove, clear, setSources, state, relevant, promptBlock, isSensitive,
  noteSystem, noteInstall, notePreset, noteSettings, noteEsp32, noteGrowth, learnFromChat, flush, CATS, SOURCES,
  _reset: () => { data = null; },
};
