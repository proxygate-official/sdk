import type { components } from '../generated/gateway.js';
import type { VaultBalanceResponse } from './vault.js';
import type { SettlementsResponse } from './settlement.js';

/** JSON Schema Draft-07 object (open-ended). */
export type JsonSchema = Record<string, unknown>;

/**
 * SDK-CODEGEN drift guards (SAFE-06).
 *
 * The hand-written response types remain the AUTHORITATIVE public SDK surface, so
 * a gateway spec change can NEVER silently mutate the SDK's public API (the
 * SAFE-06 drift vector). The generated types from the /v1 OpenAPI spec
 * (`src/generated/gateway.ts`, produced by `pnpm gen:types` from the committed
 * `apps/gateway/openapi.generated.json`, itself produced by `gen:openapi`) are
 * the source of TRUTH for drift DETECTION via compile-time assignability checks.
 *
 * TWO guard flavors:
 *   - BIDIRECTIONAL (`_X` + `_XRev`): the SDK type and the spec type are
 *     structurally EQUAL. Trips if either side changes shape.
 *   - DIRECTIONAL (`AssertSpecFitsSdk`, one check): "real (spec) response data
 *     is assignable to the SDK's public type" — the consumer-safety invariant
 *     the SDK exists to guarantee. Used where the SDK is a deliberate looser /
 *     curated SUBSET view of reality (e.g. SDK `currency: string` vs spec
 *     literal, SDK omits a spec field, SDK adds optional fields the spec lacks).
 *     Keeps the SDK public type byte-unchanged (semver 0) while still detecting
 *     a real-data shape that would no longer fit the SDK's promise.
 *
 * A guard that cannot be made to compile honestly is a FLAGGED mismatch (a real
 * SDK-vs-reality bug needing a semver decision), NEVER a reason to edit an SDK
 * public type. See the codegen report for the flagged cases (usage, settlements).
 */
type AssertExtends<A extends B, B> = A;
/** Directional: SPEC data must be assignable to the SDK type (consumer-safety). */
type AssertSpecFitsSdk<Spec extends Sdk, Sdk> = Spec;

// categories — BIDIRECTIONAL (exact match: categories/has_more/cursor + clusters).
type _GenCategories = components['schemas']['CategoriesResponse'];
type _CategoriesGuardFwd = AssertExtends<CategoriesResponse, _GenCategories>;
type _CategoriesGuardRev = AssertExtends<_GenCategories, CategoriesResponse>;

// pricing — DIRECTIONAL: spec narrows currency/deposit_endpoint to literals
// ('USDC' / '/v1/deposit'), which fit the SDK's `string`. SDK is a looser view.
type _PricingGuard = AssertSpecFitsSdk<components['schemas']['PricingResponse'], PricingResponse>;

// services — DIRECTIONAL: spec is a SUPERSET (exposes `cheapest_buyer_price_usdc`
// the SDK omits). Spec data still fits the SDK type; extra props are allowed.
type _ServicesGuard = AssertSpecFitsSdk<components['schemas']['ServicesResponse'], ServicesResponse>;

// apis — FLAGGED (UNGUARDED), but the SDK type is CORRECT, not buggy. The SDK's
// ApiListingDetail.listing_type is the `ListingType` enum, which IS accurate —
// seller_listings has a CHECK constraint enforcing exactly that set (prod-
// verified). The gateway nonetheless EMITS `string` because its response type is
// the shared `@proxygate/api-types` CatalogListing, whose listing_type is
// `string` (catalog-enrichment produces String(...)). Guarding would require
// narrowing that field IN THE SHARED api-types package, which ripples to web —
// outside this task's gateway+SDK gate. So apis stays unguarded pending that
// cross-package follow-up. NOT an SDK bug; a gateway-under-claims-via-shared-type.
// TODO(followup): narrow CatalogListing.listing_type in @proxygate/api-types + re-verify web.

// balance — DIRECTIONAL: spec `currency: 'lamports'` fits SDK `string`; SDK adds
// optional seller-only fields (pending_payout_usdc/ata_status) the spec lacks.
type _BalanceGuard = AssertSpecFitsSdk<components['schemas']['VaultBalanceResponse'], VaultBalanceResponse>;

