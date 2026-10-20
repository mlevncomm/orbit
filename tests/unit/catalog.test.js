require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../src/main/services/store').load();
const catalog = require('../../src/main/services/catalog');
const U = require('../../src/main/services/install-utils');

const { apps, profiles } = catalog.getCatalog();

test('her katalog öğesinin geçerli bir kurulum kaynağı var', () => {
  for (const a of apps.filter((x) => !x.custom)) {
    if (a.source === 'winget') assert.ok(U.safeWingetId(a.wingetId), `${a.key}: ${a.wingetId}`);
    else if (a.source === 'npm') assert.ok(U.safeNpmName(a.npmPkg), a.key);
    else assert.fail(`${a.key}: bilinmeyen kaynak ${a.source}`);
  }
});

test('anahtarlar benzersiz, profil anahtarları katalogda var', () => {
  const keys = apps.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of profiles) for (const k of p.keys) assert.ok(keys.includes(k), `${p.id}: ${k}`);
});

test('Developer Setup istenen araçları içerir', () => {
  const dev = profiles.find((p) => p.id === 'developer');
  for (const k of ['chrome', 'git', 'ghcli', 'vscode', 'node', 'python', 'pwsh', 'wterminal', 'vsbuild', 'dotnetsdk', 'vcredist', 'claudecode', 'docker', 'postman', '7zip', 'spotify', 'vercel', 'pnpm']) {
    assert.ok(dev.keys.includes(k), k);
  }
});

test('doğrulama komutları sabit ve güvenli (kullanıcı girdisi içermez)', () => {
  // Yalnızca komut adı + harf/rakam/tire argümanlar: & | ; > < ` $ ( ) " gibi kabuk metakarakterleri yasak
  for (const a of apps.filter((x) => x.verify)) assert.match(a.verify, /^[a-z0-9]+(?: -{0,2}[a-z0-9-]+)*$/i, a.key);
});

test('genişletilmiş katalog: güvenli kimlikler, tekil kayıtlar, Store kaynağı, tespit kuralları', () => {
  const { getCatalog } = require('../../src/main/services/catalog');
  const U = require('../../src/main/services/install-utils');
  const apps = getCatalog().apps.filter((a) => !a.custom);
  assert.ok(apps.length >= 150, `katalogda ${apps.length} program`);
  const keys = apps.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length, 'çift anahtar');
  const ids = apps.filter((a) => a.wingetId).map((a) => a.wingetId.toLowerCase());
  assert.equal(new Set(ids).size, ids.length, 'çift winget kimliği');
  for (const a of apps.filter((x) => x.source === 'winget')) assert.ok(U.safeWingetId(a.wingetId), a.key);
  const wa = apps.find((a) => a.key === 'whatsapp');
  assert.equal(wa.wingetSource, 'msstore');
  // oyun platformları
  for (const k of ['steam', 'epic', 'rockstar', 'eaapp', 'ubisoft', 'gog', 'battlenet']) assert.equal(apps.find((a) => a.key === k).category, 'games', k);
  // kurulu olup olmadığı anlaşılabilmeli: winget kimliği dışında görünen ad / dosya kuralı
  // elle (winget dışında) kurulması yaygın kategorilerde görünen ad kuralı şart: yoksa "kurulu" görünmez
  const manual = ['games', 'browsers', 'comm', 'media', 'imaging', 'office', 'security', 'cloud'];
  const noRule = apps.filter((a) => manual.includes(a.category) && !a.match && !a.files && !a.family);
  assert.deepEqual(noRule.map((a) => a.key), [], 'tespit kuralı olmayanlar');
});
