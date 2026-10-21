import { composePitch, AUTO_TEMPLATE_ID, AUTO_TEMPLATE_MARKER } from "../pitch";
import { isWhatsAppCapablePhone } from "../phone";
import { buildContext } from "../sales/context";
import { localDrafts } from "../sales/drafts";
import { truthIssues } from "../sales/quality";
import { withOptOut, type SendMode } from "../sales/policy";
import { leadPolicy, previousContacts } from "../sales/server";
import { prisma } from "../prisma";
import { isServerless } from "../platform";
import { getSettings, updateSettings } from "../settings";
import { currentTenant, tenantId } from "../tenant";
import type { Vertical } from "../verticals";
import { cloudConfigured, sendCloudMessage, type CampaignMedia } from "./cloud";

type QueueGlobal = {
  running: boolean;
  loop: Promise<void> | null;
};

const g = globalThis as unknown as { __gooleadsQueue?: QueueGlobal };

function state(): QueueGlobal {
  if (!g.__gooleadsQueue) {
    g.__gooleadsQueue = { running: false, loop: null };
  }
  return g.__gooleadsQueue;
}

function todayStart(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return new Date(`${y}-${m}-${d}T00:00:00+03:00`);
}

/**
 * Güvenlik kilidi. Otomatik WhatsApp gönderimi yalnızca ortamda WA_SENDING_ENABLED=1 olduğunda çalışır.
 * Kilit kapalıyken taslak üretmek ve onaylamak mümkündür ama hiçbir mesaj gönderilmez (cron dahil).
 */
export function sendingEnabled(): boolean {
  return process.env.WA_SENDING_ENABLED === "1";
}

function tid(): string {
  return tenantId();
}

export async function sentTodayCount(): Promise<number> {
  return prisma.outreachJob.count({
    where: { tenantId: tid(), status: "sent", sentAt: { gte: todayStart() } },
  });
}

/**
 * Cloud bağlıysa onaylanan taslağı robot gönderir (otomatik kurallar: açık onay + WhatsApp izni).
 * Değilse taslak kuyrukta "WhatsApp'ta aç" ile elle gönderilir (elle kurallar).
 */
async function draftMode(): Promise<SendMode> {
  return (await cloudConfigured()) ? "queue" : "manual";
}

/** Açık onay yoksa elle gönderilen mesaja ret seçeneği eklenir */
function finalMessage(message: string, retHakkiGerekli?: boolean): string {
  return retHakkiGerekli ? withOptOut(message) : message.trim();
}

function jitter(minSec: number, maxSec: number): number {
  const lo = Math.max(8, Math.min(minSec, maxSec));
  const hi = Math.max(lo, maxSec);
  return lo + Math.random() * (hi - lo);
}

async function sendMessage(phone: string, text: string, media?: CampaignMedia): Promise<"cloud" | "local"> {
  if (await cloudConfigured()) {
    await sendCloudMessage(phone, text, media);
    return "cloud";
  }
  const { sendWebMessage, webReady } = await import("./web");
  if (!(await webReady())) {
    throw new Error("WhatsApp bağlı değil. Mesaj ekranında QR’ı okutun.");
  }
  await sendWebMessage(
    phone,
    text,
    undefined,
    media?.url ? { type: media.type, url: media.url } : undefined,
  );
  return "local";
}

