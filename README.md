# @proxygate/sdk

SDK for interacting with the ProxyGate API marketplace. Provides a typed client for browsing listings, proxying API requests through sellers, managing USDC deposits/withdrawals via on-chain vaults, and verifying signed receipts.

## Installation

```bash
npm install @proxygate/sdk
# or
pnpm add @proxygate/sdk
# or
yarn add @proxygate/sdk
```

### Peer dependencies

`@solana/web3.js` and `@solana/spl-token` are optional peer dependencies. They are only required if you use `client.vault.deposit()` or `client.vault.withdraw()` (on-chain transactions). Balance checks, proxying, and receipt verification work without them.

```bash
npm install @solana/web3.js @solana/spl-token
```

## Quick Start

### From a keypair file (recommended)

```ts
import { ProxyGateClient } from '@proxygate/sdk';

const client = await ProxyGateClient.create({
  gatewayUrl: 'https://gateway.proxygate.ai',
  keypairPath: '~/.config/solana/id.json',
});

const balance = await client.vault.balance();
console.log(`Available: ${balance.available} credits`);
```

`ProxyGateClient.create()` reads a standard Solana keypair JSON file (64-byte array), derives the wallet address automatically, and returns a ready-to-use client. Supports `~` expansion and relative paths.

### Direct construction

Use this when you already have the secret key in memory (e.g., from an environment variable or agent runtime).

```ts
import { ProxyGateClient } from '@proxygate/sdk';

const client = new ProxyGateClient({
  gatewayUrl: 'https://gateway.proxygate.ai',
  walletAddress: 'YourSolanaPublicKeyBase58...',
  secretKey: yourKeypair.secretKey, // Uint8Array (64 bytes)
});
```

## Authentication

ProxyGate uses a nonce-based ed25519 signature scheme. Every authenticated request requires three headers:

| Header | Value |
|---|---|
| `x-wallet` | Your Solana public key (base58) |
| `x-nonce` | A one-time nonce from the gateway |
| `x-signature` | Base64-encoded ed25519 signature of the nonce |

The `ProxyGateClient` handles this automatically with a built-in nonce pool that pre-fetches nonces in the background for low-latency concurrent requests.

### Low-level usage with `signRequest()`

If you need manual control (e.g., integrating with a custom HTTP client), use `signRequest()` directly:

```ts
import { signRequest } from '@proxygate/sdk';

const headers = await signRequest({
  gatewayUrl: 'https://gateway.proxygate.ai',
  walletAddress: 'YourSolanaPublicKey...',
  secretKey: yourKeypair.secretKey,
});

// Attach headers to your own fetch call
const res = await fetch('https://gateway.proxygate.ai/v1/balance', {
  headers,
});
```

Each call to `signRequest()` fetches a fresh nonce and produces headers valid for exactly one request.

## API Methods

### Discovery (public, no auth required)

| Method | Description |
|---|---|
| `client.pricing(opts?)` | Browse available API pricing, optionally filtered by service |
| `client.apis(opts?)` | Browse listings with filters (service, category, sort, search) |
| `client.api(listingId)` | Get a single listing by ID |
| `client.services()` | Get aggregated stats per service (seller count, pricing, latency) |
| `client.categories()` | Get all categories with listing counts |
| `client.sellerProfile(wallet)` | Get a seller's public profile, badges, and ratings |

### Authenticated (wallet signature required)

| Method | Description |
|---|---|
| `client.balance()` | Get credit balance for the authenticated wallet |
| `client.usage(opts?)` | Get paginated usage history with per-service summaries |
| `client.settlements(opts?)` | Get settlement history (daily breakdown, payouts) |
| `client.rate(opts)` | Rate a seller after a proxy request |
| `client.proxy(listingId, path, body?, opts?)` | Proxy a request through a seller's listing |

### Vault (on-chain operations)

| Method | Description |
|---|---|
| `client.vault.balance()` | Balance breakdown (total, pending, available, cooldown) |
| `client.vault.deposit(opts)` | Deposit USDC on-chain, confirm with gateway |
| `client.vault.withdraw(opts?)` | Initiate cooldown, wait, withdraw on-chain |
| `client.vault.verifyReceipts(receipts)` | Verify signed receipts from proxy calls |

## Proxy

The `proxy()` method sends authenticated requests through a seller's API listing. It resolves the service slug from the listing ID (cached after first lookup), handles auth headers, and returns a raw `Response` object.

```ts
// JSON response
const res = await client.proxy('listing-uuid', '/v1/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
});
const data = await res.json();
```

### Streaming with `parseSSE()`

For streaming responses (e.g., LLM completions), use the `parseSSE()` async generator:

```ts
import { ProxyGateClient, parseSSE } from '@proxygate/sdk';

const res = await client.proxy('listing-uuid', '/v1/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Explain quantum computing' }],
  stream: true,
});

for await (const event of parseSSE(res)) {
  const chunk = JSON.parse(event.data);
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

`parseSSE()` handles chunk boundaries, multi-line data fields, and the `[DONE]` sentinel automatically.

### Proxy options

```ts
const res = await client.proxy('listing-uuid', '/v1/embeddings', body, {
  method: 'POST',           // default: POST
  headers: { 'x-custom': 'value' },
  query: { version: '2024-01' },
  retries: 2,               // retry on 5xx with exponential backoff
  signal: AbortSignal.timeout(10_000),
});
```

## Vault System

The vault is a non-custodial on-chain escrow system. Buyers deposit USDC into per-wallet PDA vaults on Solana. The gateway tracks credit balances backed by these on-chain deposits, and proxy calls deduct credits in real time.

**The vault auto-initializes on the first deposit.** There is no separate setup or initialization step. The Solana program creates the vault PDA and token account in the same transaction as the first deposit.

### Deposit

Deposits USDC from the buyer's associated token account into the vault PDA. The SDK builds the Solana transaction, submits it, and confirms with the gateway.

```ts
// Deposit 5 USDC (USDC has 6 decimals)
const deposit = await client.vault.deposit({
  amount: 5_000_000,
});

