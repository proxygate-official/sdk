import { describe, it, expect } from 'vitest';
import {
  ProxygateError,
  SpendLimitError,
  isSpendLimitError,
  spendLimitErrorFromResponse,
  SPEND_LIMIT_ERROR_CODES,
  bearerRequest,
} from './helpers.js';

describe('SpendLimitError', () => {
  it('maps the per-tx code to reason "per_tx"', () => {
    const err = new SpendLimitError(
      { error: 'per_tx_spend_limit_exceeded', message: 'too big' },
      429,
    );
    expect(err).toBeInstanceOf(ProxygateError);
    expect(err).toBeInstanceOf(SpendLimitError);
    expect(err.reason).toBe('per_tx');
    expect(err.code).toBe('per_tx_spend_limit_exceeded');
    expect(err.statusCode).toBe(429);
    expect(err.name).toBe('SpendLimitError');
    expect(err.message).toBe('too big');
  });

  it('maps the daily code to reason "daily"', () => {
    const err = new SpendLimitError(
      { error: 'daily_spend_limit_exceeded', message: 'spent out' },
      429,
    );
    expect(err.reason).toBe('daily');
  });

  it('exposes the spend-limit codes', () => {
    expect(SPEND_LIMIT_ERROR_CODES).toContain('daily_spend_limit_exceeded');
    expect(SPEND_LIMIT_ERROR_CODES).toContain('per_tx_spend_limit_exceeded');
  });
});

describe('isSpendLimitError', () => {
  it('is true for a SpendLimitError', () => {
    const err = new SpendLimitError({ error: 'daily_spend_limit_exceeded', message: 'x' }, 429);
    expect(isSpendLimitError(err)).toBe(true);
  });

  it('is false for a plain ProxygateError and other values', () => {
    expect(isSpendLimitError(new ProxygateError({ error: 'rate_limited', message: 'x' }, 429))).toBe(false);
    expect(isSpendLimitError(new Error('nope'))).toBe(false);
    expect(isSpendLimitError(null)).toBe(false);
  });
});

describe('spendLimitErrorFromResponse', () => {
  const json = (body: unknown, status: number): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('returns a SpendLimitError for a 429 with a spend-limit code', async () => {
    const res = json({ error: 'daily_spend_limit_exceeded', message: 'Daily spend limit exceeded' }, 429);
    const err = await spendLimitErrorFromResponse(res);
    expect(err).toBeInstanceOf(SpendLimitError);
    expect(err?.reason).toBe('daily');
    expect(err?.statusCode).toBe(429);
  });

  it('carries reason per_tx and the parsed raw body', async () => {
    const body = { error: 'per_tx_spend_limit_exceeded', message: 'too big', trace_id: 'abc' };
    const err = await spendLimitErrorFromResponse(json(body, 429));
    expect(err?.reason).toBe('per_tx');
    expect(err?.traceId).toBe('abc');
    expect(err?.raw).toEqual(body);
  });

  it('returns null for a non-429 status', async () => {
    expect(await spendLimitErrorFromResponse(json({ error: 'daily_spend_limit_exceeded', message: 'x' }, 402))).toBeNull();
  });

  it('returns null for a 429 with a non-spend-limit code', async () => {
    expect(await spendLimitErrorFromResponse(json({ error: 'rate_limited', message: 'x' }, 429))).toBeNull();
  });

  it('returns null for a 429 with a non-JSON body', async () => {
    const res = new Response('rate limited', { status: 429 });
    expect(await spendLimitErrorFromResponse(res)).toBeNull();
  });
});

describe('parseErrorResponse via bearerRequest', () => {
  // bearerRequest uses fetch; override globalThis.fetch to feed a canned response.
  const withFetch = async (response: Response, fn: () => Promise<unknown>): Promise<unknown> => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => response) as typeof fetch;
    try {
      return await fn();
    } finally {
      globalThis.fetch = original;
    }
  };

  it('throws a SpendLimitError when the gateway returns a spend-limit 429', async () => {
    const res = new Response(
      JSON.stringify({ error: 'per_tx_spend_limit_exceeded', message: 'too big' }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    );
    await withFetch(res, async () => {
      await expect(bearerRequest('http://gw/x', 'POST', 'pg_live_key')).rejects.toBeInstanceOf(SpendLimitError);
    });
  });

  it('throws a plain ProxygateError (not SpendLimitError) for a generic 429', async () => {
    const res = new Response(
      JSON.stringify({ error: 'rate_limited', message: 'slow down' }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    );
    await withFetch(res, async () => {
      try {
        await bearerRequest('http://gw/x', 'POST', 'pg_live_key');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProxygateError);
        expect(isSpendLimitError(err)).toBe(false);
      }
    });
  });
});
