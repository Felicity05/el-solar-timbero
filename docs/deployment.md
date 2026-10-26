# Deploy El Solar Timbero

This guide covers updates to the existing live Next.js site: normalized RSVP, paid tickets, ticket email and staff check-in. It does not require a new Vercel project, new DNS records or recreating existing events/tickets. Preserve sold tickets, their tokens and the existing QR payload.

## Release gate

Use the existing feature branch and a pull request to `main`. GitHub Actions runs lint, typecheck, automated database/application tests, a production dependency audit, a production build and mobile/desktop browser checks. Protect `main` with the required **ci** check. Vercel's Git integration can deploy immediately after a merge; CI running after a direct push is not a release gate.

Run on Node 24.x:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm audit --omit=dev --audit-level=high
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_fixture NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 npm run build
npm run test:e2e
npm run test:local:tickets
```

The last command needs running local Supabase with local migrations applied; it creates and cleans its own fake fixtures and checks concurrent order creation, fulfillment and admission. Browser checks use local mocks, never live payments. The dummy publishable key is for the local browser-test build only; Vercel must build with its real environment variables. Never upload the local `.next` artifact as a production build.

Resolve failing checks before merging; do not bypass the security audit. An October 23, 2026 review found production dependency advisories for Next.js 16.3.8 and Zod 4.6.5. The audit reported fixes in Next.js 16.4.3 and Zod 4.6.6 or later patched versions. This guide does not update packages: review compatible fixes, update the lockfile and rerun all release checks. Always use a fresh audit rather than treating this dated record as a permanent security assessment.

Review `git status` and the staged diff. Include source files, new migrations, dependency manifests and tests. Keep `.env.production`, `.env.development.local`, certificates, test output and credentials out of Git. Preserve intentional manual edits; review unused artwork copies separately instead of staging everything blindly.

## 1. Configure the existing Vercel project

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root | Repository root |
| Production branch | `main` |
| Node.js | 24.x |
| Install | `npm ci` |
| Build | `npm run build` |
| Output | Next.js default |

`package.json`, `.nvmrc`, `vercel.json` and the GitHub workflow define these settings. Keep the current Webpack build option. Check the dashboard for conflicting overrides. Keep the existing production project and domain configuration.

## 2. Set production environment variables

Configure **Vercel → Project → Settings → Environment Variables → Production**. A local `.env.production` file is not evidence that the variables are present in Vercel. Environment changes require a new deployment to take effect. Use sensitive values for private credentials.

| Variable | Production value / purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing hosted Supabase project's HTTPS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Matching server secret/service-role key; never a browser publishable/anon key |
| `SUPABASE_URL` | Optional server URL override; if set, it must point to that same hosted project |
| `SITE_URL` | `https://www.elsolartimbero.com`, the current canonical production origin |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Existing `pk_live_…` key |
| `STRIPE_SECRET_KEY` | Existing live server key (`rk_live_…` restricted key or `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the **LIVE hosted webhook endpoint**, not the CLI listener |
| `STRIPE_LIVE_MODE` | `true`; live payments also require the production runtime |
| `GMAIL_USER` | Sending Gmail address |
| `GMAIL_APP_PASSWORD` | Gmail App Password, never the normal account password |
| `TICKET_EMAIL_FROM` | Optional display name or configured/verified Gmail send-as address |
| `CHECK_IN_PIN` | Privately chosen 6–12 digit door PIN; prefer at least 8 digits |
| `CHECK_IN_EVENT_SLUG` | Exact slug of the existing production ticketed event staff will admit |
| `CHECK_IN_SESSION_SECRET` | Independent random signing secret, at least 32 characters |

Generate the door signing secret locally with `openssl rand -hex 32`, then paste it privately into Vercel. Never prefix any server secret, PIN or event-slug setting with `NEXT_PUBLIC_`. Staff receive the PIN privately; it is not emailed to customers.

The October 23 review found the three `CHECK_IN_*` values missing from local `.env.production`; verify Vercel independently. Do not copy local IPs, local Supabase keys or Stripe sandbox keys into Production. Vercel supplies `VERCEL=1` for trusted IP rate limiting; leave `RSVP_TRUSTED_IP_HEADER` unset on Vercel.

For Preview/staging use separate non-production Supabase data, Stripe test keys, an appropriate HTTPS `SITE_URL`, a test event slug and separate door credentials. Do not give unreviewed preview code production database credentials or use a preview against sold customer tickets.

Sources: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## 3. Apply only pending database migrations before the production code deploys

First verify the linked project is the existing production project and confirm backup/recovery availability. Run the following yourself; these commands are not run automatically by CI or Vercel:

```sh
npx supabase migration list --linked
npx supabase db push --linked --skip-vault --dry-run
```

The read-only remote migration review on October 23, 2026 showed all earlier RSVP/ticket migrations recorded as applied, with only these two pending, in this order:

1. `20261022172251_staff_ticket_check_in.sql`
2. `20261023175438_door_ticket_invalid_reasons.sql`

Review both files. They create/replace restricted staff RPCs; they do not backfill or modify sold tickets, change tokens, or replace QR codes. No direct table CRUD grants are restored. If the dry-run lists additional migrations, investigate before proceeding. Do not rewrite applied migration files, use `db reset` remotely, run local seed files in production or repair migration history simply to hide a mismatch.

The `--skip-vault` flag keeps this release limited to migrations rather than synchronizing unrelated Vault configuration. After reviewing the dry-run, apply the pending migrations yourself:

```sh
npx supabase db push --linked --skip-vault
npx supabase migration list --linked
```

These additive migrations are compatible with the current live application. Apply them **before merging** if merging triggers automatic Vercel deployment. The existing live RSVP/payment flow remains active while the functions are added.

Verify the staff functions and grants in the hosted SQL editor:

```sql
select
  has_function_privilege('service_role', 'public.validate_door_ticket(text,text)', 'EXECUTE') as server_can_validate,
  has_function_privilege('service_role', 'public.check_in_door_ticket(text,text)', 'EXECUTE') as server_can_admit,
  not has_function_privilege('anon', 'public.validate_door_ticket(text,text)', 'EXECUTE') as anon_validation_blocked,
  not has_function_privilege('authenticated', 'public.validate_door_ticket(text,text)', 'EXECUTE') as authenticated_validation_blocked,
  not has_function_privilege('anon', 'public.check_in_door_ticket(text,text)', 'EXECUTE') as anon_admission_blocked,
  not has_function_privilege('authenticated', 'public.check_in_door_ticket(text,text)', 'EXECUTE') as authenticated_admission_blocked,
  not has_table_privilege('service_role', 'public.tickets', 'SELECT,INSERT,UPDATE,DELETE') as direct_ticket_crud_blocked,
  not has_table_privilege('service_role', 'public.rsvps', 'SELECT,INSERT,UPDATE,DELETE') as direct_rsvp_crud_blocked;
```

Every result should be true. RSVP uses `submit_normalized_rsvp`, not direct `rsvps` insertion. Ticketing and check-in also use restricted SECURITY DEFINER RPCs with fixed search paths. Do not restore broad permissions to work around an RPC error.

## 4. Verify the event and Stripe endpoint

Set `CHECK_IN_EVENT_SLUG` to the actual live event, not `dev-ticket-test-2026-12-30`. In Supabase confirm that event is `published` and `ticketed`. Ticket sales additionally require a future start, open `ticket_sales_open`, one active General Admission type, `price_cents=1000`, USD and an open sales window. The database enforces the noon cutoff on the event date in its configured timezone. Closed sales do not prevent staff admission. Do not reopen sales just to enable check-in.

In the **LIVE** Stripe account, confirm the existing event destination is exactly:

```text
https://www.elsolartimbero.com/api/stripe/webhook
```

It must receive `payment_intent.succeeded` and `payment_intent.payment_failed`. Keep the current working endpoint and its signing secret. A redirect from the apex domain (`308`) is not successful webhook delivery; use the final canonical hostname directly and expect HTTP `200`. The CLI listener and its `whsec_…` are local test tools, not the production endpoint.

The browser confirms a PaymentIntent, but only verified server webhook fulfillment marks an order paid and creates a ticket. Email runs after committed fulfillment and cannot invalidate a paid ticket. Page refreshes and duplicate webhook delivery must not create another ticket or send another normal email. Gmail failures are diagnosed separately; see [ticket email](ticket-email.md) for claims and manual recovery.

## 5. Commit, review and release

1. Finish passing release checks and review the complete diff on the current feature branch.
2. Commit/push the reviewed changes and open the PR to `main`.
3. Review the preview with staging data; require green `ci`.
4. Confirm production variables and the two migrations are ready **before** merging.
5. Merge when ready. Vercel builds `main` using Production variables and locked dependencies.
6. Wait for the deployment to become **Ready**, confirm the expected commit and open the canonical live site. If automatic deployment is paused, deliberately promote/deploy the reviewed `main` commit through the existing project.

No new domain registration, DNS change or Stripe payment-method redesign is needed for this check-in release. Environment-variable edits alone do not alter an already-running deployment.

## 6. Post-deployment checks

- Open the public event and an existing customer ticket link. Existing `/tickets/{token}?view=card` QRs must still resolve to their public ticket; no customer PIN is required and viewing never admits anyone.
- Open `https://www.elsolartimbero.com/check-in` on an actual staff phone. Enter the private PIN, test show/hide, allow camera access and confirm the session survives refresh. The session lasts four hours; Lock Scanner clears it. Changing the PIN, signing secret or configured event invalidates old sessions after deployment.
- Validate a ticket for the configured event. Validation must show event/type/code without setting `checked_in_at`. Test actual admission, repeated admission and simultaneous attempts on a dedicated staging/test ticket; do not consume a real attendee's admission just to smoke-test production.
- Confirm wrong-event/unknown credentials are rejected with explanations and session expiry requires the PIN again. Check in an actual customer only when admitting them at the door.
- Verify an RSVP-mode event still uses its RSVP form. Verify the paid mode retains Get Ticket, embedded card-only Payment Element and Buy Now. Exercise declines and repeated webhooks in staging/test mode. Any deliberate live payment smoke test is a real $10 charge and needs explicit owner intent.
- Inspect Vercel runtime logs for safe diagnostic references and Stripe LIVE delivery logs for HTTP `200`. Do not log or share PINs, keys, attendee data, client secrets or ticket credentials.
- Arrange working internet at the door with a cellular backup. There is no offline admission or check-out/re-entry flow. A network failure is an error, not evidence that a ticket is invalid; retrying admission is safe.

## Rollback

If the new deployment fails, restore the prior known-good Vercel deployment, then revert/fix through the PR flow. A code rollback does not undo migrations or check-in timestamps. Leave the additive RPC migrations and sold-ticket data intact; do not reset `checked_in_at` or regenerate tokens as a rollback mechanism. Review Vercel's rollback/promotion status before resuming automatic production releases.

Detailed references: [check-in](check-in.md), [ticketing](ticketing.md), [ticket email](ticket-email.md), [database model](database.md), [Vercel Git integration](https://vercel.com/docs/git/vercel-for-github), [Vercel rollback](https://vercel.com/docs/instant-rollback).
