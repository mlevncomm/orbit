const { userData } = require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../../src/main/services/store');

const file = path.join(userData, 'orbit.json');

test('1.0.0 kaydından geçiş: başlangıç açılır, RGB durumu taşınır', () => {
  fs.writeFileSync(file, JSON.stringify({ settings: { theme: 'dark', startWithWindows: false }, rgbActive: { id: 'p_off', effect: 'off' } }));
  store.load();
  assert.equal(store.get('schema'), 2);
  assert.equal(store.get('settings').theme, 'dark');
  assert.equal(store.get('settings').startWithWindows, true);
  assert.equal(store.get('rgbState').global.id, 'p_off');
  assert.equal(store.get('rgbActive'), undefined);
});

test('yazma kalıcı ve atomik; bozuk dosyada .bak geri yüklenir', () => {
  store.load();
  store.patch('settings', { userName: 'Mehmet' });
  store.flush();
  store.patch('settings', { userName: 'Mehmet2' });
  store.flush(); // .bak = önceki sürüm (Mehmet)
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).settings.userName, 'Mehmet2');
  fs.writeFileSync(file, '{ bozuk json');
  store.load();
  assert.equal(store.get('settings').userName, 'Mehmet');
  assert.ok(!fs.existsSync(file + '.tmp'));
});

test('patch alanları birleştirir, diğer ayarları silmez', () => {
  store.load();
  store.patch('settings', { theme: 'light' });
  assert.equal(store.get('settings').userName, 'Mehmet');
  assert.equal(store.get('settings').theme, 'light');
});
