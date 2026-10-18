// PowerShell / süreç yardımcıları
const { spawn } = require('child_process');

const PREFIX = "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;";

/** PowerShell betiği çalıştırır. onLine verilirse her satırı canlı iletir. */
function runPS(script, { onLine, timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(PREFIX + script, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
    let out = '', err = '', buf = '';
    let timer = timeoutMs ? setTimeout(() => child.kill(), timeoutMs) : null;
    child.stdout.on('data', (d) => {
      const s = d.toString('utf8');
      out += s;
      if (onLine) {
        buf += s;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        lines.forEach((l) => l.trim() && onLine(l));
      }
    });
    child.stderr.on('data', (d) => (err += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (onLine && buf.trim()) onLine(buf);
      resolve({ code, stdout: out, stderr: err });
    });
  });
}

async function runPSJson(script, opts) {
  const r = await runPS(script, opts);
  const text = r.stdout.trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { throw new Error(r.stderr || text.slice(0, 400)); }
}

/** Kurulumdan sonra PATH değişikliklerini bu sürece yansıtır (node/npm vb. hemen bulunabilsin). */
async function refreshPath() {
  const r = await runPS("[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')");
  const p = r.stdout.trim();
  if (p) process.env.Path = p;
}

/** Genel süreç başlatıcı; stdout/stderr parçalarını \r ve \n ile bölerek iletir (winget ilerleme çubukları için). */
function runProcess(cmd, args, { onChunk, onSpawn, shell = false, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, shell, cwd, env: process.env });
    if (onSpawn) onSpawn(child);
    const handle = (d) => onChunk && d.toString('utf8').split(/[\r\n]+/).forEach((l) => l.trim() && onChunk(l));
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    child.on('error', (e) => resolve({ code: -1, error: e.message }));
    child.on('close', (code) => resolve({ code }));
  });
}

module.exports = { runPS, runPSJson, refreshPath, runProcess };
