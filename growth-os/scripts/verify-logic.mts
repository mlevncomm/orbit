import { normalizePhone, matchesPrefix, formatPhoneDisplay, phoneForWhatsApp, isWhatsAppCapablePhone } from "../src/lib/phone.ts";
import { composePitch } from "../src/lib/pitch.ts";
import { renderTemplate } from "../src/lib/templates.ts";
import { englishQuery, parseQueries } from "../src/lib/sectors.ts";
import { resolveSearchLocations } from "../src/lib/search-scope.ts";
import { TURKEY_ZONES, WORLD_GROUPS, WORLD_HUBS, REGIONS, zoneFor, worldGroupFor } from "../src/lib/regions.ts";
import { parseCopyJson, sanitizeCopy, copyNeedsRewrite } from "../src/lib/llm.ts";
import { mergePlaybook, playbookIsActive, playbookToPrompt } from "../src/lib/playbook.ts";
import { copyAngles, defaultAngle, generateSalesCopy } from "../src/lib/copy-ai.ts";
import { sectorGroupsFor } from "../src/lib/sectors.ts";
import { TENANT_SEEDS } from "../src/lib/verticals.ts";
import { isRetiredGroqKey, isStaleGeminiModel, normalizeLlmConfig } from "../src/lib/llm-providers.ts";

let failed = 0;
function check(ok: boolean, label: string, detail?: unknown) {
  if (ok) return;
  failed += 1;
  console.error(`FAIL ${label}`, detail ?? "");
}

const phoneCases: Array<[string, string | null, string | undefined]> = [
  ["0532 111 22 33", "+905321112233", undefined],
  ["5321112233", "+905321112233", "TR"],
  ["+90 532 111 22 33", "+905321112233", undefined],
  ["905321112233", "+905321112233", "TR"],
  ["0216 330 11 22", "+902163301122", "TR"],
  ["abc", null, undefined],
  ["+971 50 123 4567", "+971501234567", "AE"],
  ["050 123 4567", "+971501234567", "AE"],
  ["020 7946 0958", "+442079460958", "GB"],
  ["(212) 555-0100", "+12125550100", "US"],
  ["+1 212 555 0100", "+12125550100", "DE"],
  ["0532 111 22 33", null, ""],
  ["5321112233", null, ""],
  ["971501234567", "+971501234567", ""],
];

for (const [input, expected, region] of phoneCases) {
  const got = normalizePhone(input, region);
  check(got === expected, `phone ${input} [${region ?? "default"}]`, `${got} expected ${expected}`);
}

check(formatPhoneDisplay("+905321112233") === "+90 532 111 22 33", "display TR");
check(formatPhoneDisplay("+971501234567") === "+971 501 234 567", "display AE", formatPhoneDisplay("+971501234567"));
check(phoneForWhatsApp("+905321112233") === "905321112233", "wa digits");
check(matchesPrefix("+905321112233", "0532"), "prefix 0532");
check(isWhatsAppCapablePhone("+905321112233"), "TR mobile is WhatsApp candidate");
check(!isWhatsAppCapablePhone("+902722131234"), "TR 0272 landline rejected");
check(isWhatsAppCapablePhone("+971501234567"), "international E164 candidate");

const msg = renderTemplate("Merhaba {ad} / {ilçe}", {
  name: "Test Klinik",
  address: "Moda",
  district: "Kadıköy",
  city: "İstanbul",
  phone: "+905321112233",
});
check(msg === "Merhaba Test Klinik / Kadıköy", "template", msg);

const emptyLoc = renderTemplate("Merhaba {ad}, {ilçe} salonunda randevu.", {
  name: "Nuri",
  address: "",
  district: "",
  city: "",
  phone: "",
});
check(emptyLoc === "Merhaba Nuri, salonunda randevu.", "template empty ilce", emptyLoc);

const cityFallback = renderTemplate("Merhaba {ad}, {ilçe} salonunda.", {
  name: "Nuri",
  address: "",
  district: "",
  city: "İstanbul",
  phone: "",
});
check(cityFallback === "Merhaba Nuri, İstanbul salonunda.", "template city fallback", cityFallback);

