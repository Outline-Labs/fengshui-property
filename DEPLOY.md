# Deploying fengshuiai.sg

One Vercel project serves **both** surfaces; the host header decides which
(`src/proxy.ts`):

| Hostname | Surface | Notes |
|---|---|---|
| `fengshuiai.sg` (+ `www`) | Consumer lead-gen site | Indexable. `/p/*` returns 404. |
| `partners.fengshuiai.sg` | Agent dashboard | Rewritten to `/p/*`; `X-Robots-Tag: noindex` on every response. Invite-only. |

> The partner surface is **only** reachable on `partners.fengshuiai.sg`. On the
> raw `*.vercel.app` URL it 404s (treated as the consumer host), so you can't
> smoke-test the dashboard until that subdomain's DNS points at Vercel.

> ⚠️ **First production release is CONSUMER-ONLY.** The agent surface is OFF in
> production by default — every `/p/*` path 404s and the partner host isn't
> routed (`partnersEnabled()` in `src/proxy.ts`). The partner code still ships,
> dormant. Turn it on for a deploy with `PARTNERS_ENABLED=true`. It stays ON
> locally and in tests so the team keeps building it.

---

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production).

| Variable | Required? | Where to get it |
|---|---|---|
| `SESSION_SECRET` | **Yes** | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Never reuse the dev value. **The app now throws in production if this is unset** (rather than silently signing forgeable cookies) — so a missing value fails the deploy loudly. |
| `DATABASE_URL` / `TURSO_DATABASE_URL` | **Yes** | Auto-wired by the Vercel→Turso integration (`libsql://…turso.io`). App reads either name. |
| `DATABASE_AUTH_TOKEN` / `TURSO_AUTH_TOKEN` | **Yes** | Auto-wired alongside the URL. App reads either name. |
| `MOONSHOT_API_KEY` | **Yes** | platform.moonshot.ai — floor-plan vision (Tier 2) |
| `ONEMAP_EMAIL` | **Yes** | OneMap account email — auto-refreshes the token |
| `ONEMAP_PASSWORD` | **Yes** | OneMap account password |
| `TWILIO_ACCOUNT_SID` | Launch | Twilio console |
| `TWILIO_AUTH_TOKEN` | Launch | Twilio console |
| `TWILIO_VERIFY_SERVICE_SID` | Launch | Twilio Verify Service SID (`VA…`) — create a Verify Service in the Console |
| `RESEND_API_KEY` | Launch | resend.com |
| `EMAIL_FROM` | Launch | e.g. `Fengshui AI <noreply@fengshuiai.sg>` (verified Resend domain) |
| `REVOLUT_SECRET_KEY` | Launch | Revolut Merchant API secret key (consumer reading-credit packs). Absent ⇒ dev grants packs instantly; **prod fails closed** (no purchases). |
| `REVOLUT_ENV` | Launch | `sandbox` (default, fail-safe) or `production` — which environment `REVOLUT_SECRET_KEY` belongs to. |
| `REVOLUT_WEBHOOK_SECRET` | Launch | Signing secret of the Revolut `ORDER_COMPLETED` webhook — verifies events at `/api/revolut/webhook` (which credits the readings). |
| `PARTNERS_ENABLED` | No | Agent-surface kill switch. **Leave UNSET in production** (consumer-only v1 → surface off). Set `true` to enable the dashboard on a deploy. |
| `MAX_DAILY_READINGS` | No | Global rolling-24h ceiling on floor-plan (Kimi-billed) reads — a runaway-cost circuit breaker on top of the per-IP firewall limit. Default `2000`; lower it if you see abuse. |
| `CONSUMER_HOSTS` | No | Allowlisted hosts for building the Revolut checkout return URL. Default covers `fengshuiai.sg`, `www.`, and the `*.vercel.app` deploy. |
| `ONEMAP_TOKEN` | No | Static-token fallback; only used if email/password are unset |
| `DATA_GOV_SG_API_KEY`, `LTA_ACCOUNT_KEY` | No | Offline `pnpm data:pois` only — POIs are baked into `data/pois.json` |

**Required = the build/app won't work without it.** **Launch = the app boots
(dev-style logging) but the business can't run:** no Twilio ⇒ no OTP SMS ⇒ no
verifiable/sellable leads; no Resend ⇒ agents can't receive sign-in links; no
Revolut ⇒ consumers can't buy reading credits (purchases fail closed → no
revenue). (Agent wallet top-ups are deferred to v2 and dev-credit only.)

---

## Steps

### 1 — Database (Turso via Vercel Marketplace)
In **Vercel → Storage → Create Database → Turso**, connect it to the project.
Vercel provisions the DB and auto-injects its connection env vars (typically
`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`). The app reads either those or
`DATABASE_URL` + `DATABASE_AUTH_TOKEN`, so no renaming is needed.

No migration step: `ensureSchema()` creates the tables on first query. (CLI
alternative: `turso db create fengshuiai`, then `turso db show --url` and
`turso db tokens create` → set as `DATABASE_URL` / `DATABASE_AUTH_TOKEN`.)

