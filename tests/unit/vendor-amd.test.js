const test = require('node:test');
const assert = require('node:assert/strict');
const amd = require('../../src/main/services/vendor-amd');

test('yonga seti sayfası anakart adından: AM4 / AM5, desteklenmeyen null', () => {
  assert.equal(amd.chipsetPage('B550 AORUS ELITE AX V2'), 'https://www.amd.com/en/support/downloads/drivers.html/chipsets/am4/b550.html');
  assert.equal(amd.chipsetPage('ROG STRIX X670E-E GAMING WIFI'), 'https://www.amd.com/en/support/downloads/drivers.html/chipsets/am5/x670e.html');
  assert.equal(amd.chipsetPage('PRO B760M-A'), null); // Intel yonga seti
  assert.equal(amd.chipsetPage(''), null);
});

test('ekran kartı sayfası model adından (RX 5000-9000, XT/GRE)', () => {
  assert.equal(amd.gpuPage('AMD Radeon RX 6600'), 'https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-6000-series/amd-radeon-rx-6600.html');
  assert.equal(amd.gpuPage('AMD Radeon RX 7900 XT'), 'https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-7000-series/amd-radeon-rx-7900-xt.html');
  assert.equal(amd.gpuPage('Radeon RX 580'), null); // eski seri: otomatik paket yok
  assert.equal(amd.gpuPage('NVIDIA GeForce RTX 4070'), null);
});

const HTML = `
  <a href="https://drivers.amd.com/drivers/installer/26.10/whql/amd-software-adrenalin-edition-26.9.1-minimalsetup-260902_web.exe">web</a>
  <a href="https://drivers.amd.com/drivers/whql-amd-software-adrenalin-edition-26.8.1-win11-a.exe">eski</a>
  <a href="https://drivers.amd.com/drivers/whql-amd-software-adrenalin-edition-26.9.2-win11-a.exe">yeni</a>
  <a href="https://drivers.amd.com/drivers/win7-radeon-rx6600-rx6600xt-adrenalin-software-21.09.07.01.exe">win7</a>
  <a href="https://drivers.amd.com/drivers/AMD_Chipset_Software_8.03.25.247.exe">eski</a>
  <a href="https://drivers.amd.com/drivers/AMD_Chipset_Software_8.08.12.551.exe">yeni</a>
  <a href="https://evil.example.com/drivers/AMD_Chipset_Software_9.99.99.999.exe">sahte</a>`;

test('en güncel paket seçilir; web kurucu, win7 ve yabancı alan adı alınmaz', () => {
  const gpu = amd.pickPackage(HTML, 'gpu');
  assert.equal(gpu.version, '26.9.2');
  assert.equal(gpu.url, 'https://drivers.amd.com/drivers/whql-amd-software-adrenalin-edition-26.9.2-win11-a.exe');
  const chip = amd.pickPackage(HTML, 'chipset');
  assert.equal(chip.version, '8.08.12.551', 'evil.example.com bağlantısı yok sayılmalı');
  assert.equal(amd.pickPackage('<html></html>', 'gpu'), null);
});

test('sessiz kurulum argümanları ve doğrulama adları', () => {
  assert.deepEqual(amd.silentArgs('chipset'), ['/S']);
  assert.deepEqual(amd.silentArgs('gpu'), ['-INSTALL']);
  assert.ok(amd.verifyName('gpu').test('AMD Software'));
  assert.ok(amd.verifyName('chipset').test('AMD Chipset Software'));
  assert.ok(amd.cmpVer('8.08.12.551', '8.03.25.247') > 0);
});
