# Portrait look · skills — image-generation prompts

None. No image was generated for the portrait skill icons or effects, so there are no prompts and no raw sources in `.looks-art-sources/portrait/skills/`.

Every pixel comes from the generators in `tools/looks/portrait/skills/` (`python3 tools/looks/portrait/skills/build.py`):

- **Icons are 24 × 24.** At that size each pixel is a design decision (a horn of the Strat, the level line of the elixir, the facet of a star), and a painting downsampled to 24 px cannot keep them; hand-written character art and geometry rasterised at native resolution can.
- **The effects are geometry.** Beams, rings, facets, bubbles and reticles are exact shapes in stepped bands. Drawn at native resolution they come out symmetric, pixel-perfect (`raster.thin` removes the doubled pixels of a rasterised curve) and with a palette of a few colours, which is the look the portrait style asks for ("geometric, clean particles, restraint over noise").
- **Motion needs control per frame.** A flask that tips while its elixir stays level, a drone that prints itself line by line, a star whose facets keep their light while it spins: each frame is computed from the same shapes, so nothing wobbles between frames.
- **Determinism.** `build.py --check` and the unit tests rebuild everything and compare it byte for byte with the committed assets.

If a later pass wants generated concept art (for example to explore the drone's design), record the exact prompt here under a `## <source>.png` heading, in the format of `luna.md`, and keep the raw image in `.looks-art-sources/portrait/skills/`.
