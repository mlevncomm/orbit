const { userData } = require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { Bridge } = require('../../src/main/bridge');

const ran = [];
const bridge = new Bridge({
  userData, version: 'test', log: { info() {}, warn() {} }, logDir: () => userData,
  automation: {
    catalog: () => [{ id: 'lights.next', level: 'safe', label: 'Sonraki' }],
    run: async (action, arg, opts) => { ran.push([action, arg, opts.source]); return action === 'lights.next' ? { ok: true, message: 'Işıklar: Aurora' } : { ok: false, message: 'İzin verilmeyen eylem: ' + action }; },
    snapshot: async () => ({ cpu: 3 }), history: [], wifi: null,
  },
  inventory: { summary: () => ({ programs: 5, upgrades: 1 }), get: async () => ({ programs: [], upgrades: [], scannedAt: 1 }) },
  drivers: { installedDrivers: async () => [] },
  rgb: { status: () => ({ connected: true, devices: [] }) },
  hub: { status: () => ({ state: 'connected' }), port: 'COM3', device: { fw: 'orbit-companion', ver: '0.2.0' } },
  installer: { running: false, list: () => [] },
  store: { get: () => ({}) },
  catalog: { getCatalog: () => ({ apps: [], profiles: [] }) },
  uiState: async () => ({ page: 'dashboard', errors: 0 }),
  navigate: async (p) => { if (p !== 'apps') throw new Error('Bilinmeyen sayfa'); },
  screenshot: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
});

function req(method, route, { token, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: bridge.port, path: route, method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: d }));
    });
    r.on('error', reject);
    if (body) r.end(JSON.stringify(body)); else r.end();
  });
}

test.before(async () => { await bridge.start(0); });
test.after(async () => { await bridge.stop(); });

test('anahtar dosyası yazılır, yalnızca 127.0.0.1 dinlenir', () => {
  const info = JSON.parse(fs.readFileSync(path.join(userData, 'bridge.json'), 'utf8'));
  assert.equal(info.token.length, 48);
  assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(bridge.server.address().address, '127.0.0.1');
});

test('anahtarsız / yanlış anahtar / tarayıcı / yanlış Host reddedilir', async () => {
  assert.equal((await req('GET', '/status')).status, 401);
  assert.equal((await req('GET', '/status', { token: 'x'.repeat(48) })).status, 401);
  assert.equal((await req('GET', '/status', { token: bridge.token, headers: { Origin: 'https://kotu.site' } })).status, 403);
  assert.equal((await req('GET', '/status', { token: bridge.token, headers: { Host: 'evil.example:80' } })).status, 403);
});

test('doğru anahtarla durum, eylem, sayfa ve ekran görüntüsü', async () => {
  const st = JSON.parse((await req('GET', '/status', { token: bridge.token })).body);
  assert.equal(st.esp32.firmware, 'orbit-companion 0.2.0');
  const ok = await req('POST', '/actions', { token: bridge.token, body: { action: 'lights.next' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ran.at(-1), ['lights.next', '', 'claude']);
  const bad = await req('POST', '/actions', { token: bridge.token, body: { action: 'system.shell', arg: 'del' } });
  assert.equal(bad.status, 409);
  assert.equal((await req('POST', '/ui/navigate', { token: bridge.token, body: { page: 'apps' } })).status, 200);
  assert.equal((await req('POST', '/ui/navigate', { token: bridge.token, body: { page: '../x' } })).status, 500);
  const shot = await req('GET', '/ui/screenshot', { token: bridge.token });
  assert.equal(shot.type, 'image/png');
});

test('MCP eklentisi: initialize → tools/list → tools/call (gerçek stdio protokolü)', async () => {
  const p = spawn(process.execPath, [path.join(__dirname, '..', '..', 'plugins', 'orbit-mcp', 'index.js')], { env: { ...process.env, ORBIT_BRIDGE_FILE: path.join(userData, 'bridge.json') } });
  const replies = new Map();
  let buf = '';
  p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); replies.set(m.id, m); } });
  const send = (m) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  const wait = (id) => new Promise((resolve) => { const t = setInterval(() => { if (replies.has(id)) { clearInterval(t); resolve(replies.get(id)); } }, 10); });
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  assert.equal((await wait(1)).result.serverInfo.name, 'orbit');
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  const names = (await wait(2)).result.tools.map((t) => t.name);
  for (const n of ['orbit_status', 'orbit_run_action', 'orbit_screenshot', 'orbit_esp32']) assert.ok(names.includes(n), n);
  send({ id: 3, method: 'tools/call', params: { name: 'orbit_status', arguments: {} } });
  assert.match((await wait(3)).result.content[0].text, /orbit-companion 0\.2\.0/);
  send({ id: 4, method: 'tools/call', params: { name: 'orbit_run_action', arguments: { action: 'system.shell' } } });
  const r4 = await wait(4);
  assert.equal(r4.result.isError, true);
  send({ id: 5, method: 'tools/call', params: { name: 'orbit_screenshot', arguments: {} } });
  assert.equal((await wait(5)).result.content[0].type, 'image');
  p.kill();
});