const softwarePitch = composePitch("software", {
  name: "Test Diş Kliniği",
  address: "Merkez",
  district: "Merkez",
  city: "Afyonkarahisar",
  phone: "+905321112233",
  website: "",
  campaignQuery: "diş kliniği",
});
check(/^(Merhaba|İyi günler), Wexon.dev’den yazıyorum./.test(softwarePitch.body), "pitch identifies sender", softwarePitch.body);
check(!softwarePitch.body.includes("TL") && !/hazırladım|inceledim|baktım/.test(softwarePitch.body), "first pitch has no price or unverified claims", softwarePitch.body);
check(softwarePitch.body.includes("randevu") && softwarePitch.body.includes("Test Diş Kliniği"), "pitch uses sector value and name", softwarePitch.body);
check(softwarePitch.body.length < 420, "pitch remains concise", softwarePitch.body.length);

check(englishQuery("restoran") === "restaurant", "en restoran");
check(englishQuery("klinik") === "clinic", "en klinik");
check(englishQuery("custom xyz") === "custom xyz", "en passthrough");
check(JSON.stringify(parseQueries("restoran | otel | kafe")) === JSON.stringify(["restoran", "otel", "kafe"]), "parseQueries");

const istanbul = resolveSearchLocations("İstanbul", "Kadıköy");
check(istanbul.length === 1 && istanbul[0].regionCode === "TR" && istanbul[0].district === "Kadıköy", "loc Istanbul");

const turkey = resolveSearchLocations("Tüm Türkiye");
check(turkey.length > 40 && turkey.every((l) => l.regionCode === "TR"), "loc all TR", turkey.length);

const world = resolveSearchLocations("Tüm dünya");
check(world.length === WORLD_HUBS.length, "loc all world", world.length);
check(world.some((l) => l.city === "Dubai" && l.regionCode === "AE" && l.languageCode === "en"), "loc Dubai in world");

const marmara = resolveSearchLocations("Bölge: Marmara");
const zone = zoneFor("Marmara");
check(marmara.length === (zone?.cities.length ?? -1), "loc Marmara size");
check(marmara.every((l) => l.regionCode === "TR"), "loc Marmara TR");

const gcc = resolveSearchLocations("Dünya: Körfez & MENA");
const group = worldGroupFor("Körfez & MENA");
check(gcc.length === (group?.cities.length ?? -1), "loc GCC size");
check(gcc.some((l) => l.city === "Dubai" && l.regionCode === "AE"), "loc GCC Dubai");

const unknown = resolveSearchLocations("Nairobi");
check(unknown.length === 1 && unknown[0].regionCode === "" && unknown[0].languageCode === "en", "loc unknown city");

check(Boolean(zoneFor("ege") && worldGroupFor("europe")), "zone/group id lookup");
check(TURKEY_ZONES.every((z) => z.cities.length > 0), "zones filled");
check(WORLD_GROUPS.every((g) => g.cities.length > 0), "world groups filled");

const regionCities = new Set(REGIONS.map((r) => r.city));
for (const z of TURKEY_ZONES) {
  for (const c of z.cities) {
    check(regionCities.has(c), `zone city missing ${c}`);
  }
}
const hubCities = new Set(WORLD_HUBS.map((h) => h.city));
for (const g of WORLD_GROUPS) {
  for (const c of g.cities) {
    check(hubCities.has(c), `hub missing ${c}`);
  }
}

const parsed = parseCopyJson('```json\n{"name":"Kireç","body":"Merhaba {ad}, {ilçe} için bakabilir miyiz?"}\n```');
check(parsed?.name === "Kireç" && Boolean(parsed?.body.includes("{ad}")), "parse copy json");
const sanitized = sanitizeCopy({ name: "x", body: "Kısa teklif." }, "kirec");
check(sanitized.body.includes("{ad}"), "sanitize injects ad");

