import "server-only";

import type {
  FloorPlanAnalysis,
  FloorPlanFactor,
  FloorPlanRecommendation,
  FloorPlanRoom,
} from "./types";

const KIMI_BASE = "https://api.moonshot.ai/v1";
const KIMI_MODEL = "moonshot-v1-32k-vision-preview";

const SYSTEM_PROMPT = `You are a master Singapore fengshui consultant trained in three classical schools, writing for a modern homeowner.

• Form School (峦头) — the flow of qi through the layout: entry, corridors, room adjacencies, sharp interior corners, beams, missing corners (缺角).
• Flying Stars (玄空飞星) — we are in Period 9 (2024–2043), governed by the 9 Purple star (Li ☲, fire, the middle daughter). South and the fire element are strengthened this period.
• Eight Mansions (八宅) — auspicious and inauspicious sectors derived from the unit's facing.

You will be given a residential floor plan image and the facing direction of the unit's front (its main door, main windows, or balcony). Mentally overlay the Lo Shu nine-grid onto the plan using that facing, then assess:
- The main door / entry and how qi enters and circulates.
- Kitchen and stove (wealth + health) — whether the stove sits on or drains a favourable sector.
- Bathrooms / toilets — they should avoid the wealth sector and the centre (中宫).
- Bedrooms, especially the master bedroom's sector and the bed's wall.
- Door alignments (door-facing-door, door-facing-toilet, door-facing-window — qi rushing straight through).
- Beams, sharp interior corners, long straight corridors (杀气), and any missing corners.

Be concrete and cite the relevant school for each point. If the image is unclear or labels are unreadable, lower your confidence and say what you could not determine — never invent rooms you cannot see.

Return ONLY a valid JSON object (no markdown fences, no commentary) with EXACTLY this shape:
{
  "score": number,
  "summary": string,
  "confidence": "high" | "medium" | "low",
  "rooms": [ { "name": string, "sector": "N|NE|E|SE|S|SW|W|NW|center", "note": string } ],
  "factors": [ { "type": "positive" | "negative", "severity": 1 | 2 | 3, "title": string, "principle": "峦头|玄空飞星|八宅", "description": string } ],
  "recommendations": [ { "title": string, "detail": string } ]
}
score is 0–10 with one decimal, holistic. severity: 1 = minor, 2 = moderate, 3 = significant. Keep titles short; put the reasoning in description.`;

type KimiResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

