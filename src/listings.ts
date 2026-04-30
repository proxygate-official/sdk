import type {
  VaultDelegate,
  ListListingsResponse,
  ListingDetail,
  CreateListingOptions,
  CreateListingResponse,
  UpdateListingOptions,
  UpdateListingResponse,
  PauseListingResponse,
  UnpauseListingResponse,
  DeleteListingResponse,
  RotateKeyOptions,
  RotateKeyResponse,
  TestListingResponse,
  UploadDocsOptions,
  UploadDocsResponse,
} from './types.js';

/**
 * Client for managing seller listings on ProxyGate.
 *
 * Provides CRUD operations, pause/unpause, and key rotation
 * for seller API listings. Uses the same wallet auth as buyer operations.
 *
 * **Identifier contract (Phase 51-08):** mutation methods on this class
 * (`get`, `update`, `pause`, `unpause`, `delete`, `rotateKey`, `test`,
 * `uploadDocs`) accept the listing **UUID only**. Slug-based mutation routing
 * (e.g. `PATCH /v1/listings/:slug`) is intentionally out of scope for v0.6 —
 * that would require new gateway endpoints with their own ownership checks.
 *
 * Read paths exposed via `client.api()` / `client.proxy()` accept UUID, slug,
 * or `seller-handle/listing-slug` composites (see SDK README → "Listing
 * identifiers"). To convert a slug into a UUID for use with this class:
 *
 * ```ts
 * const detail = await client.api('blockdb-api');
 * await client.listings.pause(detail.listing_id);  // UUID for mutation
 * ```
 *
 * @example
 * ```ts
 * const listings = await client.listings.list();
 * const created = await client.listings.create({ ... });
 * await client.listings.pause(created.id);
 * ```
 */
export class ListingsClient {
  private readonly _delegate: VaultDelegate;

  constructor(delegate: VaultDelegate) {
    this._delegate = delegate;
  }

  /** List all listings owned by the authenticated wallet. */
  async list(): Promise<ListListingsResponse> {
    return this._delegate.authenticatedRequest<ListListingsResponse>('GET', '/v1/listings');
  }

  /** Get a single listing by ID. */
  async get(id: string): Promise<ListingDetail> {
    return this._delegate.authenticatedRequest<ListingDetail>('GET', `/v1/listings/${id}`);
  }

  /** Create a new listing. Validates credentials before creating. */
  async create(opts: CreateListingOptions): Promise<CreateListingResponse> {
    return this._delegate.authenticatedRequest<CreateListingResponse>('POST', '/v1/listings', {
      body: opts,
    });
  }

  /** Partial update a listing (capacity, pricing, paths, categories, description). */
  async update(id: string, opts: UpdateListingOptions): Promise<UpdateListingResponse> {
    return this._delegate.authenticatedRequest<UpdateListingResponse>(
      'PATCH',
      `/v1/listings/${id}`,
      { body: opts },
    );
  }

  /** Pause a listing (removes from marketplace routing). */
  async pause(id: string): Promise<PauseListingResponse> {
    return this._delegate.authenticatedRequest<PauseListingResponse>(
      'POST',
      `/v1/listings/${id}/pause`,
    );
  }

  /** Unpause a listing (re-enables marketplace routing). */
  async unpause(id: string): Promise<UnpauseListingResponse> {
    return this._delegate.authenticatedRequest<UnpauseListingResponse>(
      'POST',
      `/v1/listings/${id}/unpause`,
    );
  }

  /** Soft-delete a listing. Key is removed from Secret Manager immediately. */
  async delete(id: string): Promise<DeleteListingResponse> {
    return this._delegate.authenticatedRequest<DeleteListingResponse>(
      'DELETE',
      `/v1/listings/${id}`,
    );
  }

  /** Rotate API key or OAuth2 credentials. Validates before replacing. */
  async rotateKey(id: string, opts: RotateKeyOptions): Promise<RotateKeyResponse> {
    return this._delegate.authenticatedRequest<RotateKeyResponse>(
      'POST',
      `/v1/listings/${id}/rotate-key`,
      { body: opts },
    );
  }

  /** Re-test endpoints for an existing listing. Activates if tests pass. */
  async test(id: string): Promise<TestListingResponse> {
    return this._delegate.authenticatedRequest<TestListingResponse>(
      'POST',
      `/v1/listings/${id}/test`,
    );
  }

  /** Upload or replace documentation (OpenAPI spec or markdown) for a listing. */
  async uploadDocs(id: string, opts: UploadDocsOptions): Promise<UploadDocsResponse> {
    return this._delegate.authenticatedRequest<UploadDocsResponse>(
      'POST',
      `/v1/listings/${id}/docs`,
      { body: opts },
    );
  }
}
