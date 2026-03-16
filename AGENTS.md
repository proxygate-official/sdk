# AGENTS.md — ProxyGate SDK for AI Agents

> Machine-readable instructions for coding agents integrating the ProxyGate SDK.
> Works with Claude Code, Codex CLI, Gemini CLI, Cursor, and any agent that reads AGENTS.md.

---

## What is ProxyGate?

ProxyGate is a marketplace where sellers list unused API capacity and AI agents purchase access through a transparent proxy. Keys never leave the server. Agents pay with USDC on Solana.

## Install

```bash
npm install @proxygate/sdk
```

---

## Quick Start

```typescript
import { ProxyGateClient } from '@proxygate/sdk';

const client = await ProxyGateClient.create({
  gatewayUrl: 'https://gateway.proxygate.ai',
  keypairPath: '~/.proxygate/keypair.json',
});

// Browse APIs
const apis = await client.apis();

// Proxy a request
const response = await client.proxy('listing-id', '/v1/chat/completions', {
  method: 'POST',
  body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }] },
});

// Stream a response
const stream = await client.proxy('listing-id', '/v1/chat/completions', {
  method: 'POST',
  body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }], stream: true },
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

---

## Client Methods

### Discovery

```typescript
client.apis(opts?)          // Browse API catalog
client.services()           // List service categories
client.categories()         // List all categories
client.api(listingId)       // Get single listing detail
client.docs(listingId)      // Get listing API docs
client.sellerProfile(wallet) // Get seller profile
```

### Payments

```typescript
client.vault.balance()              // Check USDC balance
client.vault.deposit({ amount })    // Deposit USDC on Solana
client.vault.withdraw({ amount })   // Withdraw USDC
```

### Proxy

```typescript
// Standard request
client.proxy(listingId, path, { method, body?, headers?, json? })

// Streaming
client.proxy(listingId, path, { method, body, stream: true })
```

### Analytics

```typescript
client.usage(opts?)         // Usage history
client.settlements(opts?)   // Settlement history
client.rate(opts)           // Rate a seller
```

### Listings (Seller)

```typescript
client.listings.create(opts)        // Create listing
client.listings.list()              // List my listings
client.listings.update(id, opts)    // Update listing
client.listings.delete(id)          // Delete listing
client.listings.pause(id)           // Pause listing
client.listings.unpause(id)         // Unpause listing
client.listings.uploadDocs(id, content) // Upload API docs
```

### Tunnel (Seller)

```typescript
import { TunnelClient } from '@proxygate/sdk';

const tunnel = new TunnelClient({
  gatewayUrl: 'https://gateway.proxygate.ai',
  keypairPath: '~/.proxygate/keypair.json',
  listingId: 'uuid',
  localPort: 8080,
});

tunnel.connect();
await tunnel.drain(); // Zero-downtime restart
```

---

## Auth Model

ProxyGate uses Solana wallet keypairs for authentication. Every request is signed with ed25519.

```
1. Client requests nonce:   GET /v1/nonce?wallet={pubkey}
2. Client signs nonce:      ed25519(nonce, keypair)
3. Client sends headers:    X-Wallet, X-Nonce, X-Signature
4. Gateway verifies + proxies request
```

The SDK handles this automatically via `ProxyGateClient.create()`.

For manual signing:

```typescript
import { signRequest } from '@proxygate/sdk';

const headers = await signRequest({
  gatewayUrl: 'https://gateway.proxygate.ai',
  keypairPath: '~/.proxygate/keypair.json',
});
// headers: { 'X-Wallet', 'X-Nonce', 'X-Signature' }
```

---

## Error Handling

```typescript
import { ProxyGateError } from '@proxygate/sdk';

try {
  await client.proxy('listing-id', '/path');
} catch (err) {
  if (err instanceof ProxyGateError) {
    console.error(err.code);       // 'insufficient_credits'
    console.error(err.message);    // 'Not enough USDC'
    console.error(err.action);     // 'Deposit more USDC'
    console.error(err.statusCode); // 402
  }
}
```

**Common error codes:**

| Code | HTTP | Meaning |
|------|------|---------|
| `insufficient_credits` | 402 | Not enough USDC |
| `rate_limit_exceeded` | 429 | Too many requests |
| `service_unavailable` | 503 | Upstream API down |
| `listing_not_found` | 404 | Invalid listing ID |
| `wallet_auth_failed` | 401 | Bad signature |

---

## Types

Key types exported from `@proxygate/sdk`:

```typescript
import type {
  ProxyGateClient,
  ProxyGateError,
  VaultBalanceResponse,
  ApisResponse,
  ApiListingDetail,
  SettlementsResponse,
  UsageResponse,
  TunnelClient,
} from '@proxygate/sdk';
```

---

## Gateway API (Direct)

Base URL: `https://gateway.proxygate.ai`

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | Health check |
| `GET /v1/nonce?wallet={pubkey}` | None | Get auth nonce |
| `GET /v1/apis` | None | Browse API catalog |
| `GET /v1/categories` | None | List categories |
| `GET /v1/balance` | Wallet | Check balance |
| `POST /v1/deposit/confirm` | Wallet | Confirm deposit |
| `POST /v1/withdraw` | Wallet | Initiate withdrawal |
| `GET /v1/usage` | Wallet | Usage history |
| `ALL /proxy/:service/*` | Wallet | Proxy API request |

---

## Metadata

```yaml
name: proxygate-sdk
type: api-marketplace-sdk
package: "@proxygate/sdk"
cli: "@proxygate/cli"
gateway: "https://gateway.proxygate.ai"
docs: "https://gateway.proxygate.ai/docs"
chain: solana
token: USDC
auth: ed25519-wallet-signature
```
