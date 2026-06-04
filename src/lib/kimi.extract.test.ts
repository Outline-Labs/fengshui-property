import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractFloorPlanFeatures } from "./kimi";

function kimiResponse(content: unknown, status = 200): Response {
  const body =
    typeof content === "string" ? content : JSON.stringify(content);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ choices: [{ message: { content: body } }] }),
    text: async () => "error body",
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubEnv("MOONSHOT_API_KEY", "sk-test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("extractFloorPlanFeatures — vision → geometry (no judgment)", () => {
  it("throws and never calls the API when MOONSHOT_API_KEY is unset", async () => {
    vi.stubEnv("MOONSHOT_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractFloorPlanFeatures({ imageDataUrl: "data:," })).rejects.toThrow(
      /MOONSHOT_API_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses a well-formed extraction into typed geometry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        kimiResponse({
          boundary: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          rooms: [
            { label: "master bedroom", x: 0.2, y: 0.3 },
            { label: "kitchen", x: 0.8, y: 0.7 },
          ],
          door: { x: 0.5, y: 0.98 },
          stove: { x: 0.85, y: 0.72 },
          beds: [{ x: 0.2, y: 0.28 }],
          toilets: [{ x: 0.1, y: 0.6 }],
          openings: [{ x: 0.5, y: 0.0 }],
          northImageDeg: 0,
          confidence: "high",
          notes: "compass arrow visible top-right",
        }),
      ),
    );
    const r = await extractFloorPlanFeatures({ imageDataUrl: "data:image/png;base64,xx" });
    expect(r.boundary).toHaveLength(4);
    expect(r.rooms).toEqual([
      { label: "master bedroom", x: 0.2, y: 0.3 },
      { label: "kitchen", x: 0.8, y: 0.7 },
    ]);
    expect(r.door).toEqual({ x: 0.5, y: 0.98 });
    expect(r.stove).toEqual({ x: 0.85, y: 0.72 });
    expect(r.beds).toEqual([{ x: 0.2, y: 0.28 }]);
    expect(r.toilets).toEqual([{ x: 0.1, y: 0.6 }]);
    expect(r.northImageDeg).toBe(0);
    expect(r.confidence).toBe("high");
  });

  it("drops malformed entries and applies safe defaults (never invents)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        kimiResponse({
          boundary: [{ x: 0, y: 0 }, { x: "nope", y: 1 }], // bad point dropped
          rooms: [
            { label: "bedroom", x: 0.2, y: 0.3 },
            { x: 0.5, y: 0.5 }, // no label → dropped
            { label: "ghost", x: "x", y: 0.1 }, // bad coord → dropped
          ],
          // door absent, beds absent, confidence absent, north absent
        }),
      ),
    );
    const r = await extractFloorPlanFeatures({ imageDataUrl: "data:," });
    expect(r.boundary).toEqual([{ x: 0, y: 0 }]);
    expect(r.rooms).toEqual([{ label: "bedroom", x: 0.2, y: 0.3 }]);
    expect(r.door).toBeNull();
    expect(r.beds).toEqual([]);
    expect(r.toilets).toEqual([]);
    expect(r.northImageDeg).toBeNull();
    expect(r.confidence).toBe("medium"); // safe default
  });

  it("throws a friendly error on unreadable (non-JSON) content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kimiResponse("I can't see a floor plan here.")));
    await expect(extractFloorPlanFeatures({ imageDataUrl: "data:," })).rejects.toThrow(
      /Couldn't read the floor plan/,
    );
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kimiResponse("rate limited", 429)));
    await expect(extractFloorPlanFeatures({ imageDataUrl: "data:," })).rejects.toThrow(/Kimi 429/);
  });
});
