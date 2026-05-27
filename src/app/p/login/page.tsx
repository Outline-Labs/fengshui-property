import { agentLogin } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  if (sent === "1") {
    return (
      <main className="flex-1 px-6 sm:px-10 py-20 sm:py-28">
        <div className="mx-auto max-w-md">
          <div className="text-[10px] tracking-[0.35em] uppercase text-jade mb-3">
            Check your email · 查收
          </div>
          <h1 className="font-display text-4xl sm:text-5xl leading-[0.95] tracking-[-0.02em] mb-6">
            Link <em className="text-cinnabar italic font-normal">sent.</em>
          </h1>
          <p className="text-bg/75 leading-relaxed text-sm">
            If that email belongs to an approved partner, a one-time sign-in
            link is on its way. It expires in 15 minutes.
          </p>
          <p className="mt-10 text-xs">
            <a href="/login" className="text-cinnabar">
              ← Use a different email
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 sm:px-10 py-20 sm:py-28">
      <div className="mx-auto max-w-md">
        <div className="text-[10px] tracking-[0.35em] uppercase text-bg/50 mb-3">
          Sign in · 签到
        </div>
        <h1 className="font-display text-4xl sm:text-5xl leading-[0.95] tracking-[-0.02em] mb-6">
          Welcome <em className="text-cinnabar italic font-normal">back.</em>
        </h1>
        <p className="text-bg/75 leading-relaxed mb-8 text-sm">
          Enter your registered email and we&rsquo;ll send a one-time sign-in
          link.
        </p>

        {error === "link" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mb-6 text-sm">
            That link is invalid or has expired. Request a fresh one below.
          </div>
        )}
        {error === "email" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mb-6 text-sm">
            That email looks incomplete.
          </div>
        )}

        <form action={agentLogin} className="space-y-8">
          <label className="block">
            <div className="text-[10px] tracking-[0.3em] uppercase text-bg/60 mb-2">
              Agency email
            </div>
            <input
              type="email"
              name="email"
              required
              placeholder="you@agency.sg"
              className="w-full bg-transparent border-b-2 border-bg/30 focus:border-cinnabar transition-colors py-2 text-base placeholder:text-bg/30 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="font-display text-xl text-cinnabar inline-flex items-center gap-2 hover:translate-x-1 transition-transform"
          >
            Email me a sign-in link <span aria-hidden>→</span>
          </button>
        </form>

        <p className="text-[10px] tracking-wide text-bg/40 mt-12">
          New here?{" "}
          <a href="/apply" className="text-cinnabar">
            Apply for access
          </a>{" "}
          · approved once your RES number is verified.
        </p>
      </div>
    </main>
  );
}
