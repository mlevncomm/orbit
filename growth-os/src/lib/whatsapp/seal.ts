import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyMaterial(): Buffer {
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 16) {
    throw new Error("AUTH_SECRET eksik; WhatsApp oturumu şifrelenemez.");
  }
  return createHash("sha256").update(`wexon-wa-web:v1:${secret}`).digest();
}

export function sealUtf8(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function openUtf8(blob: string): string | null {
  if (!blob) return null;
  try {
    const buf = Buffer.from(blob, "base64url");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
