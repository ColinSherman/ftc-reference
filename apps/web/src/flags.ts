import { REGION_NAMES, regionName } from "./regions";

/** Country names as the FTC Events API spells them → ISO 3166-1 alpha-2 (lower-case, for flag files). */
const COUNTRY_ISO: Record<string, string> = {
  usa: "us",
  "united states": "us",
  canada: "ca",
  mexico: "mx",
  "united kingdom": "gb",
  "great britain": "gb",
  uk: "gb",
  england: "gb-eng",
  scotland: "gb-sct",
  wales: "gb-wls",
  "northern ireland": "gb-nir",
  china: "cn",
  taiwan: "tw",
  "hong kong": "hk",
  india: "in",
  "south korea": "kr",
  korea: "kr",
  "republic of korea": "kr",
  japan: "jp",
  turkey: "tr",
  türkiye: "tr",
  turkiye: "tr",
  russia: "ru",
  "russian federation": "ru",
  "united arab emirates": "ae",
  uae: "ae",
  "saudi arabia": "sa",
  "south africa": "za",
  "new zealand": "nz",
  "czech republic": "cz",
  czechia: "cz",
  "trinidad and tobago": "tt",
  "dominican republic": "do",
  "puerto rico": "pr",
  "el salvador": "sv",
  vietnam: "vn",
  "viet nam": "vn",
  netherlands: "nl",
  "the netherlands": "nl",
};

/** Region codes that aren't a plain ISO country code. */
const REGION_ISO: Record<string, string> = {
  GB: "gb",
  HKG: "hk",
  ECB: "",
  CMPIC: "",
  CMPZ2: "",
  FPE: "",
  IND: "",
  ONADOD: "",
  USARL: "us",
  CN: "cn",
};

const ISO2 = new Set(
  Object.keys(REGION_NAMES)
    .filter((k) => /^[A-Z]{2}$/.test(k))
    .map((k) => k.toLowerCase()),
);

/** Lower-case flag code ("us", "gb-eng"…) for a team, from its country, else its region code; null if unknown. */
export function flagCode(country: string | null | undefined, region?: string | null): string | null {
  const c = (country ?? "").trim().toLowerCase();
  if (c) {
    const hit = COUNTRY_ISO[c] ?? (/^[a-z]{2}$/.test(c) ? c : null);
    if (hit) return hit;
  }
  const r = (region ?? "").trim().toUpperCase();
  if (!r) return null;
  if (r in REGION_ISO) return REGION_ISO[r] || null;
  if (r.startsWith("US")) return "us";
  if (r.startsWith("CA")) return "ca";
  return ISO2.has(r.toLowerCase()) ? r.toLowerCase() : null;
}

/** Hover text for a team's flag: "Torrance, California, USA · Region: California - Los Angeles". */
export function placeTitle(t: {
  city?: string | null;
  state_prov?: string | null;
  country?: string | null;
  home_region?: string | null;
}) {
  const place = [t.city, t.state_prov, t.country].filter(Boolean).join(", ");
  const region = t.home_region ? regionName(t.home_region) : "";
  return [place, region && `Region: ${region}`].filter(Boolean).join(" · ");
}
