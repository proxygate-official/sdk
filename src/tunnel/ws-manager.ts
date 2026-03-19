import nacl from 'tweetnacl';
import { toBase64 } from './message-handler.js';

/** Build the WebSocket URL from a gateway HTTP URL. */
export function buildWsUrl(gatewayUrl: string): string {
  const base = gatewayUrl.replace(/\/$/, '');
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/tunnel/connect`;
}

/** Fetch nonce and sign it, returning auth headers. */
export async function getAuthHeaders(
  gatewayUrl: string,
  walletAddress: string,
  secretKey: Uint8Array,
): Promise<Record<string, string>> {
  const nonceUrl = `${gatewayUrl}/v1/nonce?wallet=${encodeURIComponent(walletAddress)}`;
  const nonceRes = await fetch(nonceUrl);

  if (!nonceRes.ok) {
    const body = await nonceRes.text().catch(() => '');
    throw new Error(`Nonce request failed (${nonceRes.status}): ${body}`);
  }

  const { nonce } = (await nonceRes.json()) as { nonce: string; expires_in: number };

  const messageBytes = new TextEncoder().encode(nonce);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  const signatureBase64 = toBase64(signature);

  return {
    'x-wallet': walletAddress,
    'x-nonce': nonce,
    'x-signature': signatureBase64,
  };
}

/** Get auth headers for WebSocket upgrade using API key bearer token. */
export function getBearerHeaders(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey}` };
}

/** Reconnect delay in milliseconds. */
export const RECONNECT_DELAY_MS = 5_000;
