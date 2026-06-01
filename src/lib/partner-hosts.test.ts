import { afterEach, describe, expect, it, vi } from "vitest";

import { isPartnerHost, safePartnerHost } from "./partner-hosts";

afterEach(() => vi.unstubAllEnvs());

describe("isPartnerHost (defaults)", () => {
  it("recognises the production + dev partner hosts, ignoring port", () => {
    expect(isPartnerHost("partners.fengshuiai.sg")).toBe(true);
    expect(isPartnerHost("partners.localhost:3000")).toBe(true);
    expect(isPartnerHost("fengshuiai.sg")).toBe(false);
    expect(isPartnerHost("evil.com")).toBe(false);
  });

  it("honours a PARTNER_HOSTS override (e.g. staging)", () => {
    vi.stubEnv("PARTNER_HOSTS", "partners.staging.fengshuiai.sg");
    expect(isPartnerHost("partners.staging.fengshuiai.sg")).toBe(true);
    expect(isPartnerHost("partners.fengshuiai.sg")).toBe(false);
  });
});

describe("safePartnerHost — host-header-injection guard", () => {
  it("echoes an allowed host (preserving port for local dev)", () => {
    expect(safePartnerHost("partners.fengshuiai.sg")).toBe(
      "partners.fengshuiai.sg",
    );
    expect(safePartnerHost("partners.localhost:3000")).toBe(
      "partners.localhost:3000",
    );
  });

  it("falls back to the canonical prod host for a forged/unknown host", () => {
    expect(safePartnerHost("attacker.com")).toBe("partners.fengshuiai.sg");
    expect(safePartnerHost("")).toBe("partners.fengshuiai.sg");
    expect(safePartnerHost(null)).toBe("partners.fengshuiai.sg");
    expect(safePartnerHost("partners.fengshuiai.sg.evil.com")).toBe(
      "partners.fengshuiai.sg",
    );
  });
});
