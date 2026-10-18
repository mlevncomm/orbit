// Otomatik güncelleme: GitHub Releases (mlevncomm/orbit) üzerinden electron-updater
const { app } = require('electron');
const { EventEmitter } = require('events');

class Updater extends EventEmitter {
  constructor() {
    super();
    this.state = { state: 'idle', current: app.getVersion() };
    this.au = null;
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('status', this.state);
  }

  init() {
    if (!app.isPackaged) { this.set({ state: 'dev' }); return; }
    const { autoUpdater } = require('electron-updater');
    this.au = autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }));
    autoUpdater.on('update-available', (i) => this.set({ state: 'available', version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, '').trim() : '' }));
    autoUpdater.on('update-not-available', () => this.set({ state: 'latest', checkedAt: Date.now() }));
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (i) => this.set({ state: 'ready', version: i.version }));
    autoUpdater.on('error', (e) => this.set({ state: 'error', error: String(e?.message || e).split('\n')[0] }));
    setTimeout(() => this.check(), 6000);
    setInterval(() => this.check(), 4 * 60 * 60 * 1000);
  }

  async check() {
    if (!this.au) return this.state;
    try { await this.au.checkForUpdates(); } catch (e) { this.set({ state: 'error', error: e.message }); }
    return this.state;
  }
  async download() { if (this.au) await this.au.downloadUpdate(); return this.state; }
  install() { if (this.au) setImmediate(() => this.au.quitAndInstall(true, true)); }
}

module.exports = new Updater();
