/* eslint-disable @typescript-eslint/no-explicit-any -- test betiği tipsiz JSON yanıtlarını okur */
// Uçtan uca entegrasyon testi: çalışan YEREL uygulamaya HTTP ile bağlanır, yerel SQLite veritabanında
// yalnızca "E2E-" önekli test kayıtları açar ve sonunda onları siler. Canlı ortama asla bağlanmaz.
//   1) Sunucu kilitli:   npx next dev            → npx tsx scripts/verify-e2e.mts
//   2) Kilit açık:       WA_SENDING_ENABLED=1 npx next dev → npx tsx scripts/verify-e2e.mts --kilit-acik
// Ortam: .env.development.local (DATABASE_URL=file:..., ADMIN_EMAIL, ADMIN_PASSWORD, CRON_SECRET). Değerler yazdırılmaz.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.ts";

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^(["'])(.*)\1$/, "$2")]),
);
if (!/^file:/.test(env.DATABASE_URL ?? "")) {
  console.error("Güvenlik: bu test yalnızca yerel SQLite veritabanında çalışır.");
  process.exit(2);
}
process.env.DATABASE_URL = env.DATABASE_URL;
const BASE = process.env.E2E_URL ?? "http://127.0.0.1:3000";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error("Güvenlik: E2E_URL yalnızca yerel adres olabilir.");
  process.exit(2);
}
const unlocked = process.argv.includes("--kilit-acik");
const prisma = new PrismaClient();
const TENANT = "tnt_wexon_dev";
const PROFIL_UYE = "e2e-profil@uye.test";

let failed = 0;
let passed = 0;
const results: string[] = [];
function check(ok: boolean, label: string, detail?: unknown) {
  if (ok) {
    passed += 1;
    results.push(`✔ ${label}`);
    return;
  }
  failed += 1;
  results.push(`✘ ${label}`);
  console.error(`FAIL ${label}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 600));
}

let cookie = "";
async function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(BASE + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    const jar = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
    for (const c of set) jar.set(c.split("=")[0], c.split(";")[0]);
    cookie = [...jar.values()].join("; ");
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const day = 86_400_000;
async function cleanup() {
  const leads = await prisma.lead.findMany({ where: { tenantId: TENANT, name: { startsWith: "E2E-" } }, select: { id: true } });
  const ids = leads.map((l) => l.id);
  await prisma.outreachJob.deleteMany({ where: { leadId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  await prisma.template.deleteMany({ where: { tenantId: TENANT, name: { startsWith: "E2E-" } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: TENANT, detail: { contains: "\"leadId\":\"" }, action: { startsWith: "lead." }, createdAt: { gte: new Date(Date.now() - day) } } });
}
async function lead(name: string, extra: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: { tenantId: TENANT, placeId: `e2e-${name}-${Date.now()}`, name, phone: `+90555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, district: "Merkez", city: "Afyonkarahisar", ...extra },
  });
}

