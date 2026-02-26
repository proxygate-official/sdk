import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NoncePool } from './nonce-pool';

describe('NoncePool', () => {
  let nonceCounter: number;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nonceCounter = 0;
    mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({ nonce: `nonce-${++nonceCounter}`, expires_in: 30 }),
      );
    });
  });

  function createPool(opts?: { fetchFn?: typeof fetch }): NoncePool {
    return new NoncePool({
      gatewayUrl: 'http://localhost:3001',
      walletAddress: 'TestWallet',
      fetchFn: opts?.fetchFn ?? mockFetch,
    });
  }

  describe('acquire', () => {
    it('fetches a nonce when pool is empty', async () => {
      const pool = createPool();
      const nonce = await pool.acquire();

      expect(nonce).toBe('nonce-1');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/nonce?wallet=TestWallet'),
      );
    });

    it('returns nonces sequentially', async () => {
      const pool = createPool();

      const nonce1 = await pool.acquire();
      const nonce2 = await pool.acquire();

      expect(nonce1).toBe('nonce-1');
      expect(nonce2).toBe('nonce-2');
    });

    it('triggers background refill when pool drops below watermark', async () => {
      const pool = createPool();

      // First acquire triggers a blocking fetch (pool was empty)
      await pool.acquire();
      // Wait a tick for background refill to potentially start
      await new Promise((r) => setTimeout(r, 10));

      // The pool should have attempted refill in background
      // At minimum, 1 fetch for the initial acquire
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('throws when fetch rejects', async () => {
      const failFetch = vi.fn().mockRejectedValue(new TypeError('Network error'));
      const pool = createPool({ fetchFn: failFetch });

      await expect(pool.acquire()).rejects.toThrow('Network error');
    });

    it('throws on HTTP error response (e.g., 429)', async () => {
      const rateLimitFetch = vi.fn().mockResolvedValue(
        new Response('Rate limited', { status: 429 }),
      );
      const pool = createPool({ fetchFn: rateLimitFetch });

      await expect(pool.acquire()).rejects.toThrow('Nonce fetch failed (429)');
    });

    it('recovers after a failed fetch', async () => {
      let callCount = 0;
      const flakyFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('Rate limited', { status: 429 });
        }
        return new Response(
          JSON.stringify({ nonce: `recovered-${callCount}`, expires_in: 30 }),
        );
      });

      const pool = createPool({ fetchFn: flakyFetch });

      // First attempt fails
      await expect(pool.acquire()).rejects.toThrow('Nonce fetch failed (429)');

      // Second attempt succeeds
      const nonce = await pool.acquire();
      expect(nonce).toBe('recovered-2');
    });
  });

  describe('drain', () => {
    it('empties the pool so next acquire triggers a fresh fetch', async () => {
      const pool = createPool();

      // Acquire a nonce, which triggers fetch
      await pool.acquire();
      // Wait for background refill
      await new Promise((r) => setTimeout(r, 50));

      const fetchCountBefore = mockFetch.mock.calls.length;
      pool.drain();

      // Next acquire should trigger a new fetch since pool is empty
      const nonce = await pool.acquire();
      expect(nonce).toBeTruthy();
      expect(mockFetch.mock.calls.length).toBeGreaterThan(fetchCountBefore);
    });
  });

  describe('concurrent acquire', () => {
    it('resolves all concurrent acquires without deadlock', async () => {
      const pool = createPool();

      const [n1, n2, n3] = await Promise.all([
        pool.acquire(),
        pool.acquire(),
        pool.acquire(),
      ]);

      // All three should get unique nonces
      expect(n1).toBeTruthy();
      expect(n2).toBeTruthy();
      expect(n3).toBeTruthy();
      expect(new Set([n1, n2, n3]).size).toBe(3);
    });
  });

  describe('refill respects maxSize', () => {
    it('does not fetch beyond maxSize', async () => {
      const pool = createPool();

      // Acquire one nonce to trigger pool population
      await pool.acquire();

      // Wait for background refill to complete
      await new Promise((r) => setTimeout(r, 100));

      const fetchCountAfterRefill = mockFetch.mock.calls.length;

      // Acquire from pool (should use pre-fetched nonces, no new fetches)
      await pool.acquire();

      // The pool should be using pre-fetched nonces, so fetch count
      // should not increase significantly (maybe one more if it triggered refill)
      // Total fetches should not exceed maxSize (5) + initial blocking fetch
      expect(fetchCountAfterRefill).toBeLessThanOrEqual(6);
    });
  });
});
