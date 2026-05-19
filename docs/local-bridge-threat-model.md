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
