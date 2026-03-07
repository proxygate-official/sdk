// Type barrel -- re-exports all types from the types/ subdirectory.
// Every type previously exported from this file remains available at the same path.

export type {
  SignRequestOptions,
  AuthHeaders,
  ProxyGateClientOptions,
  CreateClientOptions,
  GatewayError,
  SSEEvent,
  ProxyOptions,
  VaultDelegate,
} from './types/core.js';

export type {
  JsonSchema,
  EndpointSpec,
  PricingServiceEntry,
  PricingResponse,
  UsageEntry,
  UsageServiceSummary,
  UsageResponse,
  RateResponse,
  ApisResponse,
  ServiceStats,
  ServicesResponse,
  SellerProfileResponse,
  ApiListingDetail,
  ListingDocsResponse,
  PricingQueryOptions,
  UsageQueryOptions,
  ApisQueryOptions,
  WithdrawOptions,
  RateOptions,
  CategorySubcategory,
  CategoryEntry,
  CategoriesResponse,
} from './types/api.js';

export type {
  VaultBalanceResponse,
  VaultDepositResponse,
  VaultWithdrawGatewayResponse,
  VaultWithdrawSignResponse,
  VaultWithdrawCompleteResponse,
  VaultWithdrawConfirmResponse,
  VaultWithdrawResponse,
  VaultReceipt,
  VaultDepositOptions,
  VaultWithdrawOptions,
  ReceiptVerificationResult,
} from './types/vault.js';

export type {
  ListingAuthPattern,
  ListingSummary,
  ListingDetail,
  ListingRow,
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
} from './types/listings.js';

export type {
  SettlementDailyBuyer,
  SettlementDailySeller,
  SettlementDaily,
  SettlementSummaryBuyer,
  SettlementSummarySeller,
  SettlementSummary,
  SettlementPayout,
  SettlementsResponse,
  SettlementsQueryOptions,
} from './types/settlement.js';

export type {
  TunnelServiceConfig,
  TunnelOptions,
  TunnelRegisteredListing,
  TunnelClient,
  ServeOptions,
  ProxyGateServeOptions,
} from './types/tunnel.js';

export type {
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
} from './types/jobs.js';
