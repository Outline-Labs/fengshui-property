import "server-only";

import type { Coords, OneMapSearchResult } from "./types";

const ONEMAP_BASE = "https://www.onemap.gov.sg";

export type OneMapRevGeocodeResult = {
  buildingName: string;
  block: string;
  road: string;
  postalCode: string;
  lat: number;
  lon: number;
  distanceMeters: number;
};

type RawRevGeocodeAddress = {
  BUILDINGNAME?: string;
  BLOCK?: string;
  ROAD?: string;
  POSTALCODE?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
  XCOORD?: string;
  YCOORD?: string;
};

// OneMap access tokens expire (~3 days), so a static env token dies in prod.
// When ONEMAP_EMAIL + ONEMAP_PASSWORD are set we fetch and cache a token,
// refreshing it before expiry. Otherwise we fall back to a static ONEMAP_TOKEN
// (fine for local dev).
let cachedToken: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchToken(): Promise<string | null> {
  const email = process.env.ONEMAP_EMAIL?.trim();
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) return null;
  try {
    const res = await fetch(`${ONEMAP_BASE}/api/auth/post/getToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      // OneMap can hang; bound it so a stalled token fetch can't stall the whole
      // server action (the catch below falls back to the static token / null).
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      expiry_timestamp?: string | number;
    };
    const token = data.access_token;
    if (!token) return null;
    const expSec = Number(data.expiry_timestamp);
    const expiresAt = Number.isFinite(expSec)
      ? expSec * 1000
      : Date.now() + 3 * 24 * 60 * 60 * 1000;
    cachedToken = { token, expiresAt };
    return token;
  } catch {
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD) {
    // Refresh a minute before expiry; de-dupe concurrent refreshes.
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
      return cachedToken.token;
    }
    inflight ??= fetchToken().finally(() => {
      inflight = null;
    });
    const token = await inflight;
    if (token) return token;
    // Fall through to a static token if the credential fetch failed.
  }
  return process.env.ONEMAP_TOKEN?.trim() || null;
}

function haversine(a: Coords, b: Coords): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function reverseGeocode(
  coords: Coords,
  bufferMeters = 80,
): Promise<OneMapRevGeocodeResult | null> {
  const token = await getToken();
  if (!token) return null;

  const url = new URL(`${ONEMAP_BASE}/api/public/revgeocode`);
  url.searchParams.set("location", `${coords.lat},${coords.lon}`);
  url.searchParams.set("buffer", String(bufferMeters));
  url.searchParams.set("addressType", "all");
  url.searchParams.set("otherFeatures", "Y");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: token },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(6000), // fail fast on a hung OneMap call
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;
  const data = (await res.json()) as { GeocodeInfo?: RawRevGeocodeAddress[] };

  const list = data.GeocodeInfo ?? [];
  if (list.length === 0) return null;

  // OneMap returns the literal string "NIL" for missing fields; treat it (and
  // blanks) as absent so it never leaks into a formatted address like
  // "Blk NIL NIL · NIL · S069111".
  const clean = (v?: string) => {
    const t = (v ?? "").trim();
    return t === "NIL" ? "" : t;
  };
  const enriched = list
    .map((a) => {
      const lat = Number(a.LATITUDE);
      const lon = Number(a.LONGITUDE);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        buildingName: clean(a.BUILDINGNAME),
        block: clean(a.BLOCK),
        road: clean(a.ROAD),
        postalCode: clean(a.POSTALCODE),
        lat,
        lon,
        distanceMeters: haversine(coords, { lat, lon }),
      } satisfies OneMapRevGeocodeResult;
    })
    .filter((x): x is OneMapRevGeocodeResult => x !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return enriched[0] ?? null;
}

export function formatRevGeocodeAddress(r: OneMapRevGeocodeResult): string {
  const parts: string[] = [];
  if (r.block && r.road) {
    parts.push(`Blk ${r.block} ${r.road}`);
  } else if (r.road) {
    parts.push(r.road);
  } else if (r.buildingName) {
    parts.push(r.buildingName);
  }
  if (r.buildingName && r.buildingName !== parts[0]) {
    parts.push(r.buildingName);
  }
  if (r.postalCode && r.postalCode !== "NIL") {
    parts.push(`S${r.postalCode}`);
  }
  return parts.join(" · ");
}

type RawSearchResult = {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  BUILDING?: string;
  ADDRESS?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
};

export async function searchAddress(
  query: string,
  limit = 6,
): Promise<OneMapSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const token = await getToken();
  const url = new URL(`${ONEMAP_BASE}/api/common/elastic/search`);
  url.searchParams.set("searchVal", q);
  url.searchParams.set("returnGeom", "Y");
  url.searchParams.set("getAddrDetails", "Y");
  url.searchParams.set("pageNum", "1");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: token } : undefined,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000), // fail fast on a hung OneMap call
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const data = (await res.json()) as { results?: RawSearchResult[] };
  const clean = (v?: string) => (v && v !== "NIL" ? v.trim() : undefined);

  const out: OneMapSearchResult[] = [];
  for (const r of (data.results ?? []).slice(0, limit)) {
    const lat = Number(r.LATITUDE);
    const lon = Number(r.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      label: (r.SEARCHVAL || r.BUILDING || r.ADDRESS || "").trim(),
      address: (r.ADDRESS || "").trim(),
      block: clean(r.BLK_NO),
      road: clean(r.ROAD_NAME),
      building: clean(r.BUILDING),
      postal: clean(r.POSTAL),
      lat,
      lon,
    });
  }
  return out;
}
