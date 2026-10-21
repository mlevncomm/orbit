require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/main/services/store');
const remote = require('../../src/main/services/remote');

store.load();

test('uzaktan yönetim: riskli işler ve satış kanalları reddedilir, ayarlarda kilitli alanlar silinir', async () => {
  const seen = [];
  const handlers = new Map([
    ['settings:set', (p) => { seen.push(p); return p; }],
    ['system:restart', () => 'yeniden başladı'],
    ['install:run', (items) => items.length],
  ]);
  const st = await remote.sync({ handlers, url: () => null, version: 'test', pc: 'pc' });
  assert.equal(st.connected, false); // canlı veritabanı yokken bağlanmaz

  for (const ch of ['system:restart', 'shell:open-local', 'profile:import', 'growth:set-pin', 'growth:go-live', 'update:install', 'bridge:info']) {
    assert.equal(remote.denied(ch), true, ch);
  }
  await assert.rejects(() => remote.exec('system:restart', []), /uzaktan yapılamaz/);
  await assert.rejects(() => remote.exec('yok:boyle', []), /Bilinmeyen/);
  assert.equal(await remote.exec('install:run', [[{ key: 'a' }, { key: 'b' }]]), 2);

  await remote.exec('settings:set', [{ theme: 'dark', apiKey: 'sk-ant-x', remoteControl: false, bridgeEnabled: true }]);
  assert.deepEqual(seen[0], { theme: 'dark' });
});
