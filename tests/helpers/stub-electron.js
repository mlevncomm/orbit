// Electron dışında (node --test) çalışan testler için asgari 'electron' taklidi.
// Her test dosyası kendi geçici userData klasörünü alır.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-'));
const fake = {
  app: { getPath: () => userData, isPackaged: false, getVersion: () => '0.0.0-test' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
};

const orig = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'electron') return fake;
  return orig.call(this, request, ...rest);
};

module.exports = { userData, root: path.resolve(__dirname, '..', '..') };
