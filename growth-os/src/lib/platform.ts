export function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

export function isServerless(): boolean {
  return isVercel() || process.env.WEXON_SERVERLESS === "1";
}

export function appUrl(): string {
  const explicit = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  return "http://127.0.0.1:3000";
}

export function instagramWebhookUrl(): string {
  return `${appUrl()}/api/instagram/webhook`;
}

export function deployHints() {
  return {
    hosted: isVercel(),
    serverless: isServerless(),
    appUrl: appUrl(),
    instagramWebhookUrl: instagramWebhookUrl(),
    authConfigured: Boolean(process.env.AUTH_SECRET && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD),
    hasDatabase: Boolean(process.env.DATABASE_URL),
    postgres: /postgres/i.test(process.env.DATABASE_URL ?? ""),
    hasDirectUrl: Boolean(process.env.DIRECT_URL),
  };
}
