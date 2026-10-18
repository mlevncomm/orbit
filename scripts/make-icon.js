// Uygulama ikonunu üretir: npx electron scripts/make-icon.js  ->  src/assets/icon.png (512x512, şeffaf köşeler)
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5c9cf"/><stop offset=".5" stop-color="#ddd6f3"/><stop offset="1" stop-color="#cfe0f5"/></linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="120" fill="#111114"/>
  <g transform="translate(256 256) scale(13) translate(-12 -12)" fill="none" stroke="url(#g)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3a4 4 0 0 1 4 4v1h1a4 4 0 0 1 0 8h-1v1a4 4 0 0 1-8 0v-1H7a4 4 0 0 1 0-8h1V7a4 4 0 0 1 4-4z"/>
    <circle cx="12" cy="12" r="2.2"/>
  </g>
</svg>`;

setTimeout(() => { console.error('timeout'); app.exit(1); }, 20000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  // SVG'yi sayfa içinde canvas'a çizip PNG verisi al (alfa kanalı korunur)
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 512; c.getContext('2d').drawImage(img, 0, 0, 512, 512); res(c.toDataURL('image/png')); };
    img.onerror = () => rej('svg yüklenemedi');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
  })`);
  const out = path.join(__dirname, '..', 'src', 'assets', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('icon ->', out);
  app.exit(0);
});
