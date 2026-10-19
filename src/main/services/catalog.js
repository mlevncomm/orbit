// Program kataloğu. Tüm winget kimlikleri `winget show --id <id> -e` (çıkış kodu 0) ile doğrulandı.
const inventory = require('./inventory');
const store = require('./store');

const CATEGORIES = [
  { id: 'essentials', name: 'Temel Bileşenler' },
  { id: 'browsers', name: 'Tarayıcılar' },
  { id: 'dev', name: 'Yazılım Geliştirme' },
  { id: 'devplus', name: 'Geliştirme Ekstra' },
  { id: 'db', name: 'Veritabanı' },
  { id: 'rgb', name: 'RGB & Çevre Birimleri' },
  { id: 'ai', name: 'Yapay Zeka' },
  { id: 'comm', name: 'İletişim' },
  { id: 'media', name: 'Medya & Eğlence' },
  { id: 'tools', name: 'Araçlar' },
  { id: 'custom', name: 'Benim Programlarım' },
];

// [anahtar, ad, kategori, wingetId, renk, açıklama, önerilen]
const RAW = [
  ['vcredist', 'Visual C++ Redist', 'essentials', 'Microsoft.VCRedist.2015+.x64', '#6d5bd0', 'Oyun ve programların çoğu için gerekli', true],
  ['directx', 'DirectX Runtime', 'essentials', 'Microsoft.DirectX', '#2f2f2f', 'Eski oyunlar için DirectX bileşenleri', true],
  ['dotnet', '.NET Desktop Runtime 10', 'essentials', 'Microsoft.DotNet.DesktopRuntime.10', '#512bd4', '.NET masaüstü uygulamaları için', true],
  ['7zip', '7-Zip', 'essentials', '7zip.7zip', '#1d1d1d', 'Arşiv aç / sıkıştır', true],

  ['chrome', 'Google Chrome', 'browsers', 'Google.Chrome', '#1a73e8', 'Hızlı web tarayıcısı', true],
  ['firefox', 'Firefox', 'browsers', 'Mozilla.Firefox', '#ff7139', 'Gizlilik odaklı tarayıcı', false],
  ['brave', 'Brave', 'browsers', 'Brave.Brave', '#fb542b', 'Reklam engelleyicili tarayıcı', false],

  ['node', 'Node.js LTS', 'dev', 'OpenJS.NodeJS.LTS', '#3c873a', 'JavaScript çalışma ortamı + npm', true],
  ['vscode', 'Visual Studio Code', 'dev', 'Microsoft.VisualStudioCode', '#007acc', 'Kod editörü', true],
  ['git', 'Git', 'dev', 'Git.Git', '#f05032', 'Sürüm kontrolü', true],
  ['claudecode', 'Claude Code', 'dev', 'Anthropic.ClaudeCode', '#d97757', 'Terminalde yapay zeka kodlama asistanı', true],
  ['python', 'Python 3.14', 'dev', 'Python.Python.3.14', '#3776ab', 'Python dili ve pip', true],
  ['wterminal', 'Windows Terminal', 'dev', 'Microsoft.WindowsTerminal', '#4d4d4d', 'Modern terminal', true],
  ['pwsh', 'PowerShell 7', 'dev', 'Microsoft.PowerShell', '#2671be', 'Güncel PowerShell', true],
  ['ghcli', 'GitHub CLI', 'dev', 'GitHub.cli', '#24292f', 'Terminalden GitHub', true],
  ['ghdesktop', 'GitHub Desktop', 'dev', 'GitHub.GitHubDesktop', '#6e40c9', 'Görsel Git istemcisi', false],
  ['cursor', 'Cursor', 'dev', 'Anysphere.Cursor', '#111111', 'AI destekli kod editörü', false],

  ['pnpm', 'pnpm', 'devplus', 'pnpm.pnpm', '#f69220', 'Hızlı paket yöneticisi', false],
  ['vercel', 'Vercel CLI', 'devplus', null, '#000000', 'Vercel dağıtım aracı (npm -g vercel)', false],
  ['yarn', 'Yarn', 'devplus', 'Yarn.Yarn', '#2c8ebb', 'Paket yöneticisi', false],
  ['bun', 'Bun', 'devplus', 'Oven-sh.Bun', '#f4c6a6', 'Hızlı JS runtime', false],
  ['nvm', 'NVM for Windows', 'devplus', 'CoreyButler.NVMforWindows', '#5b8c3a', 'Node sürüm yöneticisi', false],
  ['docker', 'Docker Desktop', 'devplus', 'Docker.DockerDesktop', '#1d63ed', 'Konteyner platformu', false],
  ['wsl', 'WSL', 'devplus', 'Microsoft.WSL', '#e95420', 'Windows içinde Linux', false],
  ['postman', 'Postman', 'devplus', 'Postman.Postman', '#ff6c37', 'API test aracı', false],
  ['insomnia', 'Insomnia', 'devplus', 'Insomnia.Insomnia', '#4000bf', 'API istemcisi', false],
  ['vsbuild', 'VS Build Tools 2022', 'devplus', 'Microsoft.VisualStudio.2022.BuildTools', '#68217a', 'C++ derleyici (native npm modülleri)', false],
  ['dotnetsdk', '.NET SDK 10', 'devplus', 'Microsoft.DotNet.SDK.10', '#512bd4', 'C# / .NET geliştirme', false],
  ['jdk', 'Java JDK 25 LTS', 'devplus', 'EclipseAdoptium.Temurin.25.JDK', '#e76f00', 'Java geliştirme', false],
  ['go', 'Go', 'devplus', 'GoLang.Go', '#00add8', 'Go dili', false],
  ['rust', 'Rustup', 'devplus', 'Rustlang.Rustup', '#b7410e', 'Rust dili', false],
  ['jetbrains', 'JetBrains Toolbox', 'devplus', 'JetBrains.Toolbox', '#000000', 'IntelliJ, WebStorm…', false],
  ['ffmpeg', 'FFmpeg', 'devplus', 'Gyan.FFmpeg', '#0b8a00', 'Video / ses işleme', false],

  ['postgres', 'PostgreSQL 18', 'db', 'PostgreSQL.PostgreSQL.18', '#336791', 'İlişkisel veritabanı', false],
  ['mysql', 'MySQL', 'db', 'Oracle.MySQL', '#00758f', 'İlişkisel veritabanı', false],
  ['mongocompass', 'MongoDB Compass', 'db', 'MongoDB.Compass.Full', '#13aa52', 'MongoDB arayüzü', false],
  ['dbeaver', 'DBeaver', 'db', 'DBeaver.DBeaver.Community', '#382923', 'Evrensel veritabanı aracı', false],
  ['ssms', 'SQL Server Mgmt Studio', 'db', 'Microsoft.SQLServerManagementStudio', '#a91d22', 'SQL Server yönetimi', false],

  ['openrgb', 'OpenRGB', 'rgb', 'OpenRGB.OpenRGB', '#e0245e', 'Tüm markaların RGB ışıkları (Orbit RGB sayfası bunu kullanır)', true],
  ['signalrgb', 'SignalRGB', 'rgb', 'WhirlwindFX.SignalRgb', '#7c3aed', 'Oyun / müzik senkronlu RGB efektleri', false],
  ['ghub', 'Logitech G HUB', 'rgb', 'Logitech.GHUB', '#00b8fc', 'Logitech fare / klavye / kulaklık', false],
  ['icue', 'Corsair iCUE 5', 'rgb', 'Corsair.iCUE.5', '#ffd400', 'Corsair RAM, fan, klavye, fare', false],
  ['synapse', 'Razer Synapse 4', 'rgb', 'RazerInc.RazerInstaller.Synapse4', '#44d62c', 'Razer çevre birimleri', false],
  ['ssgg', 'SteelSeries GG', 'rgb', 'SteelSeries.GG', '#ff5200', 'SteelSeries çevre birimleri', false],
  ['gcc', 'GIGABYTE Control Center', 'rgb', 'GIGABYTE.ControlCenter', '#f58220', 'Gigabyte anakart, RGB Fusion, BIOS', false],

  ['claude', 'Claude', 'ai', 'Anthropic.Claude', '#d97757', 'Claude masaüstü uygulaması', false],
  ['ollama', 'Ollama', 'ai', 'Ollama.Ollama', '#111111', 'Yerel LLM çalıştırıcı (asistan için)', false],
  ['lmstudio', 'LM Studio', 'ai', 'ElementLabs.LMStudio', '#4f46e5', 'Yerel model arayüzü', false],

  ['discord', 'Discord', 'comm', 'Discord.Discord', '#5865f2', 'Sesli / yazılı sohbet', true],
  ['telegram', 'Telegram', 'comm', 'Telegram.TelegramDesktop', '#29a9eb', 'Mesajlaşma', false],
  ['slack', 'Slack', 'comm', 'SlackTechnologies.Slack', '#4a154b', 'Ekip iletişimi', false],
  ['teams', 'Microsoft Teams', 'comm', 'Microsoft.Teams', '#5059c9', 'Toplantı ve sohbet', false],
  ['zoom', 'Zoom', 'comm', 'Zoom.Zoom', '#2d8cff', 'Görüntülü görüşme', false],

  ['spotify', 'Spotify', 'media', 'Spotify.Spotify', '#1db954', 'Müzik', true],
  ['vlc', 'VLC', 'media', 'VideoLAN.VLC', '#ff8800', 'Medya oynatıcı', true],
  ['obs', 'OBS Studio', 'media', 'OBSProject.OBSStudio', '#302e31', 'Yayın / kayıt', false],
  ['steam', 'Steam', 'media', 'Valve.Steam', '#1b2838', 'Oyun platformu', false],

  ['notion', 'Notion', 'tools', 'Notion.Notion', '#191919', 'Not ve proje yönetimi', false],
  ['figma', 'Figma', 'tools', 'Figma.Figma', '#a259ff', 'Arayüz tasarımı', false],
  ['powertoys', 'PowerToys', 'tools', 'Microsoft.PowerToys', '#0078d4', 'Windows güç araçları', true],
  ['npp', 'Notepad++', 'tools', 'Notepad++.Notepad++', '#90e59a', 'Hafif metin editörü', false],
  ['qbit', 'qBittorrent', 'tools', 'qBittorrent.qBittorrent', '#2f67ba', 'Torrent istemcisi', false],
  ['winscp', 'WinSCP', 'tools', 'WinSCP.WinSCP', '#2a6ab4', 'SFTP / FTP istemcisi', false],
  ['putty', 'PuTTY', 'tools', 'PuTTY.PuTTY', '#3b3b98', 'SSH istemcisi', false],
];

