require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const inventory = require('../../src/main/services/inventory');
const installer = require('../../src/main/services/installer');

// Gerçek doğrulama fonksiyonu; envanter taklit edilir
const verify = Object.getPrototypeOf(installer).verify.bind(installer);
function fakeInventory(programs) {
  inventory.invalidate = () => {};
  inventory.get = async () => ({ programs, upgrades: [] });
}

test('AMD: yükleyici 2 döndürse de kurulu sürüm beklenene ulaştıysa kuruldu sayılır', async () => {
  fakeInventory([{ name: 'AMD Chipset Software', version: '8.08.12.551' }]);
  const item = { key: 'drv_amdchipset', name: 'AMD Chipset Software', source: 'amd', amdKind: 'chipset', expectVersion: '8.08.12.551' };
  const r = await verify(item, { status: 'error', message: 'Kurulum başarısız (kod 0x00000002)', error: 'x', exitCode: 2 });
  assert.equal(r.status, 'done');
  assert.equal(r.verified, true);
  assert.equal(r.error, null);
  assert.match(r.message, /8\.08\.12\.551/);
});

test('AMD: çıkış 0 ama sürüm değişmediyse "kuruldu" denmez', async () => {
  fakeInventory([{ name: 'AMD Chipset Software', version: '8.03.25.247' }]);
  const item = { key: 'drv_amdchipset', name: 'AMD Chipset Software', source: 'amd', amdKind: 'chipset', expectVersion: '8.08.12.551' };
  const r = await verify(item, { status: 'done', message: 'ok', exitCode: 0 });
  assert.equal(r.status, 'warn');
  assert.equal(r.verified, false);
});

test('AMD: indirme / imza hatasında (yükleyici hiç çalışmadı) hata korunur', async () => {
  fakeInventory([{ name: 'AMD Software', version: '26.9.2' }]);
  const item = { key: 'drv_amdgpu', name: 'AMD Adrenalin', source: 'amd', amdKind: 'gpu', expectVersion: '26.9.2' };
  const r = await verify(item, { status: 'error', message: 'İmza doğrulanamadı', error: 'imza' });
  assert.equal(r.status, 'error');
});
