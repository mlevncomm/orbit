const { contextBridge, ipcRenderer } = require('electron');

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
const on = (ch) => (cb) => {
  const fn = (_e, p) => cb(p);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('orbit', {
  system: {
    info: (force) => call('system:info', force),
    isAdmin: () => call('system:isAdmin'),
    installed: () => call('system:installed'),
    relaunchAdmin: () => call('system:relaunchAdmin'),
    restart: () => call('system:restart'),
    open: (url) => call('shell:open', url),
    openLocal: (url) => call('shell:open-local', url),
  },
  catalog: {
    get: () => call('catalog:get'),
    addCustom: (a) => call('catalog:addCustom', a),
    removeCustom: (k) => call('catalog:removeCustom', k),
    search: (q) => call('catalog:search', q),
  },
  selection: { get: () => call('selection:get'), set: (k) => call('selection:set', k) },
  profile: { export: () => call('profile:export'), import: () => call('profile:import') },
  drivers: { recommend: () => call('drivers:recommend'), scan: () => call('drivers:scan'), installed: (force) => call('drivers:installed', force) },
  bootstrap: { check: () => call('bootstrap:check'), repair: (a) => call('bootstrap:repair', a) },
  esp32: {
    ports: () => call('esp32:ports'),
    status: () => call('esp32:status'),
    connect: (port, baud) => call('esp32:connect', port, baud),
    disconnect: () => call('esp32:disconnect'),
    command: (cmd, args) => call('esp32:command', cmd, args),
    readStatus: () => call('esp32:read-status'),
    boards: () => call('esp32:boards'),
    identify: (port) => call('esp32:identify', port),
    raw: (text) => call('esp32:raw', text),
    onStatus: on('esp32:status'),
    onLog: on('esp32:log'),
    wifi: () => call('esp32:wifi'),
    wifiSetup: (ssid, pass) => call('esp32:wifi-setup', ssid, pass),
    wifiOff: () => call('esp32:wifi-off'),
    onWifi: on('esp32:wifi'),
  },
  automation: {
    actions: () => call('automation:actions'),
    history: () => call('automation:history'),
    run: (action, arg) => call('automation:run', action, arg),
    onHistory: on('automation:history'),
    onDrivers: on('automation:drivers'),
  },
  onSettingsChanged: on('settings:changed'),
  bridge: { info: () => call('bridge:info') },
  inventory: { get: (force) => call('inventory:get', force), onChanged: on('inventory:changed') },
  install: {
    run: (items) => call('install:run', items),
    cancel: () => call('install:cancel'),
    list: () => call('install:list'),
    skip: (key) => call('install:skip', key),
    retry: (key) => call('install:retry', key),
    pending: () => call('install:pending'),
    resume: () => call('install:resume'),
    discard: () => call('install:discard'),
    onProgress: on('install:progress'),
    onState: on('install:state'),
  },
  settings: { get: () => call('settings:get'), set: (p) => call('settings:set', p) },
  ui: { get: () => call('ui:get'), set: (p) => call('ui:set', p) },
  chat: { get: () => call('chat:get'), set: (list) => call('chat:set', list) },
  app: {
    info: () => call('app:info'),
    openLogs: () => call('app:openLogs'),
    log: (level, msg) => ipcRenderer.send('app:log', level, String(msg).slice(0, 2000)),
  },
  history: { get: () => call('history:get') },
  rgb: {
    status: () => call('rgb:status'),
    connect: () => call('rgb:connect'),
    refresh: () => call('rgb:refresh'),
    apply: (profile, deviceId) => call('rgb:apply', profile, deviceId),
    native: (deviceId, mode, opts) => call('rgb:native', deviceId, mode, opts),
    live: () => call('rgb:live'),
    power: (on) => call('rgb:power', on),
    exclude: (id, ex) => call('rgb:exclude', id, ex),
    save: (p) => call('rgb:save', p).finally(() => ipcRenderer.send('tray:rebuild')),
    remove: (id) => call('rgb:delete', id).finally(() => ipcRenderer.send('tray:rebuild')),
    onStatus: on('rgb:status'),
  },
  update: {
    status: () => call('update:status'),
    check: () => call('update:check'),
    download: () => call('update:download'),
    install: () => call('update:install'),
    onStatus: on('update:status'),
  },
  ai: {
    chat: (history) => call('ai:chat', history),
    onProposal: on('ai:proposal'),
    onTool: on('ai:tool'),
  },
});
