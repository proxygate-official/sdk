# @proxygate/sdk release notes

## 0.8.0 — Phase 51.6: open free listings

Additive, non-breaking (SAFE-06 minor).

- **Gateway now accepts `price_per_request = 0`** from any seller. The row is
  created in a "Pending approval" state (`is_active = false`) until an admin
  flips `free_listing_approved = true`. ProxyGate-curated free listings
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
