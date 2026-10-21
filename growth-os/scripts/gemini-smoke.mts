// Gerçek Gemini API ile satış taslağı testi. Mesaj GÖNDERMEZ, veritabanına dokunmaz.
//   GEMINI_API_KEY=AIza... npx tsx scripts/gemini-smoke.mts
// İsteğe bağlı: GEMINI_MODEL=gemini-3.8-flash (varsayılan: uygulamanın varsayılanı)
import { llmChat } from "../src/lib/llm.ts";
import { DEFAULT_LLM } from "../src/lib/llm-providers.ts";
import { buildContext } from "../src/lib/sales/context.ts";
import { generateDrafts, refineDraft, type ChatFn } from "../src/lib/sales/engine.ts";
import { similarity } from "../src/lib/sales/quality.ts";

const apiKey = process.env.GEMINI_API_KEY ?? "";
if (!apiKey) {
  console.error("GEMINI_API_KEY ortam değişkeni yok. Google AI Studio anahtarını (AIza…) verip tekrar çalıştırın.");
  process.exit(2);
}
const model = process.env.GEMINI_MODEL || DEFAULT_LLM.model;
let calls = 0;
const chat: ChatFn = (messages, opts) => {
  calls += 1;
  return llmChat({ apiKey, baseUrl: DEFAULT_LLM.baseUrl, model, messages, json: true, temperature: opts?.temperature ?? 0.7, maxTokens: 2400 });
};

const leads = [
  { id: "g1", name: "Aquails Su Arıtma Cihazları", district: "Merkez", city: "Afyonkarahisar", rating: 4.9, reviewCount: 37, website: "" },
  { id: "g2", name: "Lezzet Durağı Kebap Salonu", district: "Kadıköy", city: "İstanbul", rating: 4.3, reviewCount: 812, website: "https://instagram.com/lezzetduragi" },
  { id: "g3", name: "Ege Metal Sanayi ve Ticaret Ltd. Şti.", district: "Kemalpaşa", city: "İzmir", rating: 4.1, reviewCount: 9, website: "https://egemetal.com.tr" },
];

let failed = 0;
const sent: string[] = [];
for (const lead of leads) {
  const ctx = buildContext({ lead: { ...lead, status: "yeni" }, senderName: "Mehmet", recentOthers: sent });
  const before = calls;
  const started = Date.now();
  const r = await generateDrafts({ ctx, category: "ilk_temas", chat });
  console.log(`\n### ${lead.name} — kaynak: ${r.source}, AI çağrısı: ${calls - before}, süre: ${Date.now() - started} ms, model: ${model}`);
  for (const w of r.warnings) console.log(`  uyarı: ${w}`);
  for (const d of r.drafts) {
    console.log(`- [${d.label} · ${d.qualityScore} · ${d.source}] ${d.message}`);
    if (d.blockers.length) console.log(`  ENGEL: ${d.blockers.join("; ")}`);
    if (d.qualityReasons.length) console.log(`  düşürenler: ${d.qualityReasons.join("; ")}`);
  }
  if (r.source === "local") {
    failed += 1;
    console.error("  HATA: AI taslağı kullanılamadı (yukarıdaki uyarıya bakın).");
  }
  if (r.drafts.some((d) => d.blockers.length)) {
    failed += 1;
    console.error("  HATA: engelli taslak döndü.");
  }
  sent.push(r.drafts[r.recommended].message);
}

const ref = buildContext({ lead: { ...leads[0], status: "yeni" }, senderName: "Mehmet" });
const refined = await refineDraft({ ctx: ref, category: "ilk_temas", style: "samimi", message: sent[0], mode: "kisa", chat });
console.log(`\nKısaltma: ${refined.draft.message} (${refined.warnings.join(" ") || "uyarı yok"})`);
const cross = Math.max(similarity(sent[0], sent[1]), similarity(sent[1], sent[2]), similarity(sent[0], sent[2]));
console.log(`Farklı işletmelere giden önerilen mesajlar arasındaki en yüksek benzerlik: ${cross.toFixed(2)}`);
console.log(`Toplam AI çağrısı: ${calls}`);
if (failed) {
  console.error(`gemini-smoke: ${failed} sorun`);
  process.exit(1);
}
console.log("gemini-smoke: gerçek API ile taslak üretimi çalıştı");
