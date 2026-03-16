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
  /** Total unsettled earnings in USDC (seller only). */
  pending_payout_usdc?: number;
  /** Whether the seller has a USDC token account (seller only). */
  ata_status?: 'active' | 'missing' | 'unknown';
  /** Instruction to create ATA when missing (seller only). */
  ata_action?: string;
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
