import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nacl from 'tweetnacl';
import { ProxyGateClient, ProxyGateError } from '../client.js';

// ---------------------------------------------------------------------------
// Phase 51-08: SDK slug-based identifier + smart detection tests
//
// Covers:
//   - client.api(input) accepts UUID | single-segment slug | seller/listing composite
//   - Type extensions (slug, seller_slug, account_type, etc.) flow through
//   - client.sellerProfile(handle) hits /v1/seller/profile/by-handle/:handle
//   - Backwards compat: existing UUID + service-name fallback paths still work
// ---------------------------------------------------------------------------

const testSeed = new Uint8Array(32).fill(7);
const testKeypair = nacl.sign.keyPair.fromSeed(testSeed);
const testGatewayUrl = 'http://localhost:3001';

function createClient(): ProxyGateClient {
  return new ProxyGateClient({
    gatewayUrl: testGatewayUrl,
    walletAddress: 'TestWallet51_08',
    secretKey: testKeypair.secretKey,
  });
}

/**
 * Mock fetch that records every call and returns scripted responses by URL pattern.
 * If a query string also needs to be matched, encode it as part of the key (e.g. `/v1/apis?slug=blockdb-api`).
 */
function createMockFetch(
  responses: Map<string, { status: number; body: unknown }>,
): ReturnType<typeof vi.fn> {
  let nonceCounter = 0;
  return vi.fn().mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes('/v1/nonce')) {
      return new Response(JSON.stringify({ nonce: `nonce-${++nonceCounter}`, expires_in: 30 }));
    }

    // Most-specific match first: prefer keys that contain `?` (query-aware).
    const keys = Array.from(responses.keys()).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (urlStr.includes(k)) {
        const r = responses.get(k)!;
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

const BLOCKDB_LISTING = {
  listing_id: 'ad3db61c-23d2-41b7-b7ce-5485daa882b6',
  seller_wallet: '9jXisENZUR22DMLH99ottdQ4ukWTapvHcMUBp875HnBJ',
  service: 'blockdb',
  service_name: 'BlockDB',
  auth_pattern: 'bearer',
  pricing_unit: 'per_request',
  price_per_request_usdc: 0.005,
  price_per_input_token_usdc: null,
  price_per_output_token_usdc: null,
  available_rpm: 100,
  uptime_percent: 0.99,
  avg_latency_ms: 60,
  trust_score: 80,
  badges: ['verified'],
  is_available: true,
  member_since: '2026-04-01',
  // Phase 51-08 enrichment fields — must surface in ApiListingDetail
  slug: 'blockdb-api',
  seller_slug: 'blockdb',
  seller_account_type: 'organization' as const,
  organization: 'Blockchain Database LTD',
  is_verified: true,
};

describe('Phase 51-08: client.api() smart detection', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('Test 1: UUID input resolves via /v1/apis?listing_id=X&limit=1 (existing path, no regression)', async () => {
    const mockFetch = createMockFetch(new Map([
      ['/v1/apis', { status: 200, body: { data: [BLOCKDB_LISTING] } }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();
    const result = await client.api('ad3db61c-23d2-41b7-b7ce-5485daa882b6');

    expect(result.listing_id).toBe('ad3db61c-23d2-41b7-b7ce-5485daa882b6');
    const apisCall = mockFetch.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('/v1/apis'),
    );
    expect(apisCall).toBeTruthy();
    const calledUrl = apisCall![0] as string;
    expect(calledUrl).toContain('listing_id=ad3db61c-23d2-41b7-b7ce-5485daa882b6');
    expect(calledUrl).toContain('limit=1');
  });

  it('Test 2: single slug input resolves via /v1/apis?slug=X&limit=1', async () => {
    const mockFetch = createMockFetch(new Map([
      ['/v1/apis', { status: 200, body: { data: [BLOCKDB_LISTING] } }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();
    const result = await client.api('blockdb-api');

    expect(result.slug).toBe('blockdb-api');
    expect(result.seller_slug).toBe('blockdb');
    const apisCall = mockFetch.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('/v1/apis'),
    );
    expect(apisCall).toBeTruthy();
    const calledUrl = apisCall![0] as string;
    expect(calledUrl).toContain('slug=blockdb-api');
    expect(calledUrl).toContain('limit=1');
    // Must NOT include service= filter (that would be a service-name fallback)
    expect(calledUrl).not.toContain('service=blockdb-api');
  });

  it('Test 3: composite seller-handle/listing-slug resolves via /v1/apis?seller_slug=X&slug=Y&limit=1', async () => {
    const mockFetch = createMockFetch(new Map([
      ['/v1/apis', { status: 200, body: { data: [BLOCKDB_LISTING] } }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();
    const result = await client.api('blockdb/blockdb-api');

    expect(result.listing_id).toBe('ad3db61c-23d2-41b7-b7ce-5485daa882b6');
    const apisCall = mockFetch.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('/v1/apis'),
    );
    expect(apisCall).toBeTruthy();
    const calledUrl = apisCall![0] as string;
    expect(calledUrl).toContain('seller_slug=blockdb');
    expect(calledUrl).toContain('slug=blockdb-api');
    expect(calledUrl).toContain('limit=1');
  });

  it('Test 4: ApiListingDetail includes new fields slug, seller_slug, seller_account_type, organization', async () => {
    const mockFetch = createMockFetch(new Map([
      ['/v1/apis', { status: 200, body: { data: [BLOCKDB_LISTING] } }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();
    const result = await client.api('blockdb-api');

    // Type-level + runtime: new fields surface from gateway response
    expect(result.slug).toBe('blockdb-api');
    expect(result.seller_slug).toBe('blockdb');
    expect(result.seller_account_type).toBe('organization');
    expect(result.organization).toBe('Blockchain Database LTD');
    // Existing fields unchanged
    expect(result.listing_id).toBe('ad3db61c-23d2-41b7-b7ce-5485daa882b6');
    expect(result.service).toBe('blockdb');
  });
});

describe('Phase 51-08: client.sellerProfile() by-handle resolution', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const BLOCKDB_PROFILE = {
    wallet: '9jXisENZUR22DMLH99ottdQ4ukWTapvHcMUBp875HnBJ',
    slug: 'blockdb',
    account_type: 'organization' as const,
    organization: 'Blockchain Database LTD',
    bio_md: 'High-performance blockchain database.',
    banner_url: null,
    website_url: 'https://blockdb.example',
    canonical_handle: 'blockdb',
    canonical_path: '/seller/blockdb',
    services_listed: 1,
    services: ['blockdb'],
    uptime_percent: 0.99,
    latency: { p50: 50, p95: 100, p99: 150 },
    trust_score: 80,
    badges: ['verified'],
    total_requests_served: 1234,
    member_since: '2026-04-01',
    avg_rating: 0.95,
    total_ratings: 12,
    total_active_listings: 1,
    is_verified: true,
  };

  it('Test 5: client.sellerProfile("blockdb") hits /v1/seller/profile/by-handle/blockdb', async () => {
    const mockFetch = createMockFetch(new Map([
      ['/v1/seller/profile/by-handle/', { status: 200, body: BLOCKDB_PROFILE }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();
    const result = await client.sellerProfile('blockdb');

    expect(result.canonical_handle).toBe('blockdb');
    expect(result.canonical_path).toBe('/seller/blockdb');
    const profileCall = mockFetch.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('/v1/seller/profile/by-handle/'),
    );
    expect(profileCall).toBeTruthy();
    const calledUrl = profileCall![0] as string;
    expect(calledUrl).toContain('/v1/seller/profile/by-handle/blockdb');
  });

  it('Test 6: client.sellerProfile(wallet) hits same endpoint — gateway canonicalizes', async () => {
    const mockFetch = createMockFetch(new Map([
      ['/v1/seller/profile/by-handle/', { status: 200, body: BLOCKDB_PROFILE }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();
    const wallet = '9jXisENZUR22DMLH99ottdQ4ukWTapvHcMUBp875HnBJ';
    const result = await client.sellerProfile(wallet);

    // Gateway returns canonical_handle = slug even when input was wallet
    expect(result.canonical_handle).toBe('blockdb');
    const profileCall = mockFetch.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('/v1/seller/profile/by-handle/'),
    );
    const calledUrl = profileCall![0] as string;
    expect(calledUrl).toContain(`/v1/seller/profile/by-handle/${wallet}`);
  });

  it('Test 7: SellerProfileResponse exposes slug, account_type, bio_md, banner_url, website_url, canonical_handle, canonical_path, total_active_listings', async () => {
    const mockFetch = createMockFetch(new Map([
      ['/v1/seller/profile/by-handle/', { status: 200, body: BLOCKDB_PROFILE }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();
    const result = await client.sellerProfile('blockdb');

    // All Phase 51-08 fields must round-trip through the type
    expect(result.slug).toBe('blockdb');
    expect(result.account_type).toBe('organization');
    expect(result.bio_md).toBe('High-performance blockchain database.');
    expect(result.banner_url).toBeNull();
    expect(result.website_url).toBe('https://blockdb.example');
    expect(result.canonical_handle).toBe('blockdb');
    expect(result.canonical_path).toBe('/seller/blockdb');
    expect(result.total_active_listings).toBe(1);
  });
});

describe('Phase 51-08: backwards compatibility', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('Test 8: ListingSummary type still includes core fields + new slug/seller_slug/account_type fields', () => {
    // Type-level test: import the type, build an object satisfying the new shape.
    // If the fields are missing from the type, this won't compile.
    const summary: import('../types/listings.js').ListingSummary = {
      id: 'abc',
      service_name: 'BlockDB',
      service_slug: 'blockdb',
      base_url: 'https://blockdb.example',
      auth_pattern: 'bearer',
      description: null,
      key_masked: '***',
      total_rpm: 100,
      reserved_rpm: 0,
      available_resale_rpm: 100,
      price_per_request: 5000,
      is_active: true,
      categories: [],
      created_at: '2026-04-01',
      updated_at: '2026-04-01',
      // Phase 51-08 additions:
      slug: 'blockdb-api',
      seller_slug: 'blockdb',
      account_type: 'organization',
    };
    expect(summary.slug).toBe('blockdb-api');
    expect(summary.seller_slug).toBe('blockdb');
    expect(summary.account_type).toBe('organization');
  });

  it('Test 9: existing UUID-based api() call returns expected shape (no regression)', async () => {
    const mockFetch = createMockFetch(new Map([
      ['/v1/apis', { status: 200, body: { data: [BLOCKDB_LISTING] } }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();
    const result = await client.api('ad3db61c-23d2-41b7-b7ce-5485daa882b6');

    expect(result.listing_id).toBe('ad3db61c-23d2-41b7-b7ce-5485daa882b6');
    expect(result.service).toBe('blockdb');
    expect(result.is_available).toBe(true);
  });

  it('Test 10: input matching neither UUID/SLUG/COMPOSITE falls through to resolveByService and surfaces ProxyGateError when no listing matches', async () => {
    // 'BadInput!' has uppercase + special chars — doesn't match SLUG_RE, UUID, or COMPOSITE.
    // Falls through to resolveByService which queries ?service= then ?q= and returns empty data.
    const mockFetch = createMockFetch(new Map([
      ['/v1/apis', { status: 200, body: { data: [] } }],
    ]));
    vi.stubGlobal('fetch', mockFetch);

    const client = createClient();

    await expect(client.api('BadInput!')).rejects.toBeInstanceOf(ProxyGateError);
  });
});
