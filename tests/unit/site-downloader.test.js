require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const { H } = require('../../src/main/services/site-downloader');

test('HTML başvuruları: sayfa bağlantıları, dosyalar, srcset, stil içi url; mailto/#/data atlanır', () => {
  const html = `<a href="/hakkimizda">x</a><a href="#ust">y</a><a href="mailto:a@b.c">z</a>
    <link rel="stylesheet" href="css/site.css"><link rel="canonical" href="https://site.com/">
    <img src="/img/logo.png" srcset="/img/a.png 1x, /img/a@2x.png 2x"><script src='https://cdn.x.com/lib.js'></script>
    <div style="background:url('/img/bg.jpg')"></div><img src="data:image/png;base64,AAA">`;
  const refs = H.htmlRefs(html);
  const pages = refs.filter((r) => r.kind === 'page').map((r) => r.raw);
  const assets = refs.filter((r) => r.kind === 'asset').map((r) => r.raw);
  assert.deepEqual(pages, ['/hakkimizda', 'https://site.com/']);
  for (const a of ['css/site.css', '/img/logo.png', '/img/a.png', '/img/a@2x.png', 'https://cdn.x.com/lib.js', '/img/bg.jpg']) assert.ok(assets.includes(a), a);
  assert.ok(!assets.some((a) => a.startsWith('data:')));
});

test('CSS başvuruları: url() ve @import', () => {
  const refs = H.cssRefs(`@import "base.css"; .a{background:url(../img/x.png)} .b{src:url("f.woff2") format("woff2")} .c{background:url(data:image/png;base64,AA)}`).map((r) => r.raw);
  assert.deepEqual(refs.sort(), ['../img/x.png', 'base.css', 'f.woff2'].sort());
});

test('yerel yollar: sayfa index.html, sorgu dizesi özetle, CDN _harici altına', () => {
  const host = 'site.com';
  assert.equal(H.localPath(new URL('https://site.com/'), host, true), 'index.html');
  assert.equal(H.localPath(new URL('https://site.com/blog/yazi'), host, true), 'blog/yazi/index.html');
  assert.equal(H.localPath(new URL('https://site.com/a.php'), host, true), 'a.php.html');
  assert.match(H.localPath(new URL('https://site.com/css/s.css?v=3'), host, false), /^css\/s_[0-9a-f]{8}\.css$/);
  assert.equal(H.localPath(new URL('https://cdn.x.com/lib.js'), host, false), '_harici/cdn.x.com/lib.js');
  assert.equal(H.localPath(new URL('https://site.com/img/a%20b.png'), host, false), 'img/a b.png');
});

test('göreli bağlantı ve robots.txt kuralları', () => {
  assert.equal(H.rel('blog/yazi/index.html', 'css/s.css'), '../../css/s.css');
  assert.equal(H.rel('index.html', 'img/a.png'), './img/a.png');
  assert.equal(H.rel('index.html', 'hakkimizda/index.html', '#ekip'), './hakkimizda/index.html#ekip');
  const rules = H.robots('User-agent: Googlebot\nDisallow: /yok\n\nUser-agent: *\nDisallow: /admin\nDisallow: /tmp/*\n');
  assert.deepEqual(rules, [{ allow: false, pat: '/admin' }, { allow: false, pat: '/tmp/*' }]);
  assert.equal(H.allowed(rules, '/admin/giris'), false);
  assert.equal(H.allowed(rules, '/tmp/x'), false);
  assert.equal(H.allowed(rules, '/yok'), true, 'yalnızca * kuralları geçerli');
  // pentayazilim.com: "/*?page=" tüm siteyi DEĞİL yalnızca sayfalama adreslerini yasaklar
  const penta = H.robots('User-agent: *\n\n\n\nDisallow: /*?page=\nDisallow: /*?filter=\n\nSitemap: https://x/sitemap.xml\n');
  assert.equal(H.allowed(penta, '/'), true);
  assert.equal(H.allowed(penta, '/hizmetler'), true);
  assert.equal(H.allowed(penta, '/blog?page=2'), false);
  // "$" son, Allow önceliği (en uzun eşleşme), boş Disallow, ortak grup
  const r2 = H.robots('User-agent: a\nUser-agent: *\nDisallow: /*.pdf$\nDisallow: /ozel/\nAllow: /ozel/acik\nDisallow:\n');
  assert.equal(H.allowed(r2, '/dosya.pdf'), false);
  assert.equal(H.allowed(r2, '/dosya.pdf?x=1'), true);
  assert.equal(H.allowed(r2, '/ozel/gizli'), false);
  assert.equal(H.allowed(r2, '/ozel/acik/sayfa'), true);
  // HTML varlıkları çözülür; srcset'teki data: adresi dosya sanılmaz
  assert.equal(H.unent('/m/b&amp;C-webp.webp?x=1&#38;y=2'), '/m/b&C-webp.webp?x=1&y=2');
  assert.deepEqual(H.srcsetUrls('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7 1x, /a,b.png 2x, /c.png 3x'), ['/a,b.png', '/c.png']);
  assert.deepEqual(H.htmlRefs('<img src="/m/b&amp;C.webp" srcset="data:image/gif;base64,R0lG 1x">').map((r) => r.raw), ['/m/b&C.webp']);
  assert.equal(H.isPageLike(new URL('https://s.com/img/a.png')), false);
  assert.equal(H.isPageLike(new URL('https://s.com/iletisim')), true);
});

test('www. olan ve olmayan adres aynı site', () => {
  assert.equal(H.sameSite('www.wexon.dev', 'wexon.dev'), true);
  assert.equal(H.sameSite('cdn.wexon.dev', 'wexon.dev'), false);
  assert.equal(H.localPath(new URL('https://www.site.com/a.png'), 'site.com', false), 'a.png');
});

test('statik klon: betikler ve noscript kaldırılır, JSON-LD ve stiller kalır; uzantısız dosyaya türüne göre uzantı', () => {
  const html = `<head><script src="/_next/a.js"></script><script>window.x=1</script><script type="application/ld+json">{"@type":"Org"}</script>
    <link rel="modulepreload" href="/m.js"><link rel="preload" as="script" href="/p.js"><link rel="stylesheet" href="/s.css"></head>
    <body><noscript><img src="/px.gif"></noscript><div>içerik</div></body>`;
  const out = H.stripScripts(html);
  assert.ok(!/_next\/a\.js|window\.x|modulepreload|as="script"|noscript/.test(out));
  assert.match(out, /application\/ld\+json/);
  assert.match(out, /stylesheet/);
  assert.match(out, /içerik/);
  assert.equal(H.extFor('_next/image/index_ab12cd34', 'image/webp'), '_next/image/index_ab12cd34.webp');
  assert.equal(H.extFor('img/logo.png', 'image/png'), 'img/logo.png');
  assert.equal(H.extFor('font/x', 'font/woff2; charset=binary'), 'font/x.woff2');
});

test('klonlama izin onayı olmadan başlamaz', async () => {
  const dl = require('../../src/main/services/site-downloader');
  await assert.rejects(() => dl.start('https://ornek.com', {}), /izin/);
});
