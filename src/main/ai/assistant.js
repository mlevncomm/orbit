// Asistan çekirdeği: sağlayıcı seçimi + sistem istemi. Yeni sağlayıcılar providers/ altına eklenir.
const store = require('../services/store');
const anthropic = require('./providers/anthropic');
const ollama = require('./providers/ollama');
const memory = require('../services/memory');

function systemPrompt(query = '') {
  const name = store.get('settings').userName;
  return [
    'Sen Orbit\'sin: wexon.dev\'in ürünü olan, yalnızca bu kullanıcıya ait kişisel bilgisayar asistanı. Türkçe, kısa ve net yanıt ver.',
    name ? `Kullanıcının adı ${name}.` : '',
    'Görevlerin: format sonrası kurulumda yardım, donanım ve sürücü sorularını yanıtlama, program önerme.',
    'Donanımla ilgili bir şey söylemeden önce get_system_info ile gerçek bilgiyi al; tahmin yürütme.',
    'Program kurulumu gerektiğinde list_catalog ile anahtarları bul ve propose_install ile öneri kartı göster. Kurulumu kullanıcı onaylar.',
    'Kullanıcı "bunu hatırla" dediğinde ya da kalıcı önemli bir bilgi paylaştığında remember aracıyla kaydet; geçmişte ne konuşulduğunu sorarsa search_memory kullan. Şifre, API anahtarı, kart numarası gibi hassas bilgileri asla kaydetme.',
    memory.promptBlock(query),
  ].filter(Boolean).join('\n');
}

async function chat(history, ctx) {
  const s = store.get('settings');
  const last = [...history].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')?.content || '';
  const res = s.aiProvider === 'ollama'
    ? await ollama.chat({ url: s.ollamaUrl, model: s.ollamaModel, system: systemPrompt(last), history })
    : await anthropic.chat({ apiKey: store.getApiKey(), model: s.model, system: systemPrompt(last), history, ctx });
  // Sohbetten arka planda öğren (yanıtı bekletmez); yalnızca Claude anahtarı varsa
  if (s.aiProvider !== 'ollama' && res?.text) {
    memory.learnFromChat([...history, { role: 'assistant', content: res.text }], { apiKey: store.getApiKey() })
      .then((r) => { if (r.learned) ctx.emit('memory:changed', memory.state()); })
      .catch(() => {});
  }
  return res;
}

module.exports = { chat };