// Kurulu olup olmadığını anlamak için ek kurallar:
//   family: aynı ürünün başka sürüm kimlikleri (ör. OpenJS.NodeJS.22 da "Node.js" sayılır)
//   match : kayıt defterindeki görünen ad (regex)   files: kurulum kaydı bırakmayan araçlar
const DETECT = {
  vcredist: { match: /^Microsoft Visual C\+\+ 20(15|17|19|22).*(x64|\(x64\))/i },
  dotnet: { family: 'Microsoft.DotNet.DesktopRuntime.', match: /^Microsoft Windows Desktop Runtime - (8|9|10)\./i },
  '7zip': { match: /^7-Zip/i, files: ['%ProgramFiles%/7-Zip/7z.exe'] },
  chrome: { match: /^Google Chrome$/i },
  firefox: { family: 'Mozilla.Firefox', match: /^Mozilla Firefox/i },
  brave: { match: /^Brave$/i },
  node: { family: 'OpenJS.NodeJS', match: /^Node\.js/i, verify: 'node --version' },
  vscode: { match: /^Microsoft Visual Studio Code/i, verify: 'code --version' },
  git: { match: /^Git$|^Git version/i, verify: 'git --version' },
  claudecode: { files: ['%USERPROFILE%/.local/bin/claude.exe', '%APPDATA%/npm/claude.cmd', '%LOCALAPPDATA%/Microsoft/WinGet/Links/claude.exe'], verify: 'claude --version' },
  python: { family: 'Python.Python.3', match: /^Python 3\.\d+\.\d+ \(64-bit\)/i, verify: 'py -3 --version' },
  pwsh: { match: /^PowerShell 7/i, verify: 'pwsh --version' },
  ghcli: { match: /^GitHub CLI/i, verify: 'gh --version' },
  ghdesktop: { match: /^GitHub Desktop$/i },
  cursor: { match: /^Cursor/i },
  nvm: { match: /^NVM for Windows/i },
  docker: { match: /^Docker Desktop/i, verify: 'docker --version' },
  postman: { match: /^Postman/i },
  dotnetsdk: { family: 'Microsoft.DotNet.SDK.', match: /^Microsoft \.NET SDK/i, verify: 'dotnet --list-sdks' },
  jdk: { family: 'EclipseAdoptium.Temurin.', match: /^Eclipse Temurin JDK/i },
  go: { match: /^Go Programming Language/i, verify: 'go version' },
  postgres: { family: 'PostgreSQL.PostgreSQL.', match: /^PostgreSQL \d+/i },
  mysql: { match: /^MySQL Server/i },
  openrgb: { match: /^OpenRGB/i, files: ['%ProgramFiles%/OpenRGB/OpenRGB.exe'] },
  signalrgb: { match: /^SignalRGB/i },
  ghub: { match: /^LGHUB|^Logitech G HUB/i },
  icue: { family: 'Corsair.iCUE.', match: /^iCUE|^Corsair iCUE/i },
  gcc: { match: /^GIGABYTE Control Center|^GCC/i },
  claude: { match: /^Claude$/i },
  ollama: { match: /^Ollama/i },
  lmstudio: { match: /^LM Studio/i },
  discord: { match: /^Discord$/i },
  telegram: { match: /^Telegram Desktop/i },
  slack: { match: /^Slack/i },
  teams: { family: 'Microsoft.Teams', match: /^Microsoft Teams/i },
  zoom: { match: /^Zoom/i },
  spotify: { match: /^Spotify$/i },
  vlc: { match: /^VLC media player/i, files: ['%ProgramFiles%/VideoLAN/VLC/vlc.exe'] },
  obs: { match: /^OBS Studio/i },
  steam: { match: /^Steam$/i },
  notion: { match: /^Notion/i },
  figma: { match: /^Figma/i },
  powertoys: { match: /^PowerToys/i },
  npp: { match: /^Notepad\+\+/i },
  qbit: { match: /^qBittorrent/i },
  winscp: { match: /^WinSCP/i },
  putty: { match: /^PuTTY/i },
};

