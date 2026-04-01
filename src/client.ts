import nacl from 'tweetnacl';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { NoncePool } from './nonce-pool.js';
import { encodeBase58 } from './base58.js';
import { parseKeypairBytes } from './keypair.js';
import { VaultClient } from './vault.js';
import { ListingsClient } from './listings.js';
import { JobsClient } from './jobs.js';
import { createTunnelClient } from './tunnel.js';
import { decodeDelegationToken, isDelegationExpiringSoon } from './auth/delegation.js';
import {
  ProxyGateError, bufferToBase64, buildQuery,
  buildUrl, authenticatedRequest, bearerRequest, publicRequest,
} from './client/helpers.js';
import * as apiMethods from './client/api-methods.js';
import type { ApiMethodDeps } from './client/api-methods.js';
import { proxyRequest } from './client/proxy-methods.js';
import type {
  ProxyGateClientOptions, CreateClientOptions, AuthHeaders, VaultDelegate,
  VaultBalanceResponse, PricingResponse, UsageResponse, RateResponse,
  ApisResponse, ServicesResponse, SellerProfileResponse, SettlementsResponse,
  PricingQueryOptions, UsageQueryOptions, ApisQueryOptions, SettlementsQueryOptions,
  RateOptions, ProxyOptions, CategoriesResponse, ApiListingDetail, ListingDocsResponse,
  TunnelServiceConfig, TunnelClient, ServeOptions,
} from './types.js';

export { ProxyGateError } from './client/helpers.js';

/**
 * Typed client for the ProxyGate API marketplace.
 * Provides methods for all v1 gateway endpoints and listing-centric proxy.
 *
 * Supports four auth modes:
 * - **API key only**: `{ gatewayUrl, apiKey }` — Bearer auth for all requests
 * - **Delegation token**: `{ gatewayUrl, delegationToken }` — Scoped, time-limited Bearer auth
 * - **Keypair only**: `{ gatewayUrl, walletAddress, secretKey }` — wallet-sig auth (existing)
 * - **Dual mode**: `{ gatewayUrl, apiKey, walletAddress, secretKey }` — Bearer for proxy/reads, keypair for vault ops
 */
export class ProxyGateClient {
  readonly gatewayUrl: string;
  readonly walletAddress: string;
  private readonly _apiKey?: string;
  private readonly _delegationToken?: string;
  private readonly _secretKey?: Uint8Array;
  private readonly _noncePool?: NoncePool;
  private _listingCache = new Map<string, { service: string }>();

  constructor(opts: ProxyGateClientOptions) {
    // Validate at least one auth method
    if (!opts.apiKey && !opts.delegationToken && (!opts.walletAddress || !opts.secretKey)) {
      throw new ProxyGateError(
        { error: 'invalid_config', message: 'Provide apiKey, delegationToken, or walletAddress + secretKey. Get started: app.proxygate.ai/wallets' },
        0,
      );
    }

    // Validate apiKey format
    if (opts.apiKey && (!opts.apiKey.startsWith('pg_live_') || opts.apiKey.length < 20)) {
      throw new ProxyGateError(
        { error: 'invalid_api_key', message: 'API key must start with pg_live_ and be at least 20 characters. Get a key: app.proxygate.ai/wallets' },
        0,
      );
    }

    // Validate delegation token format and derive wallet address
    if (opts.delegationToken) {
      if (!opts.delegationToken.startsWith('pg_del_')) {
        throw new ProxyGateError(
          { error: 'invalid_delegation_token', message: 'Delegation token must start with pg_del_. Run `proxygate login` to authenticate.' },
          0,
        );
      }
      const claims = decodeDelegationToken(opts.delegationToken);
      if (!opts.walletAddress) {
        opts = { ...opts, walletAddress: claims.sub };
      }
    }

    this.gatewayUrl = opts.gatewayUrl.replace(/\/+$/, '');
    this.walletAddress = opts.walletAddress ?? '';
    this._apiKey = opts.apiKey;
    this._delegationToken = opts.delegationToken;
    this._secretKey = opts.secretKey;

    // Only create nonce pool when keypair auth is available
    if (opts.walletAddress && opts.secretKey) {
      this._noncePool = new NoncePool({ gatewayUrl: this.gatewayUrl, walletAddress: this.walletAddress });
    }
  }

  static async create(opts: CreateClientOptions): Promise<ProxyGateClient> {
    let resolvedPath = opts.keypairPath;
    if (resolvedPath.startsWith('~')) resolvedPath = resolvedPath.replace(/^~/, homedir());
    resolvedPath = resolve(resolvedPath);
    const raw = await readFile(resolvedPath, 'utf-8');
    const secretKey = parseKeypairBytes(raw);
    const publicKey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;
    return new ProxyGateClient({ gatewayUrl: opts.gatewayUrl, walletAddress: encodeBase58(publicKey), secretKey });
  }

  async proxy(listingId: string, path: string, body?: unknown, options?: ProxyOptions): Promise<Response> {
    return proxyRequest(
      {
        gatewayUrl: this.gatewayUrl,
        getAuthHeaders: () => this._getAuthHeaders(),
        buildUrl: (p, q) => buildUrl(this.gatewayUrl, p, q),
        fetchApi: (id) => this.api(id),
        resolveByService: (name, seller) => this.resolveByService(name, seller),
      },
      this._listingCache, listingId, path, body, options,
    );
  }

  private _vault?: VaultClient;
  get vault(): VaultClient { if (!this._vault) this._vault = new VaultClient(this._vaultDelegate()); return this._vault; }

