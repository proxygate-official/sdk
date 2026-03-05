import type { ProxyOptions, AuthHeaders, ApiListingDetail } from '../types.js';

/** Dependencies needed by proxy methods. */
export interface ProxyMethodDeps {
  gatewayUrl: string;
  signWithNonce: () => Promise<AuthHeaders>;
  buildUrl: (path: string, query?: Record<string, string>) => string;
  fetchApi: (listingId: string) => Promise<ApiListingDetail>;
}

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
  let meta = listingCache.get(listingId);
  if (!meta) {
    const listing = await deps.fetchApi(listingId);
    meta = { service: listing.service };
    listingCache.set(listingId, meta);
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
    const authHeaders = await deps.signWithNonce();

    const headers: Record<string, string> = {
      ...authHeaders,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
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
