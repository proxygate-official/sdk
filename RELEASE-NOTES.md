# @proxygate/sdk release notes

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
