# Orbit Companion Firmware

ESP32 kartının Orbit ile konuşmasını sağlayan firmware. Protokol: JSON Lines v1 (`src/main/esp32/protocol.js` ile aynı).

## Durum

- Kaynak kod hazır. **Bu bilgisayarda henüz derlenmedi ve karta yüklenmedi.**
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
