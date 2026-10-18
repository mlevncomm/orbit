const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Tray, Menu, nativeImage } = require('electron');
const store = require('./services/store');
const system = require('./services/system');
const catalog = require('./services/catalog');
const drivers = require('./services/drivers');
const installer = require('./services/installer');
const assistant = require('./ai/assistant');
const rgb = require('./services/rgb');
const updater = require('./services/updater');
const { runPS } = require('./services/ps');

let win, tray;
let quitting = false;
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const startHidden = process.argv.includes('--hidden');

const OVERLAY = {
  light: { color: '#00000000', symbolColor: '#1b1b1f', height: 44 },
  dark: { color: '#00000000', symbolColor: '#f2f2f5', height: 44 },
};

function createWindow() {
  const theme = store.get('settings').theme;
  win = new BrowserWindow({
    width: 1440,
    height: 900,
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
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  // Kapatınca tepsiye küçül (RGB efektleri çalışmaya devam etsin)
  win.on('close', (e) => {
    if (!quitting && store.get('settings').minimizeToTray && tray) { e.preventDefault(); win.hide(); }
  });
  // Geliştirme: ORBIT_SNAPSHOT=dosya.png ile açılıştan birkaç saniye sonra ekran görüntüsü alıp kapanır
  if (process.env.ORBIT_SNAPSHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.ORBIT_SIZE) win.setSize(...process.env.ORBIT_SIZE.split('x').map(Number));
      if (process.env.ORBIT_DARK) await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='dark'`);
      if (process.env.ORBIT_PAGE) await win.webContents.executeJavaScript(`navigate(${JSON.stringify(process.env.ORBIT_PAGE)})`).catch((e) => console.error('SNAPSHOT navigate:', e.message));
      await new Promise((r) => setTimeout(r, 1500));
      fs.writeFileSync(process.env.ORBIT_SNAPSHOT, (await win.webContents.capturePage()).toPNG());
      app.quit();
    }, +(process.env.ORBIT_WAIT || 9000)));
  }
  // Harici bağlantılar sistem tarayıcısında açılır
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);
installer.on('progress', (p) => send('install:progress', p));
installer.on('state', (s) => send('install:state', s));

const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...args) => {
  try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// --- Sistem
handle('system:info', (force) => system.getSystemInfo(force));
handle('system:isAdmin', () => system.isAdmin());
handle('system:installed', () => system.getInstalledWingetIds());
handle('system:relaunchAdmin', async () => {
  const exe = process.execPath.replace(/'/g, "''");
  const args = app.isPackaged ? '' : ` -ArgumentList '"${app.getAppPath().replace(/'/g, "''")}"'`;
  await runPS(`Start-Process -FilePath '${exe}'${args} -Verb RunAs`);
  app.quit();
});
handle('system:restart', () => runPS('shutdown /r /t 15 /c "Orbit: kurulum tamamlandı, bilgisayar yeniden başlatılıyor."'));
handle('shell:open', (url) => { if (/^https:\/\//.test(url)) return shell.openExternal(url); throw new Error('Geçersiz bağlantı'); });

// --- Katalog
handle('catalog:get', () => catalog.getCatalog());
handle('catalog:addCustom', (appDef) => catalog.addCustom(appDef));
handle('catalog:removeCustom', (key) => catalog.removeCustom(key));
handle('catalog:search', (q) => system.wingetSearch(q));
handle('selection:get', () => store.get('selection'));
handle('selection:set', (keys) => store.set('selection', [...new Set(keys)]));

// --- Profil dışa / içe aktarma (format öncesi USB'ye yedeklemek için)
handle('profile:export', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, { defaultPath: 'orbit-profil.json', filters: [{ name: 'Orbit Profili', extensions: ['json'] }] });
  if (canceled) return false;
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, selection: store.get('selection'), customApps: store.get('customApps') }, null, 2));
  return filePath;
});
handle('profile:import', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(win, { filters: [{ name: 'Orbit Profili', extensions: ['json'] }], properties: ['openFile'] });
  if (canceled) return false;
  const p = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  if (!Array.isArray(p.selection)) throw new Error('Geçersiz profil dosyası');
  store.set('customApps', Array.isArray(p.customApps) ? p.customApps : []);
  store.set('selection', p.selection);
  return true;
});

// --- Sürücüler
handle('drivers:recommend', async () => drivers.vendorRecommendations(await system.getSystemInfo()));
handle('drivers:scan', () => drivers.scanWindowsUpdate());

// --- Kurulum
handle('install:run', (items) => installer.enqueue(items));
handle('install:cancel', () => installer.cancel());

// --- Ayarlar
handle('settings:get', () => ({ ...store.get('settings'), hasApiKey: !!store.getApiKey() }));
handle('settings:set', (patch) => {
  const { apiKey, ...rest } = patch;
  if (apiKey !== undefined) store.setApiKey(apiKey);
  const s = store.set('settings', { ...store.get('settings'), ...rest });
  if ('startWithWindows' in rest) applyLoginItem();
  if (rest.theme && win) {
    nativeTheme.themeSource = rest.theme;
    win.setTitleBarOverlay(OVERLAY[rest.theme] || OVERLAY.light);
    win.setBackgroundColor(rest.theme === 'dark' ? '#0f0f13' : '#efedf6');
  }
  return { ...s, hasApiKey: !!store.getApiKey() };
});
handle('history:get', () => store.get('history'));

// --- Asistan
handle('ai:chat', (history) => assistant.chat(history, { emit: send }));

// --- RGB aydınlatma
handle('rgb:status', () => rgb.status());
handle('rgb:connect', () => rgb.connect());
handle('rgb:refresh', async () => { await rgb.refresh(); return rgb.status(); });
handle('rgb:apply', (profile, deviceId) => rgb.apply(profile, deviceId));
handle('rgb:save', (p) => rgb.saveProfile(p));
handle('rgb:delete', (id) => rgb.deleteProfile(id));
rgb.on('status', () => send('rgb:status', rgb.status()));

// --- Güncelleme
handle('update:status', () => updater.state);
handle('update:check', () => updater.check());
handle('update:download', () => updater.download());
handle('update:install', () => { quitting = true; updater.install(); });
updater.on('status', (s) => send('update:status', s));

function applyLoginItem() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!store.get('settings').startWithWindows, args: ['--hidden'] });
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Orbit');
  const build = () => {
    const profiles = [...rgb.status().presets, ...(store.get('rgbProfiles') || [])];
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Orbit\'i aç', click: showWindow },
      { type: 'separator' },
      { label: 'RGB görünümü', submenu: profiles.map((p) => ({ label: p.name, click: () => rgb.apply(p).catch(() => {}) })) },
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
    nativeTheme.themeSource = store.get('settings').theme;
    createWindow();
    createTray();
    applyLoginItem();
    updater.init();
    rgb.restore();
  });
}
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());
