// Orbit Site İndirici (wexon.dev): bir web sitesini tüm sayfaları ve dosyalarıyla indirir,
// bağlantıları yerel dosyalara çevirir, klasör + zip olarak kaydeder.
//
// - Sayfalar yalnızca başlangıç alan adında gezilir (sayfa / derinlik sınırı); dosyalar (CSS, JS, görsel,
//   yazı tipi) CDN'den de gelebilir ve _harici/<alan adı>/ altına konur.
// - robots.txt'ye uyulur (kapatılabilir), istekler arasında beklenir, dosya ve toplam boyut sınırı vardır.
// - İndirilmeyen sayfalara giden bağlantılar çevrim içi adresine çevrilir: kırık bağlantı kalmaz.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { execFile } = require('child_process');
const { app } = require('electron');
const log = require('./log');
const { Renderer, renderOffline, similarity } = require('./site-render');

// İçerik türü → uzantı (uzantısız adreslerdeki dosyalar yerelde doğru açılsın: /_next/image?url=… gibi)
const TYPE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/avif': '.avif', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico', 'font/woff2': '.woff2', 'font/woff': '.woff', 'font/ttf': '.ttf', 'font/otf': '.otf', 'application/font-woff2': '.woff2', 'application/font-woff': '.woff', 'text/css': '.css', 'text/javascript': '.js', 'application/javascript': '.js', 'application/json': '.json', 'video/mp4': '.mp4', 'video/webm': '.webm' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 OrbitSiteDownloader/1.0 (+https://wexon.dev)';
const MAX_FILE = 40 * 1024 * 1024;
const MAX_TOTAL = 1024 * 1024 * 1024;
const PAGE_EXT = /\.(html?|php|aspx?|jsp|cfm)$/i;
const ASSET_EXT = /\.(css|js|mjs|json|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav|pdf|txt|xml|webmanifest|map)$/i;

/** Saf yardımcılar (test edilir) */
const H = {
  /** www. olan ve olmayan adres aynı sitedir */
  sameSite(a, b) { const n = (x) => String(x).toLowerCase().replace(/^www\./, ''); return n(a) === n(b); },
  /** HTML'deki tüm kaynak başvuruları: { raw, kind: 'page'|'asset' } */
  htmlRefs(html) {
    const out = [];
    const add = (raw, kind) => { raw = raw.trim(); if (raw && !/^(#|data:|blob:|mailto:|tel:|javascript:|about:)/i.test(raw)) out.push({ raw, kind }); };
    for (const m of html.matchAll(/<(a|area)\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) add(m[3] ?? m[4] ?? m[5], 'page');
    for (const m of html.matchAll(/<link\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const tag = m[0]; const v = m[2] ?? m[3] ?? m[4];
      add(v, /rel\s*=\s*["']?[^"'>]*\b(alternate|canonical|next|prev)\b/i.test(tag) && !/stylesheet/i.test(tag) ? 'page' : 'asset');
    }
    for (const m of html.matchAll(/\b(?:src|poster|data-src|data-original|data-lazy-src)\s*=\s*("([^"]*)"|'([^']*)')/gi)) add(m[2] ?? m[3], 'asset');
    for (const m of html.matchAll(/\b(?:srcset|data-srcset)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
      for (const part of (m[2] ?? m[3]).split(',')) add(part.trim().split(/\s+/)[0], 'asset');
    }
    for (const m of html.matchAll(/<meta\b[^>]*?(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*?content\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'asset');
    for (const r of H.cssRefs(html.replace(/&quot;/g, "'"))) out.push(r); // <style> ve style="" içindeki url()
    return out;
  },
  /** CSS'teki url(...) ve @import başvuruları */
  cssRefs(css) {
    const out = [];
    for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) if (!/^(data:|#|about:)/i.test(m[2].trim())) out.push({ raw: m[2].trim(), kind: 'asset' });
    for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/gi)) out.push({ raw: m[2].trim(), kind: 'asset' });
    return out;
  },
  /** Mutlak adresi yerel dosya yoluna çevirir (site köküne göre, '/' ayırıcılı) */
  localPath(u, rootHost, isPage) {
    const ext = (p) => path.posix.extname(p);
    let p = decodeURIComponent(u.pathname).replace(/\/{2,}/g, '/');
    if (isPage) {
      if (p.endsWith('/')) p += 'index.html';
      else if (!ext(p)) p += '/index.html';
      else if (!/\.html?$/i.test(p)) p += '.html';
    } else if (p.endsWith('/') || !ext(p)) p += (p.endsWith('/') ? '' : '/') + 'index';
    if (u.search) {
      const h = crypto.createHash('sha1').update(u.search).digest('hex').slice(0, 8);
      const e = ext(p); p = p.slice(0, p.length - e.length) + '_' + h + e;
    }
    p = p.split('/').map((seg) => seg.replace(/[<>:"\\|?*\x00-\x1f]/g, '_').slice(0, 120)).join('/');
    const base = H.sameSite(u.host, rootHost) ? '' : `_harici/${u.host.replace(/[:]/g, '_')}`;
    return (base + p).replace(/^\/+/, '');
  },
  /** from dosyasından to dosyasına göreli bağlantı */
  rel(from, to, hash = '') {
    let r = path.posix.relative(path.posix.dirname(from), to);
    if (!r.startsWith('.')) r = './' + r;
    return r + hash;
  },
  /** robots.txt'den "*" için yasaklı yollar */
  robots(txt) {
    const rules = []; let applies = false;
    for (const line of String(txt).split(/\r?\n/)) {
      const [k, ...rest] = line.replace(/#.*/, '').split(':'); const v = rest.join(':').trim();
      if (/^user-agent$/i.test(k.trim())) applies = v === '*';
      else if (applies && /^disallow$/i.test(k.trim()) && v) rules.push(v);
    }
    return rules;
  },
  /** Statik klon: betikler, betik ön yüklemeleri ve <noscript> (sayfa zaten çizildi) kaldırılır; JSON-LD kalır */
  stripScripts(html) {
    return html
      .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<link\b[^>]*\brel\s*=\s*["']?(modulepreload|prefetch)["']?[^>]*>/gi, '')
      .replace(/<link\b[^>]*\bas\s*=\s*["']?(script|fetch)["']?[^>]*>/gi, '');
  },
  extFor(local, type) {
    if (path.posix.extname(local.replace(/_[0-9a-f]{8}$/, ''))) return local;
    const e = TYPE_EXT[String(type).split(';')[0].trim().toLowerCase()];
    return e ? local + e : local;
  },
  allowed(rules, pathname) { return !rules.some((r) => pathname.startsWith(r.replace(/\*.*$/, ''))); },
  isPageLike(u) { return !ASSET_EXT.test(u.pathname) && (PAGE_EXT.test(u.pathname) || !path.posix.extname(u.pathname)); },
};

class SiteDownloader extends EventEmitter {
  constructor() { super(); this.job = null; }

  status() { return this.job ? this.snapshot() : null; }
  snapshot() {
    const j = this.job;
    return {
      id: j.id, url: j.start, host: j.host, state: j.state, dir: j.dir, zip: j.zip || null,
      pages: j.pagesDone, pageLimit: j.opts.maxPages, queued: j.pageQueue.length, assets: j.assetsDone,
      bytes: j.bytes, errors: j.errors.length, errorList: j.errors.slice(-20), current: j.current, startedAt: j.startedAt, endedAt: j.endedAt || null,
      skippedRobots: j.skippedRobots, mode: j.opts.render ? 'render' : 'fast', scripts: j.opts.scripts,
      phase: j.phase, similarity: j.similarity || null,
    };
  }
  emitStatus() { const now = Date.now(); if (now - (this.lastEmit || 0) > 250 || this.job.state !== 'running') { this.lastEmit = now; this.emit('status', this.snapshot()); } }

  cancel() { if (this.job && this.job.state === 'running') { this.job.cancelled = true; return true; } return false; }

  async start(url, o = {}) {
    if (this.job?.state === 'running') throw new Error('Zaten bir indirme sürüyor');
    let u;
    try { u = new URL(String(url).trim().match(/^https?:\/\//i) ? String(url).trim() : 'https://' + String(url).trim()); } catch { throw new Error('Geçersiz adres'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('Yalnızca http / https adresleri');
    u.hash = '';
    const opts = {
      maxPages: Math.min(500, Math.max(1, +o.maxPages || 60)),
      maxDepth: Math.min(6, Math.max(0, o.maxDepth ?? 3)),
      robots: o.robots !== false,
      zip: o.zip !== false,
      delayMs: 250,
      render: o.render !== false,                       // tarayıcıda çiz (JS ile oluşan siteler birebir)
      scripts: o.scripts === 'keep' ? 'keep' : 'strip', // statik klon varsayılan: betikler kaldırılır
      verify: o.verify !== false,                       // klonu orijinalle karşılaştır
    };
    // Birebir kopya yalnızca sahibi olunan ya da izin alınan siteler için (telif / kimlik taklidi riski)
    if (o.authorized !== true) throw new Error('Klonlamadan önce bu sitenin sana ait olduğunu ya da sahibinden izin aldığını onaylamalısın');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
    const root = path.join(app.getPath('documents'), 'Orbit Siteler');
    const dir = path.join(root, `${u.host.replace(/[:]/g, '_')}_${stamp}`);
    fs.mkdirSync(dir, { recursive: true });
    this.job = {
      id: crypto.randomUUID(), start: u.href, host: u.host, dir, opts, state: 'running', startedAt: Date.now(),
      pageQueue: [{ u, depth: 0 }], seenPages: new Set([u.href]), seenAssets: new Set(), assetQueue: [],
      pages: new Map(), cssFiles: new Map(), pagesDone: 0, assetsDone: 0, bytes: 0, errors: [], current: u.href,
      robotRules: [], skippedRobots: 0, cancelled: false, phase: 'pages',
      assetPaths: new Map(), shots: new Map(), similarity: null,
    };
    log.info(`Site indirme başladı: ${u.href} (en çok ${opts.maxPages} sayfa, derinlik ${opts.maxDepth})`);
    this.run().catch((e) => { this.job.state = 'error'; this.job.errors.push({ url: this.job.current, error: e.message }); this.job.endedAt = Date.now(); this.emitStatus(); log.warn('Site indirme hatası', e); });
    return this.snapshot();
  }

  async fetchBuf(url, accept) {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: accept || '*/*', 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = +res.headers.get('content-length') || 0;
    if (len > MAX_FILE) throw new Error(`Dosya çok büyük (${(len / 1048576).toFixed(0)} MB)`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FILE) throw new Error('Dosya çok büyük');
    this.job.bytes += buf.length;
    if (this.job.bytes > MAX_TOTAL) throw new Error('Toplam 1 GB sınırına ulaşıldı');
    return { buf, type: res.headers.get('content-type') || '', finalUrl: new URL(res.url) };
  }

  write(rel, data) {
    const full = path.join(this.job.dir, ...rel.split('/'));
    if (!full.startsWith(this.job.dir)) throw new Error('Geçersiz yol');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
  }

  queueAsset(abs) {
    const j = this.job;
    if (!/^https?:$/.test(abs.protocol)) return;
    const key = abs.href.replace(/#.*$/, '');
    if (j.seenAssets.has(key)) return;
    j.seenAssets.add(key);
    j.assetQueue.push(new URL(key));
  }

  async run() {
    const j = this.job;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (j.opts.robots) {
      try { const r = await this.fetchBuf(new URL('/robots.txt', j.start).href, 'text/plain'); j.robotRules = H.robots(r.buf.toString('utf8')); } catch {}
    }

    // 1) Sayfalar (aynı alan adı, BFS)
    while (j.pageQueue.length && j.pagesDone < j.opts.maxPages && !j.cancelled) {
      const { u, depth } = j.pageQueue.shift();
      if (j.opts.robots && !H.allowed(j.robotRules, u.pathname)) { j.skippedRobots++; continue; }
      j.current = u.href; this.emitStatus();
      try {
        let buf, type, finalUrl, rendered = null;
        if (j.opts.render) {
          if (!j.renderer) j.renderer = new Renderer(j.id, UA, (host) => H.sameSite(host, j.host) || j.pages.size === 0);
          rendered = await j.renderer.render(u.href);
          ({ finalUrl } = rendered); buf = Buffer.from(rendered.html); type = 'text/html';
          j.bytes += buf.length;
        } else ({ buf, type, finalUrl } = await this.fetchBuf(u.href, 'text/html,application/xhtml+xml,*/*'));
        // Başlangıç adresi yönlendirirse (ör. wexon.dev → www.wexon.dev) sitenin adresi son adres olur
        if (j.pagesDone === 0 && !j.pages.size && finalUrl.host !== j.host) { log.info(`Site adresi yönlendirildi: ${j.host} → ${finalUrl.host}`); j.host = finalUrl.host; }
        if (!H.sameSite(finalUrl.host, j.host)) throw new Error('Başka bir alan adına yönlendirdi');
        if (!/html/i.test(type)) { // sayfa sandığımız şey aslında dosya
          this.write(H.localPath(u, j.host, false), buf); j.assetsDone++; j.pagesDone++; continue;
        }
        const html = buf.toString('utf8');
        const local = H.localPath(u, j.host, true);
        j.pages.set(local, { url: finalUrl, html });
        if (rendered) {
          j.shots.set(local, rendered.shot);
          // Tarayıcının gerçekten yüklediği her dosya (CSS içinden gelen yazı tipleri, sonradan yüklenen görseller)
          for (const r of rendered.resources) { try { this.queueAsset(new URL(r)); } catch {} }
        }
        for (const r of H.htmlRefs(html)) {
          let abs; try { abs = new URL(r.raw, finalUrl); } catch { continue; }
          abs.hash = '';
          if (r.kind === 'page' && H.sameSite(abs.host, j.host) && /^https?:$/.test(abs.protocol) && H.isPageLike(abs)) {
            if (!j.seenPages.has(abs.href) && depth < j.opts.maxDepth) { j.seenPages.add(abs.href); j.pageQueue.push({ u: abs, depth: depth + 1 }); }
          } else if (r.kind === 'asset' || (r.kind === 'page' && H.sameSite(abs.host, j.host) && ASSET_EXT.test(abs.pathname))) {
            this.queueAsset(abs);
          }
        }
        j.pagesDone++;
      } catch (e) { j.errors.push({ url: u.href, error: e.message }); }
      this.emitStatus();
      await sleep(j.opts.delayMs);
    }

    // 2) Dosyalar (CSS içindekiler de kuyruğa girer), 4 paralel
    const worker = async () => {
      while (j.assetQueue.length && !j.cancelled) {
        const a = j.assetQueue.shift();
        j.current = a.href; this.emitStatus();
        try {
          const { buf, type } = await this.fetchBuf(a.href);
          const local = H.extFor(H.localPath(a, j.host, false), type);
          j.assetPaths.set(a.href, local);
          if (/\.css$/i.test(a.pathname) || /text\/css/i.test(type)) {
            const css = buf.toString('utf8');
            j.cssFiles.set(local, { url: a, css });
            for (const r of H.cssRefs(css)) { try { this.queueAsset(new URL(r.raw, a)); } catch {} }
          } else this.write(local, buf);
          j.assetsDone++;
        } catch (e) { j.errors.push({ url: a.href, error: e.message }); }
      }
    };
    j.phase = 'assets';
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    j.phase = 'write';

    // 3) Bağlantıları yerel dosyalara çevir ve yaz
    const downloadedPages = new Set(j.pages.keys());
    const mapRef = (raw, base, fromLocal, kind) => {
      let abs; try { abs = new URL(raw, base); } catch { return null; }
      if (!/^https?:$/.test(abs.protocol)) return null;
      const hash = abs.hash; abs.hash = '';
      if (kind === 'page' && H.sameSite(abs.host, j.host) && H.isPageLike(abs)) {
        const lp = H.localPath(abs, j.host, true);
        return downloadedPages.has(lp) ? H.rel(fromLocal, lp, hash) : abs.href + hash; // indirilmediyse çevrim içi
      }
      if (kind === 'page' && !H.sameSite(abs.host, j.host)) return null; // dış site bağlantısı olduğu gibi kalır
      const lp = j.assetPaths.get(abs.href);
      return lp ? H.rel(fromLocal, lp, hash) : null;
    };
    const rewriteCss = (css, base, fromLocal) => css
      .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, raw) => { const r = mapRef(raw.trim(), base, fromLocal, 'asset'); return r ? `url(${q}${r}${q})` : m; })
      .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, raw) => { const r = mapRef(raw.trim(), base, fromLocal, 'asset'); return r ? `@import ${q}${r}${q}` : m; });

    for (const [local, { url, css }] of j.cssFiles) this.write(local, rewriteCss(css, url, local));
    for (const [local, { url, html }] of j.pages) {
      let out = (j.opts.scripts === 'strip' && j.opts.render ? H.stripScripts(html) : html)
        .replace(/<base\b[^>]*>/gi, '')
        .replace(/\s(integrity|crossorigin)\s*=\s*("[^"]*"|'[^']*')/gi, '')
        .replace(/(<(?:a|area)\b[^>]*?\bhref\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre, all, d, s) => { const raw = d ?? s; const r = mapRef(raw, url, local, 'page'); return r ? `${pre}"${r}"` : m; })
        .replace(/(<link\b[^>]*?\bhref\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre, all, d, s) => { const r = mapRef(d ?? s, url, local, /stylesheet|icon|preload|manifest/i.test(m) ? 'asset' : 'page'); return r ? `${pre}"${r}"` : m; })
        .replace(/(\b(?:src|poster|data-src|data-original|data-lazy-src)\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre, all, d, s) => { const r = mapRef(d ?? s, url, local, 'asset'); return r ? `${pre}"${r}"` : m; })
        .replace(/(\b(?:srcset|data-srcset)\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre, all, d, s) => `${pre}"${(d ?? s).split(',').map((part) => { const [u0, ...rest] = part.trim().split(/\s+/); const r = mapRef(u0, url, local, 'asset'); return [r || u0, ...rest].join(' '); }).join(', ')}"`)
        .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, b) => a + rewriteCss(css, url, local) + b)
        .replace(/(\sstyle\s*=\s*")([^"]*)(")/gi, (m, a, css, b) => a + rewriteCss(css.replace(/&quot;/g, "'"), url, local).replace(/"/g, '&quot;') + b);
      this.write(local, out);
    }

    // 4) Doğrulama: klonu internetsiz aç, orijinal ekranla karşılaştır
    if (j.opts.render && j.opts.verify && !j.cancelled && j.shots.size) {
      j.phase = 'verify';
      const rows = []; let blocked = 0;
      fs.mkdirSync(path.join(j.dir, '_orbit'), { recursive: true });
      let n = 0;
      for (const [local, orig] of [...j.shots].slice(0, 10)) {
        j.current = `Karşılaştırılıyor: ${local}`; this.emitStatus();
        try {
          const r = await renderOffline(path.join(j.dir, ...local.split('/')), j.id);
          blocked += r.blocked;
          const score = similarity(orig, r.shot);
          n++;
          fs.writeFileSync(path.join(j.dir, '_orbit', `${n}-orijinal.png`), orig);
          fs.writeFileSync(path.join(j.dir, '_orbit', `${n}-klon.png`), r.shot);
          rows.push({ page: local, score, original: path.join(j.dir, '_orbit', `${n}-orijinal.png`), clone: path.join(j.dir, '_orbit', `${n}-klon.png`) });
        } catch (e) { j.errors.push({ url: local, error: 'Karşılaştırma: ' + e.message }); }
      }
      const avg = rows.length ? +(rows.reduce((t, r) => t + r.score, 0) / rows.length).toFixed(1) : null;
      j.similarity = { avg, blocked, pages: rows };
      log.info(`Klon benzerliği: ortalama %${avg} (${rows.length} sayfa), çevrimdışı açılışta ${blocked} internet isteği engellendi`);
    }

    // 5) Özet ve zip
    const summary = { kaynak: j.start, indirilme: new Date().toISOString(), sayfa: j.pagesDone, dosya: j.assetsDone, boyutMB: +(j.bytes / 1048576).toFixed(1), hatalar: j.errors, robotsAtlanan: j.skippedRobots, yontem: j.opts.render ? 'tarayıcıda çizim' : 'yalnızca HTML', betikler: j.opts.scripts, benzerlik: j.similarity, arac: 'Orbit Site Klonlayıcı · wexon.dev' };
    fs.writeFileSync(path.join(j.dir, '_orbit-ozet.json'), JSON.stringify(summary, null, 2));
    if (j.cancelled) { j.state = 'cancelled'; }
    else {
      if (j.opts.zip) {
        j.current = 'Zip oluşturuluyor…'; this.emitStatus();
        const zip = j.dir + '.zip';
        await new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `Compress-Archive -LiteralPath '${j.dir.replace(/'/g, "''")}' -DestinationPath '${zip.replace(/'/g, "''")}' -Force`], { windowsHide: true, timeout: 10 * 60 * 1000 }, (e) => { if (!e) j.zip = zip; else j.errors.push({ url: 'zip', error: e.message }); res(); }));
      }
      j.state = 'done';
    }
    j.current = ''; j.endedAt = Date.now(); j.phase = 'done';
    j.renderer = null;
    log.info(`Site indirme bitti (${j.state}): ${j.pagesDone} sayfa, ${j.assetsDone} dosya, ${(j.bytes / 1048576).toFixed(1)} MB, ${j.errors.length} hata`);
    this.emitStatus();
    this.emit('done', this.snapshot());
  }
}

module.exports = new SiteDownloader();
module.exports.H = H;
