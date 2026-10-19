# Orbit

Format sonrası tek tıkla sürücü + program kurulumu, RGB aydınlatma kontrolü ve kişisel AI asistanı altyapısı olan Windows masaüstü uygulaması (Electron).

**İndir:** [Releases](https://github.com/mlevncomm/orbit/releases/latest) → `Orbit-Setup-x.y.z.exe`. Kurulu uygulama yeni sürümleri kendisi bulur.

## Geliştirme

```bash
npm install
npm start          # geliştirme (sessiz kurulum için terminali yönetici olarak açın)
npm run dist       # dist/ altında Orbit-Setup-x.y.z.exe üretir (yayınlamadan)
```

## Nasıl çalışır

| Parça | Kaynak |
|---|---|
| Sürücüler | Windows Update sürücü kanalı (donanım kimliğine göre Microsoft onaylı sürücüler) + üretici araçları: NVIDIA App, Intel DSA, USB kimliğine göre Logitech / Corsair / Razer / SteelSeries yazılımı, AMD ve anakart için resmi sayfa |
| Programlar | `winget` (60+ hazır program, kimlikler çıkış koduyla doğrulandı) — kurulu olanlar `winget export` ile işaretlenir |
| Özel programlar | winget araması, doğrudan .exe/.msi linki (sessiz parametreli), `npm -g` paketi veya PowerShell komutu |
| RGB | OpenRGB SDK sunucusu (port 6742): RAM, anakart, ekran kartı, klavye, fare, fan. Efektler Orbit'te hesaplanır, profiller kaydedilir, açılışta geri yüklenir |
| Güncelleme | electron-updater + GitHub Releases. Uygulama açılışta ve 4 saatte bir denetler, "Yeni güncelleme" bandı gösterir |
| Profil | Seçimler otomatik kaydedilir; Ayarlar'dan JSON olarak dışa/içe aktarılır (format öncesi USB'ye) |
| Asistan | Claude (Anthropic SDK, araç kullanımı) veya yerel Ollama |

## Klasör yapısı

```
src/main/
  main.js              pencere, tepsi, IPC
  preload.js           window.orbit API köprüsü
  services/            system, drivers, installer (kuyruk), catalog, rgb, updater, store, ps
  ai/
    assistant.js       sağlayıcı seçimi + sistem istemi
    tools.js           asistanın araçları  ← yeni yetenekler buraya register() ile
    providers/         anthropic.js, ollama.js
src/renderer/          index.html, styles.css, app.js, lights.js, icons.js (bağımlılıksız)
src/assets/icon.png    uygulama ikonu (npm run icon ile yeniden üretilir)
```

## Yeni sürüm yayınlamak

1. `package.json` içindeki `version` alanını artır (ör. 1.0.0 → 1.0.1), commit + push
2. PowerShell'de:

```powershell
npm run release   # veya: scripts\release.ps1 "Sürüm notları"
```

Kurulu Orbit'ler bir sonraki denetimde yeni sürümü görür ve "Güncellemeyi indir" bandını gösterir.

## Yeni katalog programı eklemek

`src/main/services/catalog.js` içindeki `RAW` listesine bir satır ekle. Kimliği önce `winget show --id <Kimlik> -e` ile kontrol et (çıkış kodu 0 olmalı).
