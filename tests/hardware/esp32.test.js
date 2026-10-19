// GERÇEK DONANIM testi: Orbit firmware'i yüklü ESP32 ile çift yönlü haberleşme.
// Çalıştırma: npm run test:hardware   (port: ORBIT_ESP32_PORT, yoksa otomatik bulunur)
// Kart yoksa veya Orbit firmware yanıt vermiyorsa testler "atlandı" olarak işaretlenir.
// Hiçbir şey yazılmaz/yüklenmez; kart resetlenmez (DTR/RTS kapalı).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Esp32Hub } = require('../../src/main/esp32/hub');

const hub = new Esp32Hub();
let ready = false;
let skipReason = '';

test.before(async () => {
  const ports = await hub.listPorts();
  const port = process.env.ORBIT_ESP32_PORT || ports.find((p) => p.likelyEsp)?.port;
  if (!port) { skipReason = 'ESP32 benzeri seri port yok'; return; }
  const st = await hub.connect(port, 115200).catch((e) => { skipReason = e.message; return null; });
  if (!st?.orbitFirmware) { skipReason = skipReason || `${port}: Orbit firmware yanıt vermedi`; return; }
  ready = true;
});
test.after(() => hub.disconnect());

const hw = (name, fn) => test(name, { timeout: 30000 }, async (t) => { if (!ready) return t.skip(skipReason); await fn(); });

hw('HELLO: firmware ve çip bilgisi', async () => {
  assert.equal(hub.device.fw, 'orbit-companion');
  assert.match(hub.device.chip, /^ESP32/);
  assert.ok(hub.device.flash > 0);
  assert.ok(hub.device.caps.includes('ping'));
});

hw('STATUS ve CAPABILITIES', async () => {
  const s = await hub.readStatus();
  assert.ok(s.uptimeMs > 0 && s.heapFree > 0);
  const c = await hub.request('CAPABILITIES');
  assert.deepEqual(c.caps, hub.device.caps);
});

hw('ping: 10 gidiş-dönüş, her biri < 500 ms', async () => {
  for (let i = 0; i < 10; i++) {
    const r = await hub.command('ping');
    assert.equal(r.ok, true);
    assert.ok(r.rttMs < 500, `${r.rttMs} ms`);
  }
});

hw('notify: kart mesajı aldığını bildirir', async () => {
  const r = await hub.command('notify', { text: 'orbit hardware test' });
  assert.equal(r.received, 19);
});

hw('hata yolları: bilinmeyen komut ve bozuk JSON reddedilir', async () => {
  await assert.rejects(hub.request('COMMAND', { cmd: 'format' }), /Bilinmeyen/);
  const before = hub.logs.length;
  hub.writeRaw('{bozuk\n');
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(hub.logs.slice(before).some((l) => /BAD_JSON/.test(l.text)));
});

hw('LED: yalnızca kart bildiriyorsa', async () => {
  if (hub.device.caps.includes('led')) {
    assert.equal((await hub.command('led', { state: 'on' })).led, true);
    assert.equal((await hub.command('led', { state: 'off' })).led, false);
  } else {
    await assert.rejects(hub.command('led', { state: 'on' }), /LED/);
  }
});

hw('kes ve yeniden bağlan: kart resetlenmez', async () => {
  const s1 = await hub.readStatus();
  const port = hub.port;
  hub.disconnect();
  await new Promise((r) => setTimeout(r, 800));
  const st = await hub.connect(port, 115200);
  assert.ok(st.orbitFirmware);
  const s2 = await hub.readStatus();
  assert.ok(s2.uptimeMs > s1.uptimeMs, 'kart yeniden başlamamalı');
});
