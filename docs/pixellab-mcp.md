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

Do not commit real PixelLab API tokens. Add the server through the local Codex/assistant MCP configuration so generated assets can be imported into the app as reviewed parts or rendered animation frames.

## Suggested missing-animation workflow

1. Try the app's Motion source selector to borrow a compatible local LPC action, such as `slash`, `thrust`, or `shoot`.
2. Export the rendered borrowed-motion frames as a deterministic reference.
3. If the borrowed base does not preserve the character identity well enough, send the static character/reference frame plus the borrowed-motion frame sequence to PixelLab.
4. Use PixelLab for animation generation or animation-to-animation cleanup.
5. Import the returned PNG frames/spritesheet through the Part Library or layer bundle route, then review alignment before packaging.

## Relevant PixelLab capabilities

- MCP/Vibe Coding tools: character creation, `animate_character`, tilesets, and isometric tiles.
- Browser/API workflows: 4/8 directional animated characters, sprite-sheet export, text animation, skeleton animation, animation-to-animation, inpainting, and rotation.

References:

- https://github.com/pixellab-code/pixellab-mcp
- https://www.pixellab.ai/docs/ways-to-use-pixellab
