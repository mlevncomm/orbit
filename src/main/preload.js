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
  },
  catalog: {
    get: () => call('catalog:get'),
    addCustom: (a) => call('catalog:addCustom', a),
    removeCustom: (k) => call('catalog:removeCustom', k),
    search: (q) => call('catalog:search', q),
  },
  selection: { get: () => call('selection:get'), set: (k) => call('selection:set', k) },
  profile: { export: () => call('profile:export'), import: () => call('profile:import') },
  drivers: { recommend: () => call('drivers:recommend'), scan: () => call('drivers:scan') },
  install: {
    run: (items) => call('install:run', items),
    cancel: () => call('install:cancel'),
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
