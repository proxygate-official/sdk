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

/** POST /v1/rate */
export interface RateResponse {
  status: string;
  message: string;
}

/** GET /v1/apis — matches gateway CursorPage<CatalogListing> response shape. */
export interface ApisResponse {
  data: ApiListingDetail[];
  cursor: string | null;
  has_more: boolean;
  filters_applied?: Record<string, unknown>;
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
// Proxy options (replaces ProxyChain)
// ---------------------------------------------------------------------------

/** Options for client.proxy() method. */
export interface ProxyOptions {
  /** HTTP method (default: POST). */
  method?: string;
  /** Additional headers to send with the request. */
  headers?: Record<string, string>;
  /** Query parameters to append to the URL. */
  query?: Record<string, string>;
  /** AbortSignal for request cancellation. */
  signal?: AbortSignal;
  /** Number of retries on 5xx or network errors (default: 0). */
  retries?: number;
}

// ---------------------------------------------------------------------------
// Category types (discovery)
// ---------------------------------------------------------------------------

/** A subcategory within a top-level category. */
export interface CategorySubcategory {
  slug: string;
  name: string;
  icon: string;
  listing_count: number;
}

/** A top-level category with inline subcategories. */
export interface CategoryEntry {
  slug: string;
  name: string;
  icon: string;
  listing_count: number;
  subcategories: CategorySubcategory[];
}

/** GET /v1/categories response. */
export interface CategoriesResponse {
  categories: CategoryEntry[];
}

/** Single API listing detail (returned by api()). */
export interface ApiListingDetail {
  listing_id: string;
  seller_wallet: string;
  service: string;
  service_name: string;
  auth_pattern: string;
  pricing_unit: string;
  price_per_request_usdc: number | null;
  price_per_input_token_usdc: number | null;
  price_per_output_token_usdc: number | null;
  available_rpm: number;
  uptime_percent: number;
  avg_latency_ms: number;
  trust_score: number;
  badges: string[];
  is_available: boolean;
  member_since: string;
  category_slugs?: string[];
}

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
  /** Filter by category slug(s), comma-separated for multiple. */
  category?: string;
  /** Sort order: price_asc, price_desc, popular, newest. */
  sort?: 'price_asc' | 'price_desc' | 'popular' | 'newest';
  /** Text search query. */
  q?: string;
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

// ---------------------------------------------------------------------------
// Vault types (v4.0 non-custodial vault)
// ---------------------------------------------------------------------------

/** GET /v1/balance (vault-backed) */
export interface VaultBalanceResponse {
  balance: number;
  pending_settlement: number;
  available: number;
  in_cooldown: boolean;
  currency: string;
}

/** POST /v1/deposit/confirm response */
export interface VaultDepositResponse {
  balance: number;
  deposited: number;
  tx_signature: string;
  currency: string;
}

/** POST /v1/withdraw gateway response (intermediate states). */
export interface VaultWithdrawGatewayResponse {
  status: 'ready' | 'cooldown_started' | 'cooldown_active';
  message: string;
  cooldown_ms?: number;
  unsettled_calls?: number;
  cooldown_remaining_ms?: number;
}

/** Full SDK withdraw result (returned after cooldown + on-chain TX). */
export interface VaultWithdrawCompleteResponse {
  status: 'complete';
  tx_signature: string;
  amount_withdrawn: number;
}

/** POST /v1/withdraw response — union of gateway intermediate and SDK complete states. */
export type VaultWithdrawResponse =
  | VaultWithdrawGatewayResponse
  | VaultWithdrawCompleteResponse;

/** Signed receipt from a proxy call (returned in x-receipt header). */
export interface VaultReceipt {
  request_id: string;
  buyer: string;
  seller: string;
  amount: number;
  timestamp: number;
  signature: string;
}

/** Options for vault deposit. */
export interface VaultDepositOptions {
  /** Amount in USDC base units (e.g., 1000000 = 1 USDC with 6 decimals). */
  amount: number;
  /** Optional: custom Solana RPC URL (overrides default devnet). */
  rpcUrl?: string;
}

/** Options for vault withdraw. */
export interface VaultWithdrawOptions {
  /** Amount in USDC base units to withdraw. If omitted, withdraw all. */
  amount?: number;
  /** Optional: custom Solana RPC URL. */
  rpcUrl?: string;
  /** Poll interval in ms for cooldown wait (default 5000). */
  pollIntervalMs?: number;
  /** Max wait time in ms before giving up (default 120000 = 2 minutes). */
  maxWaitMs?: number;
}

/** Receipt verification result. */
export interface ReceiptVerificationResult {
  receipt: VaultReceipt;
  valid: boolean;
  reason?: string;
}

/** Delegate object exposing ProxyGateClient internals to VaultClient. */
export interface VaultDelegate {
  authenticatedRequest: <T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      query?: Record<string, string>;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ) => Promise<T>;
  secretKey: Uint8Array;
  walletAddress: string;
  gatewayUrl: string;
}
