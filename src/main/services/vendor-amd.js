// AMD resmi sürücü paketleri: Adrenalin (ekran kartı) ve Chipset Software (yonga seti)
//
// AMD winget paketi sunmuyor. Güvenlik kuralı gereği kaynak YALNIZCA amd.com'dur:
//  1. Donanıma ait resmi destek sayfası (www.amd.com) okunur, en güncel paket bağlantısı bulunur
//  2. Bağlantı yalnızca https://drivers.amd.com/drivers/... olabilir (başka alan adı reddedilir)
//  3. İndirilen dosyanın Authenticode imzası geçerli VE imzalayan "Advanced Micro Devices" olmalı
//  4. Kurulumdan önce sistem geri yükleme noktası alınır (installer tarafında)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const REFERER = 'https://www.amd.com/';
// AMD sitesinden gelinmeyen indirme reddedilir (302); sıkıştırma istenirse boyut bildirilmez
const DL_HEADERS = { 'user-agent': UA, referer: REFERER, 'accept-encoding': 'identity' };
const SAFE_URL = /^https:\/\/drivers\.amd\.com\/drivers\/[\w.\-/]+\.exe$/i;

const AM4 = ['a320', 'b350', 'x370', 'b450', 'x470', 'a520', 'b550', 'x570'];
const AM5 = ['a620', 'b650', 'b650e', 'x670', 'x670e', 'b840', 'b850', 'x870', 'x870e'];

/** Anakart adından ("B550 AORUS ELITE AX V2") resmi yonga seti sayfası */
function chipsetPage(boardProduct) {
  const m = String(boardProduct || '').toLowerCase().match(/\b([abx]\d{3}e?)\b/);
  if (!m) return null;
  const chip = m[1];
  const socket = AM4.includes(chip) ? 'am4' : AM5.includes(chip) ? 'am5' : null;
  if (!socket) return null;
  return `https://www.amd.com/en/support/downloads/drivers.html/chipsets/${socket}/${chip}.html`;
}

/** Ekran kartı adından ("AMD Radeon RX 6600") resmi sürücü sayfası (RX 5000-9000) */
function gpuPage(gpuName) {
  const m = String(gpuName || '').match(/radeon\s+rx\s+(\d)(\d{3})\s*(xt|gre)?/i);
  if (!m || !['5', '6', '7', '9'].includes(m[1])) return null;
  const series = `radeon-rx-${m[1]}000-series`;
  const model = `amd-radeon-rx-${m[1]}${m[2]}${m[3] ? '-' + m[3].toLowerCase() : ''}`;
  return `https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/${series}/${model}.html`;
}

const cmpVer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

/**
 * Resmi sayfanın HTML'inden en güncel paketi seçer (saf fonksiyon, test edilir).
 * kind 'gpu': whql-amd-software-adrenalin-edition-X.Y.Z-win11-a.exe (tam WHQL paketi, çevrimdışı kurulur)
 * kind 'chipset': AMD_Chipset_Software_X.Y.Z.W.exe
 */
function pickPackage(html, kind) {
  const links = [...new Set(String(html).match(/https:\/\/drivers\.amd\.com\/drivers\/[^"'\s<>]+\.exe/gi) || [])];
  const re = kind === 'gpu'
    ? /\/whql-amd-software-adrenalin-edition-(\d+\.\d+\.\d+)-win11-a\.exe$/i
    : /\/AMD_Chipset_Software_(\d+\.\d+\.\d+\.\d+)\.exe$/i;
  const found = links.map((url) => ({ url, m: url.match(re) })).filter((x) => x.m && SAFE_URL.test(x.url))
    .map((x) => ({ url: x.url, version: x.m[1], file: x.url.split('/').pop() }));
  found.sort((a, b) => cmpVer(b.version, a.version));
  return found[0] || null;
}

/** Resmi sayfadan güncel paketi bulur ve boyutunu öğrenir */
async function resolve(kind, sys) {
  const page = kind === 'gpu'
    ? gpuPage((sys?.gpus || []).map((g) => g.name).find((n) => /radeon/i.test(n)))
    : chipsetPage(sys?.board?.product);
  if (!page) throw new Error(kind === 'gpu' ? 'Bu Radeon modeli için otomatik paket desteklenmiyor' : 'Bu anakart yonga seti için otomatik paket desteklenmiyor');
  const res = await fetch(page, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`AMD sayfası açılamadı (HTTP ${res.status})`);
  const pkg = pickPackage(await res.text(), kind);
  if (!pkg) throw new Error('AMD sayfasında paket bağlantısı bulunamadı (sayfa yapısı değişmiş olabilir)');
  const head = await fetch(pkg.url, { method: 'HEAD', headers: DL_HEADERS });
  if (!head.ok) throw new Error(`AMD paketi erişilemiyor (HTTP ${head.status})`);
  return { ...pkg, page, size: +head.headers.get('content-length') || 0 };
}

/**
 * Sessiz kurulum argümanları.
 * Chipset Software NSIS tabanlıdır: /S. Adrenalin paketi AMD'nin belgelediği "-INSTALL" ile
 * kullanıcı arayüzü olmadan kurar; yeniden başlatmayı kendisi yapmaz.
 */
const silentArgs = (kind) => (kind === 'gpu' ? ['-INSTALL'] : ['/S']);

/** Kurulumdan sonra kayıt defterinde aranacak program adı */
const verifyName = (kind) => (kind === 'gpu' ? /^AMD Software/i : /^AMD Chipset Software/i);

module.exports = { UA, REFERER, DL_HEADERS, SAFE_URL, chipsetPage, gpuPage, pickPackage, resolve, silentArgs, verifyName, cmpVer };
