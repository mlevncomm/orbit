const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../../src/main/services/install-utils');

test('explainExit: winget ve MSI kodları', () => {
  assert.equal(U.explainExit(0).kind, 'ok');
  assert.equal(U.explainExit(-1978335189).kind, 'already');   // 0x8A15002B
  assert.equal(U.explainExit(-1978335090).kind, 'reinstall');   // 0x8A15008E
  assert.equal(U.explainExit(-1978335135).kind, 'already');   // 0x8A150061
  assert.equal(U.explainExit(-1978334967).kind, 'reboot');    // 0x8A150109
  assert.equal(U.explainExit(3010).kind, 'reboot');
  assert.equal(U.explainExit(1618).kind, 'error');
  assert.match(U.explainExit(-1978335212).text, /bulunamadı/); // 0x8A150014
  assert.match(U.explainExit(12345).text, /0x00003039/);
  assert.equal(U.hex(-1978335189), '0x8A15002B');
});

test('parseProgress: gerçek bayt ilerlemesi', () => {
  assert.deepEqual(U.parseProgress('  ██████████    12.0 MB / 100 MB'), { doneMB: 12, totalMB: 100, percent: 12 });
  assert.equal(U.parseProgress('  ██  512 KB / 2.00 MB').percent, 25);
  assert.equal(U.parseProgress('1,5 GB / 3 GB').percent, 50);
  assert.equal(U.parseProgress('  45%').percent, 45);
  assert.equal(U.parseProgress('Successfully verified installer hash'), null);
  assert.equal(U.parseProgress('150%'), null);
});

test('safeWingetId: enjeksiyon denemeleri reddedilir', () => {
  assert.ok(U.safeWingetId('Google.Chrome'));
  assert.ok(U.safeWingetId('Microsoft.VCRedist.2015+.x64'));
  assert.ok(U.safeWingetId('Notepad++.Notepad++'));
  for (const bad of ['', 'a', 'Git.Git; rm -rf /', 'Git.Git & calc', '$(whoami)', 'Git.Git`n', '../etc', 'Git Git']) {
    assert.equal(U.safeWingetId(bad), false, bad);
  }
});

test('safeNpmName', () => {
  assert.ok(U.safeNpmName('vercel'));
  assert.ok(U.safeNpmName('@angular/cli'));
  assert.equal(U.safeNpmName('vercel && calc'), false);
  assert.equal(U.safeNpmName('Vercel'), false);
});

test('extractVersion', () => {
  assert.equal(U.extractVersion('v22.11.0'), '22.11.0');
  assert.equal(U.extractVersion('git version 2.47.1.windows.1'), '2.47.1');
  assert.equal(U.extractVersion('Python 3.13.1'), '3.13.1');
  assert.equal(U.extractVersion('bulunamadı'), null);
});

test('parseShow: sürüm ve x64 kurulum adresi (gerçek winget show çıktısı)', () => {
  const out = [
    'Found 7-Zip [7zip.7zip]', 'Version: 26.04', 'Publisher Url: https://7-zip.org/',
    'Homepage: https://7-zip.org/download.html', 'Installers:',
    '  Installer Type: wix', '  Installer Url: https://www.7-zip.org/a/7z2604.msi',
    '  Installer Url: https://www.7-zip.org/a/7z2604-x64.msi',
  ].join('\r\n');
  assert.deepEqual(U.parseShow(out), { version: '26.04', url: 'https://www.7-zip.org/a/7z2604-x64.msi' });
  assert.deepEqual(U.parseShow('Bulundu\nSürüm: 3.0.24\n  Yükleyici Url: https://example.org/a.exe'), { version: '3.0.24', url: 'https://example.org/a.exe' });
  assert.deepEqual(U.parseShow('No package found'), { version: null, url: null });
});

test('0x8A150056: yönetici bağlamını reddeden yükleyici (gerçek Spotify vakası) → kullanıcı olarak dene', () => {
  const e = U.explainExit(-1978335146);
  assert.equal(U.hex(-1978335146), '0x8A150056');
  assert.equal(e.kind, 'needs-user');
});
