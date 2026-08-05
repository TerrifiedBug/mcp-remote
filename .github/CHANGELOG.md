# Changelog

All notable changes to `@abluva/mcp-remote` will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
For full upstream issue/PR mapping and detailed rationale behind each fix, see [ABLUVA-FORK.md](./ABLUVA-FORK.md).

## [Unreleased]

## [0.1.42]
### Added
- Stronger auto-port selection and stale registration invalidation
- Always-on callback server (dedicated startup server, `force: true` in proxy mode)
- `setCallbackPort()` to keep `redirect_uri` synced with the bound listener

## [0.1.41]
### Fixed
- Server send errors swallowed, causing Claude to hang (upstream #293, via #297)
- No `expires_at` tracking causing silent token expiry and broken re-auth (upstream #273, via #290)
- Token exchange POSTed to the wrong endpoint in proxy mode (upstream #270, via #302)

### Added
- Regression tests for proxy-mode `finishAuth`

## [0.1.40]
### Added
- Auto OAuth callback port selection per MCP server URL
- Bind retry on `EADDRINUSE`, reducing need for explicit ports in Claude config (upstream #253, #306)

## [0.1.39]
### Added
- Initial Abluva release, published as `@abluva/mcp-remote`
- Mid-session OAuth re-authentication (`onSendError` handling for `UnauthorizedError`, stale refresh, `InvalidRequestError`), based on jacopoc's branch for upstream PR #213
- Eager callback server — starts before remote connect, stays up for process lifetime
- Forced re-auth coordination — reuse live listener when possible, skip lockfile delegation

### Fixed
- Re-issuing OAuth tokens failing on refresh + new grant (upstream #181)
- Mid-session `tools/call` 401s failing silently — OAuth previously ran only on `initialize` (upstream #286)
- Runtime re-auth opening the browser but callback server never starting (upstream #248)
- Duplicate processes killing the callback server (upstream #245)
- Re-auth loop where the code hit localhost but `/token` was never called (upstream #256)
- Revoked tokens causing infinite auth loops (upstream #91)
