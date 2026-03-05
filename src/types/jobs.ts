// --- Jobs ---

/** Job status reflecting the full lifecycle. */
export type JobStatus = 'open' | 'claimed' | 'in_review' | 'completed' | 'refunded' | 'cancelled';

/** Interaction type for job categorization. */
export type InteractionType = 'M2M' | 'H2M' | 'M2H';

/** A job posted to the bounty board. */
export interface Job {
  id: string;
  title: string;
  description: string;
  category: string | null;
  interaction_type: InteractionType;
  status: JobStatus;
  poster_wallet: string;
  solver_wallet: string | null;
  reward_lamports: number;
  buyer_fee: number;
  seller_fee: number;
  total_cost: number;
  deadline: string | null;
  rejection_count: number;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
}

/** A submission to a job. */
export interface JobSubmission {
  id: string;
  job_id: string;
  solver_wallet: string;
  result_text: string;
  result_url: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  platform_signature: string | null;
  platform_pubkey: string | null;
  created_at: string;
}

/** Job detail including its current submission (if any). */
export interface JobDetail extends Job {
  submission: JobSubmission | null;
}

/** Options for listing/filtering jobs. */
export interface JobsListOptions {
  status?: string;
  category?: string;
  interaction_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Response from listing jobs. */
export interface JobsListResponse {
  jobs: Job[];
  total: number;
}

/** Options for creating a new job. */
export interface CreateJobOptions {
  title: string;
  description: string;
  reward_usdc: number;
  category?: string;
  interaction_type?: InteractionType;
  deadline?: string;
}

/** Response from creating a job (includes escrow receipt). */
export interface CreateJobResponse extends Job {
  receipt: Record<string, unknown>;
}

/** Response from claiming a job. */
export interface ClaimJobResponse {
  job: Job;
}

/** Options for submitting work on a job. */
export interface SubmitJobOptions {
  result_text: string;
  result_url?: string;
}

/** Response from submitting work (includes platform attestation). */
export interface SubmitJobResponse {
  submission: JobSubmission;
  attestation?: { hash: string; signature: string; timestamp: string; platform_pubkey: string };
}

/** Response from accepting a submission (includes payout receipt). */
export interface AcceptJobResponse {
  job: Job;
  receipt: Record<string, unknown>;
}

/** Response from rejecting a submission. */
export interface RejectJobResponse {
  job: Job;
  auto_released: boolean;
  receipt?: Record<string, unknown>;
}

/** Response from cancelling a job (includes refund receipt). */
export interface CancelJobResponse {
  job: Job;
  receipt: Record<string, unknown>;
}
