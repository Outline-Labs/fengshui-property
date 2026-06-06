"use client";

import posthog from "posthog-js";
import { useState } from "react";

import { confirmSpecialist, requestSpecialistOtp } from "@/app/upload/actions";

export function TalkToSpecialist({
  requested,
  initialPhone,
}: {
  requested: boolean;
  initialPhone: string | null;
}) {
  const [done, setDone] = useState(requested);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    return (
      <section className="border-t border-jade pt-6">
        <div className="text-[10px] tracking-[0.35em] uppercase text-jade mb-2">
          Specialist requested
        </div>
        <p className="font-display text-xl leading-snug">
          A vetted local specialist will reach out shortly.
        </p>
        <p className="text-sm text-ink-soft mt-2">
          Your number is verified and your interest has been shared with a
          CEA-licensed agent in your area.
        </p>
      </section>
    );
  }

  const sendCode = async () => {
    setBusy(true);
    setErr(null);
    const r = await requestSpecialistOtp(phone);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setDevCode(r.devCode ?? null);
    setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setErr(null);
    const r = await confirmSpecialist(code);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setDone(true);
    posthog.capture("specialist_contact_requested");
  };

  return (
    <section className="border-t border-cinnabar pt-6">
      <div className="text-[10px] tracking-[0.35em] uppercase text-cinnabar mb-2">
        Want help with this unit?
      </div>
      <p className="font-display text-xl leading-snug mb-3">
        Talk to a local specialist — free.
      </p>
      <p className="text-sm text-ink-soft mb-5 max-w-sm">
        A CEA-licensed agent who knows the area and respects fengshui. We verify
        your number so only you can make this request.
      </p>

      {step === "phone" ? (
        <div className="flex border-b-2 border-ink max-w-sm">
          <span className="py-2 text-base text-muted">+65</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="8xxx xxxx"
            inputMode="numeric"
            className="flex-1 bg-transparent py-2 pl-2 text-base placeholder:text-muted focus:outline-none"
          />
          <button
            onClick={sendCode}
            disabled={busy}
            className="font-display text-lg text-cinnabar px-2 disabled:opacity-40 whitespace-nowrap"
          >
            {busy ? "…" : "Send code →"}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted mb-2">
            Code sent to +65 {phone}.{" "}
            {devCode && <span className="text-cinnabar">dev code: {devCode}</span>}
          </p>
          <div className="flex border-b-2 border-ink max-w-xs">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              className="flex-1 bg-transparent py-2 text-base tracking-[0.4em] placeholder:text-muted placeholder:tracking-normal focus:outline-none"
            />
            <button
              onClick={verify}
              disabled={busy}
              className="font-display text-lg text-cinnabar px-2 disabled:opacity-40"
            >
              {busy ? "…" : "Verify →"}
            </button>
          </div>
          <button
            onClick={() => {
              setStep("phone");
              setCode("");
              setErr(null);
            }}
            className="text-xs text-muted hover:text-cinnabar mt-3"
          >
            ← change number
          </button>
        </div>
      )}

      {err && <p className="text-sm text-cinnabar mt-3">{err}</p>}
      <p className="text-[10px] tracking-wide text-muted mt-4 max-w-sm leading-relaxed">
        By verifying, you consent to be contacted by a matched property agent
        about this property. See our privacy notice.
      </p>
    </section>
  );
}
