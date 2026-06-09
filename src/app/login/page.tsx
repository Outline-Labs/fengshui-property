import type { Metadata } from "next";

import { SiteMasthead } from "@/components/site-masthead";

import { consumerLogin } from "./actions";

export const metadata: Metadata = {
  title: "Sign in · Fengshui AI",
  description: "Sign in to your Fengshui AI account with a one-time email link.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <>
      <SiteMasthead />
      <main className="flex-1 px-6 sm:px-10 py-20 sm:py-28">
        <div className="mx-auto max-w-md">
          {sent === "1" ? (
            <>
              <div className="text-[10px] tracking-[0.35em] uppercase text-jade mb-3">
                Check your email · 查收
              </div>
              <h1 className="font-display text-4xl sm:text-5xl leading-[0.95] tracking-[-0.02em] mb-6">
                Link <em className="text-cinnabar italic font-normal">sent.</em>
              </h1>
              <p className="text-ink-soft leading-relaxed text-sm">
                If that email has an account, a one-time sign-in link is on its
                way. It expires in 15 minutes.
              </p>
              <p className="mt-10 text-xs">
                <a href="/login" className="text-cinnabar">
                  ← Use a different email
                </a>
              </p>
            </>
          ) : (
            <>
              <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
                Sign in · 签到
              </div>
              <h1 className="font-display text-4xl sm:text-5xl leading-[0.95] tracking-[-0.02em] mb-6">
                Welcome{" "}
                <em className="text-cinnabar italic font-normal">back.</em>
              </h1>
              <p className="text-ink-soft leading-relaxed mb-8 text-sm">
                Enter your email and we&rsquo;ll send a one-time sign-in link —
                no password needed.
              </p>

              {error === "link" && (
                <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mb-6 text-sm">
                  That link is invalid or has expired. Request a fresh one below.
                </div>
              )}
              {error === "email" && (
                <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mb-6 text-sm">
                  That email looks incomplete — please check it.
                </div>
              )}

              <form action={consumerLogin} className="space-y-8">
                <label className="block">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-muted mb-2">
                    Email · 电邮
                  </div>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="you@email.com"
                    className="w-full bg-transparent border-b-2 border-line focus:border-cinnabar transition-colors py-2 text-base placeholder:text-muted focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="font-display text-xl text-cinnabar inline-flex items-center gap-2 hover:translate-x-1 transition-transform"
                >
                  Email me a sign-in link <span aria-hidden>→</span>
                </button>
              </form>

              <p className="text-[10px] tracking-wide text-muted mt-12">
                New here?{" "}
                <a href="/signup" className="text-cinnabar">
                  Create an account
                </a>{" "}
                — it&rsquo;s free.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
