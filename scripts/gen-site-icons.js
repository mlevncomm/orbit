// Marka logosu (Simple Icons) olmayan katalog programlarının simgelerini RESMİ kaynaklarından toplar:
//   page: ürünün resmi sayfası → <link rel="icon|apple-touch-icon"> içinden en büyüğü
//   gh:   açık kaynak programın resmi GitHub deposu → depodaki uygulama simgesi
//   url:  resmi sitedeki doğrudan simge adresi
// Simgeler 96 px PNG'ye (SVG ise olduğu gibi) çevrilip src/renderer/site-icons.js'e gömülür;
// uygulama çalışırken internete çıkmaz. Ayrıca gözle kontrol için bir kontrol sayfası üretir.
// Kullanım: npx electron scripts/gen-site-icons.js [anahtar...]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { app, nativeImage, BrowserWindow } = require('electron');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MS = { page: 'https://www.microsoft.com/' };
const SOURCES = {
  // Microsoft çalışma zamanları: kendine ait simgesi yok → Microsoft
  vcredist: MS, vcredist86: MS, vcredist2013: MS, directx: MS, xna: MS, procexp: { page: 'https://learn.microsoft.com/sysinternals/' }, ssms: { page: 'https://learn.microsoft.com/sql/ssms/' },
  edge: { page: 'https://www.microsoftedgeinsider.com/' },
  vscode: { page: 'https://code.visualstudio.com/' },
  vs2022: { url: 'https://visualstudio.microsoft.com/wp-content/uploads/2019/02/BrandVisualStudioWin2019-2.svg' },
  vsbuild: { url: 'https://visualstudio.microsoft.com/wp-content/uploads/2019/02/BrandVisualStudioWin2019-2.svg' },
  onedrive: { page: 'https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage' },
  teams: { url: 'https://tflteams.public.onecdn.static.microsoft/evergreen-assets/icons/microsoft_teams_logo_refresh_v2025.ico' },
  wterminal: { gh: 'microsoft/terminal', want: /res\/terminal\/images\/.*(Square44x44Logo|StoreLogo).*\.png$|res\/terminal\.ico$/i },
  pwsh: { gh: 'PowerShell/PowerShell', want: /assets\/.*(Powershell_av_colors\.ico|ps_black_.*\.svg|Powershell.*\.png)$/i },
  powertoys: { url: 'https://raw.githubusercontent.com/microsoft/PowerToys/HEAD/src/runner/svgs/icon.ico' },
  flowlauncher: { gh: 'Flow-Launcher/Flow.Launcher', want: /(Images\/app\.png|app\.ico|logo.*\.png)$/i },
  mpchc: { url: 'https://raw.githubusercontent.com/clsid2/mpc-hc/HEAD/src/mpc-hc/res/icon.ico' },
  nanazip: { gh: 'M2Team/NanaZip', want: /(NanaZip.*\.ico|Assets\/.*Logo.*\.png|NanaZip\.png)$/i },
  nvm: { gh: 'coreybutler/nvm-windows', want: /(nvm\.ico|icon\.ico|logo.*\.png)$/i },
  mpchc_: null,
  acrobat: { page: 'https://get.adobe.com/reader/' },
  aimp: { page: 'https://www.aimp.ru/' },
  cpuz: { page: 'https://www.cpuid.com/softwares/cpu-z.html' },
  crystaldiskinfo: { page: 'https://crystalmark.info/en/software/crystaldiskinfo/' },
  crystaldiskmark: { page: 'https://crystalmark.info/en/software/crystaldiskmark/' },
  everything: { page: 'https://www.voidtools.com/' },
  foxit: { page: 'https://www.foxit.com/pdf-reader/' },
  gcc: { url: 'https://www.gigabyte.com/favicon.ico' },
  ghub: { page: 'https://www.logitechg.com/en-us/innovation/g-hub.html' },
  logioptions: { page: 'https://www.logitech.com/software/logi-options-plus.html' },
  gpuz: { page: 'https://www.techpowerup.com/gpuz/' },
  rtss: { page: 'https://www.guru3d.com/' },
  greenshot: { page: 'https://getgreenshot.org/' },
  handbrake: { page: 'https://handbrake.fr/' },
  hwinfo: { page: 'https://www.hwinfo.com/' },
  imgburn: { page: 'https://www.imgburn.com/' },
  irfanview: { page: 'https://www.irfanview.com/' },
  keepass: { page: 'https://keepass.info/' },
  klite: { page: 'https://codecguide.com/' },
  lmstudio: { page: 'https://lmstudio.ai/' },
  medal: { page: 'https://medal.tv/' },
  moonlight: { page: 'https://moonlight-stream.org/' },
  openrgb: { url: 'https://gitlab.com/CalcProgrammer1/OpenRGB/-/raw/master/qt/OpenRGB.ico' },
  paintnet: { page: 'https://getpaint.net/' },
  parsec: { page: 'https://parsec.app/' },
  peazip: { page: 'https://peazip.github.io/' },
  playnite: { page: 'https://playnite.link/' },
  potplayer: { page: 'https://potplayer.tv/' },
  putty: { page: 'https://www.chiark.greenend.org.uk/~sgtatham/putty/' },
  revo: { page: 'https://www.revouninstaller.com/' },
  rufus: { page: 'https://rufus.ie/' },
  signalrgb: { page: 'https://www.signalrgb.com/' },
  slack: { page: 'https://slack.com/' },
  sumatra: { page: 'https://www.sumatrapdfreader.org/' },
  teracopy: { page: 'https://codesector.com/teracopy' },
  ventoy: { page: 'https://www.ventoy.net/' },
  windirstat: { page: 'https://windirstat.net/' },
  winmerge: { page: 'https://winmerge.org/' },
  winrar: { page: 'https://www.win-rar.com/' },
  winscp: { page: 'https://winscp.net/' },
  wiztree: { page: 'https://diskanalyzer.com/' },
  xnview: { page: 'https://www.xnview.com/en/xnviewmp/' },
};
delete SOURCES.mpchc_;

