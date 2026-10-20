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
  assert.deepEqual(rules, ['/admin', '/tmp/*']);
  assert.equal(H.allowed(rules, '/admin/giris'), false);
  assert.equal(H.allowed(rules, '/tmp/x'), false);
  assert.equal(H.allowed(rules, '/yok'), true, 'yalnızca * kuralları geçerli');
  assert.equal(H.isPageLike(new URL('https://s.com/img/a.png')), false);
  assert.equal(H.isPageLike(new URL('https://s.com/iletisim')), true);
});

test('www. olan ve olmayan adres aynı site', () => {
  assert.equal(H.sameSite('www.wexon.dev', 'wexon.dev'), true);
  assert.equal(H.sameSite('cdn.wexon.dev', 'wexon.dev'), false);
  assert.equal(H.localPath(new URL('https://www.site.com/a.png'), 'site.com', false), 'a.png');
});
