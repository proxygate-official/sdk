import nacl from 'tweetnacl';
import type { SignRequestOptions, AuthHeaders } from './types.js';

/**
 * Fetch a nonce from the Proxygate gateway and sign it with your ed25519 key.
 *
 * Returns auth headers to attach to your authenticated gateway request.
 * Each call to signRequest produces headers valid for ONE request only.
 *
 * @example
 * ```ts
 * import { signRequest } from '@proxygate/sdk';
 *
 * const headers = await signRequest({
 *   gatewayUrl: 'https://gateway.proxygate.ai',
 *   walletAddress: 'YourSolanaPublicKey...',
 *   secretKey: yourKeypair.secretKey,
 * });
 *
 * const res = await fetch('https://gateway.proxygate.ai/v1/balance', {
 *   headers,
 * });
 * ```
 */
export async function signRequest(options: SignRequestOptions): Promise<AuthHeaders> {
  // 1. Fetch nonce from gateway
  const nonceUrl = `${options.gatewayUrl}/v1/nonce?wallet=${encodeURIComponent(options.walletAddress)}`;
  const nonceRes = await fetch(nonceUrl);

  if (!nonceRes.ok) {
    const body = await nonceRes.text().catch(() => '');
    throw new Error(`Nonce request failed (${nonceRes.status}): ${body}`);
  }

  const { nonce } = (await nonceRes.json()) as { nonce: string; expires_in: number };

  // 2. Sign nonce with ed25519 private key
  const messageBytes = new TextEncoder().encode(nonce);
  const signature = nacl.sign.detached(messageBytes, options.secretKey);

  // 3. Encode signature as base64
  const signatureBase64 = bufferToBase64(signature);

  return {
    'x-wallet': options.walletAddress,
    'x-nonce': nonce,
    'x-signature': signatureBase64,
  };
}

/** Convert Uint8Array to base64 string (works in Node.js and browsers). */
function bufferToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Browser fallback
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
