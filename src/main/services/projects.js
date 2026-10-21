// Projeler: wexon.dev'in tüm GitHub depoları, canlı siteleri, bilgisayardaki klonları ve Vercel dağıtımları tek yerde.
//
// - GitHub: gh CLI üzerinden (kullanıcının kendi oturumu; Orbit token görmez). gh yoksa herkese açık API.
// - Yerel klonlar: Belgeler\Projeler\<depo>. İşlemler yalnızca listedeki depolar ve bu klasör için yapılır;
//   kullanıcıdan gelen komut / yol çalıştırılmaz.
// - Vercel: kullanıcının girdiği token Windows hesabıyla şifreli saklanır (safeStorage), loglanmaz.
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { app, safeStorage } = require('electron');
const store = require('./store');
const log = require('./log');

const OWNER = () => store.get('settings').githubOwner || 'mlevncomm';
const ROOT = () => path.join(app.getPath('documents'), 'Projeler');
const SAFE_NAME = /^[A-Za-z0-9._-]{1,100}$/;
let cache = null;

const run = (file, args, opts = {}) => new Promise((resolve) => {
  execFile(file, args, { windowsHide: true, timeout: opts.timeout || 60000, maxBuffer: 32 * 1024 * 1024, cwd: opts.cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
    (err, stdout, stderr) => resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: String(stdout || ''), err: String(stderr || err?.message || '') }));
});