### 2 — Vercel project
- Import the GitHub repo. Framework **Next.js** is auto-detected; build = `next build`, install uses the pinned `pnpm@9`.
- Add the env vars from the table above.
- Deploy.

### 3 — Smoke-test the `*.vercel.app` URL (consumer only)
- `/` loads; `/map` renders tiles and reverse-geocodes a tapped point (confirms OneMap auto-refresh).
- `/signup` → `/upload`: upload a floor plan, get a reading (confirms Moonshot + DB writes).
- `/p/dashboard` → **404** (partner surface is correctly hidden on this host).

### 4 — Custom domains + DNS
Add all three domains in **Vercel → Settings → Domains**: `fengshuiai.sg`,
`www.fengshuiai.sg`, `partners.fengshuiai.sg`. Then create the DNS records Vercel
shows (current defaults):

| Record | Name | Value |
|---|---|---|
| A | `@` (apex) | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |
| CNAME | `partners` | `cname.vercel-dns.com` |

On Cloudflare DNS: set these records to **DNS-only (grey cloud)** so Vercel
issues/manages TLS. If you proxy them (orange cloud), set SSL/TLS mode to
**Full (strict)** to avoid redirect loops. (Cloudflare flattens the apex CNAME if
you prefer a CNAME over the A record.)

### 5 — Post-deploy verification
- [ ] `https://fengshuiai.sg` loads with a valid cert; `www` redirects to apex.
- [ ] Map geocoding works on the live domain (OneMap token auto-refreshed server-side).
- [ ] Full consumer flow: email gate → signup → floor-plan upload → reading → "talk to a specialist" → **real OTP SMS arrives** → verify.
- [ ] `https://fengshuiai.sg/p/dashboard` → 404.
- [ ] `https://partners.fengshuiai.sg/login` → enter an approved agent's email → **magic-link email arrives** → link signs in → `/dashboard`.
- [ ] `curl -sI https://partners.fengshuiai.sg/ | grep -i x-robots-tag` → `noindex, nofollow`.
- [ ] Partner dashboard: top up the wallet (dev-credits instantly — agent billing is deferred to v2) → balance rises; a newly OTP-verified lead appears in available leads, and claiming it debits S$88 and reveals contact.

### 6 — Revolut webhook (billing)
Reading-credit purchases are credited by the webhook, not the browser redirect
(Revolut has a single post-payment redirect, so the return page only announces
"payment received") — so this must be wired up or credits never land. In the
**Revolut Business → Merchant → Webhooks** area (or via the Merchant API), add an
endpoint `https://<host>/api/revolut/webhook` (the live domain at launch; the
`*.vercel.app` host also works, since `/api/*` bypasses the host proxy).
Subscribe to **`ORDER_COMPLETED`** and copy the endpoint's signing secret into
`REVOLUT_WEBHOOK_SECRET`. Test end-to-end against the Revolut **sandbox**
(`REVOLUT_ENV=sandbox`) first, then switch to a live key + `REVOLUT_ENV=production`
before real traffic.

**Prerequisite:** the Merchant module must be enabled on the Revolut Business
account and pass merchant onboarding/KYB before live acquiring works (sandbox
needs no approval).

### 7 — Rate limiting (Vercel Firewall) — **required before public launch**
Each floor-plan reading is a *paid* vision-model call, and signup is email-only
(unverified), so the front door must be throttled or someone can script
throwaway accounts into unbounded Kimi spend. Two layers, both needed:

1. **Per-IP limits — Vercel → Project → Firewall → Configure → add Rate Limit rules:**
   - `POST` to `/upload` (the floor-plan reading Server Action) → e.g. **10 / minute / IP**, action *Deny* (or *Challenge*).
   - `POST` to `/signup` → e.g. **5 / minute / IP**.
   - (Optional) `/map` Server Action POSTs → a looser limit; it's deterministic and unpaid, but caps scraping.
   Tune the numbers to real usage; start strict and relax. Vercel's managed
   ruleset + DDoS protection should also be on.
2. **Global circuit breaker (in code, already shipped):** `MAX_DAILY_READINGS`
   caps total Kimi-billed reads over a rolling 24h, so a distributed burst that
   rotates IPs past the firewall still can't run the bill away. Default 2000.

Also confirm `maxDuration = 60` is honored (set on `/upload`) so slow-but-valid
readings don't 504 at the platform default.

---

## Known gaps before real traffic
- **Billing live (test mode).** Agents pre-fund a wallet via Stripe Checkout; claiming a lead debits it atomically (`src/lib/wallet.ts` + `claimLead`), and the webhook (`/api/stripe/webhook`) credits top-ups idempotently. Before real traffic: switch to **live** Stripe keys and register the live webhook endpoint (step 6). Auto-reload (saved card) is deferred to v2; refunds/chargebacks are not yet handled.
- **Legal pages are drafts.** `/privacy` `/terms` `/pdpa` need a SG lawyer + the real operating-entity name (brand "Fengshui AI" is a placeholder).
- **SEO.** No `sitemap.xml`/`robots.txt` yet — add once the programmatic content pages exist (keep `partners.` out of the sitemap).
