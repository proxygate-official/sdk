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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function api(deps: ApiMethodDeps, listingId: string): Promise<ApiListingDetail> {
  // If not a UUID, resolve by service name/slug first
  if (!UUID_RE.test(listingId)) {
    return resolveByService(deps, listingId);
  }

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

/**
 * Resolve a service name or slug to the best available listing.
 * Tries exact service slug match first, then falls back to text search.
 */
export async function resolveByService(
  deps: ApiMethodDeps,
  nameOrSlug: string,
): Promise<ApiListingDetail> {
  // Try exact service slug match
  const bySlug = await deps.publicRequest<ApisResponse>(
    'GET',
    '/v1/apis',
    { query: { service: nameOrSlug, sort: 'popular', limit: '1' } },
  );
  if (bySlug.data.length > 0) return bySlug.data[0];

  // Fallback: text search (vector + ilike)
  const bySearch = await deps.publicRequest<ApisResponse>(
    'GET',
    '/v1/apis',
    { query: { q: nameOrSlug, sort: 'popular', limit: '1' } },
  );
  if (bySearch.data.length > 0) return bySearch.data[0];

  throw new ProxyGateError(
    {
      error: 'listing_not_found',
      message: `No listing found for "${nameOrSlug}"`,
      action: `Search available APIs: proxygate apis -q ${nameOrSlug}`,
    },
    404,
  );
}

export async function docs(
  deps: ApiMethodDeps,
  listingId: string,
): Promise<ListingDocsResponse | null> {
  if (!UUID_RE.test(listingId)) {
    throw new ProxyGateError(
      {
        error: 'invalid_listing_id',
        message: 'Docs require a full listing UUID. Use `proxygate apis` to find the ID.',
        action: 'Run: proxygate apis --json | jq ".[].listing_id"',
      },
      400,
    );
  }

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