/** gh CLI yolu (PATH'te olmayabilir) */
function ghPath() {
  const cands = ['gh', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI', 'gh.exe')];
  return cands.find((c) => c === 'gh' || fs.existsSync(c));
}

async function gh(route) {
  const r = await run(ghPath(), ['api', route, '-H', 'Accept: application/vnd.github+json']);
  if (r.ok) return JSON.parse(r.out);
  // gh yok / oturum yok: herkese açık API (özel depolar görünmez)
  const res = await fetch('https://api.github.com/' + route.replace(/^\//, ''), { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Orbit (wexon.dev)' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
  return res.json();
}

// ---------- Vercel token (şifreli) ----------
function setVercelToken(token) {
  token = String(token || '').trim();
  if (!token) { store.patch('settings', { vercelTokenEnc: null }); return false; }
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(token)) throw new Error('Vercel token biçimi geçersiz');
  const enc = safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(token).toString('base64') : 'raw:' + Buffer.from(token).toString('base64');
  store.patch('settings', { vercelTokenEnc: enc });
  cache = null;
  return true;
}
function vercelToken() {
  const v = store.get('settings').vercelTokenEnc;
  if (!v) return null;
  try {
    const [kind, b64] = [v.slice(0, 4), v.slice(4)];
    return kind === 'enc:' ? safeStorage.decryptString(Buffer.from(b64, 'base64')) : Buffer.from(b64, 'base64').toString();
  } catch { return null; }
}
async function vercel(route) {
  const t = vercelToken();
  if (!t) return null;
  const res = await fetch('https://api.vercel.com' + route, { headers: { authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(20000) });
  if (res.status === 401 || res.status === 403) throw new Error('Vercel token geçersiz ya da yetkisiz');
  if (!res.ok) throw new Error(`Vercel: HTTP ${res.status}`);
  return res.json();
}

// ---------- Yardımcılar ----------
async function liveCheck(url) {
  if (!/^https?:\/\//i.test(url || '')) return null;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Orbit (wexon.dev) durum denetimi' }, signal: AbortSignal.timeout(15000) });
    return { url, status: res.status, ok: res.ok, ms: Date.now() - t0 };
  } catch (e) { return { url, status: 0, ok: false, ms: Date.now() - t0, error: e.name === 'TimeoutError' ? 'zaman aşımı' : 'erişilemedi' }; }
}

async function localState(name) {
  const dir = path.join(ROOT(), name);
  if (!fs.existsSync(path.join(dir, '.git'))) return { cloned: false, dir };
  const st = await run('git', ['-C', dir, 'status', '--porcelain=v1', '-b']);
  if (!st.ok) return { cloned: true, dir, error: 'git çalışmadı' };
  const lines = st.out.split(/\r?\n/).filter(Boolean);
  const head = lines[0] || '';
  const m = head.match(/^## ([^.\s]+)(?:\.\.\.\S+)?(?: \[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\])?/);
  return { cloned: true, dir, branch: m?.[1] || '?', ahead: +(m?.[2] || 0), behind: +(m?.[3] || 0), changes: lines.length - 1 };
}

async function repoDetail(r) {
  const full = `${OWNER()}/${r.name}`;
  const [commits, pulls, runs] = await Promise.all([
    gh(`repos/${full}/commits?per_page=1`).catch(() => []),
    gh(`repos/${full}/pulls?state=open&per_page=50`).catch(() => []),
    gh(`repos/${full}/actions/runs?per_page=1`).catch(() => ({ workflow_runs: [] })),
  ]);
  const c = commits[0];
  const w = runs.workflow_runs?.[0];
  return {
    lastCommit: c ? { sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0].slice(0, 120), author: c.commit.author?.name, at: c.commit.author?.date } : null,
    openPRs: Array.isArray(pulls) ? pulls.length : 0,
    ci: w ? { name: w.name, status: w.status, conclusion: w.conclusion, at: w.updated_at, url: w.html_url } : null,
  };
}

/** Tüm projeler (önbellek 5 dk; force ile yenilenir) */
async function list(force = false) {
  if (cache && !force && Date.now() - cache.at < 5 * 60 * 1000) return cache.data;
  const repos = await gh(`users/${OWNER()}/repos?per_page=100&sort=pushed`).catch(async () => gh(`user/repos?per_page=100&affiliation=owner&sort=pushed`));
  const own = repos.filter((r) => r.owner?.login?.toLowerCase() === OWNER().toLowerCase() && !r.archived);
  // gh oturumuyla özel depolar da gelsin
  let all = own;
  try { const mine = await gh('user/repos?per_page=100&affiliation=owner&sort=pushed'); if (Array.isArray(mine) && mine.length >= own.length) all = mine.filter((r) => !r.archived); } catch {}

  let vprojects = [];
  let vercelError = null;
  if (vercelToken()) {
    try {
      const p = await vercel('/v9/projects?limit=100');
      vprojects = await Promise.all((p.projects || []).map(async (vp) => {
        const d = await vercel(`/v6/deployments?projectId=${vp.id}&limit=1`).catch(() => null);
        const dep = d?.deployments?.[0];
        const prodHost = vp.targets?.production?.alias?.[0] || vp.alias?.[0]?.domain || null;
        return {
          id: vp.id, name: vp.name, framework: vp.framework, repo: vp.link?.repo || null,
          url: prodHost ? 'https://' + prodHost : null,
          deployment: dep ? { state: dep.state || dep.readyState, url: dep.url ? 'https://' + dep.url : null, at: dep.created, target: dep.target } : null,
        };
      }));
    } catch (e) { vercelError = e.message; }
  }

  const data = await Promise.all(all.map(async (r) => {
    const [detail, local] = await Promise.all([repoDetail(r), localState(r.name)]);
    const vp = vprojects.find((v) => v.repo && v.repo.toLowerCase() === r.name.toLowerCase());
    const site = vp?.url || r.homepage || null;
    return {
      name: r.name, fullName: r.full_name, description: r.description || '', private: r.private, language: r.language,
      url: r.html_url, defaultBranch: r.default_branch, pushedAt: r.pushed_at, topics: r.topics || [],
      wexon: (r.topics || []).includes('wexon-dev') || /^wexon\.dev ·/.test(r.description || ''),
      site, live: await liveCheck(site), vercel: vp || null, local, ...detail,
    };
  }));
  // Depoya bağlı olmayan Vercel projeleri
  const orphanVercel = vprojects.filter((v) => !data.some((d) => d.vercel === v));
  cache = { at: Date.now(), data: { projects: data, vercelProjects: orphanVercel, vercelConnected: !!vercelToken(), vercelError, owner: OWNER(), root: ROOT(), scannedAt: Date.now() } };
  log.info(`Projeler: ${data.length} depo, ${vprojects.length} Vercel projesi`);
  return cache.data;
}

function known(name) {
  if (!SAFE_NAME.test(String(name)) || !cache?.data.projects.some((p) => p.name === name)) throw new Error('Bilinmeyen proje');
  return path.join(ROOT(), name);
}

async function clone(name) {
  const dir = known(name);
  if (fs.existsSync(dir)) throw new Error('Bu klasör zaten var: ' + dir);
  fs.mkdirSync(ROOT(), { recursive: true });
  const r = await run(ghPath(), ['repo', 'clone', `${OWNER()}/${name}`, dir], { timeout: 10 * 60 * 1000 });
  if (!r.ok) throw new Error('Klonlanamadı: ' + r.err.slice(0, 200));
  log.info(`Proje klonlandı: ${name} → ${dir}`);
  cache = null;
  return localState(name);
}

async function pull(name) {
  const dir = known(name);
  if (!fs.existsSync(path.join(dir, '.git'))) throw new Error('Proje bu bilgisayarda yok');
  const r = await run('git', ['-C', dir, 'pull', '--ff-only'], { timeout: 5 * 60 * 1000 });
  if (!r.ok) throw new Error(/not possible to fast-forward|diverged/i.test(r.err) ? 'Yerel değişiklikler ve uzak değişiklikler ayrışmış; elle birleştirmen gerekiyor' : 'Güncellenemedi: ' + r.err.slice(0, 200));
  cache = null;
  return { message: r.out.trim().split('\n').pop() || 'Güncel', local: await localState(name) };
}

function openCode(name) {
  const dir = known(name);
  if (!fs.existsSync(dir)) throw new Error('Proje bu bilgisayarda yok');
  // Kabuksuz: Code.exe doğrudan çalıştırılır (yol boşluk içerse de güvenli)
  const exe = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
    path.join(process.env.ProgramFiles || 'C:\Program Files', 'Microsoft VS Code', 'Code.exe'),
  ].find((f) => fs.existsSync(f));
  if (!exe) throw new Error("VS Code bulunamadı (Kurulum › Katalog'dan kurabilirsin)");
  const p = spawn(exe, [dir], { detached: true, stdio: 'ignore' });
  p.on('error', () => {});
  p.unref();
  return true;
}

module.exports = { list, clone, pull, openCode, known, setVercelToken, hasVercel: () => !!vercelToken(), ROOT };
