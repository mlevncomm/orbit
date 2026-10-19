// Orbit <-> ESP32 seri protokolü (JSON Lines, sürüm 1)
//
// Her mesaj tek satırlık bir JSON nesnesidir ve '\n' ile biter:
//   { "v": 1, "id": 7, "t": "COMMAND", "cmd": "led", "state": "on" }
// Alanlar:
//   v  : protokol sürümü (zorunlu, şu an 1)
//   id : istek kimliği (PC'nin başlattığı isteklerde zorunlu; yanıt aynı id ile döner)
//   t  : HELLO | CAPABILITIES | STATUS | HEARTBEAT | COMMAND | RESPONSE | ERROR | EVENT | LOG
//   c  : (isteğe bağlı) bütünlük kontrolü — "c" alanı hariç satırın CRC-32 değeri (8 hex)
// Satır olmayan ya da JSON olmayan çıktı (açılış mesajları, Serial.print) "ham günlük" sayılır.

const VERSION = 1;
const TYPES = new Set(['HELLO', 'CAPABILITIES', 'STATUS', 'HEARTBEAT', 'COMMAND', 'RESPONSE', 'ERROR', 'EVENT', 'LOG']);
const MAX_LINE = 4096;

let table = null;
function crc32(str) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of Buffer.from(str, 'utf8')) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

/** Mesajı satıra çevirir. withCrc: bütünlük alanı ekle */
function encode(msg, { withCrc = false } = {}) {
  if (!TYPES.has(msg.t)) throw new Error(`Bilinmeyen mesaj türü: ${msg.t}`);
  const body = { v: VERSION, ...msg };
  delete body.c;
  let line = JSON.stringify(body);
  if (withCrc) line = JSON.stringify({ ...body, c: crc32(line) });
  if (line.length > MAX_LINE) throw new Error('Mesaj çok uzun');
  return line + '\n';
}

/**
 * Tek satırı çözer.
 * Dönüş: { kind: 'msg', msg } | { kind: 'raw', text } | { kind: 'invalid', text, error }
 */
function parseLine(line) {
  const text = String(line).replace(/\r$/, '');
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return { kind: 'raw', text };
  let obj;
  try { obj = JSON.parse(trimmed); } catch { return { kind: 'raw', text }; }
  if (typeof obj !== 'object' || obj === null || !TYPES.has(obj.t)) return { kind: 'raw', text };
  if (obj.v !== VERSION) return { kind: 'invalid', text, error: `Desteklenmeyen protokol sürümü: ${obj.v}` };
  if (obj.c !== undefined) {
    const { c, ...rest } = obj;
    if (crc32(JSON.stringify(rest)) !== String(c).toLowerCase()) return { kind: 'invalid', text, error: 'Bütünlük kontrolü (CRC) tutmadı' };
  }
  if (obj.id !== undefined && !Number.isInteger(obj.id)) return { kind: 'invalid', text, error: 'Geçersiz id' };
  return { kind: 'msg', msg: obj };
}

/** Parça parça gelen seri veriyi satırlara böler (CRLF, yarım satır ve aşırı uzun satır güvenli) */
class LineDecoder {
  constructor(onLine) { this.buf = ''; this.onLine = onLine; }
  push(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      if (line.length) this.onLine(line);
    }
    if (this.buf.length > MAX_LINE) { this.onLine(this.buf); this.buf = ''; } // satır sonu gelmeyen çöp veri
  }
}

module.exports = { VERSION, TYPES, MAX_LINE, crc32, encode, parseLine, LineDecoder };
