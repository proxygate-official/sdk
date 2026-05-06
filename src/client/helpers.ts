import type { GatewayError } from '../types.js';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/** Error thrown when the gateway returns a non-OK response. */
export class ProxygateError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly action?: string;
  readonly docs?: string;
  readonly traceId?: string;

  constructor(gatewayError: GatewayError, statusCode: number) {
    super(gatewayError.message);
    this.name = 'ProxygateError';
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
export function bufferToBase64(bytes: Uint8Array): string {
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
export function buildQuery<T extends object>(
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

/** Build a full URL with optional query parameters. */
export function buildUrl(
  gatewayUrl: string,
  path: string,
  query?: Record<string, string>,
): string {
  const url = new URL(`${gatewayUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Make an authenticated request and parse the JSON response. */
export async function authenticatedRequest<T>(
  url: string,
  method: string,
  authHeaders: Record<string, string>,
  opts?: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal },
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { ...authHeaders, 'content-type': 'application/json', ...(opts?.headers ?? {}) },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts?.signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let gatewayError: GatewayError;
    try { gatewayError = JSON.parse(body) as GatewayError; }
    catch { gatewayError = { error: 'unknown', message: body || `HTTP ${response.status}` }; }
    throw new ProxygateError(gatewayError, response.status);
  }
  return (await response.json()) as T;
}

/** Make a bearer-authenticated request and parse the JSON response. */
export async function bearerRequest<T>(
  url: string,
  method: string,
  apiKey: string,
  opts?: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal },
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...(opts?.headers ?? {}) },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts?.signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let gatewayError: GatewayError;
    try { gatewayError = JSON.parse(body) as GatewayError; }
    catch { gatewayError = { error: 'unknown', message: body || `HTTP ${response.status}` }; }
    throw new ProxygateError(gatewayError, response.status);
  }
  return (await response.json()) as T;
}

/** Make a public (unauthenticated) request and parse the JSON response. */
export async function publicRequest<T>(
  url: string,
  method: string,
): Promise<T> {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let gatewayError: GatewayError;
    try { gatewayError = JSON.parse(body) as GatewayError; }
    catch { gatewayError = { error: 'unknown', message: body || `HTTP ${response.status}` }; }
    throw new ProxygateError(gatewayError, response.status);
  }
  return (await response.json()) as T;
}
