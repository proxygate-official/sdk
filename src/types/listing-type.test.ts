import { describe, it, expect } from 'vitest';
import type { ApiListingDetail, ApisQueryOptions, ListingType } from './api.js';
import {
  isSkillListing,
  isProductListing,
  isDatasetListing,
  isServiceListing,
  isConnectorListing,
} from './api.js';

function makeBase(overrides: Partial<ApiListingDetail> = {}): ApiListingDetail {
  return {
    listing_id: 'abc123',
    seller_wallet: 'wallet1',
    service: 'test-service',
    service_name: 'Test Service',
    auth_pattern: 'bearer',
    pricing_unit: 'per_request',
    price_per_request_usdc: 0.001,
    price_per_input_token_usdc: null,
    price_per_output_token_usdc: null,
    available_rpm: 100,
    uptime_percent: 99.9,
    avg_latency_ms: 50,
    trust_score: 0.9,
    badges: [],
    is_available: true,
    member_since: '2026-01-01',
    endpoints: [],
    is_verified: false,
    ...overrides,
  };
}

describe('ApiListingDetail listing_type and type_metadata fields', () => {
  it('accepts listing_type and type_metadata as optional fields', () => {
    const listing = makeBase({ listing_type: 'skill', type_metadata: { endpoint_url: 'https://example.com' } });
    expect(listing.listing_type).toBe('skill');
    expect(listing.type_metadata).toEqual({ endpoint_url: 'https://example.com' });
  });

  it('works without listing_type (backward compat)', () => {
    const listing = makeBase();
    expect(listing.listing_type).toBeUndefined();
    expect(listing.type_metadata).toBeUndefined();
  });

  it('accepts all valid listing types', () => {
    const types: ListingType[] = ['proxy', 'tunnel', 'skill', 'product', 'dataset', 'service', 'connector'];
    for (const t of types) {
      const listing = makeBase({ listing_type: t });
      expect(listing.listing_type).toBe(t);
    }
  });
});

describe('ApisQueryOptions type filter', () => {
  it('accepts type as an optional filter', () => {
    const opts: ApisQueryOptions = { type: 'skill' };
    expect(opts.type).toBe('skill');
  });

  it('works without type filter', () => {
    const opts: ApisQueryOptions = { service: 'openai' };
    expect(opts.type).toBeUndefined();
  });
});

describe('type guard functions', () => {
  it('isSkillListing returns true for skill listing', () => {
    const listing = makeBase({ listing_type: 'skill' });
    expect(isSkillListing(listing)).toBe(true);
  });

  it('isSkillListing returns false for non-skill listing', () => {
    const listing = makeBase({ listing_type: 'product' });
    expect(isSkillListing(listing)).toBe(false);
  });

  it('isSkillListing returns false when listing_type is undefined', () => {
    const listing = makeBase();
    expect(isSkillListing(listing)).toBe(false);
  });

  it('isProductListing returns true for product listing', () => {
    const listing = makeBase({ listing_type: 'product' });
    expect(isProductListing(listing)).toBe(true);
  });

  it('isProductListing returns false for non-product listing', () => {
    const listing = makeBase({ listing_type: 'dataset' });
    expect(isProductListing(listing)).toBe(false);
  });

  it('isDatasetListing returns true for dataset listing', () => {
    const listing = makeBase({ listing_type: 'dataset' });
    expect(isDatasetListing(listing)).toBe(true);
  });

  it('isDatasetListing returns false for non-dataset listing', () => {
    const listing = makeBase({ listing_type: 'skill' });
    expect(isDatasetListing(listing)).toBe(false);
  });

  it('isServiceListing returns true for service listing', () => {
    const listing = makeBase({ listing_type: 'service' });
    expect(isServiceListing(listing)).toBe(true);
  });

  it('isServiceListing returns false for non-service listing', () => {
    const listing = makeBase({ listing_type: 'connector' });
    expect(isServiceListing(listing)).toBe(false);
  });

  it('isConnectorListing returns true for connector listing', () => {
    const listing = makeBase({ listing_type: 'connector' });
    expect(isConnectorListing(listing)).toBe(true);
  });

  it('isConnectorListing returns false for non-connector listing', () => {
    const listing = makeBase({ listing_type: 'proxy' });
    expect(isConnectorListing(listing)).toBe(false);
  });

  it('type guards narrow the type correctly (TypeScript compile-time check)', () => {
    const listing = makeBase({ listing_type: 'skill', type_metadata: { endpoint_url: 'https://api.example.com' } });
    if (isSkillListing(listing)) {
      // After narrowing, type_metadata should be SkillMetadata
      expect(listing.type_metadata.endpoint_url).toBe('https://api.example.com');
    }
  });
});
