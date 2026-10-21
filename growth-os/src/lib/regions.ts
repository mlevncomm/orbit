export type Region = {
  city: string;
  districts: string[];
};

export const REGIONS: Region[] = [
  {
    city: "İstanbul",
    districts: [
      "Kadıköy", "Üsküdar", "Beşiktaş", "Şişli", "Beyoğlu", "Fatih", "Bakırköy",
      "Ataşehir", "Maltepe", "Pendik", "Kartal", "Ümraniye", "Sarıyer", "Kağıthane",
      "Eyüpsultan", "Bahçelievler", "Bağcılar", "Küçükçekmece", "Başakşehir", "Esenyurt",
      "Beylikdüzü", "Avcılar", "Zeytinburnu", "Gaziosmanpaşa", "Sultangazi", "Sultanbeyli",
    ],
  },
  {
    city: "Ankara",
    districts: [
      "Çankaya", "Keçiören", "Yenimahalle", "Mamak", "Etimesgut", "Sincan",
      "Altındağ", "Pursaklar", "Gölbaşı", "Polatlı",
    ],
  },
  {
    city: "İzmir",
    districts: [
      "Konak", "Karşıyaka", "Bornova", "Buca", "Çiğli", "Bayraklı", "Gaziemir",
      "Balçova", "Narlıdere", "Alsancak", "Güzelyalı", "Karabağlar", "Menemen",
    ],
  },
  {
    city: "Bursa",
    districts: ["Osmangazi", "Nilüfer", "Yıldırım", "Mudanya", "Gemlik", "İnegöl"],
  },
  {
    city: "Antalya",
    districts: ["Muratpaşa", "Konyaaltı", "Kepez", "Lara", "Alanya", "Manavgat", "Kemer"],
  },
  {
    city: "Adana",
    districts: ["Seyhan", "Çukurova", "Yüreğir", "Sarıçam"],
  },
  {
    city: "Gaziantep",
    districts: ["Şahinbey", "Şehitkamil"],
  },
  {
    city: "Konya",
    districts: ["Selçuklu", "Meram", "Karatay"],
  },
  {
    city: "Kayseri",
    districts: ["Melikgazi", "Kocasinan", "Talas"],
  },
  {
    city: "Mersin",
    districts: ["Yenişehir", "Mezitli", "Toroslar", "Akdeniz"],
  },
  {
    city: "Eskişehir",
    districts: ["Odunpazarı", "Tepebaşı"],
  },
  {
    city: "Trabzon",
    districts: ["Ortahisar", "Akçaabat", "Yomra"],
  },
  {
    city: "Samsun",
    districts: ["İlkadım", "Atakum", "Canik"],
  },
  {
    city: "Kocaeli",
    districts: ["İzmit", "Gebze", "Darıca", "Körfez", "Gölcük"],
  },
  {
    city: "Muğla",
    districts: ["Bodrum", "Fethiye", "Marmaris", "Milas", "Datça"],
  },
  {
    city: "Aydın",
    districts: ["Efeler", "Kuşadası", "Didim", "Söke", "Nazilli"],
  },
  {
    city: "Denizli",
    districts: ["Pamukkale", "Merkezefendi"],
  },
  {
    city: "Balıkesir",
    districts: ["Karesi", "Altıeylül", "Edremit", "Bandırma", "Ayvalık"],
  },
  {
    city: "Tekirdağ",
    districts: ["Süleymanpaşa", "Çorlu", "Çerkezköy"],
  },
  {
    city: "Diyarbakır",
    districts: ["Bağlar", "Kayapınar", "Yenişehir", "Sur"],
  },
  { city: "Hatay", districts: ["Antakya", "İskenderun", "Defne", "Arsuz"] },
  { city: "Şanlıurfa", districts: ["Eyyübiye", "Haliliye", "Karaköprü"] },
  { city: "Van", districts: ["İpekyolu", "Edremit", "Tuşba"] },
  { city: "Malatya", districts: ["Yeşilyurt", "Battalgazi"] },
  { city: "Kahramanmaraş", districts: ["Dulkadiroğlu", "Onikişubat"] },
  { city: "Erzurum", districts: ["Yakutiye", "Palandöken", "Aziziye"] },
  { city: "Sakarya", districts: ["Adapazarı", "Serdivan", "Erenler", "Hendek"] },
  { city: "Manisa", districts: ["Şehzadeler", "Yunusemre", "Turgutlu", "Salihli", "Akhisar"] },
  { city: "Mardin", districts: ["Artuklu", "Kızıltepe", "Midyat"] },
  { city: "Batman", districts: ["Merkez"] },
  { city: "Ordu", districts: ["Altınordu", "Fatsa", "Ünye"] },
  { city: "Afyonkarahisar", districts: ["Merkez", "Sandıklı"] },
  { city: "Isparta", districts: ["Merkez"] },
  { city: "Edirne", districts: ["Merkez", "Keşan"] },
  { city: "Çanakkale", districts: ["Merkez", "Biga", "Gelibolu"] },
  { city: "Yalova", districts: ["Merkez", "Çınarcık"] },
  { city: "Düzce", districts: ["Merkez", "Akçakoca"] },
  { city: "Bolu", districts: ["Merkez"] },
  { city: "Zonguldak", districts: ["Merkez", "Ereğli", "Çaycuma"] },
  { city: "Rize", districts: ["Merkez", "Ardeşen", "Çayeli"] },
  { city: "Giresun", districts: ["Merkez"] },
  { city: "Elazığ", districts: ["Merkez"] },
  { city: "Sivas", districts: ["Merkez"] },
  { city: "Tokat", districts: ["Merkez"] },
  { city: "Çorum", districts: ["Merkez"] },
  { city: "Aksaray", districts: ["Merkez"] },
  { city: "Nevşehir", districts: ["Merkez", "Ürgüp", "Avanos"] },
  { city: "Osmaniye", districts: ["Merkez"] },
  { city: "Adıyaman", districts: ["Merkez"] },
  { city: "Kütahya", districts: ["Merkez"] },
  { city: "Uşak", districts: ["Merkez"] },
  { city: "Kırklareli", districts: ["Merkez", "Lüleburgaz"] },
  { city: "Kırıkkale", districts: ["Merkez"] },
  { city: "Karaman", districts: ["Merkez"] },
  { city: "Burdur", districts: ["Merkez"] },
  { city: "Bilecik", districts: ["Merkez"] },
  { city: "Amasya", districts: ["Merkez"] },
  { city: "Kastamonu", districts: ["Merkez"] },
  { city: "Sinop", districts: ["Merkez"] },
  { city: "Artvin", districts: ["Merkez", "Hopa"] },
  { city: "Kars", districts: ["Merkez"] },
  { city: "Ağrı", districts: ["Merkez"] },
  { city: "Iğdır", districts: ["Merkez"] },
  { city: "Erzincan", districts: ["Merkez"] },
  { city: "Bingöl", districts: ["Merkez"] },
  { city: "Muş", districts: ["Merkez"] },
  { city: "Bitlis", districts: ["Merkez", "Tatvan"] },
  { city: "Siirt", districts: ["Merkez"] },
  { city: "Şırnak", districts: ["Merkez", "Cizre"] },
  { city: "Hakkari", districts: ["Merkez"] },
  { city: "Kilis", districts: ["Merkez"] },
  { city: "Bartın", districts: ["Merkez"] },
  { city: "Karabük", districts: ["Merkez", "Safranbolu"] },
  { city: "Yozgat", districts: ["Merkez"] },
  { city: "Niğde", districts: ["Merkez"] },
  { city: "Kırşehir", districts: ["Merkez"] },
  { city: "Çankırı", districts: ["Merkez"] },
  { city: "Gümüşhane", districts: ["Merkez"] },
  { city: "Bayburt", districts: ["Merkez"] },
  { city: "Tunceli", districts: ["Merkez"] },
  { city: "Ardahan", districts: ["Merkez"] },
];

