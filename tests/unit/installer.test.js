require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/main/services/store');
const installer = require('../../src/main/services/installer');

store.load();

// Gerçek winget yerine sahte kurulum + doğrulama: kuyruk mantığını test eder
const done = (ms = 5) => new Promise((r) => setTimeout(r, ms));
function stubInstaller(results) {
  installer.installOne = async (item) => { await done(); return results[item.key] || { status: 'done', message: 'ok' }; };
  installer.verify = async (item, res) => (res.status === 'error' ? res : { ...res, verified: true });
}
const waitIdle = () => new Promise((resolve) => {
  const check = () => (installer.running ? setTimeout(check, 5) : resolve());
  check();
});

test('aynı paket iki kez kuyruğa giremez (anahtar veya winget kimliği)', async () => {
  stubInstaller({});
  const n = installer.enqueue([
    { key: 'chrome', name: 'Chrome', source: 'winget', wingetId: 'Google.Chrome' },
    { key: 'chrome', name: 'Chrome', source: 'winget', wingetId: 'Google.Chrome' },
    { key: 'upg_Google.Chrome', name: 'Chrome', source: 'winget', wingetId: 'google.chrome' },
  ]);
  assert.equal(n, 1);
  await waitIdle();
});

test('geçersiz winget kimliği kuyruğa alınmaz', async () => {
  const errs = [];
  const on = (p) => p.status === 'error' && errs.push(p);
  installer.on('progress', on);
  const n = installer.enqueue([{ key: 'x', name: 'X', source: 'winget', wingetId: 'Git.Git & calc' }]);
  installer.off('progress', on);
  assert.equal(n, 0);
  assert.match(errs[0].message, /Geçersiz/);
});

test('hata → yeniden dene, sıradaki atla, kalıcı kuyruk temizlenir', async () => {
  stubInstaller({ a: { status: 'error', message: 'indirme başarısız' } });
  let summary;
  const onState = (s) => { if (!s.running) summary = s; };
  installer.on('state', onState);
  installer.enqueue([
    { key: 'a', name: 'A', source: 'winget', wingetId: 'A.A' },
    { key: 'b', name: 'B', source: 'winget', wingetId: 'B.B' },
    { key: 'c', name: 'C', source: 'winget', wingetId: 'C.C' },
  ]);
  assert.equal(installer.skip('c'), true);
  await waitIdle();
  const by = Object.fromEntries(installer.list().map((x) => [x.key, x.status]));
  assert.deepEqual([by.a, by.b, by.c], ['error', 'done', 'cancelled']);
  assert.equal(summary.failed, 1);
  assert.deepEqual(store.get('installQueue'), []);

  stubInstaller({}); // ikinci denemede başarılı
  assert.equal(installer.retry('a'), true);
  await waitIdle();
  assert.equal(installer.list().find((x) => x.key === 'a').status, 'done');
  installer.off('state', onState);
});

test('yarım kalan kuyruk diskten okunur ve devam ettirilebilir', async () => {
  store.set('installQueue', [{ key: 'vlc', name: 'VLC', source: 'winget', wingetId: 'VideoLAN.VLC' }]);
  assert.equal(installer.pendingFromLastRun().length, 1);
  stubInstaller({});
  assert.equal(installer.resumePending(), 1);
  await waitIdle();
  assert.equal(installer.list().find((x) => x.key === 'vlc').status, 'done');
  assert.deepEqual(store.get('installQueue'), []);
});

test('kurulum türü değişen paket: onaysız kaldırılmaz, yalnızca reinstall() ile kaldır-kur sırasına girer', async () => {
  let seen = null;
  installer.installOne = async (item) => { await done(); if (item.reinstall) { seen = item.reinstall; return { status: 'done', message: 'ok' }; } item.needsReinstall = true; return { status: 'error', message: 'tür değişti' }; };
  installer.verify = async (item, res) => res;
  installer.enqueue([{ key: 'r', name: 'R', source: 'winget', wingetId: 'R.R' }]);
  await waitIdle();
  const j = installer.list().find((x) => x.key === 'r');
  assert.equal(j.status, 'error');
  assert.equal(j.needsReinstall, true);
  assert.equal(installer.reinstall('yok'), false);
  assert.equal(installer.reinstall('r'), true);
  await waitIdle();
  assert.equal(seen, true);
  assert.equal(installer.list().find((x) => x.key === 'r').status, 'done');
  assert.equal(installer.reinstall('r'), false); // başarılı iş yeniden kaldırılamaz
});