try {
  await cleanup();
  // Oturum
  check((await call("/api/auth", { body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } })).status === 200, "giriş");
  check((await call("/api/platform", { body: { action: "impersonate", tenantId: TENANT } })).status === 200, "Wexon.dev işletmesine geçiş");

  // Test kayıtları
  const aq = await lead("E2E-Aquails Su Arıtma Cihazları", { rating: 4.9, reviewCount: 37 });
  const yeni = await lead("E2E-Lezzet Kebap Restoran");
  const onayli = await lead("E2E-Bella Güzellik Salonu", { website: "https://bella-e2e.example" });
  const ret = await lead("E2E-Kent Gayrimenkul");
  // Hiç WhatsApp izni olmadan ret bildiren müşteri
  const retIzinsiz = await lead("E2E-Pınar Emlak", { status: "ilgilenmiyor" });
  // Açık ticari onayı olan ama WhatsApp izni olmayan müşteri
  const waIzinsiz = await lead("E2E-Deniz Fitness");
  const eski = await lead("E2E-Usta Oto Servis", { status: "yazildi" });
  const takip = await lead("E2E-Ege Metal Sanayi", { status: "yazildi" });
  // Eski sürümden kalma, kaynağı kayıtlı olmayan "Onaylı" işareti (izin sayılmamalı)
  const eskiOnay = await lead("E2E-Moda Butik", { consented: true });
  await prisma.outreachJob.create({ data: { tenantId: TENANT, leadId: takip.id, message: "E2E eski ilk mesaj", status: "sent", channel: "whatsapp", sentAt: new Date(Date.now() - 5 * day), createdAt: new Date(Date.now() - 5 * day) } });

  // 13) İletişim izni: teknik uygunluktan ayrı hukuki dayanak
  const isaret = await call(`/api/leads/${yeni.id}`, { method: "PATCH", body: { consented: true } });
  check(isaret.status === 400, "kaynaksız “Onaylı” işareti reddedilir (izin otomatik oluşmaz)", isaret.json);
  const yanlisTur = await call(`/api/leads/${yeni.id}`, { method: "PATCH", body: { legalBasis: { tur: "acik_onay" } } });
  check(yanlisTur.status === 400, "kaynağı olmadan dayanak kaydedilmez");
  const gEski = await call(`/api/leads/${eski.id}/mesaj`);
  check(gEski.json.legal.durum === "yok" && gEski.json.policy.allowed && gEski.json.policy.kind === "takip", "“Yazıldı” müşteriye ilk temas tekrar gitmez, takip sayılır", gEski.json.policy);
  const gEskiOnay = await call(`/api/leads/${eskiOnay.id}/mesaj`);
  check(gEskiOnay.json.legal.durum === "kaynaksiz" && gEskiOnay.json.policy.allowed && gEskiOnay.json.policy.retHakkiGerekli, "kaynağı belirsiz eski işaret açık onay sayılmaz (ret cümlesi eklenir)", gEskiOnay.json.policy);
  const basisOnay = await call(`/api/leads/${onayli.id}`, { method: "PATCH", body: { legalBasis: { tur: "acik_onay", kaynak: "telefon", not: "E2E telefon görüşmesi" } } });
  check(basisOnay.status === 200 && basisOnay.json.consented === true, "açık onay kaynağıyla kaydedilir");
  await call(`/api/leads/${takip.id}`, { method: "PATCH", body: { legalBasis: { tur: "acik_onay", kaynak: "whatsapp_yazisma" } } });
  await call(`/api/leads/${aq.id}`, { method: "PATCH", body: { legalBasis: { tur: "tacir_esnaf", kaynak: "operator_beyani", not: "E2E işletme hattı" } } });
  await call(`/api/leads/${waIzinsiz.id}`, { method: "PATCH", body: { legalBasis: { tur: "acik_onay", kaynak: "telefon" } } });

  // --- WhatsApp kanal izni (Meta opt-in) yalnızca otomatik gönderim için ---
  const gWa0 = await call(`/api/leads/${aq.id}/mesaj`);
  check(gWa0.json.whatsapp.durum === "yok" && gWa0.json.policy.allowed && gWa0.json.policy.retHakkiGerekli, "elle gönderim WhatsApp izni kaydı istemez (ret cümlesiyle)", gWa0.json.policy);
  check((await call(`/api/leads/${aq.id}`, { method: "PATCH", body: { whatsappOptIn: { kaynak: "uydurma" } } })).status === 400, "kaynağı geçersiz WhatsApp izni kaydedilmez");
  check((await call(`/api/leads/${retIzinsiz.id}`, { method: "PATCH", body: { whatsappOptIn: { kaynak: "musteri_whatsapp_yazdi", not: "E2E" } } })).status === 400, "ret bildirene WhatsApp izni kaydedilemez");
  const gWaYok = await call(`/api/leads/${waIzinsiz.id}/mesaj`);
  check(gWaYok.json.legal.durum === "var" && gWaYok.json.policy.allowed && !gWaYok.json.policy.retHakkiGerekli, "açık onaylı müşteriye elle yazılır, ret cümlesi gerekmez", gWaYok.json.policy);
  const draftOnly = await call(`/api/leads/${waIzinsiz.id}/mesaj`, { body: { action: "generate", category: "ilk_temas" } });
  check(draftOnly.status === 200 && draftOnly.json.result.drafts.length === 3, "izinsiz müşteri için taslak hazırlama çalışır (gönderim yok)");
  for (const l of [aq, onayli, takip, eski, ret]) await call(`/api/leads/${l.id}`, { method: "PATCH", body: { whatsappOptIn: { kaynak: "musteri_whatsapp_yazdi", not: "E2E" } } });
  await call(`/api/leads/${ret.id}`, { method: "PATCH", body: { status: "ilgilenmiyor" } });
  const gWa1 = await call(`/api/leads/${aq.id}/mesaj`);
  check(gWa1.json.whatsapp.durum === "var" && gWa1.json.whatsapp.kaynak === "musteri_whatsapp_yazdi" && gWa1.json.whatsapp.kaydeden === env.ADMIN_EMAIL && gWa1.json.policy.allowed, "WhatsApp izni kaydedilince uygun akış açılır", gWa1.json.whatsapp);
  const gOnayli = await call(`/api/leads/${onayli.id}/mesaj`);
  check(gOnayli.json.legal.durum === "var" && gOnayli.json.legal.kaynak === "telefon" && gOnayli.json.legal.kapsam === "whatsapp_ticari_ileti" && Boolean(gOnayli.json.legal.zaman) && gOnayli.json.legal.kaydeden === env.ADMIN_EMAIL, "izin defteri: kaynak, kapsam, zaman ve kaydeden tutulur", gOnayli.json.legal);

  // 1-4) Kayıt, veri ve sektör tanıma, hizmet seçimi
  const g = await call(`/api/leads/${aq.id}/mesaj`);
  check(g.status === 200 && g.json.ctx.sector.id === "teknik" && g.json.ctx.shortName === "E2E-Aquails", "sektör tanıma ve kısa ad", g.json?.ctx?.sector);
  check(g.json.category === "ilk_temas" && g.json.policy.kind === "ilk" && g.json.policy.retHakkiGerekli === true, "tacir/esnaf beyanlı yeni müşteri → ilk temas, ret hakkı zorunlu", g.json?.policy);
  check(g.json.ctx.facts.some((f: string) => f.includes("4.9") || f.includes("4,9")), "Google puanı doğrulanmış bilgi olarak bağlamda", g.json.ctx.facts);
  await call(`/api/leads/${eski.id}`, { method: "PATCH", body: { legalBasis: { tur: "acik_onay", kaynak: "telefon" } } });
  const gOto = await call(`/api/leads/${eski.id}/mesaj`);
  check(gOto.json.policy.kind === "takip" && gOto.json.category === "takip", "kaydı olmayan Yazıldı müşteri → takip (ilk temas tekrar edilmez)", gOto.json.policy);
  const gTakip = await call(`/api/leads/${takip.id}/mesaj`);
  check(gTakip.json.policy.allowed && gTakip.json.policy.kind === "takip" && gTakip.json.ctx.previousContacts.length === 1, "5 gün önce yazılmış müşteri → izinli takip", gTakip.json.policy);

  // 5-7) Üretim, üç alternatif, kalite
  const gen = await call(`/api/leads/${aq.id}/mesaj`, { body: { action: "generate", category: "ilk_temas", senderName: "Mehmet" } });
  check(gen.status === 200 && gen.json.result.drafts.length === 3, "üç alternatif üretildi", gen.status);
  check(gen.json.result.drafts.every((d: any) => !d.blockers.length && d.qualityScore >= 85), "taslaklar engelsiz ve ≥85", gen.json.result.drafts.map((d: any) => [d.qualityScore, d.qualityReasons]));
  check(gen.json.result.drafts.every((d: any) => /tekrar yazmam|istemezseniz/i.test(d.message)), "tacir/esnaf beyanında taslaklar ret seçeneği içerir");
  const retsiz = await call(`/api/leads/${eskiOnay.id}/mesaj`, { body: { action: "record", category: "ilk_temas", style: "elle", message: "Merhaba, ben Mehmet, Wexon.dev’den yazıyorum. E2E-Moda Butik için ürünleri sade gösteren bir site önerim var. Kısaca anlatayım mı?" } });
  const retsizIs = await prisma.outreachJob.findFirst({ where: { leadId: eskiOnay.id }, orderBy: { createdAt: "desc" } });
  check(retsiz.status === 200 && /tekrar yazmam/.test(retsizIs?.message ?? ""), "açık onay yoksa ret cümlesi kayda kendiliğinden eklenir", { status: retsiz.status, mesaj: retsizIs?.message });
  check(new Set(gen.json.result.drafts.map((d: any) => d.message.split(/(?<=[.!?])\s+/)[0])).size === 3, "üç taslağın açılışı farklı");
  check(gen.json.result.source === (gen.json.result.aiCalls ? "ai" : "local") || gen.json.result.source === "karma", "kaynak bilgisi tutarlı", gen.json.result.source);
  const genRet = await call(`/api/leads/${ret.id}/mesaj`, { body: { action: "generate", category: "ilk_temas" } });
  check(genRet.status === 409, "ret bildirene satış taslağı üretilmez", genRet.status);
  check((await call(`/api/leads/${ret.id}/mesaj`, { body: { action: "generate", category: "kapanis" } })).status === 200, "ret bildirene kapanış taslağı üretilir");

  // 8) Düzenleme ve kaydetme
  const kisa = await call(`/api/leads/${aq.id}/mesaj`, { body: { action: "refine", category: "ilk_temas", style: "samimi", mode: "kisa", message: gen.json.result.drafts[0].message } });
  check(kisa.status === 200 && kisa.json.draft.message.length <= gen.json.result.drafts[0].message.length, "kısaltma çalışır", kisa.status);
  const sahte = await call(`/api/leads/${aq.id}/mesaj`, { body: { action: "record", category: "ilk_temas", style: "elle", message: "Merhaba, E2E-Aquails sitenizi inceledim ve tasarım hazırladım. Son fırsat!" } });
  check(sahte.status === 422, "yalan iddialı mesaj kaydedilmez", sahte.status);
  const mesaj = gen.json.result.drafts[gen.json.result.recommended].message;
  const kayit = await call(`/api/leads/${aq.id}/mesaj`, { body: { action: "record", category: "ilk_temas", style: gen.json.result.drafts[gen.json.result.recommended].style, message: mesaj, phone: "0555 111 22 33" } });
  check(kayit.status === 200 && kayit.json.lead.status === "yazildi" && kayit.json.lead.phone === "+905551112233", "kayıt: durum Yazıldı ve numara güncellendi", kayit.json?.lead?.status);
  const ikinci = await call(`/api/leads/${aq.id}/mesaj`, { body: { action: "record", category: "takip", style: "samimi", message: "Merhaba, Wexon.dev’den. Geçen gün E2E-Aquails için kısa bir mesaj göndermiştim; gündeminizde değilse sorun değil." } });
  check(ikinci.status === 409, "aynı müşteriye 3 gün dolmadan ikinci mesaj kaydedilmez (mükerrer koruması)", ikinci.status);
  const retKayit = await call(`/api/leads/${ret.id}/mesaj`, { body: { action: "record", category: "ilk_temas", style: "elle", message: "Merhaba, Wexon.dev’den yazıyorum. E2E-Kent için kısa bir fikrim var, anlatayım mı?" } });
  check(retKayit.status === 409, "ret bildirene satış mesajı kaydedilmez", retKayit.status);
  const kapanisIzinsiz = await call(`/api/leads/${retIzinsiz.id}/mesaj`, { body: { action: "record", category: "kapanis", style: "samimi", message: "Anladım, teşekkür ederim. Sizi bir daha rahatsız etmeyeceğim. İyi çalışmalar dilerim." } });
  check(kapanisIzinsiz.status === 200, "ret bildirene elle bir kez kapanış (izin kaydı aranmaz)", kapanisIzinsiz.status);
  const kapanis = await call(`/api/leads/${ret.id}/mesaj`, { body: { action: "record", category: "kapanis", style: "samimi", message: "Anladım, bilgi verdiğiniz için teşekkür ederim. Sizi bir daha bu konuda rahatsız etmeyeceğim. İyi çalışmalar dilerim." } });
  check(kapanis.status === 200, "ret bildirene bir kez kapanış mesajı");
  const kapanis2 = await call(`/api/leads/${ret.id}/mesaj`, { body: { action: "record", category: "kapanis", style: "samimi", message: "Tamamdır, teşekkürler. İyi çalışmalar." } });
  check(kapanis2.status === 409, "ikinci kapanış mesajı engellenir", kapanis2.status);
  const takipKayit = await call(`/api/leads/${takip.id}/mesaj`, { body: { action: "record", category: "takip", style: "samimi", message: "Merhaba, Mehmet ben, Wexon.dev’den. Geçen hafta E2E-Ege Metal için kısa bir mesaj göndermiştim. Şu an gündeminizde değilse sorun değil; ileride ihtiyaç olursa buradayım." } });
  check(takipKayit.status === 200, "izinli takip mesajı kaydedilir", takipKayit.json);

  // 9) Şablon kaydetme (önizleme kaynağı)
  const sablon = await call("/api/templates", { body: { name: "E2E-şablon", body: "Merhaba, Wexon.dev’den yazıyorum. {ad} için kısa bir fikrim var. Kısaca anlatayım mı?" } });
  check(sablon.status === 200 || sablon.status === 201, "şablon kaydedilir", sablon.status);

  // 13) İzin değişikliği denetim kaydı
  await call(`/api/leads/${yeni.id}`, { method: "PATCH", body: { legalBasis: { tur: "acik_onay", kaynak: "form" } } });
  check((await call(`/api/leads/${yeni.id}/mesaj`)).json.policy.allowed === true, "elle yazmak için WhatsApp izni kaydı gerekmez");
  await call(`/api/leads/${yeni.id}`, { method: "PATCH", body: { whatsappOptIn: { kaynak: "musteri_whatsapp_yazdi", not: "E2E" } } });
  check((await call(`/api/leads/${yeni.id}/mesaj`)).json.policy.allowed === true, "dayanak + WhatsApp izni kaydından sonra da elle yazılabilir");
  await call(`/api/leads/${yeni.id}`, { method: "PATCH", body: { whatsappOptInRevoke: { neden: "E2E" } } });
  check((await call(`/api/leads/${yeni.id}/mesaj`)).json.policy.allowed === false, "WhatsApp izni geri çekilince gönderim kapanır");
  await call(`/api/leads/${yeni.id}`, { method: "PATCH", body: { legalBasisRevoke: { neden: "E2E vazgeçti" } } });
  const audits = await prisma.auditLog.findMany({ where: { tenantId: TENANT, detail: { contains: yeni.id } }, orderBy: { createdAt: "asc" } });
  check(audits.filter((a) => a.action.startsWith("lead.consent")).map((a) => a.action).join(",") === "lead.consent.granted,lead.consent.revoked" && audits.filter((a) => a.action.startsWith("lead.whatsapp_optin")).map((a) => a.action).join(",") === "lead.whatsapp_optin.granted,lead.whatsapp_optin.revoked", "ticari onay ve WhatsApp izni ayrı ayrı izin defterine yazılır", audits.map((a) => a.action));
  const gCekildi = await call(`/api/leads/${yeni.id}/mesaj`);
  check(gCekildi.json.legal.durum === "geri_cekildi" && !gCekildi.json.policy.allowed && (await prisma.lead.findUnique({ where: { id: yeni.id } }))?.consented === false, "geri çekilen dayanakla satış mesajı yok", gCekildi.json.legal);
  // Ret, izni de geri çeker
  await call(`/api/leads/${takip.id}`, { method: "PATCH", body: { status: "ilgilenmiyor" } });
  const gRet = await call(`/api/leads/${takip.id}/mesaj`);
  check(gRet.json.legal.durum === "geri_cekildi" && (await prisma.lead.findUnique({ where: { id: takip.id } }))?.consented === false, "ret bildirimi izni geri çeker", gRet.json.legal);
  check((await call(`/api/leads/${takip.id}`, { method: "PATCH", body: { legalBasis: { tur: "acik_onay", kaynak: "telefon" } } })).status === 400, "ret bildirene dayanak kaydedilemez");

  // 10) Kuyruğa ekleme (Cloud yok → elle gönderim: izin kaydı aranmaz; ret ve 3 gün kuralı geçerli)
  const q1 = await call("/api/outreach", { body: { leadIds: [yeni.id, ret.id, onayli.id, aq.id, eskiOnay.id, waIzinsiz.id], templateId: "auto" } });
  check(q1.status === 200 && q1.json.queued === 2 && q1.json.skipped === 4, "kuyruk: izin kaydı olmayan işletme girer; ret, geri çekilmiş ve yeni yazılmış giremez", q1.json);
  check(Object.keys(q1.json.reasons).some((r) => r.includes("gün")) && Object.keys(q1.json.reasons).some((r) => r.includes("iletişim istemediğini")), "kuyruk: atlama nedenleri raporlanır", q1.json.reasons);
  const q1Is = await prisma.outreachJob.findFirst({ where: { leadId: waIzinsiz.id, status: "pending" } });
  check(Boolean(q1Is) && !/tekrar yazmam/.test(q1Is?.message ?? ""), "kuyruk: açık onaylı müşteriye ret cümlesi eklenmez", q1Is?.message);
  const kotuSablon = await call("/api/templates", { body: { name: "E2E-kötü", body: "Merhaba, {ad} için web sitesi tasarımı hazırladım." } });
  const q2 = await call("/api/outreach", { body: { leadIds: [onayli.id], templateId: kotuSablon.json?.id } });
  check(q2.status === 400, "yalan iddialı şablon kuyruğa alınmaz", q2.status);

  // Eski taslak: kontroller öncesi oluşmuş gibi, ret bildiren müşteriye bekleyen taslak
  await prisma.outreachJob.create({ data: { tenantId: TENANT, leadId: ret.id, message: "E2E eski taslak: Merhaba, ücretsiz örnek göndereyim mi?", status: "pending", channel: "whatsapp" } });
  let snap = await call("/api/outreach");
  const eskiTaslak = snap.json.drafts.find((d: any) => d.name === "E2E-Kent Gayrimenkul");
  check(Boolean(eskiTaslak?.blocked), "eski taslak panelde engelli görünür", eskiTaslak);
  const manuel = await call("/api/outreach/approve", { body: { id: eskiTaslak.id, action: "manual-sent" } });
  check(manuel.status === 400, "eski taslak elle 'Gönderdim' ile kaydedilemez", manuel.status);
  const onayRet = await call("/api/outreach/approve", { body: { id: eskiTaslak.id, action: "approve" } });
  check(onayRet.status === 200 && onayRet.json.updated === 0 && onayRet.json.blocked.length === 1, "eski taslak onaylanamaz", onayRet.json);

  const onaysizTaslak = await prisma.outreachJob.create({ data: { tenantId: TENANT, leadId: aq.id, message: "Merhaba, Wexon.dev’den yazıyorum. E2E-Aquails için kısa bir fikrim var; istemezseniz tekrar yazmam.", status: "pending", channel: "whatsapp" } });
  snap = await call("/api/outreach");
  const onaysizKart = snap.json.drafts.find((d: any) => d.id === onaysizTaslak.id);
  check(Boolean(onaysizKart?.blocked) && /gün/.test(onaysizKart.blocked), "yeni yazılmış müşteriye kuyruk taslağı panelde engelli (3 gün)", onaysizKart);
  check((await call("/api/outreach/approve", { body: { id: onaysizTaslak.id, action: "manual-sent" } })).status === 400, "3 gün dolmadan kuyruk taslağı elle “Gönderdim” ile de geçemez");
  check((await prisma.outreachJob.findUnique({ where: { id: onaysizTaslak.id } }))?.status === "pending", "engellenen taslak silinmez, beklemede kalır");

  // 11) Kuyruk onayı + 15) zamanlanmış görev
  const bekleyen = snap.json.drafts.find((d: any) => d.name === "E2E-Bella Güzellik Salonu");
  const onay = await call("/api/outreach/approve", { body: { id: bekleyen.id, action: "approve" } });
  check(onay.status === 200 && onay.json.updated === 1 && (await prisma.outreachJob.findUnique({ where: { id: bekleyen.id } }))?.status === "pending", "Cloud yokken onaylanan taslak elle gönderim için kuyrukta kalır", onay.json);
  const cronYetkisiz = await call("/api/outreach/tick", { headers: { authorization: "Bearer yanlis" } });
  check(cronYetkisiz.status === 401, "zamanlanmış görev yetkisiz çağrılamaz", cronYetkisiz.status);

  if (!unlocked) {
    const cron = await call("/api/outreach/tick", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    check(cron.status === 200 && cron.json.results.every((r: any) => r.result.every((x: string) => x === "paused")), "kilit kapalıyken zamanlanmış görev hiçbir şey göndermez", cron.json?.results);
    snap = await call("/api/outreach");
    check(snap.json.sendingLocked === true && snap.json.sentToday === 0, "kilit kapalıyken hiçbir mesaj gitmez", { locked: snap.json.sendingLocked, sent: snap.json.sentToday });
  } else {
    // Onaydan sonra ret: gönderim anında yakalanmalı (bu bilgisayarda WhatsApp bağlı olmadığı için gerçek gönderim zaten imkânsız)
    await prisma.outreachJob.update({ where: { id: bekleyen.id }, data: { status: "queued", scheduledAt: new Date(Date.now() - 1000) } });
    await prisma.lead.update({ where: { id: onayli.id }, data: { status: "ilgilenmiyor" } });
    const cron = await call("/api/outreach/tick", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    check(cron.status === 200, "kilit açıkken zamanlanmış görev çalışır");
    const job = await prisma.outreachJob.findFirst({ where: { leadId: onayli.id }, orderBy: { createdAt: "desc" } });
    check(job?.status === "skipped" && /iletişim istemediğini/.test(job?.error ?? ""), "onaydan sonra ret: gönderim anında engellendi", job);
    const waJob = await prisma.outreachJob.create({ data: { tenantId: TENANT, leadId: waIzinsiz.id, message: "Merhaba, Wexon.dev’den yazıyorum. E2E-Deniz için kısa bir fikrim var; anlatayım mı?", status: "queued", channel: "whatsapp", scheduledAt: new Date(Date.now() - 1000) } });
    await call("/api/outreach/tick", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    const waJobAfter = await prisma.outreachJob.findUnique({ where: { id: waJob.id } });
    check(waJobAfter?.status === "skipped" && /WhatsApp izni/.test(waJobAfter?.error ?? ""), "zamanlanmış görev: WhatsApp izni olmayan eski iş gönderilmez", waJobAfter);

    // Meta 24 saat kuralı: Cloud API tanımlıyken, müşteri yazmamışsa serbest metin Meta'ya hiç gönderilmez.
    // Sahte token kullanılır; istek Meta'ya gitseydi iş "failed" ve Meta hata mesajıyla düşerdi.
    const before = await prisma.appSettings.findUnique({ where: { tenantId: TENANT } });
    // Ayar API'si üzerinden: sunucunun ayar önbelleği de temizlenir
    await call("/api/settings", { method: "PUT", body: { waCloudToken: "E2E-SAHTE-TOKEN", waPhoneNumberId: "000000000000000" } });
    try {
      const cloudLead = await lead("E2E-Cloud Kuaför");
      await call(`/api/leads/${cloudLead.id}`, { method: "PATCH", body: { legalBasis: { tur: "acik_onay", kaynak: "telefon" } } });
      await call(`/api/leads/${cloudLead.id}`, { method: "PATCH", body: { whatsappOptIn: { kaynak: "musteri_whatsapp_yazdi", not: "E2E" } } });
      await prisma.outreachJob.create({ data: { tenantId: TENANT, leadId: cloudLead.id, message: "Merhaba, Wexon.dev’den yazıyorum. E2E-Cloud için kısa bir fikrim var; anlatayım mı?", status: "queued", channel: "whatsapp", scheduledAt: new Date(Date.now() - 1000) } });
      await call("/api/outreach/tick", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
      const cj = await prisma.outreachJob.findFirst({ where: { leadId: cloudLead.id } });
      check(cj?.status === "skipped" && /24 saat/.test(cj?.error ?? ""), "Cloud API: müşteri yazmadan serbest metin gönderilmez (24 saat kuralı)", cj);
    } finally {
      await call("/api/settings", { method: "PUT", body: { waCloudToken: before?.waCloudToken ?? "", waPhoneNumberId: before?.waPhoneNumberId ?? "" } });
      const after = await prisma.appSettings.findUnique({ where: { tenantId: TENANT } });
      check(after?.waCloudToken === (before?.waCloudToken ?? "") && after?.waPhoneNumberId === (before?.waPhoneNumberId ?? ""), "test sonrası WhatsApp ayarları eski haline döndü");
    }
  }

  // 16) Mesaj sonuçları
  const sonuc = await call("/api/mesaj-sonuc");
  check(sonuc.status === 200 && sonuc.json.whatsappAcilan >= 3, "sonuçlar WhatsApp'ta açılan mesajları sayar", sonuc.json?.whatsappAcilan);

  // Deneme modu: kayıt açmadan taslak
  const before = await prisma.lead.count({ where: { tenantId: TENANT } });
  const deneme = await call("/api/mesaj-deneme", { body: { lead: { name: "Göl Otel", rating: 4.7, reviewCount: 120 }, senderName: "Mehmet" } });
  check(deneme.status === 200 && deneme.json.result.drafts.length === 3 && deneme.json.ctx.sector.id === "otel", "deneme modu üç taslak üretir", deneme.json?.ctx);
  check((await prisma.lead.count({ where: { tenantId: TENANT } })) === before, "deneme modu kayıt oluşturmaz");
  const anon = await fetch(BASE + "/api/mesaj-deneme", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check(anon.status === 401, "deneme modu girişsiz kullanılamaz", anon.status);

  // --- Uygulama profilleri: Wexon.dev / Aquails seçimi, profil şifresi, ortak anahtarlar ---
  const pins = JSON.parse(env.E2E_PROFIL_PINLERI ?? "{}") as Record<string, string>;
  if (pins.tnt_wexon_dev && pins.tnt_aquails) {
    // Program e-postasız açılır: yalnızca profil + 4 haneli şifre
    const adminCookie = cookie;
    cookie = "";
    await prisma.auditLog.deleteMany({ where: { action: "profile.pin_failed", actorId: "anonim" } });
    if (!(await prisma.user.findFirst({ where: { role: "member", tenantId: { in: [TENANT, "tnt_aquails"] } } }))) {
      await prisma.user.create({ data: { email: PROFIL_UYE, passwordHash: await hashPassword(randomBytes(18).toString("base64url")), role: "member", tenantId: TENANT } });
    }
    const kapali = await call("/api/settings");
    check(kapali.status === 401, "profil: şifre girilmeden işletme verisine erişilemez", kapali.status);
    const sayfa = await fetch(BASE + "/ara", { redirect: "manual" });
    check([302, 307, 308].includes(sayfa.status) && /\/profil$/.test(new URL(sayfa.headers.get("location") ?? "", BASE).pathname), "profil: program açılışta e-posta değil profil şifresi ister", sayfa.status);
    const liste = await call("/api/profil");
    check(liste.status === 200 && liste.json.profiller.length === 2 && liste.json.profiller.every((p: any) => p.sifreAyarli && typeof p.yanlis24 === "number" && !("pin" in p) && !("hash" in p)) && !JSON.stringify(liste.json).includes("@"), "profil: iki profil listelenir; şifre, özet ya da e-posta dönmez", liste.json);
    const yanlis = pins.tnt_aquails === "0000" ? "9999" : "0000";
    const y1 = await call("/api/profil", { body: { tenantId: "tnt_aquails", pin: yanlis } });
    check(y1.status === 401 && !String(y1.json?.git ?? ""), "profil: yanlış şifre reddedilir", y1.status);
    check((await call("/api/profil", { body: { tenantId: "tnt_akarsu", pin: pins.tnt_aquails } })).status === 400, "profil: grupta olmayan işletme açılamaz");
    check((await call("/api/settings")).status === 401, "profil: yanlış şifreden sonra program kapalı kalır");
    const ac = await call("/api/profil", { body: { tenantId: "tnt_aquails", pin: pins.tnt_aquails } });
    check(ac.status === 200 && ac.json.git === "/ara", "profil: Aquails doğru şifreyle açılır");
    // Veri ayrımı: Aquails profili Wexon.dev kayıtlarını göremez, değiştiremez, silemez
    const aqListe = await call("/api/leads?limit=500");
    const aqIds = new Set((Array.isArray(aqListe.json) ? aqListe.json : []).map((l: any) => l.id));
    check(aqListe.status === 200 && !aqIds.has(yeni.id) && !aqIds.has(aq.id), "ayrım: Aquails listesinde Wexon.dev müşterisi yok", aqListe.status);
    check((await call(`/api/leads/${yeni.id}/mesaj`)).status === 404, "ayrım: Aquails, Wexon.dev müşterisinin mesaj ekranını açamaz");
    check((await call(`/api/leads/${yeni.id}`, { method: "PATCH", body: { notes: "E2E sızma" } })).status === 404, "ayrım: Aquails, Wexon.dev müşterisini değiştiremez");
    check((await call(`/api/leads/${yeni.id}`, { method: "DELETE" })).status === 404, "ayrım: Aquails, Wexon.dev müşterisini silemez");
    check(Boolean(await prisma.lead.findUnique({ where: { id: yeni.id } })) && (await prisma.lead.findUnique({ where: { id: yeni.id } }))?.notes !== "E2E sızma", "ayrım: Wexon.dev kaydı yerinde ve değişmedi");
    const meAq = await call("/api/me");
    const setAq = await call("/api/settings");
    check(setAq.status === 200 && setAq.json.ortakAnahtar === "Wexon.dev", "profil: Aquails Google ve Gemini anahtarlarını Wexon.dev ile ortak kullanır", setAq.json?.ortakAnahtar);
    const aqRow = await prisma.appSettings.findUnique({ where: { tenantId: "tnt_aquails" } }).catch(() => null);
    check(setAq.json.hasCloudToken === Boolean(aqRow?.waCloudToken) && setAq.json.hasPhoneNumberId === Boolean(aqRow?.waPhoneNumberId), "profil: Aquails WhatsApp ayarı kendi kaydından gelir");
    await call("/api/settings", { method: "PUT", body: { googlePlacesApiKey: "E2E-degistirilemez" } });
    const wxRow = await prisma.appSettings.findUnique({ where: { tenantId: TENANT } }).catch(() => null);
    check(wxRow?.googlePlacesApiKey !== "E2E-degistirilemez" && (await prisma.appSettings.findUnique({ where: { tenantId: "tnt_aquails" } }).catch(() => null))?.googlePlacesApiKey !== "E2E-degistirilemez", "profil: Aquails ortak anahtarı değiştiremez");
    const aqLead = await call("/api/mesaj-deneme", { body: { lead: { name: "E2E Lezzet Durağı Restoran", city: "Afyonkarahisar" }, senderName: "Ayşe" } });
    const aqMsg = aqLead.json?.result?.drafts?.map((d: any) => d.message).join(" ") ?? "";
    check(aqLead.status === 200 && aqLead.json.ctx.vertical === "water" && /Aquails/.test(aqMsg) && !/web sitesi|Wexon/iu.test(aqMsg), "profil: Aquails taslakları su arıtma üzerine", { v: aqLead.json?.ctx?.vertical, m: aqMsg.slice(0, 300) });
    const wx = await call("/api/profil", { body: { tenantId: TENANT, pin: pins.tnt_wexon_dev } });
    const setWx = await call("/api/settings");
    check(wx.status === 200 && setWx.status === 200 && setWx.json.ortakAnahtar === null && setWx.json.hasPlacesKey === setAq.json.hasPlacesKey && setWx.json.hasLlmKey === setAq.json.hasLlmKey, "profil: Wexon.dev'e geçiş, anahtar durumu iki profilde aynı");
    check(Boolean(meAq.json) && JSON.stringify(meAq.json).includes("Aquails"), "profil: /api/me açık profili gösterir", meAq.json);
    await call("/api/profil", { method: "DELETE" });
    check((await call("/api/settings")).status === 401, "profil: kilitleyince program kapanır, yeniden şifre istenir");
    const uyari = await call("/api/profil");
    check((uyari.json?.profiller ?? []).find((p: any) => p.tenantId === "tnt_aquails")?.yanlis24 >= 1, "profil: yanlış deneme profil ekranında uyarı olarak görünür");
    for (let i = 0; i < 5; i += 1) await call("/api/profil", { body: { tenantId: TENANT, pin: yanlis } });
    const kilit = await call("/api/profil", { body: { tenantId: TENANT, pin: pins.tnt_wexon_dev } });
    check(kilit.status === 429 && typeof kilit.json?.kilitBitis === "number", "profil: aynı cihazdan 5 yanlış denemeden sonra doğru şifre de kabul edilmez", kilit.status);
    check((await call("/api/profil", { body: { tenantId: "tnt_aquails", pin: pins.tnt_aquails } })).status === 429, "profil: cihaz kilidi diğer profil için de geçerli");
    cookie = adminCookie;
  } else {
    check(false, "profil: .env.development.local içinde E2E_PROFIL_PINLERI yok");
  }
} catch (err) {
  failed += 1;
  console.error("HATA", err);
} finally {
  await prisma.auditLog.deleteMany({ where: { action: { in: ["profile.pin_failed", "profile.opened"] }, createdAt: { gte: new Date(Date.now() - day) } } });
  const uye = await prisma.user.findUnique({ where: { email: PROFIL_UYE } });
  if (uye) {
    await prisma.auditLog.deleteMany({ where: { actorId: uye.id } });
    await prisma.user.delete({ where: { id: uye.id } });
  }
  await cleanup();
  await prisma.$disconnect();
}

console.log(results.join("\n"));
if (failed) {
  console.error(`verify-e2e: ${failed} başarısız, ${passed} geçti`);
  process.exit(1);
}
console.log(`verify-e2e (${unlocked ? "kilit açık" : "kilit kapalı"}): ${passed} kontrol geçti`);
