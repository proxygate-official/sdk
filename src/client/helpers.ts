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
  /**
   * The parsed JSON response body, when the gateway returned one. Lets callers
   * inspect structured payloads that are not part of the GatewayError envelope
   * (e.g. the x402 402 challenge with its `accepts` array). Undefined when the
   * body was empty or not valid JSON. (Additive, SAFE-06.)
   */
  readonly raw?: unknown;

  constructor(gatewayError: GatewayError, statusCode: number, raw?: unknown) {
    super(gatewayError.message);
    this.name = 'ProxygateError';
    this.code = gatewayError.error;
    this.statusCode = statusCode;
    this.action = gatewayError.action;
    this.docs = gatewayError.docs;
    this.traceId = gatewayError.trace_id;
    this.raw = raw;
  }
}

// ---------------------------------------------------------------------------
// Spend-limit error
// ---------------------------------------------------------------------------

/** Which spend window a call exceeded: the daily total or the per-call cap. */
export type SpendLimitReason = 'daily' | 'per_tx';

/** Gateway error codes that signal a spend-limit block (HTTP 429). */
export const SPEND_LIMIT_ERROR_CODES = [
  'daily_spend_limit_exceeded',
  'per_tx_spend_limit_exceeded',
] as const;

/**
 * Distinct error for a proxy call blocked by a spend limit (HTTP 429).
 *
 * The gateway enforces a daily and a per-transaction spend ceiling (wallet-level
 * or api-key-level; same wire shape). When a billed call would exceed either, it
 * responds 429 with `error: 'daily_spend_limit_exceeded'` or
 * `'per_tx_spend_limit_exceeded'`. This subclass lets callers branch on a
 * deliberate limit (which they can resolve by raising the cap) versus a generic
 * gateway/upstream 429. (Additive, SAFE-06.)
 *
 * Note: `ProxygateClient.proxy()` returns the raw {@link Response} and does not
 * throw, so for proxy calls use {@link spendLimitErrorFromResponse}. Endpoint
 * methods that throw {@link ProxygateError} throw this subclass automatically.
 */
export class SpendLimitError extends ProxygateError {
  /** Which window was exceeded: the daily total or the per-call cap. */
  readonly reason: SpendLimitReason;

  constructor(gatewayError: GatewayError, statusCode: number, raw?: unknown) {
    super(gatewayError, statusCode, raw);
    this.name = 'SpendLimitError';
    this.reason = gatewayError.error === 'per_tx_spend_limit_exceeded' ? 'per_tx' : 'daily';
  }
}

/** True when `err` is a {@link SpendLimitError}. */
export function isSpendLimitError(err: unknown): err is SpendLimitError {
  return err instanceof SpendLimitError;
}

/** True when an error code is one of the spend-limit codes. */
function isSpendLimitCode(code: string): boolean {
  return (SPEND_LIMIT_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Inspect a proxy {@link Response} and return a {@link SpendLimitError} when the
 * gateway blocked the call on a spend limit (HTTP 429 with a spend-limit code),
 * or `null` otherwise. Consumes the response body, so only call this once and
 * only when you are not going to read the body elsewhere.
 *
 * `ProxygateClient.proxy()` returns the raw Response rather than throwing, so
 * callers (e.g. the CLI) use this to classify a 429 without re-implementing the
 * code matching. (Additive, SAFE-06.)
 */
export async function spendLimitErrorFromResponse(
  response: Response,
): Promise<SpendLimitError | null> {
  if (response.status !== 429) return null;
  const body = await response.text().catch(() => '');
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const gatewayError = raw as GatewayError;
  if (typeof gatewayError?.error !== 'string' || !isSpendLimitCode(gatewayError.error)) {
    return null;
  }
  return new SpendLimitError(gatewayError, response.status, raw);
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
  if (!response.ok) throw await parseErrorResponse(response);
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
  if (!response.ok) throw await parseErrorResponse(response);
  return (await response.json()) as T;
}

/** Make a public (unauthenticated) request and parse the JSON response. */
export async function publicRequest<T>(
  url: string,
  method: string,
): Promise<T> {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' } });
  if (!response.ok) throw await parseErrorResponse(response);
  return (await response.json()) as T;
}

/**
 * Build a ProxygateError from a non-OK response, parsing the body once and
 * carrying the parsed JSON on `.raw` (undefined for empty/non-JSON bodies).
 */
async function parseErrorResponse(response: Response): Promise<ProxygateError> {
  const body = await response.text().catch(() => '');
  let raw: unknown;
  let gatewayError: GatewayError;
  try {
    raw = JSON.parse(body);
    gatewayError = raw as GatewayError;
  } catch {
    raw = undefined;
    gatewayError = { error: 'unknown', message: body || `HTTP ${response.status}` };
  }
  if (response.status === 429 && typeof gatewayError.error === 'string' && isSpendLimitCode(gatewayError.error)) {
    return new SpendLimitError(gatewayError, response.status, raw);
  }
  return new ProxygateError(gatewayError, response.status, raw);
}
