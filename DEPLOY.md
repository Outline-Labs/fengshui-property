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
| `SESSION_SECRET` | **Yes** | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Never reuse the dev value. |
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
| `PARTNERS_ENABLED` | No | Agent-surface kill switch. **Leave UNSET in production** (consumer-only v1 → surface off). Set `true` to enable the dashboard on a deploy. |
| `ONEMAP_TOKEN` | No | Static-token fallback; only used if email/password are unset |
| `DATA_GOV_SG_API_KEY`, `LTA_ACCOUNT_KEY` | No | Offline `pnpm data:pois` only — POIs are baked into `data/pois.json` |

**Required = the build/app won't work without it.** **Launch = the app boots
(dev-style logging) but the business can't run:** no Twilio ⇒ no OTP SMS ⇒ no
verifiable/sellable leads; no Resend ⇒ agents can't receive sign-in links.

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
- [ ] A newly OTP-verified lead appears in the dashboard's available leads; claiming it works.

---

## Known gaps before real traffic
- **Billing not built.** Claims record S$88 but no money moves. Planned model: agent wallet / pre-fund (Stripe). Webhooks need this public URL — do it right after the domains resolve.
- **Legal pages are drafts.** `/privacy` `/terms` `/pdpa` need a SG lawyer + the real operating-entity name (brand "Fengshui AI" is a placeholder).
- **SEO.** No `sitemap.xml`/`robots.txt` yet — add once the programmatic content pages exist (keep `partners.` out of the sitemap).
