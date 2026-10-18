// Donanım ve sistem bilgisi
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runPS, runPSJson } = require('./ps');

let cache = null;

async function getSystemInfo(force = false) {
  if (cache && !force) return cache;
  const info = await runPSJson(`
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name=$_.Name; driver=$_.DriverVersion; date=if($_.DriverDate){$_.DriverDate.ToString('yyyy-MM-dd')}else{$null}; vram=$_.AdapterRAM } })
    $bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
    $bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
    $cs = Get-CimInstance Win32_ComputerSystem
    $osi = Get-CimInstance Win32_OperatingSystem
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $vids = @(Get-CimInstance Win32_PnPEntity | ForEach-Object { $m=[regex]::Match([string]$_.PNPDeviceID,'VID_([0-9A-F]{4})'); if($m.Success){ $m.Groups[1].Value } } | Sort-Object -Unique)
    $problems = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 } | ForEach-Object { @{ name=$_.Name; code=$_.ConfigManagerErrorCode; id=$_.PNPDeviceID } })
    @{
      cpu = @{ name=$cpu.Name.Trim(); cores=$cpu.NumberOfCores; threads=$cpu.NumberOfLogicalProcessors; vendor=$cpu.Manufacturer }
      gpus = $gpus
      board = @{ vendor=$bb.Manufacturer; product=$bb.Product }
      bios = @{ vendor=$bios.Manufacturer; version=$bios.SMBIOSBIOSVersion }
      ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB)
      os = @{ name=$osi.Caption; build=$osi.BuildNumber; version=$osi.Version }
      disk = @{ totalGB=[math]::Round($disk.Size/1GB); freeGB=[math]::Round($disk.FreeSpace/1GB) }
      pcName = $env:COMPUTERNAME
      userName = $env:USERNAME
      problemDevices = $problems
      usbVids = $vids
    } | ConvertTo-Json -Depth 5 -Compress
  `);
  info.gpus = [].concat(info.gpus || []);
  info.problemDevices = [].concat(info.problemDevices || []);
  info.usbVids = [].concat(info.usbVids || []);
  cache = info;
  return info;
}

async function isAdmin() {
  const r = await runPS("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)");
  return r.stdout.trim() === 'True';
}

/** winget export ile kurulu paket kimliklerini döndürür (yerelleştirmeden bağımsız). */
async function getInstalledWingetIds() {
  const file = path.join(os.tmpdir(), `orbit-export-${Date.now()}.json`);
  await runPS(`winget export -o '${file}' --source winget --accept-source-agreements --disable-interactivity | Out-Null`, { timeoutMs: 120000 });
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = json.Sources.flatMap((s) => s.Packages.map((p) => p.PackageIdentifier.toLowerCase()));
    return ids;
  } catch {
    return [];
  } finally {
    fs.rm(file, () => {});
  }
}

/** winget search çıktısını (dil bağımsız, sütun konumlarına göre) ayrıştırır. */
async function wingetSearch(query) {
  const q = String(query).replace(/['"`$;|&]/g, '').slice(0, 60);
  if (!q.trim()) return [];
  const r = await runPS(`winget search '${q}' --source winget --accept-source-agreements --disable-interactivity`, { timeoutMs: 60000 });
  const lines = r.stdout.split(/\r?\n/).map((l) => l.replace(/^[\s\S]*\r/, '')); // ilerleme animasyonu kalıntılarını at
  const sep = lines.findIndex((l) => /^-{10,}/.test(l.trim()));
  if (sep < 1) return [];
  const header = lines[sep - 1];
  const starts = [0];
  for (let i = 1; i < header.length; i++) if (header[i - 1] === ' ' && header[i] !== ' ') starts.push(i);
  return lines.slice(sep + 1).filter((l) => l.trim()).slice(0, 30).map((l) => {
    const col = (i) => l.slice(starts[i], starts[i + 1] ?? l.length).trim();
    return { name: col(0), id: col(1), version: col(2) };
  }).filter((x) => x.id && !x.id.includes(' '));
}

module.exports = { getSystemInfo, isAdmin, getInstalledWingetIds, wingetSearch };
