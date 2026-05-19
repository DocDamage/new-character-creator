# Production Security Model

## Static App Boundary

The GitHub Pages app is static. It can render assets, read public manifests, build exports, and prepare AI/tool handoffs. It cannot make provider calls with hidden secrets because browser-held secrets are inspectable by the user agent.

## Secret Rule

Provider API keys are either:

- held only in volatile page memory for a current manual session, or
- stored outside the app in a trusted local proxy, backend, MCP server, or provider vault.

Keys must never be written to localStorage, sessionStorage, IndexedDB, exported packages, generated manifests, logs, screenshots, release bundles, or git.

## Tool Rule

Privileged actions require explicit user approval and must run through loopback-only local bridges with path allowlists and redacted audit logs.

## Release Gate

Production readiness is verified with:

```powershell
npm run production:check
```

That command includes source hygiene, secret scanning, license audit generation, RAG evaluation, tool tests, release build validation, preview local-tool smoke, and browser regression.

Security-specific checks:

```powershell
npm run security:scan
npm run license:audit
npm run rag:evaluate
```
