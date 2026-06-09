# @proxygate/sdk

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
