# El Solar Timbero — RSVP MVP

One public RSVP experience for **October 12, 2026, 8–11:30 PM, America/New_York**, at Guantanamera, 939 8th Ave, New York, NY 10019. Free admission.

## Local development

Use Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. The project URL may be public; the service role key must never have a `NEXT_PUBLIC_` prefix. The client in `src/lib/supabase/server.ts` uses `server-only` to prevent Client Component imports and throws an explicit error naming any missing variable when called. With no database credentials, the landing page renders but submissions correctly return an error.

## Database

Apply the migrations in `supabase/migrations/` in timestamp order to the intended Supabase project, including `20261002202858_add_rsvp_rate_limiting.sql`, before deploying the app. The initial migration creates `public.rsvps`, enables RLS, revokes public access, and grants `service_role` only INSERT on RSVPs. There are no browser policies and no visitor accounts. Dashboard access remains available to the owner for viewing/exporting RSVPs.

The unique constraint is `(event_slug, phone)`. The server supplies `cuban-night-social-2026-10-12` from trusted configuration, and stores phone numbers in E.164 format. The same phone can RSVP to another event, but only once per event. Emails are normalized and are not unique. No events table is required; future event slugs must be explicitly configured on the server, not accepted from browser input.

The application never determines gift-card eligibility or generates QR codes. It records `gift_card_disclaimer_accepted` (required true, with no default), `disclaimer_version`, and the database-generated submission time. `src/lib/rsvp.ts` and the migration preserve the launch wording. If the disclosure changes, preserve the old wording in version control and use a new server-supplied version; existing records retain their original version.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` exercises runtime validation and runs the actual migrations in embedded PostgreSQL (PGlite) to check constraints, rate-limit counts/expiry, and role permissions. It also checks trusted IP handling, forged fields, honeypot hits, and blocking inserts during limiter outages. Browser tests run the production build against a **local test HTTP service**, not a hosted Supabase project. They cover mobile/desktop layouts, validation, success, phone duplicates, failure/retry, rate-limit messages, and preserving inputs. A production Supabase submission, rate-limit RPC check, and Data API permission smoke test are still required after setup.

Before browser tests, build with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 npm run build` so Next.js embeds the test service URL. Public environment variables are set at build time; rebuild with the hosted URL for deployment. The test runner supplies a placeholder service role key at runtime.

