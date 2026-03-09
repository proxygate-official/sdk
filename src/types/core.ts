/** Options for signRequest. */
export interface SignRequestOptions {
  /** ProxyGate gateway base URL (e.g., 'https://gateway.proxygate.ai'). */
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

// ---------------------------------------------------------------------------
// Client construction options
// ---------------------------------------------------------------------------

/** Options for constructing a ProxyGateClient directly. */
export interface ProxyGateClientOptions {
  gatewayUrl: string;
  walletAddress: string;
  secretKey: Uint8Array;
}

/** Options for the convenience `createClient` factory (reads keypair from file). */
export interface CreateClientOptions {
  gatewayUrl: string;
  keypairPath: string;
}

// ---------------------------------------------------------------------------
// Gateway error type
// ---------------------------------------------------------------------------

/** Standard error shape returned by the gateway. */
export interface GatewayError {
  error: string;
  message: string;
  action?: string;
  docs?: string;
  trace_id?: string;
}

// ---------------------------------------------------------------------------
// SSE event type
// ---------------------------------------------------------------------------

/** A single server-sent event parsed from a streaming response. */
export interface SSEEvent {
  data: string;
  event?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Proxy options (replaces ProxyChain)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shield types
// ---------------------------------------------------------------------------

/** Shield scanning mode for proxy requests. */
export type ShieldMode = 'monitor' | 'strict' | 'off';

/** Shield metadata returned in proxy response headers. */
export interface ShieldInfo {
  /** Mode that was applied: 'monitored' or 'strict'. */
  mode: string;
  /** Threat score (0.0 = safe, 1.0 = malicious). Only present in strict mode. */
  score?: number;
  /** Comma-separated flags. 'none' if clean. Only present in strict mode. */
  flags?: string;
}

/** Error body returned when Shield blocks a response (HTTP 422). */
export interface ShieldBlockedError {
  error: 'response_blocked';
  code: 'shield_blocked';
  shield_score: number;
  shield_flags: string[];
  refunded: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Proxy options (replaces ProxyChain)
// ---------------------------------------------------------------------------

/** Options for client.proxy() method. */
export interface ProxyOptions {
  /** HTTP method (default: POST). */
  method?: string;
  /** Additional headers to send with the request. */
  headers?: Record<string, string>;
  /** Query parameters to append to the URL. */
  query?: Record<string, string>;
  /** AbortSignal for request cancellation. */
  signal?: AbortSignal;
  /** Number of retries on 5xx or network errors (default: 0). */
  retries?: number;
  /** Shield scanning mode override for this request (default: buyer profile setting). */
  shield?: ShieldMode;
}

/** Delegate object exposing ProxyGateClient internals to VaultClient. */
export interface VaultDelegate {
  authenticatedRequest: <T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      query?: Record<string, string>;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ) => Promise<T>;
  secretKey: Uint8Array;
  walletAddress: string;
  gatewayUrl: string;
}
