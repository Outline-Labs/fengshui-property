"use server";

import { headers } from "next/headers";

import { sendMagicLink } from "@/lib/auth-email";
import { analyzeFormSchool } from "@/lib/fengshui/form-school";
import { getLeadByEmail, upsertLead } from "@/lib/leads";
import {
  formatRevGeocodeAddress,
  reverseGeocode,
  searchAddress,
} from "@/lib/onemap";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type {
  Coords,
  FormSchoolAnalysis,
  OneMapSearchResult,
} from "@/lib/types";

export async function searchAddresses(
  query: string,
): Promise<OneMapSearchResult[]> {
  return searchAddress(query, 6);
}

export async function analyzeProperty(
  coords: Coords,
): Promise<FormSchoolAnalysis> {
  const base = analyzeFormSchool(coords);
  const rev = await reverseGeocode(coords);

  if (!rev) return base;

  return {
    ...base,
    address: {
      formatted: formatRevGeocodeAddress(rev),
      block: rev.block || undefined,
      road: rev.road || undefined,
      buildingName: rev.buildingName || undefined,
      postalCode: rev.postalCode || undefined,
    },
  };
}

export type SubmitLeadResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitLead(email: string): Promise<SubmitLeadResult> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "That email looks incomplete." };
  }

  const h = await headers();
  const rl = await rateLimit({
    key: `maplead:${clientIp(h)}`,
    limit: 10,
    windowMs: 600_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: "Too many attempts from your network — please wait a few minutes.",
    };
  }

  try {
    // Never mint a session by typing an email — that would authenticate you as
    // that lead (account/PII takeover). Email a one-time link instead: a login
    // link if the account already exists (without touching their data), or a
    // verify link for a brand-new lead. Clicking it signs them in via
    // /login/verify.
    const existing = await getLeadByEmail(trimmed);
    if (existing) {
      await sendMagicLink({
        email: trimmed,
        leadId: existing.id,
        hostHeader: h.get("host"),
        kind: "login",
      });
    } else {
      const leadId = await upsertLead({ email: trimmed });
      await sendMagicLink({
        email: trimmed,
        leadId,
        hostHeader: h.get("host"),
        kind: "verify",
      });
    }
  } catch {
    return { ok: false, error: "Couldn't send that just now — try again." };
  }

  return { ok: true };
}
