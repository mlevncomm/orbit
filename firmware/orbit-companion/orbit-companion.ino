/*
  Orbit Companion Firmware v0.2.0 — Orbit'in fiziksel ikizi
  ESP32 için Orbit seri protokolü (JSON Lines, v1).

  PC → kart:  {"v":1,"id":3,"t":"COMMAND","cmd":"led","state":"on"}
  kart → PC:  {"v":1,"id":3,"t":"RESPONSE","ok":true,"led":true}

  Mesajlar: HELLO, CAPABILITIES, STATUS, HEARTBEAT, STATE (PC durumu), COMMAND, RESPONSE, ERROR, EVENT
  Komutlar: led (on|off|toggle|blink|auto) | ping | notify | info | wifi | wifi_off | result

  İkiz davranışı:
   - PC, durumunu STATE mesajıyla gönderir (ışıklar, kurulum kuyruğu, güncellemeler, CPU/RAM…);
     kart bunu saklar, durum ışığına ve Wi-Fi paneline yansıtır.
   - BOOT tuşu (GPIO0) ve Wi-Fi paneli yalnızca EVENT gönderir: {"t":"EVENT","event":"button"|"action",...}.
     Kart bilgisayarda hiçbir şey ÇALIŞTIRMAZ; hangi eylemin yapılacağına Orbit'in izin listesi karar verir.
   - Wi-Fi paneli, Orbit'in ürettiği gizli anahtar (token) olmadan hiçbir isteği kabul etmez.

  Derleme: arduino-cli / Arduino IDE, kart paketi "esp32 by Espressif" 3.x, kütüphane "ArduinoJson" (v7)
*/
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>

#define ORBIT_FW_NAME "orbit-companion"
#define ORBIT_FW_VERSION "0.2.0"
#define ORBIT_PROTOCOL 1
#define ORBIT_BAUD 115200
#define BUTTON_PIN 0          // BOOT tuşu (çalışırken serbest bir giriş)
#define LONG_PRESS_MS 800

#ifndef ORBIT_LED_PIN
  #ifdef LED_BUILTIN
    #define ORBIT_LED_PIN LED_BUILTIN
  #else
    #define ORBIT_LED_PIN -1
  #endif
#endif

// ---------- Durum ----------
static bool ledOn = false;
static bool ledAuto = false;                 // true: LED bilgisayarın durumunu yansıtır
static uint32_t blinkUntil = 0, blinkPeriod = 0, lastBlink = 0;
static String line;
static String pcState = "{}";                // PC'den gelen son STATE (JSON)
static uint32_t pcStateAt = 0;
static bool pcInstalling = false, pcLights = false;

static Preferences prefs;
static WebServer server(80);
static String wifiSsid, wifiPass, token;
static bool webStarted = false;
static wl_status_t lastWifi = WL_IDLE_STATUS;
static uint32_t ridCounter = 0;
struct Result { uint32_t rid; bool done; bool ok; String msg; };
static Result results[8];

static bool hasLed() { return ORBIT_LED_PIN >= 0; }
static void setLed(bool on) { ledOn = on; if (hasLed()) digitalWrite(ORBIT_LED_PIN, on ? HIGH : LOW); }

static void send(JsonDocument &doc) {
  doc["v"] = ORBIT_PROTOCOL;
  serializeJson(doc, Serial);
  Serial.print('\n');
}
static void sendError(long id, const char *code, const char *message) {
  JsonDocument d;
  if (id >= 0) d["id"] = id;
  d["t"] = "ERROR"; d["code"] = code; d["error"] = message;
  send(d);
}
static void sendEvent(const char *event, JsonDocument &d) { d["t"] = "EVENT"; d["event"] = event; send(d); }

static void fillCaps(JsonArray caps) {
  caps.add("ping"); caps.add("status"); caps.add("heartbeat"); caps.add("notify");
  caps.add("state"); caps.add("button"); caps.add("wifi");
  if (hasLed()) caps.add("led");
}

static void fillWifi(JsonObject w) {
  w["configured"] = wifiSsid.length() > 0;
  w["connected"] = WiFi.status() == WL_CONNECTED;
  if (wifiSsid.length()) w["ssid"] = wifiSsid;
  if (WiFi.status() == WL_CONNECTED) { w["ip"] = WiFi.localIP().toString(); w["rssi"] = WiFi.RSSI(); }
}

