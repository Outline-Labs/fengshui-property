import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { distanceMeters } from "../src/lib/geo";
import type { POI, POICategory } from "../src/lib/types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const OSM_QUERY = `
[out:json][timeout:120];
area["ISO3166-1"="SG"][admin_level=2]->.sg;
(
  nwr["amenity"="hospital"](area.sg);
  nwr["amenity"="clinic"](area.sg);
  nwr["amenity"="grave_yard"](area.sg);
  nwr["landuse"="cemetery"](area.sg);
  nwr["leisure"="park"](area.sg);
  nwr["natural"="water"](area.sg);
  nwr["water"="reservoir"](area.sg);
  way["waterway"="river"](area.sg);
  way["waterway"="canal"](area.sg);
  nwr["amenity"="place_of_worship"](area.sg);
  nwr["amenity"="school"](area.sg);
  nwr["amenity"="police"](area.sg);
  nwr["amenity"="fire_station"](area.sg);
  nwr["railway"="station"](area.sg);
  nwr["station"="subway"](area.sg);
  nwr["power"="substation"](area.sg);
  nwr["landuse"="industrial"](area.sg);
);
out center tags;
`;

type OSMElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function categorize(
  tags: Record<string, string> | undefined,
): POICategory | null {
  if (!tags) return null;
  if (tags.amenity === "hospital") return "hospital";
  if (tags.amenity === "clinic") return "clinic";
  if (tags.amenity === "grave_yard" || tags.landuse === "cemetery")
    return "cemetery";
  if (tags.leisure === "park") return "park";
  if (
    tags.natural === "water" ||
    tags.water === "reservoir" ||
    tags.waterway === "river" ||
    tags.waterway === "canal"
  )
    return "water";
  if (tags.amenity === "place_of_worship") return "religious";
  if (tags.amenity === "school") return "school";
  if (tags.amenity === "police") return "police_station";
  if (tags.amenity === "fire_station") return "fire_station";
  if (tags.railway === "station" || tags.station === "subway")
    return "mrt_station";
  if (tags.power === "substation") return "power_station";
  if (tags.landuse === "industrial") return "industrial";
  return null;
}

const MANUAL_CEMETERIES: Array<{ name: string; lat: number; lon: number }> = [
  { name: "Choa Chu Kang Cemetery Complex", lat: 1.3771, lon: 103.7012 },
  { name: "Mandai Crematorium and Columbarium", lat: 1.4108, lon: 103.8005 },
  { name: "Bukit Brown Cemetery", lat: 1.33, lon: 103.8157 },
  { name: "Pusara Aman Muslim Cemetery", lat: 1.4196, lon: 103.7196 },
  { name: "Lim Chu Kang Lawn Cemetery", lat: 1.4332, lon: 103.6975 },
  {
    name: "Kong Meng San Phor Kark See Columbarium",
    lat: 1.3712,
    lon: 103.8336,
  },
  { name: "Tse Toh Aum Crematorium (Bishan)", lat: 1.3656, lon: 103.833 },
];

function clusterByProximity(pois: POI[], radiusMeters: number): POI[] {
  const result: POI[] = [];
  const claimed = new Set<number>();

  for (let i = 0; i < pois.length; i++) {
    if (claimed.has(i)) continue;
    const cluster = [pois[i]];
    claimed.add(i);
    for (let j = i + 1; j < pois.length; j++) {
      if (claimed.has(j)) continue;
      if (distanceMeters(pois[i], pois[j]) <= radiusMeters) {
        cluster.push(pois[j]);
        claimed.add(j);
      }
    }
    const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
    const lon = cluster.reduce((s, p) => s + p.lon, 0) / cluster.length;
    const representative =
      cluster.find((p) => p.name && p.name !== "(unnamed)") ?? cluster[0];
    result.push({ ...representative, lat, lon });
  }

  return result;
}

async function main() {
  console.log("Fetching Singapore POIs from OSM Overpass...");
  const start = Date.now();

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "fengshuiai.sg ETL (contact: hello@fengshuiai.sg)",
      Accept: "application/json",
    },
    body: `data=${encodeURIComponent(OSM_QUERY)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { elements: OSMElement[] };

  const raw: POI[] = [];
  for (const el of data.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const category = categorize(el.tags);
    if (!category) continue;

    raw.push({
      id: `${el.type}-${el.id}`,
      category,
      name: el.tags?.name ?? "(unnamed)",
      lat,
      lon,
      tags: el.tags,
    });
  }

  const byCategory = new Map<POICategory, POI[]>();
  for (const p of raw) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const mrt = byCategory.get("mrt_station") ?? [];
  const mrtDeduped = clusterByProximity(mrt, 150);
  byCategory.set("mrt_station", mrtDeduped);

  const cemeteries = byCategory.get("cemetery") ?? [];
  for (const c of MANUAL_CEMETERIES) {
    cemeteries.push({
      id: `manual-cemetery-${c.name.toLowerCase().replace(/\s+/g, "-")}`,
      category: "cemetery",
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      tags: { source: "manual" },
    });
  }
  byCategory.set("cemetery", clusterByProximity(cemeteries, 200));

  const pois: POI[] = [];
  for (const list of byCategory.values()) pois.push(...list);

  const counts: Record<string, number> = {};
  for (const p of pois) counts[p.category] = (counts[p.category] ?? 0) + 1;

  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, "pois.json");
  writeFileSync(outPath, JSON.stringify(pois, null, 2));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nSaved ${pois.length} POIs to ${outPath} in ${elapsed}s`);
  console.log(`(Raw OSM: ${raw.length}; cleaned/deduped: ${pois.length})`);
  console.log("\nBreakdown by category:");
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat.padEnd(18)} ${count}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
