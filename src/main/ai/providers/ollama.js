// Yerel model sağlayıcısı (Ollama). İnternetsiz / ücretsiz kullanım için; şimdilik araçsız sohbet.
async function chat({ url, model, system, history }) {
  const res = await fetch(`${url.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'system', content: system }, ...history.map((m) => ({ role: m.role, content: String(m.content) }))],
    }),
  }).catch(() => { throw new Error('Ollama çalışmıyor. Uygulamalar sayfasından Ollama kurup `ollama pull ' + model + '` çalıştırın.'); });
  if (!res.ok) throw new Error(`Ollama hatası: HTTP ${res.status}`);
  const data = await res.json();
  return { text: data.message?.content || '' };
}

module.exports = { chat };