For Macs where Playwright's bundled Chromium is unsupported, use an installed Chrome:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:e2e
```

The production build uses Next.js's supported Webpack option because Turbopack's internal worker port failed in this local environment. For the same issue during development, run `npm run dev -- --webpack`. `next/font/google` needs build-time network access; fonts are served locally to visitors.

## Deploy to Vercel

See [the deployment walkthrough](docs/deployment.md) for GitHub Actions, protecting `main`, Vercel settings, `elsolartimbero.com` DNS, launch checks, and rollback. GitHub Actions runs validation; Vercel's Git integration deploys production after a checked PR is merged into protected `main`. Set the required `ci` check in GitHub; the workflow alone does not block Vercel deployments.

1. Use the Next.js preset and Node.js 22.x (also declared in `package.json` and `.nvmrc`). Install from the committed lockfile using `npm ci`.
2. Apply both migrations to the intended Supabase project before deploying the updated application. Submissions are blocked if the rate-limit RPC is unavailable.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep the service role key server-only. Configure preview and production deliberately; prefer an isolated database for preview testing.
4. Set `SITE_URL` to the canonical HTTPS site URL. Without it, metadata uses Vercel's production URL, falling back to localhost only in local development.
5. Deploy, then test one new RSVP, a repeat with the same phone in another format, invalid fields, and unchecked acknowledgment. Confirm only one row was saved.
6. Verify a publishable/anonymous API key cannot read or insert RSVPs. Check phone usability and keyboard behavior on an actual phone/Instagram browser, and inspect the link preview before sharing.

There is no custom admin UI. Review RSVPs in the Supabase dashboard. No confirmation email/SMS is sent; confirmation is on-screen and updates are on Instagram.

## Architecture

- `src/app/page.tsx` is the Server Component that composes the page. Reusable UI lives in `src/components`, with PascalCase filenames matching component names. Next.js route files retain their required lowercase names.
- `RsvpExperience.tsx` is the client entry point for submission state, pending state, result switching, and focus management. Server-rendered hero, brand panel, and results are passed as React slots.
- `RsvpForm.tsx` owns the controlled input values and field markup. It is imported within that client boundary. It receives the existing action, response, and error-summary ref; it does not access the database.
- `actions.ts` is a public Server Action. It validates explicit input fields, normalizes contacts, adds the trusted disclosure version, inserts once, and returns only a status or safe field errors.
- The browser cannot write directly to Supabase. The server-only client has a bounded request timeout. No personal details or database credentials are logged.
- A database unique constraint detects duplicates atomically. An insert is never an upsert, so anonymous callers cannot overwrite an existing RSVP.
- Success and duplicate views stay at `/` and appear only following server responses; personal information never enters URLs or local storage.

### Where to make UI changes

| Area | Component files in `src/components` |
| --- | --- |
| Header and footer | `layout/SiteHeader.tsx`, `layout/SiteFooter.tsx` |
| Hero artwork and title | `event/EventHero.tsx` |
| Date, time, and venue shared by all views | `event/EventDetails.tsx` |
| Conga artwork and cultural text | `event/BrandPanel.tsx` |
| Form fields and error markup | `rsvp/RsvpForm.tsx` |
| Submission flow and focus | `rsvp/RsvpExperience.tsx` |
| Success and duplicate presentation | `rsvp/RsvpResult.tsx` |
| Repeated Instagram CTA | `shared/InstagramLink.tsx` |

Component styling lives in Tailwind classes alongside its markup, including responsive and interaction states. `src/app/globals.css` contains Tailwind setup, shared theme tokens/responsive variants, base accessibility styles, and the reusable print treatments: `paper-surface`, `print-ink`, `print-ink-text`, and `print-brush`. The brush treatment masks only its background pseudo-element, preserving text, hit areas, and focus outlines. `--print-color` sets its ink color. Three small SVGs provide paper grain, ink wear, and the brush edge; large artwork stays in responsive Next.js Images. Only the hero-specific scenic fade remains in `EventHero.module.css`. Event details retain `event-date`, `event-time`, and `event-location` names; the `variant` prop controls hero/result layout without parent selectors reaching into the component. Keep authoritative event/disclaimer values in the existing server flow, not in component props submitted by the browser.

Server-enforced rate limiting uses atomic Postgres counters shared across instances: 100 attempts per minute overall, 10 attempts per IP per 10 minutes, and 5 attempts per normalized phone/event per 15 minutes. Global and IP checks run before validation and honeypot checks, so malformed requests and basic bots consume their allowance too. Phone limits apply before every insert, including duplicates and retries after database errors. Windows start with the first attempt; blocked requests do not extend them. Visitors receive a rounded-up retry wait and retain their form details. Limits are fixed in the migration's function; tune them with a new migration as traffic warrants. The overall cap can temporarily affect all visitors during a flood, and shared networks share an IP allowance.

Counters live in `rsvp_private.rsvp_rate_limits` with RLS and no browser access. The public RPC is `SECURITY INVOKER` and executable only by `service_role`. Counter permissions do not expand RSVP permissions. Keys are HMAC-SHA256 hashes using the server-only service role key, separated by scope; raw IPs/phones are not stored in the counter table. Rotating that key resets counter identities. Indexed, bounded cleanup removes counters expired more than a day ago during subsequent requests; an idle site can retain old hashes until requests resume. There is no memory-only fallback: limiter errors block inserts.

On Vercel, the server reads `x-vercel-forwarded-for` only when `VERCEL=1` is set by the platform. On another host, configure `RSVP_TRUSTED_IP_HEADER` only after ensuring your trusted reverse proxy overwrites that header and the origin cannot be accessed directly. Missing, invalid, or multi-IP values use one shared `unknown` bucket instead of trusting spoofable client headers. Direct local development and browser tests use that shared bucket. Keep `VERCEL` unset outside Vercel. See [Vercel request headers](https://vercel.com/docs/headers/request-headers).

The honeypot rejects populated fields, including repeated values. The form disables controls while pending, and the database unique constraint prevents concurrent requests from creating duplicate RSVPs or overwriting existing ones. Rate limits reduce automated spam but do not prove phone ownership or stop distributed bots submitting below the limits. Hosting firewall/bot protection can reject flood traffic before it reaches the application/database. The explicit duplicate response can reveal whether a supplied phone is on the list; it reveals no saved contact details. Monitor submission failures and do not treat format validation as phone/email ownership verification.
