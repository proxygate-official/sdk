import nacl from 'tweetnacl';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { NoncePool } from './nonce-pool';
import { createServiceChain } from './proxy-chain';
import { parseSSE } from './stream';
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
  DepositResponse,
  WithdrawResponse,
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
  RequestOptions,
  SSEEvent,
  GatewayError,
  ProxyChain,
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
 * and a fluent `proxy` property for transparent API proxying.
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
 * // Use proxy chain
 * const res = await client.proxy.openai.v1.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
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
  // Proxy chain getter
  // -------------------------------------------------------------------------

  /**
   * Fluent proxy chain for upstream API access.
   *
   * @example
   * ```ts
   * // GET /proxy/openai/v1/models
   * await client.proxy.openai.v1.models.get();
   *
   * // POST /proxy/openai/v1/chat/completions (streaming)
   * for await (const event of client.proxy.openai.v1.chat.completions.stream({
   *   model: 'gpt-4',
   *   messages: [{ role: 'user', content: 'Hello' }],
   * })) {
   *   console.log(event.data);
   * }
   * ```
   */
  get proxy(): ProxyChain {
    return createServiceChain(this);
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

  /**
   * Deposit credits via x402 payment.
   * Pass x402 payment headers via `paymentHeaders` if needed.
   */
  async deposit(paymentHeaders?: Record<string, string>): Promise<DepositResponse> {
    return this._authenticatedRequest<DepositResponse>('POST', '/v1/deposit', {
      headers: paymentHeaders,
    });
  }

  /** Withdraw credits back to USDC. */
  async withdraw(opts: WithdrawOptions): Promise<WithdrawResponse> {
    return this._authenticatedRequest<WithdrawResponse>('POST', '/v1/withdraw', {
      body: opts,
    });
  }

  /** Rate a seller after a proxy request. */
  async rate(opts: RateOptions): Promise<RateResponse> {
    return this._authenticatedRequest<RateResponse>('POST', '/v1/rate', {
      body: opts,
    });
  }

  /** Browse available API listings with optional filters. */
  async apis(opts?: ApisQueryOptions): Promise<ApisResponse> {
    return this._authenticatedRequest<ApisResponse>('GET', '/v1/apis', {
      query: buildQuery(opts),
    });
  }

  /** Get aggregated service stats. */
  async services(): Promise<ServicesResponse> {
    return this._authenticatedRequest<ServicesResponse>('GET', '/v1/services');
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
  // ProxyExecutor interface (used by proxy-chain.ts)
  // -------------------------------------------------------------------------

  /**
   * Execute an authenticated proxy request.
   * Returns the raw Response (upstream formats vary).
   */
  async request(
    method: string,
    segments: string[],
    opts?: RequestOptions & { body?: unknown },
  ): Promise<Response> {
    const path = `/proxy/${segments.join('/')}`;
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

    return response;
  }

  /**
   * Execute an authenticated streaming proxy request.
   * Yields SSE events parsed from the response stream.
   */
  async *streamRequest(
    method: string,
    segments: string[],
    opts?: RequestOptions & { body?: unknown },
  ): AsyncGenerator<SSEEvent> {
    const path = `/proxy/${segments.join('/')}`;
    const url = this._buildUrl(path, opts?.query);
    const authHeaders = await this._signWithNonce();

    const response = await fetch(url, {
      method,
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        accept: 'text/event-stream',
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
        gatewayError = { error: 'stream_error', message: body || `HTTP ${response.status}` };
      }
      throw new ProxyGateError(gatewayError, response.status);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      throw new ProxyGateError(
        {
          error: 'invalid_content_type',
          message: `Expected text/event-stream but got ${contentType}`,
        },
        response.status,
      );
    }

    yield* parseSSE(response);
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
