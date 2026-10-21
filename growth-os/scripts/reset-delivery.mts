import { rm } from "node:fs/promises";
import path from "node:path";
import { ensureSeed } from "../src/lib/campaigns.ts";
import { prisma } from "../src/lib/prisma.ts";

await prisma.outreachJob.deleteMany();
await prisma.lead.deleteMany();
await prisma.campaign.deleteMany();
await prisma.template.deleteMany();
await prisma.appSettings.updateMany({
  data: { queuePaused: false, queueStopped: true },
});
await ensureSeed();

const authDir = path.join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Local", "Wexon", "wa-session");
try {
  await rm(authDir, { recursive: true, force: true });
} catch (err) {
  console.log("auth klasoru kilitli, sonraki acilista temizlenecek");
}

const leftover = {
  leads: await prisma.lead.count(),
  campaigns: await prisma.campaign.count(),
  jobs: await prisma.outreachJob.count(),
  templates: await prisma.template.count(),
};
console.log("delivery reset", leftover);
await prisma.$disconnect();