  private _listings?: ListingsClient;
  get listings(): ListingsClient { if (!this._listings) this._listings = new ListingsClient(this._vaultDelegate()); return this._listings; }

  private _jobs?: JobsClient;
  get jobs(): JobsClient { if (!this._jobs) this._jobs = new JobsClient(this._vaultDelegate()); return this._jobs; }

  // -------------------------------------------------------------------------
  // Tunnel / Serve
  // -------------------------------------------------------------------------

  /**
   * Expose local services to the ProxyGate network via WebSocket tunnel.
   * Accepts either API key (bearer auth) or keypair (wallet-sig) for tunnel authentication.
   */
  async serve(
    services: TunnelServiceConfig[],
    options?: ServeOptions,
  ): Promise<TunnelClient> {
    if (!this._apiKey && !this._secretKey) {
      throw new ProxyGateError(
        { error: 'auth_required', message: 'Tunnel requires either apiKey or walletAddress + secretKey.' },
        0,
      );
    }

    const tunnel = createTunnelClient({
      gatewayUrl: this.gatewayUrl,
      apiKey: this._apiKey,
      walletAddress: this.walletAddress || undefined,
      secretKey: this._secretKey,
      services,
      onConnected: options?.onConnected,
      onDisconnected: options?.onDisconnected,
      onError: options?.onError,
      onRequest: options?.onRequest,
    });

    await tunnel.connect();
    return tunnel;
  }

  /** @internal */
  _vaultDelegate(): VaultDelegate {
    return { authenticatedRequest: this._authenticatedRequest.bind(this), secretKey: this._secretKey, walletAddress: this.walletAddress, gatewayUrl: this.gatewayUrl };
  }

  private get _apiDeps(): ApiMethodDeps {
    return { authenticatedRequest: this._authenticatedRequest.bind(this), publicRequest: this._publicRequest.bind(this), buildQuery };
  }

  async balance(): Promise<VaultBalanceResponse> { return apiMethods.balance(this._apiDeps); }
  async pricing(opts?: PricingQueryOptions): Promise<PricingResponse> { return apiMethods.pricing(this._apiDeps, opts); }
  async usage(opts?: UsageQueryOptions): Promise<UsageResponse> { return apiMethods.usage(this._apiDeps, opts); }
  async rate(opts: RateOptions): Promise<RateResponse> { return apiMethods.rate(this._apiDeps, opts); }
  async apis(opts?: ApisQueryOptions): Promise<ApisResponse> { return apiMethods.apis(this._apiDeps, opts); }
  async services(): Promise<ServicesResponse> { return apiMethods.services(this._apiDeps); }
  async categories(): Promise<CategoriesResponse> { return apiMethods.categories(this._apiDeps); }
  async api(listingId: string): Promise<ApiListingDetail> { return apiMethods.api(this._apiDeps, listingId); }
  async resolveByService(nameOrSlug: string, seller?: import('./types.js').SellerStrategy): Promise<ApiListingDetail> { return apiMethods.resolveByService(this._apiDeps, nameOrSlug, seller); }
  async docs(listingId: string): Promise<ListingDocsResponse | null> { return apiMethods.docs(this._apiDeps, listingId); }
  async sellerProfile(wallet: string): Promise<SellerProfileResponse> { return apiMethods.sellerProfile(this._apiDeps, wallet); }
  async settlements(opts?: SettlementsQueryOptions): Promise<SettlementsResponse> { return apiMethods.settlements(this._apiDeps, opts); }

  /** Get auth headers for the current auth mode. */
  private async _getAuthHeaders(): Promise<Record<string, string>> {
    if (this._apiKey) {
      return { authorization: `Bearer ${this._apiKey}` };
    }
    if (this._delegationToken) {
      if (isDelegationExpiringSoon(this._delegationToken)) {
        throw new ProxyGateError(
          { error: 'delegation_expired', message: 'Delegation token expired or expiring soon. Run `proxygate login` to re-authenticate.' },
          0,
        );
      }
      return { authorization: `Bearer ${this._delegationToken}` };
    }
    const headers = await this._signWithNonce();
    return { ...headers };
  }

  private async _signWithNonce(): Promise<AuthHeaders> {
    const nonce = await this._noncePool!.acquire();
    const messageBytes = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(messageBytes, this._secretKey!);
    return { 'x-wallet': this.walletAddress, 'x-nonce': nonce, 'x-signature': bufferToBase64(signature) };
  }

  private async _authenticatedRequest<T>(
    method: string, path: string,
    opts?: { body?: unknown; query?: Record<string, string>; headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<T> {
    const url = buildUrl(this.gatewayUrl, path, opts?.query);
    if (this._apiKey) {
      return bearerRequest<T>(url, method, this._apiKey, opts);
    }
    if (this._delegationToken) {
      if (isDelegationExpiringSoon(this._delegationToken)) {
        throw new ProxyGateError(
          { error: 'delegation_expired', message: 'Delegation token expired or expiring soon. Run `proxygate login` to re-authenticate.' },
          0,
        );
      }
      return bearerRequest<T>(url, method, this._delegationToken, opts);
    }
    const authHeaders = await this._signWithNonce();
    return authenticatedRequest<T>(url, method, { ...authHeaders }, opts);
  }

  private async _publicRequest<T>(method: string, path: string, opts?: { query?: Record<string, string> }): Promise<T> {
    const url = buildUrl(this.gatewayUrl, path, opts?.query);
    return publicRequest<T>(url, method);
  }
}
