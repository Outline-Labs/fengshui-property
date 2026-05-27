"use server";

import { analyzeFormSchool } from "@/lib/fengshui/form-school";
import { upsertLead } from "@/lib/leads";
import {
  formatRevGeocodeAddress,
  reverseGeocode,
  searchAddress,
} from "@/lib/onemap";
import { createSession } from "@/lib/session";
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

  try {
    const leadId = await upsertLead({ email: trimmed });
    await createSession(leadId);
  } catch {
    return { ok: false, error: "Couldn't save that just now — try again." };
  }

  return { ok: true };
}
