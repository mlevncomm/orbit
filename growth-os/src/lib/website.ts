export type WebsiteFilter = "any" | "with" | "without";
export type SiteKind = "none" | "social" | "site";

const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "wa.me",
  "api.whatsapp.com",
  "linktr.ee",
  "linktree.com",
  "maps.google.com",
  "google.com",
  "goo.gl",
  "bit.ly",
];

function hostnameOf(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isSocialHost(host: string): boolean {
  return SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`));
}

export function parseWebsiteFilter(raw: unknown): WebsiteFilter {
  return raw === "with" || raw === "without" ? raw : "any";
}

export function siteKind(url: string): SiteKind {
  const host = hostnameOf(url);
  if (!host) return "none";
  if (isSocialHost(host)) return "social";
  return "site";
}

export function matchesWebsiteFilter(url: string, filter: WebsiteFilter): boolean {
  if (filter === "any") return true;
  const kind = siteKind(url);
  if (filter === "with") return kind === "site";
  return kind !== "site";
}

export function websiteHost(url: string): string {
  return hostnameOf(url);
}

export function websiteLabel(url: string): string {
  const kind = siteKind(url);
  if (kind === "none") return "Site yok";
  if (kind === "social") return "Yalnız sosyal";
  return websiteHost(url) || url;
}
