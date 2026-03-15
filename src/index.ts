// Client
export { ProxyGateClient, ProxyGateError } from './client.js';

// Vault
export { VaultClient, VAULT_CONSTANTS } from './vault.js';

// Listings
export { ListingsClient } from './listings.js';

// Jobs
export { JobsClient } from './jobs.js';

// Tunnel
export { createTunnelClient } from './tunnel.js';

// ProxyGate namespace (one-liner APIs)
export { ProxyGate } from './proxygate.js';

// Auth (existing)
export { signRequest } from './auth.js';

// Keypair & Base58 utilities
export { parseKeypairBytes } from './keypair.js';
export { encodeBase58, decodeBase58 } from './base58.js';

// Shield
export { parseShieldInfo } from './client/proxy-methods.js';

// Pricing constants (platform-enforced, read-only)
export { SHIELD_SURCHARGE_DISPLAY, SHIELD_SURCHARGE_MICRO_CENTS, PLATFORM_FEE_BPS } from './pricing/constants.js';

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
  ShieldMode,
  ShieldInfo,
  ShieldBlockedError,
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
  JobStatus,
  InteractionType,
  Job,
  JobSubmission,
  JobDetail,
  JobsListOptions,
  JobsListResponse,
  CreateJobOptions,
  CreateJobResponse,
  ClaimJobResponse,
  SubmitJobOptions,
  SubmitJobResponse,
  AcceptJobResponse,
  RejectJobResponse,
  CancelJobResponse,
  UploadDocsOptions,
  UploadDocsResponse,
} from './types.js';
