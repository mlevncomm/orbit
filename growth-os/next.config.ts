import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Orbit içinde gömülü çalışır: tek klasörlük yerel sunucu (node server.js)
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  turbopack: { root: path.join(__dirname) },
  allowedDevOrigins: ["127.0.0.1"],
  // Sayfanın kendi sürümü: otomatik güncelleme yeni yayını buna göre anlar (/api/surum ile aynı biçim)
  env: { NEXT_PUBLIC_SURUM: (process.env.VERCEL_GIT_COMMIT_SHA || "yerel").slice(0, 12) },
  serverExternalPackages: [
    "@prisma/client",
    "@whiskeysockets/baileys",
    "whatsapp-rust-bridge",
    "libsignal",
    "qrcode",
    "exceljs",
  ],
};

export default nextConfig;
