# Level art pipeline

Turns AI-generated paintings into native-resolution (320×240) pixel art for the two levels, and draws the pieces that must be exact (tiles, small props) programmatically.
Python 3.9+ and Pillow only.

```
tools/art/
  build.py          rebuild a level's art from its recipe -> src/game/levels/<id>/art/
  pixelate.py       the same pipeline as a one-off CLI for a single image
  preview.py        composite a level like the game does, for review
  recipes/<id>.json how every generated layer/prop is cropped, graded, quantised
  prompts/<id>.md   the exact image-generation prompts behind each source
  arttools/         pipeline steps (one module per concern)
  drawn/            programmatic tilesets and props (one module per level)
  tests/            unit tests and the level-art contract test
```

## Workflow

1. Generate a source with Codex CLI using the prompt in `prompts/<id>.md` (one image per call, 1536×1024), in a scratch directory outside the repo.
2. Put raw sources in `$ARCADE_ART_SOURCES` (default `../.arcade-art-sources`, next to the checkout). They are inputs, never committed.
3. `python3 tools/art/build.py luna scripe` (or `--only mid,near`) writes the PNGs, `tileset.png` and `layers.json`.
4. Review: `python3 tools/art/preview.py luna`, `--seams`, `--tiles` write to `tools/art/.preview/` (gitignored). Look at them; iterate on the recipe.
5. `python3 -m unittest discover -s tools/art -t tools/art` validates the pipeline and the PNGs against the contract below.
6. `pnpm build:art` turns every PNG under `src/game` into `<name>.art.ts`, the same pixels as a string in code, and removes the PNG: the game loads no image file (docs/ARCHITECTURE.md › Art in code), and a test fails on a PNG left there. `layers.json` keeps naming the `.png`. To preview or test art that is already converted, `pnpm build:art --export src/game` writes the PNGs back beside their modules; run `pnpm build:art` again when done.

## The pipeline

`arttools/pipeline.py` runs these steps in a fixed order.
Everything that mixes colours happens before palette quantisation, so final images contain only palette colours and binary alpha.

| Step | Option(s) | Why |
| --- | --- | --- |
| Snap source alpha | `source_alpha_threshold` | Generators sometimes return their own soft transparency; a glow has no place in pixel art. |
| Crop | `crop` (source px) | |
| Chroma key | `key`, `key_tolerance`, `key_fringe` | Removes the `#FF00FF` background, then grows only into magenta-tinted pixels touching it, which is where blended fringes live. Purples inside the art survive. |
| Trim | `trim` | Crop to the opaque bounding box (props). |
| Area downsample | `width` / `height` / `factor`, `then_nearest` | Box filter with premultiplied alpha so keyed magenta never bleeds into edges; optional nearest snap for sources on a coarse grid. |
| Binarise alpha, despill, despeckle edges | (automatic with `key`) | One-pixel silhouette cleanup: tinted edge pixels are repainted from their interior neighbours; stray pixels and pinholes are fixed. |
| Drop fragments | `drop_fragments` | Thin structures (crane booms) break apart when shrunk; floating stubs read as dirt. |
| Arrange | `arrange_width`, `arrange_order` | Re-spaces separate objects (lamps, bins) evenly along a repeating strip, half a gap at each end so the wrap never cuts an object. |
| Grade | `saturation`, `brightness`, `contrast`, `tint`, `tint_amount` | Grades every layer towards the level's ambient light; more haze with distance keeps the play plane the most saturated thing on screen. |
| Sharpen | `sharpen` | Area averaging leaves soft transitions that would quantise into muddy in-between colours. |
| Tile | `tile_width` [`tile_width_max`], `tile_mode`, `tile_on_edges` | See below. |
| Outline | `outline`, `outline_color` | Darkens the outer silhouette ring (selective outline). |
| Quantise | `colors` or `palette`, `dither` (`bayer2`/`bayer4`), `dither_strength` | Adaptive median-cut palette from opaque pixels only, nearest-colour mapping with a perceptual distance, optional ordered dithering. No error diffusion: it crawls. |
| Pad | `pad`, `anchor` | Place a prop on an exact sprite canvas, bottom-centred by default. |

### Seamless tiling

`cut` (default) searches crop start *and* width (within `tile_width..tile_width_max`) for a crop whose ends rhyme: the few columns around its right end must look like the columns around its left end, so whatever follows the last column on wrap is what followed it in the painting.
With `tile_on_edges` both ends must also sit on strong vertical edges, so a row of buildings is cut between buildings instead of through a facade.
`blend` cross-fades a short overlap for continuous textures with no rhyme; `mirror` is a last resort.
For long strips, a source and its outpainted continuation (`codex exec -i`) are joined at source resolution (`sources` with two files) before processing.

