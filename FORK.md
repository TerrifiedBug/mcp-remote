# Fork notes — `@terrifiedbug/mcp-remote`

Fork of [`@abluva/mcp-remote`](https://github.com/abluva-research/mcp-remote) (itself a
maintained fork of [`geelen/mcp-remote`](https://github.com/geelen/mcp-remote)), carrying
**one patch**: an RFC 8707 resource-indicator override so MCP servers behind **Microsoft
Entra ID** can be reached.

## Why the patch exists

Connecting to an MCP server whose authorization server is Entra ID (here: an AWS Bedrock
AgentCore Runtime with a custom JWT authorizer) fails at the token exchange with:

```
AADSTS9010010: The resource parameter provided in the request doesn't match with the requested scopes.
```

The MCP spec has the client send an RFC 8707 `resource` indicator naming the MCP server,
so the SDK derives it from the server URL. Entra requires the resource indicator to
identify the application owning the requested scopes (`api://<client-id>/mcp.access`), and
an Entra app can only claim `api://` URIs or URLs on a verified domain — it can never
claim `amazonaws.com`. The two requirements cannot both be satisfied, so the client must
be able to override what it sends.

Upstream already has a `--resource` flag, but it only rewrites the **authorization** URL
(`redirectToAuthorization`). The **token** request builds its resource independently via
the SDK's `selectResourceURL()`, which consults the provider's optional
`validateResourceURL()` hook — unimplemented upstream. So authorization succeeded and the
token exchange still failed.

## The patches

Both live in `src/lib/node-oauth-client-provider.ts`.

### 1. Honour `--resource` in token requests (RFC 8707)

Implement `validateResourceURL()` on `NodeOAuthClientProvider`: return the `--resource`
value when given, otherwise preserve stock behaviour (validate the configured resource with
`checkResourceAllowed`, return `undefined` when there is none). Tests in
`node-oauth-client-provider.test.ts`.

With `--resource api://<client-id>`, the authorization request, token exchange, and
refresh all carry the same resource indicator, and Entra issues the token.

### 2. Don't blank an expired access token in `tokens()`

Stock behaviour returns `{ ...tokens, access_token: '' }` when the cached token is expired
but a refresh token exists, as a "needs refresh" signal. That only works for callers that
omit the header when the token is empty — `utils.ts`, `protocol-detector.ts` and
`stateless-http-transport.ts` all guard with `tokens?.access_token ? … : {}`. The SDK's
`StreamableHTTPClientTransport` does not: it sets `Bearer ${access_token}`
unconditionally, so an empty token goes out as a credential-less `Bearer`.

AgentCore rejects that with **403** `OAuth authorization failed: Failed to parse token`
(AWS can't parse it as a bearer scheme, so it falls through to SigV4 and complains about a
missing `Credential`/`Signature`/`SignedHeaders` — a misleading error that looks like an
IAM misconfiguration). The SDK only re-authorizes on **401**, so the 403 surfaced as
`Fatal error` and the proxy exited.

Returning the stale token unchanged earns a **401** `Token has expired`, which drives the
SDK's normal `refresh_token` flow. The bug only bites once the first cached token ages out
— a fresh interactive auth masks it entirely.

## Verified

2026-08-10 against a Bedrock AgentCore Runtime (eu-central-1) with Entra inbound auth:
authorize → consent → token exchange → `Proxy established successfully` → `tools/list`
returned the server's tools. `npm run test:unit`: 118 passing. `tsc` error count unchanged
from the unpatched baseline (12 pre-existing, none in the patched file).

2026-08-11, patch 2, same runtime with an expired cached token: silent refresh (no consent
tab), `initialize` → `opensearch-mcp-server 1.29.0`, `tools/list` returned 8 tools, and
`tokens.json` was rewritten with a new access token and the refresh token retained.
`npm run test:unit`: 118 passing.

## Client configuration

```json
{
  "mcpServers": {
    "opensearch": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "git+https://github.com/TerrifiedBug/mcp-remote.git#v2.0.0-entra.2",
        "mcp-remote",
        "<mcp-server-url>",
        "--static-oauth-client-info",
        "{\"client_id\": \"<entra-app-client-id>\"}",
        "--static-oauth-client-metadata",
        "{\"scope\": \"api://<entra-app-client-id>/mcp.access openid profile offline_access\"}",
        "--resource",
        "api://<entra-app-client-id>"
      ]
    }
  }
}
```

`-p … mcp-remote` is required because the package ships two bins (`mcp-remote` and
`mcp-remote-client`), so npx cannot infer which to run from a git URL.

The client ID is a public PKCE client — no secret is involved, so this block is safe to
share. First run opens a browser consent tab; approve it (an unapproved tab looks like a
hang). Tokens cache under `~/.mcp-auth`.

**`dist/` is committed on purpose.** npm only builds a git dependency by running its
`prepare` script, and `ignore-scripts=true` — standard supply-chain hardening, and set on
our machines — suppresses exactly that. A prebuilt `dist/` is therefore what makes
`npx git+https://…` work for everyone regardless of local npm policy, and it means the
install runs no scripts at all.

Consequence for maintainers: **rebuild and commit `dist/` in the same commit as any source
change**, then re-tag. `npm run build` (tsup) is the whole step.

## Upstream

This patch is not specific to one organisation — anyone using Entra ID with `api://`
scopes hits it. The `entra-resource-fix` branch holds the source-only change (no `dist/`)
ready to offer to [`abluva-research/mcp-remote`](https://github.com/abluva-research/mcp-remote);
if merged, drop this fork and pin their release instead.

Related upstream work, none of which currently solves this (checked 2026-08-10):

- [geelen/mcp-remote#218](https://github.com/geelen/mcp-remote/pull/218) — allows
  *disabling* the resource parameter rather than overriding it; open since 2026-01 on a
  repo dormant since 2026-02.
- [anthropics/claude-code#73460](https://github.com/anthropics/claude-code/issues/73460) —
  asks for a `resource` override in the native `.mcp.json` `oauth` block. If shipped, no
  bridge is needed at all for Claude Code.
- [modelcontextprotocol/csharp-sdk#1587](https://github.com/modelcontextprotocol/csharp-sdk/issues/1587)
  — the same AADSTS9010010 collision in another SDK, i.e. this is a spec-vs-Entra
  mismatch, not a client bug.

## Maintenance

Rebase on Abluva `main` for their fixes (mid-session re-auth, proactive refresh, callback
port handling). The patch is one self-contained method plus one import, so conflicts
should be rare. Re-tag and bump `x.y.z-entra.N` per release.
