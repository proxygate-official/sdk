import type { EndpointSpec, EndpointPriceOverride } from './api.js';

/** Auth pattern for API key injection. */
export type ListingAuthPattern = 'none' | 'bearer' | 'header' | 'query' | 'basic' | 'oauth2_cc';

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
  /** Whether seller has opted into Shield request scanning. */
  shield_enabled?: boolean;
  listing_type?: 'proxy' | 'tunnel' | 'skill' | 'product' | 'dataset' | 'service' | 'connector';
  type_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // ---------------------------------------------------------------------------
  // Phase 51-08: surface slug + seller_slug + seller account_type so seller-side
  // dashboards can build canonical URLs without re-querying. All optional —
  // older gateway responses omit them.
  // ---------------------------------------------------------------------------
  /** Listing slug (kebab-case, unique per seller). */
  slug?: string;
  /** Seller's vanity slug, when set. NULL when seller has no slug. */
  seller_slug?: string | null;
  /** Seller's account type. */
  account_type?: 'personal' | 'organization';
  /**
   * Phase 51.5: TRUE when ProxyGate has approved this listing for free-tier serving.
   * Calls do not require a wallet deposit; per-wallet daily caps apply (see error code
   * `daily_free_cap`). Optional for backward compat with older gateway versions.
   */
  free_listing_approved?: boolean;
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
  upstream_headers?: Record<string, string>;
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
  /** Whether seller has opted into Shield request scanning. */
  shield_enabled?: boolean;
  listing_type?: string;
  type_metadata?: Record<string, unknown>;
  service_catalog: { slug: string; name: string; base_url: string } | null;
  // Phase 51-08: surface listing slug + seller branding hints on the raw row.
  /** Listing slug (kebab-case, unique per seller). */
  slug?: string;
  /** Seller's vanity slug, when set. */
  seller_slug?: string | null;
  /** Seller's account type. */
  account_type?: 'personal' | 'organization';
  /**
   * Phase 51.5: TRUE when ProxyGate has approved this listing for free-tier serving.
   * Optional — older gateway versions omit the field.
   */
  free_listing_approved?: boolean;
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
  /**
   * Price per request in micro-USDC. Two valid ranges:
   *   * `0` — Phase 51.6: submit as a "Pending approval" free listing. Any seller may
   *           submit; the row is created with `is_active = false` until an admin sets
   *           `free_listing_approved = true`. ProxyGate-curated free listings (Phase
   *           51.5) are activated immediately on creation.
   *   * `>= 1000` — paid listing ($0.001 floor, the smallest math-safe value with
   *           the 5% ceil-rounded fee).
   * Sub-cent values 1-999 are rejected by the gateway.
   */
  price_per_request: number;
  allowed_paths?: string[];
  endpoints?: EndpointSpec[];
  /** Phase 51.5: per-endpoint pricing overrides. Set price_per_request=0 to mark an endpoint free; daily_cap_* throttle the free traffic. */
  endpoint_prices?: EndpointPriceOverride[];
  /** Phase 51.5: listing-level per-wallet daily cap that applies to any endpoint resolving to price=0. NULL = proxy default 100/day. */
  free_daily_cap_per_wallet?: number | null;
  /** Phase 51.5: listing-level global daily cap that applies to free traffic. NULL = unlimited. */
  free_daily_cap_global?: number | null;
  category_slugs: string[];
  validation_endpoint?: string;
  /** Enable Shield request scanning on this listing (protects your API from malicious input). */
  shield_enabled?: boolean;
  /** Listing type. Defaults to 'proxy'. Tunnel excluded (use WebSocket upsert). */
  listing_type?: 'proxy' | 'skill' | 'product' | 'dataset' | 'service' | 'connector';
  /** Type-specific metadata (e.g. endpoint_url for skill, file_url for product). */
  type_metadata?: Record<string, unknown>;
  /** @deprecated Ignored by the server. All listings are tested before activation. */
  skip_test?: boolean;
}

/** Response from create endpoint. */
export interface CreateListingResponse {
  id: string;
  service: string;
  is_active: boolean;
  key_masked: string;
  sync_status: 'synced' | 'pending';
  /** Per-endpoint test results. */
  test_results?: Array<{
    success: boolean;
    status?: number;
    status_text?: string;
    latency_ms: number;
    body?: string;
    truncated?: boolean;
    error?: string;
    hint?: string | null;
    endpoint: { method: string; path: string };
    validation_type: 'full' | 'auth_only';
  }>;
  /** Whether all endpoints passed validation. */
  test_passed?: boolean;
  /** Human-readable summary of test results. */
  message?: string;
  /** Hint for activating an inactive listing (present when is_active=false). */
  activation_hint?: string;
}

/** Options for updating a listing (all fields optional). */
export interface UpdateListingOptions {
  description?: string;
  total_rpm?: number;
  reserved_rpm?: number;
  price_per_request?: number;
  allowed_paths?: string[];
  endpoints?: EndpointSpec[];
  /** Phase 51.5: per-endpoint pricing overrides — replaces the entire array on update. */
  endpoint_prices?: EndpointPriceOverride[];
  /** Phase 51.5: listing-level per-wallet daily cap for free endpoints. Pass null to clear. */
  free_daily_cap_per_wallet?: number | null;
  /** Phase 51.5: listing-level global daily cap for free endpoints. Pass null to clear. */
  free_daily_cap_global?: number | null;
  category_slugs?: string[];
  upstream_headers?: Record<string, string>;
  /** Enable Shield request scanning on this listing (protects your API from malicious input). */
  shield_enabled?: boolean;
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

/** Response from POST /v1/listings/:id/test (retest). */
export interface TestListingResponse {
  id: string;
  test_results: Array<{
    success: boolean;
    status?: number;
    status_text?: string;
    latency_ms: number;
    body?: string;
    truncated?: boolean;
    error?: string;
    hint?: string | null;
    endpoint: { method: string; path: string };
    validation_type: 'full' | 'auth_only';
  }>;
  test_passed: boolean;
  activated: boolean;
  /** Human-readable summary of test results. */
  message?: string;
}

/** Options for uploading listing documentation. */
export interface UploadDocsOptions {
  doc_type: 'openapi' | 'markdown';
  content: string;
}

/** Response from docs upload endpoint. For OpenAPI specs, includes parsed endpoints and test results. */
export interface UploadDocsResponse {
  uploaded: true;
  listing_id: string;
  doc_type: 'openapi' | 'markdown';
  /** Number of endpoints extracted from OpenAPI spec (0 for markdown). */
  endpoints_parsed: number;
  /** Endpoint test results — present when new endpoints were synced to the listing. */
  test_results?: Array<{
    success: boolean;
    status?: number;
    latency_ms: number;
    error?: string;
    hint?: string | null;
    endpoint: { method: string; path: string };
    validation_type: 'full' | 'auth_only';
  }>;
  /** Whether all endpoints passed validation. */
  test_passed?: boolean;
  /** Human-readable summary of test results. */
  message?: string;
}