## CLI

```sh
python3 tools/art/pixelate.py sky.png -o sky-native.png --crop 85,0,1451,1024 --size 320x240 --colors 28 --dither bayer4 --dither-strength 10
python3 tools/art/pixelate.py houses.png -o mid.png --key magenta --factor 5 --sharpen 1.6 --tile 520 --tile-max 640 --tile-on-edges --colors 32
python3 tools/art/pixelate.py props.png -o near.png --key magenta --factor 5 --arrange 512 --colors 24
python3 tools/art/pixelate.py car.png -o car.png --trim --width 96 --pad 96x48 --outline --colors 20 --print-palette
```

`python3 tools/art/pixelate.py --help` lists every option.

## Output contract: `src/game/levels/<id>/art/layers.json`

```jsonc
{
  "levelId": "luna",
  "nativeSize": [320, 240],
  "groundY": 200,                 // top of the play-plane ground; tiles fill 200..240
  "layers": [                     // back to front
    {
      "id": "sky",                // sky | far | mid | near | fg
      "file": "sky.png",          // relative to this directory
      "factor": 0,                // screenX = -round(cameraX * factor)
      "y": 0,                     // top edge in native pixels (may be negative)
      "width": 320, "height": 240,
      "repeatX": false,           // true: draw at screenX mod width, repeated
      "opaque": true,             // no transparent pixels; may skip clearing
      "foreground": false         // true: draw after the play plane (in front of the player)
    }
  ],
  "tileset": { "file": "tileset.png", "tileSize": 16, "tiles": { "ground_top": [1, 0] } }, // [col, row]
  "props": { "cableCar": { "file": "cable-car.png", "w": 96, "h": 48, "frames": 1 } },   // frames laid out left to right
  "palette": ["#1c1024"]          // the level's play-plane palette (tiles, drawn props, highlight block)
}
```

Layout conventions: background layers keep their street level around y 200, the ground line.
`mid` and `near` sit with their bottoms at 204 and 201 so their bases tuck behind the sidewalk.
`fg` hangs from below the screen (`y + height` > 240) so its objects stand in front of the ground.
`far` layers are not repeated and are wide enough for a 3,840 px level at their factor (`width - 320 >= (3840 - 320) * factor`); clamp if a level is longer.

### Tileset grid (8 × 3 tiles of 16 px, identical names in both levels)

| row \ col | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `ground_top_left` | `ground_top` | `ground_top_alt` | `ground_top_right` | `platform_left` | `platform_mid` | `platform_right` | `block_highlight` |
| 1 | `ground_fill_left` | `ground_fill` | `ground_fill_alt` | `ground_fill_right` | `pit_edge_left` | `pit_edge_right` | `pit_top` | `block_highlight_shine` |
| 2 | `ground_base_left` | `ground_base` | `ground_base_alt` | `ground_base_right` | `platform_support` | `platform_mid_alt` | `pit_fill` | `block_used` |

- Ground is three rows deep from `groundY`: `top` (200), `fill` (216), `base` (232, half visible); `base` and `pit_fill` also repeat vertically. `_alt` variants interleave freely with their plain tile.
- `*_left` / `*_right` are the end caps of a ground or platform run (exposed side faces).
- `pit_edge_left` is the top tile on the left side of a pit (its right side drops into the pit, hazard-marked); `pit_edge_right` is the first top tile after the pit. Use `ground_fill_right`/`_left` and `ground_base_right`/`_left` below them, and `pit_top` + `pit_fill` inside the pit.
- Platforms collide on their top row (y 0 of the tile); `platform_support` repeats vertically under a platform end.
- `block_highlight` and `block_highlight_shine` alternate (a few frames of shine every second or so); `block_used` replaces them once the highlight is collected. The block is shared by both levels.

### Props

| Level | Prop | Size | Frames |
| --- | --- | --- | --- |
| luna | `cableCar` (moving platform, side view) | 96×48 | 1 |
| luna | `rateLimitGate` ("429" barrier) | 24×48 | 2: closed, open |
| scripe | `uBahn` (carriage, side view) | 160×58 | 1 |
| scripe | `baustelle` (construction barrier) | 48×32 | 1 |
| scripe | `scopeCreep` (vines + tape overlay) | 32×32 | 2: sway A, sway B |
