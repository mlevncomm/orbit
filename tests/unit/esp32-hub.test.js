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
  assert.deepEqual([...ALLOWED_COMMANDS].sort(), ['info', 'led', 'notify', 'ping', 'result', 'wifi', 'wifi_off']);
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

test('parseEsptool: bu bilgisayardaki kartın gerçek esptool v5.6 çıktısı', () => {
  const { parseEsptool } = require('../../src/main/esp32/hub');
  const out = `esptool v5.6.0
Serial port COM3:
Connecting..........
Detecting chip type... ESP32
Connected to ESP32 on COM3:
Chip type:          ESP32-D0WDQ6 (revision v1.1)
Features:           Wi-Fi, BT, Dual Core + LP Core, 240MHz, Vref calibration in eFuse, Coding Scheme None
Crystal frequency:  40MHz
MAC:                a0:dd:6c:a3:69:34

Flash Memory Information:
=========================
Manufacturer: 68
Device: 4016
Detected flash size: 4MB
Hard resetting via RTS pin...`;
  assert.deepEqual(parseEsptool(out), {
    chip: 'ESP32-D0WDQ6', revision: 'v1.1', family: 'ESP32',
    features: 'Wi-Fi, BT, Dual Core + LP Core, 240MHz, Vref calibration in eFuse, Coding Scheme None',
    crystal: '40MHz', mac: 'a0:dd:6c:a3:69:34', flashSize: '4MB',
  });
  assert.equal(parseEsptool('A fatal error occurred: Failed to connect').chip, null);
});

test('pickAutoPort: son port, tek ESP32 köprüsü, belirsiz durum', () => {
  const { pickAutoPort } = require('../../src/main/esp32/hub');
  const ports = [{ port: 'COM1', likelyEsp: false }, { port: 'COM3', likelyEsp: true }];
  assert.equal(pickAutoPort(ports, 'COM3'), 'COM3');
  assert.equal(pickAutoPort(ports, 'COM7'), null); // son port takılı değil → başkasına atlama
  assert.equal(pickAutoPort(ports, null), 'COM3');
  assert.equal(pickAutoPort([...ports, { port: 'COM5', likelyEsp: true }], null), null); // iki kart → bekle
  assert.equal(pickAutoPort([{ port: 'COM1', likelyEsp: false }], null), null);
});
