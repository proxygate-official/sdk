import { describe, it, expect } from 'vitest';
import type { ApiListingDetail, UsageEntry } from './types/api.js';
import type { ListingSummary, ListingRow } from './types/listings.js';
import type { GatewayError, GatewayErrorCode } from './types/core.js';

/**
 * Phase 51.5: type-level + value-level assertions for the additive SDK changes.
 *
 * The fields are intentionally optional on the SDK side so older gateways
 * (that don't surface them) still round-trip cleanly through these types.
 */
describe('Phase 51.5 SDK types', () => {
  it('ApiListingDetail.free_listing_approved is optional boolean', () => {
    // Type-level: assignable with or without the field.
    const withoutFlag: ApiListingDetail = {
      listing_id: 'a', seller_wallet: 'w', service: 'x', service_name: 'X',
      auth_pattern: 'bearer', pricing_unit: 'per_request',
      price_per_request_usdc: 0.001, price_per_input_token_usdc: null, price_per_output_token_usdc: null,
      available_rpm: 100, uptime_percent: 1, avg_latency_ms: 10, trust_score: 90, badges: [],
      is_available: true, member_since: '2026-01-01', endpoints: [], is_verified: false,
    };
    const withFlag: ApiListingDetail = { ...withoutFlag, free_listing_approved: true };
    expect(withFlag.free_listing_approved).toBe(true);
    expect(withoutFlag.free_listing_approved).toBeUndefined();
  });

  it('UsageEntry.is_free is optional boolean', () => {
    const paidRow: UsageEntry = {
      id: '1', service: 'x', path: '/v1/forecast', model: null,
      status_code: 200, latency_ms: 50, cost_micro_cents: 2100,
      listing_id: 'l', seller_id: 's', created_at: '2026-05-12T00:00:00Z',
    };
    const freeRow: UsageEntry = { ...paidRow, cost_micro_cents: 0, is_free: true };
    expect(freeRow.is_free).toBe(true);
    expect(freeRow.cost_micro_cents).toBe(0);
  });

  it('GatewayErrorCode union includes the new free-tier codes', () => {
    const a: GatewayErrorCode = 'daily_free_cap';
    const b: GatewayErrorCode = 'listing_quota_exhausted';
    expect(a).toBe('daily_free_cap');
    expect(b).toBe('listing_quota_exhausted');
  });

  it('GatewayError.error accepts known codes via the union', () => {
    const err: GatewayError = {
      error: 'daily_free_cap',
      message: 'Daily free-tier limit reached for this listing or endpoint',
    };
    expect(err.error).toBe('daily_free_cap');
  });

  it('ListingSummary + ListingRow accept free_listing_approved as optional', () => {
    const summary: ListingSummary = {
      id: 'a', service_name: 'X', service_slug: 'x', base_url: 'https://example.com',
      auth_pattern: 'none', description: null, key_masked: '', total_rpm: 100,
      reserved_rpm: 0, available_resale_rpm: 100, price_per_request: 0,
      is_active: true, categories: [], created_at: '2026-01-01', updated_at: '2026-01-01',
      free_listing_approved: true,
    };
    expect(summary.free_listing_approved).toBe(true);

    const row: ListingRow = {
      id: 'a', seller_id: 's', catalog_id: 'c', auth_pattern: 'none',
      total_rpm: 100, reserved_rpm: 0, price_per_request: 0,
      price_per_input_token: null, price_per_output_token: null,
      pricing_model: 'fixed', pricing_unit: 'per_request', is_active: true,
      key_masked: '', description: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      service_catalog: { slug: 'open-meteo', name: 'Open-Meteo', base_url: 'https://api.open-meteo.com' },
      free_listing_approved: true,
    };
    expect(row.free_listing_approved).toBe(true);
  });
});

// Note: ListingSummary import is here for the test above; reference it to silence
// the unused-import lint rule when builds run without test files.
type _SdkPhase515TestRefs = ListingSummary | ListingRow;
