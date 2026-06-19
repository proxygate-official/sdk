# @proxygate/sdk

## 0.14.1

### Patch Changes

- Document that priced-variant forced params are per-endpoint and do not cascade. SDK `EndpointSpec` `query_overrides`/`body_overrides` type comments now note that overrides apply only to their own endpoint (never to or from same-upstream variants), and the pg-sell skill gains a "Priced variants" section.

## 0.14.0

### Minor Changes

- 84d2c1b: feat(sdk,cli): surface the priced-variant `label` on EndpointSpec and in `proxygate apis`. The seller-internal `upstream_path` alias is intentionally kept out of buyer-facing SDK types.

### Patch Changes

- 5f9a95d: chore(deps): bump all dependencies to latest (graphql 16->17, TypeScript 5->6, eslint 10, next 16.2.9), adapt graphql-parser to graphql-js v17 default-value API, and pin transitive security advisories (ws, postcss, js-yaml) in both override sets.

## 0.13.0

### Minor Changes

- 4d1961c: BEHAVIOR: default RPC is now mainnet-beta. `DEFAULT_RPC_URL` changed from `https://api.devnet.solana.com` to `https://api.mainnet-beta.solana.com`, and `vault.deposit()`, `vault.withdraw()`, and the gasless `vault.topupX402()` send paths now all resolve their RPC from this constant. The escrow program id and USDC mint were already mainnet, so the devnet default was a mismatch. Pass `rpcUrl` explicitly to target devnet or testnet.
- e737c8d: Surface spend-limit blocks distinctly. Adds `SpendLimitError` (a `ProxygateError` subclass carrying `reason: 'daily' | 'per_tx'`) thrown by endpoint methods on an HTTP 429 spend-limit response, plus `spendLimitErrorFromResponse(response)` to classify the raw `Response` returned by `client.proxy()`, an `isSpendLimitError` guard, the `SPEND_LIMIT_ERROR_CODES` constant, and the `SpendLimitReason` type. The `daily_spend_limit_exceeded` and `per_tx_spend_limit_exceeded` gateway codes are added to `GatewayErrorCode`. Additive only.
- e737c8d: Read and change wallet spend limits. Adds `client.getSpendLimits()` and `client.setSpendLimits({ daily_limit_micro_usdc, per_tx_limit_micro_usdc })` against `GET`/`POST /v1/wallet/limits` (bearer auth, `wallet:limits` scope; a `null` field clears that limit), plus the `WalletLimits` type. A missing-scope 403 is rethrown as a clear `ProxygateError` naming the `wallet:limits` scope. Additive only.
- 4d1961c: `vault.topupX402()`: top up the prepaid balance via the x402 rail. Preflights the 402 challenge (fails fast before funds move when the rail is disabled), then either follows the GASLESS path — the server-provided, platform-fee-paid depositTransaction is whitelist-validated instruction by instruction (fee payer, fee ceiling vs extra.feeMicroUsdc, exact deposit amount, buyer accounts) before the buyer co-signs, so buyers never need SOL — or builds and sends the escrow deposit locally (init_if_needed creates the vault PDA on a first-ever top-up). Confirms at POST /v1/x402/topup/confirm. ProxygateError now carries the parsed error body on `raw`.

### Patch Changes

- d3cd7e5: `ApiListingDetail`: model 8 optional `/v1/apis` fields that the gateway already returns but the SDK type omitted, so consumers can read them type-safely. Buyer-facing pricing (`buyer_price_per_request_usdc`, `buyer_price_per_input_token_usdc`, `buyer_price_per_output_token_usdc`, `platform_fee_pct`) plus seller/listing branding (`seller_organization`, `seller_avatar_url`, `provider_logo_url`, `is_partner`). Nullability mirrors the `@proxygate/api-types` CatalogListing schema; all optional for backward compat with older gateways. Additive, no behavior change.

## 0.12.0

### Minor Changes

