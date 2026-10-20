// Asistanın kullanabileceği araçlar. Yeni yetenek eklemek için register() ile buraya araç ekleyin.
// Her araç: { name, description, input_schema, run(input, ctx) -> string | object }
const system = require('../services/system');
const catalog = require('../services/catalog');
const drivers = require('../services/drivers');
const memory = require('../services/memory');

const registry = new Map();
const register = (tool) => registry.set(tool.name, tool);

register({
  name: 'get_system_info',
  description: 'Bilgisayarın donanım bilgisini döndürür: işlemci, ekran kartı ve sürücü sürümü, anakart, BIOS, RAM, disk, Windows sürümü ve sürücüsü eksik/hatalı cihazlar.',
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
  run: () => system.getSystemInfo(),
});

register({
  name: 'list_catalog',
  description: 'Kurulabilir programların listesini (anahtar, ad, kategori) döndürür. Kurulum önermeden önce doğru anahtarları bulmak için kullan.',
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
  run: () => catalog.getCatalog().apps.map((a) => ({ key: a.key, name: a.name, category: a.category })),
});

register({
  name: 'propose_install',
  description: 'Kullanıcıya kurulum önerisi kartı gösterir. Kurulum kullanıcı arayüzde "Kur" butonuna bastığında başlar; sen doğrudan kurulum yapamazsın. Anahtarları list_catalog ile al.',
  input_schema: {
    type: 'object',
    properties: {
      keys: { type: 'array', items: { type: 'string' }, description: 'Katalog anahtarları' },
      reason: { type: 'string', description: 'Kullanıcıya gösterilecek kısa gerekçe' },
    },
    required: ['keys', 'reason'],
    additionalProperties: false,
  },
  run: (input, ctx) => {
    const apps = catalog.findByKeys(input.keys || []);
    if (!apps.length) return { error: 'Geçerli anahtar yok. Önce list_catalog çağır.' };
    ctx.emit('ai:proposal', { reason: input.reason, apps: apps.map((a) => ({ key: a.key, name: a.name, color: a.color })) });
    return { shown: apps.map((a) => a.name), note: 'Öneri kartı kullanıcıya gösterildi; onayı bekleniyor.' };
  },
});

register({
  name: 'scan_driver_updates',
  description: 'Windows Update üzerinden bu bilgisayar için bekleyen sürücü güncellemelerini tarar (1-3 dakika sürebilir).',
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
  run: () => drivers.scanWindowsUpdate(),
});

register({
  name: 'remember',
  description: 'Kullanıcı hakkında kalıcı bir bilgiyi Orbit hafızasına kaydeder (kim olduğu, işi, projeleri, tercihleri, hedefleri). Kullanıcı "bunu hatırla" dediğinde ya da önemli kalıcı bir bilgi paylaştığında kullan. Hassas bilgi (şifre, anahtar, kart) kaydedilmez.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Kısa, tek başına anlaşılır Türkçe cümle' },
      category: { type: 'string', enum: ['kimlik', 'is', 'tercih', 'bilgisayar', 'aliskanlik', 'not'] },
    },
    required: ['text', 'category'],
    additionalProperties: false,
  },
  run: (input, ctx) => {
    const item = memory.remember(input.text, { cat: input.category, source: 'sohbet' });
    if (!item) return { saved: false, note: 'Kaydedilmedi (hassas bilgi içeriyor ya da sohbetten öğrenme kapalı).' };
    ctx.emit('memory:changed', memory.state());
    return { saved: true, text: item.text };
  },
});

register({
  name: 'search_memory',
  description: 'Orbit hafızasında kullanıcı hakkında kayıtlı bilgileri arar. Kullanıcı geçmişte ne söylediğini ya da kendisi hakkında ne bildiğini sorarsa kullan.',
  input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  run: (input) => memory.relevant(input.query, 15).map((x) => ({ text: x.text, category: x.cat, source: x.source, updated: new Date(x.updatedAt).toLocaleDateString('tr-TR') })),
});

function list() { return [...registry.values()]; }

function definitions() {
  return list().map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

async function execute(name, input, ctx) {
  const tool = registry.get(name);
  if (!tool) return { content: `Bilinmeyen araç: ${name}`, isError: true };
  try {
    const out = await tool.run(input || {}, ctx);
    return { content: typeof out === 'string' ? out : JSON.stringify(out), isError: false };
  } catch (e) {
    return { content: `Hata: ${e.message}`, isError: true };
  }
}

module.exports = { register, list, definitions, execute };
