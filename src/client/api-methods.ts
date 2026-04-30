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
  SellerStrategy,
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

// Phase 51-08: kebab-case slug accepted by gateway (mirrors seller_listings.slug CHECK regex).
// Length 3-64 inclusive: leading + trailing alphanumeric, hyphens allowed in middle.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

// Phase 51-08: composite seller-handle/listing-slug syntax. Both segments must be
// kebab-case. The seller segment may be a slug; the listing segment must be a slug.
const COMPOSITE_RE = /^([a-z0-9][a-z0-9-]{1,62}[a-z0-9])\/([a-z0-9][a-z0-9-]{1,62}[a-z0-9])$/;

/**
 * Resolve a listing by ID.
 *
 * Accepts THREE input forms (Phase 51-08):
 *   1. UUID — `client.api('ad3db61c-23d2-...')` → `/v1/apis?listing_id=X&limit=1`
 *   2. Single slug — `client.api('blockdb-api')` → `/v1/apis?slug=X&limit=1`
 *   3. Composite — `client.api('blockdb/blockdb-api')` → `/v1/apis?seller_slug=X&slug=Y&limit=1`
 *
 * If none of those match the input, falls back to {@link resolveByService}
 * (service-name lookup → free-text search) for backwards compat with
 * `client.api('openai')`-style calls. If THAT also returns nothing, throws
 * `ProxyGateError(listing_not_found, 404)`.
 */
export async function api(deps: ApiMethodDeps, input: string): Promise<ApiListingDetail> {
  // 1. UUID path — direct listing_id filter.
  if (UUID_RE.test(input)) {
    const result = await deps.publicRequest<{ data: ApiListingDetail[] }>(
      'GET',
      '/v1/apis',
      { query: { listing_id: input, limit: '1' } },
    );
    const listing = result.data[0];
    if (!listing) {
      throw new ProxyGateError(
        { error: 'listing_not_found', message: `Listing ${input} not found` },
        404,
      );
    }
    return listing;
  }

  // 2. Composite seller-handle/listing-slug — order matters: must come BEFORE the
  // single-slug check because COMPOSITE_RE is a strict superset (both halves valid).
  const composite = input.match(COMPOSITE_RE);
  if (composite) {
    const [, sellerSlug, listingSlug] = composite;
    const result = await deps.publicRequest<{ data: ApiListingDetail[] }>(
      'GET',
      '/v1/apis',
      { query: { seller_slug: sellerSlug, slug: listingSlug, limit: '1' } },
    );
    const listing = result.data[0];
    if (!listing) {
      throw new ProxyGateError(
        {
          error: 'listing_not_found',
          message: `No listing "${listingSlug}" found for seller "${sellerSlug}"`,
        },
        404,
      );
    }
    return listing;
  }

  // 3. Single-segment kebab-case slug — try slug filter first.
  if (SLUG_RE.test(input)) {
    const result = await deps.publicRequest<{ data: ApiListingDetail[] }>(
      'GET',
      '/v1/apis',
      { query: { slug: input, limit: '1' } },
    );
    if (result.data.length > 0) return result.data[0];
    // Slug filter returned no rows — fall through to service-name resolver so
    // legacy `client.api('openai')` (service name, not slug) still works.
  }

  // 4. Fallback: service name + text search (existing behavior).
  return resolveByService(deps, input);
}

/** Map seller strategy to gateway sort parameter. */
const STRATEGY_SORT: Record<SellerStrategy, string> = {
  cheapest: 'price_asc',
  'best-rated': 'best_rated',
  fastest: 'fastest',
  popular: 'popular',
};

/**
 * Resolve a service name or slug to the best available listing.
 * Tries exact service slug match first, then falls back to text search.
 * Fetches top 5 results and picks randomly among ties for load spreading.
 */
export async function resolveByService(
  deps: ApiMethodDeps,
  nameOrSlug: string,
  seller?: SellerStrategy,
): Promise<ApiListingDetail> {
  const sort = STRATEGY_SORT[seller ?? 'popular'];

  // Try exact service slug match — fetch top 5 for tie-breaking
  const bySlug = await deps.publicRequest<ApisResponse>(
    'GET',
    '/v1/apis',
    { query: { service: nameOrSlug, sort, limit: '5' } },
  );
  if (bySlug.data.length > 0) return pickFromTies(bySlug.data, seller);

  // Fallback: text search (vector + ilike)
  const bySearch = await deps.publicRequest<ApisResponse>(
    'GET',
    '/v1/apis',
    { query: { q: nameOrSlug, sort, limit: '5' } },
  );
  if (bySearch.data.length > 0) return pickFromTies(bySearch.data, seller);

  throw new ProxyGateError(
    {
      error: 'listing_not_found',
      message: `No listing found for "${nameOrSlug}"`,
      action: `Search available APIs: proxygate apis -q ${nameOrSlug}`,
    },
    404,
  );
}

/**
 * Pick randomly from listings that tie on the strategy's key metric.
 * If only one listing or no strategy, returns the first.
 */
function pickFromTies(listings: ApiListingDetail[], seller?: SellerStrategy): ApiListingDetail {
  if (listings.length <= 1 || !seller) return listings[0];

  const first = listings[0];
  let ties: ApiListingDetail[];

  switch (seller) {
    case 'cheapest':
      ties = listings.filter((l) => l.price_per_request_usdc === first.price_per_request_usdc);
      break;
    case 'best-rated':
      ties = listings.filter((l) => l.trust_score === first.trust_score);
      break;
    case 'fastest':
      ties = listings.filter((l) => l.avg_latency_ms === first.avg_latency_ms);
      break;
    case 'popular':
      ties = listings.filter((l) => l.available_rpm === first.available_rpm);
      break;
    default:
      return first;
  }

  return ties[Math.floor(Math.random() * ties.length)];
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

/**
 * Get a seller profile by handle (slug or wallet).
 *
 * Phase 51-08 — uses the by-handle resolver from gateway plan 51-02:
 *   `GET /v1/seller/profile/by-handle/:handle`
 *
 * The gateway resolves `handle` slug-first, wallet-fallback. Response carries
 * `canonical_handle` + `canonical_path` so the web layer can issue a 308
 * redirect from wallet → slug for SEO link consolidation without a second
 * round-trip.
 *
 * Backwards compat: callers passing a wallet still receive the same fields
 * they always did (wallet, services, badges, trust_score, etc.) plus the new
 * branding + canonicalization fields.
 */
export function sellerProfile(deps: ApiMethodDeps, handleOrWallet: string): Promise<SellerProfileResponse> {
  return deps.publicRequest<SellerProfileResponse>(
    'GET',
    `/v1/seller/profile/by-handle/${encodeURIComponent(handleOrWallet)}`,
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
