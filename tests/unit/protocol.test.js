const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/main/esp32/protocol');

test('encode: sürüm ekler, satır sonu ile biter', () => {
  const line = P.encode({ id: 3, t: 'COMMAND', cmd: 'led', state: 'on' });
  assert.ok(line.endsWith('\n'));
  assert.deepEqual(JSON.parse(line), { v: 1, id: 3, t: 'COMMAND', cmd: 'led', state: 'on' });
});

test('encode: bilinmeyen tür reddedilir', () => {
  assert.throws(() => P.encode({ t: 'SHELL', cmd: 'format c:' }), /Bilinmeyen mesaj/);
});

test('parseLine: geçerli mesaj, ham metin, bozuk JSON', () => {
  assert.equal(P.parseLine('{"v":1,"id":1,"t":"HELLO","fw":"x"}').kind, 'msg');
  assert.equal(P.parseLine('ets Jun  8 2016 00:22:57').kind, 'raw');
  assert.equal(P.parseLine('{"v":1,"t":"HELLO"').kind, 'raw');       // yarım JSON → ham günlük
  assert.equal(P.parseLine('{"foo":1}').kind, 'raw');                // protokol dışı JSON
  assert.equal(P.parseLine('{"v":2,"id":1,"t":"HELLO"}').kind, 'invalid');
  assert.equal(P.parseLine('{"v":1,"id":"x","t":"HELLO"}').kind, 'invalid');
  assert.equal(P.parseLine('{"v":1,"id":1,"t":"HELLO"}\r').msg.id, 1); // CRLF
});

test('CRC: doğru imza kabul, bozulmuş satır red', () => {
  const line = P.encode({ id: 9, t: 'STATUS' }, { withCrc: true }).trim();
  assert.equal(P.parseLine(line).kind, 'msg');
  const tampered = line.replace('"id":9', '"id":8');
  assert.equal(P.parseLine(tampered).kind, 'invalid');
  assert.equal(P.crc32('123456789'), 'cbf43926'); // standart CRC-32 test vektörü
});

test('LineDecoder: parçalı veri, birden çok satır, aşırı uzun satır', () => {
  const lines = [];
  const d = new P.LineDecoder((l) => lines.push(l));
  d.push('{"v":1,"id":1,'); d.push('"t":"HELLO"}\r\n{"v":1,"id":2,"t":"HEA');
  d.push('RTBEAT"}\nboot ok\n');
  assert.deepEqual(lines, ['{"v":1,"id":1,"t":"HELLO"}', '{"v":1,"id":2,"t":"HEARTBEAT"}', 'boot ok']);
  lines.length = 0;
  d.push('x'.repeat(P.MAX_LINE + 10));
  assert.equal(lines.length, 1);
});
