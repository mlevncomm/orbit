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
