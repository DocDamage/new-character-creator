# Local Bridge Threat Model

## Protected Assets

- Provider API keys
- Local filesystem paths
- Source asset packs
- Generated exports
- APES, Aseprite, PixelLab, and local LLM outputs

## Required Controls

- Loopback Host checks
- Same-origin checks where browser metadata is available
- Local session token for POST actions
- JSON body size limits
- Project-relative path allowlists
- Redacted audit logs
- Explicit user approval for AI-proposed tool actions
- Natural-language approval shortcuts such as `approve`, `yes`, `run it`, and
  `do it` may execute only an already-visible pending approval card. They must
  never invent or run a privileged bridge action by themselves.

## Current Bridge Surfaces

- `/__local/apes-tools`: APES preflight, job execution, QA harness, summaries, and prep actions.
- `/__local/asset-tools`: repair, reindex, Duelyst audit, LPC inventory, and LPC catalog actions.
- `/__local/ai/proxy`: validated provider proxy requests.
- `/__local/bridge/aseprite`: guarded Aseprite bridge checks/actions.
- `/__local/bridge/pixellab`: guarded PixelLab endpoint checks/actions.
- `/__local/audit`: local audit status surface.

## Verification

```powershell
npm run test:preview-tools
node --test tests/tools/local-proxy.test.mjs tests/tools/aseprite-bridge.test.mjs tests/tools/pixellab-bridge.test.mjs tests/tools/tool-audit-log.test.mjs
node --test tests/tools/ai-agent.test.mjs
npm run production:check
```
