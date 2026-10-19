const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Tray, Menu, nativeImage, screen } = require('electron');
// Geliştirme sürümü kurulu Orbit'in ayarlarına ve tek-örnek kilidine dokunmasın
if (!app.isPackaged) app.setPath('userData', app.getPath('userData') + ' Dev');
const log = require('./services/log');
const store = require('./services/store');
const system = require('./services/system');
const catalog = require('./services/catalog');
const drivers = require('./services/drivers');
const installer = require('./services/installer');
const assistant = require('./ai/assistant');
const rgb = require('./services/rgb');
const updater = require('./services/updater');
const inventory = require('./services/inventory');
const { runPS } = require('./services/ps');

process.on('uncaughtException', (e) => log.error('Yakalanmamış hata', e));
process.on('unhandledRejection', (e) => log.error('Yakalanmamış söz reddi', e));

let win, tray;
let quitting = false;
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const startHidden = process.argv.includes('--hidden');
const TASK = 'Orbit (oturum açılışı)';

const OVERLAY = {
  light: { color: '#00000000', symbolColor: '#1b1b1f', height: 44 },
  dark: { color: '#00000000', symbolColor: '#f2f2f5', height: 44 },
};

// ---------- Pencere ----------

function savedBounds() {
  const w = store.get('window');
  if (!w?.bounds) return { width: 1440, height: 900 };
  // Kayıtlı konum artık bağlı bir ekranda değilse ortala
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return w.bounds.x < a.x + a.width - 80 && w.bounds.x + w.bounds.width > a.x + 80 && w.bounds.y >= a.y - 20 && w.bounds.y < a.y + a.height - 80;
  });
  return visible ? w.bounds : { width: w.bounds.width, height: w.bounds.height };
}

function createWindow() {
  const theme = store.get('settings').theme;
  win = new BrowserWindow({
    ...savedBounds(),
    minWidth: 900,
    minHeight: 620,
    backgroundColor: theme === 'dark' ? '#0f0f13' : '#efedf6',
    titleBarStyle: 'hidden',
    titleBarOverlay: OVERLAY[theme] || OVERLAY.light,
    show: false,
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (store.get('window')?.maximized) win.maximize();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });

  let t;
  const remember = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized()) return;
      store.set('window', { bounds: win.isMaximized() ? (store.get('window')?.bounds || win.getBounds()) : win.getBounds(), maximized: win.isMaximized() });
    }, 400);
  };
  ['resize', 'move', 'maximize', 'unmaximize'].forEach((ev) => win.on(ev, remember));

  // Kapatınca tepsiye küçül (RGB görünümü ve otomatik güncelleme çalışmaya devam etsin)
  win.on('close', (e) => {
    store.flush();
    if (!quitting && store.get('settings').minimizeToTray && tray) {
      e.preventDefault();
      win.hide();
      if (!store.get('ui').trayHintShown) {
        tray.displayBalloon?.({ title: 'Orbit arka planda çalışıyor', content: 'Işıklar ve güncellemeler için tepside kalıyorum. Tamamen kapatmak için tepsi simgesi > Çıkış.', iconType: 'info' });
        store.patch('ui', { trayHintShown: true });
      }
    }
  });
  win.webContents.on('render-process-gone', (_e, d) => log.error(`Arayüz süreci kapandı: ${d.reason}`));

  // Geliştirme: ORBIT_SNAPSHOT=dosya.png ile açılıştan birkaç saniye sonra ekran görüntüsü alıp kapanır
  if (process.env.ORBIT_SNAPSHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.ORBIT_SIZE) win.setSize(...process.env.ORBIT_SIZE.split('x').map(Number));
      if (process.env.ORBIT_JS) await win.webContents.executeJavaScript(process.env.ORBIT_JS).catch((e) => console.error('SNAPSHOT js:', e.message));
      if (process.env.ORBIT_PAGE) await win.webContents.executeJavaScript(`navigate(${JSON.stringify(process.env.ORBIT_PAGE)})`).catch((e) => console.error('SNAPSHOT navigate:', e.message));
      await new Promise((r) => setTimeout(r, +(process.env.ORBIT_SETTLE || 1500)));
      fs.writeFileSync(process.env.ORBIT_SNAPSHOT, (await win.webContents.capturePage()).toPNG());
      quitting = true;
      app.quit();
    }, +(process.env.ORBIT_WAIT || 9000)));
  }
  // Harici bağlantılar sistem tarayıcısında açılır
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);
installer.on('progress', (p) => send('install:progress', p));
installer.on('state', (s) => {
  send('install:state', s);
  // Kurulum bitince bilgisayardaki durumu yeniden tara (Kurulu / sürüm / güncelleme rozetleri)
  if (!s.running) { inventory.invalidate(); inventory.get(true).catch((e) => log.warn('Envanter', e)); }
});
inventory.on('changed', (sum) => send('inventory:changed', sum));

