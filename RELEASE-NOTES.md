# @proxygate/sdk release notes

## 0.11.0 — Drift-guard reconciliation (BREAKING: one nullable widen)

Resolved the SDK-vs-gateway response-type drift per field against PROD column
reality. All relevant response types are now compile-time drift-guarded against
the generated /v1 spec.

### BREAKING (consumers must handle null)

- **`UsageEntry.seller_id`: `string` → `string | null`.** The gateway's
  `api_requests.seller_id` column is nullable (prod-verified), so usage rows can
  carry a null `seller_id` (e.g. platform/system requests). Anyone reading
  `usage().usage[].seller_id` must now handle `null`.

This is the ONLY widened (breaking) field. A 0.x minor bump per the package's
pre-1.0 convention; treated as breaking per SAFE-06 (see note to maintainers).

### Non-breaking (accuracy fixes — gateway SPEC narrowed to match reality, SDK unchanged)

These the gateway already guaranteed non-null; the spec had over-loosely modeled
them. No SDK type changed; listed for completeness:
`usage.{path,status_code,latency_ms,cost_micro_cents,listing_id}`, seller-profile
`latency.{p50,p95,p99}`, settlement `daily.service` + payout `status`.

### Drift guards

Bidirectional/directional `AssertExtends` guards now cover categories, pricing,
services, balance, sellerProfile, usage, settlements (8 types). `apis` stays
unguarded pending a shared-`@proxygate/api-types` follow-up (its
`CatalogListing.listing_type` is `string`; the SDK's `ListingType` enum is
correct, backed by a DB CHECK). The guards fail to compile if the gateway
response shape diverges from the hand-written SDK type.

## 0.10.0 — Username hard-proxy-gate (client side)

Additive, non-breaking (SAFE-06 minor).

- **New `client.setUsername({ username })`** → `POST /v1/profile/username`
  (wallet/bearer-authed). Sets the agent-provided username on the authenticated
  wallet (a NEW required handle; distinct from the seller slug). Response is
  `{ success: true }` — the username is intentionally not echoed back.
- **Errors propagate as `ProxygateError` (not swallowed).** A collision returns
  `username_taken` (409); a malformed username returns `invalid_request` (400).
  Callers can switch on `err.code` to re-prompt.
- **New types** (re-exported): `SetUsernameOptions`, `SetUsernameResponse`. Added
  `'username_taken'` and `'registration_required'` to the `GatewayErrorCode`
  union (additive — `registration_required` is what the proxy path returns when
  the gateway's username gate is on and the wallet has no username; it carries
  an `action` pointer to `proxygate init`).

## 0.9.0 — Fase 1: contact-email capture

Additive, non-breaking (SAFE-06 minor).

- **New `client.setContactEmail({ email })`** → `POST /v1/profile/email`
  (wallet/bearer-authed). Submits a contact email for the authenticated wallet
  and triggers a verification email. Response is `{ success: true }` — the email
  is intentionally not echoed back.
- **New `client.verifyContactEmail({ token })`** → `POST /v1/profile/email/verify`
  (wallet/bearer-authed). Confirms ownership via the emailed token. Returns
  `{ verified, status: 'verified' | 'invalid' | 'expired' | 'already_used' | 'conflict' }`.
- **Collision handling (light path only).** When the email is already bound to
  another identity, the gateway returns an error (`verification_required` /
  `email_conflict`) carrying an `action`/`docs` pointer to the web-claim flow.
  The SDK does **not** swallow it — the `ProxygateError` propagates with `code`,
  `action`, and `docs` intact. The heavy web-claim path itself is Fase 2; the
  SDK only detects + surfaces.
- **New types** (re-exported): `SetContactEmailOptions`, `SetContactEmailResponse`,
  `VerifyContactEmailOptions`, `VerifyContactEmailResponse`. Added
  `'verification_required'` and `'email_conflict'` to the `GatewayErrorCode`
  union (additive — unknown codes still fall through to `string`).

> MIGRATION DEBT (Phase 53): `@proxygate/api-types` does not exist yet, so these
> wire types are defined locally in `src/types/api.ts`. Source of truth for the
> shape is the gateway Zod schema for `POST /v1/profile/email[/verify]`. When
> api-types ships, delete the local copies and import from there.

> No exports were removed. Older consumers are unaffected.

## 0.8.0 — Phase 51.6: open free listings

Additive, non-breaking (SAFE-06 minor).

- **Gateway now accepts `price_per_request = 0`** from any seller. The row is
  created in a "Pending approval" state (`is_active = false`) until an admin
  flips `free_listing_approved = true`. Proxygate-curated free listings
  continue to be activated immediately. JSDoc on `CreateListingOptions.price_per_request`
  documents the new 0-OR->=1000 contract.
- **Mixed-pricing now works in both directions**: `price_per_request = 1000`
  default + `endpoint_prices[]` with `price_per_request = 0` overrides (paid
  listing with free endpoints), AND `price_per_request = 0` default +
  `endpoint_prices[]` with `price_per_request >= 1000` overrides (free listing
  with paid endpoints). No SDK type change needed — the existing
  `EndpointPriceOverride.price_per_request: number` already accepts both
  directions; this entry documents that the gateway now honors both matrices.

Consumers calling `client.listings.create({ price_per_request: 0 })` land a
"Pending approval" row identical to one created via the wizard. Older SDK
versions continue to work — they simply ignore the new optional fields.

> Per-listing logo upload is a web-UX feature only (drag/drop, paste-with-rehost,
> dimension validation in the wizard). It is intentionally not exposed via the
> SDK — sellers upload logos through the dashboard.

> Publish manually with `pnpm publish --no-git-checks` (NOT `npm publish` — see
> CLAUDE.md DO list: `npm publish` leaks `workspace:*` into the tarball).

## 0.7.0 — Phase 51.5: procured free listings

Additive, non-breaking (SAFE-06 minor).

- **Types**: `ApiListingDetail.free_listing_approved?: boolean` and
  `ListingSummary.free_listing_approved?: boolean` and
  `ListingRow.free_listing_approved?: boolean` added. Optional for
  backward compat with older gateway versions.
- **Types**: `UsageEntry.is_free?: boolean` added — TRUE when the request was
  served by a procured free listing (cost_micro_cents is always 0 in that case).
- **Errors**: new `GatewayErrorCode` discriminated union exported with two
  new variants: `'daily_free_cap'` and `'listing_quota_exhausted'`. Both map
  to HTTP 429.
- **Docs**: README has a new "Free tier — zero-deposit calls" example using the
  Open-Meteo procured pilot.

Consumers can filter `free_listing_approved === true` to discover free listings
and switch on `err.error === 'daily_free_cap'` for friendly UX when the daily
cap is hit. Free-listing tier is part of the default gateway surface (no global
feature flag required).

Older SDK versions continue to work — they simply ignore the new optional fields.

## 0.6.3 — previous release

See git history.
