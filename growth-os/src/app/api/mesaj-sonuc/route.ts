import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoryById, STYLES } from "@/lib/sales/categories";
import { OPENED_STATUS, SALES_TAG } from "@/lib/sales/server";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// Yalnızca sistemin gerçekten kaydettiği veriler: kuyruk iş durumları ve operatörün işaretlediği müşteri durumu.
// Teslim, okunma ve cevap bilgisi WhatsApp'tan gelmez; "olumlu/ret" operatörün işaretidir.
const MIN_SAMPLE = 20;

export async function GET() {
  return withTenant(async (ctx) => {
    const [byStatus, opened] = await Promise.all([
      prisma.outreachJob.groupBy({ by: ["status"], where: { tenantId: ctx.tenantId }, _count: { _all: true } }),
      prisma.outreachJob.findMany({
        where: { tenantId: ctx.tenantId, status: OPENED_STATUS, templateId: { startsWith: `${SALES_TAG}:` } },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: { leadId: true, templateId: true, lead: { select: { status: true } } },
      }),
    ]);
    const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;

    // Her müşteri için son açılan mesajın türü ve tarzı, müşterinin bugünkü durumuyla eşleşir
    const seen = new Set<string>();
    const rows = new Map<string, { category: string; style: string; acilan: number; olumlu: number; ret: number }>();
    for (const job of opened) {
      const [, category = "", style = ""] = (job.templateId ?? "").split(":");
      const key = `${category}:${style}`;
      const row = rows.get(key) ?? { category, style, acilan: 0, olumlu: 0, ret: 0 };
      row.acilan += 1;
      if (!seen.has(job.leadId)) {
        seen.add(job.leadId);
        if (job.lead.status === "donus_var" || job.lead.status === "geri_ara") row.olumlu += 1;
        if (job.lead.status === "ilgilenmiyor") row.ret += 1;
      }
      rows.set(key, row);
    }

    return NextResponse.json({
      kuyruk: {
        onayBekleyen: count("pending"),
        onaylanan: count("queued") + count("sending") + count("sent") + count("failed"),
        gonderilen: count("sent"),
        basarisiz: count("failed"),
        reddedilen: count("rejected"),
      },
      whatsappAcilan: opened.length,
      minOrnek: MIN_SAMPLE,
      satirlar: [...rows.values()]
        .map((r) => ({
          ...r,
          tur: categoryById(r.category).label,
          tarz: STYLES.find((s) => s.id === r.style)?.label ?? "Elle yazılmış",
        }))
        .sort((a, b) => b.acilan - a.acilan),
    });
  });
}
