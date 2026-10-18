// Sürücüler: 1) Windows Update sürücü kanalı (donanım kimliğine göre anakartın/cihazın onaylı sürücüleri)
//            2) Üretici araçları (NVIDIA App, Intel DSA, AMD Adrenalin sayfası, anakart destek sayfası)
const { runPS, runPSJson } = require('./ps');

const SEARCHER = `
  $session = New-Object -ComObject Microsoft.Update.Session
  $searcher = $session.CreateUpdateSearcher()
  $searcher.ServerSelection = 2   # doğrudan Windows Update
  $result = $searcher.Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
`;

/** Windows Update üzerinden bu bilgisayara uygun, kurulmamış sürücüleri listeler. */
async function scanWindowsUpdate() {
  const list = await runPSJson(`${SEARCHER}
    @($result.Updates | ForEach-Object {
      @{ id=$_.Identity.UpdateID; title=$_.Title; sizeMB=[math]::Round($_.MaxDownloadSize/1MB,1);
         cls=$_.DriverClass; vendor=$_.DriverManufacturer; model=$_.DriverModel;
         date=if($_.DriverVerDate){$_.DriverVerDate.ToString('yyyy-MM-dd')}else{$null} }
    }) | ConvertTo-Json -Depth 3 -Compress
  `, { timeoutMs: 10 * 60 * 1000 });
  return [].concat(list || []);
}

/**
 * Windows Update sürücülerini indirir ve kurar. ids boşsa bulunanların tümü kurulur.
 * onProgress({ index, total, title, stage, percent })
 */
async function installWindowsUpdate(ids, onProgress) {
  const filter = ids && ids.length ? `@(${ids.map((i) => `'${String(i).replace(/[^a-f0-9-]/gi, '')}'`).join(',')})` : '$null';
  let reboot = false, failed = 0, installed = 0;
  const r = await runPS(`${SEARCHER}
    $want = ${filter}
    $todo = @($result.Updates | Where-Object { $want -eq $null -or $want -contains $_.Identity.UpdateID })
    $i = 0
    foreach ($u in $todo) {
      $i++
      if (-not $u.EulaAccepted) { $u.AcceptEula() }
      $col = New-Object -ComObject Microsoft.Update.UpdateColl
      [void]$col.Add($u)
      Write-Output ("P|$i|$($todo.Count)|download|" + $u.Title)
      $dl = $session.CreateUpdateDownloader(); $dl.Updates = $col; [void]$dl.Download()
      Write-Output ("P|$i|$($todo.Count)|install|" + $u.Title)
      $ins = $session.CreateUpdateInstaller(); $ins.Updates = $col
      $res = $ins.Install()
      Write-Output ("R|$($res.ResultCode)|$($res.RebootRequired)|" + $u.Title)
    }
    Write-Output "DONE|$($todo.Count)"
  `, {
    timeoutMs: 60 * 60 * 1000,
    onLine: (line) => {
      const p = line.split('|');
      if (p[0] === 'P') {
        const index = +p[1], total = +p[2];
        const base = ((index - 1) / total) * 100, step = 100 / total;
        onProgress?.({ index, total, stage: p[3], title: p.slice(4).join('|'), percent: Math.round(base + (p[3] === 'install' ? step * 0.5 : 0)) });
      } else if (p[0] === 'R') {
        // ResultCode: 2 = başarılı, 3 = hatalarla başarılı
        if (p[1] === '2' || p[1] === '3') installed++; else failed++;
        if (p[2] === 'True') reboot = true;
      }
    },
  });
  if (r.code !== 0 && !installed) throw new Error(r.stderr.split('\n')[0] || 'Windows Update hatası');
  return { installed, failed, reboot };
}

const enc = encodeURIComponent;

