// Basit dosya günlüğü: userData/logs/orbit.log (1 MB'ı geçince orbit.old.log'a döner)
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const MAX = 1024 * 1024;
let file = null;

function target() {
  if (file) return file;
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'orbit.log');
  return file;
}

function write(level, msg, err) {
  try {
    const f = target();
    try { if (fs.statSync(f).size > MAX) fs.renameSync(f, f.replace('.log', '.old.log')); } catch {}
    const detail = err ? ` | ${err.stack || err.message || err}` : '';
    fs.appendFileSync(f, `${new Date().toISOString()} [${level}] ${msg}${detail}\n`);
  } catch {}
  if (!app.isPackaged) (level === 'ERROR' ? console.error : console.log)(`[${level}] ${msg}`, err || '');
}

module.exports = {
  info: (m) => write('INFO', m),
  warn: (m, e) => write('WARN', m, e),
  error: (m, e) => write('ERROR', m, e),
  dir: () => path.dirname(target()),
};