const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...args) => {
  try { return { ok: true, data: await fn(...args) }; } catch (e) {
    log.warn(`IPC ${ch} başarısız`, e);
    return { ok: false, error: e.message || String(e) };
  }
});

// ---------- Sistem ----------
handle('system:info', (force) => system.getSystemInfo(force));
handle('system:isAdmin', () => system.isAdmin());
handle('system:installed', () => system.getInstalledWingetIds());
handle('inventory:get', async (force) => { const d = await inventory.get(force); return { programs: d.programs, upgrades: d.upgrades, scannedAt: d.scannedAt }; });
handle('system:relaunchAdmin', async () => {
  const exe = process.execPath.replace(/'/g, "''");
  const args = app.isPackaged ? '' : ` -ArgumentList '"${app.getAppPath().replace(/'/g, "''")}"'`;
  store.flush();
  await runPS(`Start-Process -FilePath '${exe}'${args} -Verb RunAs`);
  quitting = true;
  app.quit();
});
handle('system:restart', () => runPS('shutdown /r /t 15 /c "Orbit: kurulum tamamlandı, bilgisayar yeniden başlatılıyor."'));
handle('shell:open', (url) => { if (/^https:\/\//.test(url)) return shell.openExternal(url); throw new Error('Geçersiz bağlantı'); });
handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged, logs: log.dir(), electron: process.versions.electron }));
handle('app:openLogs', () => shell.openPath(log.dir()));
ipcMain.on('app:log', (_e, level, msg) => (level === 'error' ? log.error('[arayüz] ' + msg) : log.info('[arayüz] ' + msg)));

// ---------- Katalog ----------
handle('catalog:get', () => catalog.getCatalog());
handle('catalog:addCustom', (appDef) => catalog.addCustom(appDef));
handle('catalog:removeCustom', (key) => catalog.removeCustom(key));
handle('catalog:search', (q) => system.wingetSearch(q));
handle('selection:get', () => store.get('selection'));
handle('selection:set', (keys) => store.set('selection', [...new Set(keys)]));

// ---------- Profil dışa / içe aktarma (format öncesi USB'ye yedeklemek için) ----------
handle('profile:export', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, { defaultPath: 'orbit-profil.json', filters: [{ name: 'Orbit Profili', extensions: ['json'] }] });
  if (canceled) return false;
  // API anahtarı ve makineye özel bilgiler profile girmez
  fs.writeFileSync(filePath, JSON.stringify({
    version: 2,
    selection: store.get('selection'),
    customApps: store.get('customApps'),
    rgbProfiles: store.get('rgbProfiles'),
    rgbState: store.get('rgbState'),
    settings: (({ theme, userName, rgbEngine, minimizeToTray, startWithWindows }) => ({ theme, userName, rgbEngine, minimizeToTray, startWithWindows }))(store.get('settings')),
  }, null, 2));
  return filePath;
});
handle('profile:import', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(win, { filters: [{ name: 'Orbit Profili', extensions: ['json'] }], properties: ['openFile'] });
  if (canceled) return false;
  const p = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  if (!Array.isArray(p.selection)) throw new Error('Geçersiz profil dosyası');
  store.set('customApps', Array.isArray(p.customApps) ? p.customApps : []);
  store.set('selection', p.selection);
  if (Array.isArray(p.rgbProfiles)) store.set('rgbProfiles', p.rgbProfiles);
  if (p.rgbState) store.set('rgbState', p.rgbState);
  if (p.settings) store.patch('settings', p.settings);
  store.flush();
  return true;
});

// ---------- Sürücüler ----------
handle('drivers:recommend', async () => {
  const recs = drivers.vendorRecommendations(await system.getSystemInfo());
  await inventory.get().catch(() => null);
  // RegExp IPC üzerinden taşınamaz: durumu burada hesapla, kuralı gönderme
  return recs.map(({ match, ...r }) => ({ ...r, status: inventory.statusOf({ ...r, match }) }));
});
handle('drivers:scan', () => drivers.scanWindowsUpdate());
handle('drivers:installed', (force) => drivers.installedDrivers(force));

// ---------- Kurulum ----------
handle('install:run', (items) => installer.enqueue(items));
handle('install:cancel', () => installer.cancel());

