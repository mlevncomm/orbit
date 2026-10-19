// Gerçek sistem üzerinde SALT OKUNUR entegrasyon testleri (hiçbir şey kurmaz/değiştirmez).
// Çalıştırma: npm run test:integration
require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../src/main/services/store').load();

test('hazırlık kontrolü: winget, internet ve paket kaynağı', { timeout: 180000 }, async () => {
  const r = await require('../../src/main/services/bootstrap').check();
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  for (const id of ['os', 'net', 'winget', 'source', 'disk']) assert.ok(by[id], id);
  assert.notEqual(by.winget.status, 'fail', by.winget.detail);
  assert.equal(by.source.status, 'ok', by.source.detail);
});

test('envanter: kurulu programlar ve winget eşleşmesi', { timeout: 180000 }, async () => {
  const inv = require('../../src/main/services/inventory');
  const d = await inv.get(true);
  assert.ok(d.programs.length > 10, `yalnızca ${d.programs.length} program`);
  assert.ok(Object.keys(d.wingetById).length > 5);
});

test('winget araması sonuç döndürür', { timeout: 90000 }, async () => {
  const r = await require('../../src/main/services/system').wingetSearch('7zip');
  assert.ok(r.some((x) => x.id === '7zip.7zip'), JSON.stringify(r.slice(0, 3)));
});

test('sürücü envanteri en az bir donanım sürücüsü bulur', { timeout: 180000 }, async () => {
  const list = await require('../../src/main/services/drivers').installedDrivers(true);
  assert.ok(list.length > 0);
  assert.ok(list.every((d) => d.version && d.name));
});

test('ESP32: seri portlar listelenir (kart takılı değilse boş liste)', { timeout: 60000 }, async () => {
  const { Esp32Hub } = require('../../src/main/esp32/hub');
  const ports = await new Esp32Hub().listPorts();
  assert.ok(Array.isArray(ports));
  for (const p of ports) assert.match(p.port, /^COM\d+$/);
});
