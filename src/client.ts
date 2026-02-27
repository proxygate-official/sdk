import nacl from 'tweetnacl';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { NoncePool } from './nonce-pool';
import { encodeBase58 } from './base58';
import { VaultClient } from './vault';
import type {
  ProxyGateClientOptions,
  CreateClientOptions,
  AuthHeaders,
  VaultDelegate,
  BalanceResponse,
  PricingResponse,
  UsageResponse,
  RateResponse,
  ApisResponse,
  ServicesResponse,
  SellerProfileResponse,
  SettlementsResponse,
  PricingQueryOptions,
  UsageQueryOptions,
  ApisQueryOptions,
  SettlementsQueryOptions,
  WithdrawOptions,
  RateOptions,
  GatewayError,
  ProxyOptions,
  CategoriesResponse,
  ApiListingDetail,
} from './types';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/** Error thrown when the gateway returns a non-OK response. */
export class ProxyGateError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly action?: string;
  readonly docs?: string;
  readonly traceId?: string;

  constructor(gatewayError: GatewayError, statusCode: number) {
    super(gatewayError.message);
    this.name = 'ProxyGateError';
    this.code = gatewayError.error;
    this.statusCode = statusCode;
    this.action = gatewayError.action;
    this.docs = gatewayError.docs;
    this.traceId = gatewayError.trace_id;
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

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

/**
 * Build a query params record from an options object, filtering out
 * undefined values and converting numbers to strings.
 * Returns undefined if the result is empty.
 */
function buildQuery<T extends object>(
  opts?: T,
): Record<string, string> | undefined {
  if (!opts) return undefined;

  const query: Record<string, string> = {};
  let hasKeys = false;

  for (const [key, value] of Object.entries(opts)) {
    if (value !== undefined && value !== null) {
      query[key] = String(value);
      hasKeys = true;
    }
  }

  return hasKeys ? query : undefined;
}

// ---------------------------------------------------------------------------
// ProxyGateClient
// ---------------------------------------------------------------------------

/**
 * Typed client for the ProxyGate API marketplace.
 *
 * Provides methods for all v1 gateway endpoints (balance, pricing, usage,
 * deposit, withdraw, rate, apis, services, seller profiles, settlements)
 * and a listing-centric `proxy()` method for transparent API proxying.
 *
 * @example
 * ```ts
 * import { ProxyGateClient } from '@proxygate/sdk';
 *
 * // Direct construction
 * const client = new ProxyGateClient({
 *   gatewayUrl: 'https://gateway.proxygate.ai',
 *   walletAddress: 'YourSolanaPublicKey...',
 *   secretKey: yourKeypair.secretKey,
 * });
 *
 * // Or load from keypair file
 * const client = await ProxyGateClient.create({
 *   gatewayUrl: 'https://gateway.proxygate.ai',
 *   keypairPath: '~/.config/solana/id.json',
 * });
 *
 * // Use v1 endpoints
 * const balance = await client.balance();
 *
 * // Proxy through a specific listing
 * const res = await client.proxy('listing-uuid', '/v1/chat/completions', {
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * const data = await res.json();
 * ```
 */
export class ProxyGateClient {
  readonly gatewayUrl: string;
  readonly walletAddress: string;

  private readonly _secretKey: Uint8Array;
  private readonly _noncePool: NoncePool;

  constructor(opts: ProxyGateClientOptions) {
    this.gatewayUrl = opts.gatewayUrl.replace(/\/+$/, '');
    this.walletAddress = opts.walletAddress;
    this._secretKey = opts.secretKey;
    this._noncePool = new NoncePool({
      gatewayUrl: this.gatewayUrl,
      walletAddress: this.walletAddress,
    });
  }

  // -------------------------------------------------------------------------
  // Static factory
  // -------------------------------------------------------------------------

  /**
   * Create a ProxyGateClient by loading a Solana keypair JSON file.
   * Supports `~` expansion and relative paths.
   */
  static async create(opts: CreateClientOptions): Promise<ProxyGateClient> {
    let resolvedPath = opts.keypairPath;

    // Expand ~ to home directory
    if (resolvedPath.startsWith('~')) {
      resolvedPath = resolvedPath.replace(/^~/, homedir());
    }

    resolvedPath = resolve(resolvedPath);

    const raw = await readFile(resolvedPath, 'utf-8');
    const keyArray: unknown = JSON.parse(raw);

    if (
      !Array.isArray(keyArray) ||
      keyArray.length !== 64 ||
      !keyArray.every((n) => typeof n === 'number')
    ) {
      throw new Error(
        `Invalid keypair file: expected a JSON array of 64 numbers, got ${
          Array.isArray(keyArray) ? `array of ${keyArray.length}` : typeof keyArray
        }`,
      );
    }

    const secretKey = Uint8Array.from(keyArray as number[]);
    const publicKey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;
    const walletAddress = encodeBase58(publicKey);

    return new ProxyGateClient({
      gatewayUrl: opts.gatewayUrl,
      walletAddress,
      secretKey,
    });
  }

  // -------------------------------------------------------------------------
  // Listing metadata cache
  // -------------------------------------------------------------------------

  private _listingCache = new Map<string, { service: string }>();

  // -------------------------------------------------------------------------
  // Proxy method (listing-centric)
  // -------------------------------------------------------------------------

  /**
   * Send an authenticated proxy request to a specific listing.
   * Resolves the service slug from listing metadata (cached after first call).
   *
   * @param listingId - The listing UUID to proxy through
   * @param path - The upstream API path (e.g., '/v1/chat/completions')
   * @param body - Request body (JSON-serializable). Omit for GET requests.
   * @param options - Method, headers, query params, retries, signal
   * @returns Raw Response object (call .json() or use .body for streaming)
   *
   * @example
   * ```ts
   * const res = await client.proxy('listing-uuid', '/v1/chat/completions', {
   *   model: 'gpt-4',
   *   messages: [{ role: 'user', content: 'Hello' }],
   * });
   * const data = await res.json();
   * ```
   */
  async proxy(
    listingId: string,
    path: string,
    body?: unknown,
    options?: ProxyOptions,
  ): Promise<Response> {
    // Resolve service slug from cache or fetch listing details
    let meta = this._listingCache.get(listingId);
    if (!meta) {
      const listing = await this.api(listingId);
      meta = { service: listing.service };
      this._listingCache.set(listingId, meta);
    }

    const method = options?.method ?? 'POST';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const fullPath = `/proxy/${meta.service}${normalizedPath}`;
    const query: Record<string, string> = {
      listing: listingId,
      ...(options?.query ?? {}),
    };

    const maxAttempts = 1 + (options?.retries ?? 0);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const authHeaders = await this._signWithNonce();

      const headers: Record<string, string> = {
        ...authHeaders,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options?.headers ?? {}),
      };

      if (attempt > 0) {
        // Exponential backoff with jitter: 100ms, 200ms, 400ms... max 5s
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
        const jitter = Math.random() * delay * 0.1;
        await new Promise((r) => setTimeout(r, delay + jitter));
      }

      try {
        const url = this._buildUrl(fullPath, query);
        const response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: options?.signal,
        });

        // Only retry on 5xx, not 4xx
        if (response.status >= 500 && attempt < maxAttempts - 1) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        return response;
      } catch (err) {
        lastError = err as Error;
        if (attempt >= maxAttempts - 1) throw lastError;
      }
    }

    throw lastError!;
  }

  // -------------------------------------------------------------------------
  // Vault namespace
  // -------------------------------------------------------------------------

  private _vault?: VaultClient;

  /**
   * Vault namespace for non-custodial vault operations.
   *
   * @example
   * ```ts
   * const balance = await client.vault.balance();
   * const deposit = await client.vault.deposit({ amount: 1_000_000 });
   * const results = client.vault.verifyReceipts(receipts);
   * ```
   */
  get vault(): VaultClient {
    if (!this._vault) {
      this._vault = new VaultClient(this._vaultDelegate());
    }
    return this._vault;
  }

  /**
   * Expose internal state needed by VaultClient via a delegate object.
   * @internal
   */
  _vaultDelegate(): VaultDelegate {
    return {
      authenticatedRequest: this._authenticatedRequest.bind(this),
      secretKey: this._secretKey,
      walletAddress: this.walletAddress,
      gatewayUrl: this.gatewayUrl,
    };
  }

  // -------------------------------------------------------------------------
  // V1 endpoint methods
  // -------------------------------------------------------------------------

  /** Get credit balance for the authenticated wallet. */
  async balance(): Promise<BalanceResponse> {
    return this._authenticatedRequest<BalanceResponse>('GET', '/v1/balance');
  }

  /** Get available API pricing. Public endpoint (no wallet auth required). */
  async pricing(opts?: PricingQueryOptions): Promise<PricingResponse> {
    return this._publicRequest<PricingResponse>('GET', '/v1/pricing', {
      query: buildQuery(opts),
    });
  }

  /** Get usage history for the authenticated wallet. */
  async usage(opts?: UsageQueryOptions): Promise<UsageResponse> {
    return this._authenticatedRequest<UsageResponse>('GET', '/v1/usage', {
      query: buildQuery(opts),
    });
  }

  /** Rate a seller after a proxy request. */
  async rate(opts: RateOptions): Promise<RateResponse> {
    return this._authenticatedRequest<RateResponse>('POST', '/v1/rate', {
      body: opts,
    });
  }

  /** Browse available API listings with optional filters. Public endpoint. */
  async apis(opts?: ApisQueryOptions): Promise<ApisResponse> {
    return this._publicRequest<ApisResponse>('GET', '/v1/apis', {
      query: buildQuery(opts),
    });
  }

  /** Get aggregated service stats. Public endpoint. */
  async services(): Promise<ServicesResponse> {
    return this._publicRequest<ServicesResponse>('GET', '/v1/services');
  }

  /**
   * Get all categories with listing counts.
   * Public endpoint (no wallet auth required).
   */
  async categories(): Promise<CategoriesResponse> {
    return this._publicRequest<CategoriesResponse>('GET', '/v1/categories');
  }

  /**
   * Get a single listing by ID with full details.
   * Public endpoint (no wallet auth required).
   *
   * Fetches from /v1/apis with limit=100 and filters client-side
   * by listing_id. Works for current scale (< 100 listings). The result
   * is cached by proxy() so this only runs once per listing per client lifetime.
   */
  async api(listingId: string): Promise<ApiListingDetail> {
    const result = await this._publicRequest<{ data: ApiListingDetail[] }>(
      'GET',
      '/v1/apis',
      { query: { limit: '100' } },
    );
    const listing = result.data.find((l) => l.listing_id === listingId);
    if (!listing) {
      throw new ProxyGateError(
        { error: 'listing_not_found', message: `Listing ${listingId} not found` },
        404,
      );
    }
    return listing;
  }

  /**
   * Get a seller's public profile. Public endpoint (no wallet auth required).
   */
  async sellerProfile(wallet: string): Promise<SellerProfileResponse> {
    return this._publicRequest<SellerProfileResponse>(
      'GET',
      `/v1/seller/profile/${encodeURIComponent(wallet)}`,
    );
  }

  /** Get settlement history for the authenticated wallet. */
  async settlements(opts?: SettlementsQueryOptions): Promise<SettlementsResponse> {
    return this._authenticatedRequest<SettlementsResponse>(
      'GET',
      '/v1/settlement/history',
      { query: buildQuery(opts) },
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Acquire a nonce from the pool and sign it to produce auth headers. */
  private async _signWithNonce(): Promise<AuthHeaders> {
    const nonce = await this._noncePool.acquire();
    const messageBytes = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(messageBytes, this._secretKey);
    const signatureBase64 = bufferToBase64(signature);

    return {
      'x-wallet': this.walletAddress,
      'x-nonce': nonce,
      'x-signature': signatureBase64,
    };
  }

  /** Make an authenticated request and parse the JSON response. */
  private async _authenticatedRequest<T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      query?: Record<string, string>;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const url = this._buildUrl(path, opts?.query);
    const authHeaders = await this._signWithNonce();

    const response = await fetch(url, {
      method,
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        ...(opts?.headers ?? {}),
      },
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts?.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let gatewayError: GatewayError;
      try {
        gatewayError = JSON.parse(body) as GatewayError;
      } catch {
        gatewayError = { error: 'unknown', message: body || `HTTP ${response.status}` };
      }
      throw new ProxyGateError(gatewayError, response.status);
    }

    return (await response.json()) as T;
  }

  /** Make a public (unauthenticated) request and parse the JSON response. */
  private async _publicRequest<T>(
    method: string,
    path: string,
    opts?: { query?: Record<string, string> },
  ): Promise<T> {
    const url = this._buildUrl(path, opts?.query);

    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let gatewayError: GatewayError;
      try {
        gatewayError = JSON.parse(body) as GatewayError;
      } catch {
        gatewayError = { error: 'unknown', message: body || `HTTP ${response.status}` };
      }
      throw new ProxyGateError(gatewayError, response.status);
    }

    return (await response.json()) as T;
  }

  /** Build a full URL with optional query parameters. */
  private _buildUrl(
    path: string,
    query?: Record<string, string>,
  ): string {
    const url = new URL(`${this.gatewayUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }
}
