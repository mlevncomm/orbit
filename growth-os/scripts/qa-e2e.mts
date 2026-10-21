/**
 * Comprehensive HTTP + DB QA. Does not send WhatsApp if Cloud is off
 * and local is not ready. Places campaign is targetCount=1 only when a key exists.
 */
const BASE = "http://127.0.0.1:3000";
let cookie = "";

try {
  const env = await import("node:fs").then((fs) => fs.readFileSync(".env", "utf8"));
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
  }
} catch {
  /* no .env */
}

async function login() {
  await hit("GET /api/auth", "GET", "/api/auth", 200);
  const email = process.env.ADMIN_EMAIL ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) return;
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const raw = res.headers.get("set-cookie") ?? "";
  cookie = raw.split(";")[0] ?? "";
  if (res.ok && cookie) ok("login");
  else fail("login", `status ${res.status}`);
}

type Fail = { name: string; detail: string };
const fails: Fail[] = [];
const oks: string[] = [];

function ok(name: string) {
  oks.push(name);
  console.log(`OK  ${name}`);
}
function fail(name: string, detail: string) {
  fails.push({ name, detail });
  console.error(`FAIL ${name} :: ${detail}`);
}

async function hit(
  name: string,
  method: string,
  path: string,
  expect: number | number[],
  body?: unknown,
): Promise<{ status: number; json: unknown; buf?: Buffer; type: string }> {
  const expected = Array.isArray(expect) ? expect : [expect];
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") || "";
  let json: unknown = null;
  let buf: Buffer | undefined;
  if (type.includes("json")) json = await res.json();
  else buf = Buffer.from(await res.arrayBuffer());
  if (!expected.includes(res.status)) {
    fail(name, `status ${res.status} expected ${expected.join("|")} ${JSON.stringify(json)?.slice(0, 180)}`);
  } else {
    ok(name);
  }
  return { status: res.status, json, buf, type };
}

async function pages() {
  for (const p of ["/", "/ara", "/musteriler", "/whatsapp", "/koc", "/instagram", "/ayarlar", "/giris"]) {
    const res = await fetch(`${BASE}${p}`, { headers: cookie ? { cookie } : undefined, redirect: "follow" });
    const html = await res.text();
    if (res.status !== 200) fail(`GET ${p}`, `status ${res.status}`);
    else if (/Application error|Internal Server Error|Unexpected token/i.test(html)) {
      fail(`GET ${p}`, "error page");
    } else ok(`GET ${p}`);
  }
}

async function apisGet() {
  const stats = await hit("GET /api/stats", "GET", "/api/stats", 200);
  const s = stats.json as Record<string, unknown>;
  if (typeof s.leadsTotal !== "number") fail("stats shape", "leadsTotal");
  if (typeof s.waLocal !== "string") fail("stats waLocal", String(s.waLocal));

  await hit("GET /api/leads", "GET", "/api/leads", 200);
  await hit("GET /api/campaigns", "GET", "/api/campaigns", 200);
  await hit("GET /api/templates", "GET", "/api/templates", 200);
  const settings = await hit("GET /api/settings", "GET", "/api/settings", 200);
  const st = settings.json as Record<string, unknown>;
  for (const secret of ["googlePlacesApiKey", "waCloudToken", "llmApiKey", "igAccessToken", "igWebhookVerifyToken"] as const) {
    const v = String(st[secret] ?? "");
    if (v && !v.includes("•") && v.length > 8) fail(`settings leak ${secret}`, "unmasked");
  }
  if (typeof st.hasLlmKey !== "boolean") fail("settings hasLlmKey", "missing");

  const regions = await hit("GET /api/regions", "GET", "/api/regions", 200);
  if (!Array.isArray(regions.json) || (regions.json as unknown[]).length < 10) fail("regions size", "too few");

  await hit("GET /api/outreach", "GET", "/api/outreach", 200);
  await hit("GET /api/whatsapp", "GET", "/api/whatsapp", 200);
  const copy = await hit("GET /api/copy", "GET", "/api/copy", 200);
  const cj = copy.json as { angles?: unknown[]; hasLlm?: boolean; playbookActive?: boolean };
  if (!Array.isArray(cj.angles) || cj.angles.length < 5) fail("copy angles", "missing");
  if (typeof cj.playbookActive !== "boolean") fail("copy playbookActive", "missing");

  await hit("GET /api/coach", "GET", "/api/coach", 200);
  await hit("GET /api/instagram", "GET", "/api/instagram", 200);
  await hit("GET /api/instagram/webhook", "GET", "/api/instagram/webhook", 403);

  const exp = await hit("GET /api/leads/export", "GET", "/api/leads/export", 200);
  if (!exp.type.includes("spreadsheetml")) fail("export mime", exp.type);
  if (!exp.buf || exp.buf.length < 1000) fail("export size", String(exp.buf?.length));
  return { settings: st, stats: s, copy: cj };
}

