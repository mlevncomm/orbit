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
const bootstrap = require('./services/bootstrap');
const { Esp32Hub, identifyWithEsptool, pickAutoPort } = require('./esp32/hub');
const esp32 = new Esp32Hub({ log });
const { Automation } = require('./automation');
const { Bridge } = require('./bridge');
let automation = null;
let bridge = null;
let esp32UserDisconnected = false; // kullanıcı elle kestiyse otomatik bağlanma beklesin
let esp32AutoBusy = false;

/** Son kullanılan porta kendiliğinden bağlanır (açılışta ve kart sonradan takılınca) */
async function autoConnectEsp32() {
  const s = store.get('settings');
  if (esp32AutoBusy || esp32UserDisconnected || s.esp32AutoConnect === false || esp32.proc || esp32.state !== 'disconnected') return;
  esp32AutoBusy = true;
  try {
    const port = pickAutoPort(await esp32.listPorts(), s.esp32LastPort);
    if (port) {
      await esp32.connect(port, 115200);
      log.info(`ESP32 otomatik bağlandı: ${port}${s.esp32LastPort ? '' : ' (ilk kez, tek ESP32 köprüsü bulundu)'}`);
    }
  } catch (e) {
    if (autoConnectEsp32.lastError !== e.message) log.warn('ESP32 otomatik bağlanamadı', e);
    autoConnectEsp32.lastError = e.message;
  } finally { esp32AutoBusy = false; }
}
const UI_PAGES = ['dashboard', 'drivers', 'apps', 'lights', 'esp32', 'assistant', 'settings'];
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
    minWidth: 480,
    minHeight: 560,
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
      if (process.env.ORBIT_SIZE) {
        if (win.isMaximized()) win.unmaximize();
        win.setSize(...process.env.ORBIT_SIZE.split('x').map(Number));
        await new Promise((r) => setTimeout(r, 600));
      }
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
// Yalnızca https ve tek bir Windows ayar sayfası (Dinamik Aydınlatma) açılabilir
handle('shell:open', (url) => { if (/^https:\/\//.test(url) || url === 'ms-settings:personalization-lighting') return shell.openExternal(url); throw new Error('Geçersiz bağlantı'); });
// Yalnızca yerel ağdaki ESP32 paneli (http://192.168.x.x / 10.x / 172.16-31.x) açılabilir
handle('shell:open-local', (url) => { if (/^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))[\d.]*\/\?t=[0-9a-f]+$/.test(url)) return shell.openExternal(url); throw new Error('Geçersiz yerel adres'); });
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
// AMD resmi sayfasındaki en güncel paket sürümleri (1 saat önbellek; yalnızca okuma, indirme yok)
let amdLatest = null;
handle('drivers:amd-latest', async () => {
  if (amdLatest && Date.now() - amdLatest.at < 3600000) return amdLatest.data;
  const amd = require('./services/vendor-amd');
  const sys = await system.getSystemInfo();
  const [gpu, chipset] = await Promise.allSettled([amd.resolve('gpu', sys), amd.resolve('chipset', sys)]);
  const pick = (r) => (r.status === 'fulfilled' ? { version: r.value.version, size: r.value.size } : { error: r.reason.message });
  amdLatest = { at: Date.now(), data: { gpu: pick(gpu), chipset: pick(chipset) } };
  return amdLatest.data;
});
handle('drivers:installed', (force) => drivers.installedDrivers(force));

// ---------- Kurulum ----------
handle('install:run', (items) => installer.enqueue(items));
handle('install:cancel', () => installer.cancel());
handle('install:list', () => installer.list());
handle('install:skip', (key) => installer.skip(key));
handle('install:retry', (key) => installer.retry(key));
handle('install:pending', () => installer.pendingFromLastRun());
handle('install:resume', () => installer.resumePending());
handle('install:discard', () => installer.discardPending());

// ---------- Format sonrası hazırlık ----------
handle('bootstrap:check', () => bootstrap.check());
handle('bootstrap:repair', (action) => bootstrap.repair(action));

// ---------- ESP32 Hub ----------
handle('esp32:ports', () => esp32.listPorts());
handle('esp32:status', () => esp32.status());
handle('esp32:connect', (port, baud) => { esp32UserDisconnected = false; return esp32.connect(port, baud); });
handle('esp32:disconnect', () => { esp32UserDisconnected = true; return esp32.disconnect(); });
handle('esp32:command', (cmd, args) => esp32.command(cmd, args));
handle('esp32:read-status', () => esp32.readStatus());
handle('esp32:boards', () => store.get('esp32Boards') || {});
handle('esp32:identify', async (port) => {
  // Port Orbit'te açıksa esptool erişemez: önce bağlantıyı kapat
  if (esp32.proc && esp32.port === String(port).toUpperCase()) esp32.disconnect();
  const info = await identifyWithEsptool(port);
  store.patch('esp32Boards', { [info.port]: info });
  log.info(`ESP32 tanımlandı: ${info.port} ${info.chip} rev ${info.revision} flash ${info.flashSize}`);
  return info;
});
handle('esp32:raw', (text) => {
  // Kullanıcının seri konsoldan yazdığı satır: yalnızca karta gider, bilgisayarda hiçbir şey çalıştırmaz
  const line = String(text || '').replace(/[\r\n]/g, '').slice(0, 256);
  esp32.writeRaw(line + '\n'); esp32.pushLog('out', line); return true;
});
esp32.on('status', (s) => send('esp32:status', s));

// ---------- Otomasyon / ESP32 ikizi ----------
handle('automation:actions', () => automation.catalog());
handle('automation:history', () => automation.history);
handle('automation:run', (action, arg) => automation.run(action, arg, { source: 'ui' }));
handle('esp32:wifi', () => ({ wifi: automation.wifi || null, url: automation.panelUrl() }));
handle('esp32:wifi-setup', async (ssid, pass) => { await automation.setupWifi(ssid, pass); return { wifi: automation.wifi || null }; });
handle('esp32:wifi-off', async () => { await automation.disableWifi(); return true; });
function startAutomation() {
  automation = new Automation({
    rgb, store, installer, inventory, catalog, drivers, assistant, hub: esp32, log, version: app.getVersion(),
    showWindow, setSettings,
    confirm: async (message, detail) => {
      const r = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
        type: 'question', title: 'Orbit · ESP32 isteği', message, detail, buttons: ['Onayla', 'Reddet'], defaultId: 1, cancelId: 1, noLink: true,
      });
      return r.response === 0;
    },
  });
  esp32.on('device-event', (ev) => automation.onDeviceEvent(ev).catch((e) => log.warn('ESP32 olayı', e)));
  esp32.on('connected', () => {
    store.patch('settings', { esp32LastPort: esp32.port });
    autoConnectEsp32.lastError = null;
    automation.onConnected().catch(() => {});
  });
  setTimeout(autoConnectEsp32, 3000);
  setInterval(autoConnectEsp32, 20000);
  automation.on('history', (h) => send('automation:history', h));
  automation.on('wifi', () => send('esp32:wifi', { wifi: automation.wifi, url: automation.panelUrl() }));
  automation.on('drivers', (list) => send('automation:drivers', list));
  automation.start();

  // Claude / MCP için yerel köprü (varsayılan kapalı)
  bridge = new Bridge({
    userData: app.getPath('userData'), version: app.getVersion(), log, automation, inventory, drivers, rgb, hub: esp32, installer, store, catalog,
    logDir: () => log.dir(),
    uiState: async () => (win && !win.isDestroyed()
      ? win.webContents.executeJavaScript(`({ page: S.page, theme: document.documentElement.dataset.theme, title: document.querySelector('h1')?.innerText || '', errors: window.__orbitErrors || 0, visible: !document.hidden })`)
      : null),
    navigate: async (page) => {
      if (!UI_PAGES.includes(page)) throw new Error('Bilinmeyen sayfa: ' + page);
      if (!win || win.isDestroyed()) createWindow();
      await win.webContents.executeJavaScript(`navigate(${JSON.stringify(page)})`);
    },
    screenshot: async () => {
      if (!win || win.isDestroyed()) throw new Error('Orbit penceresi yok');
      if (!win.isVisible()) { win.showInactive(); await new Promise((r) => setTimeout(r, 600)); }
      return (await win.webContents.capturePage()).toPNG();
    },
  });
  if (store.get('settings').bridgeEnabled || process.env.ORBIT_BRIDGE === '1') bridge.start().catch((e) => log.warn('Köprü açılamadı', e));
}
handle('bridge:info', () => {
  const plugin = app.isPackaged ? path.join(process.resourcesPath, 'plugins', 'orbit-mcp', 'index.js') : path.join(app.getAppPath(), 'plugins', 'orbit-mcp', 'index.js');
  return { ...(bridge ? bridge.info() : { enabled: false }), plugin, command: `claude mcp add orbit -- node "${plugin}"` };
});
esp32.on('log', (e) => send('esp32:log', e));

