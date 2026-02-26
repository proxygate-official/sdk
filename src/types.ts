/** Options for signRequest. */
export interface SignRequestOptions {
  /** ProxyGate gateway base URL (e.g., 'https://gateway.proxygate.ai'). */
  gatewayUrl: string;
  /** Solana wallet public key as base58 string. */
  walletAddress: string;
  /** Ed25519 secret key as 64-byte Uint8Array (Solana keypair secret key). */
  secretKey: Uint8Array;
}

/** Auth headers returned by signRequest. Attach these to your gateway requests. */
export interface AuthHeaders {
  'x-wallet': string;
  'x-nonce': string;
  'x-signature': string;
}

// ---------------------------------------------------------------------------
// Client construction options
// ---------------------------------------------------------------------------

/** Options for constructing a ProxyGateClient directly. */
export interface ProxyGateClientOptions {
  gatewayUrl: string;
  walletAddress: string;
  secretKey: Uint8Array;
}

/** Options for the convenience `createClient` factory (reads keypair from file). */
export interface CreateClientOptions {
  gatewayUrl: string;
  keypairPath: string;
}

// ---------------------------------------------------------------------------
// V1 endpoint response types
// ---------------------------------------------------------------------------

/** GET /v1/balance */
export interface BalanceResponse {
  balance: number;
  total_deposited: number;
  total_spent: number;
  currency: string;
  usdc_equivalent: string;
}

/** Pricing listing within a service group. */
export interface PricingListing {
  seller_id: string;
  pricing_model: string;
  price_per_request?: number;
  input_price_per_token?: number;
  output_price_per_token?: number;
  max_output_tokens?: number;
  uptime_pct?: number;
  latency_ms?: number;
}

/** Service group in pricing response. */
export interface PricingService {
  service: string;
  listings: PricingListing[];
}

/** GET /v1/pricing */
export interface PricingResponse {
  services: PricingService[];
  currency: string;
  deposit_endpoint: string;
  last_updated: string;
}

/** Single usage log entry. */
export interface UsageEntry {
  id: string;
  timestamp: string;
  service: string;
  model: string | null;
  status_code: number;
  latency_ms: number;
  tokens_used: number | null;
  cost_micro_cents: number;
  seller_id: string;
}

/** Aggregated usage summary per service. */
export interface UsageSummary {
  service: string;
  total_requests: number;
  total_cost: number;
  avg_latency: number;
}

/** GET /v1/usage */
export interface UsageResponse {
  usage: UsageEntry[];
  summary: UsageSummary[];
  limit: number;
  offset: number;
}

/** POST /v1/deposit */
export interface DepositResponse {
  balance: number;
  deposited: number;
  currency: string;
  usdc_equivalent: string;
}

/** POST /v1/withdraw */
export interface WithdrawResponse {
  tx_signature: string;
  amount_withdrawn: number;
  remaining_balance: number;
  currency: string;
  usdc_withdrawn: string;
}

/** POST /v1/rate */
export interface RateResponse {
  status: string;
  message: string;
}

/** Single API listing entry. */
export interface ApiListing {
  id: string;
  service: string;
  seller_id: string;
  pricing_model: string;
  price_per_request?: number;
  input_price_per_token?: number;
  output_price_per_token?: number;
  auth_pattern: string;
  status: string;
  uptime_pct?: number;
  latency_ms?: number;
  capacity_available?: number;
}

/** GET /v1/apis */
export interface ApisResponse {
  listings: ApiListing[];
  cursor: string | null;
  has_more: boolean;
  total: number;
}

/** Aggregated service stats entry. */
export interface ServiceStats {
  service: string;
  seller_count: number;
  cheapest_price: number;
  avg_latency_ms: number;
  avg_uptime: number;
  total_requests: number;
}

/** GET /v1/services */
export interface ServicesResponse {
  services: ServiceStats[];
}

/** GET /v1/seller/profile/:wallet */
export interface SellerProfileResponse {
  wallet: string;
  services: string[];
  uptime_pct: number;
  avg_latency_ms: number;
  badges: string[];
  total_requests: number;
  member_since: string;
  rating_score?: number;
  total_ratings?: number;
}

/** Daily settlement breakdown. */
export interface SettlementDaily {
  date: string;
  total_amount: number;
  total_requests: number;
  services: Record<string, number>;
}

/** Settlement period summary. */
export interface SettlementSummary {
  total_amount: number;
  total_requests: number;
  period_days: number;
}

/** Settlement payout record. */
export interface SettlementPayout {
  id: string;
  amount: number;
  tx_signature: string;
  created_at: string;
}

/** GET /v1/settlement/history */
export interface SettlementsResponse {
  role: string;
  date_range: { from: string; to: string };
  daily: SettlementDaily[];
  cursor: string | null;
  has_more: boolean;
  summary: SettlementSummary;
  payouts?: SettlementPayout[];
}

// ---------------------------------------------------------------------------
// Gateway error type
// ---------------------------------------------------------------------------

/** Standard error shape returned by the gateway. */
export interface GatewayError {
  error: string;
  message: string;
  action?: string;
  docs?: string;
  trace_id?: string;
}

// ---------------------------------------------------------------------------
// SSE event type
// ---------------------------------------------------------------------------

/** A single server-sent event parsed from a streaming response. */
export interface SSEEvent {
  data: string;
  event?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Proxy chain types
// ---------------------------------------------------------------------------

/** Options for proxy chain terminal HTTP methods. */
export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  signal?: AbortSignal;
}

/** Terminal HTTP methods available on a proxy chain node. */
export interface TerminalMethods {
  get(opts?: RequestOptions): Promise<Response>;
  post(body: unknown, opts?: RequestOptions): Promise<Response>;
  create(body: unknown, opts?: RequestOptions): Promise<Response>;
  put(body: unknown, opts?: RequestOptions): Promise<Response>;
  patch(body: unknown, opts?: RequestOptions): Promise<Response>;
  delete(opts?: RequestOptions): Promise<Response>;
  stream(body: unknown, opts?: RequestOptions): AsyncGenerator<SSEEvent>;
}

/** Recursive proxy chain: each property access extends the URL path. */
export type ProxyChain = TerminalMethods & {
  [key: string]: ProxyChain;
};

// ---------------------------------------------------------------------------
// Query option types for filtered endpoints
// ---------------------------------------------------------------------------

/** GET /v1/pricing query options. */
export interface PricingQueryOptions {
  service?: string;
}

/** GET /v1/usage query options. */
export interface UsageQueryOptions {
  service?: string;
  model?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** GET /v1/apis query options. */
export interface ApisQueryOptions {
  service?: string;
  auth_pattern?: string;
  pricing_model?: string;
  min_uptime?: number;
  max_latency?: number;
  cursor?: string;
  limit?: number;
}

/** GET /v1/settlement/history query options. */
export interface SettlementsQueryOptions {
  role?: 'buyer' | 'seller';
  from?: string;
  to?: string;
  service?: string;
  cursor?: string;
  limit?: number;
}

/** POST /v1/withdraw options. */
export interface WithdrawOptions {
  amount: number;
  destination?: string;
}

/** POST /v1/rate options. */
export interface RateOptions {
  request_id: string;
  is_positive: boolean;
}
