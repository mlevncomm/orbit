import { isWhatsAppCapablePhone, matchesPrefix, normalizePhone } from "./phone";
import { getSettings } from "./settings";
import { matchesWebsiteFilter, parseWebsiteFilter, type WebsiteFilter } from "./website";

export type PlaceHit = {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
};

type PlacesSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    location?: { latitude?: number; longitude?: number };
  }>;
  nextPageToken?: string;
  error?: { message?: string; status?: string };
};

const SEARCH_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.location",
  "nextPageToken",
].join(",");

const DETAIL_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "location",
].join(",");

async function placesFetch(
  url: string,
  apiKey: string,
  init?: RequestInit,
): Promise<Response> {
  const key = normalizePlacesKey(apiKey);
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        (init?.headers as Record<string, string> | undefined)?.["X-Goog-FieldMask"] ??
        SEARCH_MASK,
      ...(init?.headers ?? {}),
    },
  });
}

function normalizePlacesKey(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "");
}

function mapPlace(
  p: NonNullable<PlacesSearchResponse["places"]>[number],
  regionCode?: string,
): PlaceHit | null {
  const placeId = p.id;
  const name = p.displayName?.text?.trim();
  if (!placeId || !name) return null;
  const phone =
    normalizePhone(p.internationalPhoneNumber, regionCode) ||
    normalizePhone(p.nationalPhoneNumber, regionCode) ||
    "";
  return {
    placeId,
    name,
    address: p.formattedAddress ?? "",
    phone,
    website: p.websiteUri ?? "",
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    mapsUrl: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
  };
}

