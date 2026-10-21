import { NextResponse } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { normalizeLlmConfig } from "@/lib/llm-providers";
import { getSettings, updateSettings } from "@/lib/settings";
import { bustStatsCache } from "@/lib/stats";
import { deployHints } from "@/lib/platform";
import { currentTenant, withTenant } from "@/lib/tenant";
import { profileById, SHARED_KEYS_FROM } from "@/lib/app-profiles";

export const dynamic = "force-dynamic";

function payload() {
  return getSettings().then(async (settings) => {
    const deploy = deployHints();
    return {
      ...settings,
      googlePlacesApiKey: settings.googlePlacesApiKey ? mask(settings.googlePlacesApiKey) : "",
      waCloudToken: settings.waCloudToken ? mask(settings.waCloudToken) : "",
      llmApiKey: settings.llmApiKey ? mask(settings.llmApiKey) : "",
      igAccessToken: settings.igAccessToken ? mask(settings.igAccessToken) : "",
      igWebhookVerifyToken: settings.igWebhookVerifyToken ? mask(settings.igWebhookVerifyToken) : "",
      hasPlacesKey: Boolean(settings.googlePlacesApiKey),
      hasCloudToken: Boolean(settings.waCloudToken),
      hasPhoneNumberId: Boolean(settings.waPhoneNumberId),
      hasLlmKey: Boolean(settings.llmApiKey),
      hasIgToken: Boolean(settings.igAccessToken),
      hasIgUserId: Boolean(settings.igUserId),
      // Ortak anahtar kullanan profilde (Aquails) Google ve Gemini anahtarları kaynak profilden gelir
      ortakAnahtar: SHARED_KEYS_FROM[currentTenant().tenantId] ? profileById(SHARED_KEYS_FROM[currentTenant().tenantId])?.ad ?? null : null,
      ...deploy,
    };
  });
}

export async function GET() {
  return withTenant(async () => NextResponse.json(await payload()));
}

export async function PUT(request: Request) {
  return withTenant(async (ctx) => {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest("Geçersiz istek.");
    const patch: Parameters<typeof updateSettings>[0] = {};

    if (typeof body.googlePlacesApiKey === "string" && !isMasked(body.googlePlacesApiKey)) {
      patch.googlePlacesApiKey = body.googlePlacesApiKey.trim();
    }
    if (typeof body.waCloudToken === "string" && !isMasked(body.waCloudToken)) {
      patch.waCloudToken = body.waCloudToken.trim();
    }
    if (typeof body.waPhoneNumberId === "string") {
      patch.waPhoneNumberId = body.waPhoneNumberId.trim();
    }
    if (typeof body.campaignMediaEnabled === "boolean") {
      patch.campaignMediaEnabled = body.campaignMediaEnabled;
    }
    if (body.campaignMediaType === "image" || body.campaignMediaType === "video" || body.campaignMediaType === "") {
      patch.campaignMediaType = body.campaignMediaType;
    }
    if (typeof body.campaignMediaUrl === "string") {
      const mediaUrl = body.campaignMediaUrl.trim();
      if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) return badRequest("Medya adresi HTTPS ile başlamalıdır.");
      patch.campaignMediaUrl = mediaUrl;
      if (mediaUrl) patch.campaignMediaId = "";
    }
    if (typeof body.campaignMediaName === "string") {
      patch.campaignMediaName = body.campaignMediaName.trim().slice(0, 160);
    }
    if (typeof body.llmApiKey === "string" && !isMasked(body.llmApiKey)) {
      patch.llmApiKey = body.llmApiKey.trim();
    }
    if (typeof body.llmBaseUrl === "string") {
      patch.llmBaseUrl = body.llmBaseUrl.trim().replace(/\/+$/, "");
    }
    if (typeof body.llmModel === "string") {
      patch.llmModel = body.llmModel.trim();
    }
    if (typeof body.llmProvider === "string") {
      patch.llmProvider = body.llmProvider.trim().slice(0, 32);
    }
    if (typeof body.igAccessToken === "string" && !isMasked(body.igAccessToken)) {
      patch.igAccessToken = body.igAccessToken.trim();
    }
    if (typeof body.igUserId === "string") {
      patch.igUserId = body.igUserId.trim();
    }
    if (typeof body.igWebhookVerifyToken === "string" && !isMasked(body.igWebhookVerifyToken)) {
      patch.igWebhookVerifyToken = body.igWebhookVerifyToken.trim();
    }
    if (typeof body.delayMinSec === "number") {
      patch.delayMinSec = Math.max(8, Math.min(120, body.delayMinSec));
    }
    if (typeof body.delayMaxSec === "number") {
      patch.delayMaxSec = Math.max(8, Math.min(180, body.delayMaxSec));
    }
    if (typeof body.dailyCap === "number") {
      patch.dailyCap = Math.max(1, Math.min(200, body.dailyCap));
    }

    if (
      patch.delayMinSec != null &&
      patch.delayMaxSec != null &&
      patch.delayMinSec > patch.delayMaxSec
    ) {
      const tmp = patch.delayMinSec;
      patch.delayMinSec = patch.delayMaxSec;
      patch.delayMaxSec = tmp;
    }

    if (
      patch.llmApiKey != null ||
      patch.llmBaseUrl != null ||
      patch.llmModel != null ||
      patch.llmProvider != null
    ) {
      const current = await getSettings();
      Object.assign(
        patch,
        normalizeLlmConfig({
          llmApiKey: patch.llmApiKey ?? current.llmApiKey,
          llmBaseUrl: patch.llmBaseUrl ?? current.llmBaseUrl,
          llmModel: patch.llmModel ?? current.llmModel,
          llmProvider: patch.llmProvider ?? current.llmProvider,
        }),
      );
    }

    await updateSettings(patch);
    bustStatsCache(ctx.tenantId);
    return NextResponse.json(await payload());
  });
}

function mask(value: string): string {
  if (value.length < 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function isMasked(value: string): boolean {
  return value.includes("••••") || value.includes("****");
}
