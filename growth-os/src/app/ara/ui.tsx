"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { dialCodeFor, formatPhoneDisplay } from "@/lib/phone";
import { REGIONS, TURKEY_ZONES, WORLD_GROUPS, WORLD_HUBS, hubFor } from "@/lib/regions";
import { ChipStrip } from "@/components/ChipStrip";
import { useToast } from "@/components/Toast";
import { siteKind, websiteLabel, type WebsiteFilter } from "@/lib/website";

type Region = { city: string; districts: string[] };
type Lead = {
  id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  mapsUrl: string;
};
type Campaign = {
  id: string;
  status: string;
  foundCount: number;
  skippedCount: number;
  targetCount: number;
  error: string | null;
  city?: string;
  district?: string;
  query?: string;
  createdAt?: string;
  leads?: Lead[];
};
type Scope = "city" | "zone" | "turkey" | "hub" | "worldGroup" | "world";
type SectorGroup = { id: string; label: string; items: { label: string; query: string }[] };
type SectorPreset = {
  id: string;
  label: string;
  hint: string;
  queries: string[];
  websiteFilter?: WebsiteFilter;
};

const PINNED_CITIES = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Kocaeli", "Gaziantep"];
const COUNT_PRESETS = [10, 20, 40, 60];
const RATING_PRESETS = [
  { label: "Hepsi", value: 0 },
  { label: "3.5+", value: 3.5 },
  { label: "4.0+", value: 4 },
  { label: "4.5+", value: 4.5 },
];
const WEBSITE_PRESETS: { id: WebsiteFilter; label: string; hint: string }[] = [
  { id: "without", label: "Sitesi yok", hint: "Web satışı" },
  { id: "with", label: "Sitesi var", hint: "Yenileme / SEO" },
  { id: "any", label: "Fark etmez", hint: "Hepsini al" },
];

