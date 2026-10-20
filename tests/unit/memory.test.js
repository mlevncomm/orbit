const { userData } = require('../helpers/stub-electron');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const memory = require('../../src/main/services/memory');

test('hassas bilgiler hafızaya hiç yazılmaz', () => {
  for (const t of [
    'Claude anahtarım sk-ant-api03-abcdefghijklmnop', 'şifre: Gizli123!', 'Kartım 4111 1111 1111 1111',
    'IBAN TR33 0006 1005 1978 6457 8413 26', 'token=ghp_abcdefghijklmnopqrstuvwxyz123456',
  ]) assert.equal(memory.remember(t, { source: 'elle' }), null, t);
  assert.equal(memory.list().length, 0);
  // sürüm numarası, telefon gibi normal bilgiler kart sanılmaz
  assert.ok(memory.remember('Ekran kartı sürücüsü 32.0.21045.11001', { cat: 'bilgisayar', source: 'elle' }));
});

test('anahtarlı bilgi güncellenir, aynı metin tekrarlanmaz, şifreli dosyaya yazılır', () => {
  memory.clear();
  memory.notePreset('Aurora'); memory.notePreset('Aurora'); memory.notePreset('Cyberpunk');
  const fav = memory.list().filter((x) => x.key === 'fav-light');
  assert.equal(fav.length, 1);
  assert.match(fav[0].text, /Aurora \(2 kez\), Cyberpunk \(1 kez\)/);
  memory.remember('wexon.dev web stüdyosunu yönetiyor', { cat: 'is', source: 'elle' });
  memory.remember('wexon.dev web stüdyosunu yönetiyor.', { cat: 'is', source: 'elle' });
  assert.equal(memory.list().filter((x) => /wexon/.test(x.text)).length, 1);
  memory.flush();
  const raw = JSON.parse(fs.readFileSync(path.join(userData, 'memory.json'), 'utf8'));
  assert.ok(raw.enc || raw.plain, 'dosya biçimi');
});

test('kaynak kapatılınca o kaynaktan öğrenilmez; elle notlar her zaman alınır', () => {
  memory.clear();
  memory.setSources({ kullanim: false });
  memory.noteInstall('7-Zip');
  assert.equal(memory.list().length, 0);
  assert.ok(memory.remember('Sabahları çalışmayı sever', { cat: 'aliskanlik', source: 'elle' }));
  memory.setSources({ kullanim: true });
});

test('ilgili bilgiler: sabitlenen önce, kelime örtüşmesi öne çıkar; istem bloğu', () => {
  memory.clear();
  memory.remember('Kedisinin adı Pamuk', { cat: 'not', source: 'elle' });
  memory.remember('Wexon Growth OS ile WhatsApp üzerinden müşteri buluyor', { cat: 'is', source: 'elle' });
  const pin = memory.remember('Adı Mehmet', { cat: 'kimlik', source: 'elle', pinned: true });
  const top = memory.relevant('whatsapp müşteri mesajları', 3);
  assert.equal(top[0].id, pin.id);
  assert.match(top[1].text, /WhatsApp/);
  assert.match(memory.promptBlock('müşteri'), /Orbit hafızası[\s\S]*Adı Mehmet/);
});

test('düzenleme hassas metne izin vermez; silme ve kaynağa göre temizleme', () => {
  memory.clear();
  const a = memory.remember('Bir not', { source: 'elle' });
  assert.throws(() => memory.update(a.id, { text: 'parola: 1234abcd' }), /hassas/);
  memory.noteInstall('VLC');
  memory.clear('kullanim');
  assert.deepEqual(memory.list().map((x) => x.text), ['Bir not']);
  memory.remove(a.id);
  assert.equal(memory.list().length, 0);
});