const OUT = path.join(__dirname, '..', 'src', 'renderer', 'site-icons.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-icons-'));

async function get(url, binary) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', accept: binary ? '*/*' : 'text/html,application/xhtml+xml,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return binary ? { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || '' } : r.text();
  } catch (e) {
    // Bazı siteler Node'un TLS parmak izini engelliyor; Windows'un curl'ü ile bir kez daha dene
    let buf;
    try { buf = execFileSync('curl.exe', ['-sSLf', '--max-time', '20', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url], { maxBuffer: 32 * 1024 * 1024 }); } catch { throw e; }
    return binary ? { buf, type: '' } : buf.toString('utf8');
  }
}

/** Sayfadaki simge bağlantıları, puanıyla (büyük olan iyi; SVG en iyi) */
function pageCandidates(html, base) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attr = (n) => (tag.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || '';
    const rel = attr('rel').toLowerCase();
    if (!/icon/.test(rel) || /mask-icon/.test(rel)) continue;
    const href = attr('href');
    if (!href || href.startsWith('data:')) continue;
    const sizes = attr('sizes').split(/\s+/).map((s) => +s.split('x')[0] || 0);
    const isSvg = /\.svg(\?|$)/i.test(href) || /svg/i.test(attr('type'));
    const score = isSvg ? 1000 : Math.max(...sizes, /apple-touch/.test(rel) ? 180 : 32);
    try { out.push({ url: new URL(href, base).href, score }); } catch {}
  }
  const origin = new URL(base).origin;
  out.push({ url: origin + '/apple-touch-icon.png', score: 170 }, { url: origin + '/favicon.ico', score: 16 });
  return out.sort((a, b) => b.score - a.score);
}

function ghCandidates(repo, want) {
  const tree = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/git/trees/HEAD?recursive=1`], { maxBuffer: 64 * 1024 * 1024 }).toString()).tree;
  return tree.filter((t) => t.type === 'blob' && want.test(t.path) && !/test|sample|doc\/|\.github/i.test(t.path))
    .map((t) => ({ url: `https://raw.githubusercontent.com/${repo}/HEAD/${t.path}`, score: (/\.svg$/i.test(t.path) ? 1000 : 0) + t.size / 1000 }))
    .sort((a, b) => b.score - a.score).slice(0, 6);
}

