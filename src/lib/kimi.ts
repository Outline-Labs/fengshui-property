import "server-only";

import {
  PERIOD_9_FAVOURABLE,
  PERIOD_9_INAUSPICIOUS,
  computeFlyingStars,
  type Dir8,
  type FlyingStarChart,
} from "./fengshui/flying-stars";
import type {
  FloorPlanAnalysis,
  FloorPlanFactor,
  FloorPlanRecommendation,
  FloorPlanRoom,
} from "./types";

const KIMI_BASE = "https://api.moonshot.ai/v1";
const KIMI_MODEL = "moonshot-v1-32k-vision-preview";
const KIMI_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `You are a master Singapore fengshui consultant trained in three classical schools, writing for a modern homeowner.

• Form School (峦头) — the flow of qi through the layout: entry, corridors, room adjacencies, sharp interior corners, beams, missing corners (缺角).
• Flying Stars (玄空飞星) — the unit's natal star chart is PROVIDED to you in the user message as ground truth. It is computed deterministically from the facing and construction period — do NOT recompute or invent star positions. Read the rooms against THAT chart: a room sitting on a timely/auspicious star is strengthened; one on a problematic star (e.g. 2 Black, 5 Yellow) needs care. We are in Period 9 (2024–2043), governed by the 9 Purple star (Li ☲, fire).
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

// In-contract enums the model is asked to use. We validate against these on the
// way out, so a hallucinated sector or mis-attributed school is blanked rather
// than shown to the user as fact.
const VALID_SECTORS = new Set([
  "N", "NE", "E", "SE", "S", "SW", "W", "NW", "center",
]);
const VALID_PRINCIPLES = new Set(["峦头", "玄空飞星", "八宅"]);

// Accept either the 8-direction code ("NE") or its label ("Northeast") — the
// upload action passes the label — and resolve to the Dir8 the flying-stars
// engine needs; null if it isn't one of the eight.
const FACING_ALIASES: Record<string, Dir8> = {
  n: "N", north: "N",
  ne: "NE", northeast: "NE",
  e: "E", east: "E",
  se: "SE", southeast: "SE",
  s: "S", south: "S",
  sw: "SW", southwest: "SW",
  w: "W", west: "W",
  nw: "NW", northwest: "NW",
};

function normalizeFacing(facing: string): Dir8 | null {
  return FACING_ALIASES[facing.trim().toLowerCase()] ?? null;
}

// A compact, authoritative rendering of the deterministic natal chart, handed to
// the model so its flying-stars claims track the real chart instead of being
// invented. 山 = mountain star (health/relationships), 向 = facing star (wealth).
function flyingStarsBrief(chart: FlyingStarChart): string {
  const p9 = chart.period === 9;
  const tag = (n: number) =>
    p9 && PERIOD_9_FAVOURABLE.has(n)
      ? "↑"
      : p9 && PERIOD_9_INAUSPICIOUS.has(n)
        ? "↓"
        : "";
  const rows = chart.cells
    .filter((c) => c.palace !== "C")
    .map((c) => `${c.palace}=山${c.mountain}${tag(c.mountain)}/向${c.facing}${tag(c.facing)}`)
    .join(", ");
  const legend = p9
    ? " (Period 9: stars 9/1/8 are timely↑, 2/5 are problematic↓.)"
    : "";
  return `Period ${chart.period}, facing ${chart.facing}, sitting ${chart.sitting}. Palace stars: ${rows}.${legend}`;
}

type KimiResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function friendlyHttpError(status: number): Error {
  if (isTransientStatus(status)) {
    return new Error(
      "The reading service is busy right now — please try again in a moment.",
    );
  }
  if (status === 401 || status === 403) {
    // An auth/config problem on our side — never leak it to the user.
    return new Error(
      "The reading service is temporarily unavailable. Please try again later.",
    );
  }
  return new Error("We couldn't complete the reading — please try again.");
}

async function fetchWithTimeout(body: object, key: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KIMI_TIMEOUT_MS);
  try {
    return await fetch(`${KIMI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One Kimi chat-completion call, hardened: a 60s timeout and a single retry on
 * transient failures (429 / 5xx / network drop / timeout). On failure it surfaces
 * a friendly, user-safe message — never the raw upstream body or an API-key
 * error — while logging the detail server-side. Shared by both callers.
 */
async function kimiContent(body: object): Promise<string> {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) throw new Error("MOONSHOT_API_KEY is not configured");

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(body, key);
    } catch (e) {
      // Network drop or our own timeout abort — retry once, then give up.
      console.error(`[kimi] request failed (attempt ${attempt + 1})`, e);
      if (attempt === 0) continue;
      throw new Error(
        "The reading service is busy right now — please try again in a moment.",
      );
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      console.error(`[kimi] HTTP ${res.status}: ${raw.slice(0, 300)}`);
      if (isTransientStatus(res.status) && attempt === 0) continue;
      throw friendlyHttpError(res.status);
    }

    const data = (await res.json()) as KimiResponse;
    if (data.error?.message) {
      // Some providers return errors (e.g. rate limits) with HTTP 200.
      console.error(`[kimi] 200 error body: ${data.error.message}`);
      throw new Error("We couldn't complete the reading — please try again.");
    }
    return data.choices?.[0]?.message?.content ?? "";
  }
  // Unreachable: the loop either returns or throws on the last attempt.
  throw new Error("We couldn't complete the reading — please try again.");
}

