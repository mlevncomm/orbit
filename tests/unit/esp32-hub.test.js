require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Esp32Hub, ALLOWED_COMMANDS } = require('../../src/main/esp32/hub');

/** Seri port yerine sahte "kart": yazılan istekleri yanıtlar */
function fakeBoard(hub, respond) {
  hub.proc = { stdin: { write() {} } };
  hub.writeRaw = (line) => {
    const msg = JSON.parse(line);
    const reply = respond(msg);
    if (reply) setImmediate(() => hub.onLine(JSON.stringify({ v: 1, id: msg.id, ...reply })));
  };
}

test('el sıkışma: Orbit firmware yanıtı cihaz bilgisini doldurur', async () => {
  const hub = new Esp32Hub();
  fakeBoard(hub, (m) => (m.t === 'HELLO' ? { t: 'HELLO', fw: 'orbit-companion', ver: '0.1.0', chip: 'ESP32-D0WD-V3', caps: ['ping', 'led'] } : null));
  await hub.handshake();
  hub.stopHeartbeat();
  assert.equal(hub.device.chip, 'ESP32-D0WD-V3');
});

test('firmware yoksa: zaman aşımı, ham konsol modunda kalır', async () => {
  const hub = new Esp32Hub();
  fakeBoard(hub, () => null);
  hub.request = (t) => Promise.reject(new Error(`${t} yanıtı gelmedi`));
  await hub.handshake();
  assert.equal(hub.device, null);
});

test('komut izin listesi: yalnızca tanımlı komutlar', async () => {
  const hub = new Esp32Hub();
  hub.device = { caps: ['ping'] };
  fakeBoard(hub, (m) => ({ t: 'RESPONSE', ok: true, cmd: m.cmd }));
  await assert.rejects(hub.command('shell', { c: 'format' }), /İzin verilmeyen/);
  await assert.rejects(hub.command('led', { state: 'on' }), /dahili LED/); // kart LED bildirmedi
  const r = await hub.command('ping');
  assert.equal(r.ok, true);
  assert.ok(r.rttMs >= 0);
  assert.deepEqual([...ALLOWED_COMMANDS].sort(), ['info', 'led', 'notify', 'ping']);
});

test('ERROR yanıtı reddedilir, karttan gelen EVENT komuta dönüşmez', async () => {
  const hub = new Esp32Hub();
  hub.device = { caps: ['led'] };
  fakeBoard(hub, () => ({ t: 'ERROR', code: 'NO_LED', error: 'LED yok' }));
  await assert.rejects(hub.command('led', { state: 'on' }), /LED yok/);
  const events = [];
  hub.on('device-event', (e) => events.push(e));
  hub.onLine('{"v":1,"t":"EVENT","event":"button","run":"shutdown /s"}');
  assert.equal(events.length, 1); // yalnızca olay yayınlanır; hub hiçbir şey çalıştırmaz
});

test('ham satırlar günlüğe düşer', () => {
  const hub = new Esp32Hub();
  hub.onLine('rst:0x1 (POWERON_RESET),boot:0x13');
  assert.equal(hub.logs.at(-1).dir, 'in');
});
