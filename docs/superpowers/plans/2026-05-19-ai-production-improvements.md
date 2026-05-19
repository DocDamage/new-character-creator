# AI Production Improvements Plan

## Goal

Turn AI Studio from a deterministic coordinator into a provider-backed, review-safe sprite production assistant.

## Scope

1. Add real local provider forwarding through `/__local/ai/proxy`.
2. Keep browser secrets session-only, sending them only to the local proxy for a single request.
3. Replace brittle keyword checks with a structured AI intent summary.
4. Add richer generation handoff payload metadata for frame targets and quality constraints.
5. Validate imported generation outputs before review can proceed.
6. Cover the changes with focused tool tests plus the existing browser AI smoke test.

## Implementation Tasks

1. Provider proxy
   - Extend local proxy request normalization with optional API key, temperature, and max token controls.
   - Forward OpenAI-compatible, Ollama, Anthropic, Gemini, and PixelLab-style requests.
   - Normalize provider responses into `{ ok, provider, model, content }`.
   - Keep audit records redacted.

2. AI Studio provider calls
   - Add a client helper that builds provider messages from the deterministic plan, RAG context, current character, and recipe.
   - Call the local proxy when a provider is armed and local tools are available.
   - Fall back to deterministic replies if the proxy is unavailable or the provider fails.

3. Structured intent
   - Extract request intent into a typed summary: target action, provider hint, output format, layers, animations, and review sensitivity.
   - Use the intent for tool proposals and response context.

4. Generation handoff quality
   - Add input artifact metadata to generation jobs: affected frames, frame count, target layer, body type, constraints, and validation checks.
   - Include those constraints in prompts.

5. Output validation
   - Add validation for imported generated outputs: URI present, supported image extension/data URL, target output exists, and review remains blocked.
   - Record validation findings on the job log.

6. Verification
   - Run lint, build, relevant tool tests, and browser AI regression.
