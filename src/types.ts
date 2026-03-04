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

/** JSON Schema Draft-07 object (open-ended). */
export type JsonSchema = Record<string, unknown>;

/** A single documented endpoint on a listing. */
export interface EndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description?: string;
  request_schema?: JsonSchema;
}

/** Single service entry in pricing response (flat — no nested listings). */
export interface PricingServiceEntry {
  service: string;
  name: string;
  pricing_unit: 'per_request' | 'per_token' | 'both';
  price_per_request_micro_cents: number;
  price_per_request_usdc: number;
  price_per_input_token_micro_cents: number | null;
  price_per_output_token_micro_cents: number | null;
  price_per_input_token_usdc: number | null;
  price_per_output_token_usdc: number | null;
  available_rpm: number;
  sellers: number;
}

/** GET /v1/pricing */
export interface PricingResponse {
  services: PricingServiceEntry[];
  has_more: boolean;
  cursor: string | null;
  currency: string;
  deposit_endpoint: string;
  last_updated: string;
}

/** Single usage log entry. */
export interface UsageEntry {
  id: string;
  service: string;
  path: string;
  model: string | null;
  status_code: number;
  latency_ms: number;
  cost_micro_cents: number;
  listing_id: string;
  seller_id: string;
  created_at: string;
}

/** Aggregated usage summary per service/model. */
export interface UsageServiceSummary {
  service: string;
  model: string | null;
  request_count: number;
  total_cost_micro_cents: number;
}

/** GET /v1/usage */
export interface UsageResponse {
  usage: UsageEntry[];
  summary: UsageServiceSummary[];
  has_more: boolean;
  cursor: string | null;
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
  service_name: string;
  cheapest_price_usdc: number;
  avg_latency_ms: number;
  active_seller_count: number;
  total_capacity_rpm: number;
  avg_uptime_percent: number;
  avg_rating: number;
  best_rated_seller_wallet: string;
  pricing_units: 'per_request' | 'per_token' | 'both';
}

/** GET /v1/services */
export interface ServicesResponse {
  services: ServiceStats[];
  has_more: boolean;
  cursor: string | null;
  count: number;
}

/** GET /v1/seller/profile/:wallet */
export interface SellerProfileResponse {
  wallet: string;
  services_listed: number;
  services: string[];
  uptime_percent: number | null;
  latency: { p50: number; p95: number; p99: number } | null;
  trust_score: number;
  badges: string[];
  total_requests_served: number;
  member_since: string;
  avg_rating: number;
  total_ratings: number;
}

/** Buyer daily settlement entry. */
export interface SettlementDailyBuyer {
  date: string;
  service: string;
  request_count: number;
  total_cost_usdc: number;
  total_fees_usdc: number;
  net_spend_usdc: number;
}

/** Seller daily settlement entry. */
export interface SettlementDailySeller {
  date: string;
  service: string;
  request_count: number;
  total_earnings_usdc: number;
  total_fees_usdc: number;
  net_payout_usdc: number;
}

/** Daily settlement entry (buyer or seller). */
export type SettlementDaily = SettlementDailyBuyer | SettlementDailySeller;

/** Buyer settlement summary. */
export interface SettlementSummaryBuyer {
  total_requests: number;
  total_cost_usdc: number;
  total_fees_usdc: number;
}

/** Seller settlement summary. */
export interface SettlementSummarySeller {
  total_requests: number;
  total_earnings_usdc: number;
  total_fees_usdc: number;
}

/** Settlement summary (buyer or seller). */
export type SettlementSummary = SettlementSummaryBuyer | SettlementSummarySeller;

/** Settlement payout record (seller only). */
export interface SettlementPayout {
  date: string;
  amount_usdc: number;
  tx_signature: string | null;
  status: string;
}

