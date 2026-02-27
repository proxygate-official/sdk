// Client
export { ProxyGateClient, ProxyGateError } from './client';

// Vault
export { VaultClient, VAULT_CONSTANTS } from './vault';

// Auth (existing)
export { signRequest } from './auth';

// Streaming
export { parseSSE } from './stream';

// Types (existing + new)
export type { SignRequestOptions, AuthHeaders } from './types';
export type {
  ProxyGateClientOptions,
  CreateClientOptions,
  BalanceResponse,
  PricingResponse,
  PricingService,
  PricingListing,
  UsageResponse,
  UsageEntry,
  UsageSummary,
  DepositResponse,
  WithdrawResponse,
  RateResponse,
  ApisResponse,
  ApiListing,
  ServicesResponse,
  ServiceStats,
  SellerProfileResponse,
  SettlementsResponse,
  SettlementDaily,
  SettlementSummary,
  SettlementPayout,
  SSEEvent,
  GatewayError,
  RequestOptions,
  ProxyChain,
  PricingQueryOptions,
  UsageQueryOptions,
  ApisQueryOptions,
  SettlementsQueryOptions,
  WithdrawOptions,
  RateOptions,
  VaultBalanceResponse,
  VaultDepositResponse,
  VaultWithdrawResponse,
  VaultWithdrawGatewayResponse,
  VaultWithdrawCompleteResponse,
  VaultReceipt,
  VaultDepositOptions,
  VaultWithdrawOptions,
  ReceiptVerificationResult,
  VaultDelegate,
} from './types';
