import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OneMapRevGeocodeResult } from "./onemap";
import { formatRevGeocodeAddress, reverseGeocode, searchAddress } from "./onemap";

// ---------------------------------------------------------------------------
// onemap.ts talks to OneMap over fetch. We stub global fetch with crafted
// Response objects and assert (a) the typed parsing, (b) graceful handling of
// empty / non-ok / network-error responses, and (c) the email+password token
// lifecycle (fetch → cache → reuse-within-expiry → refresh-when-expired).
//
// getToken() keeps module-level cache state, so the token-lifecycle suite uses
// vi.resetModules() + dynamic import to get a fresh module per test.
// ---------------------------------------------------------------------------

/** A minimal Response-like for happy JSON paths. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// searchAddress
// ---------------------------------------------------------------------------
describe("searchAddress — typed parsing", () => {
  it("maps OneMap elastic results into the typed shape", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            SEARCHVAL: "TANJONG PAGAR MRT STATION",
            BLK_NO: "12",
            ROAD_NAME: "MAXWELL ROAD",
            BUILDING: "TANJONG PAGAR MRT STATION",
            ADDRESS: "12 MAXWELL ROAD SINGAPORE 069111",
            POSTAL: "069111",
            LATITUDE: "1.276525",
            LONGITUDE: "103.845725",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await searchAddress("tanjong pagar");
    expect(out).toEqual([
      {
        label: "TANJONG PAGAR MRT STATION",
        address: "12 MAXWELL ROAD SINGAPORE 069111",
        block: "12",
        road: "MAXWELL ROAD",
        building: "TANJONG PAGAR MRT STATION",
        postal: "069111",
        lat: 1.276525,
        lon: 103.845725,
      },
    ]);
  });

  it('treats "NIL" and empty optional fields as undefined', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              SEARCHVAL: "SOME PLACE",
              BLK_NO: "NIL",
              ROAD_NAME: "",
              BUILDING: "NIL",
              ADDRESS: "SOME PLACE",
              POSTAL: "NIL",
              LATITUDE: "1.3",
              LONGITUDE: "103.8",
            },
          ],
        }),
      ),
    );

    const [r] = await searchAddress("somewhere");
    expect(r.block).toBeUndefined();
    expect(r.road).toBeUndefined();
    expect(r.building).toBeUndefined();
    expect(r.postal).toBeUndefined();
    expect(r.label).toBe("SOME PLACE");
  });

  it("falls back through SEARCHVAL → BUILDING → ADDRESS for the label", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              // no SEARCHVAL
              BUILDING: "MY BUILDING",
              ADDRESS: "1 SOME RD",
              LATITUDE: "1.3",
              LONGITUDE: "103.8",
            },
          ],
        }),
      ),
    );
    const [r] = await searchAddress("xx");
    expect(r.label).toBe("MY BUILDING");
  });

  it("skips rows with non-finite coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              SEARCHVAL: "BAD COORDS",
              ADDRESS: "bad",
              LATITUDE: "not-a-number",
              LONGITUDE: "also-bad",
            },
            {
              SEARCHVAL: "GOOD COORDS",
              ADDRESS: "good",
              LATITUDE: "1.35",
              LONGITUDE: "103.9",
            },
          ],
        }),
      ),
    );
    const out = await searchAddress("query");
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("GOOD COORDS");
  });

  it("respects the limit, slicing before parsing", async () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      SEARCHVAL: `PLACE ${i}`,
      ADDRESS: `addr ${i}`,
      LATITUDE: "1.3",
      LONGITUDE: "103.8",
    }));
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results })));
    const out = await searchAddress("query", 3);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.label)).toEqual(["PLACE 0", "PLACE 1", "PLACE 2"]);
  });

  it("returns [] for an empty results array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results: [] })));
    expect(await searchAddress("query")).toEqual([]);
  });

  it("returns [] when the payload omits results entirely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    expect(await searchAddress("query")).toEqual([]);
  });

  it("does NOT call fetch for queries shorter than 2 chars", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchAddress("a")).toEqual([]);
    expect(await searchAddress("  ")).toEqual([]);
    expect(await searchAddress("")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] on a non-ok HTTP response (no throw)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "boom" }, 500)),
    );
    await expect(searchAddress("query")).resolves.toEqual([]);
  });

  it("returns [] when fetch rejects (network error, no throw)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(searchAddress("query")).resolves.toEqual([]);
  });

  it("hits the elastic search endpoint with the expected query params", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await searchAddress("  raffles place  ");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/common/elastic/search");
    // query is trimmed before being sent
    expect(url.searchParams.get("searchVal")).toBe("raffles place");
    expect(url.searchParams.get("returnGeom")).toBe("Y");
    expect(url.searchParams.get("getAddrDetails")).toBe("Y");
  });
});

// ---------------------------------------------------------------------------
// reverseGeocode
// ---------------------------------------------------------------------------
describe("reverseGeocode — typed parsing", () => {
  beforeEach(() => {
    // Provide a static token so getToken() resolves without a network round-trip.
    vi.stubEnv("ONEMAP_TOKEN", "static-token");
    vi.stubEnv("ONEMAP_EMAIL", "");
    vi.stubEnv("ONEMAP_PASSWORD", "");
  });

  it("parses GeocodeInfo and returns the nearest building", async () => {
    const coords = { lat: 1.3, lon: 103.8 };
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        GeocodeInfo: [
          {
            BUILDINGNAME: "FAR TOWER",
            BLOCK: "99",
            ROAD: "FAR ROAD",
            POSTALCODE: "111111",
            LATITUDE: "1.31", // ~1.1km away
            LONGITUDE: "103.8",
          },
          {
            BUILDINGNAME: "NEAR TOWER",
            BLOCK: "1",
            ROAD: "NEAR ROAD",
            POSTALCODE: "222222",
            LATITUDE: "1.3001", // ~11m away
            LONGITUDE: "103.8",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await reverseGeocode(coords);
    expect(r).not.toBeNull();
    expect(r?.buildingName).toBe("NEAR TOWER");
    expect(r?.block).toBe("1");
    expect(r?.road).toBe("NEAR ROAD");
    expect(r?.postalCode).toBe("222222");
    expect(r?.lat).toBe(1.3001);
    expect(r?.lon).toBe(103.8);
    // The nearest result should be a small distance, definitely under the farther one.
    expect(r?.distanceMeters).toBeGreaterThan(0);
    expect(r?.distanceMeters).toBeLessThan(50);
  });

  it("trims address fields and skips entries with bad coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          GeocodeInfo: [
            {
              BUILDINGNAME: "  PADDED NAME  ",
              BLOCK: " 5 ",
              ROAD: " ORCHARD ROAD ",
              POSTALCODE: " 238888 ",
              LATITUDE: "not-a-number",
              LONGITUDE: "103.8",
            },
            {
              BUILDINGNAME: "  REAL ONE  ",
              BLOCK: " 7 ",
              ROAD: " REAL ROAD ",
              POSTALCODE: " 555555 ",
              LATITUDE: "1.3001",
              LONGITUDE: "103.8",
            },
          ],
        }),
      ),
    );

    const r = await reverseGeocode({ lat: 1.3, lon: 103.8 });
    expect(r?.buildingName).toBe("REAL ONE");
    expect(r?.block).toBe("7");
    expect(r?.road).toBe("REAL ROAD");
    expect(r?.postalCode).toBe("555555");
  });

  it("strips OneMap 'NIL' placeholders so they never leak into the address", async () => {
    // OneMap returns the literal "NIL" for missing fields; it must be treated
    // as absent, not rendered as "Blk NIL NIL · NIL · ...".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          GeocodeInfo: [
            {
              BUILDINGNAME: "NIL",
              BLOCK: "NIL",
              ROAD: "NIL",
              POSTALCODE: "NIL",
              LATITUDE: "1.3001",
              LONGITUDE: "103.8",
            },
          ],
        }),
      ),
    );

    const r = await reverseGeocode({ lat: 1.3, lon: 103.8 });
    expect(r).not.toBeNull();
    expect(r?.buildingName).toBe("");
    expect(r?.block).toBe("");
    expect(r?.road).toBe("");
    expect(r?.postalCode).toBe("");
    // A fully-NIL result formats to an empty string — never the word "NIL".
    expect(formatRevGeocodeAddress(r!)).toBe("");
  });

  it("returns null for an empty GeocodeInfo list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ GeocodeInfo: [] })),
    );
    expect(await reverseGeocode({ lat: 1.3, lon: 103.8 })).toBeNull();
  });

  it("returns null when GeocodeInfo is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    expect(await reverseGeocode({ lat: 1.3, lon: 103.8 })).toBeNull();
  });

  it("returns null when every entry has bad coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          GeocodeInfo: [
            { BUILDINGNAME: "X", LATITUDE: "not-a-number", LONGITUDE: "nope" },
          ],
        }),
      ),
    );
    expect(await reverseGeocode({ lat: 1.3, lon: 103.8 })).toBeNull();
  });

  it("returns null on a non-ok response (no throw)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 503)),
    );
    await expect(reverseGeocode({ lat: 1.3, lon: 103.8 })).resolves.toBeNull();
  });

  it("returns null when fetch rejects (network error, no throw)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(reverseGeocode({ lat: 1.3, lon: 103.8 })).resolves.toBeNull();
  });

  it("sends Authorization + the revgeocode params", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ GeocodeInfo: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await reverseGeocode({ lat: 1.3, lon: 103.8 }, 120);
    const [reqUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(String(reqUrl));
    expect(url.pathname).toBe("/api/public/revgeocode");
    expect(url.searchParams.get("location")).toBe("1.3,103.8");
    expect(url.searchParams.get("buffer")).toBe("120");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "static-token",
    });
  });
});

describe("reverseGeocode — no token", () => {
  it("returns null and never calls fetch when no token is configured", async () => {
    vi.stubEnv("ONEMAP_TOKEN", "");
    vi.stubEnv("ONEMAP_EMAIL", "");
    vi.stubEnv("ONEMAP_PASSWORD", "");
    const fetchMock = vi.fn(async () => jsonResponse({ GeocodeInfo: [] }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await reverseGeocode({ lat: 1.3, lon: 103.8 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// formatRevGeocodeAddress (pure helper)
// ---------------------------------------------------------------------------
describe("formatRevGeocodeAddress", () => {
  const base: OneMapRevGeocodeResult = {
    buildingName: "",
    block: "",
    road: "",
    postalCode: "",
    lat: 1.3,
    lon: 103.8,
    distanceMeters: 0,
  };

  it("formats block + road + building + postal", async () => {
    const { formatRevGeocodeAddress } = await import("./onemap");
    const out = formatRevGeocodeAddress({
      ...base,
      block: "12",
      road: "MAXWELL RD",
      buildingName: "TG PAGAR",
      postalCode: "069111",
    });
    expect(out).toBe("Blk 12 MAXWELL RD · TG PAGAR · S069111");
  });

  it('omits a "NIL" postal code', async () => {
    const { formatRevGeocodeAddress } = await import("./onemap");
    const out = formatRevGeocodeAddress({
      ...base,
      road: "ORCHARD RD",
      postalCode: "NIL",
    });
    expect(out).toBe("ORCHARD RD");
  });

  it("does not duplicate building name when it equals the first part", async () => {
    const { formatRevGeocodeAddress } = await import("./onemap");
    const out = formatRevGeocodeAddress({
      ...base,
      buildingName: "SOLO BUILDING",
    });
    expect(out).toBe("SOLO BUILDING");
  });
});

// ---------------------------------------------------------------------------
// Token lifecycle (email + password) — fetch, cache, reuse, refresh.
//
// Module-level cache lives in onemap.ts. We reset modules per test so each gets
// a clean cache, and observe the active token via the Authorization header the
// module attaches to its OneMap requests.
// ---------------------------------------------------------------------------
describe("token lifecycle (email + password)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ONEMAP_EMAIL", "bot@fengshuiai.sg");
    vi.stubEnv("ONEMAP_PASSWORD", "s3cret");
    vi.stubEnv("ONEMAP_TOKEN", "");
  });

  /** Build a fetch mock that answers token requests and search requests. */
  function makeFetch(tokens: Array<{ token: string; expirySec: number }>) {
    let tokenCall = 0;
    return vi.fn(async (input: unknown) => {
      const u = String(input);
      if (u.includes("/api/auth/post/getToken")) {
        const t = tokens[Math.min(tokenCall, tokens.length - 1)];
        tokenCall += 1;
        return jsonResponse({
          access_token: t.token,
          expiry_timestamp: String(t.expirySec),
        });
      }
      // search endpoint
      return jsonResponse({ results: [] });
    });
  }

  it("fetches a token, then attaches it to a search request", async () => {
    const future = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;
    const fetchMock = makeFetch([{ token: "TOK-A", expirySec: future }]);
    vi.stubGlobal("fetch", fetchMock);

    const { searchAddress: search } = await import("./onemap");
    await search("orchard");

    const tokenCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("getToken"),
    );
    expect(tokenCalls).toHaveLength(1);

    const searchCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/elastic/search"),
    );
    expect((searchCall?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "TOK-A",
    });
  });

  it("caches the token and REUSES it within expiry (only one getToken fetch)", async () => {
    const future = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;
    const fetchMock = makeFetch([
      { token: "TOK-A", expirySec: future },
      { token: "TOK-B", expirySec: future },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { searchAddress: search } = await import("./onemap");
    await search("orchard");
    await search("raffles");
    await search("changi");

    const tokenCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("getToken"),
    );
    expect(tokenCalls).toHaveLength(1);

    // Every search reuses the FIRST token.
    const searchCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/elastic/search"),
    );
    expect(searchCalls).toHaveLength(3);
    for (const c of searchCalls) {
      expect((c[1] as RequestInit).headers).toMatchObject({
        Authorization: "TOK-A",
      });
    }
  });

  it("REFRESHES the token once the cached one is (near) expired", async () => {
    // First token already past the 60s refresh window → must refresh on the
    // second call. expiry = now (so now >= expiresAt - 60s triggers refresh).
    const nowSec = Math.floor(Date.now() / 1000);
    const fetchMock = makeFetch([
      { token: "TOK-OLD", expirySec: nowSec }, // expires "now"
      { token: "TOK-NEW", expirySec: nowSec + 3 * 24 * 60 * 60 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { searchAddress: search } = await import("./onemap");
    await search("first"); // fetches TOK-OLD
    await search("second"); // TOK-OLD within 60s of expiry → refresh to TOK-NEW

    const tokenCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("getToken"),
    );
    expect(tokenCalls).toHaveLength(2);

    const searchCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/elastic/search"),
    );
    expect((searchCalls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "TOK-OLD",
    });
    expect((searchCalls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: "TOK-NEW",
    });
  });

  it("falls back to the static ONEMAP_TOKEN when the credential fetch fails (non-ok)", async () => {
    vi.stubEnv("ONEMAP_TOKEN", "STATIC-FALLBACK");
    const fetchMock = vi.fn(async (input: unknown) => {
      const u = String(input);
      if (u.includes("/api/auth/post/getToken")) {
        return jsonResponse({ error: "bad creds" }, 401);
      }
      return jsonResponse({ results: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchAddress: search } = await import("./onemap");
    await search("orchard");

    const searchCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/elastic/search"),
    );
    expect((searchCall?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "STATIC-FALLBACK",
    });
  });

  it("falls back to the static ONEMAP_TOKEN when the token fetch throws", async () => {
    vi.stubEnv("ONEMAP_TOKEN", "STATIC-FALLBACK");
    const fetchMock = vi.fn(async (input: unknown) => {
      const u = String(input);
      if (u.includes("/api/auth/post/getToken")) {
        throw new Error("network down");
      }
      return jsonResponse({ results: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchAddress: search } = await import("./onemap");
    await search("orchard");

    const searchCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/elastic/search"),
    );
    expect((searchCall?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "STATIC-FALLBACK",
    });
  });

  it("posts email + password to the getToken endpoint", async () => {
    const future = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;
    const fetchMock = makeFetch([{ token: "TOK-A", expirySec: future }]);
    vi.stubGlobal("fetch", fetchMock);

    const { searchAddress: search } = await import("./onemap");
    await search("orchard");

    const tokenCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("getToken"),
    );
    const init = tokenCall?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "bot@fengshuiai.sg",
      password: "s3cret",
    });
  });
});