// sellerProfile — DIRECTIONAL (resolved): the spec latency inner p50/p95/p99 are
// now NON-null (narrowed — aggregateListingMetrics returns numbers; the outer
// `latency` object being null encodes "no data"), matching the SDK. Spec data
// fits the SDK type (SDK keeps Phase-51 optional fields the spec lacks).
type _SellerProfileGuard = AssertSpecFitsSdk<components['schemas']['SellerProfileResponse'], SellerProfileResponse>;

// usage — DIRECTIONAL (resolved): the spec UsageRow now matches reality —
// path/status_code/latency_ms/cost_micro_cents/listing_id NON-null (prod), and
// the SDK's UsageEntry.seller_id was WIDENED to `string | null` (the one breaking
// change). SDK keeps an optional `is_free?` the gateway doesn't return — extra
// optional, so spec data fits the SDK type.
type _UsageGuard = AssertSpecFitsSdk<components['schemas']['UsageResponse'], UsageResponse>;

// settlements — DIRECTIONAL (resolved): the spec `daily` is now a union of
// buyer/seller row schemas (matching the SDK's SettlementDaily union), `service`
// is NON-null (RPC GROUPs BY a non-null column), and payout `status` is NON-null
// (prod). Spec data fits the SDK's SettlementsResponse.
type _SettlementsGuard = AssertSpecFitsSdk<components['schemas']['SettlementHistoryResponse'], SettlementsResponse>;

/** A single documented endpoint on a listing. */
export interface EndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description?: string;
  request_schema?: JsonSchema;
  /** Seller-defined body field overrides. Merged on top of buyer's request body — buyer cannot override these values. */
  body_overrides?: Record<string, unknown>;
  /** Seller-defined query param overrides. Merged into upstream URL — buyer cannot override these values. */
  query_overrides?: Record<string, string>;
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
  /**
   * BREAKING (0.11.0): widened to `string | null` to match reality — the
   * gateway's api_requests.seller_id column is nullable (prod-verified), so this
   * can be null. Consumers must handle null.
   */
  seller_id: string | null;
  created_at: string;
  /**
   * Phase 51.5: TRUE when this request was served by a procured free listing
   * (free_listing_approved=true). `cost_micro_cents` is always 0 when this is TRUE
   * — no USDC was charged. Optional for backward compat with older gateways.
   */
  is_free?: boolean;
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
  success: boolean;
  is_update: boolean;
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

/** GET /v1/seller/profile/:wallet (legacy) and /v1/seller/profile/by-handle/:handle (Phase 51-02). */
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

  // ---------------------------------------------------------------------------
  // Phase 51-08: by-handle resolver fields. Optional for backwards compat with
  // the legacy `/v1/seller/profile/:wallet` shape that doesn't return them.
  // ---------------------------------------------------------------------------
  /** Vanity slug (kebab-case). NULL until the seller claims one. */
  slug?: string | null;
  /** 'personal' (humans + agents) or 'organization' (companies/teams). */
  account_type?: 'personal' | 'organization';
  /** Organization name when account_type='organization'. */
  organization?: string | null;
  /** Display name (overrides truncated wallet on profile cards). */
  display_name?: string | null;
  /** Sanitized markdown bio (text + links + headers + lists + bold/italic only). */
  bio_md?: string | null;
  /** Banner image URL (Supabase Storage). */
  banner_url?: string | null;
  /** Website URL (https only, validated server-side). */
  website_url?: string | null;
  /** Avatar / logo URL. */
  avatar_url?: string | null;
  /** Country code (ISO 3166-1 alpha-2). */
  country?: string | null;
  /**
   * Canonical handle as resolved by the gateway: slug if set, else wallet.
   * Use for SEO 308 redirects (wallet → slug) and link consolidation.
   */
  canonical_handle?: string;
  /**
   * Canonical path: `/seller/{canonical_handle}`.
   * Use directly for redirects to avoid client-side string assembly.
   */
  canonical_path?: string;
  /** Number of currently active listings owned by this seller. */
  total_active_listings?: number;
}

