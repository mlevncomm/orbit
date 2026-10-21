import { generateLlmCopy, llmChat, parseJsonObject } from "./llm";
import { prisma } from "./prisma";
import { getPlaybook, mergePlaybook, playbookIsActive, savePlaybook, WEXON_SALES_PLAYBOOK } from "./playbook";
import { getSettings } from "./settings";
import { currentTenant, tenantId } from "./tenant";
import { coachSystemPrompt } from "./verticals";

export async function listCoachMessages() {
  return prisma.coachMessage.findMany({
    where: { tenantId: tenantId() },
    orderBy: { createdAt: "asc" },
    take: 80,
  });
}

export async function coachSnapshot() {
  const [messages, playbook, settings] = await Promise.all([
    listCoachMessages(),
    getPlaybook(),
    getSettings(),
  ]);
  return {
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      createdAt: m.createdAt,
    })),
    playbook,
    playbookActive: playbookIsActive(playbook),
    hasLlm: Boolean(settings.llmApiKey),
  };
}

export async function resetCoach(resetPlaybook = false) {
  await prisma.coachMessage.deleteMany({ where: { tenantId: tenantId() } });
  if (resetPlaybook) {
    await savePlaybook({ tone: "", rules: "", forbidden: "", offer: "", cta: "" });
  }
  return coachSnapshot();
}

export async function applyWexonSalesPlaybook() {
  await savePlaybook(WEXON_SALES_PLAYBOOK);
  await prisma.coachMessage.create({
    data: {
      tenantId: tenantId(),
      role: "assistant",
      body: "Wexon satış standardı uygulandı. Kurumsal stüdyo tonu, doğrulanmış bilgi, 4.900 TL başlangıç bedeli ve işletmeye özel örnek ekran CTA’sı artık AI metinlerine yön verir.",
    },
  });
  return coachSnapshot();
}

export async function coachTurn(userText: string) {
  const text = userText.trim().slice(0, 2000);
  if (!text) throw new Error("Mesaj boş");

  await prisma.coachMessage.create({ data: { tenantId: tenantId(), role: "user", body: text } });
  const settings = await getSettings();
  const current = await getPlaybook();

  if (!settings.llmApiKey) {
    const reply =
      "Google Gemini anahtarı yok. Sistem ekranına Google AI Studio anahtarını (AIza…) yazıp kaydedin; sonra Kontrol et ile deneyin. Ton, yasak kelime ve CTA’yı buradan öğretirsiniz.";
    await prisma.coachMessage.create({ data: { tenantId: tenantId(), role: "assistant", body: reply } });
    return coachSnapshot();
  }

  const history = await prisma.coachMessage.findMany({
    where: { tenantId: tenantId() },
    orderBy: { createdAt: "desc" },
    take: 16,
  });
  const chronological = history.slice().reverse();

  try {
    const raw = await llmChat({
      apiKey: settings.llmApiKey,
      baseUrl: settings.llmBaseUrl,
      model: settings.llmModel,
      json: true,
      temperature: 0.4,
      maxTokens: 1100,
      messages: [
        {
          role: "system",
          content: coachSystemPrompt(currentTenant().vertical),
        },
        {
          role: "user",
          content: `Mevcut playbook JSON: ${JSON.stringify(current)}
Sohbet:
${chronological.map((m) => `${m.role === "user" ? "Operatör" : "Koç"}: ${m.body}`).join("\n")}

Görev: Operatöre Türkçe kısa cevap ver ve playbook’u birleştir.
Değişmeyen alanlara "_keep" yaz.
Çıktı yalnızca JSON:
{"reply":"...","playbook":{"tone":"...","rules":"...","forbidden":"...","offer":"...","cta":"..."}}`,
        },
      ],
    });
    const parsed = parseJsonObject(raw);
    const reply =
      (typeof parsed?.reply === "string" && parsed.reply.trim()) ||
      "Not aldım. Şablon üretiminde bu kurallar kullanılacak.";
    const next = mergePlaybook(current, parsed?.playbook);
    await savePlaybook(next);
    await prisma.coachMessage.create({ data: { tenantId: tenantId(), role: "assistant", body: reply.slice(0, 2000) } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI yanıt vermedi";
    await prisma.coachMessage.create({
      data: { tenantId: tenantId(), role: "assistant", body: `Kaydedemedim: ${message}` },
    });
  }
  return coachSnapshot();
}

export async function copyWithPlaybook(opts: {
  angle: Parameters<typeof generateLlmCopy>[0]["angle"];
  brief?: string;
}) {
  const [settings, playbook] = await Promise.all([getSettings(), getPlaybook()]);
  if (!settings.llmApiKey) return null;
  return generateLlmCopy({
    apiKey: settings.llmApiKey,
    baseUrl: settings.llmBaseUrl,
    model: settings.llmModel,
    angle: opts.angle,
    brief: opts.brief,
    playbook,
    vertical: currentTenant().vertical,
  });
}
