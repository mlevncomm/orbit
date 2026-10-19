// Format sonrası hazırlık kontrolü: kurulum öncesi sistemin hazır olup olmadığını denetler.
// Her kontrol: { id, title, status: 'ok'|'warn'|'fail', detail, fix? }  — fix: onarım eylemi kimliği
// Onarımlar yalnızca kullanıcı onayıyla ve Microsoft'un belgelenmiş yöntemleriyle çalışır.
const { runPS, runPSJson } = require('./ps');
const log = require('./log');

const MIN_WINGET = [1, 6];

async function timedFetch(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'HEAD', signal: ctl.signal, redirect: 'follow' });
    return { ok: r.ok || r.status === 405, status: r.status };
  } catch (e) { return { ok: false, error: e.name === 'AbortError' ? 'zaman aşımı' : e.message }; } finally { clearTimeout(t); }
}

const cmpVer = (v, min) => { const p = String(v).replace(/^v/, '').split('.').map(Number); return p[0] > min[0] || (p[0] === min[0] && p[1] >= min[1]); };

async function check() {
  const t0 = Date.now();
  const sys = await runPSJson(`
    $os = Get-CimInstance Win32_OperatingSystem
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $reboot = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or
              (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')
    $appi = Get-AppxPackage -Name Microsoft.DesktopAppInstaller -ErrorAction SilentlyContinue | Select-Object -First 1
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $wg = Get-Command winget -ErrorAction SilentlyContinue
    @{ caption=$os.Caption; build=[int]$os.BuildNumber; arch=$env:PROCESSOR_ARCHITECTURE; admin=$admin; reboot=$reboot;
       appInstaller = if ($appi) { [string]$appi.Version } else { $null };
       freeGB=[math]::Round($disk.FreeSpace/1GB); wingetPath = if ($wg) { $wg.Source } else { $null } } | ConvertTo-Json -Compress
  `, { timeoutMs: 60000 });

  const out = [];
  const add = (c) => out.push(c);
  add({ id: 'os', title: 'Windows sürümü', status: sys.build >= 17763 ? 'ok' : 'fail', detail: `${sys.caption} · derleme ${sys.build} · ${sys.arch}` + (sys.build >= 17763 ? '' : ' — winget için Windows 10 1809 veya üstü gerekir') });
  add({ id: 'admin', title: 'Yönetici yetkisi', status: sys.admin ? 'ok' : 'warn', detail: sys.admin ? 'Sessiz kurulum ve sürücü yükleme yapılabilir' : 'Yönetici olmadan bazı kurulumlar onay penceresi açar veya başarısız olur', fix: sys.admin ? null : 'relaunch-admin' });

  const [cdn, gh] = await Promise.all([timedFetch('https://cdn.winget.microsoft.com/cache/source.msix'), timedFetch('https://github.com')]);
  add({ id: 'net', title: 'İnternet ve paket sunucusu', status: cdn.ok ? 'ok' : gh.ok ? 'warn' : 'fail', detail: cdn.ok ? 'winget paket sunucusuna erişiliyor (HTTPS/TLS çalışıyor)' : gh.ok ? `İnternet var ama winget sunucusuna erişilemedi (${cdn.error || cdn.status})` : `İnternet bağlantısı yok (${cdn.error || cdn.status})` });

  let wver = null;
  if (sys.wingetPath) {
    const r = await runPS('winget --version', { timeoutMs: 30000 });
    wver = (r.stdout.match(/v?\d+\.\d+[\d.]*/) || [])[0] || null;
  }
  if (!wver) add({ id: 'winget', title: 'winget paket yöneticisi', status: 'fail', detail: 'winget bulunamadı. Program kurulumu için gerekli.', fix: 'winget-install' });
  else add({ id: 'winget', title: 'winget paket yöneticisi', status: cmpVer(wver, MIN_WINGET) ? 'ok' : 'warn', detail: `Sürüm ${wver}${sys.appInstaller ? ' · App Installer ' + sys.appInstaller : ''}${cmpVer(wver, MIN_WINGET) ? '' : ' — eski, güncellenmesi önerilir'}`, fix: cmpVer(wver, MIN_WINGET) ? null : 'winget-install' });

  if (wver && cdn.ok) {
    // Kaynak sağlığı: bilinen bir paketin bilgisini çek (kurulum yapmaz)
    const r = await runPS("winget show --id Git.Git -e --source winget --accept-source-agreements --disable-interactivity | Out-Null; $LASTEXITCODE", { timeoutMs: 90000 });
    const code = parseInt(r.stdout.trim().split(/\s+/).pop(), 10);
    add({ id: 'source', title: 'winget paket kaynağı', status: code === 0 ? 'ok' : 'fail', detail: code === 0 ? 'Paket kataloğu okunabiliyor' : `Paket kataloğu okunamadı (kod ${code}). Kaynak sıfırlanabilir.`, fix: code === 0 ? null : 'winget-source-reset' });
  }

  add({ id: 'reboot', title: 'Bekleyen yeniden başlatma', status: sys.reboot ? 'warn' : 'ok', detail: sys.reboot ? 'Windows yeniden başlatma bekliyor; bazı kurulumlar başarısız olabilir' : 'Bekleyen yeniden başlatma yok' });
  add({ id: 'disk', title: 'Disk alanı (C:)', status: sys.freeGB >= 20 ? 'ok' : sys.freeGB >= 8 ? 'warn' : 'fail', detail: `${sys.freeGB} GB boş` });

  const ready = !out.some((c) => c.status === 'fail');
  log.info(`Hazırlık kontrolü: ${out.map((c) => c.id + '=' + c.status).join(' ')} (${Date.now() - t0} ms)`);
  return { ready, checks: out, at: Date.now() };
}

// Onarımlar — yalnızca kullanıcı arayüzden onaylayınca çağrılır
const REPAIRS = {
  // Microsoft'un belgelediği yöntem: Microsoft.WinGet.Client modülü ile winget'i kur/onar
  'winget-install': `
    Install-PackageProvider -Name NuGet -Force -Scope CurrentUser | Out-Null
    Install-Module -Name Microsoft.WinGet.Client -Force -Repository PSGallery -Scope CurrentUser | Out-Null
    Repair-WinGetPackageManager -AllUsers -Latest
    'ok'`,
  'winget-source-reset': `winget source reset --force; winget source update; 'ok'`,
};

async function repair(action) {
  const script = REPAIRS[action];
  if (!script) throw new Error('Bilinmeyen onarım');
  log.info('Onarım başlatıldı: ' + action);
  const r = await runPS(script, { timeoutMs: 10 * 60 * 1000 });
  const ok = r.stdout.includes('ok') && r.code === 0;
  log[ok ? 'info' : 'warn'](`Onarım ${action}: ${ok ? 'başarılı' : r.stderr.split('\n')[0]}`);
  if (!ok) throw new Error(r.stderr.split('\n').find((l) => l.trim()) || 'Onarım başarısız');
  return check();
}

module.exports = { check, repair, REPAIRS };
