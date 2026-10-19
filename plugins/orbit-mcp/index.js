#!/usr/bin/env node
// Orbit MCP eklentisi: Claude'un (Claude Code / Claude Desktop) Orbit'i yerel köprü üzerinden
// okuyup test etmesini ve izinli eylemleri çalıştırmasını sağlar. Bağımlılık yok (Node 18+).
//
// Köprü bilgisi Orbit'in yazdığı dosyadan okunur:
//   ORBIT_BRIDGE_FILE  ya da  %APPDATA%\Orbit\bridge.json  (yoksa %APPDATA%\Orbit Dev\bridge.json)
// Orbit'te Ayarlar → "Claude bağlantısı" açık olmalıdır.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SERVER = { name: 'orbit', version: '0.1.0' };
const PROTOCOL = '2025-06-18';

function bridgeInfo() {
  const candidates = [
    process.env.ORBIT_BRIDGE_FILE,
    process.env.APPDATA && path.join(process.env.APPDATA, 'Orbit', 'bridge.json'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'Orbit Dev', 'bridge.json'),
  ].filter(Boolean);
  for (const f of candidates) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  }
  throw new Error("Orbit köprüsü bulunamadı. Orbit açık mı ve Ayarlar → 'Claude bağlantısı' etkin mi?");
}

async function call(method, route, body) {
  const b = bridgeInfo();
  const res = await fetch(b.url + route, {
    method,
    headers: { Authorization: `Bearer ${b.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if ((res.headers.get('content-type') || '').startsWith('image/')) return { image: Buffer.from(await res.arrayBuffer()).toString('base64') };
  const data = await res.json();
  if (res.status >= 400 && res.status !== 409) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const PAGES = ['dashboard', 'drivers', 'apps', 'lights', 'esp32', 'assistant', 'settings'];
const TOOLS = [
  { name: 'orbit_status', description: 'Orbit genel durumu: sürüm, açık sayfa, kurulum kuyruğu, RGB, ESP32 ve ikiz durum (CPU/RAM).', inputSchema: { type: 'object', properties: {} }, run: () => call('GET', '/status') },
  { name: 'orbit_programs', description: 'Katalogdaki programlar: kurulu mu, sürüm, mevcut güncelleme; kurulum profilleri.', inputSchema: { type: 'object', properties: {} }, run: () => call('GET', '/programs') },
  { name: 'orbit_inventory', description: 'Bu bilgisayardaki tüm kurulu programlar ve bekleyen güncellemeler.', inputSchema: { type: 'object', properties: { refresh: { type: 'boolean', description: 'Önbelleği yok say ve yeniden tara' } } }, run: (a) => call('GET', '/inventory' + (a.refresh ? '?refresh=1' : '')) },
  { name: 'orbit_drivers', description: 'Kurulu donanım sürücüleri (sağlayıcı, sürüm, tarih, donanım kimliği).', inputSchema: { type: 'object', properties: { refresh: { type: 'boolean' } } }, run: (a) => call('GET', '/drivers' + (a.refresh ? '?refresh=1' : '')) },
  { name: 'orbit_rgb', description: 'RGB cihazları, uygulanmış modlar, hazır görünümler ve profiller.', inputSchema: { type: 'object', properties: {} }, run: () => call('GET', '/rgb') },
  { name: 'orbit_esp32', description: 'ESP32 bağlantısı, firmware, Wi-Fi durumu ve karttan gelen son işlemler.', inputSchema: { type: 'object', properties: {} }, run: () => call('GET', '/esp32') },
  { name: 'orbit_actions', description: 'Çalıştırılabilen izinli eylemler ve güvenlik seviyeleri (confirm = bilgisayarda kullanıcı onayı ister).', inputSchema: { type: 'object', properties: {} }, run: () => call('GET', '/actions') },
  {
    name: 'orbit_run_action', description: "İzinli bir Orbit eylemini çalıştırır (ör. lights.next, settings.theme). 'confirm' seviyesindekiler kullanıcının ekranında onay bekler.",
    inputSchema: { type: 'object', properties: { action: { type: 'string' }, arg: { type: 'string' } }, required: ['action'] },
    run: (a) => call('POST', '/actions', { action: a.action, arg: a.arg || '' }),
  },
  {
    name: 'orbit_navigate', description: 'Orbit penceresinde bir sayfayı açar.',
    inputSchema: { type: 'object', properties: { page: { type: 'string', enum: PAGES } }, required: ['page'] },
    run: (a) => call('POST', '/ui/navigate', { page: a.page }),
  },
  {
    name: 'orbit_screenshot', description: 'Orbit penceresinin ekran görüntüsü (isteğe bağlı olarak önce bir sayfa açar).',
    inputSchema: { type: 'object', properties: { page: { type: 'string', enum: PAGES }, waitMs: { type: 'number', description: 'Sayfa açıldıktan sonra bekleme (varsayılan 1500)' } } },
    run: async (a) => {
      if (a.page) { await call('POST', '/ui/navigate', { page: a.page }); await new Promise((r) => setTimeout(r, Math.min(15000, a.waitMs ?? 1500))); }
      return call('GET', '/ui/screenshot');
    },
  },
  { name: 'orbit_logs', description: 'Orbit günlüğünün son satırları (hatalar, kurulumlar, ESP32 olayları).', inputSchema: { type: 'object', properties: { n: { type: 'number' } } }, run: (a) => call('GET', `/logs?n=${a.n || 80}`) },
];

function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function fail(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }

async function onMessage(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return reply(id, { protocolVersion: params?.protocolVersion || PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER });
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return;
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return fail(id, -32602, `Bilinmeyen araç: ${params?.name}`);
    try {
      const out = await tool.run(params.arguments || {});
      if (out?.image) return reply(id, { content: [{ type: 'image', data: out.image, mimeType: 'image/png' }] });
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], isError: out?.ok === false });
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: `Hata: ${e.message}` }], isError: true });
    }
  }
  if (id !== undefined) fail(id, -32601, `Desteklenmeyen yöntem: ${method}`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'Geçersiz JSON'); }
  onMessage(msg).catch((e) => fail(msg.id ?? null, -32603, e.message));
});

module.exports = { TOOLS, onMessage };
