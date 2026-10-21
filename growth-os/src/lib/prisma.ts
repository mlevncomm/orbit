import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  if (!url.includes(":6543")) return url;
  const joiner = url.includes("?") ? "&" : "?";
  let next = url;
  if (!/pgbouncer=/i.test(next)) next += `${joiner}pgbouncer=true`;
  if (!/connection_limit=/i.test(next)) {
    next += `${next.includes("?") ? "&" : "?"}connection_limit=1`;
  }
  return next;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: (() => {
      const url = databaseUrl();
      return url ? { db: { url } } : undefined;
    })(),
  });

globalForPrisma.prisma = prisma;
