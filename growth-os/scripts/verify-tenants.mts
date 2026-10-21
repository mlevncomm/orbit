/**
 * Three-tenant isolation. Does not send WhatsApp.
 * Env: VERIFY_BASE, ADMIN_EMAIL, ADMIN_PASSWORD
 */
const BASE = (process.env.VERIFY_BASE ?? "http://127.0.0.1:3011").replace(/\/$/, "");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

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

function cookieFrom(res: Response): string {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof anyHeaders.getSetCookie === "function" ? anyHeaders.getSetCookie() : [];
  const raw = list.length ? list.join(",") : res.headers.get("set-cookie") ?? "";
  const hit = raw.split(/,(?=\s*wexon_admin=)/i).find((p) => /wexon_admin=/i.test(p));
  const piece = hit ?? raw;
  return (piece.split(";")[0] ?? "").trim();
}

async function req(
  method: string,
  path: string,
  opts?: { cookie?: string; body?: unknown },
): Promise<{ status: number; json: unknown; cookie: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts?.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts?.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
  const type = res.headers.get("content-type") || "";
  const json = type.includes("json") ? await res.json().catch(() => null) : null;
  return { status: res.status, json, cookie: cookieFrom(res) || opts?.cookie || "" };
}

async function login(email: string, password: string): Promise<string> {
  const res = await req("POST", "/api/auth", { body: { email, password } });
  if (res.status !== 200 || !res.cookie) {
    fail(`login ${email}`, `status ${res.status}`);
    return "";
  }
  ok(`login ${email.split("@")[0]}`);
  return res.cookie;
}

