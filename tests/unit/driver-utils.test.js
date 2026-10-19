const test = require('node:test');
const assert = require('node:assert/strict');
const DU = require('../../src/main/services/driver-utils');

test('parseHwId: PCI ve USB kimlikleri', () => {
  assert.deepEqual(DU.parseHwId(String.raw`PCI\VEN_1002&DEV_73FF&SUBSYS_E4451DA2&REV_C7\6&2A1B`), { bus: 'PCI', vendorId: '1002', deviceId: '73FF', subsys: 'E4451DA2', rev: 'C7', vendor: 'AMD (Radeon)' });
  const u = DU.parseHwId(String.raw`usb\vid_046d&pid_c092`); // Windows Update'in gerçek DriverHardwareID değeri
  assert.equal(u.bus, 'USB'); assert.equal(u.vendor, 'Logitech'); assert.equal(u.deviceId, 'C092');
  assert.equal(DU.parseHwId(String.raw`ROOT\SYSTEM\0001`).vendorId, null);
  assert.equal(DU.parseHwId(String.raw`PCI\VEN_ABCD&DEV_0001`).vendor, null); // bilinmeyen üretici uydurulmaz
});

test('versionFromTitle', () => {
  assert.equal(DU.versionFromTitle('Logitech USB Driver Update (1.1.84.7627)'), '1.1.84.7627');
  assert.equal(DU.versionFromTitle('Advanced Micro Devices, Inc. - Display - 32.0.21030.2001'), '32.0.21030.2001');
  assert.equal(DU.versionFromTitle('Realtek - Net'), null);
});

test('compareVersions', () => {
  assert.equal(DU.compareVersions('1.0.0.90', '1.0.0.91'), 'newer');
  assert.equal(DU.compareVersions('32.0.21030.2001', '32.0.21030.2001'), 'same');
  assert.equal(DU.compareVersions('6001.16.172.0', '6001.16.170.0'), 'older');
  assert.equal(DU.compareVersions('1.2', '1.2.0.0'), 'same');
  assert.equal(DU.compareVersions(null, '1'), 'unknown');
});

test('classifyUpdate: farklı sağlayıcıların sürümleri karşılaştırılmaz (gerçek G203 vakası)', () => {
  const dev = { version: '10.0.26100.9711', provider: 'Microsoft' };
  assert.equal(DU.classifyUpdate(dev, 'Logitech', '1.1.84.7627'), 'vendor');
  assert.equal(DU.classifyUpdate({ version: '1.0', provider: 'Realtek' }, 'Intel', '2.0'), 'different');
  assert.equal(DU.classifyUpdate({ version: '1.0', provider: 'Realtek' }, 'realtek', '2.0'), 'newer');
  assert.equal(DU.classifyUpdate(null, 'Logitech', '1.0'), 'unknown');
});

test('isFirmwareUpdate: BIOS/UEFI/firmware ayrılır', () => {
  assert.ok(DU.isFirmwareUpdate({ cls: 'Firmware', title: 'Gigabyte - Firmware - 1.0' }));
  assert.ok(DU.isFirmwareUpdate({ cls: 'System', title: 'Lenovo BIOS Update' }));
  assert.ok(DU.isFirmwareUpdate({ cls: 'OtherHardware', title: 'Surface UEFI update' }));
  assert.equal(DU.isFirmwareUpdate({ cls: 'OtherHardware', title: 'Logitech USB Driver Update (1.1.84.7627)' }), false);
});
