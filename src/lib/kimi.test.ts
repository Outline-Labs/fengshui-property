import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeFloorPlanImage } from "./kimi";

// ---------------------------------------------------------------------------
// kimi.ts wraps the Moonshot (Kimi) vision endpoint. Each call is a PAID model
// invocation, so the wrapper must (a) fail fast & loudly when it is not even
// configured, (b) surface transport / API errors instead of silently returning
// a bogus reading, and (c) defensively normalise whatever the model returns
// into the FloorPlanAnalysis contract the rest of the app depends on. These
// tests stub `fetch` so no real network call is ever made.
// ---------------------------------------------------------------------------

const IMG = "data:image/png;base64,AAAA";

// Helper: build a Response-shaped object carrying a Moonshot/OpenAI chat
// completion whose assistant message content is `content`.
function chatResponse(content: string, init?: ResponseInit) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, ...init },
  );
}

// A well-formed model payload matching the JSON shape the system prompt asks
// for. Returned as a string because the model emits its JSON inside the chat
// `content` field.
const GOOD_MODEL_JSON = JSON.stringify({
  score: 7.34, // should be rounded to one decimal → 7.3
  summary: "  Strong qi flow with a few fixable issues.  ",
  confidence: "high",
  rooms: [
    { name: "Main Door", sector: "SE", note: "qi enters cleanly" },
    { name: "Kitchen", sector: "S", note: "" }, // empty note → undefined
    { name: "", sector: "N", note: "no name" }, // dropped (no name)
  ],
  factors: [
    {
      type: "positive",
      severity: 3,
      title: "Stove on a wealth sector",
      principle: "八宅",
      description: "The stove sits on a favourable sector.",
    },
    {
      type: "negative",
      severity: 2,
      title: "Toilet near centre",
      principle: "峦头",
      description: "Toilet drains the 中宫.",
    },
    { type: "negative", severity: 1, title: "", principle: "峦头", description: "x" }, // dropped (no title)
  ],
  recommendations: [
    { title: "Add a screen", detail: "Place a screen by the door." },
    { title: "", detail: "dropped" }, // dropped (no title)
  ],
});

