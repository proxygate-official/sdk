import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nacl from 'tweetnacl';
import { signRequest } from './auth';

const testSeed = new Uint8Array(32).fill(1);
const testKeypair = nacl.sign.keyPair.fromSeed(testSeed);
const testWalletAddress = 'TestWallet123';

describe('signRequest', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns valid auth headers on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ nonce: 'test-nonce', expires_in: 30 })),
    );
    vi.stubGlobal('fetch', mockFetch);

    const headers = await signRequest({
      gatewayUrl: 'http://localhost:3001',
      walletAddress: testWalletAddress,
      secretKey: testKeypair.secretKey,
    });

    expect(headers['x-wallet']).toBe(testWalletAddress);
    expect(headers['x-nonce']).toBe('test-nonce');
    expect(typeof headers['x-signature']).toBe('string');
    expect(headers['x-signature'].length).toBeGreaterThan(0);
  });

  it('calls fetch with correct nonce URL including wallet param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ nonce: 'test-nonce', expires_in: 30 })),
    );
    vi.stubGlobal('fetch', mockFetch);

    await signRequest({
      gatewayUrl: 'http://localhost:3001',
      walletAddress: testWalletAddress,
      secretKey: testKeypair.secretKey,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe(`http://localhost:3001/v1/nonce?wallet=${testWalletAddress}`);
  });

  it('produces a verifiable ed25519 signature', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ nonce: 'verify-me', expires_in: 30 })),
    );
    vi.stubGlobal('fetch', mockFetch);

    const headers = await signRequest({
      gatewayUrl: 'http://localhost:3001',
      walletAddress: testWalletAddress,
      secretKey: testKeypair.secretKey,
    });

    // Decode the base64 signature
    const sigBytes = Buffer.from(headers['x-signature'], 'base64');
    const messageBytes = new TextEncoder().encode('verify-me');

    // Verify with the public key
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      new Uint8Array(sigBytes),
      testKeypair.publicKey,
    );
    expect(isValid).toBe(true);
  });

  it('throws on non-ok nonce response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('Rate limited', { status: 429 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      signRequest({
        gatewayUrl: 'http://localhost:3001',
        walletAddress: testWalletAddress,
        secretKey: testKeypair.secretKey,
      }),
    ).rejects.toThrow('Nonce request failed (429)');
  });

  it('throws on nonce response with empty body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('', { status: 500 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      signRequest({
        gatewayUrl: 'http://localhost:3001',
        walletAddress: testWalletAddress,
        secretKey: testKeypair.secretKey,
      }),
    ).rejects.toThrow('Nonce request failed (500)');
  });

  it('propagates network errors from fetch', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to connect'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      signRequest({
        gatewayUrl: 'http://localhost:3001',
        walletAddress: testWalletAddress,
        secretKey: testKeypair.secretKey,
      }),
    ).rejects.toThrow('Failed to connect');
  });

  it('URL-encodes wallet address with special characters', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ nonce: 'nonce', expires_in: 30 })),
    );
    vi.stubGlobal('fetch', mockFetch);

    const specialWallet = 'wallet+with spaces&chars=test';
    await signRequest({
      gatewayUrl: 'http://localhost:3001',
      walletAddress: specialWallet,
      secretKey: testKeypair.secretKey,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent(specialWallet));
    expect(calledUrl).not.toContain('wallet+with spaces&chars=test');
  });
});
