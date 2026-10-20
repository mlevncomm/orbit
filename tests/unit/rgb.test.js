require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/main/services/store');
const rgb = require('../../src/main/services/rgb');
const F = require('../fixtures/openrgb-devices');

store.load();

/** OpenRGB istemcisi taklidi: çağrıları kaydeder */
function fakeClient() {
  const calls = [];
  return {
    calls,
    updateMode: async (id, mode) => { calls.push({ fn: 'updateMode', id, mode }); },
    updateLeds: (id, colors) => { calls.push({ fn: 'updateLeds', id, colors }); },
    saveMode: async (id, mode) => { calls.push({ fn: 'saveMode', id, mode }); },
    setCustomMode: (id) => { calls.push({ fn: 'setCustomMode', id }); },
  };
}

async function applyTo(dev, profile, engine = 'hardware') {
  store.patch('settings', { rgbEngine: engine });
  rgb.client = fakeClient();
  rgb.soft.clear();
  await rgb.applyToDevice(dev, { colors: ['#00e5c0', '#7b2ff7'], speed: 3, brightness: 100, ...profile });
  return { applied: rgb.applied.get(dev.deviceId), calls: rgb.client.calls, soft: rgb.soft.has(dev.deviceId) };
}

test('renk dalgası: 2 renk alan donanım modu varsa donanım (RAM → Color Wave)', async () => {
  const r = await applyTo(F.RAM, { effect: 'wave' });
  assert.equal(r.applied.method, 'Donanım');
  assert.equal(r.applied.mode, 'Color Wave');
  const um = r.calls.find((c) => c.fn === 'updateMode');
  assert.deepEqual(um.mode.colors, [{ red: 0, green: 229, blue: 192 }, { red: 123, green: 47, blue: 247 }]);
});

test('renk dalgası: renk almayan "Wave" kullanılmaz, Direct varsa yazılım (USB anakart)', async () => {
  const r = await applyTo(F.BOARD, { effect: 'wave' });
  assert.equal(r.applied.method, 'Yazılım');
  assert.ok(r.soft);
  const m = await applyTo(F.MOUSE, { effect: 'wave' });
  assert.ok(!m.calls.some((c) => c.fn === 'updateMode' && c.mode.id === 5), 'Logitech Wave (gökkuşağı) seçilmemeli');
});

test('renk dalgası: Direct olmayan klavye ASLA animasyona alınmaz, tek seferlik renk geçişi', async () => {
  const r = await applyTo(F.KEYBOARD, { effect: 'wave' });
  assert.equal(r.soft, false);
  assert.equal(r.applied.mode, 'Custom');
  const leds = r.calls.filter((c) => c.fn === 'updateLeds');
  assert.equal(leds.length, 1, 'tek seferlik yazma');
  assert.equal(leds[0].colors.length, 126);
  assert.deepEqual(leds[0].colors[0], { red: 0, green: 229, blue: 192 });
  assert.deepEqual(leds[0].colors[125], { red: 123, green: 47, blue: 247 });
});

test('sabit renk: RAM kalıcı Custom moduna, anakart Static moduna', async () => {
  const ram = await applyTo(F.RAM, { effect: 'static', colors: ['#ff1e3c', '#000000'] });
  assert.equal(ram.applied.mode, 'Custom');
  assert.equal(ram.applied.note, '');
  const board = await applyTo(F.BOARD, { effect: 'static', colors: ['#ff1e3c', '#000000'] });
  assert.equal(board.applied.mode, 'Static');
  assert.deepEqual(board.calls[0].mode.colors, [{ red: 255, green: 30, blue: 60 }]);
});

test('kapalı: farede Off modu', async () => {
  const r = await applyTo(F.MOUSE, { effect: 'off' });
  assert.equal(r.applied.mode, 'Off');
});

test('nefes: renk almayan Logitech Breathing yerine yazılım; klavyede donanım', async () => {
  assert.equal((await applyTo(F.BOARD, { effect: 'breathing' })).applied.method, 'Donanım');
  const kb = await applyTo(F.KEYBOARD, { effect: 'breathing' });
  assert.equal(kb.applied.mode, 'Breathing');
});

test('gökkuşağı: renk gerektirmez, donanım modları kullanılır', async () => {
  assert.equal((await applyTo(F.MOUSE, { effect: 'rainbow' })).applied.mode, 'Wave');
  assert.equal((await applyTo(F.RAM, { effect: 'rainbow' })).applied.mode, 'Rainbow Wave');
});

test('hız: kaydırıcının en üstü cihaz maksimumunun ~%70i (ters aralık dahil)', async () => {
  const r = await applyTo(F.BOARD, { effect: 'breathing', speed: 10 });
  const sp = r.calls.find((c) => c.fn === 'updateMode').mode.speed;
  assert.equal(sp, 3); // 9 (yavaş) → 0 (hızlı): 9 - 9*0.7 = 2.7 → 3
});

