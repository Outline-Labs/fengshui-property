import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "./email";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmail — dev fallback (no RESEND_API_KEY)", () => {
  it("logs the message and returns {ok:true} WITHOUT calling fetch", async () => {
    // Ensure no key is present (setup.ts does not set one, but be explicit).
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendEmail(
      "user@example.com",
      "Welcome",
      "Hello there",
    );

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    // The dev log includes the recipient, subject, and body.
    expect(logSpy).toHaveBeenCalledWith(
      "[email dev] → user@example.com\nSubject: Welcome\nHello there",
    );
  });
});

describe("sendEmail — Resend API (RESEND_API_KEY set)", () => {
  it("POSTs to the Resend endpoint with the right headers and body, and returns ok=true on res.ok", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_123");
    // No EMAIL_FROM → falls back to the canonical default sender.
    vi.stubEnv("EMAIL_FROM", "");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(
      "lead@example.com",
      "Your Fengshui Report",
      "Body text",
    );

    expect(result).toEqual({ ok: true });
    expect(logSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer re_test_key_123",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({
      from: "Fengshui AI <noreply@fengshuiai.sg>",
      to: "lead@example.com",
      subject: "Your Fengshui Report",
      text: "Body text",
    });
  });

  it("uses a custom EMAIL_FROM sender when provided", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_123");
    vi.stubEnv("EMAIL_FROM", "Partners <partners@fengshuiai.sg>");

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail("a@b.com", "Subj", "Body");

    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).from).toBe(
      "Partners <partners@fengshuiai.sg>",
    );
  });

  it("returns ok=false when the Resend response is not ok (e.g. 422)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_123");

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail("a@b.com", "Subj", "Body");

    expect(result).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns ok=false when fetch rejects (network error)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_123");

    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail("a@b.com", "Subj", "Body");

    expect(result).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