async function validation() {
  await hit("POST campaigns empty", "POST", "/api/campaigns", 400, { queries: [], scope: "city", city: "İstanbul" });
  await hit("POST campaigns bad zone", "POST", "/api/campaigns", 400, {
    queries: ["restoran"],
    scope: "zone",
    zone: "YokBolge",
  });
  await hit("POST campaigns bad hub", "POST", "/api/campaigns", 400, {
    queries: ["hotel"],
    scope: "hub",
    city: "Narnia",
  });
  await hit("POST campaigns bad json", "POST", "/api/campaigns", 400, "nope");
  await hit("POST outreach no template", "POST", "/api/outreach", 400, { leadIds: ["x"] });
  await hit("POST outreach empty", "POST", "/api/outreach", 400, { templateId: "t", leadIds: [] });
  await hit("PATCH campaign missing", "PATCH", "/api/campaigns/does-not-exist", 404, { action: "stop" });
  await hit("PATCH campaign bad action", "PATCH", "/api/campaigns/does-not-exist", 400, { action: "explode" });
  await hit("PATCH lead missing", "PATCH", "/api/leads/does-not-exist", 404, { notes: "x" });
  await hit("POST templates empty", "POST", "/api/templates", 400, { name: "", body: "" });
  await hit("POST copy ping without waiting", "POST", "/api/copy", [200, 400], { ping: true });
  await hit("POST outreach control bad", "POST", "/api/outreach/control", 400, { action: "dance" });
  await hit("POST outreach approve empty", "POST", "/api/outreach/approve", 400, { action: "approve" });
  await hit("POST coach empty", "POST", "/api/coach", 400, { message: "" });
}

async function templatesAndCopy() {
  const name = `__qa_${Date.now()}`;
  const created = await hit("POST template", "POST", "/api/templates", 201, {
    name,
    body: "Merhaba {ad}, {ilçe} QA {telefon}",
  });
  const row = created.json as { id?: string; body?: string };
  if (!row.id) {
    fail("template id", "missing");
    return;
  }
  const updated = await hit("POST template upsert", "POST", "/api/templates", 200, {
    name,
    body: "Merhaba {ad}, QA2 {ilçe}",
  });
  if ((updated.json as { body?: string }).body !== "Merhaba {ad}, QA2 {ilçe}") fail("template upsert body", "mismatch");

  await hit("PATCH template", "PATCH", `/api/templates/${row.id}`, 200, { body: "Merhaba {ad}" });
  await hit("DELETE template", "DELETE", `/api/templates/${row.id}`, 200);

  const copy = await hit("POST copy kirec", "POST", "/api/copy", 200, { angle: "kirec", brief: "kisa" });
  const c = copy.json as { name?: string; body?: string; source?: string };
  if (!c.body?.includes("{ad}")) fail("copy placeholder", String(c.body).slice(0, 80));
  if (c.source !== "ai" && c.source !== "local") fail("copy source", String(c.source));
}