/** İndirilen simgeyi veri adresine çevirir; çok küçük / bozuksa null */
function toDataUrl(buf, url, type) {
  if (/\.svg(\?|$)/i.test(url) || /svg/.test(type) || /^\s*<svg|<\?xml/.test(buf.slice(0, 200).toString())) {
    const s = buf.toString('utf8');
    if (!/<svg[\s>]/i.test(s) || /<script/i.test(s) || s.length > 150000) return null;
    return { url: 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64'), size: 'svg' };
  }
  // Türü dosyanın kendi başlık baytlarından belirle (".ico" adlı PNG'ler var: Logitech)
  const head = buf.slice(0, 4).toString('hex');
  const ext = head === '89504e47' ? '.png' : head.startsWith('ffd8') ? '.jpg' : head === '00000100' ? '.ico' : /\.ico(\?|$)/i.test(url) ? '.ico' : '.png';
  const f = path.join(TMP, Math.random().toString(36).slice(2) + ext);
  fs.writeFileSync(f, buf);
  let img = nativeImage.createFromPath(f);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  if (width < 16) return null;
  if (width > 96) img = img.resize({ width: 96, height: Math.round((96 * height) / width), quality: 'best' });
  return { url: img.toDataURL(), size: `${width}x${height}` };
}

async function iconFor(key, src) {
  const tried = [];
  let cands = [];
  if (src.gh) cands = ghCandidates(src.gh, src.want);
  else if (src.url) cands = [{ url: src.url, score: 0 }];
  else cands = pageCandidates(await get(src.page), src.page);
  for (const c of cands.slice(0, 8)) {
    try {
      const { buf, type } = await get(c.url, true);
      const d = toDataUrl(buf, c.url, type);
      if (d) return { ...d, from: c.url };
      tried.push(c.url + ' (okunamadı)');
    } catch (e) { tried.push(c.url + ' (' + e.message + ')'); }
  }
  throw new Error('simge bulunamadı: ' + tried.slice(0, 3).join(' | '));
}

app.whenReady().then(async () => {
  const only = process.argv.slice(2).filter((a) => SOURCES[a]);
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8').match(/=\s*(\{[\s\S]*\});/)[1]) : {};
  const out = only.length ? { ...prev } : {};
  const report = [];
  for (const [key, src] of Object.entries(SOURCES)) {
    if (only.length && !only.includes(key)) continue;
    try {
      const r = await iconFor(key, src);
      out[key] = r.url;
      report.push(`OK  ${key.padEnd(16)} ${String(r.size).padEnd(9)} ${r.from}`);
    } catch (e) { report.push(`YOK ${key.padEnd(16)} ${e.message}`); }
  }
  fs.writeFileSync(OUT, `// Otomatik üretildi: scripts/gen-site-icons.js — programların resmi sitelerindeki / resmi depolarındaki simgeleri.
// Simgeler ilgili şirketlerin ticari markalarıdır; yalnızca programı tanıtmak için gösterilir.
window.SITE_ICONS = ${JSON.stringify(out)};
`);
  console.log(report.join('\n'));
  console.log(`\n${Object.keys(out).length} simge · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);

  // Gözle kontrol için: açık ve koyu zeminde tüm simgeler
  const keys = Object.keys(out).sort();
  const cell = (k, bg) => `<div style="background:${bg};padding:8px;border-radius:12px;text-align:center;font:11px sans-serif;color:${bg === '#fff' ? '#333' : '#ddd'}"><img src="${out[k]}" style="width:48px;height:48px;object-fit:contain"><br>${k}</div>`;
  const html = `<body style="margin:0;padding:12px;background:#ccc;display:grid;grid-template-columns:repeat(12,1fr);grid-auto-rows:84px;align-content:start;gap:6px">${keys.map((k) => cell(k, '#fff') + cell(k, '#1f1f26')).join('')}</body>`;
  const win = new BrowserWindow({ width: 1500, height: 60 + Math.ceil((keys.length * 2) / 12) * 90, show: false });
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise((r) => setTimeout(r, 800));
  const sheet = process.env.ICON_SHEET || path.join(TMP, 'icons.png');
  fs.writeFileSync(sheet, (await win.capturePage()).toPNG());
  console.log('Kontrol sayfası: ' + sheet);
  app.quit();
});
