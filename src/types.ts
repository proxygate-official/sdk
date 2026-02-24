/** Options for signRequest. */
export interface SignRequestOptions {
  /** ProxyGate gateway base URL (e.g., 'https://gateway.proxygate.io'). */
  gatewayUrl: string;
  /** Solana wallet public key as base58 string. */
  walletAddress: string;
  /** Ed25519 secret key as 64-byte Uint8Array (Solana keypair secret key). */
  secretKey: Uint8Array;
}

/** Auth headers returned by signRequest. Attach these to your gateway requests. */
export interface AuthHeaders {
  'x-wallet': string;
  'x-nonce': string;
  'x-signature': string;
}
