// Orbit canlı veritabanı modu: sunucu `node --require ./orbit-db.js server.js` ile ve ORBIT_DB=pg iken açılırsa
// @prisma/client yerel (SQLite) istemci yerine PostgreSQL istemcisini (node_modules/.prisma/client-pg) yükler.
// Growth OS kaynağına dokunmadan aynı derlemeyle iki veritabanında da çalışmayı sağlar.
if (process.env.ORBIT_DB === 'pg') {
  const Module = require('module');
  const path = require('path');
  const PG = path.join(__dirname, 'node_modules', '.prisma', 'client-pg');
  const MAP = { '.prisma/client': 'index.js', '.prisma/client/index': 'index.js', '.prisma/client/default': 'default.js' };
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return resolve.call(this, MAP[request] ? path.join(PG, MAP[request]) : request, ...rest);
  };
}

// Doğrudan çalıştırılırsa (Orbit: `orbit-db.js` giriş noktası) Next sunucusunu başlatır
if (require.main === module) require('./server.js');
