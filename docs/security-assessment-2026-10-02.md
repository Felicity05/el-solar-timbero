# El Solar Timbero security assessment — October 2, 2026

## Scope and result

Authorized assessment of `https://elsolartimbero.com`, its redirect destination `https://www.elsolartimbero.com`, and the project's Supabase RSVP permissions. The working tree was clean at the start; the reviewed repository commit was `4543565`. Live observations began at 22:23 UTC. The owner explicitly requested penetration testing of their deployed site.

No critical compromise was observed. Two issues deserve remediation: the shared global limiter can deny service to unrelated visitors, and the live RSVP page can be embedded by an untrusted parent. This was a bounded application assessment, not an exhaustive infrastructure audit or a guarantee that every vulnerability has been found.

Live testing used 26 form POSTs across two rate windows, a small set of public-asset/path checks, four anonymous Data API probes, and one browser framing check. One clearly labeled synthetic RSVP was created using a fictional NANP 555-0100 number. Concurrent requests were limited to the two requests testing uniqueness. No flood, destructive database attack, third-party callback, credential guessing, or broad phone enumeration was performed. Database inspections returned schema/role metadata or aggregates restricted to the synthetic test identity, not real attendees' contact details.

## Finding 1 — One IP can consume the site-wide allowance while IP-blocked

**Severity: Medium. Evidence: reproduced locally against the reviewed submission flow; not flooded on production.**

In `src/lib/rsvp/rsvp-submit.ts`, `processRsvp` consumes the global allowance before checking the IP allowance. Requests already blocked by the IP limit therefore still increment the shared global counter. This makes a single source capable of exhausting the 100-attempt/minute allowance and temporarily denying RSVPs to other IPs. Sustained requests can repeat the effect as the global window renews. A hosting firewall might reduce the attack, but its configuration was not verified.

The local reproduction exercised the actual `processRsvp` function with deterministic counter dependencies and invalid form data. It made **zero network requests**:

| Observation                                                      | Result                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| Attempts from one simulated source                               | 100                                                     |
| Attempts reaching validation                                     | 10                                                      |
| Attempts denied by limits                                        | 90                                                      |
| Shared counter after a request from a different simulated source | 101                                                     |
| Different source's result                                        | `Too many RSVP attempts. Please try again in 1 minute.` |

Live IP limits were independently confirmed: the 11th attempt was blocked. Spoofing `x-forwarded-for`, `x-vercel-forwarded-for`, and `x-real-ip` did not bypass that block. The issue is shared-allowance accounting, not a demonstrated IP-header bypass.

**Remediation:** evaluate/consume the IP allowance first, return immediately for blocked IPs, then consume the global allowance. Preserve fail-closed behavior. Add a regression test proving that repeated IP-blocked requests do not consume global slots and that another IP can still submit. Retain hosting-level flood protection; application checks still require requests to reach the server/database, and distributed sources can exhaust an intentionally shared cap.

## Finding 2 — The RSVP form permits untrusted framing

**Severity: Low. Evidence: confirmed in the live browser.**

The production page returned neither `Content-Security-Policy` with `frame-ancestors` nor `X-Frame-Options`. A Chromium page with an untrusted/opaque parent successfully loaded the site inside an iframe and found the live RSVP button. [Screenshot](security/framing-2026-10-02.png).

This permits clickjacking interfaces that obscure the surrounding disclosure or mislead visitors into interacting with the real form. The parent cannot read the cross-origin frame's DOM merely because it can embed it; no attendee data theft, autofill theft, or hidden form submission was demonstrated. Severity is limited because this application has no authenticated account or privileged visitor operation.

**Remediation:** return `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` for application pages unless intentional embedding is needed. Start with that narrow policy; a strict script policy must be designed for Next.js's generated/inline scripts to avoid breaking the app. Add a browser regression check that the form is inaccessible inside an untrusted iframe, then recheck the deployed headers.

