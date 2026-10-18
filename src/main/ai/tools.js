// Asistanın kullanabileceği araçlar. Yeni yetenek eklemek için register() ile buraya araç ekleyin.
// Her araç: { name, description, input_schema, run(input, ctx) -> string | object }
const system = require('../services/system');
const catalog = require('../services/catalog');
const drivers = require('../services/drivers');

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
