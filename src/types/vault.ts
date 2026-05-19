/** GET /v1/balance (vault-backed) */
export interface VaultBalanceResponse {
  balance: number;
  pending_settlement: number;
  available: number;
  in_cooldown: boolean;
  currency: string;
  /** Total unsettled seller earnings in USDC (seller wallets only). */
  pending_payout_usdc?: number;
  /** Whether the wallet has a USDC token account (seller wallets only). */
  ata_status?: 'active' | 'missing' | 'unknown';
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

/** POST /v1/withdraw response -- union of gateway intermediate and SDK complete states. */
export type VaultWithdrawResponse =
  | VaultWithdrawGatewayResponse
  | VaultWithdrawCompleteResponse;

/**
 * RFC-9345-style delegation proving an ephemeral key may sign receipts.
 * Present on `receipt_version: 2` receipts (Phase 62).
 */
export interface ReceiptDelegation {
  ephemeral_pubkey: string;
  purpose: 'proxygate-receipt';
  not_before: number;
  not_after: number;
  signature: string;
  receipt_ca_pubkey: string;
}

/** Signed receipt from a proxy call (returned in x-proxygate-receipt header). */
export interface VaultReceipt {
  request_id: string;
  buyer: string;
  seller: string;
  amount: number;
  timestamp: number;
  signature: string;
  /**
   * Absent/1 = legacy treasury-KMS signature (verify vs /health
   * `platform_pubkey`). 2 = ephemeral-key signature; `delegation` carries
   * the trust chain anchored at /health `receipt_ca_pubkey`.
   */
  receipt_version?: 1 | 2;
  delegation?: ReceiptDelegation;
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
  /** Optional progress callback, called on each poll iteration. */
  onProgress?: (info: { status: string; remainingMs: number; elapsed: number }) => void;
}

/** Receipt verification result. */
export interface ReceiptVerificationResult {
  receipt: VaultReceipt;
  valid: boolean;
  reason?: string;
}
