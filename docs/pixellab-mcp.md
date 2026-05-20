# PixelLab MCP animation bridge

PixelLab can be used as the AI fallback for sprites that cannot borrow an animation from an existing local base. The local app should prefer deterministic LPC motion sources first, then use PixelLab for missing poses or style-transfer cleanup.

## MCP setup

PixelLab publishes an MCP server at `https://api.pixellab.ai/mcp`. Keep the bearer token outside this repository. For Codex-style MCP config, use a local environment value:

```toml
[mcp_servers.pixellab]
command = "npx"
args = [
  "mcp-remote@latest",
  "https://api.pixellab.ai/mcp",
  "--transport",
  "http-only",
  "--header",
  "Authorization:${AUTH_HEADER}"
]

[mcp_servers.pixellab.env]
AUTH_HEADER = "Bearer <PIXELLAB_API_TOKEN>"
```

Do not paste the real token into tracked files, generated docs, browser storage, or release bundles. If a real token is exposed in chat, rotate it from the PixelLab account before relying on it again.

Other MCP clients may use equivalent JSON configuration:

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
- direct generation calls go through `/__local/bridge/pixellab`, which forwards to the configured loopback PixelLab service at `/generate` and returns normalized `frames` and/or `spritesheet` image URLs/data URLs

## In-App Setup

1. Open `Settings`.
2. Click `Use PixelLab defaults` to enable the loopback endpoint, MCP URL, and default sprite-animation model.
3. Run a trusted local PixelLab service on the configured loopback endpoint. The app calls `POST /generate` with `prompt`, `model`, `animation`, `directions`, `layers`, and `mcp_server_url`.
4. Put PixelLab authorization only in the local server environment, for example `PIXELLAB_AUTH_HEADER="Bearer <PIXELLAB_API_TOKEN>"` or `PIXELLAB_API_TOKEN="<PIXELLAB_API_TOKEN>"`. Do not enter this token into browser settings.
5. Change the loopback endpoint or model if your PixelLab bridge uses a different local port.
6. Click `Check PixelLab bridge` from a dev/local-tools session.
7. Return to AI Studio and ask for PixelLab generation. After you approve the proposed tool card, AI Studio queues a review-gated generation job, submits the prompt through the local bridge, and attaches returned frames or spritesheets to the APES Lab review queue.

Natural phrasing is supported. You can say `make art in PixelLab`, `use PixelLab on this character`, `write a PixelLab prompt`, `fill the missing frames`, `draw a cloak variation`, or `make a slide animation for north, east, south, and west`. In a static GitHub Pages session, AI Studio can prepare prompts and handoff JSON but cannot call the PixelLab bridge directly. Direct bridge checks and generation calls require a dev/local-tools session served through `node tools/local-vite-server.js ...`.

Expected bridge response shapes are intentionally flexible. The app accepts top-level or nested `frames`, `images`, `image_urls`, `image`, `spritesheet`, `spritesheet_url`, `output`, `result`, or `data` values when they contain image URLs, blob URLs, or image data URLs. Returned outputs remain blocked until a human reviews them.

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
