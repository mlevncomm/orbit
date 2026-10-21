/* Projeler sayfası — wexon.dev depoları, canlı siteler, yerel klonlar, Vercel. app.js'deki S, I, h, $, toast, renderPage kullanır. */
const P = { data: null, loading: false, view: 'all', busy: {}, q: '' };
window.P = P;

const ago2 = (t) => {
  if (!t) return '—';
  const d = Math.round((Date.now() - new Date(t)) / 86400000);
  return d < 1 ? 'bugün' : d === 1 ? 'dün' : d < 30 ? `${d} gün önce` : d < 365 ? `${Math.round(d / 30)} ay önce` : `${Math.round(d / 365)} yıl önce`;
};
/** Dikkat gerektiren durumlar: başarısız derleme, çalışmayan site, geride kalan yerel klon */
function projIssues(p) {
  const list = p ? [p] : (P.data?.projects || []);
  const out = [];
  for (const x of list) {
    if (x.ci?.conclusion === 'failure') out.push({ p: x, text: `Son derleme başarısız (${x.ci.name})`, kind: 'error' });
    if (x.live && !x.live.ok) out.push({ p: x, text: `Canlı site yanıt vermiyor (${x.live.status ? 'HTTP ' + x.live.status : x.live.error})`, kind: 'error' });
    if (x.vercel?.deployment?.state === 'ERROR') out.push({ p: x, text: 'Son Vercel dağıtımı başarısız', kind: 'error' });
    if (x.local?.behind) out.push({ p: x, text: `Bilgisayardaki kopya ${x.local.behind} değişiklik geride`, kind: 'warn' });
    if (x.openPRs) out.push({ p: x, text: `${x.openPRs} açık PR`, kind: 'info' });
  }
  return out;
}

async function projLoad(force = false) {
  if (P.loading) return;
  P.loading = true; if (S.page === 'projects') renderPage();
  try { P.data = await api.projects.list(force); } catch (e) { toast(e.message, true); }
  P.loading = false;
  if (S.page === 'projects') { renderChrome(); renderPage(); }
}

async function projAct(name, kind) {
  P.busy[name] = kind; renderPage();
  try {
    if (kind === 'clone') { await api.projects.clone(name); toast(`${name} bilgisayara klonlandı`); }
    if (kind === 'pull') { const r = await api.projects.pull(name); toast(`${name}: ${r.message}`); }
    if (kind === 'code') await api.projects.code(name);
    if (kind === 'folder') await api.projects.folder(name);
    if (kind === 'clone' || kind === 'pull') { delete P.busy[name]; return projLoad(true); }
  } catch (e) { toast(e.message, true); }
  delete P.busy[name]; renderPage();
}

const ciBadge = (ci) => !ci ? '<span class="sub">CI yok</span>'
  : `<span class="age ${ci.conclusion === 'success' ? 'ok' : ci.conclusion === 'failure' ? 'old' : 'warn'}">${ci.conclusion === 'success' ? 'Derleme başarılı' : ci.conclusion === 'failure' ? 'Derleme başarısız' : ci.status === 'in_progress' ? 'Derleniyor' : (ci.conclusion || ci.status)}</span>`;
const liveBadge = (l) => !l ? '<span class="sub">site yok</span>'
  : `<span class="age ${l.ok ? (l.ms < 800 ? 'ok' : 'warn') : 'old'}">${l.ok ? `Canlı · ${l.ms} ms` : l.status ? `HTTP ${l.status}` : l.error}</span>`;