// ---------- Ayarlar (her değişiklik anında diske yazılır) ----------
const publicSettings = () => ({ ...store.get('settings'), hasApiKey: !!store.getApiKey() });
handle('settings:get', publicSettings);
handle('settings:set', async (patch) => {
  const { apiKey, hasApiKey: _x, ...rest } = patch;
  if (apiKey !== undefined) store.setApiKey(apiKey);
  store.patch('settings', rest);
  store.flush();
  if ('startWithWindows' in rest) await applyStartup();
  if ('rgbEngine' in rest) rgb.restore();
  if (rest.theme && win) {
    nativeTheme.themeSource = rest.theme;
    win.setTitleBarOverlay(OVERLAY[rest.theme] || OVERLAY.light);
    win.setBackgroundColor(rest.theme === 'dark' ? '#0f0f13' : '#efedf6');
  }
  return publicSettings();
});
handle('ui:get', () => store.get('ui'));
handle('ui:set', (patch) => store.patch('ui', patch));
handle('chat:get', () => store.get('chat') || []);
handle('chat:set', (list) => store.set('chat', (list || []).slice(-200)));
handle('history:get', () => store.get('history'));

// ---------- Asistan ----------
handle('ai:chat', (history) => assistant.chat(history, { emit: send }));

// ---------- RGB aydınlatma ----------
handle('rgb:status', () => rgb.status());
handle('rgb:connect', () => rgb.connect());
handle('rgb:refresh', async () => { await rgb.refresh(); return rgb.status(); });
handle('rgb:apply', (profile, deviceId) => rgb.apply(profile, deviceId));
handle('rgb:live', () => rgb.live());
handle('rgb:power', (on) => rgb.power(on));
handle('rgb:exclude', (id, ex) => rgb.setExcluded(id, ex));
handle('rgb:native', (deviceId, mode, opts) => rgb.applyNative(deviceId, mode, opts));
handle('rgb:save', (p) => rgb.saveProfile(p));
handle('rgb:delete', (id) => rgb.deleteProfile(id));
rgb.on('status', () => send('rgb:status', rgb.status()));

// ---------- Güncelleme ----------
handle('update:status', () => updater.state);
handle('update:check', () => updater.check());
handle('update:download', () => updater.download());
handle('update:install', () => { quitting = true; store.flush(); rgb.shutdown(); updater.install(); });
updater.on('status', (s) => send('update:status', s));

/**
 * Windows açılışında başlatma. Orbit yönetici yetkisi istediği için normal "Run" kaydı
 * Windows tarafından sessizce engellenir; bu yüzden en yüksek yetkiyle çalışan bir
 * Görev Zamanlayıcı görevi kullanılır.
 */
async function applyStartup() {
  if (!app.isPackaged) return;
  const on = !!store.get('settings').startWithWindows;
  app.setLoginItemSettings({ openAtLogin: false }); // 1.0.0'ın çalışmayan kaydını temizle
  const exe = process.execPath.replace(/'/g, "''");
  const r = on
    ? await runPS(`$a = New-ScheduledTaskAction -Execute '${exe}' -Argument '--hidden'
        $t = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\\$env:USERNAME"
        $p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -LogonType Interactive -RunLevel Highest
        $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
        Register-ScheduledTask -TaskName '${TASK}' -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null; 'ok'`)
    : await runPS(`Unregister-ScheduledTask -TaskName '${TASK}' -Confirm:$false -ErrorAction SilentlyContinue; 'ok'`);
  if (!r.stdout.includes('ok')) log.warn('Başlangıç görevi ayarlanamadı: ' + r.stderr.split('\n')[0]);
  else log.info(`Başlangıç görevi ${on ? 'kuruldu' : 'kaldırıldı'}`);
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip(`Orbit ${app.getVersion()}`);
  const build = () => {
    const profiles = [...rgb.status().presets, ...(store.get('rgbProfiles') || [])];
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Orbit\'i aç', click: showWindow },
      { type: 'separator' },
      { label: 'RGB görünümü', submenu: profiles.map((p) => ({ label: p.name, click: () => rgb.apply(p).catch((e) => log.warn('Tepsi RGB', e)) })) },
      { type: 'separator' },
      { label: 'Güncellemeleri denetle', click: () => updater.check() },
      { label: 'Çıkış', click: () => { quitting = true; app.quit(); } },
    ]));
  };
  build();
  tray.on('click', showWindow);
  ipcMain.on('tray:rebuild', build);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    app.setAppUserModelId('com.mlevn.orbit');
    store.load();
    log.info(`Orbit ${app.getVersion()} başladı${startHidden ? ' (arka planda)' : ''}`);
    nativeTheme.themeSource = store.get('settings').theme;
    createWindow();
    createTray();
    applyStartup().catch((e) => log.warn('Başlangıç görevi', e));
    updater.init();
    rgb.restore();
    inventory.get().catch((e) => log.warn('Envanter', e));
  });
}
app.on('before-quit', () => { quitting = true; store.flush(); rgb.shutdown(); });
app.on('window-all-closed', () => app.quit());
