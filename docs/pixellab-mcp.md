# PixelLab MCP animation bridge

PixelLab can be used as the AI fallback for sprites that cannot borrow an animation from an existing local base. The local app should prefer deterministic LPC motion sources first, then use PixelLab for missing poses or style-transfer cleanup.

## MCP setup

PixelLab publishes an MCP server at:

```json
{
  "mcpServers": {
    "pixellab": {
      "url": "https://api.pixellab.ai/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}
```

Do not commit real PixelLab API tokens. Add the server through the local Codex/assistant MCP configuration, a trusted local proxy, or another backend outside the public static app. Browser-entered secrets are session-only, redacted from saved provider config, and must never be written to storage, exports, logs, release bundles, or git.

The app-side PixelLab bridge is intentionally guarded:

- endpoint URLs must be loopback when called through local tools
- POST requests require the generated local tool token
- tool actions should be proposed in AI Studio and explicitly approved
- audit logs are redacted before writing JSONL records

## In-App Setup

1. Open `Settings`.
2. Click `Use PixelLab defaults` to enable the loopback endpoint and default sprite-animation model.
3. Change the endpoint or model if your PixelLab bridge uses a different local port.
4. Click `Check PixelLab bridge` from a dev/local-tools session.
5. Return to AI Studio and ask for a PixelLab missing-animation handoff. The assistant can propose the generation queue tool, but it does not run until you approve it.

## Suggested missing-animation workflow

1. Try the app's Motion source selector to borrow a compatible local LPC action, such as `slash`, `thrust`, or `shoot`.
2. Export the rendered borrowed-motion frames as a deterministic reference.
3. If the borrowed base does not preserve the character identity well enough, send the static character/reference frame plus the borrowed-motion frame sequence to PixelLab.
4. Use PixelLab for animation generation or animation-to-animation cleanup.
5. Import the returned PNG frames/spritesheet through the Part Library or layer bundle route, then review alignment before packaging.
6. Keep generated outputs release-blocked until review is approved.

## Relevant PixelLab capabilities

- MCP/Vibe Coding tools: character creation, `animate_character`, tilesets, and isometric tiles.
- Browser/API workflows: 4/8 directional animated characters, sprite-sheet export, text animation, skeleton animation, animation-to-animation, inpainting, and rotation.

## Verification

Relevant local checks:

```powershell
npm run rag:evaluate
node --test tests/tools/pixellab-bridge.test.mjs
npm run production:check
```

References:

- https://github.com/pixellab-code/pixellab-mcp
- https://www.pixellab.ai/docs/ways-to-use-pixellab
