import { ProxyGateError } from './helpers.js';
import type {
  VaultBalanceResponse,
  PricingResponse,
  UsageResponse,
  RateResponse,
  ApisResponse,
  ServicesResponse,
  SellerProfileResponse,
  SettlementsResponse,
  CategoriesResponse,
  ApiListingDetail,
  ListingDocsResponse,
  PricingQueryOptions,
  UsageQueryOptions,
  ApisQueryOptions,
  SettlementsQueryOptions,
  RateOptions,
} from '../types.js';

/** Client internals needed by API methods. */
export interface ApiMethodDeps {
  authenticatedRequest: <T>(method: string, path: string, opts?: {
    body?: unknown;
    query?: Record<string, string>;
  }) => Promise<T>;
  publicRequest: <T>(method: string, path: string, opts?: {
    query?: Record<string, string>;
  }) => Promise<T>;
  buildQuery: <T extends object>(opts?: T) => Record<string, string> | undefined;
}

export function balance(deps: ApiMethodDeps): Promise<VaultBalanceResponse> {
  return deps.authenticatedRequest<VaultBalanceResponse>('GET', '/v1/balance');
}

export function pricing(deps: ApiMethodDeps, opts?: PricingQueryOptions): Promise<PricingResponse> {
  return deps.publicRequest<PricingResponse>('GET', '/v1/pricing', {
    query: deps.buildQuery(opts),
  });
}

export function usage(deps: ApiMethodDeps, opts?: UsageQueryOptions): Promise<UsageResponse> {
  return deps.authenticatedRequest<UsageResponse>('GET', '/v1/usage', {
    query: deps.buildQuery(opts),
  });
}

export function rate(deps: ApiMethodDeps, opts: RateOptions): Promise<RateResponse> {
  return deps.authenticatedRequest<RateResponse>('POST', '/v1/rate', { body: opts });
}

export function apis(deps: ApiMethodDeps, opts?: ApisQueryOptions): Promise<ApisResponse> {
  return deps.publicRequest<ApisResponse>('GET', '/v1/apis', {
    query: deps.buildQuery(opts),
  });
}

export function services(deps: ApiMethodDeps): Promise<ServicesResponse> {
  return deps.publicRequest<ServicesResponse>('GET', '/v1/services');
}

export function categories(deps: ApiMethodDeps): Promise<CategoriesResponse> {
  return deps.publicRequest<CategoriesResponse>('GET', '/v1/categories');
}

export async function api(deps: ApiMethodDeps, listingId: string): Promise<ApiListingDetail> {
  const result = await deps.publicRequest<{ data: ApiListingDetail[] }>(
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

export async function docs(
  deps: ApiMethodDeps,
  listingId: string,
): Promise<ListingDocsResponse | null> {
  try {
    return await deps.publicRequest<ListingDocsResponse>(
      'GET',
      `/v1/apis/${encodeURIComponent(listingId)}/docs`,
    );
  } catch (err) {
    if (err instanceof ProxyGateError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

export function sellerProfile(deps: ApiMethodDeps, wallet: string): Promise<SellerProfileResponse> {
  return deps.publicRequest<SellerProfileResponse>(
    'GET',
    `/v1/seller/profile/${encodeURIComponent(wallet)}`,
  );
}

export function settlements(
  deps: ApiMethodDeps,
  opts?: SettlementsQueryOptions,
): Promise<SettlementsResponse> {
  return deps.authenticatedRequest<SettlementsResponse>(
    'GET',
    '/v1/settlement/history',
    { query: deps.buildQuery(opts) },
  );
}
