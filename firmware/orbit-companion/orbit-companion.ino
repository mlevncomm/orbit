/*
  Orbit Companion Firmware v0.1.0
  ESP32 ailesi (ESP32, S2, S3, C3...) için Orbit seri protokolü (JSON Lines, v1).

  PC → kart:  {"v":1,"id":3,"t":"COMMAND","cmd":"led","state":"on"}
  kart → PC:  {"v":1,"id":3,"t":"RESPONSE","ok":true,"led":true}

  Desteklenen mesajlar: HELLO, CAPABILITIES, STATUS, HEARTBEAT, COMMAND (led | ping | notify | info)
  Kartta olmayan donanım (LED, ekran, sensör) asla "var" diye bildirilmez:
  dahili LED yalnızca ORBIT_LED_PIN tanımlıysa "led" yeteneği olarak raporlanır.

  Derleme: Arduino IDE / arduino-cli, kart paketi "esp32 by Espressif", kütüphane "ArduinoJson" (v7)
  Ayrıntı: README.md
*/
#include <Arduino.h>
#include <ArduinoJson.h>

#define ORBIT_FW_NAME "orbit-companion"
#define ORBIT_FW_VERSION "0.1.0"
#define ORBIT_PROTOCOL 1
#define ORBIT_BAUD 115200

// Dahili LED: kartın LED_BUILTIN tanımı varsa onu kullan. Yoksa LED yok kabul edilir.
// Kartında LED'in hangi pinde olduğunu biliyorsan buraya yaz (ör. birçok DevKit V1 kartında 2).
#ifndef ORBIT_LED_PIN
  #ifdef LED_BUILTIN
    #define ORBIT_LED_PIN LED_BUILTIN
  #else
    #define ORBIT_LED_PIN -1
  #endif
#endif

static bool ledOn = false;
static uint32_t blinkUntil = 0, blinkPeriod = 0, lastBlink = 0;
static String line;

static bool hasLed() { return ORBIT_LED_PIN >= 0; }

static void setLed(bool on) {
  ledOn = on;
  if (hasLed()) digitalWrite(ORBIT_LED_PIN, on ? HIGH : LOW);
}

static void send(JsonDocument &doc) {
  doc["v"] = ORBIT_PROTOCOL;
  serializeJson(doc, Serial);
  Serial.print('\n');
}

static void sendError(long id, const char *code, const char *message) {
  JsonDocument d;
  if (id >= 0) d["id"] = id;
  d["t"] = "ERROR";
  d["code"] = code;
  d["error"] = message;
  send(d);
}

static void fillCaps(JsonArray caps) {
  caps.add("ping");
  caps.add("status");
  caps.add("heartbeat");
  caps.add("notify");
  if (hasLed()) caps.add("led");
}

