import { describe, it, expect, vi, afterEach } from 'vitest';
import { decodeDelegationToken, isDelegationExpiringSoon } from './delegation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `pg_del_${header}.${body}.fake-sig`;
}

const NOW_EPOCH = 1700000000;

const validPayload = {
  sub: '7xKXtg2CW87d9VCdDzGVqVoR3GAJOkCgapL5TzuM9RAh',
  scopes: ['proxy:openai', 'proxy:anthropic'],
  jti: 'tok_abc123',
  exp: NOW_EPOCH + 7200,
  iat: NOW_EPOCH,
};

// ---------------------------------------------------------------------------
// decodeDelegationToken
// ---------------------------------------------------------------------------

describe('decodeDelegationToken', () => {
  it('decodes valid token and returns correct claims', () => {
    const token = makeTestToken(validPayload);
    const claims = decodeDelegationToken(token);

    expect(claims.sub).toBe(validPayload.sub);
    expect(claims.scopes).toEqual(['proxy:openai', 'proxy:anthropic']);
    expect(claims.jti).toBe('tok_abc123');
    expect(claims.exp).toBe(NOW_EPOCH + 7200);
    expect(claims.iat).toBe(NOW_EPOCH);
  });

  it('throws on token without pg_del_ prefix', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(validPayload));
    const rawJwt = `${header}.${body}.fake-sig`;

    expect(() => decodeDelegationToken(rawJwt)).toThrow('Not a delegation token');
  });

  it('throws on malformed JWT with wrong number of parts', () => {
    expect(() => decodeDelegationToken('pg_del_only-one-part')).toThrow(
      'Invalid JWT structure',
    );
    expect(() => decodeDelegationToken('pg_del_a.b')).toThrow(
      'Invalid JWT structure',
    );
    expect(() => decodeDelegationToken('pg_del_a.b.c.d')).toThrow(
      'Invalid JWT structure',
    );
  });

  it('handles URL-safe base64 characters correctly', () => {
    // Craft a payload that produces + and / in standard base64
    const payload = {
      sub: '>>>???', // characters that produce +/= in base64
      scopes: [],
      jti: 'id',
      exp: 9999999999,
      iat: 1000000000,
    };
    const token = makeTestToken(payload);
    const claims = decodeDelegationToken(token);

    expect(claims.sub).toBe('>>>???');
  });

  it('includes optional ip_lock claim when present', () => {
    const payload = { ...validPayload, ip_lock: '192.168.1.1' };
    const token = makeTestToken(payload);
    const claims = decodeDelegationToken(token);

    expect(claims.ip_lock).toBe('192.168.1.1');
  });
});

// ---------------------------------------------------------------------------
// isDelegationExpiringSoon
// ---------------------------------------------------------------------------

describe('isDelegationExpiringSoon', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for token expiring in 2+ hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_EPOCH * 1000);

    const token = makeTestToken({ ...validPayload, exp: NOW_EPOCH + 7200 });
    expect(isDelegationExpiringSoon(token)).toBe(false);
  });

  it('returns true for token expiring in less than 1 hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_EPOCH * 1000);

    const token = makeTestToken({ ...validPayload, exp: NOW_EPOCH + 1800 });
    expect(isDelegationExpiringSoon(token)).toBe(true);
  });

  it('returns true for already expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_EPOCH * 1000);

    const token = makeTestToken({ ...validPayload, exp: NOW_EPOCH - 600 });
    expect(isDelegationExpiringSoon(token)).toBe(true);
  });

  it('accepts custom threshold parameter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_EPOCH * 1000);

    // Token expires in 30 minutes — within 2h threshold, outside 10min threshold
    const token = makeTestToken({ ...validPayload, exp: NOW_EPOCH + 1800 });

    expect(isDelegationExpiringSoon(token, 7200)).toBe(true);
    expect(isDelegationExpiringSoon(token, 600)).toBe(false);
  });
});