/** Per-endpoint pricing override. */
export interface EndpointPriceOverride {
  path: string;
  pricing_unit: 'per_request' | 'per_token';
  /** Micro-USDC integer. 0 enables the free-path for this endpoint (Phase 51.5). */
  price_per_request?: number;
  price_per_input_token?: number;
  price_per_output_token?: number;
  /** Phase 51.5: per-endpoint per-wallet daily cap on free calls. Only meaningful when price_per_request=0. NULL = listing-level fallback (or proxy default 100/day). */
  daily_cap_per_wallet?: number | null;
  /** Phase 51.5: per-endpoint global daily cap on free calls. Only meaningful when price_per_request=0. NULL = unlimited (or listing-level fallback). */
  daily_cap_global?: number | null;
}

/** All supported listing types. */
export type ListingType = 'proxy' | 'tunnel' | 'skill' | 'product' | 'dataset' | 'service' | 'connector';

/** Skill listing metadata. */
export interface SkillMetadata { endpoint_url: string; }
/** Product listing metadata. */
export interface ProductMetadata { storage_type: string; file_url: string; file_name: string; mime_type: string; expiry_seconds: number; max_downloads: number; }
/** Dataset listing metadata. */
export interface DatasetMetadata { delivery_type: string; bulk_url: string; data_format: string; record_count: number; }
/** Service listing metadata. */
export interface ServiceMetadata { webhook_url: string; relay_method: string; timeout_ms: number; }
/** Connector listing metadata. */
export interface ConnectorMetadata { platform: string; relay_url: string; }

/** Type guard: is this a skill listing? */
export function isSkillListing(l: ApiListingDetail): l is ApiListingDetail & { type_metadata: SkillMetadata } {
  return l.listing_type === 'skill';
}
/** Type guard: is this a product listing? */
export function isProductListing(l: ApiListingDetail): l is ApiListingDetail & { type_metadata: ProductMetadata } {
  return l.listing_type === 'product';
}
/** Type guard: is this a dataset listing? */
export function isDatasetListing(l: ApiListingDetail): l is ApiListingDetail & { type_metadata: DatasetMetadata } {
  return l.listing_type === 'dataset';
}
/** Type guard: is this a service listing? */
export function isServiceListing(l: ApiListingDetail): l is ApiListingDetail & { type_metadata: ServiceMetadata } {
  return l.listing_type === 'service';
}
/** Type guard: is this a connector listing? */
export function isConnectorListing(l: ApiListingDetail): l is ApiListingDetail & { type_metadata: ConnectorMetadata } {
  return l.listing_type === 'connector';
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
  endpoint_prices?: EndpointPriceOverride[];
  has_docs?: boolean;
  is_verified: boolean;
  avg_rating_percent?: number;
  /** Listing type. Defaults to 'proxy' for backward compat. */
  listing_type?: ListingType;
  /** Type-specific metadata. */
  type_metadata?: Record<string, unknown>;

  // ---------------------------------------------------------------------------
  // Phase 51-08: enrichment fields surfaced from api_catalog view (51-01) and
  // catalog handler (51-02). All optional — older gateway versions omit them.
  // ---------------------------------------------------------------------------
  /** Listing slug (kebab-case, unique per seller). */
  slug?: string;
  /** Seller's vanity slug, when set. NULL when seller has no slug. */
  seller_slug?: string | null;
  /** Seller's account type. Drives JSON-LD schema (Organization vs Person). */
  seller_account_type?: 'personal' | 'organization';
  /** Seller's account type — alias used by some web layers; same value as seller_account_type. */
  account_type?: 'personal' | 'organization';
  /** Organization name when seller_account_type='organization'. NULL otherwise. */
  organization?: string | null;
  /** Total number of ratings received. Used to gate aggregateRating JSON-LD. */
  total_ratings?: number;

  // ---------------------------------------------------------------------------
  // Buyer-facing pricing + branding enrichment surfaced from the api_catalog
  // view (mirrors @proxygate/api-types CatalogListing). All optional — older
  // gateway versions omit them. Nullability follows the api-types schema.
  // ---------------------------------------------------------------------------
  /** Buyer-facing per-request price in USDC (base price + platform fee). NULL for token-priced listings. */
  buyer_price_per_request_usdc?: number | null;
  /** Buyer-facing per-input-token price in USDC. NULL for request-priced listings. */
  buyer_price_per_input_token_usdc?: number | null;
  /** Buyer-facing per-output-token price in USDC. NULL for request-priced listings. */
  buyer_price_per_output_token_usdc?: number | null;
  /** Platform fee percentage applied on top of the seller's base price. */
  platform_fee_pct?: number;
  /** Seller's organization name. NULL for personal accounts or when unset. */
  seller_organization?: string | null;
  /** Seller's logo URL (avatar_url). NULL when no logo uploaded. */
  seller_avatar_url?: string | null;
  /** Per-listing logo override (e.g. the upstream provider's logo for curated listings). NULL when unset. */
  provider_logo_url?: string | null;
  /** Verified-partner flag — TRUE only when approved through the partnership review flow. Distinct from is_verified (KYC). */
  is_partner?: boolean;

  // ---------------------------------------------------------------------------
  // Phase 51.5: procured free listings.
  // ---------------------------------------------------------------------------
  /**
   * TRUE when Proxygate has approved this listing for free-tier serving (e.g. Open-Meteo).
   * Calls to free_listing_approved listings do NOT require a wallet deposit; per-wallet
   * and global daily caps apply (see error codes `daily_free_cap` + `listing_quota_exhausted`).
   * Optional for backward compat with older gateway versions that don't surface the field.
   */
  free_listing_approved?: boolean;
}

