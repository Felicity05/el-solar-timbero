# RSVP diagnostics and local authentication

## Fixed local authentication issue

The confirmed root cause was a **one-character difference** between the modern `sb_secret_…` key in `.env.development.local` and the modern secret reported by the current local CLI and configured in the running gateway. There was one definition in the correct development file and no shell override. It was not a general modern-key incompatibility or a missing RPC grant.

Read-only tests using only modern credentials showed the configured incorrect value received HTTP 401 / PostgreSQL `42501`, while the exact current CLI secret returned HTTP 200 and loaded the available event through the real application loader. CLI human-readable, JSON and env output all agreed with the running gateway. The user subsequently corrected the development key.

The earlier legacy JWT replacement was only a workaround and is not required. Use modern secret keys for the server; do not use anon/publishable keys, a JWT signing secret, or a key from a different environment. The local browser integration test now obtains only the current modern `SECRET_KEY` from local CLI status in memory, with no JWT fallback.

Restart `npm run dev` after credential changes. The local API URL and server credential must come from the same local stack. If recreating the stack changes its credentials, recopy the complete current **Secret** value from `supabase status` in that stack's working directory. Keep it in the ignored `.env.development.local` as `SUPABASE_SERVICE_ROLE_KEY`; this custom variable name accepts modern secret keys. The private `SUPABASE_URL=http://127.0.0.1:54321` prevents accidental fallback to a production build's public API URL. Optional `RSVP_DEBUG=true` enables safe request-stage logging. Never put server keys in NEXT_PUBLIC variables or commits. No production credential or database grant was changed to solve this issue.

## Where the data goes

1. `src/app/page.tsx` requests database-driven discovery.
2. `src/lib/rsvp/rsvp-event.ts` calls `get_available_rsvp_events` through `src/lib/rsvp/rsvp-rpc.ts`.
3. `src/lib/supabase/server.ts` resolves the private runtime URL first, validates configuration, and creates the server-only client.
4. The local gateway authenticates the key; PostgREST executes the service-role-only SECURITY DEFINER RPC.
5. The SQL function selects only published/open/future events and returns a JSON array of presentation fields.
6. The loader validates that JSON with Zod and filters unsupported disclosures. A nullable field must still be present as JSON null.
7. The page defaults to the next event or selects an eligible event requested through navigation. It binds the displayed event's slug to its Server Action.
8. `src/app/actions.ts` resolves that event again, checks rate limits and calls `submit_normalized_rsvp` transactionally. `src/lib/rsvp/rsvp-submit.ts` maps controlled results to UI states.

An empty discovery array is a normal no-open-events state. RPC/configuration/transport/response-shape failures show the unavailable state with a reference ID instead.

## Logs

Logs appear in the terminal running Next.js, or server-function logs in an eventual hosted environment. They are not personal-data dumps or raw PostgreSQL exceptions. Failures are always logged; `RSVP_DEBUG=true` additionally logs RPC start/completion, HTTP status and elapsed time. Disable that optional flag to reduce routine log volume.

`src/lib/rsvp/rsvp-diagnostics.ts` emits structured `[rsvp]` records. Example:

```text
[rsvp] {
  event: 'rsvp.failure',
  reference: '<UUID shown in the UI>',
  operation: 'event.discovery',
  stage: 'rpc',
  code: '42501',
  status: 401,
  rpc: 'get_available_rsvp_events',
  host: '127.0.0.1:54321',
  keyType: 'secret',
  hint: 'RPC permission denied. Check the API URL/key belong to the same stack ...'
}
```

Operations distinguish `event.discovery`, `event.lookup`, `rate_limit`, `rsvp.submit`, and `client.config`. Stages distinguish `configuration`, `transport`, `rpc`, `response_validation` and `unexpected_result`. The UI shows only a safe explanation and the correlated reference ID; look up that reference in server logs.

Useful diagnostic codes:

| Code                                                          | Meaning / next check                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `42501`                                                       | Authorization/privilege failure; verify the matching API key/stack and RPC EXECUTE grant. Never fix it by adding broad table/browser grants. |
| `PGRST202`                                                    | RPC missing or absent from schema cache; verify the migration on the selected database.                                                      |
| `PGRST301` / `PGRST303`                                       | JWT authentication failure; verify stack and credential.                                                                                     |
| `MISSING_URL` / `INVALID_URL` / `MISSING_KEY` / `BROWSER_KEY` | Configuration fails before any database call.                                                                                                |
| `TRANSPORT`                                                   | API cannot be reached, request failed, or timeout elapsed.                                                                                   |
| `INVALID_RESPONSE`                                            | JSON shape mismatch; inspect the logged schema paths/codes and RPC definition.                                                               |
| `UNEXPECTED_RESULT`                                           | Write RPC returned an unrecognized controlled result.                                                                                        |

Raw messages/details, request bodies, attendee fields, API keys, authorization headers, URL query strings and SQL exception text are omitted. Response-validation logs include only field paths and validation codes, not values. Existing diagnostic errors propagate without generating a second reference for the same failure.

## SQL repair

`supabase/migrations/20261020021415_discover_available_rsvp_events.sql` had lost the `disclaimer_version` JSON property, leaving a trailing comma. The file is repaired to include `'disclaimer_version',gift_card_disclaimer_version`, which fixes SQL syntax and preserves the required nullable response field. The installed local function already had the correct definition, so it did not need reapplication. Fresh embedded migration tests verify syntax, output shape, ordering and restricted execution.
