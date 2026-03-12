import type {
  VaultDelegate,
  JobsListOptions,
  JobsListResponse,
  JobDetail,
  CreateJobOptions,
  CreateJobResponse,
  ClaimJobResponse,
  SubmitJobOptions,
  SubmitJobResponse,
  AcceptJobResponse,
  RejectJobOptions,
  RejectJobResponse,
  CancelJobResponse,
} from './types.js';

/**
 * Client for interacting with the ProxyGate bounty board.
 *
 * Provides methods for the full job lifecycle: list, get, create,
 * claim, submit, accept, reject, cancel. Uses the same wallet auth
 * as buyer/seller operations.
 *
 * @example
 * ```ts
 * const jobs = await client.jobs.list({ status: 'open' });
 * const created = await client.jobs.create({ title: '...', description: '...', reward_usdc: 10 });
 * await client.jobs.claim(created.id);
 * ```
 */
export class JobsClient {
  private readonly _delegate: VaultDelegate;

  constructor(delegate: VaultDelegate) {
    this._delegate = delegate;
  }

  /** List jobs with optional filtering. */
  async list(opts?: JobsListOptions): Promise<JobsListResponse> {
    const query: Record<string, string> = {};
    if (opts?.status) query.status = opts.status;
    if (opts?.category) query.category = opts.category;
    if (opts?.interaction_type) query.interaction_type = opts.interaction_type;
    if (opts?.search) query.search = opts.search;
    if (opts?.limit) query.limit = String(opts.limit);
    if (opts?.offset) query.offset = String(opts.offset);
    return this._delegate.authenticatedRequest<JobsListResponse>('GET', '/v1/jobs', {
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }

  /** Get a single job by ID, including its current submission. */
  async get(id: string): Promise<JobDetail> {
    return this._delegate.authenticatedRequest<JobDetail>('GET', `/v1/jobs/${id}`);
  }

  /** Create (post) a new job. Locks escrow for reward + buyer fee. */
  async create(opts: CreateJobOptions): Promise<CreateJobResponse> {
    return this._delegate.authenticatedRequest<CreateJobResponse>('POST', '/v1/jobs', { body: opts });
  }

  /** Claim an open job as solver. */
  async claim(jobId: string): Promise<ClaimJobResponse> {
    return this._delegate.authenticatedRequest<ClaimJobResponse>('POST', `/v1/jobs/${jobId}/claim`);
  }

  /** Submit work for a claimed job. */
  async submit(jobId: string, opts: SubmitJobOptions): Promise<SubmitJobResponse> {
    return this._delegate.authenticatedRequest<SubmitJobResponse>('POST', `/v1/jobs/${jobId}/submit`, { body: opts });
  }

  /** Accept a submission and release escrow to solver. */
  async accept(jobId: string): Promise<AcceptJobResponse> {
    return this._delegate.authenticatedRequest<AcceptJobResponse>('POST', `/v1/jobs/${jobId}/accept`);
  }

  /** Reject a submission. 2nd rejection triggers admin dispute review. */
  async reject(jobId: string, opts?: RejectJobOptions): Promise<RejectJobResponse> {
    return this._delegate.authenticatedRequest<RejectJobResponse>('POST', `/v1/jobs/${jobId}/reject`, {
      body: opts ?? {},
    });
  }

  /** Cancel an open or claimed job and refund escrow to poster. */
  async cancel(jobId: string): Promise<CancelJobResponse> {
    return this._delegate.authenticatedRequest<CancelJobResponse>('POST', `/v1/jobs/${jobId}/cancel`);
  }
}