// winget dışındaki kaynaklar (resmi kurulum yöntemleri)
const NPM = { vercel: { npmPkg: 'vercel', verify: 'vercel --version', files: ['%APPDATA%/npm/vercel.cmd'] } };
DETECT.pnpm = { match: /^pnpm/i, verify: 'pnpm --version' };
DETECT.bun = { match: /^Bun/i, verify: 'bun --version' };
DETECT.rust = { match: /^Rustup/i, verify: 'rustup --version' };

const BUILTIN = RAW.map(([key, name, category, wingetId, color, desc, recommended]) => ({
  key, name, category, color, desc, recommended,
  ...(NPM[key] ? { source: 'npm', ...NPM[key] } : { source: 'winget', wingetId }),
  ...(DETECT[key] || {}),
}));

/**
 * Hazır kurulum profilleri. Kurulu olanlar atlanır, eksikler kuyruğa girer.
 * Supabase CLI bilinçli olarak yok: resmi olarak winget paketi ve global npm kurulumu desteklenmiyor
 * (proje içinde `npx supabase` kullanılır).
 */
const PROFILES = [
  {
    id: 'developer', name: 'Developer Setup', desc: 'Yazılım geliştirme ortamı: editör, diller, sürüm kontrolü ve CLI araçları',
    keys: ['chrome', 'git', 'ghcli', 'vscode', 'node', 'pnpm', 'python', 'pwsh', 'wterminal', 'vsbuild', 'dotnetsdk', 'vcredist', 'claudecode', 'docker', 'postman', '7zip', 'spotify', 'vercel'],
  },
  { id: 'essentials', name: 'Temel Paket', desc: 'Formattan sonra herkes için: tarayıcı, arşiv, çalışma zamanları, medya', keys: ['vcredist', 'dotnet', '7zip', 'chrome', 'vlc', 'powertoys'] },
];

