// Client
export { ProxyGateClient, ProxyGateError } from './client.js';

// Vault
export { VaultClient, VAULT_CONSTANTS } from './vault.js';

// Auth (existing)
export { signRequest } from './auth.js';

// Streaming
export { parseSSE } from './stream.js';

// Types (existing + new)
export type { SignRequestOptions, AuthHeaders } from './types.js';
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
  RateResponse,
  ApisResponse,
  ServicesResponse,
  ServiceStats,
  SellerProfileResponse,
  SettlementsResponse,
  SettlementDaily,
  SettlementSummary,
  SettlementPayout,
  SSEEvent,
  GatewayError,
  ProxyOptions,
  CategoriesResponse,
  CategoryEntry,
  CategorySubcategory,
  ApiListingDetail,
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
  VaultWithdrawSignResponse,
  VaultWithdrawCompleteResponse,
  VaultWithdrawConfirmResponse,
  VaultReceipt,
  VaultDepositOptions,
  VaultWithdrawOptions,
  ReceiptVerificationResult,
  VaultDelegate,
} from './types.js';
