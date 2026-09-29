# Alien bot asset kit v1

Local visual assets prepared as source material for a future bot model. These files are not wired into `makeBotMesh` yet.

## Files

- `alien-bot-fullbody-reference-v1.png` — front/back character turnaround and material reference.
- `alien-skin-albedo-v1.webp` — teal alien skin color texture; intended as a reusable albedo tile.
- `space-armor-albedo-v1.webp` — graphite armor and flexible suit color texture; intended as a reusable albedo tile.
- `cyan-emissive-v1.webp` — dark-backed cyan circuit texture, suitable as a starting emissive map.
- `space-boot-v1.webp` — existing space boot texture.
- `cara-1.jpg` through `cara-4.jpg` — existing bot face textures.

## Notes for implementation

- This repository builds bots from procedural Three.js geometry; there is no UV-mapped character model in this package.
- The two albedo images and emissive image are generated texture sources, not a complete calibrated PBR set. No normal, roughness, metallic, or AO maps are included.
- Check edge continuity before using the albedo images as repeated tiles. Assign each surface to suitable geometry/UVs and adjust scale and color per bot kit.
- To keep the existing bot appearance unchanged, integrate these materials in a separate follow-up change and verify the build and in-game render.
