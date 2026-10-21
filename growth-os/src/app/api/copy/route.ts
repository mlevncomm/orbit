import { NextResponse } from "next/server";
import { ensureSeed } from "@/lib/campaigns";
import { copyAngles, defaultAngle, generateSalesCopy } from "@/lib/copy-ai";
import { copyWithPlaybook } from "@/lib/coach";
import { readJson } from "@/lib/http";
import { pingLlm } from "@/lib/llm";
import { getPlaybook, playbookIsActive } from "@/lib/playbook";
import { getSettings } from "@/lib/settings";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant(async (ctx) => {
    await ensureSeed(ctx.tenantId, ctx.vertical);
    const [settings, playbook] = await Promise.all([getSettings(), getPlaybook()]);
    const angles = copyAngles(ctx.vertical);
    return NextResponse.json({
      angles,
      defaultAngle: defaultAngle(ctx.vertical),
      vertical: ctx.vertical,
      hasLlm: Boolean(settings.llmApiKey),
      llmProvider: settings.llmProvider,
      llmModel: settings.llmModel,
      playbookActive: playbookIsActive(playbook),
      playbook,
    });
  });
}

export async function POST(request: Request) {
  return withTenant(async (ctx) => {
    const body = (await readJson<{ angle?: string; brief?: string; ping?: boolean }>(request)) ?? {};
    const settings = await getSettings();
    const playbook = await getPlaybook();
    const angles = copyAngles(ctx.vertical);
    const angle = angles.some((a) => a.id === body.angle) ? body.angle! : defaultAngle(ctx.vertical);
    const brief = typeof body.brief === "string" ? body.brief : "";
    const local = generateSalesCopy(angle, ctx.vertical);

    if (body.ping) {
      if (!settings.llmApiKey) {
        return NextResponse.json({ error: "Google Gemini anahtarı yok" }, { status: 400 });
      }
      try {
        await pingLlm({
          apiKey: settings.llmApiKey,
          baseUrl: settings.llmBaseUrl,
          model: settings.llmModel,
        });
        return NextResponse.json({ ok: true, source: "ai" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "AI bağlanamadı";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (!settings.llmApiKey) {
      return NextResponse.json({ ...local, source: "local", playbookActive: playbookIsActive(playbook) });
    }

    try {
      const generated = await copyWithPlaybook({ angle, brief });
      if (!generated) {
        return NextResponse.json({ ...local, source: "local", playbookActive: playbookIsActive(playbook) });
      }
      return NextResponse.json({ ...generated, source: "ai", playbookActive: playbookIsActive(playbook) });
    } catch (err) {
      const warning = err instanceof Error ? err.message : "AI yanıt vermedi";
      return NextResponse.json({ ...local, source: "local", warning, playbookActive: playbookIsActive(playbook) });
    }
  });
}
