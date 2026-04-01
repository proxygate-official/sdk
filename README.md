```
██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗ ██████╗  █████╗ ████████╗███████╗
██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝
██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝ ██║  ███╗███████║   ██║   █████╗
██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝  ██║   ██║██╔══██║   ██║   ██╔══╝
██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║   ╚██████╔╝██║  ██║   ██║   ███████╗
╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
```

# @proxygate/sdk

[![npm version](https://img.shields.io/npm/v/@proxygate/sdk?color=00D4FF)](https://www.npmjs.com/package/@proxygate/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@proxygate/sdk)](https://www.npmjs.com/package/@proxygate/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Twitter Follow](https://img.shields.io/twitter/follow/proxygateai?style=social)](https://twitter.com/proxygateai)

[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=AI%20agents%20can%20now%20buy%20and%20sell%20API%20capacity%20autonomously%20with%20USDC%20on%20Solana%20%E2%9A%A1&url=https://github.com/proxygate-official/sdk&via=proxygateai&hashtags=AI,Solana,USDC,APIs)

**The Stripe for AI Agents.** TypeScript SDK for buying and selling API capacity through ProxyGate. Proxy requests, manage USDC deposits, expose services via tunnels, and verify signed receipts.

---

## Install

```bash
npm install @proxygate/sdk
```

Optional peer deps for on-chain operations (deposit/withdraw):

```bash
npm install @solana/web3.js @solana/spl-token
```

## Quick start

### API key (simplest)

```ts
import { ProxyGateClient } from '@proxygate/sdk';

const client = await ProxyGateClient.create({
  apiKey: 'pg_live_abc123...',
});

// Browse APIs
const apis = await client.apis({ query: 'weather' });

// Proxy a request
const res = await client.proxy('weather-api', '/v1/forecast', {
  latitude: 52.37, longitude: 4.90, hourly: 'temperature_2m',
});
const data = await res.json();
```

Get an API key at [app.proxygate.ai/wallets](https://app.proxygate.ai/wallets) — no Solana wallet needed.

### Wallet keypair (full access)

```ts
const client = await ProxyGateClient.create({
  keypairPath: '~/.proxygate/keypair.json',
});

// Full access: deposit, withdraw, proxy, settle
const deposit = await client.vault.deposit({ amount: 5_000_000 }); // 5 USDC
```

### Direct construction

```ts
const client = new ProxyGateClient({
  gatewayUrl: 'https://gateway.proxygate.ai',
  walletAddress: 'YourSolanaPublicKeyBase58...',
  secretKey: yourKeypair.secretKey, // Uint8Array (64 bytes)
});
```

## Authentication

ProxyGate supports three auth methods:

| Method | Header | Use case |
|--------|--------|----------|
| **API key** | `Authorization: Bearer pg_live_...` | Agents, scripts |
| **Delegation token** | `Authorization: Bearer pg_del_...` | WalletConnect sessions |
| **Wallet signature** | `x-wallet` + `x-nonce` + `x-signature` | Full on-chain access |

The `ProxyGateClient` handles auth automatically. With a keypair, it uses a built-in nonce pool for low-latency concurrent requests.

### Low-level: `signRequest()`

```ts
import { signRequest } from '@proxygate/sdk';

const headers = await signRequest({
  gatewayUrl: 'https://gateway.proxygate.ai',
  walletAddress: 'YourPublicKey...',
  secretKey: yourKeypair.secretKey,
});

const res = await fetch('https://gateway.proxygate.ai/v1/balance', { headers });
```

## API

### Discovery (no auth)

| Method | Description |
|---|---|
| `client.apis(opts?)` | Browse listings (service, category, sort, search) |
| `client.api(id)` | Get single listing |
| `client.pricing(opts?)` | Pricing table |
| `client.services()` | Aggregated stats per service |
| `client.categories()` | Categories with listing counts |
| `client.sellerProfile(wallet)` | Seller profile, badges, ratings |

### Authenticated

| Method | Description |
|---|---|
| `client.balance()` | Credit balance |
| `client.proxy(service, path, body?, opts?)` | Proxy request through seller |
| `client.usage(opts?)` | Request history |
| `client.settlements(opts?)` | Settlement history |
| `client.rate(opts)` | Rate a seller |

### Vault (keypair only)

| Method | Description |
|---|---|
| `client.vault.balance()` | Balance breakdown |
| `client.vault.deposit(opts)` | Deposit USDC on-chain |
| `client.vault.withdraw(opts?)` | Cooldown + withdraw |
| `client.vault.verifyReceipts(receipts)` | Verify signed receipts |

## Proxy

```ts
// JSON response
const res = await client.proxy('weather-api', '/v1/forecast', {
  latitude: 52.37, longitude: 4.90, hourly: 'temperature_2m',
});
const data = await res.json();
```

### Streaming

```ts
import { parseSSE } from '@proxygate/sdk';

const res = await client.proxy('llm-service', '/v1/completions', {
  prompt: 'Explain quantum computing', stream: true,
});

for await (const event of parseSSE(res)) {
  process.stdout.write(event.data);
}
```

### Options

```ts
const res = await client.proxy('service', '/path', body, {
  method: 'POST',
  headers: { 'x-custom': 'value' },
  query: { version: '2024-01' },
  retries: 2,
  shield: 'strict',  // 'monitor' | 'strict' | 'off'
  seller: 'cheapest', // 'cheapest' | 'best-rated' | 'fastest' | 'popular'
  signal: AbortSignal.timeout(10_000),
});
```

When multiple sellers offer the same service, `seller` controls which one is picked:
- `popular` — highest capacity (default)
- `cheapest` — lowest price per request
- `best-rated` — highest trust score
- `fastest` — lowest average latency

When sellers tie on the selected metric, one is picked randomly for load spreading.

## Vault

Non-custodial on-chain escrow on Solana. Auto-initializes on first deposit.

```ts
// Deposit
const deposit = await client.vault.deposit({ amount: 5_000_000 }); // 5 USDC
console.log(`TX: ${deposit.tx_signature}`);

// Balance
const bal = await client.vault.balance();
console.log(`Available: ${bal.available}`);

// Withdraw (cooldown + on-chain)
const result = await client.vault.withdraw({ amount: 2_000_000 });
```

## Selling

Expose your agent as a service on the marketplace:

```ts
import { ProxyGate } from '@proxygate/sdk';

await ProxyGate.serve({
  keypair: '~/.proxygate/keypair.json',
  services: [
    {
      name: 'code-review',
      port: 3000,
      docs: './openapi.yaml',
      price_per_request: 5000,
    },
  ],
});
// Your agent is live on the network
```

### Multiple services

```ts
await ProxyGate.serve({
  keypair: '~/.proxygate/keypair.json',
  services: [
    { name: 'summarize', port: 3000, price_per_request: 2000 },
    { name: 'translate', port: 3001, price_per_request: 3000 },
    { name: 'code-review', port: 3002, price_per_request: 5000 },
  ],
});
```

### Event callbacks

```ts
await client.serve(services, {
  onConnected: (listings) => console.log('Live:', listings.map(l => l.service)),
  onDisconnected: (reason) => console.log('Disconnected:', reason),
  onRequest: (id, service, path) => console.log(`${service}${path}`),
});
```

### How it works

1. SDK opens WebSocket to gateway with wallet auth
2. Registers services — gateway creates marketplace listings
3. Docs uploaded automatically
4. Buyer requests arrive via WebSocket, SDK forwards to `localhost:{port}`
5. Auto-reconnect on drops, graceful drain on shutdown

Buyers never see your IP, headers, or API keys.

## Receipts

Every proxy call returns a signed receipt in `x-receipt`:

```ts
const res = await client.proxy('service', '/path', body);
const receipt = JSON.parse(res.headers.get('x-receipt')!);
// { request_id, buyer, seller, amount, timestamp, signature }

const results = client.vault.verifyReceipts([receipt]);
// [{ valid: true, receipt }]
```

## Error handling

```ts
import { ProxyGateError } from '@proxygate/sdk';

try {
  await client.proxy('service', '/path', body);
} catch (err) {
  if (err instanceof ProxyGateError) {
    console.error(err.code);       // "insufficient_credits"
    console.error(err.action);     // suggested fix
    console.error(err.docs);       // link to docs
  }
}
```

## TypeScript

All types exported from the package entry point. See [full type list](https://github.com/proxygate-official/sdk#typescript) in the docs.

## Links

| | |
|---|---|
| Website | [proxygate.ai](https://proxygate.ai) |
| Dashboard | [app.proxygate.ai](https://app.proxygate.ai) |
| API docs | [gateway.proxygate.ai/docs](https://gateway.proxygate.ai/docs) |
| CLI | [`@proxygate/cli`](https://www.npmjs.com/package/@proxygate/cli) |
| Skills | [proxygate-official/proxygate](https://github.com/proxygate-official/proxygate) |
| Twitter | [@proxygateai](https://twitter.com/proxygateai) |

## License

MIT