/** GET /v1/settlement/history */
export interface SettlementsResponse {
  role: 'buyer' | 'seller';
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
  has_more: boolean;
  cursor: string | null;
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
  endpoints: EndpointSpec[];
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
  cursor?: string;
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

/** POST /v1/withdraw/sign response -- partially-signed withdraw TX from gateway. */
export interface VaultWithdrawSignResponse {
  /** Base64-encoded serialized Solana transaction (platform-signed, buyer signature missing). */
  transaction: string;
  /** Amount in USDC base units being withdrawn. */
  amount: number;
}

/** Full SDK withdraw result (returned after cooldown + on-chain TX). */
export interface VaultWithdrawCompleteResponse {
  status: 'complete';
  tx_signature: string;
  amount_withdrawn: number;
}

/** POST /v1/withdraw/confirm response */
export interface VaultWithdrawConfirmResponse {
  balance: number;
  withdrawn: number;
  tx_signature: string;
  currency: string;
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

// ---------------------------------------------------------------------------
// Listing management types (Phase 30.1)
// ---------------------------------------------------------------------------

/** Auth pattern for API key injection. */
export type ListingAuthPattern = 'bearer' | 'header' | 'query' | 'basic' | 'oauth2_cc';

/** Summary listing returned by list endpoint. */
export interface ListingSummary {
  id: string;
  service_name: string;
  service_slug: string;
  base_url: string;
  auth_pattern: ListingAuthPattern;
  description: string | null;
  key_masked: string;
  total_rpm: number;
  reserved_rpm: number;
  available_resale_rpm: number;
  price_per_request: number;
  is_active: boolean;
  categories: string[];
  created_at: string;
  updated_at: string;
}

/** Full listing detail (single listing response). */
export interface ListingDetail extends ListingSummary {
  allowed_paths: string[];
  endpoints: EndpointSpec[];
  pricing_model: string;
  pricing_unit: string;
  price_per_input_token: number | null;
  price_per_output_token: number | null;
  oauth2_flow_type: string | null;
  oauth2_token_url: string | null;
  oauth2_scopes: string | null;
  sync_status?: 'synced' | 'pending';
}

/** Raw listing row from gateway (seller_listings + joined service_catalog). */
export interface ListingRow {
  id: string;
  seller_id: string;
  catalog_id: string;
  auth_pattern: ListingAuthPattern;
  total_rpm: number;
  reserved_rpm: number;
  price_per_request: number;
  price_per_input_token: number | null;
  price_per_output_token: number | null;
  pricing_model: string;
  pricing_unit: string;
  is_active: boolean;
  key_masked: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  service_catalog: { slug: string; name: string; base_url: string } | null;
  [key: string]: unknown;
}

/** Response from list endpoint. */
export interface ListListingsResponse {
  listings: ListingRow[];
}

/** Options for creating a listing. */
export interface CreateListingOptions {
  service_name: string;
  service_base_url: string;
  description?: string;
  auth_pattern?: ListingAuthPattern;
  header_name?: string;
  query_param?: string;
  basic_user?: string;
  api_key?: string;
  oauth2_flow_type?: 'standard' | 'google_jwt';
  oauth2_token_url?: string;
  oauth2_scopes?: string;
  oauth2_audience?: string;
  oauth2_client_id?: string;
  oauth2_client_secret?: string;
  oauth2_service_account_json?: string;
  total_rpm: number;
  reserved_rpm: number;
  price_per_request: number;
  allowed_paths?: string[];
  endpoints?: EndpointSpec[];
  category_slugs: string[];
  validation_endpoint?: string;
}

/** Response from create endpoint. */
export interface CreateListingResponse {
  id: string;
  service: string;
  is_active: boolean;
  key_masked: string;
  sync_status: 'synced' | 'pending';
}

/** Options for updating a listing (all fields optional). */
export interface UpdateListingOptions {
  description?: string;
  total_rpm?: number;
  reserved_rpm?: number;
  price_per_request?: number;
  allowed_paths?: string[];
  endpoints?: EndpointSpec[];
  category_slugs?: string[];
}

/** Response from update endpoint. */
export interface UpdateListingResponse {
  updated: true;
  id: string;
}

/** Response from pause endpoint. */
export interface PauseListingResponse {
  paused: true;
}

/** Response from unpause endpoint. */
export interface UnpauseListingResponse {
  unpaused: true;
}

/** Response from delete endpoint. */
export interface DeleteListingResponse {
  deleted: true;
}

/** Options for key rotation. */
export interface RotateKeyOptions {
  api_key?: string;
  oauth2_flow_type?: 'standard' | 'google_jwt';
  oauth2_client_id?: string;
  oauth2_client_secret?: string;
  oauth2_service_account_json?: string;
  validation_endpoint?: string;
}

/** Response from rotate-key endpoint. */
export interface RotateKeyResponse {
  rotated: true;
  key_masked: string;
}
