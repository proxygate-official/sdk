import nacl from 'tweetnacl';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { NoncePool } from './nonce-pool.js';
import { encodeBase58 } from './base58.js';
import { VaultClient } from './vault.js';
import { ListingsClient } from './listings.js';
import { JobsClient } from './jobs.js';
import {
  ProxyGateError, bufferToBase64, buildQuery,
  buildUrl, authenticatedRequest, publicRequest,
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
} from './types.js';

export { ProxyGateError } from './client/helpers.js';

/**
 * Typed client for the ProxyGate API marketplace.
 * Provides methods for all v1 gateway endpoints and listing-centric proxy.
 */
export class ProxyGateClient {
  readonly gatewayUrl: string;
  readonly walletAddress: string;
  private readonly _secretKey: Uint8Array;
  private readonly _noncePool: NoncePool;
  private _listingCache = new Map<string, { service: string }>();

  constructor(opts: ProxyGateClientOptions) {
    this.gatewayUrl = opts.gatewayUrl.replace(/\/+$/, '');
    this.walletAddress = opts.walletAddress;
    this._secretKey = opts.secretKey;
    this._noncePool = new NoncePool({ gatewayUrl: this.gatewayUrl, walletAddress: this.walletAddress });
  }

  static async create(opts: CreateClientOptions): Promise<ProxyGateClient> {
    let resolvedPath = opts.keypairPath;
    if (resolvedPath.startsWith('~')) resolvedPath = resolvedPath.replace(/^~/, homedir());
    resolvedPath = resolve(resolvedPath);
    const raw = await readFile(resolvedPath, 'utf-8');
    const keyArray: unknown = JSON.parse(raw);
    if (!Array.isArray(keyArray) || keyArray.length !== 64 || !keyArray.every((n) => typeof n === 'number')) {
      throw new Error(`Invalid keypair file: expected a JSON array of 64 numbers, got ${Array.isArray(keyArray) ? `array of ${keyArray.length}` : typeof keyArray}`);
    }
    const secretKey = Uint8Array.from(keyArray as number[]);
    const publicKey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;
    return new ProxyGateClient({ gatewayUrl: opts.gatewayUrl, walletAddress: encodeBase58(publicKey), secretKey });
  }

  async proxy(listingId: string, path: string, body?: unknown, options?: ProxyOptions): Promise<Response> {
    return proxyRequest(
      { gatewayUrl: this.gatewayUrl, signWithNonce: () => this._signWithNonce(), buildUrl: (p, q) => buildUrl(this.gatewayUrl, p, q), fetchApi: (id) => this.api(id) },
      this._listingCache, listingId, path, body, options,
    );
  }

  private _vault?: VaultClient;
  get vault(): VaultClient { if (!this._vault) this._vault = new VaultClient(this._vaultDelegate()); return this._vault; }

  private _listings?: ListingsClient;
  get listings(): ListingsClient { if (!this._listings) this._listings = new ListingsClient(this._vaultDelegate()); return this._listings; }

  private _jobs?: JobsClient;
  get jobs(): JobsClient { if (!this._jobs) this._jobs = new JobsClient(this._vaultDelegate()); return this._jobs; }

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
  async docs(listingId: string): Promise<ListingDocsResponse | null> { return apiMethods.docs(this._apiDeps, listingId); }
  async sellerProfile(wallet: string): Promise<SellerProfileResponse> { return apiMethods.sellerProfile(this._apiDeps, wallet); }
  async settlements(opts?: SettlementsQueryOptions): Promise<SettlementsResponse> { return apiMethods.settlements(this._apiDeps, opts); }

  private async _signWithNonce(): Promise<AuthHeaders> {
    const nonce = await this._noncePool.acquire();
    const messageBytes = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(messageBytes, this._secretKey);
    return { 'x-wallet': this.walletAddress, 'x-nonce': nonce, 'x-signature': bufferToBase64(signature) };
  }

  private async _authenticatedRequest<T>(
    method: string, path: string,
    opts?: { body?: unknown; query?: Record<string, string>; headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<T> {
    const url = buildUrl(this.gatewayUrl, path, opts?.query);
    const authHeaders = await this._signWithNonce();
    return authenticatedRequest<T>(url, method, { ...authHeaders }, opts);
  }

  private async _publicRequest<T>(method: string, path: string, opts?: { query?: Record<string, string> }): Promise<T> {
    const url = buildUrl(this.gatewayUrl, path, opts?.query);
    return publicRequest<T>(url, method);
  }
}
