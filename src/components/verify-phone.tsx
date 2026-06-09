"use client";

import posthog from "posthog-js";
import { useState } from "react";

import { confirmPhoneOtp, requestPhoneOtp } from "@/app/upload/actions";

// Consumer phone verification — verifying unlocks +1 free reading (the quota
// bonus is gated on a verified phone). No agent involved; never sets wantsAgent.
export function VerifyPhone({ initialPhone }: { initialPhone: string | null }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setErr(null);
    const r = await requestPhoneOtp(phone);
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
    const r = await confirmPhoneOtp(code);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    posthog.capture("phone_verified");
    // Reload so the +1 reading the verified phone unlocks shows immediately.
    window.location.reload();
  };

  return (
    <section className="border border-jade/40 bg-jade/5 px-5 py-5">
      <div className="text-[10px] tracking-[0.3em] uppercase text-jade mb-2">
        +1 free reading · 验证
      </div>
      <p className="font-display text-lg leading-snug mb-1">
        Verify your phone, unlock another reading.
      </p>
      <p className="text-sm text-ink-soft mb-4 max-w-sm">
        We text a one-time code to confirm it&rsquo;s really you — no spam.
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
            {devCode && (
              <span className="text-cinnabar">dev code: {devCode}</span>
            )}
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
    </section>
  );
}
