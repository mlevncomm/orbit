// Cloudflare Access koruması (web sürümü, orbit.wexon.dev).
// CF_ACCESS_TEAM ve CF_ACCESS_AUD ortamda tanımlıysa her istek Cloudflare Access'in imzaladığı JWT'yi taşımak zorundadır;
// böylece site *.vercel.app adresinden doğrudan açılarak korumanın etrafından dolaşılamaz.
// Tanımlı değilse (masaüstü Orbit, yerel geliştirme) hiçbir şey yapmaz.

type Jwk = JsonWebKey & { kid?: string };
let cache: { at: number; keys: Jwk[] } | null = null;

export function accessConfigured(): boolean {
  return Boolean(process.env.CF_ACCESS_TEAM && process.env.CF_ACCESS_AUD);
}

function b64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function keys(team: string, fresh = false): Promise<Jwk[]> {
  if (!fresh && cache && Date.now() - cache.at < 3600_000) return cache.keys;
  const r = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Access anahtarları alınamadı (${r.status})`);
  const j = (await r.json()) as { keys?: Jwk[] };
  cache = { at: Date.now(), keys: j.keys ?? [] };
  return cache.keys;
}

/** Geçerli bir Access belirtecinde e-postayı, aksi halde null döndürür */
export async function verifyAccess(token: string | undefined | null): Promise<string | null> {
  const team = process.env.CF_ACCESS_TEAM!;
  const aud = process.env.CF_ACCESS_AUD!;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(b64url(parts[0]))) as { alg?: string; kid?: string };
    const body = JSON.parse(new TextDecoder().decode(b64url(parts[1]))) as { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
    if (head.alg !== "RS256") return null;
    let jwk = (await keys(team)).find((k) => k.kid === head.kid);
    if (!jwk) jwk = (await keys(team, true)).find((k) => k.kid === head.kid); // anahtar döndürülmüş olabilir
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]) as BufferSource, data);
    if (!ok) return null;
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(body.aud) ? body.aud : [body.aud];
    if (!auds.includes(aud)) return null;
    if (body.iss !== `https://${team}.cloudflareaccess.com`) return null;
    if (!body.exp || body.exp < now || (body.nbf && body.nbf > now + 60)) return null;
    const allowed = (process.env.CF_ACCESS_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const email = String(body.email ?? "").toLowerCase();
    if (allowed.length && !allowed.includes(email)) return null;
    return email || "servis";
  } catch {
    return null;
  }
}