export async function analyzeFloorPlanImage(params: {
  imageDataUrl: string;
  facing: string;
  propertyType?: string;
  yearBuilt?: number;
}): Promise<FloorPlanAnalysis> {
  const { imageDataUrl, facing, propertyType, yearBuilt } = params;

  // Ground the model in the deterministic flying-stars chart whenever we can
  // read the facing as one of the eight directions, so its star claims track
  // the real natal chart instead of being made up.
  const dir = normalizeFacing(facing);
  const chart = dir ? computeFlyingStars(dir, yearBuilt) : null;

  const userText = [
    `The unit's front faces: ${facing}.`,
    propertyType ? `Property type: ${propertyType}.` : "",
    yearBuilt ? `Built / last renovated: ${yearBuilt}.` : "",
    chart
      ? `Authoritative flying-stars chart (ground truth — interpret rooms against this, do not invent star positions): ${flyingStarsBrief(chart)}`
      : "",
    "Analyse this floor plan and return the JSON specified in the system prompt.",
  ]
    .filter(Boolean)
    .join(" ");

  // temperature 0: the same floor plan + facing should read the same way every
  // time — trust matters for a fengshui verdict (it remains best-effort, as a
  // vision model isn't bit-deterministic, but the score no longer drifts freely).
  const content = await kimiContent({
    model: KIMI_MODEL,
    temperature: 0,
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
  });
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
  // Only keep a sector the model was actually offered — a hallucinated value
  // (e.g. "upstairs") is shown as "—" rather than a fake compass sector.
  const sectorRaw = asString(r.sector);
  const sector = VALID_SECTORS.has(sectorRaw) ? sectorRaw : "—";
  return {
    name,
    sector,
    note: asString(r.note) || undefined,
  };
}

function normFactor(v: unknown): FloorPlanFactor | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const title = asString(r.title);
  if (!title) return null;
  const sev = Number(r.severity);
  // Keep the school attribution only if it's one of the three we asked for;
  // otherwise leave it blank rather than silently mislabelling it as Form School.
  const principleRaw = asString(r.principle);
  const principle = VALID_PRINCIPLES.has(principleRaw) ? principleRaw : "";
  return {
    type: r.type === "positive" ? "positive" : "negative",
    severity: sev === 1 || sev === 3 ? sev : 2,
    title,
    principle,
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
  const content = await kimiContent({
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
  });
  return parseExtraction(content);
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

  // The score IS the verdict — never fabricate one. A missing/non-numeric score
  // means an incomplete reading; fail honestly (the caller refunds the credit)
  // rather than show a fake neutral 5.0.
  const score = Number(raw.score);
  if (!Number.isFinite(score)) {
    throw new Error(
      "The reading came back incomplete — please try again.",
    );
  }

  const rooms = Array.isArray(raw.rooms) ? raw.rooms : [];
  const factors = Array.isArray(raw.factors) ? raw.factors : [];
  const recs = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const conf = raw.confidence;

  return {
    score: clampScore(score),
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
