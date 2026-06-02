// Type barrel -- re-exports all types from the types/ subdirectory.
// Every type previously exported from this file remains available at the same path.

export type {
  SignRequestOptions,
  AuthHeaders,
  ProxygateClientOptions,
  CreateClientOptions,
  GatewayError,
  GatewayErrorCode,
  SSEEvent,
  ProxyOptions,
  VaultDelegate,
  ShieldMode,
  ShieldInfo,
  ShieldBlockedError,
  SellerStrategy,
} from './types/core.js';

export type {
  JsonSchema,
  EndpointSpec,
  EndpointPriceOverride,
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
  ListingType,
  SkillMetadata,
  ProductMetadata,
  DatasetMetadata,
  ServiceMetadata,
  ConnectorMetadata,
  SetContactEmailOptions,
  SetContactEmailResponse,
  VerifyContactEmailOptions,
  VerifyContactEmailResponse,
} from './types/api.js';

export {
  isSkillListing,
  isProductListing,
  isDatasetListing,
  isServiceListing,
  isConnectorListing,
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
  TestListingResponse,
  UploadDocsOptions,
  UploadDocsResponse,
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
  ProxygateServeOptions,
} from './types/tunnel.js';