console.log(`Deposited: ${deposit.deposited} credits`);
console.log(`New balance: ${deposit.balance}`);
console.log(`TX: ${deposit.tx_signature}`);
```

You can pass a custom RPC URL if you are not on devnet:

```ts
const deposit = await client.vault.deposit({
  amount: 10_000_000,
  rpcUrl: 'https://api.mainnet-beta.solana.com',
});
```

### Balance

Returns a breakdown of how the vault balance is allocated:

```ts
const balance = await client.vault.balance();
console.log(`Total:              ${balance.balance}`);
console.log(`Pending settlement: ${balance.pending_settlement}`);
console.log(`Available to spend: ${balance.available}`);
console.log(`In cooldown:        ${balance.in_cooldown}`);
```

This does NOT require `@solana/web3.js` -- it queries the gateway API only.

### Withdraw

Withdrawing follows a cooldown protocol to ensure all pending settlements are finalized before funds leave the vault. The SDK handles the full flow:

1. Initiates cooldown via the gateway (`POST /v1/withdraw`)
2. Polls the balance until the cooldown period completes
3. Builds and submits the on-chain withdraw transaction

```ts
// Withdraw all available funds
const result = await client.vault.withdraw();
console.log(`Withdrew: ${result.amount_withdrawn}`);
console.log(`TX: ${result.tx_signature}`);

// Withdraw a specific amount
const partial = await client.vault.withdraw({
  amount: 2_000_000,
});

// Custom polling and timeout
const result = await client.vault.withdraw({
  pollIntervalMs: 3000,   // check every 3s (default: 5s)
  maxWaitMs: 180_000,     // wait up to 3 minutes (default: 2 minutes)
  rpcUrl: 'https://api.mainnet-beta.solana.com',
});
```

## Receipt Verification

Every proxy call returns a signed receipt in the `x-receipt` response header. Receipts are ed25519-signed by the platform and contain the request ID, buyer, seller, amount, and timestamp.

### Extracting receipts

```ts
const res = await client.proxy('listing-uuid', '/v1/chat/completions', body);
const receiptHeader = res.headers.get('x-receipt');

if (receiptHeader) {
  const receipt = JSON.parse(receiptHeader);
  // receipt: { request_id, buyer, seller, amount, timestamp, signature }
}
```

### Verifying receipts

Receipt verification uses `tweetnacl` only (no Solana dependencies needed). The signature is verified against the platform's public key over a canonicalized JSON payload (keys sorted alphabetically).

```ts
const results = client.vault.verifyReceipts([receipt1, receipt2]);

for (const result of results) {
  if (result.valid) {
    console.log(`Receipt ${result.receipt.request_id}: VALID`);
  } else {
    console.log(`Receipt ${result.receipt.request_id}: INVALID - ${result.reason}`);
  }
}
```

## Error Handling

All gateway errors are thrown as `ProxyGateError` instances with structured fields:

```ts
import { ProxyGateClient, ProxyGateError } from '@proxygate/sdk';

try {
  const balance = await client.balance();
} catch (err) {
  if (err instanceof ProxyGateError) {
    console.error(`Code:    ${err.code}`);        // e.g. "insufficient_credits"
    console.error(`Message: ${err.message}`);      // Human-readable description
    console.error(`Status:  ${err.statusCode}`);   // HTTP status code
    console.error(`Action:  ${err.action}`);       // Suggested remediation
    console.error(`Docs:    ${err.docs}`);         // Link to relevant docs
    console.error(`Trace:   ${err.traceId}`);      // Request trace ID for support
  }
}
```

## TypeScript

All types are exported from the package entry point:

```ts
import type {
  // Client options
  ProxyGateClientOptions,
  CreateClientOptions,
  ProxyOptions,

  // Auth
  SignRequestOptions,
  AuthHeaders,

  // Discovery
  PricingResponse,
  PricingService,
  PricingListing,
  ApisResponse,
  ApiListingDetail,
  ServicesResponse,
  ServiceStats,
  CategoriesResponse,
  CategoryEntry,
  CategorySubcategory,
  SellerProfileResponse,

  // Authenticated endpoints
  BalanceResponse,
  UsageResponse,
  UsageEntry,
  UsageSummary,
  RateResponse,
  SettlementsResponse,
  SettlementDaily,
  SettlementSummary,
  SettlementPayout,

  // Query options
  PricingQueryOptions,
  UsageQueryOptions,
  ApisQueryOptions,
  SettlementsQueryOptions,
  RateOptions,
  WithdrawOptions,

  // Vault
  VaultBalanceResponse,
  VaultDepositResponse,
  VaultDepositOptions,
  VaultWithdrawResponse,
  VaultWithdrawOptions,
  VaultWithdrawCompleteResponse,
  VaultWithdrawGatewayResponse,
  VaultReceipt,
  ReceiptVerificationResult,

  // Streaming
  SSEEvent,

  // Errors
  GatewayError,
} from '@proxygate/sdk';
```
