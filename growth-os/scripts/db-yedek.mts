// Canlı veritabanının salt-okunur JSON yedeği. Hiçbir kaydı değiştirmez ya da silmez.
//   DATABASE_URL="postgresql://..." npx tsx scripts/db-yedek.mts
// Çıktı: yedekler/yedek-<tarih>.json — şifre özetleri ve API anahtarları içerir; güvenli bir yerde saklayın, paylaşmayın.
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL yok. Supabase → Project Settings → Database → Connection string (URI) değerini verin.");
  process.exit(2);
}

const prisma = new PrismaClient();
const tables = {
  tenant: () => prisma.tenant.findMany(),
  user: () => prisma.user.findMany(),
  auditLog: () => prisma.auditLog.findMany(),
  campaign: () => prisma.campaign.findMany(),
  lead: () => prisma.lead.findMany(),
  template: () => prisma.template.findMany(),
  outreachJob: () => prisma.outreachJob.findMany(),
  brandPlaybook: () => prisma.brandPlaybook.findMany(),
  coachMessage: () => prisma.coachMessage.findMany(),
  igThread: () => prisma.igThread.findMany(),
  igMessage: () => prisma.igMessage.findMany(),
  appSettings: () => prisma.appSettings.findMany(),
};

try {
  const data: Record<string, unknown[]> = {};
  for (const [name, read] of Object.entries(tables)) {
    data[name] = await read();
    console.log(`${name}: ${data[name].length} kayıt`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("yedekler", { recursive: true });
  const file = `yedekler/yedek-${stamp}.json`;
  writeFileSync(file, JSON.stringify({ alindi: new Date().toISOString(), data }, null, 2));
  console.log(`Yedek yazıldı: ${file}`);
} finally {
  await prisma.$disconnect();
}
