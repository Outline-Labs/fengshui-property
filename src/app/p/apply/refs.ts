// Agent-onboarding invite codes — the vetting gate. Loaded from the
// PARTNER_INVITE_CODES env var (comma-separated, high-entropy) so they are
// never committed to source and can be rotated without a deploy. Fails CLOSED:
// if unconfigured, no code is valid.
function validCodes(): Set<string> {
  return new Set(
    (process.env.PARTNER_INVITE_CODES ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isValidRef(ref: string | null | undefined): boolean {
  if (!ref) return false;
  const codes = validCodes();
  if (codes.size === 0) return false;
  return codes.has(ref.trim().toLowerCase());
}