async function leadCycle() {
  const { prisma } = await import("../src/lib/prisma.ts");
  const { ensureTenants } = await import("../src/lib/campaigns.ts");
  await ensureTenants();
  const placeId = `qa-${Date.now()}`;
  const lead = await prisma.lead.create({
    data: {
      tenantId: "tnt_aquails",
      placeId,
      name: "QA Moda Restoran",
      address: "Caferağa",
      phone: "+905321112233",
      city: "İstanbul",
      district: "Kadıköy",
      status: "yeni",
      mapsUrl: "https://maps.google.com/?q=qa",
    },
  });
  try {
    const listed = await hit("GET leads q", "GET", `/api/leads?q=${encodeURIComponent("Moda Restoran")}`, 200);
    const rows = listed.json as Array<{ id: string }>;
    if (!rows.some((r) => r.id === lead.id)) fail("lead search", "fixture not found");

    const patched = await hit("PATCH lead notes", "PATCH", `/api/leads/${lead.id}`, 200, {
      notes: "qa-not",
      consented: true,
      status: "donus_var",
    });
    const p = patched.json as { notes?: string; consented?: boolean; status?: string; phone?: string };
    if (p.notes !== "qa-not" || p.consented !== true || p.status !== "donus_var") fail("lead patch fields", JSON.stringify(p));

    await hit("PATCH lead bad status", "PATCH", `/api/leads/${lead.id}`, 400, { status: "hacked" });

    const phone = await hit("PATCH lead phone TR", "PATCH", `/api/leads/${lead.id}`, 200, { phone: "0532 111 22 33" });
    if ((phone.json as { phone?: string }).phone !== "+905321112233") {
      fail("lead phone normalize", String((phone.json as { phone?: string }).phone));
    }

    const exp = await hit(
      "GET export q",
      "GET",
      `/api/leads/export?q=${encodeURIComponent("QA Moda")}&status=donus_var`,
      200,
    );
    if (!exp.buf || exp.buf.length < 1000) fail("export filtered", String(exp.buf?.length));

    const tpls = await fetch(`${BASE}/api/templates`, { headers: cookie ? { cookie } : {} }).then((r) => r.json()) as Array<{ id: string }>;
    const templateId = tpls[0]?.id;
    const wa = await fetch(`${BASE}/api/whatsapp`, { headers: cookie ? { cookie } : {} }).then((r) => r.json()) as { cloud?: boolean; local?: { state?: string } };
    if (!templateId) fail("enqueue skip", "no template");
    else if (wa.cloud) {
      ok("enqueue skipped (Cloud API would send a real message)");
    } else if (wa.local?.state === "ready") {
      ok("enqueue skipped (local WhatsApp is connected)");
    } else {
      await hit("POST control stop before enqueue", "POST", "/api/outreach/control", 200, { action: "stop" });
      const enq = await hit("POST outreach enqueue", "POST", "/api/outreach", 200, {
        leadIds: [lead.id],
        templateId,
      });
      const e = enq.json as { queued?: number; skipped?: number };
      if ((e.queued ?? 0) + (e.skipped ?? 0) < 1) fail("enqueue result", JSON.stringify(e));
      await hit("POST control stop after enqueue", "POST", "/api/outreach/control", 200, { action: "stop" });
    }
  } finally {
    await prisma.outreachJob.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
  }
}

async function campaignTiny(hasPlaces: boolean) {
  if (!hasPlaces) {
    ok("campaign live skipped (no Places key)");
    const res = await hit("POST campaign no key", "POST", "/api/campaigns", 400, {
      queries: ["restoran"],
      scope: "city",
      city: "İstanbul",
      district: "Kadıköy",
      targetCount: 1,
    });
    const err = (res.json as { error?: string }).error || "";
    if (!/Places|anahtar/i.test(err)) fail("campaign no-key message", err);
    return;
  }
  const created = await hit("POST campaign tiny", "POST", "/api/campaigns", 201, {
    queries: ["restoran"],
    scope: "city",
    city: "İstanbul",
    district: "Kadıköy",
    targetCount: 1,
    requirePhone: true,
    minRating: 0,
  });
  const camp = created.json as { id?: string; status?: string };
  if (!camp.id) return;
  const t0 = Date.now();
  let last = camp.status;
  while (Date.now() - t0 < 90000) {
    const g = await fetch(`${BASE}/api/campaigns/${camp.id}`, { headers: cookie ? { cookie } : {} }).then((r) => r.json()) as {
      status?: string;
      foundCount?: number;
      error?: string | null;
    };
    last = g.status;
    if (g.status === "done" || g.status === "error" || g.status === "cancelled") {
      if (g.status === "error") fail("campaign run", g.error || "error");
      else ok(`campaign finished ${g.status} found=${g.foundCount ?? 0}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  await fetch(`${BASE}/api/campaigns/${camp.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ action: "stop" }),
  });
  fail("campaign timeout", `last=${last}`);
}

async function main() {
  await login();
  await pages();
  const { settings } = await apisGet();
  await validation();
  await templatesAndCopy();
  await leadCycle();
  await campaignTiny(Boolean(settings.hasPlacesKey));

  console.log("");
  console.log(`passed ${oks.length}  failed ${fails.length}`);
  if (fails.length) {
    process.exit(1);
  }
}

await main();
