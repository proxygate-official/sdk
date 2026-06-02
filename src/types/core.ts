/** Options for signRequest. */
export interface SignRequestOptions {
  /** Proxygate gateway base URL (e.g., 'https://gateway.proxygate.ai'). */
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

/** Options for constructing a ProxygateClient directly. */
export interface ProxygateClientOptions {
  gatewayUrl: string;
  /** API key (starts with pg_live_). Alternative to wallet keypair auth. */
  apiKey?: string;
  /** Delegation token (starts with pg_del_). Scoped, time-limited auth for agents. */
  delegationToken?: string;
  /** Solana wallet public key. Required when using keypair auth. */
  walletAddress?: string;
  /** Ed25519 secret key. Required when using keypair auth or for on-chain operations. */
  secretKey?: Uint8Array;
}

/** Options for the convenience `createClient` factory (reads keypair from file). */
export interface CreateClientOptions {
  gatewayUrl: string;
  keypairPath: string;
}

// ---------------------------------------------------------------------------
// Gateway error type
// ---------------------------------------------------------------------------

/**
 * Phase 51.5: known gateway error codes that consumers can switch on without
 * string-comparison drift. Extend additively when new codes ship; downstream
 * code is expected to handle `string` for unknown codes from newer gateways.
 *
 * Mirrors apps/gateway/src/errors/error-catalog.ts.
 */
export type GatewayErrorCode =
  | 'insufficient_credits'
  | 'rate_limit_exceeded'
  | 'listing_not_found'
  | 'listing_required'
  | 'listing_unavailable'
  | 'service_unavailable'
  | 'validation_error'
  | 'wallet_blocked'
  | 'cooldown_active'
  | 'path_not_allowed'
  | 'deposits_disabled'
  | 'internal_error'
  // Phase 51.5: free-tier rate-limit errors
  | 'daily_free_cap'
  | 'listing_quota_exhausted'
  // Fase 1 (contact-email capture): collision on POST /v1/profile/email/verify
  // when the email is already bound to another identity. Carries an
  // action/docs pointer to the web-claim flow ("sign in with the original
  // method, link your wallet in Settings"). The gateway may emit either code;
  // both are added additively. Source of truth = gateway error-catalog.ts.
  | 'verification_required'
  | 'email_conflict'
  // Username hard-proxy-gate: collision on POST /v1/profile/username
  // (`username_taken`, 409), and the proxy-path block when a wallet has no
  // username and the gate is on (`registration_required`, 403; carries an
  // action pointer to `proxygate init`). Added additively. Source of truth =
  // gateway error-catalog.ts.
  | 'username_taken'
  | 'registration_required';

/** Standard error shape returned by the gateway. */
export interface GatewayError {
  /**
   * Error code. Use {@link GatewayErrorCode} for the known codes when switching
   * on this field. Newer gateway versions may emit codes outside the union;
   * fall back to a default case for those.
   */
  error: GatewayErrorCode | string;
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

/**
 * Seller selection strategy when resolving a service slug to a listing.
 * - 'cheapest': lowest price per request
 * - 'best-rated': highest trust score
 * - 'fastest': lowest average latency
 * - 'popular': highest capacity (default)
 */
export type SellerStrategy = 'cheapest' | 'best-rated' | 'fastest' | 'popular';

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
  /** Seller selection strategy when multiple sellers exist for a service (default: 'popular'). */
  seller?: SellerStrategy;
}

/** Delegate object exposing ProxygateClient internals to VaultClient. */
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
  secretKey: Uint8Array | undefined;
  walletAddress: string;
  gatewayUrl: string;
}