export async function analyzeFloorPlanImage(params: {
  imageDataUrl: string;
  facing: string;
  propertyType?: string;
  yearBuilt?: number;
}): Promise<FloorPlanAnalysis> {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) throw new Error("MOONSHOT_API_KEY is not configured");

  const { imageDataUrl, facing, propertyType, yearBuilt } = params;
  const userText = [
    `The unit's front faces: ${facing}.`,
    propertyType ? `Property type: ${propertyType}.` : "",
    yearBuilt ? `Built / last renovated: ${yearBuilt}.` : "",
    "Analyse this floor plan and return the JSON specified in the system prompt.",
  ]
    .filter(Boolean)
    .join(" ");

  const res = await fetch(`${KIMI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kimi ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as KimiResponse;
  if (data.error?.message) throw new Error(data.error.message);
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseAnalysis(content, facing);
}

function extractJson(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : s;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) return body.trim();
  return body.slice(start, end + 1);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

function normRoom(v: unknown): FloorPlanRoom | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const name = asString(r.name);
  if (!name) return null;
  return {
    name,
    sector: asString(r.sector) || "—",
    note: asString(r.note) || undefined,
  };
}

function normFactor(v: unknown): FloorPlanFactor | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const title = asString(r.title);
  if (!title) return null;
  const sev = Number(r.severity);
  return {
    type: r.type === "positive" ? "positive" : "negative",
    severity: sev === 1 || sev === 3 ? sev : 2,
    title,
    principle: asString(r.principle) || "峦头",
    description: asString(r.description),
  };
}

function normRec(v: unknown): FloorPlanRecommendation | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const title = asString(r.title);
  if (!title) return null;
  return { title, detail: asString(r.detail) };
}

// ---------------------------------------------------------------------------
// EXTRACTOR (Layer C input) — digitise a floor plan into geometry the
// deterministic engine (lib/fengshui/spatial.ts) consumes. This does NO
// fengshui judgment: it only locates rooms/features. Coordinates are normalised
// [0,1] in IMAGE space (origin top-left, x→right, y→down); an adapter flips y
// and applies the unit's orientation before handing to spatial.ts. Kept
// separate from analyzeFloorPlanImage so the existing consumer reading is
// unchanged — judgment moves to the engine only once Layer C rules are confirmed.

const EXTRACT_PROMPT = `You are a precise floor-plan digitiser, NOT a fengshui consultant. Do not interpret, score, or advise — only locate things.

Given a residential floor-plan image, return the pixel-normalised locations (each coordinate in [0,1], origin at the TOP-LEFT, x increases right, y increases down) of:
- the outer wall boundary as a polygon (ordered points)
- each room: a human label (bedroom/master bedroom/kitchen/bathroom/living/dining/balcony/store/utility) and its approximate centroid
- the main entrance door
- the stove / hob (if a kitchen is shown)
- beds (one point each)
- toilets / WCs (one point each)
- windows and balconies (openings, 开口)
- a north arrow or compass, if one is drawn: give the bearing its arrow points to in IMAGE space (degrees clockwise from straight-up)

Return ONLY a valid JSON object (no markdown, no commentary) with EXACTLY this shape:
{
  "boundary": [ { "x": number, "y": number } ],
  "rooms": [ { "label": string, "x": number, "y": number } ],
  "door": { "x": number, "y": number } | null,
  "stove": { "x": number, "y": number } | null,
  "beds": [ { "x": number, "y": number } ],
  "toilets": [ { "x": number, "y": number } ],
  "openings": [ { "x": number, "y": number } ],
  "northImageDeg": number | null,
  "confidence": "high" | "medium" | "low",
  "notes": string
}
Omit what you genuinely cannot see (empty array / null) — NEVER invent a room, door, or feature that is not visible. Put any caveats (illegible labels, no compass shown, ambiguous door) in notes and lower confidence.`;

export type XY = { x: number; y: number };
export type ExtractedRoom = { label: string; x: number; y: number };
export type FloorPlanExtraction = {
  boundary: XY[];
  rooms: ExtractedRoom[];
  door: XY | null;
  stove: XY | null;
  beds: XY[];
  toilets: XY[];
  openings: XY[];
  northImageDeg: number | null;
  confidence: "high" | "medium" | "low";
  notes: string;
};

export async function extractFloorPlanFeatures(params: {
  imageDataUrl: string;
}): Promise<FloorPlanExtraction> {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) throw new Error("MOONSHOT_API_KEY is not configured");

  const res = await fetch(`${KIMI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      temperature: 0, // digitisation should be as deterministic as the model allows
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Digitise this floor plan into the JSON specified." },
            { type: "image_url", image_url: { url: params.imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kimi ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as KimiResponse;
  if (data.error?.message) throw new Error(data.error.message);
  return parseExtraction(data.choices?.[0]?.message?.content ?? "");
}

function xy(v: unknown): XY | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function xyList(v: unknown): XY[] {
  return Array.isArray(v) ? v.map(xy).filter((p): p is XY => p !== null) : [];
}

function parseExtraction(content: string): FloorPlanExtraction {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(extractJson(content)) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Couldn't read the floor plan — try a clearer, higher-resolution image.",
    );
  }
  const rooms = (Array.isArray(raw.rooms) ? raw.rooms : [])
    .map((v): ExtractedRoom | null => {
      const p = xy(v);
      const label = asString((v as Record<string, unknown>)?.label);
      return p && label ? { label, x: p.x, y: p.y } : null;
    })
    .filter((r): r is ExtractedRoom => r !== null);

  const north = Number(raw.northImageDeg);
  const conf = raw.confidence;
  return {
    boundary: xyList(raw.boundary),
    rooms,
    door: xy(raw.door),
    stove: xy(raw.stove),
    beds: xyList(raw.beds),
    toilets: xyList(raw.toilets),
    openings: xyList(raw.openings),
    northImageDeg: Number.isFinite(north) ? north : null,
    confidence: conf === "high" || conf === "low" ? conf : "medium",
    notes: asString(raw.notes),
  };
}

function parseAnalysis(content: string, facing: string): FloorPlanAnalysis {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(extractJson(content)) as Record<string, unknown>;
  } catch {
    throw new Error(
      "The reading came back unreadable — try a clearer floor plan image.",
    );
  }

  const rooms = Array.isArray(raw.rooms) ? raw.rooms : [];
  const factors = Array.isArray(raw.factors) ? raw.factors : [];
  const recs = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const conf = raw.confidence;

  return {
    score: clampScore(Number(raw.score)),
    summary: asString(raw.summary),
    facing,
    rooms: rooms
      .map(normRoom)
      .filter((x): x is FloorPlanRoom => x !== null),
    factors: factors
      .map(normFactor)
      .filter((x): x is FloorPlanFactor => x !== null),
    recommendations: recs
      .map(normRec)
      .filter((x): x is FloorPlanRecommendation => x !== null),
    confidence: conf === "high" || conf === "low" ? conf : "medium",
  };
}