export const WORLD_HUBS: { city: string; regionCode: string }[] = [
  { city: "İstanbul", regionCode: "TR" },
  { city: "Ankara", regionCode: "TR" },
  { city: "İzmir", regionCode: "TR" },
  { city: "Dubai", regionCode: "AE" },
  { city: "Abu Dhabi", regionCode: "AE" },
  { city: "Doha", regionCode: "QA" },
  { city: "Riyadh", regionCode: "SA" },
  { city: "Jeddah", regionCode: "SA" },
  { city: "Kuwait City", regionCode: "KW" },
  { city: "Manama", regionCode: "BH" },
  { city: "Muscat", regionCode: "OM" },
  { city: "Cairo", regionCode: "EG" },
  { city: "Amman", regionCode: "JO" },
  { city: "Baku", regionCode: "AZ" },
  { city: "Tbilisi", regionCode: "GE" },
  { city: "Berlin", regionCode: "DE" },
  { city: "Munich", regionCode: "DE" },
  { city: "London", regionCode: "GB" },
  { city: "Manchester", regionCode: "GB" },
  { city: "Paris", regionCode: "FR" },
  { city: "Amsterdam", regionCode: "NL" },
  { city: "Brussels", regionCode: "BE" },
  { city: "Milan", regionCode: "IT" },
  { city: "Rome", regionCode: "IT" },
  { city: "Madrid", regionCode: "ES" },
  { city: "Barcelona", regionCode: "ES" },
  { city: "Vienna", regionCode: "AT" },
  { city: "Zurich", regionCode: "CH" },
  { city: "Athens", regionCode: "GR" },
  { city: "Warsaw", regionCode: "PL" },
  { city: "Prague", regionCode: "CZ" },
  { city: "Budapest", regionCode: "HU" },
  { city: "Lisbon", regionCode: "PT" },
  { city: "Stockholm", regionCode: "SE" },
  { city: "Dublin", regionCode: "IE" },
  { city: "Singapore", regionCode: "SG" },
  { city: "Bangkok", regionCode: "TH" },
  { city: "Kuala Lumpur", regionCode: "MY" },
  { city: "Hong Kong", regionCode: "HK" },
  { city: "Seoul", regionCode: "KR" },
  { city: "Tokyo", regionCode: "JP" },
  { city: "Jakarta", regionCode: "ID" },
  { city: "Mumbai", regionCode: "IN" },
  { city: "Delhi", regionCode: "IN" },
  { city: "Sydney", regionCode: "AU" },
  { city: "Melbourne", regionCode: "AU" },
  { city: "Toronto", regionCode: "CA" },
  { city: "New York", regionCode: "US" },
  { city: "Chicago", regionCode: "US" },
  { city: "Los Angeles", regionCode: "US" },
  { city: "Houston", regionCode: "US" },
  { city: "Miami", regionCode: "US" },
  { city: "Mexico City", regionCode: "MX" },
  { city: "Sao Paulo", regionCode: "BR" },
];

