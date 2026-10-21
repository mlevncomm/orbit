import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { formatPhoneDisplay } from "@/lib/phone";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  yeni: "Yeni",
  yazildi: "Yazıldı",
  donus_var: "Dönüş var",
  geri_ara: "Geri aranacak",
  ulasilamadi: "Açmadı",
  ilgilenmiyor: "İlgilenmiyor",
};

export async function GET(request: Request) {
  return withTenant(async (ctx) => {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const status = (searchParams.get("status") ?? "").trim();

    const leads = await prisma.lead.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { address: { contains: q } },
                { phone: { contains: q } },
                { district: { contains: q } },
                { city: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Müşteriler");
    sheet.columns = [
      { header: "İşletme Adı", key: "name", width: 32 },
      { header: "Adres", key: "address", width: 44 },
      { header: "İletişim No", key: "phone", width: 18 },
      { header: "İl", key: "city", width: 14 },
      { header: "İlçe", key: "district", width: 16 },
      { header: "Puan", key: "rating", width: 10 },
      { header: "Yorum", key: "reviewCount", width: 10 },
      { header: "Web", key: "website", width: 28 },
      { header: "Maps", key: "mapsUrl", width: 28 },
      { header: "Durum", key: "status", width: 14 },
      { header: "Onaylı", key: "consented", width: 10 },
      { header: "Not", key: "notes", width: 28 },
    ];

    for (const lead of leads) {
      sheet.addRow({
        name: lead.name,
        address: lead.address,
        phone: lead.phone ? formatPhoneDisplay(lead.phone) : "",
        city: lead.city,
        district: lead.district,
        rating: lead.rating,
        reviewCount: lead.reviewCount,
        website: lead.website,
        mapsUrl: lead.mapsUrl,
        status: STATUS_LABEL[lead.status] ?? lead.status,
        consented: lead.consented ? "Evet" : "Hayır",
        notes: lead.notes,
      });
    }

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="wexon-musteriler.xlsx"',
      },
    });
  });
}
