import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "fs_session";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

function sign(value: string): string {
  const sig = crypto
    .createHmac("sha256", secret())
    .update(value)
    .digest("base64url");
  return `${value}.${sig}`;
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto
    .createHmac("sha256", secret())
    .update(value)
    .digest("base64url");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  return value;
}

export async function createSession(leadId: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, sign(leadId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getLeadId(): Promise<string | null> {
  const c = await cookies();
  const raw = c.get(COOKIE)?.value;
  return raw ? unsign(raw) : null;
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}