/** Algılanan donanıma göre üretici araçları / sayfaları önerir. */
function vendorRecommendations(sys) {
  const recs = [];
  const gpuNames = (sys?.gpus || []).map((g) => g.name || '').join(' | ');
  const cpu = sys?.cpu?.name || '';
  const boardVendor = (sys?.board?.vendor || '').toLowerCase();
  const board = sys?.board?.product || '';

  if (/nvidia|geforce|rtx|gtx/i.test(gpuNames)) {
    recs.push({ key: 'drv_nvidia', name: 'NVIDIA App', target: 'Ekran Kartı', color: '#76b900', desc: 'GeForce Game Ready sürücülerini indirir ve güncel tutar.', source: 'winget', wingetId: 'Nvidia.NVIDIAApp', auto: true });
  }
  if (/amd|radeon/i.test(gpuNames)) {
    recs.push({ key: 'drv_amdgpu', name: 'AMD Adrenalin', target: 'Ekran Kartı', color: '#ed1c24', desc: 'Radeon için en güncel sürücü. AMD sessiz paket sunmadığı için resmi Auto-Detect sayfası açılır; temel sürücü Windows Update ile otomatik kurulur.', source: 'link', url: 'https://www.amd.com/en/support/download/drivers.html', auto: false });
  }
  if (/intel/i.test(gpuNames) || /intel/i.test(cpu)) {
    recs.push({ key: 'drv_intel', name: 'Intel Driver & Support Assistant', target: /intel/i.test(gpuNames) ? 'Ekran Kartı / Yonga Seti' : 'Yonga Seti', color: '#0071c5', desc: 'Intel grafik, Wi-Fi, Bluetooth ve yonga seti sürücülerini algılar ve günceller.', source: 'winget', wingetId: 'Intel.IntelDriverAndSupportAssistant', auto: true });
  }
  if (/amd|ryzen/i.test(cpu)) {
    recs.push({ key: 'drv_amdchipset', name: 'AMD Yonga Seti Sürücüsü', target: 'İşlemci / Yonga Seti', color: '#111111', desc: `${cpu} için güç planı ve yonga seti sürücüsü. Resmi indirme sayfası açılır.`, source: 'link', url: 'https://www.amd.com/en/support/download/drivers.html', auto: false });
  }
  if (board) {
    let url = `https://www.google.com/search?q=${enc(`${sys.board.vendor} ${board} drivers support`)}`;
    if (boardVendor.includes('gigabyte')) url = `https://www.gigabyte.com/Search?kw=${enc(board)}`;
    else if (boardVendor.includes('asus')) url = `https://www.asus.com/searchresult?searchType=support&searchKey=${enc(board)}`;
    else if (boardVendor.includes('micro-star') || boardVendor.includes('msi')) url = `https://www.msi.com/search/${enc(board)}`;
    else if (boardVendor.includes('asrock')) url = `https://www.asrock.com/search/index.asp?Keyword=${enc(board)}`;
    recs.push({ key: 'drv_board', name: `${board} Destek Sayfası`, target: 'Anakart', color: '#f59e0b', desc: 'LAN, ses, Wi-Fi ve BIOS için üreticinin sayfası. Bu sürücülerin çoğu Windows Update ile de otomatik gelir.', source: 'link', url, auto: false });
  }
  // RGB: anakart, RAM, ekran kartı ve çoğu çevre birimi için ortak kontrol
  recs.push({ key: 'drv_openrgb', name: 'OpenRGB', target: 'RGB Aydınlatma', color: '#e0245e', desc: 'Anakart, RAM, ekran kartı, fan, klavye ve fare ışıklarını tek yerden yönetir. Orbit\'in RGB sayfası bunu kullanır.', source: 'winget', wingetId: 'OpenRGB.OpenRGB', auto: true });

  // USB üretici kimliklerine (VID) göre çevre birimi yazılımları
  const PERIPHERALS = {
    '046D': { name: 'Logitech G HUB', wingetId: 'Logitech.GHUB', color: '#00b8fc', what: 'Logitech fare / klavye / kulaklık' },
    '1B1C': { name: 'Corsair iCUE 5', wingetId: 'Corsair.iCUE.5', color: '#ffd400', what: 'Corsair cihazları' },
    '1532': { name: 'Razer Synapse 4', wingetId: 'RazerInc.RazerInstaller.Synapse4', color: '#44d62c', what: 'Razer cihazları' },
    '1038': { name: 'SteelSeries GG', wingetId: 'SteelSeries.GG', color: '#ff5200', what: 'SteelSeries cihazları' },
  };
  for (const vid of sys?.usbVids || []) {
    const p = PERIPHERALS[String(vid).toUpperCase()];
    if (p) recs.push({ key: 'drv_vid_' + vid, name: p.name, target: 'Çevre Birimi', color: p.color, desc: `${p.what} algılandı: tuş atama, DPI, makro ve üretici sürücüsü.`, source: 'winget', wingetId: p.wingetId, auto: true });
  }
  return recs;
}

module.exports = { scanWindowsUpdate, installWindowsUpdate, vendorRecommendations };