const merged = mergePlaybook(
  { tone: "nazik", rules: "kısa", forbidden: "ucuz", offer: "", cta: "keşif" },
  { tone: "_keep", rules: "2 cümle", forbidden: "", offer: "kurulum", cta: "aynı" },
);
check(merged.tone === "nazik" && merged.rules === "2 cümle" && merged.offer === "kurulum" && merged.cta === "keşif", "merge playbook");
check(playbookIsActive(merged), "playbook active");
check(playbookToPrompt(merged).includes("Yasak"), "playbook prompt");
check(copyNeedsRewrite("Merhaba, ucuz cihaz!!!", merged), "rewrite spam");
check(!copyNeedsRewrite("Merhaba {ad}, {ilçe} için keşif ayarlayabilir miyiz?", merged), "rewrite ok");

check(TENANT_SEEDS.map((t) => t.slug).join(",") === "aquails,wexon-dev,akarsu-akademi", "tenant seeds");
check(copyAngles("water")[0].id === "kirec" && defaultAngle("water") === "kirec", "water angles");
check(copyAngles("software")[0].id === "web" && generateSalesCopy("web", "software").name.includes("Yazılım"), "software copy");
check(copyAngles("yks")[0].id === "deneme" && generateSalesCopy("veli", "yks").body.includes("veli"), "yks copy");
check(sectorGroupsFor("water")[0]?.id === "food", "water sectors");
check(sectorGroupsFor("software").some((g) => g.items.some((i) => /yazılım|web|e-ticaret/i.test(i.label + i.query))), "software sectors");
check(sectorGroupsFor("yks").some((g) => g.items.some((i) => /okul|dershane|kurs/i.test(i.label + i.query))), "yks sectors");
check(JSON.stringify(sectorGroupsFor("water")) !== JSON.stringify(sectorGroupsFor("yks")), "verticals not mixed");

check(isRetiredGroqKey("gsk_abc"), "groq key retired");
check(!isRetiredGroqKey("AIzaSyTest"), "gemini key kept");
const remapped = normalizeLlmConfig({
  llmApiKey: "gsk_old",
  llmBaseUrl: "https://api.groq.com/openai/v1",
  llmModel: "openai/gpt-oss-20b",
  llmProvider: "groq",
});
check(remapped.llmApiKey === "", "groq key stripped");
check(remapped.llmProvider === "gemini", "groq provider remapped");
check(remapped.llmBaseUrl.includes("generativelanguage.googleapis.com"), "gemini url");
// Google model listesi (Ekim 2026): kararlı gemini-3.8-flash; 3.7-flash ve 3.5-flash hiç yayınlanmadı
check(remapped.llmModel === "gemini-3.8-flash", "gemini model", remapped.llmModel);
check(isStaleGeminiModel("gemini-2.5-flash"), "2.5 flash stale");
check(isStaleGeminiModel("gemini-3.7-flash") && isStaleGeminiModel("gemini-3.5-flash"), "unpublished 3.x ids stale");
check(!isStaleGeminiModel("gemini-3.8-flash") && !isStaleGeminiModel("gemini-3.6-flash") && !isStaleGeminiModel("gemini-3.5-flash-lite"), "published 3.x ids kept");
const keyed = (llmModel: string) =>
  normalizeLlmConfig({ llmApiKey: "AIzaSyTestKeyNotReal", llmBaseUrl: "", llmModel, llmProvider: "gemini" }).llmModel;
check(keyed("gemini-3.7-flash") === "gemini-3.8-flash", "saved 3.7 id bumped on read", keyed("gemini-3.7-flash"));
check(keyed("gemini-3.6-flash") === "gemini-3.6-flash", "operator choice kept", keyed("gemini-3.6-flash"));
check(
  normalizeLlmConfig({
    llmApiKey: "AIzaSyTestKeyNotReal",
    llmBaseUrl: "https://api.groq.com/openai/v1",
    llmModel: "gemini-2.5-flash",
    llmProvider: "gemini",
  }).llmModel === "gemini-3.8-flash",
  "stale gemini model bumped",
);

