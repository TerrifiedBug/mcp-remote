# Contributing to mcp-remote (Abluva fork)

Thanks for your interest in contributing! This is an Abluva-maintained fork of
[geelen/mcp-remote](https://github.com/geelen/mcp-remote). Please read this before opening a PR.

## Before you start

- Check [open issues](https://github.com/abluva/mcp-remote/issues) and
  [open PRs](https://github.com/abluva/mcp-remote/pulls) to avoid duplicate work.
- For upstream bugs, check whether they're already tracked in
  [ABLUVA-FORK.md](./ABLUVA-FORK.md) before filing a new issue here.
- For larger changes, open an issue first to discuss the approach.

## Development setup

```bash
git clone https://github.com/abluva-research/mcp-remote.git
cd mcp-remote
npm install
npm run build
```

Run tests:

```bash
npm test
```

Run against a live server (debug mode):

```bash
node dist/proxy.js https://your-gateway.example/mcp-connect/<id> --debug
```

## Code style

- Formatted with Prettier (`.prettierrc` in repo root) — run `npx prettier --write .` before committing.
- TypeScript strict mode; keep types accurate, avoid `any` where possible.

## Commit messages

- Use clear, descriptive commit messages (imperative mood, e.g. "Fix token refresh race condition").
- Reference related issues/PRs where relevant (e.g. `Fixes #123`, `Relates to geelen/mcp-remote#297`).

## Submitting a pull request

1. Fork the repo and create your branch from `main`.
2. Make your changes, with tests where applicable.
3. Ensure `npm run build` and `npm test` pass locally.
4. Fill out the PR template completely (see below).
5. Open the PR against `main`.

## Reporting bugs

Please include:
- `@abluva/mcp-remote` version
- Node version
- MCP client (Claude Desktop, Cursor, Windsurf, etc.) and version
- Steps to reproduce
- Relevant logs (use `--debug` flag; see README Troubleshooting section)

## Code of Conduct

This project follows the [Code of Conduct]([./CODE_OF_CONDUCT.md](https://github.com/abluva/mcp-remote/blob/main/.github/CODE_OF_CONDUCT.md)). By participating, you agree to uphold it.