- 8a37129: Full-gateway typed OpenAPI surface (additive; no runtime URL or auth change).

  api-types: add response and contract schemas as the single source for the
  previously untyped routes: listing responses (list/detail/create/update/pause/
  unpause/delete/rotate-key/docs/test), profile responses (me, seller profile by
  wallet and by handle, username), challenge apply, bridge track and pending, the
  shared DEV-02 error envelope (`ErrorResponseSchema`), and the health, proxy, and
  tunnel doc contracts. All plain zod, exported from the package barrel.

  sdk: regenerate the gateway types from the now-complete OpenAPI document. Every
  `/v1` endpoint plus the root-level `/proxy/{service}/{path}`, `/tunnel/connect`,
  and `/health` is typed, and every error body uses the shared envelope. Purely
  additive: existing exports, request shapes, URLs, and auth are unchanged.

- 0bfc21c: Support GraphQL schemas as listing documentation (discovery + display).

  Sellers can now upload a GraphQL schema as a third `doc_type` alongside `openapi`
  and `markdown`. Because GraphQL is self-describing, the counterpart to an OpenAPI
  spec is the schema itself: either SDL (`.graphql`/`.gql`) or the JSON result of an
  introspection query (`{ __schema }` or `{ data: { __schema } }`). A new internal
  package `@proxygate/graphql-parser` normalizes both inputs into the query'able
  operations (Query/Mutation/Subscription root fields with their arguments, return
  types, and deprecation), stored in `listing_docs.parsed_endpoints`.

  Additive across the published contracts:

  - **api-types**: `doc_type` enum widened to `['openapi', 'markdown', 'graphql']`
    in the docs-upload request, docs-upload response, and `ListingDocsResponse`.
  - **sdk**: `UploadDocsOptions`, `UploadDocsResponse`, and `ListingDocsResponse`
    accept the `graphql` doc type; `parsed_endpoints` carries GraphQL operations for
    GraphQL docs.
  - **cli**: `listings upload-docs` / `listings create --docs` auto-detect
    `.graphql`/`.gql` (or `--type graphql` for an introspection `.json`),
    `listings docs <id>` renders a GraphQL operations table (Type / Operation /
    Args / Returns), and `proxygate proxy <listing> /graphql ...` warns (stderr)
    when a GraphQL call returns `{errors}` at HTTP 200 (the call is still billed,
    same as REST).
  - **api-types**: new `GRAPHQL_PROXY_PATH` constant (`'/graphql'`), single-sourcing
    the one HTTP path a GraphQL listing exposes across gateway, cli, and web.

  GraphQL listings are callable end-to-end: on upload the gateway synthesizes a
  single `{ method: 'POST', path: '/graphql' }` endpoint (so the listing surfaces
  in `/v1/apis`, the 404-hint, and MCP), adds `/graphql` to `allowed_paths`, and
  validates it with a GraphQL-aware probe (a `{ __typename }` query whose response
  body must carry `data`, not just HTTP 200). Pricing is flat per-request. Web
  upload UI and marketplace operations viewer support the `graphql` doc type.

  Token-efficient docs drill-down (REST and GraphQL). `listings docs <id>` now
  prints a compact, filterable index (`--search`, `--limit`); agents drill into a
  single unit on demand instead of dumping the whole spec into context:

  - **GraphQL**: `--operation <name>` (signature + return-type fields, one level)
    and `--type <Name>` (any type's fields, one level).
  - **REST**: `--endpoint "POST /path"` (params + request/response body with
    `$ref`s resolved one level).
  - `--raw` emits the full schema (GraphQL normalised to compact SDL, far smaller
    than introspection JSON) and `-o <file>` writes it to disk so it never floods
    the agent's context. On a large schema (~56 ops) the index is ~1k tokens and a
    single-unit detail ~1k tokens, versus ~108k tokens for raw introspection JSON.

  Per-operation pricing and live introspection-over-the-wire are deferred,
  feature-flagged follow-ups.
