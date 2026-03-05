// Client
export { ProxyGateClient, ProxyGateError } from './client.js';

// Vault
export { VaultClient, VAULT_CONSTANTS } from './vault.js';

// Listings
export { ListingsClient } from './listings.js';

// Tunnel
export { createTunnelClient } from './tunnel.js';

// ProxyGate namespace (one-liner APIs)
export { ProxyGate } from './proxygate.js';

// Auth (existing)
export { signRequest } from './auth.js';

// Streaming
export { parseSSE } from './stream.js';

// Types (existing + new)
export type { SignRequestOptions, AuthHeaders } from './types.js';
export type {
  ProxyGateClientOptions,
  CreateClientOptions,
  PricingResponse,
  PricingServiceEntry,
  UsageResponse,
  UsageEntry,
  UsageServiceSummary,
  RateResponse,
  ApisResponse,
  ServicesResponse,
  ServiceStats,
  SellerProfileResponse,
  SettlementsResponse,
  SettlementDaily,
  SettlementDailyBuyer,
  SettlementDailySeller,
  SettlementSummary,
  SettlementSummaryBuyer,
  SettlementSummarySeller,
  SettlementPayout,
  SSEEvent,
  GatewayError,
  ProxyOptions,
  CategoriesResponse,
  CategoryEntry,
  CategorySubcategory,
  ApiListingDetail,
  ListingDocsResponse,
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
  ListingRow,
  ListingSummary,
  ListingDetail,
  ListListingsResponse,
  CreateListingOptions,
  CreateListingResponse,
  UpdateListingOptions,
  UpdateListingResponse,
  PauseListingResponse,
  UnpauseListingResponse,
  DeleteListingResponse,
  RotateKeyOptions,
  RotateKeyResponse,
  ListingAuthPattern,
  TunnelServiceConfig,
  TunnelOptions,
  TunnelRegisteredListing,
  TunnelClient,
  ServeOptions,
  ProxyGateServeOptions,
} from './types.js';
