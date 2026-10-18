// Claude sağlayıcısı: araç kullanım döngüsü (manuel loop, Anthropic SDK)
const Anthropic = require('@anthropic-ai/sdk');
const tools = require('../tools');

const MAX_STEPS = 8;

async function chat({ apiKey, model, system, history, ctx }) {
  if (!apiKey) throw new Error('Claude API anahtarı yok. Ayarlar > Yapay Zeka bölümünden ekleyin.');
  const client = new Anthropic({ apiKey });
  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      tools: tools.definitions(),
      messages,
      output_config: { effort: 'medium' },
      // Güvenlik sınıflandırıcısı reddederse istek sunucu tarafında uygun modele yönlendirilir
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (response.stop_reason === 'refusal') {
      return { text: 'Bu isteğe yanıt veremiyorum. Farklı şekilde sormayı deneyebilirsin.' };
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue;

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { text: text || (response.stop_reason === 'max_tokens' ? '(Yanıt uzunluk sınırına ulaştı.)' : '') };
    }

    const results = [];
    for (const block of response.content.filter((b) => b.type === 'tool_use')) {
      ctx.emit('ai:tool', { name: block.name });
      const r = await tools.execute(block.name, block.input, ctx);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: r.content, is_error: r.isError });
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: 'İşlem çok fazla adım gerektirdi, lütfen isteği daraltın.' };
}

module.exports = { chat };