export default function AraPage() {
  const toast = useToast();
  const [regions] = useState<Region[]>(REGIONS);
  const [showAllCities, setShowAllCities] = useState(false);
  const [scope, setScope] = useState<Scope>("city");
  const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
  const [customQuery, setCustomQuery] = useState("");
  const [city, setCity] = useState("İstanbul");
  const [cityFilter, setCityFilter] = useState("");
  const [district, setDistrict] = useState("Kadıköy");
  const [zone, setZone] = useState("Marmara");
  const [worldGroup, setWorldGroup] = useState("Körfez & MENA");
  const [hub, setHub] = useState("Dubai");
  const [hubFilter, setHubFilter] = useState("");
  const [targetCount, setTargetCount] = useState(20);
  const [minRating, setMinRating] = useState(0);
  const [requirePhone, setRequirePhone] = useState(true);
  const [phonePrefix, setPhonePrefix] = useState("");
  const [websiteFilter, setWebsiteFilter] = useState<WebsiteFilter>("any");
  const [vertical, setVertical] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [recent, setRecent] = useState<Campaign[]>([]);
  const [sectorGroups, setSectorGroups] = useState<SectorGroup[]>([]);
  const [sectorPresets, setSectorPresets] = useState<SectorPreset[]>([]);
  const [sectorFilter, setSectorFilter] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const bootedRecent = useRef(false);

  const districts = useMemo(
    () => regions.find((r) => r.city === city)?.districts ?? [],
    [regions, city],
  );

  const filteredCities = useMemo(() => {
    const q = cityFilter.trim().toLocaleLowerCase("tr");
    if (!q) return regions;
    return regions.filter((r) => r.city.toLocaleLowerCase("tr").includes(q));
  }, [regions, cityFilter]);

  const visibleCities = useMemo(() => {
    if (cityFilter.trim() || showAllCities) return filteredCities;
    const pinned = filteredCities.filter((r) => PINNED_CITIES.includes(r.city) || r.city === city);
    return pinned.length ? pinned : filteredCities.slice(0, 8);
  }, [filteredCities, cityFilter, showAllCities, city]);

  const filteredHubs = useMemo(() => {
    const q = hubFilter.trim().toLowerCase();
    if (!q) return WORLD_HUBS;
    return WORLD_HUBS.filter((h) => h.city.toLowerCase().includes(q));
  }, [hubFilter]);

  useEffect(() => {
    void fetch("/api/sectors", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { vertical?: string; groups?: SectorGroup[]; presets?: SectorPreset[] }) => {
        const groups = Array.isArray(json.groups) ? json.groups : [];
        const presets = Array.isArray(json.presets) ? json.presets : [];
        setSectorGroups(groups);
        setSectorPresets(presets);
        setVertical(json.vertical ?? "");
        const allowed = new Set(groups.flatMap((g) => g.items.map((i) => i.query)));
        setSelectedQueries((prev) => prev.filter((q) => allowed.has(q)));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/campaigns", { cache: "no-store" })
      .then((r) => r.json())
      .then((rows: Campaign[]) => {
        if (!Array.isArray(rows)) return;
        setRecent(rows);
        if (!bootedRecent.current && rows[0]?.id) {
          bootedRecent.current = true;
          setCampaignId(rows[0].id);
          if (rows[0].status === "queued" || rows[0].status === "running") setBusy(true);
        }
      })
      .catch(() => undefined);
  }, [campaign?.status, campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    let alive = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const next = (await res.json()) as Campaign;
        setCampaign(next);
        const terminal = next.status === "done" || next.status === "error" || next.status === "cancelled";
        if (terminal) {
          setBusy(false);
          return;
        }
        timer = window.setTimeout(() => void poll(), 1500);
      } catch {
        if (alive) timer = window.setTimeout(() => void poll(), 4000);
      }
    };
    void poll();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [campaignId]);

  const visibleSectorGroups = useMemo(() => {
    const q = sectorFilter.trim().toLocaleLowerCase("tr");
    if (!q) return sectorGroups;
    return sectorGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.label.toLocaleLowerCase("tr").includes(q) || i.query.toLocaleLowerCase("tr").includes(q),
        ),
      }))
      .filter((g) => g.items.length);
  }, [sectorGroups, sectorFilter]);

  const sectorOnlyPresets = useMemo(
    () => sectorPresets.filter((preset) => !preset.websiteFilter),
    [sectorPresets],
  );

  function toggleQuery(query: string) {
    setSelectedQueries((prev) =>
      prev.includes(query) ? prev.filter((q) => q !== query) : [...prev, query],
    );
  }

  function toggleGroup(id: string) {
    const items = visibleSectorGroups.find((g) => g.id === id)?.items ?? [];
    const keys = items.map((i) => i.query);
    setSelectedQueries((prev) => {
      const allOn = keys.every((k) => prev.includes(k));
      if (allOn) return prev.filter((q) => !keys.includes(q));
      return [...new Set([...prev, ...keys])];
    });
  }

  function applyPreset(preset: SectorPreset) {
    setSelectedQueries(preset.queries);
    setSectorFilter("");
  }

  const queries = useMemo(() => {
    const extra = customQuery.trim();
    const list = extra ? [...selectedQueries, extra] : selectedQueries;
    return [...new Set(list.map((q) => q.trim()).filter(Boolean))];
  }, [selectedQueries, customQuery]);

  const queryLabel = useMemo(() => {
    const map = new Map(sectorGroups.flatMap((g) => g.items.map((i) => [i.query, i.label] as const)));
    return (query: string) => map.get(query) ?? query;
  }, [sectorGroups]);

  const trPhone = scope === "city" || scope === "zone" || scope === "turkey";
  const activeDial = trPhone ? "90" : scope === "hub" ? dialCodeFor(hubFor(hub)?.regionCode) : null;

  async function startSearch() {
    setError("");
    if (!queries.length) {
      setError("En az bir sektör veya kelime seçin.");
      return;
    }
    const scanQueries = queries.slice(0, 6);
    if (queries.length > 6) {
      toast.push("Aynı anda en fazla 6 sektör. İlk 6 gidiyor.");
    }
    setBusy(true);
    setCampaign(null);
    let res: Response;
    try {
      res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: scanQueries,
          city: scope === "city" ? city : scope === "hub" ? hub : undefined,
          district: scope === "city" ? district : "",
          scope,
          zone: scope === "zone" ? zone : undefined,
          worldGroup: scope === "worldGroup" ? worldGroup : undefined,
          targetCount,
          minRating,
          requirePhone,
          phonePrefix: trPhone ? phonePrefix : "",
          websiteFilter,
        }),
      });
    } catch {
      setBusy(false);
      setError("Ağa ulaşılamadı.");
      toast.push("Ağa ulaşılamadı.", "bad");
      return;
    }
    let json: Campaign = {
      id: "",
      status: "error",
      foundCount: 0,
      skippedCount: 0,
      targetCount,
      error: `Keşif başlatılamadı.`,
    };
    try {
      json = (await res.json()) as Campaign;
    } catch {
      json = { ...json, error: `Keşif başlatılamadı (${res.status}).` };
    }
    if (!res.ok) {
      setBusy(false);
      const msg = json.error || `Keşif başlatılamadı (${res.status})`;
      setError(msg);
      toast.push(msg, "bad");
      return;
    }
    setCampaign(json);
    setCampaignId(json.id || null);
  }

  async function stopSearch() {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Keşif durdurulamadı");
      setCampaign((prev) => prev ? { ...prev, status: "cancelled" } : prev);
      toast.push("Keşif durduruldu");
      setBusy(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Keşif durdurulamadı";
      setError(message);
      toast.push(message, "bad");
    }
  }

  const found = campaign?.foundCount ?? 0;
  const target = campaign?.targetCount ?? targetCount;
  const foundPct = target ? Math.min(100, Math.round((found / target) * 100)) : 0;
  const rows = campaign?.leads ?? [];
  const software = vertical === "software";
  const websiteHint =
    websiteFilter === "without"
      ? "Haritada web sitesi görünmeyenler (sosyal link sayılmaz)."
      : websiteFilter === "with"
        ? "Gerçek alan adı olanlar. Facebook / Instagram elenir."
        : "Site var ya da yok, hepsi gelir.";

  return (
    <div>
      <div className="page-kicker">Keşif</div>
      <h1 className="page-title">{software ? "Web alıcısı bul" : "Alıcı işletme bul"}</h1>
      <p className="page-copy">
        {software
          ? "Müşteri her sektör olabilir: restoran, klinik, avukat, mağaza. Yeni site için ‘Sitesi yok’, yenileme için ‘Sitesi var’ filtresini seçin."
          : "İl, bölge veya dünya şehri seçin; birden fazla sektörü birlikte tarayın. Hedef dolunca durur; aynı işletme listeye ikinci kez eklenmez."}
      </p>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="panel-head" style={{ marginBottom: 8 }}>
          <div>
            <div className="page-kicker">Nerede</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 18 }}>Kapsam</h2>
          </div>
        </div>
        <div className="field">
          <span>Kapsam</span>
          <ChipStrip>
            {(
              [
                ["city", "İl / ilçe"],
                ["zone", "Bölge"],
                ["turkey", "Tüm Türkiye"],
                ["hub", "Dünya şehri"],
                ["worldGroup", "Dünya bölgesi"],
                ["world", "Tüm dünya"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip${scope === id ? " on" : ""}`}
                onClick={() => setScope(id)}
              >
                {label}
              </button>
            ))}
          </ChipStrip>
        </div>

        {scope === "city" ? (
          <>
            <label className="field" style={{ marginTop: 16 }}>
              <span>İl ara</span>
              <input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="İl adı yazın" />
            </label>
            <div className="field" style={{ marginTop: 12 }}>
              <span>İl · {filteredCities.length}</span>
              <ChipStrip wrap>
                {visibleCities.map((r) => (
                  <button
                    key={r.city}
                    type="button"
                    className={`chip${city === r.city ? " on" : ""}`}
                    onClick={() => {
                      setCity(r.city);
                      setDistrict(r.districts[0] ?? "");
                    }}
                  >
                    {r.city}
                  </button>
                ))}
                {!cityFilter.trim() && !showAllCities && filteredCities.length > visibleCities.length ? (
                  <button type="button" className="chip" onClick={() => setShowAllCities(true)}>
                    Tüm iller · {filteredCities.length}
                  </button>
                ) : null}
              </ChipStrip>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <span>İlçe</span>
              <ChipStrip>
                <button type="button" className={`chip${district === "" ? " on" : ""}`} onClick={() => setDistrict("")}>
                  Tüm il
                </button>
                {districts.map((d) => (
                  <button key={d} type="button" className={`chip${district === d ? " on" : ""}`} onClick={() => setDistrict(d)}>
                    {d}
                  </button>
                ))}
              </ChipStrip>
            </div>
          </>
        ) : null}

        {scope === "zone" ? (
          <div className="field" style={{ marginTop: 16 }}>
            <span>Türkiye bölgesi</span>
            <ChipStrip>
              {TURKEY_ZONES.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  className={`chip${zone === z.label ? " on" : ""}`}
                  onClick={() => setZone(z.label)}
                >
                  {z.label} · {z.cities.length}
                </button>
              ))}
            </ChipStrip>
            <p className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
              {TURKEY_ZONES.find((z) => z.label === zone)?.cities.join(", ")}
            </p>
          </div>
        ) : null}

        {scope === "hub" ? (
          <>
            <label className="field" style={{ marginTop: 16 }}>
              <span>Şehir ara</span>
              <input value={hubFilter} onChange={(e) => setHubFilter(e.target.value)} placeholder="Dubai, London, New York" />
            </label>
            <div className="field" style={{ marginTop: 12 }}>
              <span>Dünya şehri</span>
              <ChipStrip>
                {hubFilter.trim() && !WORLD_HUBS.some((h) => h.city.toLowerCase() === hubFilter.trim().toLowerCase()) ? (
                  <button type="button" className={`chip${hub === hubFilter.trim() ? " on" : ""}`} onClick={() => setHub(hubFilter.trim())}>
                    “{hubFilter.trim()}” kullan
                  </button>
                ) : null}
                {filteredHubs.map((h) => (
                  <button
                    key={`${h.city}-${h.regionCode}`}
                    type="button"
                    className={`chip${hub === h.city ? " on" : ""}`}
                    onClick={() => setHub(h.city)}
                  >
                    {h.city}
                  </button>
                ))}
              </ChipStrip>
            </div>
          </>
        ) : null}

        {scope === "worldGroup" ? (
          <div className="field" style={{ marginTop: 16 }}>
            <span>Dünya bölgesi</span>
            <ChipStrip>
              {WORLD_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`chip${worldGroup === g.label ? " on" : ""}`}
                  onClick={() => setWorldGroup(g.label)}
                >
                  {g.label} · {g.cities.length}
                </button>
              ))}
            </ChipStrip>
            <p className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
              {WORLD_GROUPS.find((g) => g.label === worldGroup)?.cities.join(", ")}
            </p>
          </div>
        ) : null}

        {scope === "turkey" || scope === "world" ? (
          <p className="muted" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.5 }}>
            {scope === "turkey"
              ? "Listedeki iller sırayla taranır; hedef adede ulaşınca durur."
              : "Hub şehirler sırayla taranır. Spam tarama değil; tavan en fazla 60 kayıt."}
          </p>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="panel-head" style={{ marginBottom: 8 }}>
          <div>
            <div className="page-kicker">{software ? "Kimlere satıyorsun" : "Alıcı sektör"}</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 18 }}>
              {selectedQueries.length ? `${selectedQueries.length} sektör seçili` : "Sektör seç"}
            </h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setSelectedQueries([])} disabled={!selectedQueries.length}>
            Temizle
          </button>
        </div>
        {sectorOnlyPresets.length ? (
          <div className="field" style={{ marginBottom: 12 }}>
            <span>İstersen sektör paketi seç</span>
            <ChipStrip wrap>
              {sectorOnlyPresets.map((p) => {
                const queriesOn = p.queries.length > 0 && p.queries.every((q) => selectedQueries.includes(q));
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`chip${queriesOn ? " on" : ""}`}
                    title={p.hint}
                    onClick={() => applyPreset(p)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </ChipStrip>
          </div>
        ) : null}
        <label className="field">
          <span>Sektör ara</span>
          <input
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            placeholder="klinik, avukat, kuaför, inşaat…"
          />
        </label>
        {selectedQueries.length ? (
          <div className="sector-selected">
            {selectedQueries.map((q) => (
              <button key={q} type="button" className="chip on" onClick={() => toggleQuery(q)}>
                {queryLabel(q)} ×
              </button>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
            Aramaya başlayın; yalnızca seçtiğiniz sektörler eklenecek. Listede yoksa alta kendi kelimenizi yazın.
          </p>
        )}
        <div className="sector-groups" style={{ marginTop: 14 }}>
          {(catalogOpen || sectorFilter.trim() ? visibleSectorGroups : []).map((g) => {
            const allOn = g.items.length > 0 && g.items.every((i) => selectedQueries.includes(i.query));
            const onCount = g.items.filter((i) => selectedQueries.includes(i.query)).length;
            return (
              <div key={g.id} className={`sector-group${onCount ? " is-on" : ""}`}>
                <div className="sector-group-head">
                  <strong>
                    {g.label}
                    <span className="muted" style={{ fontWeight: 600, marginLeft: 8 }}>
                      {onCount}/{g.items.length}
                    </span>
                  </strong>
                  <button type="button" onClick={() => toggleGroup(g.id)}>
                    {allOn ? "Grubu kaldır" : "Grubun tümü"}
                  </button>
                </div>
                <ChipStrip wrap>
                  {g.items.map((s) => (
                    <button
                      key={s.query}
                      type="button"
                      className={`chip${selectedQueries.includes(s.query) ? " on" : ""}`}
                      onClick={() => toggleQuery(s.query)}
                    >
                      {s.label}
                    </button>
                  ))}
                </ChipStrip>
              </div>
            );
          })}
        </div>
        {!sectorFilter.trim() ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 12 }}
            onClick={() => setCatalogOpen((v) => !v)}
          >
            {catalogOpen ? "Listeyi gizle" : "Tüm sektörler"}
          </button>
        ) : null}
        {sectorFilter.trim() && visibleSectorGroups.length === 0 ? (
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Eşleşen etiket yok. Aşağıya kendi kelimeni yaz.
          </p>
        ) : null}
        <label className="field" style={{ marginTop: 14 }}>
          <span>Listede yoksa yaz</span>
          <input value={customQuery} onChange={(e) => setCustomQuery(e.target.value)} placeholder="ör. diş protez laboratuvarı" />
        </label>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          {queries.length
            ? `${queries.length} tarama · ${websiteFilter === "without" ? "sitesi yok" : websiteFilter === "with" ? "sitesi var" : "site fark etmez"}`
            : "Sektör seçin veya kelime yazın."}
        </p>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="panel-head" style={{ marginBottom: 8 }}>
          <div>
            <div className="page-kicker">Eleme</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 18 }}>Kimler kalsın</h2>
          </div>
        </div>
        <div className="field">
          <span>{software ? "Web sitesi" : "Site"}</span>
          <ChipStrip wrap>
            {WEBSITE_PRESETS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`chip${websiteFilter === w.id ? " on" : ""}`}
                title={w.hint}
                onClick={() => setWebsiteFilter(w.id)}
              >
                {w.label}
              </button>
            ))}
          </ChipStrip>
          <p className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
            {websiteHint}
          </p>
        </div>
        <div className="kesif-filters">
          <div className="field">
            <span>Adet</span>
            <ChipStrip>
              {COUNT_PRESETS.map((n) => (
                <button key={n} type="button" className={`chip${targetCount === n ? " on" : ""}`} onClick={() => setTargetCount(n)}>
                  {n}
                </button>
              ))}
            </ChipStrip>
          </div>
          <div className="field">
            <span>Min. puan</span>
            <ChipStrip>
              {RATING_PRESETS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className={`chip${minRating === r.value ? " on" : ""}`}
                  onClick={() => setMinRating(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </ChipStrip>
          </div>
          <label className="field">
            <span>Telefon öneki</span>
            <input
              value={phonePrefix}
              onChange={(e) => setPhonePrefix(e.target.value)}
              placeholder={trPhone ? "boş bırak (0532 daraltır)" : activeDial ? `+${activeDial}` : "ülke kodu otomatik"}
              disabled={!trPhone}
            />
          </label>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={requirePhone} onChange={(e) => setRequirePhone(e.target.checked)} />
            Yalnızca WhatsApp’a uygun mobil numaraları al
        </label>
      </div>

      <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
        {activeDial
          ? `Telefonlar +${activeDial} ile kaydedilir.${activeDial === "90" ? " +90 yalnızca Türkiye." : ""}`
          : "Telefonlar şehirdeki ülke koduyla kaydedilir (Dubai +971, Londra +44). +90 yalnızca Türkiye."}
      </p>

      <div className="kesif-bar">
        <button className="btn btn-wexon" type="button" disabled={busy} onClick={() => void startSearch()}>
          {busy ? "Keşif sürüyor…" : "Keşif başlat"}
        </button>
        {busy ? (
          <button className="btn btn-ghost" type="button" onClick={() => void stopSearch()}>
            Durdur
          </button>
        ) : null}
        {campaign ? (
          <div style={{ flex: 1, minWidth: 160 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              {campaign.foundCount}/{campaign.targetCount} bulundu
              {campaign.city ? ` · ${campaign.city}` : ""}
              {campaign.skippedCount ? ` · ${campaign.skippedCount} elendi` : ""}
              {campaign.status === "cancelled" ? " · durduruldu" : ""}
              {campaign.status === "done" ? " · bitti" : ""}
            </div>
            <div className="progress"><span style={{ width: `${foundPct}%` }} /></div>
          </div>
        ) : null}
      </div>

      {campaign?.status === "done" && found > 0 ? (
        <p className="notice" style={{ marginTop: 16 }}>
          {found} işletme eklendi.{" "}
          <Link href="/musteriler">Müşterilere git</Link>
          {" · "}
          <Link href="/musteriler?queue=1">Kuyruğu aç</Link>
        </p>
      ) : null}
      {error ? <p className="error-box" style={{ marginTop: 16 }}>{error}</p> : null}
      {campaign?.error ? (
        <p className="error-box" style={{ marginTop: 16 }}>
          {campaign.error}{" "}
          <a href="/kilavuz" style={{ textDecoration: "underline" }}>Kılavuz</a>
        </p>
      ) : null}

      {recent.length ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="flow-head">
            <div>
              <div className="page-kicker">Geçmiş</div>
              <h2 style={{ margin: "6px 0 0", fontSize: 18 }}>Son taramalar</h2>
            </div>
          </div>
          <div className="activity-row act-head">
            <span>Arama</span>
            <span>Yer</span>
            <span>Durum</span>
            <span>Bulunan</span>
          </div>
          {recent.slice(0, 6).map((row) => (
            <button
              key={row.id}
              type="button"
              className="activity-row"
              style={{ width: "100%", textAlign: "left", background: "none", border: 0, cursor: "pointer" }}
              onClick={() => {
                setCampaignId(row.id);
                setCampaign(row);
              }}
            >
              <strong>{row.query || "Tarama"}</strong>
              <span className="muted">{[row.district, row.city].filter(Boolean).join(" · ") || "—"}</span>
              <span className={`pill ${row.status === "done" ? "ok" : row.status === "error" ? "warn" : "mute"}`}>
                {row.status === "done" ? "bitti" : row.status === "error" ? "hata" : row.status === "cancelled" ? "durdu" : "çalışıyor"}
              </span>
              <span className="muted">{row.foundCount}/{row.targetCount}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="table-wrap" style={{ marginTop: 20 }}>
        <table className="data">
          <thead>
            <tr>
              <th>İşletme</th>
              <th>Adres</th>
              <th>Telefon</th>
              <th>Site</th>
              <th>Puan</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <strong>{busy ? "Keşif taranıyor" : "Sonuç yok"}</strong>
                    {busy
                      ? "Places cevap verdikçe satırlar belirir."
                      : software
                        ? "Konum, sektör ve site filtresini seçip keşif başlat."
                        : "Kapsamı seçip keşif başlat."}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <div style={{ fontWeight: 650 }}>{lead.name}</div>
                    {lead.mapsUrl ? <a className="muted" href={lead.mapsUrl} target="_blank" rel="noreferrer">Maps</a> : null}
                  </td>
                  <td>{lead.address}</td>
                  <td>{lead.phone ? formatPhoneDisplay(lead.phone) : "—"}</td>
                  <td>
                    <WebMark url={lead.website ?? ""} />
                  </td>
                  <td>{lead.rating ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="lead-cards" style={{ marginTop: 16 }}>
        {rows.length === 0 ? (
          <div className="card empty">
            <strong>{busy ? "Keşif taranıyor" : "Sonuç yok"}</strong>
            {busy ? "Kayıtlar geliyor." : "Kapsamı seçip keşif başlat."}
          </div>
        ) : (
          rows.map((lead) => (
            <article key={lead.id} className="card lead-card">
              <strong>{lead.name}</strong>
              <span className="muted">{lead.address}</span>
              <span>{lead.phone ? formatPhoneDisplay(lead.phone) : "—"} · {lead.rating ?? "puan yok"}</span>
              <WebMark url={lead.website ?? ""} />
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function WebMark({ url }: { url: string }) {
  const kind = siteKind(url);
  const label = websiteLabel(url);
  if (kind === "none") return <span className="pill warn">Site yok</span>;
  if (kind === "social") return <span className="pill mute">{label}</span>;
  return (
    <a className="web-link" href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
