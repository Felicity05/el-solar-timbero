# Staff door check-in

Existing sold QR codes stay unchanged: `{SITE_URL}/tickets/{ticket_token}?view=card`. Older URLs without the query work too. Public ticket pages remain read-only. The staff scanner extracts the existing credential locally; it never navigates to or fetches a scanned URL. Only the configured site's origin (including its HTTPS www/apex alias) is accepted. Manual entry uses the existing `EST-…` ticket code.

The original `20261022172251_staff_ticket_check_in.sql` migration adds the check-in functions. Admin V1 additionally requires `20261102221255_admin_v1_scheduling_and_door_pins.sql`. See [Admin setup](admin.md). Sold ticket credentials and QR URLs remain unchanged.

Configure these **server-only** environment variables locally and in Vercel:

- `CHECK_IN_SESSION_SECRET`: independent random signing secret, at least 32 characters. Generate with `openssl rand -hex 32`.
- `SITE_URL`: existing canonical website URL. Continue using the existing server-only Supabase configuration.

Generate the event’s PIN in `/admin/events/[id]` and share it privately with staff. The database resolves the currently published, released, unended ticketed event. `CHECK_IN_PIN` and `CHECK_IN_EVENT_SLUG` are obsolete and can be removed after migration/deployment. Door verification uses salted scrypt hashes. Admin retrieval additionally stores the PIN encrypted with an event-bound key derived from the permanent server session secret; plaintext PINs are never stored. Show PIN does not change door sessions; regeneration invalidates them. Existing hash-only PINs need one regeneration to enable retrieval.

Staff open `/check-in` on their phone, enter the PIN (the eye toggle can reveal/hide it) and allow camera access. Camera access needs HTTPS (localhost is suitable for local development). No app installation is needed. Use rear-camera scanning or the manual ticket-code fallback. Scanning **only validates**. Staff must press **Check In** to admit. **Scan Next** returns to scanning; **Lock Scanner** removes the cookie.

The signed session expires after four hours. It is HttpOnly, SameSite=Strict, restricted to `/check-in`, and Secure in production. No PIN/session is stored in localStorage. Every server action verifies the session again. Changing the PIN, event slug or signing secret invalidates existing sessions. PIN attempts use the existing shared database rate limiter, with separate keyed hashes: 10 per IP per 10 minutes and 100 globally per minute. On non-Vercel hosts configure the existing trusted proxy header correctly; otherwise attempts share the conservative unknown-IP bucket. No raw PIN, token or scanned URL is logged.

`validate_door_ticket` returns only event name, type, code, time zone and previous admission time for a published ticketed event, valid ticket and paid order. It makes no changes. `check_in_door_ticket` rechecks those conditions while locking the order and ticket rows, then sets `checked_in_at` only when it is NULL. Concurrent attempts serialize: one returns `checked_in`, the other `already_checked_in` with the original timestamp. Invalid, unpaid, refunded, void and wrong-event credentials return `invalid` with a controlled staff-only reason displayed beneath the heading. The follow-up migration `20261023175438_door_ticket_invalid_reasons.sql` adds those reasons without changing ticket data. Sales being closed does not prevent admission. No check-out or re-entry is implemented.

Both SECURITY DEFINER functions have an empty fixed search path and schema-qualified tables. EXECUTE is revoked from PUBLIC, anon and authenticated; only the server's service_role can execute them. Direct ticket-table privileges stay revoked. Next.js Server Actions provide same-origin mutation protection. Staff pages are no-store/noindex/no-referrer. Possession of a public ticket URL never grants admission authority.

Browser camera scanning uses `qr-scanner`; existing public QR rendering and tokens are unchanged. Local database/concurrency coverage runs with `node tests/local-admin.integration.mjs`. It creates a disposable database in local Supabase, applies migrations there, and uses separate PostgreSQL connections for simultaneous admissions before dropping its own database.
