// electron-builder, ek kaynaklardaki node_modules klasörlerini her zaman atlar.
// Gömülü Growth OS sunucusunun bağımlılıklarını paketlemeden sonra elle kopyalar.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(ctx) {
  const from = path.join(__dirname, '..', 'growth-os', '.next', 'standalone', 'node_modules');
  const to = path.join(ctx.appOutDir, 'resources', 'growth', 'node_modules');
  if (!fs.existsSync(from)) throw new Error('Growth OS derlenmemiş: önce npm run growth');
  fs.cpSync(from, to, { recursive: true });
  if (!fs.existsSync(path.join(to, '.prisma', 'client'))) throw new Error('Prisma istemcisi pakete girmedi');
  console.log('  • Growth OS bağımlılıkları kopyalandı');
};