async function tick(): Promise<"idle" | "sent" | "wait" | "paused" | "capped"> {
  const owner = tid();
  // Güvenlik kilidi: ortamda açıkça izin verilmedikçe hiçbir mesaj otomatik gönderilmez (cron dahil)
  if (!sendingEnabled()) return "paused";
  const settings = await getSettings();
  if (settings.queueStopped) return "paused";
  if (settings.queuePaused) return "paused";

  const sent = await sentTodayCount();
  if (sent >= settings.dailyCap) {
    await updateSettings({ queuePaused: true });
    return "capped";
  }

  const candidate = await prisma.outreachJob.findFirst({
    where: {
      tenantId: owner,
      status: "queued",
      channel: "whatsapp",
      scheduledAt: { lte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
    select: { id: true },
  });
  if (!candidate) return "idle";

  // Birden fazla serverless worker aynı anda çalışsa bile işi yalnızca biri sahiplenir.
  const claimed = await prisma.outreachJob.updateMany({
    where: { id: candidate.id, tenantId: owner, status: "queued" },
    data: { status: "sending", error: null },
  });
  if (claimed.count !== 1) return "wait";

  const job = await prisma.outreachJob.findFirst({
    where: { id: candidate.id, tenantId: owner, status: "sending" },
    include: { lead: true },
  });
  if (!job) return "wait";

  if (!job.lead.phone) {
    await prisma.outreachJob.update({
      where: { id: job.id },
      data: { status: "skipped", error: "Telefon yok" },
    });
    return "sent";
  }

  // Gönderim anında politika yeniden: onay sonrası ret gelmiş ya da başka yoldan yazılmış olabilir
  const policy = await leadPolicy(job.lead, "queue", undefined, job.id);
  if (!policy.allowed) {
    await prisma.outreachJob.update({ where: { id: job.id }, data: { status: "skipped", error: policy.reason } });
    return "sent";
  }
  if (await cloudConfigured() && policy.kind !== "yanit") {
    // Meta: müşteri son 24 saatte yazmadıysa yalnızca onaylı şablon gönderilebilir; sistem onaylı şablon göndermez
    await prisma.outreachJob.update({
      where: { id: job.id },
      data: { status: "skipped", error: "WhatsApp 24 saat kuralı: müşteri yazmadan serbest metin gönderilemez. Müşteriler ekranından WhatsApp’ta elle yazın." },
    });
    return "sent";
  }

  try {
    const mediaType = settings.campaignMediaType === "image" || settings.campaignMediaType === "video"
      ? settings.campaignMediaType
      : null;
    const firstMessageMedia: CampaignMedia | undefined =
      job.lead.status === "yeni" &&
      settings.campaignMediaEnabled &&
      mediaType &&
      (settings.campaignMediaId || settings.campaignMediaUrl)
        ? {
            type: mediaType,
            ...(settings.campaignMediaId ? { id: settings.campaignMediaId } : { url: settings.campaignMediaUrl }),
          }
        : undefined;
    await sendMessage(job.lead.phone, job.message, firstMessageMedia);
    await prisma.outreachJob.update({
      where: { id: job.id },
      data: { status: "sent", sentAt: new Date(), error: null },
    });
    if (job.lead.status === "yeni") {
      await prisma.lead.update({ where: { id: job.leadId }, data: { status: "yazildi" } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gönderilemedi";
    const retryable = message.includes("bağlı değil") || message.includes("hazır değil");
    await prisma.outreachJob.update({
      where: { id: job.id },
      data: retryable
        ? { status: "queued", error: message }
        : { status: "failed", error: message },
    });
    if (retryable) return "wait";
  }

  const delayMs = jitter(settings.delayMinSec, settings.delayMaxSec) * 1000;
  if (!isServerless()) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return "sent";
}

async function loop(): Promise<void> {
  const s = state();
  s.running = true;
  try {
    while (true) {
      const settings = await getSettings();
      if (settings.queueStopped) break;
      const result = await tick();
      if (result === "idle" || result === "paused" || result === "capped") {
        await new Promise((r) => setTimeout(r, 2500));
      } else if (result === "wait") {
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  } finally {
    s.running = false;
    s.loop = null;
  }
}

export function ensureQueueLoop(): void {
  if (isServerless()) return;
  const s = state();
  if (s.loop) return;
  s.loop = loop();
}

export async function processQueueTick(opts?: { serverless?: boolean; maxJobs?: number }) {
  const maxJobs = Math.max(1, Math.min(8, opts?.maxJobs ?? 1));
  const results: string[] = [];
  for (let i = 0; i < maxJobs; i += 1) {
    results.push(await tick());
    const last = results[results.length - 1];
    if (last === "idle" || last === "paused" || last === "capped" || last === "wait") break;
    if (!opts?.serverless) break;
  }
  return results;
}

function wantsAuto(templateId: string, body?: string): boolean {
  if (!templateId || templateId === AUTO_TEMPLATE_ID) return true;
  return (body ?? "").trim() === AUTO_TEMPLATE_MARKER;
}

function isGenericDraft(message: string): boolean {
  const t = message.toLocaleLowerCase("tr");
  return (
    t.includes("keşif notunu hazırladık") ||
    t.includes("kapsam ve süre tek sayfada") ||
    t.includes("aktif bir web sitesi göremedim") ||
    t.includes("ben wexon.dev’den mehmet") ||
    t.includes("daha rafine bir web deneyimi üzerine") ||
    t.includes("sade, mobil odaklı bir web deneyimi üzerine")
  );
}

function pitchFromLead(
  vertical: Vertical,
  lead: {
    name: string;
    district: string;
    city: string;
    address: string;
    phone: string;
    website: string;
    notes: string;
    campaign?: { query: string } | null;
  },
) {
  return composePitch(vertical, {
    name: lead.name,
    district: lead.district,
    city: lead.city,
    address: lead.address,
    phone: lead.phone,
    website: lead.website,
    notes: lead.notes,
    campaignQuery: lead.campaign?.query ?? "",
  }, currentTenant().tenantName);
}

async function refreshGenericDrafts(owner: string, vertical: Vertical): Promise<void> {
  const jobs = await prisma.outreachJob.findMany({
    where: { tenantId: owner, status: "pending" },
    include: { lead: { include: { campaign: { select: { query: true } } } } },
    take: 80,
  });
  for (const job of jobs) {
    if (!isGenericDraft(job.message)) continue;
    const next = pitchFromLead(vertical, job.lead).body;
    if (!next || next === job.message) continue;
    await prisma.outreachJob.update({ where: { id: job.id }, data: { message: next } });
  }
}

export async function enqueueLeads(opts: {
  leadIds: string[];
  templateId?: string;
}): Promise<{ queued: number; skipped: number; pending: number; reasons: Record<string, number> }> {
  const owner = tid();
  const vertical = currentTenant().vertical;
  const reasons: Record<string, number> = {};
  const skip = (why: string) => {
    skipped += 1;
    reasons[why] = (reasons[why] ?? 0) + 1;
  };
  const rawId = (opts.templateId ?? "").trim();
  const template =
    rawId && rawId !== AUTO_TEMPLATE_ID
      ? await prisma.template.findFirst({ where: { id: rawId, tenantId: owner } })
      : null;
  if (rawId && rawId !== AUTO_TEMPLATE_ID && !template) throw new Error("Şablon bulunamadı");
  const useAuto = wantsAuto(rawId, template?.body);
  // Toplu ilk temasta "hazırladım / inceledim / yazmıştım" gibi doğrulanamayan iddialar kuyruğa giremez
  const issues = vertical === "software" && !useAuto && template ? truthIssues(template.body) : [];
  if (issues.length) throw new Error(`Bu şablon toplu gönderime uygun değil: ${issues[0]}. Şablonu Mesaj ekranında düzeltin.`);

  const { renderTemplate } = await import("../templates");
  const mode = await draftMode();
  let queued = 0;
  let skipped = 0;

  for (const leadId of opts.leadIds) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId: owner },
      include: { campaign: { select: { query: true } } },
    });
    if (!lead || !isWhatsAppCapablePhone(lead.phone)) {
      skip("Cep numarası yok");
      continue;
    }
    const open = await prisma.outreachJob.findFirst({
      where: { tenantId: owner, leadId, status: { in: ["pending", "queued", "sending"] } },
    });
    if (open) {
      skip("Zaten kuyrukta");
      continue;
    }
    // Ret, onay kaydı, takip aralığı ve takip sınırı (elle açılan mesajlar da temas sayılır)
    const policy = await leadPolicy(lead, mode);
    if (!policy.allowed) {
      skip(policy.reason);
      continue;
    }
    const pitch = pitchFromLead(vertical, lead);
    let message: string;
    if (policy.kind === "takip" || policy.kind === "yanit") {
      // Daha önce yazılmış müşteriye ilk temas şablonu tekrar gitmez; önceki mesajı bilen takip taslağı hazırlanır
      const ctx = buildContext({ lead, campaignQuery: lead.campaign?.query ?? "", previousContacts: await previousContacts(lead.id), brand: currentTenant().tenantName, vertical: currentTenant().vertical });
      message = localDrafts(ctx, policy.kind === "takip" ? "takip" : "ilgili")[0].message;
    } else {
      message = useAuto
        ? pitch.body
        : renderTemplate(template!.body, lead)
            .replaceAll("{sektor}", pitch.sector)
            .replaceAll("{teklif}", pitch.offer);
    }
    await prisma.outreachJob.create({
      data: {
        tenantId: owner,
        leadId,
        templateId: useAuto || policy.kind !== "ilk" ? null : template!.id,
        message: finalMessage(message, policy.retHakkiGerekli),
        status: "pending",
        channel: "whatsapp",
      },
    });
    queued += 1;
  }

  return { queued, skipped, pending: queued, reasons };
}

export async function moderateJobs(opts: {
  ids: string[];
  action: "approve" | "reject" | "edit";
  message?: string;
}): Promise<{ updated: number; blocked: string[] }> {
  const owner = tid();
  const ids = opts.ids.filter(Boolean);
  const blocked: string[] = [];
  if (!ids.length) return { updated: 0, blocked };
  const jobs = await prisma.outreachJob.findMany({
    where: { id: { in: ids }, tenantId: owner, status: "pending" },
    include: { lead: true },
  });
  let updated = 0;
  let queuedAny = false;
  const settings = await getSettings();
  const mode = await draftMode();
  let offsetSec = 0;
  for (const job of jobs) {
    if (opts.action === "reject") {
      await prisma.outreachJob.update({
        where: { id: job.id },
        data: { status: "rejected", error: "Operatör reddetti" },
      });
      updated += 1;
      continue;
    }
    const message = (opts.message ?? job.message).trim();
    if (!message) continue;
    const issues = currentTenant().vertical === "software" ? truthIssues(message) : [];
    if (issues.length) throw new Error(`Onaylanmadı: ${issues[0]}. Metni düzeltip tekrar onaylayın.`);
    // Onay anında politika yeniden: taslak oluşturulduktan sonra ret gelmiş olabilir
    const policy = await leadPolicy(job.lead, mode, undefined, job.id);
    if (!policy.allowed) {
      await prisma.outreachJob.update({ where: { id: job.id }, data: { status: "rejected", error: policy.reason } });
      blocked.push(`${job.lead.name}: ${policy.reason}`);
      continue;
    }
    if (mode === "manual") {
      // Elle gönderimde taslak kuyrukta kalır; "WhatsApp'ta aç" ile gönderilir
      await prisma.outreachJob.update({ where: { id: job.id }, data: { message: finalMessage(message, policy.retHakkiGerekli), error: null } });
      updated += 1;
      continue;
    }
    const wait = isServerless() ? 0 : jitter(settings.delayMinSec, settings.delayMaxSec) + offsetSec;
    if (!isServerless()) offsetSec += jitter(settings.delayMinSec, settings.delayMaxSec);
    await prisma.outreachJob.update({
      where: { id: job.id },
      data: {
        message,
        status: "queued",
        error: null,
        scheduledAt: new Date(Date.now() + wait * 1000),
      },
    });
    updated += 1;
    queuedAny = true;
  }
  if (queuedAny) {
    await updateSettings({ queueStopped: false, queuePaused: false });
    ensureQueueLoop();
  }
  return { updated, blocked };
}

export async function markManualSent(opts: {
  id: string;
  message?: string;
}): Promise<{ updated: number }> {
  const owner = tid();
  const job = await prisma.outreachJob.findFirst({
    where: {
      id: opts.id,
      tenantId: owner,
      status: { in: ["pending", "queued", "failed"] },
    },
    select: { id: true, leadId: true, message: true, lead: true },
  });
  if (!job) return { updated: 0 };

  const message = (opts.message ?? job.message).trim();
  if (!message) throw new Error("Mesaj boş olamaz.");
  const issues = currentTenant().vertical === "software" ? truthIssues(message) : [];
  if (issues.length) throw new Error(`Kaydedilmedi: ${issues[0]}.`);
  // Operatör WhatsApp'ta kendisi gönderdi: elle gönderim kuralları (ret, takip aralığı) yeniden uygulanır
  const policy = await leadPolicy(job.lead, "manual", undefined, job.id);
  if (!policy.allowed) throw new Error(policy.reason);
  const sentMessage = finalMessage(message, policy.retHakkiGerekli);

  await prisma.$transaction([
    prisma.outreachJob.update({
      where: { id: job.id },
      data: {
        message: sentMessage,
        status: "sent",
        sentAt: new Date(),
        error: null,
      },
    }),
    prisma.lead.update({
      where: { id: job.leadId },
      data: { status: "yazildi" },
    }),
  ]);
  return { updated: 1 };
}

export async function getQueueSnapshot() {
  const owner = tid();
  const settings = await getSettings();
  const mode = await draftMode();
  try {
    await refreshGenericDrafts(owner, currentTenant().vertical);
  } catch {
    // taslak yenileme kuyruğu göstermeyi durdurmasın
  }
  const [queued, pending, sending, sentToday, failed, current, pendingJobs, lastFailed] = await Promise.all([
    prisma.outreachJob.count({ where: { tenantId: owner, status: "queued" } }),
    prisma.outreachJob.count({ where: { tenantId: owner, status: "pending" } }),
    prisma.outreachJob.count({ where: { tenantId: owner, status: "sending" } }),
    sentTodayCount(),
    prisma.outreachJob.count({ where: { tenantId: owner, status: "failed" } }),
    prisma.outreachJob.findFirst({
      where: { tenantId: owner, status: { in: ["sending", "queued"] } },
      orderBy: [{ status: "desc" }, { createdAt: "asc" }],
      include: { lead: true },
    }),
    prisma.outreachJob.findMany({
      where: { tenantId: owner, status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 30,
      include: { lead: { select: { id: true, name: true, phone: true, status: true, notes: true, consented: true } } },
    }),
    prisma.outreachJob.findFirst({
      where: { tenantId: owner, status: "failed", error: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { error: true },
    }),
  ]);

  return {
    sendingLocked: !sendingEnabled(),
    paused: settings.queuePaused,
    stopped: settings.queueStopped,
    dailyCap: settings.dailyCap,
    delayMinSec: settings.delayMinSec,
    delayMaxSec: settings.delayMaxSec,
    cloud: await cloudConfigured(),
    serverless: isServerless(),
    queued,
    pending,
    sending,
    sentToday,
    failed,
    lastError: lastFailed?.error ?? null,
    campaignMedia:
      settings.campaignMediaEnabled &&
      settings.campaignMediaUrl &&
      (settings.campaignMediaType === "image" || settings.campaignMediaType === "video")
        ? { type: settings.campaignMediaType, url: settings.campaignMediaUrl }
        : null,
    current: current
      ? {
          id: current.id,
          status: current.status,
          name: current.lead.name,
          phone: current.lead.phone,
        }
      : null,
    drafts: (await Promise.all(pendingJobs.map(async (job) => {
      const issues = currentTenant().vertical === "software" ? truthIssues(job.message) : [];
      const policy = await leadPolicy(job.lead, mode, undefined, job.id);
      const message = policy.allowed ? finalMessage(job.message, policy.retHakkiGerekli) : job.message;
      return { job, message, blocked: !policy.allowed ? policy.reason : issues.length ? `${issues[0]}; metni düzeltin ya da reddedin.` : null };
    }))).map(({ job, message, blocked }) => ({
      id: job.id,
      name: job.lead.name,
      phone: job.lead.phone,
      message,
      channel: job.channel,
      firstContact: job.lead.status === "yeni",
      blocked,
    })),
  };
}