static void handleHello(long id) {
  JsonDocument d;
  d["id"] = id;
  d["t"] = "HELLO";
  d["fw"] = ORBIT_FW_NAME;
  d["ver"] = ORBIT_FW_VERSION;
  d["chip"] = ESP.getChipModel();
  d["rev"] = ESP.getChipRevision();
  d["cores"] = ESP.getChipCores();
  d["mhz"] = ESP.getCpuFreqMHz();
  d["flash"] = ESP.getFlashChipSize();
  d["sdk"] = ESP.getSdkVersion();
  uint64_t mac = ESP.getEfuseMac();
  char macs[18];
  snprintf(macs, sizeof(macs), "%02X:%02X:%02X:%02X:%02X:%02X",
           (uint8_t)(mac), (uint8_t)(mac >> 8), (uint8_t)(mac >> 16),
           (uint8_t)(mac >> 24), (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
  d["mac"] = macs;
  d["ledPin"] = ORBIT_LED_PIN;
  fillCaps(d["caps"].to<JsonArray>());
  send(d);
}

static void handleStatus(long id) {
  JsonDocument d;
  d["id"] = id;
  d["t"] = "STATUS";
  d["uptimeMs"] = millis();
  d["heapFree"] = ESP.getFreeHeap();
  d["heapMin"] = ESP.getMinFreeHeap();
  d["led"] = ledOn;
  send(d);
}

static void handleCommand(long id, JsonDocument &in) {
  const char *cmd = in["cmd"] | "";
  JsonDocument d;
  d["id"] = id;
  d["t"] = "RESPONSE";
  d["cmd"] = cmd;

  if (!strcmp(cmd, "ping")) {
    d["ok"] = true;
    d["uptimeMs"] = millis();
  } else if (!strcmp(cmd, "led")) {
    if (!hasLed()) return sendError(id, "NO_LED", "Bu kartta tanimli dahili LED yok");
    const char *state = in["state"] | "toggle";
    blinkUntil = 0;
    if (!strcmp(state, "on")) setLed(true);
    else if (!strcmp(state, "off")) setLed(false);
    else if (!strcmp(state, "toggle")) setLed(!ledOn);
    else if (!strcmp(state, "blink")) {
      uint32_t ms = in["ms"] | 3000;
      blinkPeriod = constrain((uint32_t)(in["period"] | 250), 50u, 2000u);
      blinkUntil = millis() + constrain(ms, 100u, 60000u);
    } else return sendError(id, "BAD_STATE", "state: on | off | toggle | blink");
    d["ok"] = true;
    d["led"] = ledOn;
  } else if (!strcmp(cmd, "notify")) {
    // PC'den gelen durum mesajı: kartın günlüğüne yazılır, LED varsa kısa yanıp söner
    const char *text = in["text"] | "";
    d["ok"] = true;
    d["received"] = strlen(text);
    if (hasLed()) { blinkPeriod = 120; blinkUntil = millis() + 600; }
  } else if (!strcmp(cmd, "info")) {
    d["ok"] = true;
    d["fw"] = ORBIT_FW_NAME;
    d["ver"] = ORBIT_FW_VERSION;
  } else {
    return sendError(id, "UNKNOWN_CMD", "Bilinmeyen komut");
  }
  send(d);
}

static void handleLine(const String &raw) {
  JsonDocument in;
  DeserializationError err = deserializeJson(in, raw);
  if (err) return sendError(-1, "BAD_JSON", err.c_str());
  if ((int)(in["v"] | 0) != ORBIT_PROTOCOL) return sendError(in["id"] | -1L, "BAD_VERSION", "Desteklenmeyen protokol surumu");
  long id = in["id"] | -1L;
  const char *t = in["t"] | "";
  if (!strcmp(t, "HELLO")) handleHello(id);
  else if (!strcmp(t, "CAPABILITIES")) {
    JsonDocument d; d["id"] = id; d["t"] = "CAPABILITIES"; fillCaps(d["caps"].to<JsonArray>()); send(d);
  }
  else if (!strcmp(t, "STATUS")) handleStatus(id);
  else if (!strcmp(t, "HEARTBEAT")) { JsonDocument d; d["id"] = id; d["t"] = "HEARTBEAT"; d["uptimeMs"] = millis(); send(d); }
  else if (!strcmp(t, "COMMAND")) handleCommand(id, in);
  else sendError(id, "BAD_TYPE", "Bilinmeyen mesaj turu");
}

void setup() {
  Serial.begin(ORBIT_BAUD);
  if (hasLed()) { pinMode(ORBIT_LED_PIN, OUTPUT); setLed(false); }
  line.reserve(512);
  JsonDocument d;
  d["t"] = "EVENT";
  d["event"] = "boot";
  d["fw"] = ORBIT_FW_NAME;
  d["ver"] = ORBIT_FW_VERSION;
  send(d);
}

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') { line.trim(); if (line.length()) handleLine(line); line = ""; }
    else if (c != '\r') {
      if (line.length() < 1024) line += c;
      else { line = ""; sendError(-1, "TOO_LONG", "Satir cok uzun"); }
    }
  }
  if (blinkUntil) {
    uint32_t now = millis();
    if ((int32_t)(now - blinkUntil) >= 0) { blinkUntil = 0; setLed(false); }
    else if (now - lastBlink >= blinkPeriod) { lastBlink = now; setLed(!ledOn); }
  }
}
