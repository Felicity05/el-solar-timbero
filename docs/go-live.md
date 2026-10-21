# El Solar Timbero production launch

This is an operator checklist. No production action has been performed automatically.

## Production environment

Use Vercel → project → Settings → Environment Variables → **Production**. Mark server secrets as sensitive. Preview/Development should use separate test credentials and a test database. Keep Vercel's Node runtime at **24.x**.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PRODUCTION-PROJECT.supabase.co
SUPABASE_URL=https://YOUR-PRODUCTION-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-PRODUCTION-SUPABASE-SECRET-KEY
SITE_URL=https://elsolartimbero.com

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_REPLACE
STRIPE_SECRET_KEY=sk_live_REPLACE
STRIPE_WEBHOOK_SECRET=whsec_FROM_THE_PRODUCTION_STRIPE_ENDPOINT
STRIPE_LIVE_MODE=true

GMAIL_USER=your-sending-account@gmail.com
GMAIL_APP_PASSWORD=your-google-app-password
TICKET_EMAIL_FROM="El Solar Timbero"
```

SUPABASE_URL is an optional server runtime override; set it to the same production project URL for clarity. Despite the legacy variable name, SUPABASE_SERVICE_ROLE_KEY accepts the modern Supabase server secret key (`sb_secret_...`) already supported by this project; do not use a publishable/anon key. Do not restore direct table grants. The existing service-role-only RPCs are the intended access path.

STRIPE_SECRET_KEY accepts a suitably permissioned restricted live key (`rk_live_...`) as well as `sk_live_...`. Publishable and server Stripe keys must belong to the same account and mode. The production webhook secret must come from the live HTTPS endpoint, not the local Stripe CLI listener. Keep live mode disabled locally and in test previews.

TICKET_EMAIL_FROM is optional. Plain text is the sender display name and sends from GMAIL_USER. An email address or Name <email> uses that address and must be a verified Gmail send-as alias. Only NEXT_PUBLIC variables are intended for the browser; Gmail credentials and server Stripe/Supabase keys must never have that prefix.

For a self-hosted/local production-mode run, use an ignored **.env.production.local** (or .env.production) with the same variables, then `npm run build` and `npm run start`. **.env.prod is not automatically loaded by Next.js.** Vercel configuration is preferred for the deployed site; do not commit environment files. Public variables are embedded at build time, so set them before building and redeploy after changing them.

## Launch steps

1. Review the branch and tests, then coordinate the merge/deployment so ticket traffic does not reach application code before its database RPCs exist. Keep production ticket_sales_open false until the setup is verified. Do not seed fake/local events into production.
2. Back up the production database. Compare applied migration history with the repository; preserve existing RSVP rows/counts/history. Review all **missing** migrations in chronological order. The new email migration is `20261021174535_ticket_email_delivery.sql`; ticketing also requires the earlier paid MVP, recovery, QR-display and noon-cutoff migrations if they have not yet been applied. Do not edit/reapply old migrations. Apply only the missing migrations yourself with the Supabase CLI after checking the linked project and reviewing its dry-run output. Verify RLS/RPC permissions and historical RSVP data afterward.
3. In Stripe live mode, ensure the business account is activated for card payments. Create an HTTPS **snapshot** event destination for `https://elsolartimbero.com/api/stripe/webhook`, selecting `payment_intent.succeeded` and `payment_intent.payment_failed`. Match the installed server SDK event API version (`2026-09-30.endive`). Copy that endpoint's signing secret into the production environment. Do not replace the existing PaymentIntent implementation or create Checkout/Payment Links. No Dashboard Product/Price is required by this database-priced implementation.
4. Set the production environment variables above in Vercel, confirm Node 24.x and the existing `npm run build` configuration, and deploy the reviewed branch intentionally. Confirm the canonical domain and HTTPS certificate resolve to that deployment. Changing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY requires a rebuild.
5. Configure the real event in production: admission_mode=ticketed, status=published, actual local event_date, IANA timezone, starts_at/ends_at, name, venue/address; one active General Admission ticket type with price_cents=1000 and currency=usd. Verify its sales window: the database caps sales_end_at at **12:00 noon on event_date in that timezone**, or earlier if already configured. Leave sales closed until ready. Existing RSVP-mode events remain independent.
6. On an HTTPS preview with TEST keys/test database, manually test ordinary card entry, a decline, 3DS, same-person duplicate prevention, credentials missing in another browser, QR opening and email rendering. Keep preview SITE_URL pointed at that preview origin. Automated Stripe iframe doubles do not replace this test. The authorized local Gmail email is only a delivery/design smoke test; it contains a localhost link.
7. When ready, open the real event's ticket_sales_open. Make one controlled real $10 purchase using an actual card (test cards do not work in live mode). Verify Stripe's signed webhook receives HTTP 200, the database has one paid order and one valid ticket, the processing overlay resolves, the QR/code works, and the email contains the canonical HTTPS ticket URL. A new Gmail send must work from Vercel, not just your laptop. Check inbox/spam; SMTP acceptance alone does not guarantee inbox placement.
8. Monitor Vercel's sanitized ticket/email logs and Stripe delivery attempts. Replaying a success event must not create another ticket or normal email. A Gmail problem must not invalidate a paid ticket; use the [manual email reconciliation procedure](ticket-email.md#failure-and-manual-recovery). To pause new purchases, close ticket sales; preserve all orders/tickets. Previously issued Stripe intents may still finish after closing sales and must still be fulfilled.

## References

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Next.js environment-file behavior and public build-time variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Stripe webhook endpoint registration and signature verification](https://docs.stripe.com/webhooks)
- [Google App Password setup](https://support.google.com/accounts/answer/185833)
