require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const inventory = require('../../src/main/services/inventory');
const { parseTable } = inventory;

// Bu bilgisayardaki gerçek `winget list` çıktısından alınmış örnek (ilerleme animasyonu dahil)
const SAMPLE = [
  '\r   - \r                                         \rName                Id                          Version       Available   Source',
  '------------------------------------------------------------------------------------------',
  'App Installer       Microsoft.AppInstaller      1.29.379.0    1.29.380    winget',
  'Google Chrome       Google.Chrome               155.0.8059.85             winget',
  'AMD Chipset Softwa… ARP\\Machine\\X86\\AMD_Chipset 8.03.25.247',
  '2 upgrades available.',
].join('\n');

test('parseTable: 5 sütun, güncelleme ve ARP satırları', () => {
  const rows = parseTable(SAMPLE);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { name: 'App Installer', id: 'Microsoft.AppInstaller', version: '1.29.379.0', available: '1.29.380', source: 'winget' });
  assert.equal(rows[1].available, '');
  assert.equal(rows[2].id, 'ARP\\Machine\\X86\\AMD_Chipset');
});

test('parseTable: 4 sütun (güncelleme sütunu yok) ve Türkçe başlık', () => {
  const tr = 'Ad             Kimlik         Sürüm   Kaynak\n-----------------------------------------\nGit            Git.Git        2.56.0  winget\n';
  const rows = parseTable(tr);
  assert.deepEqual(rows[0], { name: 'Git', id: 'Git.Git', version: '2.56.0', available: '', source: 'winget' });
});

test('statusOf: kimlik ailesi, görünen ad ve kurulu değil', () => {
  inventory.data = {
    programs: [{ name: 'Python 3.15.0 (64-bit)', version: '3.15.150.0', wingetId: null, available: '' }],
    upgrades: [],
    wingetById: {
      'openjs.nodejs.22': { id: 'OpenJS.NodeJS.22', version: '22.11.0', available: '22.12.0', source: 'winget' },
      'google.chrome': { id: 'Google.Chrome', version: '155.0', available: '', source: 'winget' },
    },
  };
  inventory.at = Date.now();
  assert.deepEqual(inventory.statusOf({ wingetId: 'OpenJS.NodeJS.LTS', family: 'OpenJS.NodeJS' }), { installed: true, version: '22.11.0', available: '22.12.0', id: 'OpenJS.NodeJS.22' });
  assert.equal(inventory.statusOf({ wingetId: 'Google.Chrome' }).installed, true);
  assert.equal(inventory.statusOf({ wingetId: 'Python.Python.3.14', family: 'Python.Python.3', match: /^Python 3\.\d+\.\d+ \(64-bit\)/i }).version, '3.15.150.0');
  assert.equal(inventory.statusOf({ wingetId: 'Mozilla.Firefox' }).installed, false);
  assert.equal(inventory.statusOf({ wingetId: 'X.Y', files: ['C:/kesinlikle/yok.exe'] }).installed, false);
});