export const TURKEY_ZONES: { id: string; label: string; cities: string[] }[] = [
  {
    id: "marmara",
    label: "Marmara",
    cities: ["İstanbul", "Bursa", "Kocaeli", "Tekirdağ", "Balıkesir", "Sakarya", "Yalova", "Edirne", "Kırklareli", "Bilecik", "Çanakkale"],
  },
  {
    id: "ege",
    label: "Ege",
    cities: ["İzmir", "Aydın", "Muğla", "Denizli", "Manisa", "Uşak", "Afyonkarahisar", "Kütahya"],
  },
  {
    id: "akdeniz",
    label: "Akdeniz",
    cities: ["Antalya", "Mersin", "Adana", "Hatay", "Osmaniye", "Kahramanmaraş", "Isparta", "Burdur"],
  },
  {
    id: "icanadolu",
    label: "İç Anadolu",
    cities: ["Ankara", "Konya", "Kayseri", "Eskişehir", "Sivas", "Aksaray", "Nevşehir", "Niğde", "Kırıkkale", "Kırşehir", "Karaman", "Yozgat", "Çankırı"],
  },
  {
    id: "karadeniz",
    label: "Karadeniz",
    cities: ["Samsun", "Trabzon", "Ordu", "Rize", "Giresun", "Zonguldak", "Bolu", "Düzce", "Kastamonu", "Sinop", "Amasya", "Tokat", "Artvin", "Bartın", "Karabük"],
  },
  {
    id: "dogu",
    label: "Doğu Anadolu",
    cities: ["Erzurum", "Van", "Malatya", "Elazığ", "Erzincan", "Ağrı", "Kars", "Iğdır", "Ardahan", "Bingöl", "Muş", "Bitlis", "Hakkari", "Tunceli"],
  },
  {
    id: "guneydogu",
    label: "Güneydoğu",
    cities: ["Gaziantep", "Diyarbakır", "Şanlıurfa", "Mardin", "Batman", "Adıyaman", "Siirt", "Şırnak", "Kilis"],
  },
];

export const WORLD_GROUPS: { id: string; label: string; cities: string[] }[] = [
  {
    id: "gcc",
    label: "Körfez & MENA",
    cities: ["Dubai", "Abu Dhabi", "Doha", "Riyadh", "Jeddah", "Kuwait City", "Manama", "Muscat", "Cairo", "Amman"],
  },
  {
    id: "europe",
    label: "Avrupa",
    cities: ["London", "Paris", "Berlin", "Munich", "Amsterdam", "Brussels", "Milan", "Rome", "Madrid", "Barcelona", "Vienna", "Zurich", "Athens", "Warsaw", "Prague", "Budapest", "Lisbon", "Stockholm", "Dublin", "Manchester"],
  },
  {
    id: "asia",
    label: "Asya & Pasifik",
    cities: ["Singapore", "Bangkok", "Kuala Lumpur", "Hong Kong", "Seoul", "Tokyo", "Jakarta", "Mumbai", "Delhi", "Sydney", "Melbourne"],
  },
  {
    id: "americas",
    label: "Amerika",
    cities: ["Toronto", "New York", "Chicago", "Los Angeles", "Houston", "Miami", "Mexico City", "Sao Paulo"],
  },
];

export function hubFor(city: string) {
  return WORLD_HUBS.find((h) => h.city.toLowerCase() === city.toLowerCase()) ?? null;
}

export function zoneFor(idOrLabel: string) {
  const key = idOrLabel.trim().toLowerCase();
  return TURKEY_ZONES.find((z) => z.id === key || z.label.toLowerCase() === key) ?? null;
}

export function worldGroupFor(idOrLabel: string) {
  const key = idOrLabel.trim().toLowerCase();
  return WORLD_GROUPS.find((z) => z.id === key || z.label.toLowerCase() === key) ?? null;
}

export function districtsFor(city: string): string[] {
  return REGIONS.find((r) => r.city === city)?.districts ?? [];
}
