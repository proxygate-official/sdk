/** JSON Schema Draft-07 object (open-ended). */
export type JsonSchema = Record<string, unknown>;

/** A single documented endpoint on a listing. */
export interface EndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description?: string;
  request_schema?: JsonSchema;
}

/** Single service entry in pricing response (flat -- no nested listings). */
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

/** GET /v1/apis -- matches gateway CursorPage<CatalogListing> response shape. */
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
  verification_status?: string;
  is_verified?: boolean;
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
  has_docs?: boolean;
  is_verified: boolean;
  avg_rating_percent?: number;
}

/** GET /v1/apis/:listingId/docs response. */
export interface ListingDocsResponse {
  listing_id: string;
  doc_type: 'openapi' | 'markdown';
  content: string;
  parsed_endpoints: Record<string, unknown>[] | null;
  updated_at: string;
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
  /** Filter for verified sellers only. */
  verified?: boolean;
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
