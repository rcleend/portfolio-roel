# Luna · San Francisco — image-generation prompts

Exact prompts behind the generated sources in `recipes/luna.json`.
Each was generated once with Codex CLI image generation (one image per call, 1536×1024):

```sh
codex exec --skip-git-repo-check -s workspace-write -C <scratch dir> [-i source.png] -- \
  "Use your image generation tool to generate ONE image: <PROMPT> Landscape 1536x1024. \
   Then copy the generated image file into the current working directory as <name>.png \
   and print its absolute path and pixel dimensions. Do not do anything else."
```

The source file name is the `## heading`; the recipe refers to it under `sources`.
Re-rolling a source is safe: crop and scale are expressed in source pixels, so check the crop rows in the recipe after a re-roll.

## luna-sky.png — sky

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. A sky-only backdrop for a San Francisco side-scrolling stage at golden hour: a banded gradient from deep dusty blue-violet at the top through lavender and peach to warm golden orange at the bottom, a large low setting sun in the lower right third with a few horizontal cloud streaks across it, layered puffy painted pixel clouds lit warm orange and pink from below with cool lavender shadows, a band of soft pale fog along the very bottom. Absolutely no land, no buildings, no water, no bridge, only sky.
```

## luna-far.png — far

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. A distant San Francisco skyline panorama for a far parallax layer at golden hour: on the left the Golden Gate Bridge with its two International Orange art-deco towers and suspension cables, its lower part swallowed by a thick rolling white-lavender fog bank, Marin headland hills behind it; on the right the downtown skyline with the Transamerica Pyramid clearly recognisable and tallest. Hazy, slightly desaturated atmospheric colours: warm orange rim light from the right, cool fog blues and lavender shadows. The silhouette occupies the bottom half of the image and touches the bottom edge and both side edges; everything above it is isolated on a solid flat pure magenta #FF00FF background (no gradient, no shadow on the background, no magenta inside the art). No water, no sky colours.
```

## luna-mid2.png — mid (left half)

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. A long continuous row of ten narrow San Francisco Victorian 'Painted Ladies' row houses for a mid parallax layer, drawn small in the frame: each house three storeys with a bay window, steep pointed gable and ornate white trim, alternating pastel teal, peach, lavender, butter yellow and mint facades, a few tall palm trees and a dark green tree between some houses, warm golden-hour light from the right with cool lavender shadows, slightly muted hazy colours. The row spans the entire image width edge to edge and continues off both sides; all houses stand on one flat baseline at the very bottom edge and the row occupies ONLY the bottom 40% of the image height. The top 60% of the image is flat solid pure magenta #FF00FF (no gradient, no shadow on the background, no magenta inside the art).
```

## luna-near2.png — near

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. Small street-level props for a San Francisco side-scrolling stage at golden hour, near parallax layer, drawn small in the frame and spread evenly across the full image width with generous gaps between them, all standing on one flat baseline at the very bottom edge: ornate dark green cast-iron double street lamps, small sidewalk trees in square planters, a short wrought-iron fence segment, a red newspaper vending box, a yellow fire hydrant, a vintage parked car, a cable-car stop sign post, a bench. The tallest object (the street lamp) reaches only 30% of the image height; everything stands within the bottom 30%. Warm rim light from the right. Everything else is flat solid pure magenta #FF00FF (no gradient, no shadow on the background, no magenta inside the art).
```

## luna-fg.png — fg

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. Sparse foreground silhouette objects for a San Francisco side-scrolling stage, drawn very dark navy-purple almost black with a thin warm orange rim light on the right edge: on the far left a tall wooden telephone pole with cable-car overhead wires, in the middle a fire hydrant and a low bush, on the far right a leafy tree branch hanging down from the top edge. Large empty space between the objects. Poles stand on the bottom edge. Everything else is isolated on a solid flat pure magenta #FF00FF background (no gradient, no shadow on the background, no magenta inside the art).
```

## prop-cablecar.png — prop: cable car

```text
16-bit pixel art, Neo Geo / Metal Slug arcade game background, crisp hand-placed pixels, big chunky readable pixels (each art pixel is about 4x4 image pixels), limited palette, painted pixel shading with clean dark outlines and a little ordered dithering, no anti-aliasing, no text, no letters, no UI, no characters, no people, side view, orthographic front elevation, no perspective. One San Francisco cable car seen exactly from the side, filling most of the image width: classic red and cream wooden body, open-sided bench section at both ends with brass poles, enclosed middle cabin with windows, roof with a running board, warm golden-hour light, clean dark outline. Single object centred, isolated on a solid flat pure magenta #FF00FF background (no gradient, no shadow on the background, no magenta inside the art).
```

## luna-mid2-ext.png — mid (right half, outpainted)

Generated with `-i luna-mid2.png` so the continuation keeps the exact scale, baseline and palette. The two halves are joined at source resolution before processing, which makes the mid strip long enough to tile at 480–640 px.

```text
The attached image (also available as source.png in the current directory; use it as the edit/reference input of the image tool) is one panel of a 16-bit pixel-art parallax layer. Create the NEXT panel that continues the scene directly to the right of it. Keep everything identical: the same pixel size, the same art style, palette and lighting, the same building scale and roof height, the same flat baseline at the very bottom edge, the row of buildings occupying the same bottom part of the image, and the same flat solid pure magenta #FF00FF background above. The left edge of your image must continue seamlessly from the right edge of the attached image. Vary the individual buildings (different facade colours and details) so it does not look copied. No text, no characters.
```

## Drawn, not generated

These are drawn pixel by pixel in `drawn/luna.py` because they must tile exactly or carry legible pixel text: rate-limit gate, tileset.
