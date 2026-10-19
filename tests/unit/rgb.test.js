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

test('renk dalgası: renk almayan "Wave" kullanılmaz, Direct varsa yazılım (fare)', async () => {
  const r = await applyTo(F.MOUSE, { effect: 'wave' });
  assert.equal(r.applied.method, 'Yazılım');
  assert.ok(r.soft);
  assert.ok(!r.calls.some((c) => c.fn === 'updateMode' && c.mode.id === 5), 'Logitech Wave (gökkuşağı) seçilmemeli');
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
  assert.equal((await applyTo(F.MOUSE, { effect: 'breathing' })).applied.method, 'Yazılım');
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

test('senkron mod: Direct olanlar yazılım, klavye donanımda kalır', async () => {
  assert.equal((await applyTo(F.RAM, { effect: 'wave' }, 'sync')).applied.method, 'Yazılım');
  assert.equal((await applyTo(F.KEYBOARD, { effect: 'wave' }, 'sync')).soft, false);
  store.patch('settings', { rgbEngine: 'hardware' });
});
