require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/main/services/store');
const { Automation } = require('../../src/main/automation');
const { redact } = require('../../src/main/esp32/hub');
const P = require('../../src/main/esp32/protocol');

store.load();

/** Sahte bağımlılıklarla otomasyon: yapılan çağrıları kaydeder */
function make({ confirm = true } = {}) {
  const calls = [];
  const presets = [{ id: 'p_aurora', name: 'Aurora', effect: 'wave' }, { id: 'p_white', name: 'Saf Beyaz', effect: 'static' }, { id: 'p_off', name: 'Tümünü Kapat', effect: 'off' }];
  const deps = {
    store, log: { info() {}, warn() {} }, version: 'test',
    rgb: {
      status: () => ({ presets }),
      apply: async (p) => { calls.push(['apply', p.id]); store.set('rgbState', { global: p, devices: {} }); },
      power: async (on) => { calls.push(['power', on]); store.set('rgbState', { global: on ? presets[0] : presets[2], devices: {} }); },
    },
    installer: { running: false, list: () => [], enqueue: (items) => { calls.push(['enqueue', items.map((i) => i.key)]); return items.length; } },
    inventory: { get: async () => ({ upgrades: [{ id: 'Microsoft.WindowsTerminal', name: 'Windows Terminal' }] }), summary: () => ({ upgrades: 1 }) },
    catalog: { getCatalog: () => ({ profiles: [{ id: 'developer', name: 'Developer Setup', keys: ['git', 'vlc'] }], apps: [{ key: 'git', status: { installed: true } }, { key: 'vlc', name: 'VLC', source: 'winget', wingetId: 'VideoLAN.VLC', status: { installed: false } }] }) },
    drivers: { scanWindowsUpdate: async () => [{ id: 'x' }] },
    assistant: { chat: async () => ({ text: 'yanıt' }) },
    hub: { device: { caps: ['led'] }, command: async (...a) => { calls.push(['hub', ...a]); return { ok: true }; }, sendState: (s) => calls.push(['state', s]), readStatus: async () => ({}) },
    showWindow: () => calls.push(['show']),
    setSettings: async (p) => { calls.push(['settings', p]); store.patch('settings', p); },
    confirm: async () => { calls.push(['confirm']); return confirm; },
  };
  return { a: new Automation(deps), calls };
}

test('izin listesi dışındaki eylem reddedilir, hiçbir şey çalışmaz', async () => {
  const { a, calls } = make();
  const r = await a.run('system.shell', 'format c:');
  assert.equal(r.ok, false);
  assert.match(r.message, /İzin verilmeyen/);
  assert.equal(calls.length, 0);
});

test('geçersiz argüman reddedilir', async () => {
  const { a, calls } = make();
  assert.equal((await a.run('lights.preset', 'p_yok')).ok, false);
  assert.equal((await a.run('settings.theme', 'pembe')).ok, false);
  assert.equal(calls.length, 0);
});

test('güvenli eylemler doğrudan çalışır: ışık aç/kapat, sonraki, tema', async () => {
  const { a, calls } = make();
  store.set('rgbState', { global: { id: 'p_off', effect: 'off' }, devices: {} });
  assert.match((await a.run('lights.power', 'toggle')).message, /açıldı/);
  assert.match((await a.run('lights.power', 'toggle')).message, /kapatıldı/);
  store.set('rgbState', { global: { id: 'p_aurora', effect: 'wave' }, devices: {} });
  assert.match((await a.run('lights.next')).message, /Saf Beyaz/);
  store.patch('settings', { theme: 'light' });
  assert.match((await a.run('settings.theme', 'toggle')).message, /koyu/);
  assert.ok(!calls.some((c) => c[0] === 'confirm'), 'güvenli eylem onay istememeli');
});

test('onay gerektiren eylem: reddedilirse kuyruğa hiçbir şey girmez', async () => {
  const { a, calls } = make({ confirm: false });
  const r = await a.run('apps.update_all');
  assert.equal(r.ok, false);
  assert.match(r.message, /reddedildi/);
  assert.ok(calls.some((c) => c[0] === 'confirm'));
  assert.ok(!calls.some((c) => c[0] === 'enqueue'));
});

test('onay gerektiren eylem: onaylanırsa yalnızca eksik programlar kuyruğa girer', async () => {
  const { a, calls } = make({ confirm: true });
  const r = await a.run('apps.profile', 'developer');
  assert.equal(r.ok, true);
  assert.deepEqual(calls.find((c) => c[0] === 'enqueue')[1], ['vlc']);
});

test('BOOT tuşu: ayardaki eylem çalışır ve karta bildirim gider', async () => {
  const { a, calls } = make();
  store.patch('settings', { esp32Buttons: { short: { action: 'lights.power', arg: 'off' }, long: { action: 'lights.next', arg: '' } } });
  await a.onDeviceEvent({ t: 'EVENT', event: 'button', button: 'boot', press: 'short' });
  assert.ok(calls.some((c) => c[0] === 'power' && c[1] === false));
  assert.ok(calls.some((c) => c[0] === 'hub' && c[1] === 'notify'));
  assert.equal(a.history[0].source, 'button');
});

test('Wi-Fi paneli eylemi: sonuç aynı rid ile karta geri döner; izinsiz eylem reddedilir', async () => {
  const { a, calls } = make();
  await a.onDeviceEvent({ t: 'EVENT', event: 'action', action: 'drivers.scan', arg: '', rid: 7 });
  const res = calls.find((c) => c[0] === 'hub' && c[1] === 'result');
  assert.deepEqual(res[2], { rid: 7, ok: true, msg: '1 sürücü güncellemesi bulundu' });
  await a.onDeviceEvent({ t: 'EVENT', event: 'action', action: 'system.reboot', arg: '', rid: 8 });
  assert.equal(calls.filter((c) => c[1] === 'result').at(-1)[2].ok, false);
});

test('ikiz durum: kartın beklediği alanlar', async () => {
  const { a } = make();
  const s = await a.snapshot();
  for (const k of ['pc', 'ver', 'cpu', 'ram', 'lights', 'queue', 'updates', 'presets', 'profiles']) assert.ok(k in s, k);
  assert.ok(s.presets.every((p) => p.id !== 'p_off'));
  assert.ok(s.cpu >= 0 && s.cpu <= 100 && s.ram > 0 && s.ram <= 100);
  assert.ok(P.encode({ t: 'STATE', ...s }).length < P.MAX_LINE);
});

test('günlükte Wi-Fi şifresi ve anahtar gizlenir', () => {
  const line = P.encode({ id: 3, t: 'COMMAND', cmd: 'wifi', ssid: 'Ev', pass: 'gizli123', token: 'abcdef0123456789abcdef01' }).trim();
  const r = redact(line);
  assert.ok(!r.includes('gizli123') && !r.includes('abcdef0123'));
  assert.match(r, /"ssid":"Ev"/);
});
