import {
  REGIONS,
  WORLD_HUBS,
  hubFor,
  worldGroupFor,
  zoneFor,
} from "./regions";

export type SearchLoc = {
  city: string;
  district: string;
  regionCode: string;
  languageCode: string;
};

function loc(city: string, district: string, regionCode: string, languageCode: string): SearchLoc {
  return { city, district, regionCode, languageCode };
}

export function resolveSearchLocations(city: string, district = ""): SearchLoc[] {
  if (city === "Tüm Türkiye") {
    return REGIONS.map((r) => loc(r.city, "", "TR", "tr"));
  }
  if (city === "Tüm dünya") {
    return WORLD_HUBS.map((h) => loc(h.city, "", h.regionCode, h.regionCode === "TR" ? "tr" : "en"));
  }
  if (city.startsWith("Bölge:")) {
    const zone = zoneFor(city.slice(6).trim());
    return (zone?.cities ?? []).map((c) => loc(c, "", "TR", "tr"));
  }
  if (city.startsWith("Dünya:")) {
    const group = worldGroupFor(city.slice(6).trim());
    return (group?.cities ?? []).map((c) => {
      const h = hubFor(c);
      return loc(c, "", h?.regionCode ?? "", h?.regionCode === "TR" ? "tr" : "en");
    });
  }
  const hub = hubFor(city);
  if (hub) {
    return [loc(city, district, hub.regionCode, hub.regionCode === "TR" ? "tr" : "en")];
  }
  if (REGIONS.some((r) => r.city === city)) {
    return [loc(city, district, "TR", "tr")];
  }
  return [loc(city, district, "", "en")];
}