function projCard(p) {
  const busy = P.busy[p.name];
  const issues = projIssues(p).filter((i) => i.kind !== 'info');
  const l = p.local;
  return `<div class="card proj ${issues.length ? 'has-issue' : ''}">
    <div class="card-head">
      <span class="proj-ic">${h(p.name.replace(/^wexon[.-]?/i, '').slice(0, 1).toUpperCase() || 'W')}</span>
      <div><h3>${h(p.name)}</h3><p class="sub">${h(p.description.replace(/^wexon\.dev ·\s*/, '') || 'Açıklama yok')}</p></div>
      <span class="chip">${p.private ? I('lock', 13) + 'Özel' : I('globe', 13) + 'Açık'}</span>
    </div>
    <div class="proj-meta">
      <span>${I('code', 14)}${h(p.language || '—')}</span>
      <span>${I('refresh', 14)}${p.lastCommit ? `${h(p.lastCommit.message)} · ${ago2(p.lastCommit.at)}` : ago2(p.pushedAt)}</span>
      ${p.openPRs ? `<span>${I('message', 14)}${p.openPRs} açık PR</span>` : ''}
    </div>
    <div class="row proj-status">${ciBadge(p.ci)}${liveBadge(p.live)}
      ${p.vercel?.deployment ? `<span class="age ${p.vercel.deployment.state === 'READY' ? 'ok' : p.vercel.deployment.state === 'ERROR' ? 'old' : 'warn'}">Vercel: ${h(p.vercel.deployment.state)} · ${ago2(p.vercel.deployment.at)}</span>` : ''}
      ${l.cloned ? `<span class="age ${l.behind ? 'warn' : 'ok'}">Bilgisayarda · ${h(l.branch || '')}${l.changes ? ` · ${l.changes} değişiklik` : ''}${l.behind ? ` · ${l.behind} geride` : ''}</span>` : ''}</div>
    ${issues.length ? `<div class="note">${I('alert', 14)}<span>${issues.map((i) => h(i.text)).join(' · ')}</span></div>` : ''}
    <div class="row">
      <button class="btn sm" data-open="${h(p.url)}">${I('external', 14)}GitHub</button>
      ${p.site ? `<button class="btn sm" data-open="${h(p.site)}">${I('globe', 14)}Site</button>` : ''}
      ${p.ci?.url ? `<button class="btn sm" data-open="${h(p.ci.url)}">Derleme</button>` : ''}
      <span class="spacer"></span>
      ${l.cloned
        ? `<button class="btn sm" data-proj="folder" data-name="${h(p.name)}">${I('folder', 14)}Klasör</button>
           <button class="btn sm" data-proj="pull" data-name="${h(p.name)}" ${busy ? 'disabled' : ''}>${busy === 'pull' ? '<span class="spinner"></span>' : I('download', 14)}Güncelle</button>
           <button class="btn primary sm" data-proj="code" data-name="${h(p.name)}">${I('code', 14)}VS Code'da aç</button>`
        : `<button class="btn primary sm" data-proj="clone" data-name="${h(p.name)}" ${busy ? 'disabled' : ''}>${busy === 'clone' ? '<span class="spinner"></span>' : I('download', 14)}Bilgisayara klonla</button>`}
    </div>
  </div>`;
}

PAGES.projects = () => {
  const d = P.data;
  if (!d && !P.loading) projLoad();
  const titles = { all: ['Projeler', 'wexon.dev ürünleri · GitHub, canlı siteler, Vercel ve bilgisayarındaki kopyalar'], issues: ['Dikkat gerekenler', 'Başarısız derlemeler, çalışmayan siteler, açık PR\'lar'], live: ['Canlı siteler', 'Yayındaki adreslerin durumu ve yanıt süresi'], local: ['Bu bilgisayarda', 'Belgeler › Projeler'], vercel: ['Vercel', 'Projeler ve son dağıtımlar'] };
  const [t, sub] = titles[P.view] || titles.all;
  const head = `<div class="page-head"><div><h1>${t}</h1><p>${sub}</p></div>
    <button class="btn" data-proj="refresh" ${P.loading ? 'disabled' : ''}>${P.loading ? '<span class="spinner"></span>' : I('refresh')}Yenile</button></div>`;
  if (!d) return head + `<div class="card empty"><span class="spinner"></span><p>GitHub depoları, canlı siteler ve derlemeler kontrol ediliyor…</p></div>`;

  const ps = d.projects;
  const issues = projIssues();
  const live = ps.filter((p) => p.live);
  const banner = `<section class="page-banner mesh sky">
      <div><span class="kicker">wexon.dev · ${h(d.owner)}</span><h2>${ps.length} proje, ${issues.filter((i) => i.kind === 'error').length ? `${issues.filter((i) => i.kind === 'error').length} sorun` : 'sorun yok'}</h2>
        <p>Tüm depoların, yayındaki sitelerin ve derlemelerin durumu tek yerde. Son kontrol ${new Date(d.scannedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}.</p></div>
      <div class="banner-stats">
        <div class="stat glass"><b>${live.filter((p) => p.live.ok).length}/${live.length}</b><span>site çalışıyor</span></div>
        <div class="stat glass"><b>${ps.filter((p) => p.ci?.conclusion === 'failure').length}</b><span>başarısız derleme</span></div>
        <div class="stat glass"><b>${ps.reduce((n, p) => n + p.openPRs, 0)}</b><span>açık PR</span></div>
        <div class="stat glass"><b>${ps.filter((p) => p.local.cloned).length}</b><span>bilgisayarda</span></div>
      </div></section>`;

  if (P.view === 'issues') {
    return head + banner + (issues.length ? `<div class="card"><div class="rec-list">${issues.map((i) => `<div class="rec-item"><span class="status-dot ${i.kind === 'error' ? 'error' : i.kind === 'warn' ? 'warn' : ''}"></span><div class="txt"><b>${h(i.p.name)}</b><p>${h(i.text)}</p></div>
      ${i.p.ci?.url && /derleme/i.test(i.text) ? `<button class="btn sm" data-open="${h(i.p.ci.url)}">Derlemeyi aç</button>` : ''}${/PR/.test(i.text) ? `<button class="btn sm" data-open="${h(i.p.url)}/pulls">PR'lar</button>` : ''}${/site/i.test(i.text) && i.p.site ? `<button class="btn sm" data-open="${h(i.p.site)}">Siteyi aç</button>` : ''}</div>`).join('')}</div></div>`
      : `<div class="card empty small">${I('shield', 24)}<p>Dikkat gerektiren bir şey yok.</p></div>`);
  }
  if (P.view === 'live') {
    return head + banner + `<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Proje</th><th>Adres</th><th>Durum</th></tr></thead><tbody>
      ${live.map((p) => `<tr><td><b>${h(p.name)}</b></td><td><button class="btn sm ghost" data-open="${h(p.site)}">${h(p.site.replace(/^https?:\/\//, ''))} ${I('external', 13)}</button></td><td>${liveBadge(p.live)}</td></tr>`).join('')}
      </tbody></table></div>${ps.length - live.length ? `<p class="sub" style="margin-top:10px">Canlı adresi olmayan: ${h(ps.filter((p) => !p.live).map((p) => p.name).join(', '))}</p>` : ''}</div>`;
  }
  if (P.view === 'vercel') {
    if (!d.vercelConnected) return head + `<section class="page-banner mesh lilac"><div><span class="kicker">Vercel</span><h2>Vercel bağlı değil</h2><p>Vercel'de Account Settings › Tokens'tan bir token oluştur ve Ayarlar › Yapay zeka bölümündeki Vercel token alanına yapıştır. Token Windows hesabınla şifreli saklanır.</p><div class="row"><button class="btn primary" data-sub="ayarlar:1">Ayarlara git</button><button class="btn" data-open="https://vercel.com/account/settings/tokens">${I('external')}Token oluştur</button></div></div></section>`;
    const vps = [...ps.filter((p) => p.vercel).map((p) => ({ ...p.vercel, repoName: p.name })), ...d.vercelProjects];
    return head + (d.vercelError ? `<div class="banner">${I('alert')}<p>${h(d.vercelError)}</p></div>` : '') + `<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Vercel projesi</th><th>Depo</th><th>Son dağıtım</th><th>Adres</th></tr></thead><tbody>
      ${vps.map((v) => `<tr><td><b>${h(v.name)}</b><br><small class="sub">${h(v.framework || '')}</small></td><td>${h(v.repoName || v.repo || '—')}</td>
        <td>${v.deployment ? `<span class="age ${v.deployment.state === 'READY' ? 'ok' : v.deployment.state === 'ERROR' ? 'old' : 'warn'}">${h(v.deployment.state)}</span><br><small class="sub">${ago2(v.deployment.at)} · ${h(v.deployment.target || 'preview')}</small>` : '—'}</td>
        <td>${v.url ? `<button class="btn sm ghost" data-open="${h(v.url)}">${h(v.url.replace(/^https?:\/\//, ''))}</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="sub">Vercel\'de proje yok.</td></tr>'}
      </tbody></table></div></div>`;
  }
  const list = P.view === 'local' ? ps.filter((p) => p.local.cloned) : ps;
  return head + banner + (list.length ? `<div class="proj-grid">${list.map(projCard).join('')}</div>`
    : `<div class="card empty small"><p>Bilgisayarda klonlanmış proje yok. Tüm projeler'den "Bilgisayara klonla" ile ${h(d.root)} klasörüne indirebilirsin.</p></div>`);
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-proj]');
  if (!t || t.disabled) return;
  if (t.dataset.proj === 'refresh') return projLoad(true);
  projAct(t.dataset.name, t.dataset.proj);
});