async function expectStatus(
  name: string,
  method: string,
  path: string,
  expect: number | number[],
  opts?: { cookie?: string; body?: unknown },
) {
  const allowed = Array.isArray(expect) ? expect : [expect];
  const res = await req(method, path, opts);
  if (!allowed.includes(res.status)) {
    fail(name, `status ${res.status} expected ${allowed.join("|")} ${JSON.stringify(res.json)?.slice(0, 160)}`);
  } else {
    ok(name);
  }
  return res;
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("ADMIN_EMAIL / ADMIN_PASSWORD required");
    process.exit(1);
  }

  await expectStatus("anon leads 401", "GET", "/api/leads", 401);
  await expectStatus("anon tick 401", "GET", "/api/outreach/tick", 401);
  await expectStatus("anon webhook 403", "GET", "/api/instagram/webhook", 403);
  await expectStatus("anon platform 401", "GET", "/api/platform", 401);

  const platform = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!platform) throw new Error("platform login failed");

  const home = await req("GET", "/api/auth", { cookie: platform });
  const homeJson = home.json as { home?: string; role?: string };
  if (homeJson.role === "platform" && homeJson.home === "/platform") ok("platform home");
  else fail("platform home", JSON.stringify(homeJson));

  const tenantsRes = await req("GET", "/api/platform", { cookie: platform });
  const tenants = ((tenantsRes.json as { tenants?: Array<{ id: string; slug: string; name: string }> }).tenants ?? []);
  const bySlug = Object.fromEntries(tenants.map((t) => [t.slug, t]));
  if (bySlug.aquails && bySlug["wexon-dev"] && bySlug["akarsu-akademi"]) ok("three tenants");
  else fail("three tenants", tenants.map((t) => t.slug).join(","));

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const leadId = `lead_verify_${Date.now()}`;
  await prisma.lead.upsert({
    where: { tenantId_placeId: { tenantId: "tnt_aquails", placeId: "verify-kadikoy-1" } },
    update: { name: "Kadıköy Verify Cafe" },
    create: {
      id: leadId,
      tenantId: "tnt_aquails",
      placeId: "verify-kadikoy-1",
      name: "Kadıköy Verify Cafe",
      address: "Caferağa",
      phone: "+905551110000",
      city: "İstanbul",
      district: "Kadıköy",
      status: "yeni",
    },
  });
  const aquailsLead = await prisma.lead.findUnique({
    where: { tenantId_placeId: { tenantId: "tnt_aquails", placeId: "verify-kadikoy-1" } },
    select: { id: true },
  });
  if (!aquailsLead) throw new Error("verify lead missing");

  const stamp = Date.now();
  const memberPass = `Verify9x${stamp}`;
  const members = [
    { email: `mt-aquails-${stamp}@local.test`, tenantId: bySlug.aquails.id, slug: "aquails" },
    { email: `mt-wexon-${stamp}@local.test`, tenantId: bySlug["wexon-dev"].id, slug: "wexon-dev" },
    { email: `mt-akarsu-${stamp}@local.test`, tenantId: bySlug["akarsu-akademi"].id, slug: "akarsu-akademi" },
  ];
  for (const m of members) {
    const created = await req("POST", "/api/platform", {
      cookie: platform,
      body: { action: "create-user", email: m.email, password: memberPass, tenantId: m.tenantId },
    });
    if (created.status !== 201) fail(`create ${m.slug}`, `status ${created.status}`);
    else ok(`create ${m.slug}`);
  }

  const aquails = await login(members[0].email, memberPass);
  const wexon = await login(members[1].email, memberPass);
  const akarsu = await login(members[2].email, memberPass);

  const aLeads = await req("GET", "/api/leads", { cookie: aquails });
  const aRows = (aLeads.json as Array<{ id: string; name: string; district?: string }>) ?? [];
  if (aLeads.status === 200 && aRows.some((r) => r.id === aquailsLead.id && /Kadıköy/i.test(`${r.name} ${r.district ?? ""}`))) {
    ok("aquails sees Kadıköy lead");
  } else fail("aquails sees Kadıköy lead", `status ${aLeads.status} n=${aRows.length}`);

  const wLeads = await req("GET", "/api/leads", { cookie: wexon });
  const wRows = (wLeads.json as Array<{ id: string }>) ?? [];
  if (wLeads.status === 200 && wRows.length === 0) ok("wexon empty list");
  else fail("wexon empty list", `status ${wLeads.status} n=${wRows.length}`);

  const kLeads = await req("GET", "/api/leads", { cookie: akarsu });
  const kRows = (kLeads.json as Array<{ id: string }>) ?? [];
  if (kLeads.status === 200 && kRows.length === 0) ok("akarsu empty list");
  else fail("akarsu empty list", `status ${kLeads.status} n=${kRows.length}`);

  await expectStatus("wexon IDOR 404", "PATCH", `/api/leads/${aquailsLead.id}`, 404, {
    cookie: wexon,
    body: { notes: "should-not-write" },
  });
  const unchanged = await prisma.lead.findUnique({ where: { id: aquailsLead.id } });
  if (unchanged?.notes !== "should-not-write") ok("IDOR did not mutate");
  else fail("IDOR did not mutate", "notes written");

  await expectStatus("member platform 403", "GET", "/api/platform", 403, { cookie: aquails });
  await expectStatus("member tick 403", "POST", "/api/outreach/tick", 403, { cookie: aquails });

  const aSet = await req("GET", "/api/settings", { cookie: aquails });
  const wSet = await req("GET", "/api/settings", { cookie: wexon });
  const aSj = aSet.json as { hasCloudToken?: boolean; hasIgToken?: boolean };
  const wSj = wSet.json as { hasCloudToken?: boolean; hasIgToken?: boolean };
  if (!aSj.hasCloudToken && !wSj.hasCloudToken) ok("cloud isolated off");
  else fail("cloud isolated off", JSON.stringify({ a: aSj.hasCloudToken, w: wSj.hasCloudToken }));
  if (!aSj.hasIgToken && !wSj.hasIgToken) ok("ig isolated off");
  else fail("ig isolated off", JSON.stringify({ a: aSj.hasIgToken, w: wSj.hasIgToken }));

  const aCopy = await req("GET", "/api/copy", { cookie: aquails });
  const wCopy = await req("GET", "/api/copy", { cookie: wexon });
  const kCopy = await req("GET", "/api/copy", { cookie: akarsu });
  const aV = (aCopy.json as { vertical?: string }).vertical;
  const wV = (wCopy.json as { vertical?: string }).vertical;
  const kV = (kCopy.json as { vertical?: string }).vertical;
  if (aV === "water" && wV === "software" && kV === "yks") ok("copy verticals");
  else fail("copy verticals", `${aV}/${wV}/${kV}`);

  const aSec = await req("GET", "/api/sectors", { cookie: aquails });
  const kSec = await req("GET", "/api/sectors", { cookie: akarsu });
  const aG = (aSec.json as { vertical?: string }).vertical;
  const kG = (kSec.json as { vertical?: string }).vertical;
  if (aG === "water" && kG === "yks") ok("sector verticals");
  else fail("sector verticals", `${aG}/${kG}`);

  const aQ = await req("GET", "/api/outreach", { cookie: aquails });
  const wQ = await req("GET", "/api/outreach", { cookie: wexon });
  const aQueued = (aQ.json as { queued?: number }).queued ?? -1;
  const wQueued = (wQ.json as { queued?: number }).queued ?? -1;
  if (aQ.status === 200 && wQ.status === 200 && aQueued === 0 && wQueued === 0) ok("queue badges tenant scoped");
  else fail("queue badges tenant scoped", `${aQueued}/${wQueued}`);

  const wa = await req("GET", "/api/whatsapp", { cookie: aquails });
  if ((wa.json as { cloud?: boolean }).cloud === false) ok("whatsapp cloud off (no send)");
  else fail("whatsapp cloud off (no send)", JSON.stringify(wa.json));

  const imp = await req("POST", "/api/platform", {
    cookie: platform,
    body: { action: "impersonate", tenantId: bySlug.aquails.id },
  });
  if (imp.status !== 200 || !imp.cookie) fail("impersonate", `status ${imp.status}`);
  else ok("impersonate");
  const me = await req("GET", "/api/me", { cookie: imp.cookie });
  const mej = me.json as { impersonating?: boolean; tenantName?: string };
  if (mej.impersonating && mej.tenantName === "Aquails") ok("impersonate me");
  else fail("impersonate me", JSON.stringify(mej));
  const iLeads = await req("GET", "/api/leads", { cookie: imp.cookie });
  const iRows = (iLeads.json as Array<{ id: string }>) ?? [];
  if (iRows.some((r) => r.id === aquailsLead.id)) ok("impersonate sees aquails");
  else fail("impersonate sees aquails", `n=${iRows.length}`);

  const audit = await prisma.auditLog.findFirst({
    where: { action: "impersonate", tenantId: "tnt_aquails" },
    orderBy: { createdAt: "desc" },
  });
  if (audit) ok("audit impersonate");
  else fail("audit impersonate", "missing row");

  const stop = await req("POST", "/api/platform", {
    cookie: imp.cookie,
    body: { action: "stop-impersonate" },
  });
  if (stop.status === 200) ok("stop impersonate");
  else fail("stop impersonate", `status ${stop.status}`);

  await prisma.user.deleteMany({ where: { email: { in: members.map((m) => m.email) } } });
  await prisma.lead.deleteMany({ where: { placeId: "verify-kadikoy-1", tenantId: "tnt_aquails" } });
  await prisma.$disconnect();

  console.log("");
  console.log(`passed ${oks.length}  failed ${fails.length}`);
  if (fails.length) process.exit(1);
}

await main();
