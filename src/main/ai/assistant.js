// Asistan çekirdeği: sağlayıcı seçimi + sistem istemi. Yeni sağlayıcılar providers/ altına eklenir.
const store = require('../services/store');
const anthropic = require('./providers/anthropic');
const ollama = require('./providers/ollama');

function systemPrompt() {
  const name = store.get('settings').userName;
  return [
    'Sen Orbit\'sin: kullanıcının Windows bilgisayarına bağlı kişisel asistanı. Türkçe, kısa ve net yanıt ver.',
    name ? `Kullanıcının adı ${name}.` : '',
    'Görevlerin: format sonrası kurulumda yardım, donanım ve sürücü sorularını yanıtlama, program önerme.',
    'Donanımla ilgili bir şey söylemeden önce get_system_info ile gerçek bilgiyi al; tahmin yürütme.',
    'Program kurulumu gerektiğinde list_catalog ile anahtarları bul ve propose_install ile öneri kartı göster. Kurulumu kullanıcı onaylar.',
  ].filter(Boolean).join('\n');
}

async function chat(history, ctx) {
  const s = store.get('settings');
  if (s.aiProvider === 'ollama') {
    return ollama.chat({ url: s.ollamaUrl, model: s.ollamaModel, system: systemPrompt(), history });
  }
  return anthropic.chat({ apiKey: store.getApiKey(), model: s.model, system: systemPrompt(), history, ctx });
}

module.exports = { chat };
