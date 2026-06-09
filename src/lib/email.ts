import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Fengshui AI <noreply@fengshuiai.sg>";

  if (!key) {
    // Dev fallback: log instead of sending.
    console.log(`[email dev] → ${to}\nSubject: ${subject}\n${text}`);
    return { ok: true };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) {
      // Surface the reason rather than silently dropping it. The classic case
      // is a 403 for an unverified sender domain — otherwise invisible because
      // callers treat email as best-effort.
      const detail = await res.text().catch(() => "");
      console.error(
        `[email] Resend rejected send to ${to} (from ${from}): ${res.status} ${detail.slice(0, 400)}`,
      );
    }
    return { ok: res.ok };
  } catch (e) {
    console.error(
      `[email] send to ${to} threw: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { ok: false };
  }
}