test('eski "Senkron" ayarı kalmış olsa da RAM yazılımla canlandırılmaz (takılma)', async () => {
  const r = await applyTo(F.RAM, { effect: 'wave' }, 'sync');
  assert.equal(r.applied.method, 'Donanım');
  assert.equal(r.soft, false);
  store.patch('settings', { rgbEngine: 'hardware' });
});

test('veri yolu: SMBus/I2C cihazı yazılımla canlandırılmaz, USB (HID) anakart canlandırılır', async () => {
  assert.equal(rgb.slowBus(F.RAM), true);
  assert.equal(rgb.slowBus(F.BOARD), false); // B550 RGB Fusion 2: USB
  const ramNoWave = { ...F.RAM, modes: F.RAM.modes.filter((m) => !/wave|shift|visor/i.test(m.name)) };
  const r = await applyTo(ramNoWave, { effect: 'wave' });
  assert.equal(r.soft, false, 'RAM: sabit renk geçişi');
  assert.equal((await applyTo(F.BOARD, { effect: 'wave' })).soft, true, 'anakart: akıcı yazılım dalgası');
});

test('hafızaya kayıt gecikmeli ve tek sefer: art arda ayarlarda cihaz flaşına her adımda yazılmaz', async () => {
  const save = F.KEYBOARD.modes.find((m) => (m.flagList || []).includes('manualSave'));
  const dev = save ? F.KEYBOARD : F.RAM;
  rgb.client = fakeClient();
  rgb.raw = new Map([[dev.deviceId, dev]]);
  const mode = dev.modes.find((m) => (m.flagList || []).includes('manualSave')) || dev.modes[0];
  const flags = mode.flagList;
  mode.flagList = [...new Set([...(flags || []), 'manualSave'])];
  for (let i = 0; i < 5; i++) await rgb.setMode(dev, mode, { effect: 'static', colors: ['#ff0000', '#000000'], speed: 3, brightness: 100 });
  assert.equal(rgb.client.calls.filter((c) => c.fn === 'saveMode').length, 0, 'hemen kaydetmemeli');
  rgb.shutdown(); // kapanırken bekleyen kayıt yazılır
  assert.equal(rgb.client.calls.filter((c) => c.fn === 'saveMode').length, 1);
  mode.flagList = flags;
});

test('art arda genel uygulamalarda yalnızca en sonuncusu cihazlara gider', async () => {
  const seen = [];
  const orig = rgb.applyNow;
  rgb.client = fakeClient();
  rgb.applyNow = async (p) => { seen.push(p.name); await new Promise((r) => setTimeout(r, 20)); return {}; };
  await Promise.all(['A', 'B', 'C', 'D'].map((name) => rgb.apply({ name, effect: 'static' })));
  rgb.applyNow = orig;
  assert.deepEqual(seen, ['D'], 'aradaki istekler atlanmalı, yalnızca son görünüm uygulanmalı');
});

test('cihaz listesi değişince eski numara eşlemeleri silinir ve görünüm yeniden uygulanır', async () => {
  rgb.client = { ...fakeClient(), getAllControllerData: async () => [F.RAM, F.KEYBOARD] };
  rgb.applied.set(99, { method: 'Yazılım' });
  rgb.soft.set(99, {});
  let restored = 0;
  const orig = rgb.restoreNow;
  rgb.restoreNow = async () => { restored++; };
  rgb.onDeviceListChanged('test');
  await new Promise((r) => setTimeout(r, 900));
  await rgb.queue;
  rgb.restoreNow = orig;
  assert.equal(rgb.applied.has(99), false);
  assert.equal(rgb.soft.has(99), false);
  assert.equal(rgb.devices.length, 2);
  assert.equal(restored, 1);
  rgb.shutdown();
  rgb.client = null;
});

test('yazılım animasyonu göstermeyen fare (G203): animasyonlu görünümde rengi tek seferde sabit alır', async () => {
  assert.equal(rgb.noSoftAnim(F.MOUSE), true);
  assert.equal(rgb.noSoftAnim(F.BOARD), false);
  for (const effect of ['wave', 'breathing', 'pulse']) {
    const r = await applyTo(F.MOUSE, { effect, colors: ['#ff7a18', '#ff2e63'] });
    assert.equal(r.soft, false, effect + ': döngü başlamamalı');
    const leds = r.calls.filter((c) => c.fn === 'updateLeds');
    assert.equal(leds.length, 1, effect + ': tek yazma');
    assert.deepEqual(leds[0].colors[0], { red: 255, green: 122, blue: 24 });
  }
  // gökkuşağı donanım modunda kalır (gerçek farede çalıştığı görüldü)
  assert.equal((await applyTo(F.MOUSE, { effect: 'rainbow' })).applied.mode, 'Wave');
});