beforeEach(() => {
  // The module throws without this; happy-path tests need it present.
  vi.stubEnv("MOONSHOT_API_KEY", "test-moonshot-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Configuration guard — must fail fast, before any (paid) network call.
// ---------------------------------------------------------------------------
describe("analyzeFloorPlanImage — configuration guard", () => {
  it("throws when MOONSHOT_API_KEY is missing and never calls fetch", async () => {
    vi.stubEnv("MOONSHOT_API_KEY", ""); // empty → falsy → unconfigured
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" }),
    ).rejects.toThrow("MOONSHOT_API_KEY is not configured");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Request wiring — the right endpoint, model, auth, and multimodal payload.
// ---------------------------------------------------------------------------
describe("analyzeFloorPlanImage — request wiring", () => {
  it("posts to the Moonshot chat endpoint with auth + the image and facing", async () => {
    const fetchMock = vi.fn(async () => chatResponse(GOOD_MODEL_JSON));
    vi.stubGlobal("fetch", fetchMock);

    await analyzeFloorPlanImage({
      imageDataUrl: IMG,
      facing: "SE",
      propertyType: "condo",
      yearBuilt: 2018,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.moonshot.ai/v1/chat/completions");
    expect(opts.method).toBe("POST");

    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-moonshot-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(opts.body));
    expect(body.model).toBe("moonshot-v1-32k-vision-preview");
    // user message is multimodal: a text part + the image_url part.
    const userMsg = body.messages.find(
      (m: { role: string }) => m.role === "user",
    );
    const imagePart = userMsg.content.find(
      (p: { type: string }) => p.type === "image_url",
    );
    expect(imagePart.image_url.url).toBe(IMG);
    const textPart = userMsg.content.find(
      (p: { type: string }) => p.type === "text",
    );
    expect(textPart.text).toContain("faces: SE");
    expect(textPart.text).toContain("condo");
    expect(textPart.text).toContain("2018");
  });
});

// ---------------------------------------------------------------------------
// Happy path — a well-formed model payload becomes a clean FloorPlanAnalysis.
// ---------------------------------------------------------------------------
describe("analyzeFloorPlanImage — parses a well-formed response", () => {
  it("maps every field of the FloorPlanAnalysis contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chatResponse(GOOD_MODEL_JSON)));

    const result = await analyzeFloorPlanImage({
      imageDataUrl: IMG,
      facing: "SE",
    });

    // score rounded to one decimal, summary trimmed, confidence preserved.
    expect(result.score).toBe(7.3);
    expect(result.summary).toBe("Strong qi flow with a few fixable issues.");
    expect(result.confidence).toBe("high");
    // facing comes from the CALLER, not the model.
    expect(result.facing).toBe("SE");

    // Rooms: the nameless room is dropped; empty note normalises to undefined.
    expect(result.rooms).toHaveLength(2);
    expect(result.rooms[0]).toEqual({
      name: "Main Door",
      sector: "SE",
      note: "qi enters cleanly",
    });
    expect(result.rooms[1]).toEqual({
      name: "Kitchen",
      sector: "S",
      note: undefined,
    });

    // Factors: the title-less factor is dropped; the rest keep type/severity.
    expect(result.factors).toHaveLength(2);
    expect(result.factors[0]).toEqual({
      type: "positive",
      severity: 3,
      title: "Stove on a wealth sector",
      principle: "八宅",
      description: "The stove sits on a favourable sector.",
    });
    expect(result.factors[1].type).toBe("negative");
    expect(result.factors[1].severity).toBe(2);

    // Recommendations: the title-less rec is dropped.
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toEqual({
      title: "Add a screen",
      detail: "Place a screen by the door.",
    });
  });

  it("strips ```json markdown fences before parsing", async () => {
    const fenced = "```json\n" + GOOD_MODEL_JSON + "\n```";
    vi.stubGlobal("fetch", vi.fn(async () => chatResponse(fenced)));

    const result = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "N" });
    expect(result.score).toBe(7.3);
    expect(result.facing).toBe("N");
    expect(result.rooms).toHaveLength(2);
  });

  it("tolerates prose around the JSON object (extracts the first {...} block)", async () => {
    const noisy =
      "Here is your reading:\n" +
      GOOD_MODEL_JSON +
      "\nLet me know if you'd like more detail.";
    vi.stubGlobal("fetch", vi.fn(async () => chatResponse(noisy)));

    const result = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "E" });
    expect(result.score).toBe(7.3);
    expect(result.summary).toBe("Strong qi flow with a few fixable issues.");
  });
});

// ---------------------------------------------------------------------------
// Defensive normalisation — VALID JSON but garbage / out-of-contract field
// values must NOT throw; they must be coerced to safe, in-contract defaults.
// ---------------------------------------------------------------------------
describe("analyzeFloorPlanImage — coerces out-of-contract field values", () => {
  it("clamps an out-of-range score and rounds to one decimal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatResponse(JSON.stringify({ score: 99 }))),
    );
    const high = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" });
    expect(high.score).toBe(10);

    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatResponse(JSON.stringify({ score: -4 }))),
    );
    const low = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" });
    expect(low.score).toBe(0);
  });

  it("defaults a non-numeric / missing score to the neutral midpoint 5", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatResponse(JSON.stringify({ score: "not a number" }))),
    );
    const result = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" });
    expect(result.score).toBe(5);
  });

  it("defaults an unknown confidence to 'medium'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        chatResponse(JSON.stringify({ score: 6, confidence: "banana" })),
      ),
    );
    const result = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" });
    expect(result.confidence).toBe("medium");
  });

  it("coerces an out-of-range severity to 2 and a non-'positive' type to 'negative'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        chatResponse(
          JSON.stringify({
            score: 6,
            factors: [
              { title: "Weird beam", severity: 9, type: "ominous" },
            ],
          }),
        ),
      ),
    );
    const result = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" });
    expect(result.factors).toHaveLength(1);
    expect(result.factors[0].severity).toBe(2);
    expect(result.factors[0].type).toBe("negative");
    // missing principle defaults to a 峦头 (Form School) label, not empty.
    expect(result.factors[0].principle).toBe("峦头");
  });

  it("drops non-object array entries and defaults a missing room sector to '—'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        chatResponse(
          JSON.stringify({
            score: 6,
            rooms: ["junk", null, 42, { name: "Bedroom" }],
          }),
        ),
      ),
    );
    const result = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" });
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0]).toEqual({
      name: "Bedroom",
      sector: "—",
      note: undefined,
    });
  });

  it("treats non-array rooms/factors/recommendations as empty arrays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        chatResponse(
          JSON.stringify({
            score: 6,
            summary: "ok",
            rooms: "nope",
            factors: { not: "an array" },
            recommendations: 5,
          }),
        ),
      ),
    );
    const result = await analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" });
    expect(result.rooms).toEqual([]);
    expect(result.factors).toEqual([]);
    expect(result.recommendations).toEqual([]);
    // An otherwise-empty-but-valid object still yields a usable analysis.
    expect(result.score).toBe(6);
    expect(result.confidence).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// Unparseable model output — when there is no JSON object at all, the wrapper
// must surface a clear, user-facing error rather than crash with a raw
// SyntaxError or return a fabricated reading.
// ---------------------------------------------------------------------------
describe("analyzeFloorPlanImage — unparseable model output", () => {
  it("throws a friendly 'unreadable' error when content has no JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatResponse("I'm sorry, I cannot read this image.")),
    );
    await expect(
      analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" }),
    ).rejects.toThrow(/unreadable/i);
  });

  it("throws a friendly 'unreadable' error on truncated / malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatResponse('{"score": 7, "rooms": [')),
    );
    await expect(
      analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" }),
    ).rejects.toThrow(/unreadable/i);
  });

  it("throws 'unreadable' when the assistant message has no content at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      ),
    );
    await expect(
      analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" }),
    ).rejects.toThrow(/unreadable/i);
  });
});

// ---------------------------------------------------------------------------
// Transport / API errors — never swallow a failure into a fake reading.
// ---------------------------------------------------------------------------
describe("analyzeFloorPlanImage — transport & API errors", () => {
  it("throws including the status code on a non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("upstream is on fire", { status: 500 }),
      ),
    );
    await expect(
      analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" }),
    ).rejects.toThrow(/Kimi 500/);
  });

  it("surfaces a 401 (bad key) distinctly from the 'not configured' guard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid api key", { status: 401 })),
    );
    await expect(
      analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" }),
    ).rejects.toThrow(/Kimi 401/);
  });

  it("throws the model's error.message when the body carries a 200 error object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: "rate limit exceeded" } }),
            { status: 200 },
          ),
      ),
    );
    await expect(
      analyzeFloorPlanImage({ imageDataUrl: IMG, facing: "S" }),
    ).rejects.toThrow("rate limit exceeded");
  });
});