/** Katalog + (envanter tarandıysa) her uygulamanın bu bilgisayardaki durumu */
function getCatalog() {
  const custom = (store.get('customApps') || []).map((a) => ({ ...a, category: 'custom', custom: true }));
  const apps = [...BUILTIN, ...custom].map((a) => ({ ...a, status: inventory.statusOf(a) }));
  return { categories: CATEGORIES, apps, profiles: PROFILES, inventory: inventory.summary() };
}

function findByKeys(keys) {
  const all = getCatalog().apps;
  return keys.map((k) => all.find((a) => a.key === k)).filter(Boolean);
}

function addCustom(app) {
  const list = store.get('customApps') || [];
  const key = 'c_' + Date.now().toString(36);
  const item = {
    key,
    name: String(app.name || 'Yeni Program').slice(0, 60),
    desc: String(app.desc || '').slice(0, 120),
    color: app.color || '#111111',
    source: app.source, // winget | url | npm | command
    wingetId: app.wingetId,
    url: app.url,
    args: app.args,
    npmPkg: app.npmPkg,
    command: app.command,
  };
  store.set('customApps', [...list, item]);
  return item;
}

function removeCustom(key) {
  store.set('customApps', (store.get('customApps') || []).filter((a) => a.key !== key));
  store.set('selection', (store.get('selection') || []).filter((k) => k !== key));
}

module.exports = { getCatalog, findByKeys, addCustom, removeCustom };
