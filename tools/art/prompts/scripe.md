# Scripe · Berlin — image-generation prompts

Exact prompts behind the generated sources in `recipes/scripe.json`.
Each was generated once with Codex CLI image generation (one image per call, 1536×1024):

```sh
codex exec --skip-git-repo-check -s workspace-write -C <scratch dir> [-i source.png] -- \
  "Use your image generation tool to generate ONE image: <PROMPT> Landscape 1536x1024. \
   Then copy the generated image file into the current working directory as <name>.png \
   and print its absolute path and pixel dimensions. Do not do anything else."
```

The source file name is the `## heading`; the recipe refers to it under `sources`.
Re-rolling a source is safe: crop and scale are expressed in source pixels, so check the crop rows in the recipe after a re-roll.

## scripe-sky.png — sky

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. A sky-only night backdrop for a Berlin side-scrolling stage: banded gradient from near-black indigo at the top through deep violet to a magenta-pink and warm orange city-light glow at the bottom, a pale full moon in the upper right, scattered twinkling pixel stars, long layered violet and purple pixel clouds lit pink from below. Absolutely no land, no buildings, no towers, only sky.
```

## scripe-far.png — far

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. A distant Berlin night skyline for a far parallax layer: the Fernsehturm TV tower clearly recognisable and tallest, slightly right of centre (thin concrete shaft, silver sphere with a red and white antenna, red beacon lights), around it a hazy silhouette of the Berliner Dom green dome, tall building blocks with a few lit yellow windows, two construction cranes. Muted deep violet and blue-grey colours with soft pink rim light, slightly desaturated and atmospheric. The skyline occupies the bottom 65% of the image and touches the bottom edge and both side edges; everything above it is isolated on a solid flat pure magenta #FF00FF background (no gradient, no shadow on the background, no magenta inside the art).
```

## scripe-mid2.png — mid (left half)

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. A long continuous row of eight Berlin Altbau apartment buildings at night for a mid parallax layer, drawn small in the frame: five storeys, ornate stucco facades in faded ochre, grey, dusty pink and muted green, tall windows with some lit warm sodium yellow and many dark, small balconies, colourful graffiti on the ground floor walls, rooftop chimneys and TV antennas, one construction crane silhouette rising behind the roofs. Deep violet night shading, slightly muted. The row spans the entire image width edge to edge and continues off both sides; all buildings stand on one flat baseline at the very bottom edge and the row occupies ONLY the bottom 45% of the image height (the crane may rise a little higher). The rest of the image is flat solid pure magenta #FF00FF (no gradient, no shadow on the background, no magenta inside the art).
```

## scripe-near2.png — near

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. Small street-level props for a Berlin night side-scrolling stage, near parallax layer, drawn small in the frame and spread evenly across the full image width with gaps between them, all standing on one flat baseline at the very bottom edge: a small Spaeti kiosk shop front with glowing neon pink and cyan sign shapes (no letters) and a lit window, a red and white striped construction fence (Bauzaun) panel with torn posters, two sodium-orange street lamps, parked bicycles, a round advertising column (Litfass-Saeule) covered in posters, a green waste bin, a traffic bollard. The tallest object (the street lamp) reaches only 32% of the image height; everything stands within the bottom 32%. Lit by sodium yellow and neon pink light. Everything else is flat solid pure magenta #FF00FF (no gradient, no shadow on the background, no magenta inside the art).
```

## scripe-fg.png — fg

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. Sparse foreground silhouette objects for a Berlin night side-scrolling stage, drawn very dark indigo almost black with a thin neon pink rim light on the left edge: on the far left a tall street lamp post, in the middle a parked bicycle and a traffic bollard, on the far right a red and white construction barrier post. Large empty space between the objects. Objects stand on the bottom edge. Everything else is isolated on a solid flat pure magenta #FF00FF background (no gradient, no shadow on the background, no magenta inside the art).
```

## prop-ubahn2.png — prop: U-Bahn carriage

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. One short Berlin U-Bahn subway carriage seen exactly from the side: classic bright yellow body, the carriage is only about three times as long as it is tall, two sliding doors and three windows with warm interior light, rounded ends, dark grey roof and undercarriage with two bogies and wheels, slight neon pink rim light from the left, clean dark outline. Single object centred and filling 85% of the image width. Background: flat solid pure magenta #FF00FF (no gradient, no shadow on the background, no magenta inside the art).
```

## scripe-mid2-ext.png — mid (right half, outpainted)

Generated with `-i scripe-mid2.png` so the continuation keeps the exact scale, baseline and palette. The two halves are joined at source resolution before processing, which makes the mid strip long enough to tile at 480–640 px.

```text
The attached image (also available as source.png in the current directory; use it as the edit/reference input of the image tool) is one panel of a 16-bit pixel-art parallax layer. Create the NEXT panel that continues the scene directly to the right of it. Keep everything identical: the same pixel size, the same art style, palette and lighting, the same building scale and roof height, the same flat baseline at the very bottom edge, the row of buildings occupying the same bottom part of the image, and the same flat solid pure magenta #FF00FF background above. The left edge of your image must continue seamlessly from the right edge of the attached image. Vary the individual buildings (different facade colours and details) so it does not look copied. No text, no characters.
```

## Drawn, not generated

These are drawn pixel by pixel in `drawn/scripe.py` because they must tile exactly or carry legible pixel text: Baustelle barrier, scope-creep overlay, tileset.
