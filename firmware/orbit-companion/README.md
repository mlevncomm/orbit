# Orbit Companion Firmware

ESP32 kartının Orbit ile konuşmasını sağlayan firmware. Protokol: JSON Lines v1 (`src/main/esp32/protocol.js` ile aynı).

## Durum

- **2026-10-19: COM3'teki karta yüklendi ve çift yönlü test edildi** (`npm run test:hardware`, 7/7).
  Derleme: arduino-cli 1.5.1, esp32 core 3.3.12, ArduinoJson 7.4.3, `-DORBIT_LED_PIN=2` (kartta mavi LED var, kullanıcı doğruladı; aç/kapat/yanıp sönme test edildi).
- Yükleme notu: arduino-cli'nin paketlediği esptool 5.3.1 bu kartın CH340 köprüsüyle "Unable to verify flash chip
  connection" hatası verdi; aynı dosyalar pip ile kurulan esptool 5.6.0 ile 460800 baud'da sorunsuz yüklendi:
  ```powershell
  py -3 -m esptool --chip esp32 --port COM3 --baud 460800 write-flash -z --flash-mode keep --flash-freq keep --flash-size keep `
    0x1000 build\orbit-companion.ino.bootloader.bin 0x8000 build\orbit-companion.ino.partitions.bin `
    0xe000 "$env:LOCALAPPDATA\Arduino15\packages\esp32\hardware\esp32\3.3.12\tools\partitions\boot_app0.bin" `
    0x10000 build\orbit-companion.ino.bin
  ```
- **Eski programa geri dönmek için** (yedek `firmware/backups/`, git'e eklenmez; SHA-256 dosyası yanında):
  `py -3 -m esptool --port COM3 --baud 460800 write-flash 0 firmware\backups\esp32-COM3-a0dd6ca36934-20261019-1606.bin`
- COM3'teki kart esptool v5.6 ile doğrulandı (2026-10-19, salt okunur):
  **ESP32-D0WDQ6 rev v1.1**, çift çekirdek 240 MHz, Wi-Fi + BT, kristal 40 MHz, **4 MB flash**, USB köprüsü WCH CH340.
  Bu firmware bu çiple uyumlu (FQBN: `esp32:esp32:esp32`).
- Kartta şu an **başka bir program yüklü** (0x10000'de geçerli uygulama görüntüsü, magic 0xE9). Yükleme onu siler: önce yedek al.
- Dahili LED pini doğrulanmadı. DevKit V1 tipi kartlarda genellikle GPIO2'dir; emin değilsen `ORBIT_LED_PIN` tanımlama (firmware LED'i bildirmez).

## Yüklemeden önce

1. **Mevcut firmware'i yedekle.** Yükleme karttaki programı siler:
   `esptool --port COM3 read_flash 0 ALL yedek.bin` (flash boyutu `esptool flash_id` ile görülür)
2. Çipi doğrula: `esptool --port COM3 chip_id`
3. Dahili LED pinini öğren. Bazı kartlarda LED yoktur. Gerekirse `ORBIT_LED_PIN` değerini tanımla; tanımlı değilse firmware LED'i bildirmez.

## Derleme ve yükleme (arduino-cli)

```powershell
arduino-cli core install esp32:esp32
arduino-cli lib install ArduinoJson
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/orbit-companion
arduino-cli upload  --fqbn esp32:esp32:esp32 -p COM3 firmware/orbit-companion
```

LED pini olan bir DevKit için: `--build-property "build.extra_flags=-DORBIT_LED_PIN=2"`

## Mesajlar

| PC → kart | Kart → PC |
|---|---|
| `{"v":1,"id":1,"t":"HELLO","app":"orbit"}` | `{"v":1,"id":1,"t":"HELLO","fw":"orbit-companion","ver":"0.1.0","chip":"ESP32-D0WD-V3","caps":[...]}` |
| `{"v":1,"id":2,"t":"STATUS"}` | `{"v":1,"id":2,"t":"STATUS","uptimeMs":...,"heapFree":...,"led":false}` |
| `{"v":1,"id":3,"t":"HEARTBEAT"}` | `{"v":1,"id":3,"t":"HEARTBEAT","uptimeMs":...}` |
| `{"v":1,"id":4,"t":"COMMAND","cmd":"led","state":"blink","ms":2000}` | `{"v":1,"id":4,"t":"RESPONSE","ok":true,...}` |
| hatalı istek | `{"v":1,"id":4,"t":"ERROR","code":"NO_LED","error":"..."}` |

Kart kendiliğinden `{"t":"EVENT",...}` gönderebilir (ör. açılış). Orbit bu olayları **asla doğrudan sistem komutuna çevirmez**; yalnızca izin verilmiş otomasyonlar tetiklenebilir.
