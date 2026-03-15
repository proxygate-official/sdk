import type { EndpointSpec } from './api.js';

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
  /** Enable Shield request scanning on this listing (protects your API from malicious input). */
  shield_enabled?: boolean;
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

/** Options for uploading listing documentation. */
export interface UploadDocsOptions {
  doc_type: 'openapi' | 'markdown';
  content: string;
}

/** Response from docs upload endpoint. */
export interface UploadDocsResponse {
  uploaded: true;
  listing_id: string;
  doc_type: 'openapi' | 'markdown';
}