// --- Uygulama profilleri (Wexon.dev / Aquails) ---
{
  process.env.AUTH_SECRET ??= "test-secret-test-secret-1234";
  const { encodeProfile, decodeProfile, inProfileGroup, pinHashFor, SHARED_KEYS_FROM } = await import("../src/lib/app-profiles.ts");
  const { hashPassword, verifyPassword } = await import("../src/lib/password.ts");
  const t0 = Date.parse("2026-10-13T08:00:00Z");
  const tok = encodeProfile("u1", "tnt_aquails", t0);
  const ok = (cond: boolean, label: string) => { if (!cond) { failed += 1; console.error("FAIL", label); } };
  ok(decodeProfile(tok, "u1", t0 + 1000)?.tenantId === "tnt_aquails", "profil çerezi çözülür");
  ok(decodeProfile(tok, "u2", t0) === null, "başka kullanıcı profil çerezini kullanamaz");
  ok(decodeProfile(tok, "u1", t0 + 13 * 3600_000) === null, "profil çerezi 12 saatte biter");
  const [pl, mac] = tok.split(".");
  const forged = Buffer.from(JSON.stringify({ userId: "u1", tenantId: "tnt_wexon_dev", exp: t0 + 3600_000 })).toString("base64url");
  ok(decodeProfile(`${forged}.${mac}`, "u1", t0) === null && decodeProfile(`${pl}.x${mac.slice(1)}`, "u1", t0) === null, "imzasız profil çerezi reddedilir");
  ok(decodeProfile(encodeProfile("u1", "tnt_akarsu", t0), "u1", t0) === null, "grupta olmayan profil reddedilir");
  ok(inProfileGroup("tnt_wexon_dev") && inProfileGroup("tnt_aquails") && !inProfileGroup("tnt_akarsu") && !inProfileGroup(null), "profil grubu");
  ok(SHARED_KEYS_FROM.tnt_aquails === "tnt_wexon_dev" && !SHARED_KEYS_FROM.tnt_wexon_dev, "Aquails anahtarları Wexon'dan");
  const prev = process.env.PROFIL_PIN_OZETLERI;
  const h = await hashPassword("4321");
  process.env.PROFIL_PIN_OZETLERI = JSON.stringify({ tnt_aquails: h });
  const ph = pinHashFor("tnt_aquails");
  ok(Boolean(ph) && pinHashFor("tnt_wexon_dev") === null, "profil şifre özeti okunur");
  ok((await verifyPassword("4321", ph!)) && !(await verifyPassword("1234", ph!)), "profil şifresi doğrulanır");
  process.env.PROFIL_PIN_OZETLERI = "bozuk";
  ok(pinHashFor("tnt_aquails") === null, "bozuk özet ayarı güvenli");
  if (prev === undefined) delete process.env.PROFIL_PIN_OZETLERI; else process.env.PROFIL_PIN_OZETLERI = prev;
  const { copyAngles: angles, generateSalesCopy: gen } = await import("../src/lib/copy-ai.ts");
  const { truthIssues } = await import("../src/lib/sales/quality.ts");
  for (const a of angles("water")) {
    const body = gen(a.id, "water").body;
    ok(/Aquails/.test(body) && !/(hastalık|tedavi|kanser|%|ücretsiz|garanti|keser|düşürüyoruz|web sitesi)/iu.test(body) && truthIssues(body, { allowPriorContact: a.id === "takip" }).length === 0, `Aquails hazır şablonu doğru: ${a.id}`);
  }
  const aq = composePitch("water", { name: "Lezzet Durağı Restoran", district: "Merkez", city: "Afyonkarahisar", address: "", phone: "", website: "" }, "Aquails");
  ok(/Aquails/.test(aq.body) && !/(web sitesi|Wexon|hastalık|%)/iu.test(aq.body), "Aquails kuyruk taslağı su arıtma");
}

if (failed) {
  console.error(`FAILED ${failed}`);
  process.exit(1);
}
console.log("logic OK");