// ---------- Ayarlar (her değişiklik anında diske yazılır) ----------
const publicSettings = () => ({ ...store.get('settings'), hasApiKey: !!store.getApiKey() });
handle('settings:get', publicSettings);
handle('settings:set', (patch) => setSettings(patch));
async function setSettings(patch) {
  const { apiKey, hasApiKey: _x, ...rest } = patch;
  if (apiKey !== undefined) store.setApiKey(apiKey);
  store.patch('settings', rest);
  store.flush();
  if ('startWithWindows' in rest) await applyStartup();
  if ('bridgeEnabled' in rest && bridge) await (rest.bridgeEnabled ? bridge.start() : bridge.stop()).catch((e) => log.warn('Köprü', e));
  if ('rgbEngine' in rest) rgb.restore();
  if (rest.theme && win) {
    nativeTheme.themeSource = rest.theme;
    win.setTitleBarOverlay(OVERLAY[rest.theme] || OVERLAY.light);
    win.setBackgroundColor(rest.theme === 'dark' ? '#0f0f13' : '#efedf6');
  }
  send('settings:changed', publicSettings());
  return publicSettings();
}
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
handle('rgb:conflicts', () => rgb.conflicts());
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
    startAutomation();
  });
}
app.on('before-quit', () => { quitting = true; store.flush(); rgb.shutdown(); esp32.disconnect(); bridge?.stop(); });
app.on('window-all-closed', () => app.quit());
