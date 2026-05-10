import type { ProxyOptions, ApiListingDetail, ShieldInfo } from '../types.js';

/** Dependencies needed by proxy methods. */
export interface ProxyMethodDeps {
  gatewayUrl: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  buildUrl: (path: string, query?: Record<string, string>) => string;
  fetchApi: (listingId: string) => Promise<ApiListingDetail>;
  resolveByService: (nameOrSlug: string, seller?: import('../types.js').SellerStrategy) => Promise<{ listing_id: string; service: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Composite seller-handle/listing-slug — same shape as in api-methods.ts.
// Listed-by-listing requests (proxy/api) accept this form and resolve it via
// fetchApi (which calls /v1/apis?seller_slug=X&slug=Y). Without this branch,
// the SDK would fall through to resolveByService and try to interpret the
// composite as a service-name search, which fails.
const COMPOSITE_RE = /^([a-z0-9][a-z0-9-]{1,62}[a-z0-9])\/([a-z0-9][a-z0-9-]{1,62}[a-z0-9])$/;

/**
 * Send an authenticated proxy request to a specific listing.
 * Resolves the service slug from listing metadata (cached after first call).
 */
export async function proxyRequest(
  deps: ProxyMethodDeps,
  listingCache: Map<string, { service: string }>,
  listingId: string,
  path: string,
  body?: unknown,
  options?: ProxyOptions,
): Promise<Response> {
  // Resolve service name/slug to listing ID if not a UUID (cached after first resolution)
  let resolvedId = listingId;
  if (!UUID_RE.test(listingId)) {
    const seller = options?.seller;
    const slugKey = `_slug:${listingId}:${seller ?? 'popular'}`;
    const cached = listingCache.get(slugKey);
    if (cached) {
      resolvedId = cached.service; // service field stores the resolved UUID for slug entries
    } else if (COMPOSITE_RE.test(listingId)) {
      // Composite seller-handle/listing-slug — pin to that specific listing.
      // fetchApi handles UUID, single-slug, and composite syntax; the seller
      // strategy is irrelevant when the listing is named explicitly.
      const listing = await deps.fetchApi(listingId);
      resolvedId = listing.listing_id;
      listingCache.set(resolvedId, { service: listing.service });
      listingCache.set(slugKey, { service: resolvedId });
    } else {
      const resolved = await deps.resolveByService(listingId, seller);
      resolvedId = resolved.listing_id;
      listingCache.set(resolvedId, { service: resolved.service });
      listingCache.set(slugKey, { service: resolvedId }); // cache slug+strategy → UUID mapping
    }
  }

  let meta = listingCache.get(resolvedId);
  if (!meta) {
    const listing = await deps.fetchApi(resolvedId);
    meta = { service: listing.service };
    listingCache.set(resolvedId, meta);
  }

  const method = options?.method ?? 'POST';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullPath = `/proxy/${meta.service}${normalizedPath}`;
  const query: Record<string, string> = {
    listing: resolvedId,
    ...(options?.query ?? {}),
  };

  const maxAttempts = 1 + (options?.retries ?? 0);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const authHeaders = await deps.getAuthHeaders();

    const headers: Record<string, string> = {
      ...authHeaders,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options?.shield ? { 'x-proxygate-shield': options.shield } : {}),
      ...(options?.headers ?? {}),
    };

    if (attempt > 0) {
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
      const jitter = Math.random() * delay * 0.1;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }

    try {
      const url = deps.buildUrl(fullPath, query);
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: options?.signal,
      });

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

/**
 * Extract Shield scanning info from proxy response headers.
 * Returns null if the response was not scanned.
 */
export function parseShieldInfo(response: Response): ShieldInfo | null {
  const mode = response.headers.get('x-proxygate-shield');
  if (!mode) return null;

  const scoreStr = response.headers.get('x-proxygate-shield-score');
  const flags = response.headers.get('x-proxygate-shield-flags');

  return {
    mode,
    score: scoreStr ? parseFloat(scoreStr) : undefined,
    flags: flags ?? undefined,
  };
}
