import "server-only";
import { llmChat } from "../llm";
import { GEMINI_MODEL_FALLBACKS } from "../llm-providers";
import { getPlaybook, playbookToPrompt } from "../playbook";
import { prisma } from "../prisma";
import { getSettings } from "../settings";
import { currentTenant, tenantId } from "../tenant";
import { categoryById, type CategoryId, type StyleId } from "./categories";
import { buildContext, type ContactRecord } from "./context";
import type { ChatFn } from "./engine";
import { CONSENT_ACTIONS, deriveLegal, deriveWhatsApp, WHATSAPP_ACTIONS, type ChannelState, type LegalState } from "./consent";
import { contactPolicy, type ContactHistory, type SendMode } from "./policy";

// Satış mesajı katmanının veritabanı ve AI bağlantısı. Mesaj göndermez.

/** Operatörün WhatsApp'ta açtığı mesajların kaydı (kuyruk bunları göndermez) */
export const WA_LINK_CHANNEL = "wa-link";
export const OPENED_STATUS = "opened";
export const SALES_TAG = "satis";

export function salesTag(category: CategoryId, style: StyleId | "elle") {
  return `${SALES_TAG}:${category}:${style}`;
}

export async function loadLead(leadId: string) {
  return prisma.lead.findFirst({
    where: { id: leadId, tenantId: tenantId() },
    include: { campaign: { select: { query: true } } },
  });
}

export async function previousContacts(leadId: string): Promise<ContactRecord[]> {
  const jobs = await prisma.outreachJob.findMany({
    where: { tenantId: tenantId(), leadId, status: { in: ["sent", OPENED_STATUS] } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { message: true, sentAt: true, createdAt: true, templateId: true },
  });
  return jobs.map((j) => ({
    message: j.message,
    at: (j.sentAt ?? j.createdAt).toISOString(),
    category: j.templateId?.startsWith(`${SALES_TAG}:`) ? j.templateId.split(":")[1] : undefined,
  }));
}

/** Politika için temas geçmişi: gönderilen ya da WhatsApp'ta açılan mesajlar (istenirse bir iş hariç) */
export async function contactHistory(leadId: string, excludeJobId?: string): Promise<ContactHistory> {
  const jobs = await prisma.outreachJob.findMany({
    where: {
      tenantId: tenantId(),
      leadId,
      status: { in: ["sent", OPENED_STATUS] },
      ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { sentAt: true, createdAt: true, templateId: true },
  });
  return {
    count: jobs.length,
    lastAt: jobs[0] ? jobs[0].sentAt ?? jobs[0].createdAt : null,
    closed: jobs.some((j) => j.templateId === `${SALES_TAG}:kapanis` || j.templateId?.startsWith(`${SALES_TAG}:kapanis:`)),
  };
}

/** Son 14 günde başka müşterilere giden mesajlar (isim değiştirilmiş kopya mesajı yakalamak için) */
export async function recentOtherMessages(leadId: string): Promise<string[]> {
  const jobs = await prisma.outreachJob.findMany({
    where: {
      tenantId: tenantId(),
      leadId: { not: leadId },
      status: { in: ["sent", OPENED_STATUS, "queued", "pending"] },
      createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { message: true },
  });
  return jobs.map((j) => j.message);
}

/** İzin defterinden müşterinin güncel hukuki dayanağı */
export async function leadLegal(lead: { id: string; consented: boolean }): Promise<LegalState> {
  const events = await prisma.auditLog.findMany({
    where: { tenantId: tenantId(), action: { in: [...CONSENT_ACTIONS] }, detail: { contains: `"leadId":"${lead.id}"` } },
    orderBy: { createdAt: "asc" },
    select: { action: true, createdAt: true, actorEmail: true, detail: true },
  });
  return deriveLegal(events, lead.consented);
}

/** İzin defterinden müşterinin WhatsApp kanal izni */
export async function leadWhatsApp(lead: { id: string }): Promise<ChannelState> {
  const events = await prisma.auditLog.findMany({
    where: { tenantId: tenantId(), action: { in: [...WHATSAPP_ACTIONS] }, detail: { contains: `"leadId":"${lead.id}"` } },
    orderBy: { createdAt: "asc" },
    select: { action: true, createdAt: true, actorEmail: true, detail: true },
  });
  return deriveWhatsApp(events);
}

export async function leadPolicy(
  lead: { id: string; status: string; notes: string; consented: boolean },
  mode: SendMode,
  category?: string,
  excludeJobId?: string,
) {
  return contactPolicy({
    status: lead.status,
    notes: lead.notes,
    legal: await leadLegal(lead),
    whatsapp: await leadWhatsApp(lead),
    history: await contactHistory(lead.id, excludeJobId),
    mode,
    category,
  });
}

export async function leadContext(
  leadId: string,
  input: { senderName?: string; designLink?: string; customerReply?: string },
) {
  const lead = await loadLead(leadId);
  if (!lead) return null;
  const [contacts, playbook, others] = await Promise.all([previousContacts(lead.id), getPlaybook(), recentOtherMessages(lead.id)]);
  const ctx = buildContext({
    lead,
    campaignQuery: lead.campaign?.query ?? "",
    previousContacts: contacts,
    recentOthers: others,
    designLink: input.designLink,
    customerReply: input.customerReply,
    brand: currentTenant().tenantName,
    vertical: currentTenant().vertical,
    senderName: input.senderName,
    playbookOffer: playbook.offer,
  });
  return { lead, ctx, operatorPlaybook: playbookToPrompt(playbook) };
}

/** @param modelOverride yalnızca deneme modu için; izinli Gemini modellerinden biri olmalı */
export async function salesChat(modelOverride?: string): Promise<ChatFn | undefined> {
  const settings = await getSettings();
  if (!settings.llmApiKey) return undefined;
  const model = modelOverride && (GEMINI_MODEL_FALLBACKS as readonly string[]).includes(modelOverride) ? modelOverride : settings.llmModel;
  const meta: NonNullable<ChatFn["meta"]> = [];
  const chat: ChatFn = (messages, opts) =>
    llmChat({
      apiKey: settings.llmApiKey,
      baseUrl: settings.llmBaseUrl,
      model,
      messages,
      json: true,
      temperature: opts?.temperature ?? 0.7,
      maxTokens: 2400,
      timeoutMs: opts?.timeoutMs,
      onMeta: (m) => meta.push(m),
    });
  chat.meta = meta;
  return chat;
}

/** Son 24 saatteki temaslar; arayüz aynı türde ikinci mesajda uyarır (mükerrer) */
export async function recentContacts(leadId: string) {
  const jobs = await prisma.outreachJob.findMany({
    where: {
      tenantId: tenantId(),
      leadId,
      status: { in: ["sent", OPENED_STATUS, "pending", "queued", "sending"] },
      createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { createdAt: true, status: true, templateId: true },
  });
  // Kuyruk işleri (satış etiketi olmayan) ilk temas sayılır
  return jobs.map((j) => ({
    at: j.createdAt.toISOString(),
    status: j.status,
    category: j.templateId?.startsWith(`${SALES_TAG}:`) ? j.templateId.split(":")[1] : "ilk_temas",
  }));
}

/** Lead'in durumu, gönderilen mesaj türüne göre nasıl ilerler */
export function nextStatus(current: string, category: CategoryId): string | null {
  if (category === "kapanis") return current === "ilgilenmiyor" ? null : "ilgilenmiyor";
  const c = categoryById(category);
  if (c.needsReply && ["yeni", "yazildi", "ulasilamadi"].includes(current)) return "donus_var";
  if (current === "yeni") return "yazildi";
  return null;
}