/** GET /v1/apis/:listingId/docs response. */
export interface ListingDocsResponse {
  listing_id: string;
  doc_type: 'openapi' | 'markdown' | 'graphql';
  content: string;
  /** OpenAPI: parsed endpoints. GraphQL: parsed operations. Markdown: null. */
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
  /** Sort order: price_asc, price_desc, popular, newest, fastest, best_rated. */
  sort?: 'price_asc' | 'price_desc' | 'popular' | 'newest' | 'fastest' | 'best_rated';
  /** Text search query. */
  q?: string;
  /** Filter for verified sellers only. */
  verified?: boolean;
  /** Filter by listing type (e.g. 'skill', 'product'). */
  type?: ListingType;
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

// ---------------------------------------------------------------------------
// Fase 1: contact-email capture + verification (Phase 64-ish "email capture")
//
// MIGRATION DEBT (Phase 53): the shared `@proxygate/api-types` package does not
// exist yet, so these wire types are defined LOCALLY here. The SOURCE OF TRUTH
// for the actual shape is the gateway Zod schema for
// `POST /v1/profile/email` and `POST /v1/profile/email/verify`. When api-types
// ships, delete these and import from there. (Mirrors the x402 local-types debt
// pattern carried in the gateway during Phase 53 bring-up.)
//
// Field names below follow the LOCKED CONTRACT defaults; if the gateway schema
// diverges, align the field names here to the gateway and bump per SAFE-06.
// ---------------------------------------------------------------------------

/** POST /v1/profile/email — wallet/bearer-authed. Submit a contact email for the caller's wallet. */
export interface SetContactEmailOptions {
  /** Contact email to associate with the authenticated wallet. classification:pii */
  email: string;
}

/** POST /v1/profile/email response. Intentionally does NOT echo the email back. */
export interface SetContactEmailResponse {
  success: boolean;
}

/** POST /v1/profile/email/verify — wallet/bearer-authed. Confirm ownership via the emailed token. */
export interface VerifyContactEmailOptions {
  /** One-time verification token delivered to the submitted email. */
  token: string;
}

/**
 * POST /v1/profile/email/verify response.
 *
 * `status` is a closed-ish enum per the contract; treat unknown values
 * defensively (newer gateways may add states). The `'conflict'` state signals
 * the heavy web-claim path (email already bound to another identity) — the
 * gateway also returns a {@link GatewayError} with an `action`/`docs` pointer
 * in that case, which the SDK propagates unswallowed.
 */
export interface VerifyContactEmailResponse {
  verified: boolean;
  status: 'verified' | 'invalid' | 'expired' | 'already_used' | 'conflict';
}

/** POST /v1/profile/username — wallet/bearer-authed. Set the caller's username. */
export interface SetUsernameOptions {
  /** Username to set: 3-32 chars, lowercase [a-z0-9], single dashes (no leading/trailing/double dash). */
  username: string;
}

/** POST /v1/profile/username response. Intentionally does NOT echo the username back. */
export interface SetUsernameResponse {
  success: boolean;
}