async function fetchDetails(
  apiKey: string,
  placeId: string,
  languageCode: string,
  regionCode?: string,
): Promise<PlaceHit | null> {
  const res = await placesFetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(languageCode)}`,
    apiKey,
    { headers: { "X-Goog-FieldMask": DETAIL_MASK } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as NonNullable<PlacesSearchResponse["places"]>[number];
  return mapPlace(json, regionCode);
}

export async function searchPlaces(opts: {
  query: string;
  city: string;
  district?: string;
  targetCount: number;
  minRating: number;
  requirePhone: boolean;
  phonePrefix: string;
  websiteFilter?: WebsiteFilter;
  regionCode?: string;
  languageCode?: string;
  onHit?: (hit: PlaceHit) => Promise<boolean | void> | boolean | void;
}): Promise<{ hits: PlaceHit[]; skipped: number }> {
  const settings = await getSettings();
  const apiKey = normalizePlacesKey(settings.googlePlacesApiKey);
  if (!apiKey) {
    throw new Error("Google Places API anahtarı yok. Ayarlar ekranından ekleyin.");
  }

  const textQuery = [opts.query, opts.district, opts.city].filter(Boolean).join(" ").trim();
  const websiteFilter = parseWebsiteFilter(opts.websiteFilter);
  const hits: PlaceHit[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let pageToken: string | undefined;

  while (hits.length < opts.targetCount) {
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: opts.languageCode ?? "tr",
      pageSize: 20,
    };
    if (opts.regionCode) body.regionCode = opts.regionCode;
    if (pageToken) body.pageToken = pageToken;

    const res = await placesFetch(
      "https://places.googleapis.com/v1/places:searchText",
      apiKey,
      { method: "POST", body: JSON.stringify(body) },
    );
    let json: PlacesSearchResponse = {};
    try {
      json = (await res.json()) as PlacesSearchResponse;
    } catch {
      json = { error: { message: `Places API ${res.status}` } };
    }
    if (!res.ok) {
      const message = json.error?.message || `Places API ${res.status}`;
      if (shouldUseLegacy(message, res.status)) {
        return searchPlacesLegacy(apiKey, opts, textQuery, websiteFilter);
      }
      throw new Error(placesHelp(message));
    }

    const places = json.places ?? [];
    if (places.length === 0) break;

    for (const raw of places) {
      if (hits.length >= opts.targetCount) break;
      let hit = mapPlace(raw, opts.regionCode);
      if (!hit || seen.has(hit.placeId)) continue;
      seen.add(hit.placeId);

      const needsPhone = opts.requirePhone && !hit.phone;
      const needsWebsite = websiteFilter !== "any" && !hit.website;
      if (needsPhone || needsWebsite) {
        const detailed = await fetchDetails(
          apiKey,
          hit.placeId,
          opts.languageCode ?? "tr",
          opts.regionCode,
        );
        if (detailed) hit = { ...hit, ...detailed, placeId: hit.placeId };
      }

      const drop = skipHit(hit, opts, websiteFilter);
      if (drop) {
        skipped += 1;
        continue;
      }

      const accepted = await opts.onHit?.(hit);
      if (accepted === false) {
        skipped += 1;
        continue;
      }
      hits.push(hit);
    }

    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
    await new Promise((r) => setTimeout(r, 1200));
  }

  return { hits, skipped };
}

function skipHit(
  hit: PlaceHit,
  opts: { minRating: number; requirePhone: boolean; phonePrefix: string },
  websiteFilter: WebsiteFilter,
): boolean {
  if (opts.minRating > 0 && (hit.rating == null || hit.rating < opts.minRating)) return true;
  if (opts.requirePhone && !isWhatsAppCapablePhone(hit.phone)) return true;
  if (hit.phone && !matchesPrefix(hit.phone, opts.phonePrefix)) return true;
  if (!matchesWebsiteFilter(hit.website, websiteFilter)) return true;
  return false;
}

function shouldUseLegacy(message: string, status: number) {
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    /has not been used|PERMISSION_DENIED|Places API \(New\)|SERVICE_DISABLED|UNAUTHENTICATED|OAuth2|API keys are not supported|Expected OAuth2/i.test(
      message,
    )
  );
}

function placesHelp(detail: string) {
  if (/OAuth2|API keys are not supported|UNAUTHENTICATED/i.test(detail)) {
    return "Places (New) bu anahtarı reddetti; eski Places API de kapalı. Cloud Console’da Places API ve Places API (New) ikisini açıp birkaç dakika bekleyin, AIza anahtarını Ayarlar’a kaydedin.";
  }
  if (/REQUEST_DENIED|not been used|not activated|SERVICE_DISABLED/i.test(detail)) {
    return "Places API kapalı veya anahtar bu proje için yetkisiz. Cloud Console’da Places API’yi açın, AIza anahtarını Ayarlar’a kaydedin, birkaç dakika bekleyin.";
  }
  return "Google Places kapalı veya anahtar yetkisiz. Cloud Console’da hem Places API hem Places API (New) açıp AIza anahtarını Ayarlar’a yazın.";
}

type LegacySearch = {
  status?: string;
  error_message?: string;
  next_page_token?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

type LegacyDetails = {
  status?: string;
  result?: {
    place_id?: string;
    name?: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    international_phone_number?: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
    url?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  };
};

async function searchPlacesLegacy(
  apiKey: string,
  opts: {
    query: string;
    city: string;
    district?: string;
    targetCount: number;
    minRating: number;
    requirePhone: boolean;
    phonePrefix: string;
    regionCode?: string;
    languageCode?: string;
    onHit?: (hit: PlaceHit) => Promise<boolean | void> | boolean | void;
  },
  textQuery: string,
  websiteFilter: WebsiteFilter,
): Promise<{ hits: PlaceHit[]; skipped: number }> {
  const hits: PlaceHit[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let pageToken: string | undefined;

  while (hits.length < opts.targetCount) {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", textQuery);
    url.searchParams.set("language", opts.languageCode ?? "tr");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pagetoken", pageToken);

    const res = await fetch(url);
    const json = (await res.json()) as LegacySearch;
    if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      throw new Error(placesHelp(json.error_message || json.status));
    }
    const rows = json.results ?? [];
    if (rows.length === 0) break;

    for (const raw of rows) {
      if (hits.length >= opts.targetCount) break;
      const placeId = raw.place_id;
      const name = raw.name?.trim();
      if (!placeId || !name || seen.has(placeId)) continue;
      seen.add(placeId);

      let hit: PlaceHit = {
        placeId,
        name,
        address: raw.formatted_address ?? "",
        phone: "",
        website: "",
        rating: typeof raw.rating === "number" ? raw.rating : null,
        reviewCount: typeof raw.user_ratings_total === "number" ? raw.user_ratings_total : null,
        mapsUrl: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        lat: raw.geometry?.location?.lat ?? null,
        lng: raw.geometry?.location?.lng ?? null,
      };

      const detailed = await fetchLegacyDetails(apiKey, placeId, opts.languageCode ?? "tr", opts.regionCode);
      if (detailed) hit = { ...hit, ...detailed, placeId };

      if (skipHit(hit, opts, websiteFilter)) {
        skipped += 1;
        continue;
      }

      const accepted = await opts.onHit?.(hit);
      if (accepted === false) {
        skipped += 1;
        continue;
      }
      hits.push(hit);
    }

    if (!json.next_page_token) break;
    pageToken = json.next_page_token;
    await new Promise((r) => setTimeout(r, 2000));
  }

  return { hits, skipped };
}

async function fetchLegacyDetails(
  apiKey: string,
  placeId: string,
  language: string,
  regionCode?: string,
): Promise<PlaceHit | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("language", language);
  url.searchParams.set("key", apiKey);
  url.searchParams.set(
    "fields",
    "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,url,geometry",
  );
  const res = await fetch(url);
  const json = (await res.json()) as LegacyDetails;
  const p = json.result;
  const id = p?.place_id;
  const name = p?.name;
  if (json.status !== "OK" || !id || !name) return null;
  return {
    placeId: id,
    name,
    address: p.formatted_address ?? "",
    phone:
      normalizePhone(p.international_phone_number, regionCode) ||
      normalizePhone(p.formatted_phone_number, regionCode) ||
      "",
    website: p.website ?? "",
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: typeof p.user_ratings_total === "number" ? p.user_ratings_total : null,
    mapsUrl: p.url ?? `https://www.google.com/maps/place/?q=place_id:${id}`,
    lat: p.geometry?.location?.lat ?? null,
    lng: p.geometry?.location?.lng ?? null,
  };
}
