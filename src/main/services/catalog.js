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
  { id: 'games', name: 'Oyun Platformları' },
  { id: 'media', name: 'Medya & Müzik' },
  { id: 'imaging', name: 'Görsel & Tasarım' },
  { id: 'office', name: 'Ofis & Belgeler' },
  { id: 'security', name: 'Güvenlik & Şifre' },
  { id: 'cloud', name: 'Bulut Depolama' },
  { id: 'system', name: 'Sistem & Donanım' },
  { id: 'tools', name: 'Araçlar' },
  { id: 'custom', name: 'Benim Programlarım' },
];

// [anahtar, ad, kategori, wingetId, renk, açıklama, önerilen]
const RAW = [
  ['vcredist', 'Visual C++ Redist', 'essentials', 'Microsoft.VCRedist.2015+.x64', '#6d5bd0', 'Oyun ve programların çoğu için gerekli', true],
  ['directx', 'DirectX Runtime', 'essentials', 'Microsoft.DirectX', '#2f2f2f', 'Eski oyunlar için DirectX bileşenleri', true],
  ['dotnet', '.NET Desktop Runtime 10', 'essentials', 'Microsoft.DotNet.DesktopRuntime.10', '#512bd4', '.NET masaüstü uygulamaları için', true],
  ['7zip', '7-Zip', 'essentials', '7zip.7zip', '#1d1d1d', 'Arşiv aç / sıkıştır', true],
  ['vcredist86', 'Visual C++ Redist (x86)', 'essentials', 'Microsoft.VCRedist.2015+.x86', '#6d5bd0', '32-bit oyun ve programlar için', true],
  ['vcredist2013', 'Visual C++ 2013', 'essentials', 'Microsoft.VCRedist.2013.x64', '#6d5bd0', 'Eski oyunların istediği çalışma zamanı', false],
  ['dotnet8', '.NET Desktop Runtime 8', 'essentials', 'Microsoft.DotNet.DesktopRuntime.8', '#512bd4', 'Birçok aracın istediği .NET 8', false],
  ['java', 'Java 8 (JRE)', 'essentials', 'Oracle.JavaRuntimeEnvironment', '#e76f00', 'Java programları ve Minecraft modları için', false],
  ['xna', 'XNA Framework', 'essentials', 'Microsoft.XNARedist', '#107c10', 'Eski XNA oyunları (Terraria vb.)', false],
  ['winrar', 'WinRAR', 'essentials', 'RARLab.WinRAR', '#7d2b8b', 'RAR arşivleri', false],
  ['nanazip', 'NanaZip', 'essentials', 'M2Team.NanaZip', '#2b579a', 'Modern 7-Zip (Windows 11 menüsü)', false],
  ['peazip', 'PeaZip', 'essentials', 'Giorgiotani.Peazip', '#3aa335', 'Açık kaynak arşiv yöneticisi', false],

  ['chrome', 'Google Chrome', 'browsers', 'Google.Chrome', '#1a73e8', 'Hızlı web tarayıcısı', true],
  ['firefox', 'Firefox', 'browsers', 'Mozilla.Firefox', '#ff7139', 'Gizlilik odaklı tarayıcı', false],
  ['brave', 'Brave', 'browsers', 'Brave.Brave', '#fb542b', 'Reklam engelleyicili tarayıcı', false],
  ['edge', 'Microsoft Edge', 'browsers', 'Microsoft.Edge', '#0c59a4', 'Windows ile gelen tarayıcı', false],
  ['opera', 'Opera', 'browsers', 'Opera.Opera', '#ff1b2d', 'Ücretsiz VPN\'li tarayıcı', false],
  ['operagx', 'Opera GX', 'browsers', 'Opera.OperaGX', '#ee2950', 'Oyuncular için tarayıcı', false],
  ['vivaldi', 'Vivaldi', 'browsers', 'Vivaldi.Vivaldi', '#ef3939', 'Özelleştirilebilir tarayıcı', false],
  ['librewolf', 'LibreWolf', 'browsers', 'LibreWolf.LibreWolf', '#00acff', 'Gizlilik odaklı Firefox', false],
  ['arc', 'Arc', 'browsers', 'TheBrowserCompany.Arc', '#fcbfbd', 'Sekmesiz modern tarayıcı', false],
  ['zen', 'Zen Browser', 'browsers', 'Zen-Team.Zen-Browser', '#f76f53', 'Sakin, sade tarayıcı', false],

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
  ['vs2022', 'Visual Studio 2022', 'devplus', 'Microsoft.VisualStudio.2022.Community', '#5c2d91', 'C#, C++ ve oyun geliştirme IDE\'si', false],
  ['sublime', 'Sublime Text', 'devplus', 'SublimeHQ.SublimeText.4', '#ff9800', 'Hızlı metin editörü', false],
  ['androidstudio', 'Android Studio', 'devplus', 'Google.AndroidStudio', '#3ddc84', 'Android uygulama geliştirme', false],
  ['unityhub', 'Unity Hub', 'devplus', 'Unity.UnityHub', '#222c37', 'Unity oyun motoru', false],
  ['winmerge', 'WinMerge', 'devplus', 'WinMerge.WinMerge', '#ffc600', 'Dosya / klasör karşılaştırma', false],

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
  ['whatsapp', 'WhatsApp', 'comm', '9NKSQGP7F2NH', '#25d366', 'Masaüstü WhatsApp (Microsoft Store)', false],
  ['signal', 'Signal', 'comm', 'OpenWhisperSystems.Signal', '#3a76f0', 'Uçtan uca şifreli mesajlaşma', false],
  ['viber', 'Viber', 'comm', 'Rakuten.Viber', '#7360f2', 'Mesajlaşma ve arama', false],
  ['thunderbird', 'Thunderbird', 'comm', 'Mozilla.Thunderbird', '#0a84ff', 'E-posta istemcisi', false],

  ['spotify', 'Spotify', 'media', 'Spotify.Spotify', '#1db954', 'Müzik', true],
  ['vlc', 'VLC', 'media', 'VideoLAN.VLC', '#ff8800', 'Medya oynatıcı', true],
  ['obs', 'OBS Studio', 'media', 'OBSProject.OBSStudio', '#302e31', 'Yayın / kayıt', false],
  ['itunes', 'iTunes', 'media', 'Apple.iTunes', '#fb5c74', 'Apple müzik ve iPhone yedekleme', false],
  ['aimp', 'AIMP', 'media', 'AIMP.AIMP', '#f9a03f', 'Hafif müzik çalar', false],
  ['foobar', 'foobar2000', 'media', 'PeterPawlowski.foobar2000', '#333333', 'Gelişmiş müzik çalar', false],
  ['audacity', 'Audacity', 'media', 'Audacity.Audacity', '#0000cc', 'Ses kaydı ve düzenleme', false],
  ['klite', 'K-Lite Codec Pack', 'media', 'CodecGuide.K-LiteCodecPack.Standard', '#3e7cbf', 'Tüm video formatları için codec', false],
  ['handbrake', 'HandBrake', 'media', 'HandBrake.HandBrake', '#c2272d', 'Video dönüştürücü', false],
  ['mpchc', 'MPC-HC', 'media', 'clsid2.mpc-hc', '#4a4a4a', 'Hafif video oynatıcı', false],
  ['potplayer', 'PotPlayer', 'media', 'Daum.PotPlayer', '#f5c400', 'Gelişmiş video oynatıcı', false],
  ['plex', 'Plex', 'media', 'Plex.Plex', '#ebaf00', 'Kişisel medya sunucusu istemcisi', false],
  ['stremio', 'Stremio', 'media', 'Stremio.Stremio', '#8a5aab', 'Film ve dizi merkezi', false],

  ['steam', 'Steam', 'games', 'Valve.Steam', '#1b2838', 'Oyun platformu', true],
  ['epic', 'Epic Games Launcher', 'games', 'EpicGames.EpicGamesLauncher', '#313131', 'Epic Games Store, Fortnite, ücretsiz oyunlar', true],
  ['rockstar', 'Rockstar Games Launcher', 'games', 'RockstarGames.Launcher', '#fcaf17', 'GTA V, RDR2 ve Social Club hesabı', false],
  ['eaapp', 'EA app', 'games', 'ElectronicArts.EADesktop', '#ff4747', 'EA oyunları (eski Origin)', false],
  ['ubisoft', 'Ubisoft Connect', 'games', 'Ubisoft.Connect', '#0070ff', 'Ubisoft oyunları', false],
  ['gog', 'GOG GALAXY', 'games', 'GOG.Galaxy', '#86328a', 'DRM\'siz oyunlar, tüm kütüphaneler tek yerde', false],
  ['battlenet', 'Battle.net', 'games', 'Blizzard.BattleNet', '#148eff', 'Blizzard ve Activision oyunları', false],
  ['riotlol', 'League of Legends', 'games', 'RiotGames.LeagueOfLegends.EUW', '#c89b3c', 'Riot istemcisiyle (Avrupa Batı sunucusu)', false],
  ['valorant', 'VALORANT', 'games', 'RiotGames.Valorant.EU', '#ff4655', 'Riot istemcisiyle (Avrupa sunucusu)', false],
  ['playnite', 'Playnite', 'games', 'Playnite.Playnite', '#5c2d91', 'Tüm oyun kütüphanelerini birleştirir', false],
  ['curseforge', 'CurseForge', 'games', 'Overwolf.CurseForge', '#f16436', 'Minecraft ve oyun modları', false],
  ['afterburner', 'MSI Afterburner', 'games', 'Guru3D.Afterburner', '#ff0000', 'FPS göstergesi, ekran kartı ayarı', false],
  ['rtss', 'RivaTuner Statistics Server', 'games', 'Guru3D.RTSS', '#8a1c1c', 'FPS sınırlama ve ekran üstü bilgi', false],
  ['medal', 'Medal', 'games', 'MedalB.V.Medal', '#ffb800', 'Oyun klipleri kaydet ve paylaş', false],
  ['parsec', 'Parsec', 'games', 'Parsec.Parsec', '#000000', 'Uzaktan oyun ve masaüstü', false],
  ['moonlight', 'Moonlight', 'games', 'MoonlightGameStreamingProject.Moonlight', '#3b3b3b', 'Bilgisayardan oyun yayını', false],

  ['krita', 'Krita', 'imaging', 'KDE.Krita', '#3bacd9', 'Dijital çizim', false],
  ['blender', 'Blender', 'imaging', 'BlenderFoundation.Blender', '#e87d0d', '3B modelleme ve animasyon', false],
  ['paintnet', 'Paint.NET', 'imaging', 'dotPDN.PaintDotNet', '#2b6cb0', 'Kolay resim düzenleme', false],
  ['gimp', 'GIMP', 'imaging', 'GIMP.GIMP.3', '#5c5543', 'Ücretsiz fotoğraf düzenleme', false],
  ['inkscape', 'Inkscape', 'imaging', 'Inkscape.Inkscape', '#000000', 'Vektör çizim', false],
  ['irfanview', 'IrfanView', 'imaging', 'IrfanSkiljan.IrfanView', '#c62828', 'Hızlı resim görüntüleyici', false],
  ['xnview', 'XnView MP', 'imaging', 'XnSoft.XnViewMP', '#1565c0', 'Resim görüntüleyici ve dönüştürücü', false],
  ['sharex', 'ShareX', 'imaging', 'ShareX.ShareX', '#2885f1', 'Ekran görüntüsü ve kayıt', false],
  ['greenshot', 'Greenshot', 'imaging', 'Greenshot.Greenshot', '#4caf50', 'Hafif ekran görüntüsü aracı', false],

  ['libreoffice', 'LibreOffice', 'office', 'TheDocumentFoundation.LibreOffice', '#18a303', 'Ücretsiz ofis paketi', false],
  ['onlyoffice', 'ONLYOFFICE', 'office', 'ONLYOFFICE.DesktopEditors', '#444444', 'Word/Excel uyumlu ofis', false],
  ['acrobat', 'Adobe Acrobat Reader', 'office', 'Adobe.Acrobat.Reader.64-bit', '#ec1c24', 'PDF okuyucu', false],
  ['foxit', 'Foxit PDF Reader', 'office', 'Foxit.FoxitReader', '#ee3f24', 'Hafif PDF okuyucu', false],
  ['sumatra', 'SumatraPDF', 'office', 'SumatraPDF.SumatraPDF', '#ffd400', 'Çok hafif PDF / e-kitap okuyucu', false],
  ['obsidian', 'Obsidian', 'office', 'Obsidian.Obsidian', '#7c3aed', 'Markdown not defteri', false],

  ['malwarebytes', 'Malwarebytes', 'security', 'Malwarebytes.Malwarebytes', '#0d3ecc', 'Kötü amaçlı yazılım taraması', false],
  ['bitwarden', 'Bitwarden', 'security', 'Bitwarden.Bitwarden', '#175ddc', 'Şifre yöneticisi', false],
  ['keepassxc', 'KeePassXC', 'security', 'KeePassXCTeam.KeePassXC', '#6cac4d', 'Çevrimdışı şifre yöneticisi', false],
  ['keepass', 'KeePass', 'security', 'DominikReichl.KeePass', '#3a6eb5', 'Klasik şifre yöneticisi', false],
  ['protonvpn', 'Proton VPN', 'security', 'Proton.ProtonVPN', '#6d4aff', 'Ücretsiz, kayıt tutmayan VPN', false],

  ['gdrive', 'Google Drive', 'cloud', 'Google.GoogleDrive', '#1fa463', 'Dosyaları Drive ile eşitle', false],
  ['dropbox', 'Dropbox', 'cloud', 'Dropbox.Dropbox', '#0061ff', 'Bulut depolama', false],
  ['onedrive', 'OneDrive', 'cloud', 'Microsoft.OneDrive', '#0078d4', 'Microsoft bulut depolama', false],
  ['mega', 'MEGA', 'cloud', 'Mega.MEGASync', '#d9272e', 'Şifreli bulut depolama', false],

  ['cpuz', 'CPU-Z', 'system', 'CPUID.CPU-Z', '#4b6ea8', 'İşlemci, RAM ve anakart bilgisi', false],
  ['gpuz', 'GPU-Z', 'system', 'TechPowerUp.GPU-Z', '#c62828', 'Ekran kartı bilgisi', false],
  ['hwinfo', 'HWiNFO', 'system', 'REALiX.HWiNFO', '#2f6db5', 'Sıcaklık ve tüm sensörler', false],
  ['crystaldiskinfo', 'CrystalDiskInfo', 'system', 'CrystalDewWorld.CrystalDiskInfo', '#2a9df4', 'Disk sağlığı', false],
  ['crystaldiskmark', 'CrystalDiskMark', 'system', 'CrystalDewWorld.CrystalDiskMark', '#3fa34d', 'Disk hız testi', false],
  ['procexp', 'Process Explorer', 'system', 'Microsoft.Sysinternals.ProcessExplorer', '#0078d4', 'Gelişmiş görev yöneticisi', false],
  ['rufus', 'Rufus', 'system', 'Rufus.Rufus', '#2e7d32', 'Önyüklenebilir USB oluştur', false],
  ['ventoy', 'Ventoy', 'system', 'Ventoy.Ventoy', '#e53935', 'Tek USB\'de çok ISO', false],
  ['logioptions', 'Logi Options+', 'system', 'Logitech.OptionsPlus', '#00b8fc', 'Logitech fare ve klavye ayarları', false],

  ['notion', 'Notion', 'tools', 'Notion.Notion', '#191919', 'Not ve proje yönetimi', false],
  ['figma', 'Figma', 'tools', 'Figma.Figma', '#a259ff', 'Arayüz tasarımı', false],
  ['powertoys', 'PowerToys', 'tools', 'Microsoft.PowerToys', '#0078d4', 'Windows güç araçları', true],
  ['npp', 'Notepad++', 'tools', 'Notepad++.Notepad++', '#90e59a', 'Hafif metin editörü', false],
  ['qbit', 'qBittorrent', 'tools', 'qBittorrent.qBittorrent', '#2f67ba', 'Torrent istemcisi', false],
  ['winscp', 'WinSCP', 'tools', 'WinSCP.WinSCP', '#2a6ab4', 'SFTP / FTP istemcisi', false],
  ['putty', 'PuTTY', 'tools', 'PuTTY.PuTTY', '#3b3b98', 'SSH istemcisi', false],
  ['everything', 'Everything', 'tools', 'voidtools.Everything', '#ff8c00', 'Anında dosya arama', true],
  ['teamviewer', 'TeamViewer', 'tools', 'TeamViewer.TeamViewer', '#0e8ee9', 'Uzak masaüstü', false],
  ['anydesk', 'AnyDesk', 'tools', 'AnyDesk.AnyDesk', '#ef443b', 'Uzak masaüstü', false],
  ['windirstat', 'WinDirStat', 'tools', 'WinDirStat.WinDirStat', '#4caf50', 'Diskte yer kaplayanları gör', false],
  ['wiztree', 'WizTree', 'tools', 'AntibodySoftware.WizTree', '#2e7d32', 'Çok hızlı disk analizi', false],
  ['revo', 'Revo Uninstaller', 'tools', 'RevoUninstaller.RevoUninstaller', '#e53935', 'Programları iz bırakmadan kaldır', false],
  ['teracopy', 'TeraCopy', 'tools', 'CodeSector.TeraCopy', '#2b5797', 'Hızlı ve doğrulamalı kopyalama', false],
  ['imgburn', 'ImgBurn', 'tools', 'LIGHTNINGUK.ImgBurn', '#ff6f00', 'CD/DVD yazma', false],
  ['autohotkey', 'AutoHotkey', 'tools', 'AutoHotkey.AutoHotkey', '#334455', 'Klavye kısayolu ve otomasyon', false],
  ['flowlauncher', 'Flow Launcher', 'tools', 'Flow-Launcher.Flow-Launcher', '#1f6feb', 'Hızlı başlatıcı (Alt+Space)', false],
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

Object.assign(DETECT, {
  vcredist86: { match: /^Microsoft Visual C\+\+ 20(15|17|19|22).*(x86|\(x86\))/i },
  vcredist2013: { match: /^Microsoft Visual C\+\+ 2013.*x64/i },
  dotnet8: { match: /^Microsoft Windows Desktop Runtime - 8\./i },
  java: { match: /^Java( 8)? Update|^Java 8/i },
  xna: { match: /^Microsoft XNA Framework/i },
  winrar: { match: /^WinRAR/i }, nanazip: { match: /^NanaZip/i }, peazip: { match: /^PeaZip/i },
  edge: { match: /^Microsoft Edge$/i }, opera: { match: /^Opera Stable/i }, operagx: { match: /^Opera GX/i },
  vivaldi: { match: /^Vivaldi/i }, librewolf: { match: /^LibreWolf/i }, arc: { match: /^Arc$/i }, zen: { match: /^Zen Browser/i },
  vs2022: { match: /^Visual Studio Community 2022/i }, sublime: { match: /^Sublime Text/i }, androidstudio: { match: /^Android Studio/i },
  unityhub: { match: /^Unity Hub/i }, winmerge: { match: /^WinMerge/i },
  whatsapp: { match: /^WhatsApp/i }, signal: { match: /^Signal/i }, viber: { match: /^Viber/i }, thunderbird: { match: /^Mozilla Thunderbird/i },
  itunes: { match: /^iTunes$/i }, aimp: { match: /^AIMP/i }, foobar: { match: /^foobar2000/i }, audacity: { match: /^Audacity/i },
  klite: { match: /^K-Lite Codec Pack/i }, handbrake: { match: /^HandBrake/i }, mpchc: { match: /^MPC-HC/i }, potplayer: { match: /^PotPlayer/i },
  plex: { match: /^Plex$/i }, stremio: { match: /^Stremio/i },
  epic: { match: /^Epic Games Launcher/i }, rockstar: { match: /^Rockstar Games Launcher/i }, eaapp: { match: /^EA app/i },
  ubisoft: { match: /^Ubisoft Connect/i }, gog: { match: /^GOG GALAXY/i }, battlenet: { match: /^Battle\.net/i },
  riotlol: { match: /^League of Legends/i }, valorant: { match: /^VALORANT/i }, playnite: { match: /^Playnite/i },
  curseforge: { match: /^CurseForge/i }, afterburner: { match: /^MSI Afterburner/i }, rtss: { match: /^RivaTuner Statistics Server/i },
  medal: { match: /^Medal/i }, parsec: { match: /^Parsec/i }, moonlight: { match: /^Moonlight/i },
  krita: { match: /^Krita/i }, blender: { match: /^Blender/i }, paintnet: { match: /^paint\.net/i }, gimp: { family: 'GIMP.GIMP', match: /^GIMP/i },
  inkscape: { match: /^Inkscape/i }, irfanview: { match: /^IrfanView/i }, xnview: { match: /^XnView MP/i }, sharex: { match: /^ShareX/i }, greenshot: { match: /^Greenshot/i },
  libreoffice: { match: /^LibreOffice/i }, onlyoffice: { match: /^ONLYOFFICE/i }, acrobat: { match: /^Adobe Acrobat/i }, foxit: { match: /^Foxit PDF Reader/i },
  sumatra: { match: /^SumatraPDF/i }, obsidian: { match: /^Obsidian/i },
  malwarebytes: { match: /^Malwarebytes/i }, bitwarden: { match: /^Bitwarden/i }, keepassxc: { match: /^KeePassXC/i }, keepass: { match: /^KeePass Password Safe/i }, protonvpn: { match: /^Proton VPN/i },
  gdrive: { match: /^Google Drive/i }, dropbox: { match: /^Dropbox/i }, onedrive: { match: /^Microsoft OneDrive/i }, mega: { match: /^MEGAsync/i },
  cpuz: { match: /^CPUID CPU-Z/i }, gpuz: { match: /^TechPowerUp GPU-Z/i, files: ['%ProgramFiles(x86)%/GPU-Z/GPU-Z.exe'] }, hwinfo: { match: /^HWiNFO/i },
  crystaldiskinfo: { match: /^CrystalDiskInfo/i }, crystaldiskmark: { match: /^CrystalDiskMark/i }, logioptions: { match: /^Logi Options\+/i },
  everything: { match: /^Everything/i }, teamviewer: { match: /^TeamViewer/i }, anydesk: { match: /^AnyDesk/i }, windirstat: { match: /^WinDirStat/i },
  wiztree: { match: /^WizTree/i }, revo: { match: /^Revo Uninstaller/i }, teracopy: { match: /^TeraCopy/i }, imgburn: { match: /^ImgBurn/i },
  autohotkey: { match: /^AutoHotkey/i }, flowlauncher: { match: /^Flow Launcher/i },
});
// Microsoft Store'dan kurulan (winget'te yalnızca msstore kaynağında olan) uygulamalar
const STORE = new Set(['whatsapp']);

// winget dışındaki kaynaklar (resmi kurulum yöntemleri)
const NPM = { vercel: { npmPkg: 'vercel', verify: 'vercel --version', files: ['%APPDATA%/npm/vercel.cmd'] } };
DETECT.pnpm = { match: /^pnpm/i, verify: 'pnpm --version' };
DETECT.bun = { match: /^Bun/i, verify: 'bun --version' };
DETECT.rust = { match: /^Rustup/i, verify: 'rustup --version' };

const BUILTIN = RAW.map(([key, name, category, wingetId, color, desc, recommended]) => ({
  key, name, category, color, desc, recommended,
  ...(NPM[key] ? { source: 'npm', ...NPM[key] } : { source: 'winget', wingetId, ...(STORE.has(key) ? { wingetSource: 'msstore' } : {}) }),
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
  { id: 'essentials', name: 'Temel Paket', desc: 'Formattan sonra herkes için: tarayıcı, arşiv, çalışma zamanları, medya', keys: ['vcredist', 'vcredist86', 'dotnet', '7zip', 'chrome', 'vlc', 'powertoys', 'everything'] },
  { id: 'gamer', name: 'Oyuncu Paketi', desc: 'Oyun platformları ve oyun için gerekenler: çalışma zamanları, Discord, FPS aracı', keys: ['vcredist', 'vcredist86', 'directx', 'dotnet', 'steam', 'epic', 'rockstar', 'eaapp', 'ubisoft', 'discord', 'afterburner'] },
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
