// Katalogdaki programların marka logolarını Simple Icons'tan (CC0) çıkarıp tek, küçük bir dosyaya yazar.
// Kullanım: node scripts/gen-brand-icons.js   → src/renderer/brand-icons.js
// Yalnızca burada eşlenen markalar gömülür; tüm paket uygulamaya girmez.
const fs = require('fs');
const path = require('path');
const si = require('simple-icons');

// katalog anahtarı → Simple Icons kısa adı
const MAP = {
  chrome: 'googlechrome', firefox: 'firefoxbrowser', brave: 'brave', opera: 'opera', operagx: 'operagx', vivaldi: 'vivaldi',
  librewolf: 'librewolf', arc: 'arc', zen: 'zenbrowser',
  node: 'nodedotjs', git: 'git', claudecode: 'claude', claude: 'claude', python: 'python', ghcli: 'github', ghdesktop: 'github',
  cursor: 'cursor', pnpm: 'pnpm', vercel: 'vercel', yarn: 'yarn', bun: 'bun', docker: 'docker', wsl: 'linux', postman: 'postman',
  insomnia: 'insomnia', dotnet: 'dotnet', dotnet8: 'dotnet', dotnetsdk: 'dotnet', jdk: 'openjdk', java: 'openjdk', go: 'go', rust: 'rust',
  jetbrains: 'jetbrains', ffmpeg: 'ffmpeg', sublime: 'sublimetext', androidstudio: 'androidstudio', unityhub: 'unity',
  postgres: 'postgresql', mysql: 'mysql', mongocompass: 'mongodb', dbeaver: 'dbeaver',
  icue: 'corsair', synapse: 'razer', ssgg: 'steelseries', ollama: 'ollama',
  discord: 'discord', telegram: 'telegram', zoom: 'zoom', whatsapp: 'whatsapp', signal: 'signal', viber: 'viber', thunderbird: 'thunderbird',
  spotify: 'spotify', vlc: 'vlcmediaplayer', obs: 'obsstudio', itunes: 'itunes', foobar: 'foobar2000', audacity: 'audacity',
  plex: 'plex', stremio: 'stremio',
  steam: 'steam', epic: 'epicgames', rockstar: 'rockstargames', eaapp: 'ea', ubisoft: 'ubisoft', gog: 'gogdotcom',
  battlenet: 'battledotnet', riotlol: 'leagueoflegends', valorant: 'valorant', curseforge: 'curseforge', afterburner: 'msi',
  krita: 'krita', blender: 'blender', gimp: 'gimp', inkscape: 'inkscape', sharex: 'sharex',
  libreoffice: 'libreoffice', onlyoffice: 'onlyoffice', obsidian: 'obsidian',
  malwarebytes: 'malwarebytes', bitwarden: 'bitwarden', keepassxc: 'keepassxc', protonvpn: 'protonvpn',
  gdrive: 'googledrive', dropbox: 'dropbox', mega: 'mega',
  notion: 'notion', figma: 'figma', npp: 'notepadplusplus', qbit: 'qbittorrent', teamviewer: 'teamviewer', anydesk: 'anydesk',
  autohotkey: 'autohotkey', '7zip': '7zip',
};

const bySlug = new Map(Object.values(si).map((i) => [i.slug, i]));
const out = {};
const missing = [];
for (const [key, slug] of Object.entries(MAP)) {
  const i = bySlug.get(slug);
  if (!i) { missing.push(`${key}:${slug}`); continue; }
  out[key] = { t: i.title, h: i.hex, p: i.path };
}
const file = path.join(__dirname, '..', 'src', 'renderer', 'brand-icons.js');
fs.writeFileSync(file, `// Otomatik üretildi: scripts/gen-brand-icons.js — Simple Icons ${JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'simple-icons', 'package.json'), 'utf8')).version} (CC0-1.0).
// Marka logoları ilgili şirketlerin ticari markalarıdır; yalnızca programı tanıtmak için gösterilir.
window.BRAND_ICONS = ${JSON.stringify(out)};
`);
console.log(`${Object.keys(out).length} logo yazıldı (${(fs.statSync(file).size / 1024).toFixed(0)} KB)${missing.length ? ' · bulunamayan: ' + missing.join(', ') : ''}`);
