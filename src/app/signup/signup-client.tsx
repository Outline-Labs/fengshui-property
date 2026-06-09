"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { MAX_QUOTA, computeQuota } from "@/lib/quota";

import { signup } from "./actions";

type Initial = {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  propertyInterest?: string | null;
  timeline?: string | null;
};

const TIMELINES = [
  "Within 3 months",
  "3–6 months",
  "6–12 months",
  "Just exploring",
];

// Existing leads store one "First Last" string; split it back into the two
// fields (everything after the first token is the last name).
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

export function SignupClient({
  next,
  error,
  initial,
  returning,
  refCode,
}: {
  next?: string;
  error?: string;
  initial?: Initial;
  returning?: boolean;
  refCode?: string;
}) {
  const initialName = splitName(initial?.name ?? "");
  const [firstName, setFirstName] = useState(initialName.first);
  const [lastName, setLastName] = useState(initialName.last);
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [propertyInterest, setPropertyInterest] = useState(
    initial?.propertyInterest ?? "",
  );
  const [timeline, setTimeline] = useState(initial?.timeline ?? "");

  // First + last name are mandatory; the phone +1 is earned after signup via
  // OTP on /upload, so the preview reflects only the base + the intent tier
  // (a buying timeline AND a property of interest, together).
  const quota = computeQuota({ timeline, propertyInterest });

  return (
    <main className="flex-1 px-6 sm:px-10 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
          {returning ? "Your profile" : "Free account"}
        </div>
        <h1 className="font-display text-4xl sm:text-5xl leading-[0.98] tracking-[-0.02em]">
          {returning ? (
            <>
              Unlock <em className="text-cinnabar italic font-normal">more readings.</em>
            </>
          ) : (
            <>
              A few details, a few{" "}
              <em className="text-cinnabar italic font-normal">free readings.</em>
            </>
          )}
        </h1>
        <p className="mt-5 text-ink-soft leading-relaxed max-w-lg">
          Verify your email to unlock your first free unit-level reading. The
          more we know about what you&rsquo;re looking for, the more readings we
          open up — up to three.
        </p>

        {refCode && !returning && (
          <div className="border border-jade bg-jade/10 px-5 py-3 mt-6 text-sm text-ink-soft">
            <span className="text-jade">●</span> A friend invited you — you&rsquo;ll
            both get a bonus reading once you&rsquo;ve read your first unit.
          </div>
        )}

        <QuotaMeter quota={quota} />

        <p className="text-sm text-muted mt-4">
          Already have an account?{" "}
          <a href="/login" className="text-cinnabar hover:underline">
            Log in
          </a>
        </p>

        {error === "email" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mt-6 text-sm">
            That email looks incomplete — please check it.
          </div>
        )}

        {error === "ratelimited" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mt-6 text-sm">
            Too many sign-up attempts from your network — please wait a few
            minutes and try again.
          </div>
        )}

        {error === "name" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mt-6 text-sm">
            Please enter both your first and last name.
          </div>
        )}

        <form action={signup} className="mt-8 space-y-8">
          {next && <input type="hidden" name="next" value={next} />}
          {refCode && <input type="hidden" name="ref" value={refCode} />}

          <Field label="Email" cn="电邮" required>
            <input
              name="email"
              type="email"
              required
              defaultValue={initial?.email ?? ""}
              readOnly={returning}
              placeholder="you@somewhere.sg"
              className="w-full bg-transparent border-b-2 border-ink focus:border-cinnabar transition-colors py-2 text-base placeholder:text-muted focus:outline-none read-only:text-muted"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <Field label="First name" cn="名" required>
              <input
                name="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="e.g. Wei"
                className="w-full bg-transparent border-b-2 border-ink focus:border-cinnabar transition-colors py-2 text-base placeholder:text-muted focus:outline-none"
              />
            </Field>

            <Field label="Last name" cn="姓" required>
              <input
                name="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="e.g. Tan"
                className="w-full bg-transparent border-b-2 border-ink focus:border-cinnabar transition-colors py-2 text-base placeholder:text-muted focus:outline-none"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <Field label="Phone / WhatsApp" cn="联络" hint="Verify after signup for +1">
              <input
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional · +65 8xxx xxxx"
                className="w-full bg-transparent border-b-2 border-line focus:border-cinnabar transition-colors py-2 text-base placeholder:text-muted focus:outline-none"
              />
            </Field>

            <Field label="Buying timeline" cn="时间" hint="Unlocks +1 with a property">
              <select
                name="timeline"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                className="w-full bg-transparent border-b-2 border-line focus:border-cinnabar transition-colors py-2 text-base focus:outline-none text-ink"
              >
                <option value="">Optional</option>
                {TIMELINES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Property of interest" cn="目标房产" hint="Unlocks +1 with a timeline">
            <input
              name="propertyInterest"
              value={propertyInterest}
              onChange={(e) => setPropertyInterest(e.target.value)}
              placeholder="Optional · area, block, or condo"
              className="w-full bg-transparent border-b-2 border-line focus:border-cinnabar transition-colors py-2 text-base placeholder:text-muted focus:outline-none"
            />
          </Field>

          <div className="pt-2">
            <SubmitButton returning={returning} />
            <p className="text-[10px] tracking-wide text-muted mt-5 max-w-md leading-relaxed">
              By continuing you agree we may contact you about your readings and
              your interest. See our privacy policy.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

// Reads the form's pending state (useFormStatus must live in a child of the
// <form>). While the signup action runs, the button is disabled and shows a
// spinner — so a double-tap can't submit twice (and re-send the verification
// email / re-create the session).
function SubmitButton({ returning }: { returning?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="font-display text-xl text-cinnabar inline-flex items-center gap-2 transition-transform hover:translate-x-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-x-0"
    >
      {pending
        ? returning
          ? "Saving…"
          : "Creating account…"
        : returning
          ? "Save & continue"
          : "Create account"}{" "}
      {pending ? (
        <span
          aria-hidden
          className="inline-block h-[1.1em] w-[1.1em] animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        <span aria-hidden>→</span>
      )}
    </button>
  );
}

function QuotaMeter({ quota }: { quota: number }) {
  return (
    <div className="mt-8 border-t border-line pt-5">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] tracking-[0.3em] uppercase text-muted">
          Free readings unlocked
        </span>
        <span className="numeral text-2xl text-cinnabar">
          {quota}
          <span className="text-muted text-base"> / {MAX_QUOTA}</span>
        </span>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: MAX_QUOTA }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 transition-colors ${
              i < quota ? "bg-cinnabar" : "bg-line"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  cn,
  required,
  hint,
  children,
}: {
  label: string;
  cn: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] tracking-[0.3em] uppercase text-muted">
          {label}
          {required && <span className="text-cinnabar ml-1">*</span>}
        </span>
        <span className="font-cn text-sm text-muted/70">{cn}</span>
      </div>
      {children}
      {hint && <p className="text-[10px] tracking-wide text-jade mt-1.5">{hint}</p>}
    </label>
  );
}
