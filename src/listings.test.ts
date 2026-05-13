import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nacl from 'tweetnacl';
import { ProxygateClient } from './client.js';
import type { EndpointPriceOverride } from './types.js';

// ---------------------------------------------------------------------------
// Phase 51.6: free + mixed-pricing + provider_logo_url
//
// Covers the four SPEC matrix rows for the SDK surface:
//   row 1: price=0 default, no endpoint overrides (free listing)
//   row 2: price=1000 default, no overrides (paid listing — regression)
//   row 3: price=1000 default + free endpoint overrides (paid + free)
//   row 4: price=0 default + paid endpoint overrides (free + paid)
// Plus: provider_logo_url round-trips through the create body.
// ---------------------------------------------------------------------------

const testSeed = new Uint8Array(32).fill(51);
const testKeypair = nacl.sign.keyPair.fromSeed(testSeed);
const testGatewayUrl = 'http://localhost:3001';

function createClient(): ProxygateClient {
  return new ProxygateClient({
    gatewayUrl: testGatewayUrl,
    walletAddress: 'TestWallet516',
    secretKey: testKeypair.secretKey,
  });
}

interface CapturedRequest {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

/**
 * Build a fetch mock that:
 *   * auto-answers /v1/nonce
 *   * captures the POST /v1/listings body
 *   * returns a successful CreateListingResponse
 */
function captureCreateBody(captured: CapturedRequest[]): ReturnType<typeof vi.fn> {
  let nonceCounter = 0;
  return vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    if (urlStr.includes('/v1/nonce')) {
      return new Response(
        JSON.stringify({ nonce: `nonce-${++nonceCounter}`, expires_in: 30 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (urlStr.includes('/v1/listings')) {
      const rawBody = init?.body;
      const parsed: Record<string, unknown> | null =
        typeof rawBody === 'string'
          ? (JSON.parse(rawBody) as Record<string, unknown>)
          : null;
      captured.push({ url: urlStr, method: init?.method ?? 'GET', body: parsed });
      return new Response(
        JSON.stringify({
          id: 'new-listing-id',
          service: 'test-service',
          is_active: false,
          key_masked: 'none',
          sync_status: 'pending',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('Not found', { status: 404 });
  });
}

describe('Phase 51.6: free + mixed-pricing + provider_logo_url', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const baseOpts = {
    service_name: 'Test API',
    service_base_url: 'https://api.test.com',
    total_rpm: 60,
    reserved_rpm: 0,
    category_slugs: ['ai'],
    auth_pattern: 'none' as const,
  };

  it('row 1: price=0 (pending free listing) — body.price_per_request === 0', async () => {
    const captured: CapturedRequest[] = [];
    vi.stubGlobal('fetch', captureCreateBody(captured));

    const client = createClient();
    const result = await client.listings.create({ ...baseOpts, price_per_request: 0 });

    expect(result.id).toBe('new-listing-id');
    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('POST');
    expect(captured[0].url).toContain('/v1/listings');
    expect(captured[0].body?.price_per_request).toBe(0);
    expect(captured[0].body?.endpoint_prices).toBeUndefined();
  });

  it('row 2: price=1000 (paid) — body.price_per_request === 1000', async () => {
    const captured: CapturedRequest[] = [];
    vi.stubGlobal('fetch', captureCreateBody(captured));

    const client = createClient();
    await client.listings.create({ ...baseOpts, price_per_request: 1000 });

    expect(captured).toHaveLength(1);
    expect(captured[0].body?.price_per_request).toBe(1000);
    expect(captured[0].body?.endpoint_prices).toBeUndefined();
  });

  it('row 3: paid default + free endpoint overrides — body has both fields', async () => {
    const captured: CapturedRequest[] = [];
    vi.stubGlobal('fetch', captureCreateBody(captured));

    const overrides: EndpointPriceOverride[] = [
      { path: '/v1/sample', pricing_unit: 'per_request', price_per_request: 0 },
      { path: '/v1/ping', pricing_unit: 'per_request', price_per_request: 0, daily_cap_per_wallet: 50 },
    ];

    const client = createClient();
    await client.listings.create({
      ...baseOpts,
      price_per_request: 1000,
      endpoint_prices: overrides,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].body?.price_per_request).toBe(1000);
    const sent = captured[0].body?.endpoint_prices as EndpointPriceOverride[];
    expect(Array.isArray(sent)).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0].price_per_request).toBe(0);
    expect(sent[1].price_per_request).toBe(0);
    expect(sent[1].daily_cap_per_wallet).toBe(50);
  });

  it('row 4: free default + paid endpoint overrides — body has price=0 + paid overrides', async () => {
    const captured: CapturedRequest[] = [];
    vi.stubGlobal('fetch', captureCreateBody(captured));

    const overrides: EndpointPriceOverride[] = [
      { path: '/v1/premium', pricing_unit: 'per_request', price_per_request: 5000 },
      { path: '/v1/bulk', pricing_unit: 'per_request', price_per_request: 10000 },
    ];

    const client = createClient();
    await client.listings.create({
      ...baseOpts,
      price_per_request: 0,
      endpoint_prices: overrides,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].body?.price_per_request).toBe(0);
    const sent = captured[0].body?.endpoint_prices as EndpointPriceOverride[];
    expect(Array.isArray(sent)).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0].price_per_request).toBe(5000);
    expect(sent[1].price_per_request).toBe(10000);
  });

  it('round-trips provider_logo_url to POST body', async () => {
    const captured: CapturedRequest[] = [];
    vi.stubGlobal('fetch', captureCreateBody(captured));

    const client = createClient();
    await client.listings.create({
      ...baseOpts,
      price_per_request: 1000,
      provider_logo_url: 'https://cdn.example.com/logo.png',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].body?.provider_logo_url).toBe('https://cdn.example.com/logo.png');
  });
});