// ---------- Seri komutlar ----------
static void handleHello(long id) {
  JsonDocument d;
  d["id"] = id; d["t"] = "HELLO";
  d["fw"] = ORBIT_FW_NAME; d["ver"] = ORBIT_FW_VERSION;
  d["chip"] = ESP.getChipModel(); d["rev"] = ESP.getChipRevision(); d["cores"] = ESP.getChipCores();
  d["mhz"] = ESP.getCpuFreqMHz(); d["flash"] = ESP.getFlashChipSize(); d["sdk"] = ESP.getSdkVersion();
  uint64_t mac = ESP.getEfuseMac();
  char macs[18];
  snprintf(macs, sizeof(macs), "%02X:%02X:%02X:%02X:%02X:%02X", (uint8_t)(mac), (uint8_t)(mac >> 8), (uint8_t)(mac >> 16), (uint8_t)(mac >> 24), (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
  d["mac"] = macs;
  d["ledPin"] = ORBIT_LED_PIN;
  fillCaps(d["caps"].to<JsonArray>());
  send(d);
}

static void handleStatus(long id) {
  JsonDocument d;
  d["id"] = id; d["t"] = "STATUS";
  d["uptimeMs"] = millis(); d["heapFree"] = ESP.getFreeHeap(); d["heapMin"] = ESP.getMinFreeHeap();
  d["led"] = ledOn; d["ledAuto"] = ledAuto;
  d["stateAgeMs"] = pcStateAt ? millis() - pcStateAt : -1;
  fillWifi(d["wifi"].to<JsonObject>());
  send(d);
}

static void startWifi() {
  if (!wifiSsid.length()) return;
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("orbit");
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
}

static void handleCommand(long id, JsonDocument &in) {
  const char *cmd = in["cmd"] | "";
  JsonDocument d;
  d["id"] = id; d["t"] = "RESPONSE"; d["cmd"] = cmd;

  if (!strcmp(cmd, "ping")) { d["ok"] = true; d["uptimeMs"] = millis(); }
  else if (!strcmp(cmd, "led")) {
    if (!hasLed()) return sendError(id, "NO_LED", "Bu kartta tanimli dahili LED yok");
    const char *state = in["state"] | "toggle";
    blinkUntil = 0;
    if (!strcmp(state, "auto")) ledAuto = true;
    else {
      ledAuto = false;
      if (!strcmp(state, "on")) setLed(true);
      else if (!strcmp(state, "off")) setLed(false);
      else if (!strcmp(state, "toggle")) setLed(!ledOn);
      else if (!strcmp(state, "blink")) {
        uint32_t ms = in["ms"] | 3000;
        blinkPeriod = constrain((uint32_t)(in["period"] | 250), 50u, 2000u);
        blinkUntil = millis() + constrain(ms, 100u, 60000u);
      } else return sendError(id, "BAD_STATE", "state: on | off | toggle | blink | auto");
    }
    d["ok"] = true; d["led"] = ledOn; d["ledAuto"] = ledAuto;
  } else if (!strcmp(cmd, "notify")) {
    const char *text = in["text"] | "";
    d["ok"] = true; d["received"] = strlen(text);
    if (hasLed() && !ledAuto) { blinkPeriod = 120; blinkUntil = millis() + 600; }
  } else if (!strcmp(cmd, "info")) {
    d["ok"] = true; d["fw"] = ORBIT_FW_NAME; d["ver"] = ORBIT_FW_VERSION;
  } else if (!strcmp(cmd, "wifi")) {
    // Wi-Fi bilgisi ve panel anahtarı kartın kalıcı belleğine (NVS) yazılır; şifre geri okunamaz
    String ssid = in["ssid"] | "", pass = in["pass"] | "", tok = in["token"] | "";
    if (!ssid.length() || ssid.length() > 32 || pass.length() > 64 || tok.length() < 16 || tok.length() > 64)
      return sendError(id, "BAD_WIFI", "ssid 1-32, sifre en fazla 64, token 16-64 karakter olmali");
    wifiSsid = ssid; wifiPass = pass; token = tok;
    prefs.putString("ssid", ssid); prefs.putString("pass", pass); prefs.putString("token", tok);
    WiFi.disconnect(); startWifi();
    d["ok"] = true; d["connecting"] = true;
  } else if (!strcmp(cmd, "wifi_off")) {
    prefs.remove("ssid"); prefs.remove("pass"); prefs.remove("token");
    wifiSsid = ""; wifiPass = ""; token = "";
    WiFi.disconnect(true); WiFi.mode(WIFI_OFF);
    d["ok"] = true;
  } else if (!strcmp(cmd, "result")) {
    // Orbit, panelden gelen bir eylemin sonucunu bildirir
    uint32_t rid = in["rid"] | 0;
    for (auto &r : results) if (r.rid == rid) { r.done = true; r.ok = in["ok"] | false; r.msg = String((const char *)(in["msg"] | "")).substring(0, 400); }
    d["ok"] = true;
  } else return sendError(id, "UNKNOWN_CMD", "Bilinmeyen komut");
  send(d);
}

static void handleState(long id, JsonDocument &in) {
  in.remove("v"); in.remove("t"); in.remove("id");
  pcState = "";
  serializeJson(in, pcState);
  if (pcState.length() > 3000) pcState = "{}";
  pcStateAt = millis();
  pcInstalling = in["queue"]["running"] | false;
  pcLights = in["lights"]["on"] | false;
  if (id >= 0) { JsonDocument d; d["id"] = id; d["t"] = "RESPONSE"; d["ok"] = true; send(d); }
}

static void handleLine(const String &raw) {
  JsonDocument in;
  DeserializationError err = deserializeJson(in, raw);
  if (err) return sendError(-1, "BAD_JSON", err.c_str());
  if ((int)(in["v"] | 0) != ORBIT_PROTOCOL) return sendError(in["id"] | -1L, "BAD_VERSION", "Desteklenmeyen protokol surumu");
  long id = in["id"] | -1L;
  const char *t = in["t"] | "";
  if (!strcmp(t, "HELLO")) handleHello(id);
  else if (!strcmp(t, "CAPABILITIES")) { JsonDocument d; d["id"] = id; d["t"] = "CAPABILITIES"; fillCaps(d["caps"].to<JsonArray>()); send(d); }
  else if (!strcmp(t, "STATUS")) handleStatus(id);
  else if (!strcmp(t, "HEARTBEAT")) { JsonDocument d; d["id"] = id; d["t"] = "HEARTBEAT"; d["uptimeMs"] = millis(); send(d); }
  else if (!strcmp(t, "STATE")) handleState(id, in);
  else if (!strcmp(t, "COMMAND")) handleCommand(id, in);
  else sendError(id, "BAD_TYPE", "Bilinmeyen mesaj turu");
}

// ---------- Wi-Fi kontrol paneli ----------
static const char PANEL_HTML[] PROGMEM = R"HTML(<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orbit</title><style>
:root{--bg:#f2f0f8;--card:#fff;--ink:#141417;--mut:#8d8c97;--blk:#111114;--ok:#22a06b;--warn:#e5a50a}
@media(prefers-color-scheme:dark){:root{--bg:#0f0f13;--card:#1b1b21;--ink:#f3f3f6;--mut:#8a8a96;--blk:#f3f3f6}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);padding:16px;max-width:560px;margin:auto}
h1{font-size:22px;margin:4px 0 2px}.sub{color:var(--mut);font-size:13px}.card{background:var(--card);border-radius:18px;padding:14px;margin:12px 0;box-shadow:0 6px 20px rgba(0,0,0,.06)}
h2{font-size:15px;margin:0 0 10px}.row{display:flex;gap:8px;flex-wrap:wrap}.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:14px}
button{border:0;border-radius:12px;padding:11px 14px;font-size:14px;background:#e9e7f1;color:#141417;cursor:pointer}button.p{background:var(--blk);color:var(--card)}
button:disabled{opacity:.5}input{flex:1;min-width:0;border-radius:12px;border:1px solid #ccc;padding:10px;font-size:14px;background:transparent;color:inherit}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--mut);margin-right:6px}.on{background:var(--ok)}.bar{height:8px;border-radius:8px;background:#ddd;overflow:hidden}.bar i{display:block;height:100%;background:var(--blk)}
#log{font-size:13px;color:var(--mut);white-space:pre-wrap}
</style></head><body>
<h1>Orbit</h1><div class="sub" id="pc">bağlanıyor…</div>
<div class="card"><h2>Bilgisayar</h2><div class="kv">
<span>CPU</span><div class="bar"><i id="cpu" style="width:0"></i></div><span>RAM</span><div class="bar"><i id="ram" style="width:0"></i></div>
<span>Kurulum</span><b id="queue">—</b><span>Güncelleme</span><b id="upd">—</b></div>
<div class="row" style="margin-top:10px"><button onclick="act('app.show')">Orbit'i öne getir</button><button onclick="act('settings.theme','toggle')">Tema değiştir</button></div></div>
<div class="card"><h2><span class="dot" id="ldot"></span>Işıklar · <span id="lname">—</span></h2>
<div class="row"><button class="p" onclick="act('lights.power','toggle')">Aç / Kapat</button><button onclick="act('lights.next')">Sonraki görünüm</button></div>
<div class="row" id="presets" style="margin-top:8px"></div></div>
<div class="card"><h2>Programlar ve sürücüler</h2><div class="sub">Bu işlemler bilgisayar ekranında onay ister.</div>
<div class="row" style="margin-top:8px" id="profiles"></div>
<div class="row" style="margin-top:8px"><button onclick="act('apps.update_all')">Tüm güncellemeleri kur</button><button onclick="act('drivers.scan')">Sürücüleri tara</button><button onclick="act('drivers.install')">Sürücüleri kur</button></div></div>
<div class="card"><h2>Asistan</h2><div class="row"><input id="q" placeholder="Orbit'e sor…"><button class="p" onclick="ask()">Sor</button></div><div id="ans" class="sub" style="margin-top:8px"></div></div>
<div class="card"><h2>Son işlemler</h2><div id="log">—</div></div>
<script>
const T=new URLSearchParams(location.search).get('t')||'';const L=[];
function h(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function api(p,b){const r=await fetch(p+(p.includes('?')?'&':'?')+'t='+encodeURIComponent(T),b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{});if(!r.ok)throw new Error(r.status==401?'Anahtar geçersiz':'HTTP '+r.status);return r.json()}
function log(s){L.unshift(new Date().toLocaleTimeString('tr-TR')+'  '+s);document.getElementById('log').textContent=L.slice(0,8).join('\n')}
async function act(a,arg,cb){try{const r=await api('/api/action',{action:a,arg:arg||''});log(a+' gönderildi');poll(r.rid,a,cb)}catch(e){log('Hata: '+e.message)}}
async function poll(rid,a,cb,n=0){if(n>120)return log(a+': yanıt gelmedi');const r=await api('/api/result?rid='+rid).catch(()=>null);if(r&&r.done){log(a+': '+(r.ok?'✓ ':'✗ ')+r.msg);cb&&cb(r);refresh();return}setTimeout(()=>poll(rid,a,cb,n+1),700)}
function ask(){const q=document.getElementById('q').value.trim();if(!q)return;document.getElementById('ans').textContent='düşünüyor…';act('assistant.ask',q,r=>document.getElementById('ans').textContent=r.msg)}
async function refresh(){try{const s=await api('/api/state');const p=s.pc||{};
document.getElementById('pc').textContent=(p.pc||'PC')+' · Orbit '+(p.ver||'?')+(s.pcAgeMs<0||s.pcAgeMs>15000?' · Orbit bağlı değil':'');
document.getElementById('cpu').style.width=(p.cpu||0)+'%';document.getElementById('ram').style.width=(p.ram||0)+'%';
document.getElementById('queue').textContent=p.queue?(p.queue.running?(p.queue.current||'çalışıyor')+' · '+p.queue.active+' sırada':'boşta'):'—';
document.getElementById('upd').textContent=p.updates??'—';
document.getElementById('ldot').className='dot'+(p.lights&&p.lights.on?' on':'');document.getElementById('lname').textContent=p.lights?(p.lights.on?p.lights.name:'kapalı'):'—';
document.getElementById('presets').innerHTML=(p.presets||[]).map(x=>'<button onclick="act(\'lights.preset\',\''+h(x.id)+'\')">'+h(x.name)+'</button>').join('');
document.getElementById('profiles').innerHTML=(p.profiles||[]).map(x=>'<button onclick="act(\'apps.profile\',\''+h(x.id)+'\')">'+h(x.name)+' kur</button>').join('');
}catch(e){document.getElementById('pc').textContent=e.message}}
refresh();setInterval(refresh,3000);
</script></body></html>)HTML";

static bool authed() {
  if (!token.length()) return false;
  String t = server.hasArg("t") ? server.arg("t") : server.header("X-Orbit-Token");
  return t == token;
}

static void webState() {
  if (!authed()) return server.send(401, "application/json", "{\"error\":\"token\"}");
  String out = "{\"pcAgeMs\":" + String(pcStateAt ? (long)(millis() - pcStateAt) : -1L) + ",\"pc\":" + pcState + "}";
  server.send(200, "application/json", out);
}

static void webAction() {
  if (!authed()) return server.send(401, "application/json", "{\"error\":\"token\"}");
  JsonDocument in;
  if (deserializeJson(in, server.arg("plain"))) return server.send(400, "application/json", "{\"error\":\"json\"}");
  String action = in["action"] | "", arg = in["arg"] | "";
  // Biçim denetimi: "alan.eylem" ve sınırlı argüman. Eylemin izinli olup olmadığına Orbit karar verir.
  bool okName = action.length() > 2 && action.length() <= 40;
  for (char c : action) if (!(isalnum((unsigned char)c) || c == '.' || c == '_')) okName = false;
  if (!okName || arg.length() > 200) return server.send(400, "application/json", "{\"error\":\"action\"}");
  uint32_t rid = ++ridCounter;
  Result &slot = results[rid % 8];
  slot.rid = rid; slot.done = false; slot.ok = false; slot.msg = "";
  JsonDocument ev; ev["action"] = action; ev["arg"] = arg; ev["rid"] = rid; ev["source"] = "wifi";
  sendEvent("action", ev);
  server.send(200, "application/json", "{\"queued\":true,\"rid\":" + String(rid) + "}");
}

static void webResult() {
  if (!authed()) return server.send(401, "application/json", "{\"error\":\"token\"}");
  uint32_t rid = server.arg("rid").toInt();
  for (auto &r : results) if (r.rid == rid && rid) {
    JsonDocument d; d["done"] = r.done; d["ok"] = r.ok; d["msg"] = r.msg;
    String out; serializeJson(d, out);
    return server.send(200, "application/json", out);
  }
  server.send(404, "application/json", "{\"error\":\"rid\"}");
}

static void startWeb() {
  if (webStarted) return;
  const char *hdrs[] = {"X-Orbit-Token"};
  server.collectHeaders(hdrs, 1);
  server.on("/", HTTP_GET, []() { server.send_P(200, "text/html; charset=utf-8", PANEL_HTML); });
  server.on("/api/state", HTTP_GET, webState);
  server.on("/api/action", HTTP_POST, webAction);
  server.on("/api/result", HTTP_GET, webResult);
  server.onNotFound([]() { server.send(404, "text/plain", "yok"); });
  server.begin();
  MDNS.begin("orbit");
  MDNS.addService("http", "tcp", 80);
  webStarted = true;
}

// ---------- BOOT tuşu ----------
static bool btnDown = false;
static uint32_t btnSince = 0, btnLastChange = 0;
static void pollButton() {
  bool down = digitalRead(BUTTON_PIN) == LOW;
  uint32_t now = millis();
  if (down != btnDown && now - btnLastChange > 30) {   // 30 ms parazit önleme
    btnLastChange = now;
    btnDown = down;
    if (down) btnSince = now;
    else {
      JsonDocument ev;
      ev["button"] = "boot";
      ev["press"] = now - btnSince >= LONG_PRESS_MS ? "long" : "short";
      ev["ms"] = now - btnSince;
      sendEvent("button", ev);
      if (hasLed() && !ledAuto) { blinkPeriod = 80; blinkUntil = now + 240; }
    }
  }
}

// ---------- LED: elle / otomatik durum ışığı ----------
static void updateLed() {
  uint32_t now = millis();
  if (blinkUntil) {
    if ((int32_t)(now - blinkUntil) >= 0) { blinkUntil = 0; if (!ledAuto) setLed(false); }
    else if (now - lastBlink >= blinkPeriod) { lastBlink = now; setLed(!ledOn); }
    return;
  }
  if (!ledAuto || !hasLed()) return;
  bool fresh = pcStateAt && now - pcStateAt < 10000;
  if (!fresh) { if (ledOn) setLed(false); return; }                 // Orbit yok: sönük
  if (pcInstalling) { if (now - lastBlink >= 300) { lastBlink = now; setLed(!ledOn); } return; } // kurulum: hızlı yanıp sönme
  bool want = (now % 3000) < 120;                                    // boşta: 3 sn'de bir kısa nabız
  if (want != ledOn) setLed(want);
}

void setup() {
  Serial.begin(ORBIT_BAUD);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  if (hasLed()) { pinMode(ORBIT_LED_PIN, OUTPUT); setLed(false); }
  line.reserve(512);
  prefs.begin("orbit", false);
  wifiSsid = prefs.getString("ssid", ""); wifiPass = prefs.getString("pass", ""); token = prefs.getString("token", "");
  startWifi();
  JsonDocument d; d["fw"] = ORBIT_FW_NAME; d["ver"] = ORBIT_FW_VERSION; sendEvent("boot", d);
}

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') { line.trim(); if (line.length()) handleLine(line); line = ""; }
    else if (c != '\r') {
      if (line.length() < 3500) line += c;
      else { line = ""; sendError(-1, "TOO_LONG", "Satir cok uzun"); }
    }
  }
  pollButton();
  updateLed();
  wl_status_t ws = WiFi.status();
  if (ws != lastWifi) {
    lastWifi = ws;
    if (ws == WL_CONNECTED) startWeb();
    JsonDocument ev; fillWifi(ev["wifi"].to<JsonObject>()); sendEvent("wifi", ev);
  }
  if (webStarted) server.handleClient();
}
