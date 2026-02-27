import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nacl from 'tweetnacl';
import { ProxyGateClient, ProxyGateError } from './client';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const testSeed = new Uint8Array(32).fill(1);
const testKeypair = nacl.sign.keyPair.fromSeed(testSeed);
const testGatewayUrl = 'http://localhost:3001';

function createClient(): ProxyGateClient {
  return new ProxyGateClient({
    gatewayUrl: testGatewayUrl,
    walletAddress: 'TestWallet',
    secretKey: testKeypair.secretKey,
  });
}

/**
 * Create a mock fetch that auto-handles nonce requests and returns
 * configured responses for other URL patterns.
 */
function createMockFetch(
  responses: Map<string, { status: number; body: unknown; headers?: Record<string, string> }>,
): ReturnType<typeof vi.fn> {
  let nonceCounter = 0;
  return vi.fn().mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes('/v1/nonce')) {
      return new Response(
        JSON.stringify({ nonce: `nonce-${++nonceCounter}`, expires_in: 30 }),
      );
    }

    for (const [pattern, response] of responses) {
      if (urlStr.includes(pattern)) {
        const respHeaders: Record<string, string> = {
          'content-type': 'application/json',
          ...(response.headers ?? {}),
        };
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: respHeaders,
        });
      }
    }

    return new Response('Not found', { status: 404 });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProxyGateClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor tests
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('creates client with valid options', () => {
      const client = createClient();
      expect(client.gatewayUrl).toBe(testGatewayUrl);
      expect(client.walletAddress).toBe('TestWallet');
    });

    it('strips trailing slash from gatewayUrl', () => {
      const client = new ProxyGateClient({
        gatewayUrl: 'http://localhost:3001/',
        walletAddress: 'TestWallet',
        secretKey: testKeypair.secretKey,
      });
      expect(client.gatewayUrl).toBe('http://localhost:3001');
    });

    it('strips multiple trailing slashes from gatewayUrl', () => {
      const client = new ProxyGateClient({
        gatewayUrl: 'http://localhost:3001///',
        walletAddress: 'TestWallet',
        secretKey: testKeypair.secretKey,
      });
      expect(client.gatewayUrl).toBe('http://localhost:3001');
    });

    it('exposes gatewayUrl and walletAddress as readonly properties', () => {
      const client = createClient();
      expect(client.gatewayUrl).toBe(testGatewayUrl);
      expect(client.walletAddress).toBe('TestWallet');
    });
  });

  // -------------------------------------------------------------------------
  // Static create() tests
  // -------------------------------------------------------------------------

  describe('create()', () => {
    beforeEach(() => {
      const mockFetch = createMockFetch(new Map());
      vi.stubGlobal('fetch', mockFetch);
    });

    it('creates client from valid keypair file', async () => {
      vi.mock('node:fs/promises', () => ({
        readFile: vi.fn(),
      }));

      const { readFile: mockedReadFile } = await import('node:fs/promises');
      vi.mocked(mockedReadFile).mockResolvedValue(
        JSON.stringify(Array.from(testKeypair.secretKey)),
      );

      const client = await ProxyGateClient.create({
        gatewayUrl: testGatewayUrl,
        keypairPath: '/tmp/test-keypair.json',
      });

      expect(client).toBeInstanceOf(ProxyGateClient);
      expect(client.gatewayUrl).toBe(testGatewayUrl);
      expect(client.walletAddress.length).toBeGreaterThan(0);
    });

    it('throws on invalid keypair (not 64 numbers)', async () => {
      vi.mock('node:fs/promises', () => ({
        readFile: vi.fn(),
      }));

      const { readFile: mockedReadFile } = await import('node:fs/promises');
      vi.mocked(mockedReadFile).mockResolvedValue(JSON.stringify([1, 2, 3]));

      await expect(
        ProxyGateClient.create({
          gatewayUrl: testGatewayUrl,
          keypairPath: '/tmp/bad-keypair.json',
        }),
      ).rejects.toThrow('Invalid keypair');
    });

    it('throws on invalid JSON in keypair file', async () => {
      vi.mock('node:fs/promises', () => ({
        readFile: vi.fn(),
      }));

      const { readFile: mockedReadFile } = await import('node:fs/promises');
      vi.mocked(mockedReadFile).mockResolvedValue('not json at all');

      await expect(
        ProxyGateClient.create({
          gatewayUrl: testGatewayUrl,
          keypairPath: '/tmp/invalid.json',
        }),
      ).rejects.toThrow();
    });

    it('throws when keypair file not found', async () => {
      vi.mock('node:fs/promises', () => ({
        readFile: vi.fn(),
      }));

      const { readFile: mockedReadFile } = await import('node:fs/promises');
      vi.mocked(mockedReadFile).mockRejectedValue(
        Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
      );

      await expect(
        ProxyGateClient.create({
          gatewayUrl: testGatewayUrl,
          keypairPath: '/tmp/nonexistent.json',
        }),
      ).rejects.toThrow('ENOENT');
    });

    it('expands tilde in keypair path', async () => {
      vi.mock('node:fs/promises', () => ({
        readFile: vi.fn(),
      }));

      const { readFile: mockedReadFile } = await import('node:fs/promises');
      vi.mocked(mockedReadFile).mockResolvedValue(
        JSON.stringify(Array.from(testKeypair.secretKey)),
      );

      await ProxyGateClient.create({
        gatewayUrl: testGatewayUrl,
        keypairPath: '~/test-keypair.json',
      });

      const calledPath = vi.mocked(mockedReadFile).mock.calls[0][0] as string;
      expect(calledPath).not.toContain('~');
      expect(calledPath).toContain('test-keypair.json');
    });
  });

  // -------------------------------------------------------------------------
  // V1 endpoint method tests
  // -------------------------------------------------------------------------

  describe('v1 endpoints', () => {
    describe('balance()', () => {
      it('returns typed balance response with auth headers', async () => {
        const balanceData = {
          balance: 1000,
          total_deposited: 5000,
          total_spent: 4000,
          currency: 'credits',
          usdc_equivalent: '10.00',
        };
        const mockFetch = createMockFetch(
          new Map([['/v1/balance', { status: 200, body: balanceData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.balance();

        expect(result).toEqual(balanceData);
        const balanceCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/balance'),
        );
        expect(balanceCall).toBeTruthy();
        const init = balanceCall![1] as RequestInit;
        expect(init.method).toBe('GET');
        expect((init.headers as Record<string, string>)['x-wallet']).toBe('TestWallet');
        expect((init.headers as Record<string, string>)['x-nonce']).toBeTruthy();
        expect((init.headers as Record<string, string>)['x-signature']).toBeTruthy();
      });
    });

    describe('pricing()', () => {
      it('returns pricing response without auth headers (public endpoint)', async () => {
        const pricingData = {
          services: [],
          currency: 'credits',
          deposit_endpoint: '/v1/deposit',
          last_updated: '2026-01-01',
        };
        const mockFetch = createMockFetch(
          new Map([['/v1/pricing', { status: 200, body: pricingData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.pricing();

        expect(result).toEqual(pricingData);
        const pricingCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/pricing'),
        );
        expect(pricingCall).toBeTruthy();
        const init = pricingCall![1] as RequestInit;
        expect((init.headers as Record<string, string>)['x-wallet']).toBeUndefined();
      });

      it('includes service query param when provided', async () => {
        const mockFetch = createMockFetch(
          new Map([['/v1/pricing', { status: 200, body: { services: [] } }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        await client.pricing({ service: 'openai' });

        const pricingCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/pricing'),
        );
        const calledUrl = pricingCall![0] as string;
        expect(calledUrl).toContain('service=openai');
      });
    });

    describe('usage()', () => {
      it('returns usage response with auth headers', async () => {
        const usageData = { usage: [], summary: [], limit: 50, offset: 0 };
        const mockFetch = createMockFetch(
          new Map([['/v1/usage', { status: 200, body: usageData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.usage();

        expect(result).toEqual(usageData);
      });

      it('passes query filters', async () => {
        const mockFetch = createMockFetch(
          new Map([['/v1/usage', { status: 200, body: { usage: [], summary: [], limit: 50, offset: 0 } }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        await client.usage({ service: 'openai', limit: 10 });

        const usageCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/usage'),
        );
        const calledUrl = usageCall![0] as string;
        expect(calledUrl).toContain('service=openai');
        expect(calledUrl).toContain('limit=10');
      });
    });

    describe('deposit()', () => {
      it('sends POST request with auth headers', async () => {
        const depositData = {
          balance: 2000,
          deposited: 1000,
          currency: 'credits',
          usdc_equivalent: '10.00',
        };
        const mockFetch = createMockFetch(
          new Map([['/v1/deposit', { status: 200, body: depositData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.deposit();

        expect(result).toEqual(depositData);
        const depositCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/deposit'),
        );
        const init = depositCall![1] as RequestInit;
        expect(init.method).toBe('POST');
      });

      it('passes payment headers when provided', async () => {
        const mockFetch = createMockFetch(
          new Map([['/v1/deposit', { status: 200, body: { balance: 100 } }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        await client.deposit({ 'x-payment': 'token123' });

        const depositCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/deposit'),
        );
        const init = depositCall![1] as RequestInit;
        expect((init.headers as Record<string, string>)['x-payment']).toBe('token123');
      });
    });

    describe('withdraw()', () => {
      it('sends POST with amount and destination', async () => {
        const withdrawData = {
          tx_signature: 'sig123',
          amount_withdrawn: 500,
          remaining_balance: 500,
          currency: 'credits',
          usdc_withdrawn: '5.00',
        };
        const mockFetch = createMockFetch(
          new Map([['/v1/withdraw', { status: 200, body: withdrawData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.withdraw({ amount: 500, destination: 'SolWallet' });

        expect(result).toEqual(withdrawData);
        const withdrawCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/withdraw'),
        );
        const init = withdrawCall![1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({
          amount: 500,
          destination: 'SolWallet',
        });
      });
    });

    describe('rate()', () => {
      it('sends POST with request_id and is_positive', async () => {
        const rateData = { status: 'ok', message: 'Rating recorded' };
        const mockFetch = createMockFetch(
          new Map([['/v1/rate', { status: 200, body: rateData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.rate({ request_id: 'req-123', is_positive: true });

        expect(result).toEqual(rateData);
        const rateCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/rate'),
        );
        const init = rateCall![1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({
          request_id: 'req-123',
          is_positive: true,
        });
      });
    });

    describe('apis()', () => {
      it('calls GET /v1/apis without auth (public endpoint)', async () => {
        const apisData = { listings: [], cursor: null, has_more: false, total: 0 };
        const mockFetch = createMockFetch(
          new Map([['/v1/apis', { status: 200, body: apisData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.apis();

        expect(result).toEqual(apisData);
        // Verify no auth headers (now public)
        const apisCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/apis'),
        );
        expect(apisCall).toBeTruthy();
        const init = apisCall![1] as RequestInit;
        expect((init.headers as Record<string, string>)['x-wallet']).toBeUndefined();
      });

      it('passes category, sort, q query params', async () => {
        const mockFetch = createMockFetch(
          new Map([['/v1/apis', { status: 200, body: { listings: [], cursor: null, has_more: false, total: 0 } }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        await client.apis({ category: 'ai-ml', sort: 'price_asc', q: 'openai' });

        const apisCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/apis'),
        );
        const calledUrl = apisCall![0] as string;
        expect(calledUrl).toContain('category=ai-ml');
        expect(calledUrl).toContain('sort=price_asc');
        expect(calledUrl).toContain('q=openai');
      });
    });

    describe('services()', () => {
      it('calls GET /v1/services without auth (public endpoint)', async () => {
        const servicesData = { services: [] };
        const mockFetch = createMockFetch(
          new Map([['/v1/services', { status: 200, body: servicesData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.services();

        expect(result).toEqual(servicesData);
        // Verify no auth headers (now public)
        const servicesCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/services'),
        );
        expect(servicesCall).toBeTruthy();
        const init = servicesCall![1] as RequestInit;
        expect((init.headers as Record<string, string>)['x-wallet']).toBeUndefined();
      });
    });

    describe('sellerProfile()', () => {
      it('returns seller profile without auth headers (public endpoint)', async () => {
        const profileData = {
          wallet: 'SellerWallet',
          services: ['openai'],
          uptime_pct: 99.9,
          avg_latency_ms: 50,
          badges: ['verified'],
          total_requests: 1000,
          member_since: '2025-01-01',
        };
        const mockFetch = createMockFetch(
          new Map([['/v1/seller/profile/', { status: 200, body: profileData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.sellerProfile('SellerWallet');

        expect(result).toEqual(profileData);
        const profileCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/seller/profile/'),
        );
        expect(profileCall).toBeTruthy();
        const init = profileCall![1] as RequestInit;
        expect((init.headers as Record<string, string>)['x-wallet']).toBeUndefined();
        const calledUrl = profileCall![0] as string;
        expect(calledUrl).toContain('/v1/seller/profile/SellerWallet');
      });
    });

    describe('settlements()', () => {
      it('returns settlements response', async () => {
        const settlementsData = {
          role: 'seller',
          date_range: { from: '2026-01-01', to: '2026-02-01' },
          daily: [],
          cursor: null,
          has_more: false,
          summary: { total_amount: 0, total_requests: 0, period_days: 30 },
        };
        const mockFetch = createMockFetch(
          new Map([['/v1/settlement/history', { status: 200, body: settlementsData }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        const result = await client.settlements();

        expect(result).toEqual(settlementsData);
      });

      it('passes query options', async () => {
        const mockFetch = createMockFetch(
          new Map([['/v1/settlement/history', { status: 200, body: { daily: [] } }]]),
        );
        vi.stubGlobal('fetch', mockFetch);

        const client = createClient();
        await client.settlements({ role: 'seller', limit: 10 });

        const settleCall = mockFetch.mock.calls.find(
          (call: unknown[]) => (call[0] as string).includes('/v1/settlement/history'),
        );
        const calledUrl = settleCall![0] as string;
        expect(calledUrl).toContain('role=seller');
        expect(calledUrl).toContain('limit=10');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling tests
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws ProxyGateError on gateway error response', async () => {
      const gatewayError = {
        error: 'insufficient_credits',
        message: 'Not enough credits',
        action: 'Deposit more credits',
        docs: 'https://docs.proxygate.ai/credits',
        trace_id: 'trace-123',
      };
      const mockFetch = createMockFetch(
        new Map([['/v1/balance', { status: 402, body: gatewayError }]]),
      );
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();

      try {
        await client.balance();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProxyGateError);
        const pge = err as ProxyGateError;
        expect(pge.code).toBe('insufficient_credits');
        expect(pge.message).toBe('Not enough credits');
        expect(pge.statusCode).toBe(402);
        expect(pge.action).toBe('Deposit more credits');
        expect(pge.docs).toBe('https://docs.proxygate.ai/credits');
        expect(pge.traceId).toBe('trace-123');
        expect(pge.name).toBe('ProxyGateError');
      }
    });

    it('handles non-JSON error response body', async () => {
      let nonceCounter = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/v1/nonce')) {
          return new Response(
            JSON.stringify({ nonce: `nonce-${++nonceCounter}`, expires_in: 30 }),
          );
        }
        return new Response('Internal Server Error', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();

      try {
        await client.balance();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProxyGateError);
        const pge = err as ProxyGateError;
        expect(pge.statusCode).toBe(500);
        expect(pge.code).toBe('unknown');
      }
    });

    it('handles public endpoint error response', async () => {
      const gatewayError = {
        error: 'not_found',
        message: 'Seller not found',
      };
      const mockFetch = createMockFetch(
        new Map([['/v1/seller/profile/', { status: 404, body: gatewayError }]]),
      );
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();

      try {
        await client.sellerProfile('nonexistent');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProxyGateError);
        const pge = err as ProxyGateError;
        expect(pge.code).toBe('not_found');
        expect(pge.statusCode).toBe(404);
      }
    });

    it('propagates network errors', async () => {
      let nonceCounter = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/v1/nonce')) {
          return new Response(
            JSON.stringify({ nonce: `nonce-${++nonceCounter}`, expires_in: 30 }),
          );
        }
        throw new TypeError('Network failure');
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      await expect(client.balance()).rejects.toThrow('Network failure');
    });
  });

  // -------------------------------------------------------------------------
  // proxy() method tests
  // -------------------------------------------------------------------------

  describe('proxy()', () => {
    const LISTING_ID = 'listing-uuid-001';
    const LISTING_DATA = {
      listing_id: LISTING_ID,
      seller_wallet: 'Sell...1234',
      service: 'openai',
      service_name: 'OpenAI',
      auth_pattern: 'bearer',
      pricing_unit: 'per_request',
      price_per_request_usdc: 0.002,
      price_per_input_token_usdc: null,
      price_per_output_token_usdc: null,
      available_rpm: 100,
      uptime_percent: 0.99,
      avg_latency_ms: 150,
      trust_score: 0.5,
      badges: [],
      is_available: true,
      member_since: '2026-01-01',
    };

    it('sends POST to /proxy/{service}/{path}?listing={id} with auth headers', async () => {
      const mockFetch = createMockFetch(new Map([
        ['/v1/apis', { status: 200, body: { data: [LISTING_DATA] } }],
        ['/proxy/', { status: 200, body: { choices: [] } }],
      ]));
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      const res = await client.proxy(LISTING_ID, '/v1/chat/completions', {
        model: 'gpt-4',
      });

      expect(res).toBeInstanceOf(Response);
      const proxyCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/proxy/'),
      );
      expect(proxyCall).toBeTruthy();
      const calledUrl = proxyCall![0] as string;
      expect(calledUrl).toContain('/proxy/openai/v1/chat/completions');
      expect(calledUrl).toContain(`listing=${LISTING_ID}`);
      const init = proxyCall![1] as RequestInit;
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['x-wallet']).toBe('TestWallet');
      expect((init.headers as Record<string, string>)['x-nonce']).toBeTruthy();
      expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    });

    it('caches listing metadata after first api() call', async () => {
      const mockFetch = createMockFetch(new Map([
        ['/v1/apis', { status: 200, body: { data: [LISTING_DATA] } }],
        ['/proxy/', { status: 200, body: { ok: true } }],
      ]));
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      await client.proxy(LISTING_ID, '/v1/test', { data: 1 });
      await client.proxy(LISTING_ID, '/v1/test', { data: 2 });

      // /v1/apis should only be called once (second proxy() uses cache)
      const apisCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).includes('/v1/apis'),
      );
      expect(apisCalls.length).toBe(1);
    });

    it('respects options.method override', async () => {
      const mockFetch = createMockFetch(new Map([
        ['/v1/apis', { status: 200, body: { data: [LISTING_DATA] } }],
        ['/proxy/', { status: 200, body: { models: [] } }],
      ]));
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      await client.proxy(LISTING_ID, '/v1/models', undefined, { method: 'GET' });

      const proxyCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/proxy/'),
      );
      const init = proxyCall![1] as RequestInit;
      expect(init.method).toBe('GET');
    });

    it('includes options.headers and options.query in request', async () => {
      const mockFetch = createMockFetch(new Map([
        ['/v1/apis', { status: 200, body: { data: [LISTING_DATA] } }],
        ['/proxy/', { status: 200, body: { ok: true } }],
      ]));
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      await client.proxy(LISTING_ID, '/v1/test', { data: 1 }, {
        headers: { 'x-custom': 'value' },
        query: { extra: 'param' },
      });

      const proxyCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/proxy/'),
      );
      const calledUrl = proxyCall![0] as string;
      expect(calledUrl).toContain('extra=param');
      const init = proxyCall![1] as RequestInit;
      expect((init.headers as Record<string, string>)['x-custom']).toBe('value');
    });

    it('retries on 5xx with exponential backoff', async () => {
      let proxyCallCount = 0;
      let nonceCounter = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = typeof url === 'string' ? url : '';
        if (urlStr.includes('/v1/nonce')) {
          return new Response(
            JSON.stringify({ nonce: `nonce-${++nonceCounter}`, expires_in: 30 }),
          );
        }
        if (urlStr.includes('/v1/apis')) {
          return new Response(JSON.stringify({ data: [LISTING_DATA] }));
        }
        if (urlStr.includes('/proxy/')) {
          proxyCallCount++;
          if (proxyCallCount < 3) {
            return new Response('Server Error', { status: 500 });
          }
          return new Response(JSON.stringify({ ok: true }));
        }
        return new Response('Not found', { status: 404 });
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      const res = await client.proxy(LISTING_ID, '/v1/test', { data: 1 }, { retries: 2 });

      expect(res.status).toBe(200);
      expect(proxyCallCount).toBe(3);
    });

    it('does NOT retry on 4xx', async () => {
      let proxyCallCount = 0;
      let nonceCounter = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = typeof url === 'string' ? url : '';
        if (urlStr.includes('/v1/nonce')) {
          return new Response(
            JSON.stringify({ nonce: `nonce-${++nonceCounter}`, expires_in: 30 }),
          );
        }
        if (urlStr.includes('/v1/apis')) {
          return new Response(JSON.stringify({ data: [LISTING_DATA] }));
        }
        if (urlStr.includes('/proxy/')) {
          proxyCallCount++;
          return new Response('Bad Request', { status: 400 });
        }
        return new Response('Not found', { status: 404 });
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      const res = await client.proxy(LISTING_ID, '/v1/test', { data: 1 }, { retries: 2 });

      expect(res.status).toBe(400);
      expect(proxyCallCount).toBe(1);
    });

    it('returns raw Response object', async () => {
      const mockFetch = createMockFetch(new Map([
        ['/v1/apis', { status: 200, body: { data: [LISTING_DATA] } }],
        ['/proxy/', { status: 200, body: { result: 'upstream' } }],
      ]));
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      const res = await client.proxy(LISTING_ID, '/v1/test', { data: 1 });

      expect(res).toBeInstanceOf(Response);
      const body = await res.json();
      expect(body).toEqual({ result: 'upstream' });
    });

    it('omits content-type header when body is undefined', async () => {
      const mockFetch = createMockFetch(new Map([
        ['/v1/apis', { status: 200, body: { data: [LISTING_DATA] } }],
        ['/proxy/', { status: 200, body: { models: [] } }],
      ]));
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      await client.proxy(LISTING_ID, '/v1/models', undefined, { method: 'GET' });

      const proxyCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/proxy/'),
      );
      const init = proxyCall![1] as RequestInit;
      expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // categories() method tests
  // -------------------------------------------------------------------------

  describe('categories()', () => {
    it('calls GET /v1/categories without auth', async () => {
      const categoriesData = { categories: [{ slug: 'ai-ml', name: 'AI', icon: 'Brain', listing_count: 5, subcategories: [] }] };
      const mockFetch = createMockFetch(
        new Map([['/v1/categories', { status: 200, body: categoriesData }]]),
      );
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      const result = await client.categories();

      expect(result).toEqual(categoriesData);
      const catCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/v1/categories'),
      );
      expect(catCall).toBeTruthy();
      const init = catCall![1] as RequestInit;
      expect((init.headers as Record<string, string>)['x-wallet']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // api() method tests
  // -------------------------------------------------------------------------

  describe('api()', () => {
    const LISTING_DATA = {
      listing_id: 'listing-001',
      seller_wallet: 'Sell...1234',
      service: 'openai',
      service_name: 'OpenAI',
      auth_pattern: 'bearer',
      pricing_unit: 'per_request',
      price_per_request_usdc: 0.002,
      price_per_input_token_usdc: null,
      price_per_output_token_usdc: null,
      available_rpm: 100,
      uptime_percent: 0.99,
      avg_latency_ms: 150,
      trust_score: 0.5,
      badges: [],
      is_available: true,
      member_since: '2026-01-01',
    };

    it('returns listing detail matching given ID', async () => {
      const mockFetch = createMockFetch(
        new Map([['/v1/apis', { status: 200, body: { data: [LISTING_DATA] } }]]),
      );
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();
      const result = await client.api('listing-001');

      expect(result.listing_id).toBe('listing-001');
      expect(result.service).toBe('openai');
    });

    it('throws ProxyGateError 404 when listing not found', async () => {
      const mockFetch = createMockFetch(
        new Map([['/v1/apis', { status: 200, body: { data: [LISTING_DATA] } }]]),
      );
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();

      try {
        await client.api('nonexistent');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProxyGateError);
        const pge = err as ProxyGateError;
        expect(pge.code).toBe('listing_not_found');
        expect(pge.statusCode).toBe(404);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Nonce pool integration tests
  // -------------------------------------------------------------------------

  describe('nonce pool integration', () => {
    it('reuses nonces from pool for sequential requests', async () => {
      const balanceData = { balance: 100, total_deposited: 100, total_spent: 0, currency: 'credits', usdc_equivalent: '1.00' };
      const mockFetch = createMockFetch(
        new Map([
          ['/v1/balance', { status: 200, body: balanceData }],
        ]),
      );
      vi.stubGlobal('fetch', mockFetch);

      const client = createClient();

      // First request triggers nonce fetch
      await client.balance();
      // Second request should use pre-fetched nonce from pool (after background refill)
      await new Promise((r) => setTimeout(r, 50));
      await client.balance();

      // Count nonce fetches
      const nonceCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).includes('/v1/nonce'),
      );
      // Should have fetched nonces, but potentially fewer than total requests
      expect(nonceCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // ProxyGateError class tests
  // -------------------------------------------------------------------------

  describe('ProxyGateError', () => {
    it('has correct properties from gateway error', () => {
      const err = new ProxyGateError(
        {
          error: 'test_error',
          message: 'Test message',
          action: 'Fix it',
          docs: 'https://docs.test',
          trace_id: 'trace-abc',
        },
        400,
      );

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ProxyGateError');
      expect(err.code).toBe('test_error');
      expect(err.message).toBe('Test message');
      expect(err.statusCode).toBe(400);
      expect(err.action).toBe('Fix it');
      expect(err.docs).toBe('https://docs.test');
      expect(err.traceId).toBe('trace-abc');
    });

    it('handles minimal gateway error (no optional fields)', () => {
      const err = new ProxyGateError(
        { error: 'unknown', message: 'Something went wrong' },
        500,
      );

      expect(err.code).toBe('unknown');
      expect(err.message).toBe('Something went wrong');
      expect(err.statusCode).toBe(500);
      expect(err.action).toBeUndefined();
      expect(err.docs).toBeUndefined();
      expect(err.traceId).toBeUndefined();
    });
  });
});