Source: [MDN frame-ancestors reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

## Existing privacy/abuse tradeoffs

- **Phone enumeration:** the duplicate response confirms that a supplied phone is registered for this event. Live normalized-phone retries displayed the duplicate screen. This is an existing documented product choice, not a newly discovered database leak. Keep the explicit message only if that privacy tradeoff is acceptable; otherwise use a generic acknowledgment or verify ownership before disclosing registration status. No real phone list was enumerated.
- **Unverified contact ownership:** format validation and rate limits do not establish that a submitter owns a phone/email. Distributed automation can still submit plausible contacts below the limits. A verified challenge or ownership verification would provide a different level of protection, at the cost of visitor friction. These were not implemented or evaluated in this assessment.
- **Additional header hardening:** an explicit `X-Content-Type-Options` and a broader CSP would improve defense in depth. Their absence alone is not proof of XSS or a data breach. No exploitable script injection was demonstrated by the tested inputs.

## Controls that passed

| Control                       | Evidence                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS                         | HTTP redirected to HTTPS; HTTPS returned HSTS with a 63,072,000-second max age.                                                                                                                                                                                                               |
| Atomic event/phone uniqueness | Two concurrent submissions and a normalized-phone retry produced exactly one synthetic row. Hosted constraint was `UNIQUE (event_slug, phone)`.                                                                                                                                               |
| Existing records preserved    | The test row retained its original email after retries using another email.                                                                                                                                                                                                                   |
| Trusted event/disclaimer      | Posted forged event, disclaimer, timestamp, and eligibility values were ignored; the synthetic row contained the expected event and disclaimer version.                                                                                                                                       |
| Phone normalization           | The synthetic row stored `+12025550100`; alternate phone spellings reached the duplicate view.                                                                                                                                                                                                |
| Required acknowledgment       | An unchecked notice returned its field error; no new row was created.                                                                                                                                                                                                                         |
| Validation                    | Script-like name, SQL-like phone, unsupported referral, invalid phone, and binary-name probes returned validation errors. The initial batch's field-error observations were checked against the server validator; tests did not demonstrate SQL injection or executable reflected/stored XSS. |
| Honeypot                      | An empty first `website` value followed by a populated value was rejected; the visible response was rechecked separately.                                                                                                                                                                     |
| IP limit                      | The 11th counted attempt was blocked; forwarded-IP spoofing and a request without Origin did not bypass the active block.                                                                                                                                                                     |
| Phone limit                   | After expiry of the initial windows, five duplicate attempts succeeded as duplicate responses; the sixth was limited even with alternate phone formats.                                                                                                                                       |
| Origin check                  | A mismatched Origin was rejected with HTTP 500 and a generic production error, without a server stack. A 500 is framework error handling, not evidence that the request reached an insert.                                                                                                    |
| Request-size bound            | A single multipart body just over 1 MiB was rejected with a generic HTTP 500; no server stack was returned. No repeated large-body test was performed.                                                                                                                                        |
| Anonymous RSVP read/insert    | Both Data API probes returned `401`, PostgreSQL code `42501`, and permission-denied errors. The read probe requested zero rows; the insert probe intentionally lacked required values.                                                                                                        |
| Anonymous limiter RPC         | Invalid-scope probe was denied with `401` / `42501` before function execution.                                                                                                                                                                                                                |
| Private counter schema        | Data API rejected the schema with `406` / `PGRST106`; it is not exposed.                                                                                                                                                                                                                      |
| Least privilege               | SQL metadata confirmed no RSVP access or limiter RPC execution for `anon`/`authenticated`. `service_role` had RSVP INSERT and limiter execution, without RSVP SELECT/UPDATE/DELETE.                                                                                                           |
| RLS/function security         | Both tables had RLS enabled. The limiter was SECURITY INVOKER with an empty configured search path.                                                                                                                                                                                           |
| Secret/source exposure        | No service-role JWT, modern `sb_secret_` credential, or private-key marker was found in homepage HTML and seven inspected JS bundles. `.env`, `.env.development.local`, `.git/config`, and the server-action source path returned 404. No source map was retrieved.                           |
| Dependency advisories         | `npm audit --omit=dev --audit-level=high` completed with zero reported vulnerabilities for the local lockfile. This does not independently attest to the deployed build's dependency tree.                                                                                                    |

Supabase security advisors reported only INFO-level “RLS enabled, no policy” entries for the two intentionally server-only tables. Given their verified revoked browser grants and service-role architecture, these entries do not require adding public policies. See [Supabase's advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Configuration observation

The bare domain redirects to `https://www.elsolartimbero.com/`, but the generated Open Graph image URL uses the bare domain. Align `SITE_URL` with the chosen canonical host and redeploy, or reverse the domain redirect if the bare domain is intended. This is a metadata/canonical-host consistency issue, not a security vulnerability.

## Test cleanup and limits

The only inserted test identity was `Security Audit Test`, `security-audit-20261002222710@example.com`, with the fictional phone `+12025550100`. Test-row aggregates confirmed exactly one row and preserved trusted values. Cleanup targeted that exact name/email/phone/event/disclaimer and the assessment's creation-time interval; its result is recorded below. Real RSVP records and limiter configuration were not modified. Rate counters were left to expire normally.

Private transient evidence is under `/private/tmp/el-solar-security/`. Initial HTTP-response substring classification also matched inert success/duplicate slots serialized by React, so those initial `state` labels were not relied on as proof. The follow-up checks parsed only the visible `<main>` markup, and uniqueness/trusted values were verified directly using test-only database aggregates. No credentials or real attendee data are included in this report.

The assessment did not flood production to reproduce the global-allowance flaw, independently test multi-connection Postgres lock contention beyond the live two-request race, inspect Vercel account permissions/firewall rules, audit GitHub branch protections, or certify all dependency/transitive vulnerability classes. This report proposes remediation; production application code and deployment settings were not changed.
