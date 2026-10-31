# Room authoring inputs

- `rug-source.glb`: the supplied **Rug - Square pattern** by
  [Sousinho](https://sketchfab.com/3d-models/rug-square-pattern-e45054df5644444ebca0670d75a6cf93),
  licensed CC BY 4.0 according to its embedded metadata. The original file is retained
  here; `rug.py` performs the square sizing, placement, 15° rotation and material changes.
- `rug-geometric.png`: an AI-edited square albedo, generated with the built-in OpenAI image tool using the
  existing multicoloured rug texture as the edit reference. It keeps the plush wool/fibre appearance and replaces
  the printed pattern with a straight 5 × 5 grid of dark navy and soft white squares.

The runtime receives the rendered rug inside the shared floor atlas. These files are authoring inputs, not additional
browser downloads. The folded underside retains its plain wool material. The retexture-rug scripts provide a targeted
bake/publication path without rebuilding unrelated room assets.

## Rug edit prompt

> Edit the existing rug albedo texture. Preserve its dense plush woven wool fibres, fine textile grain, flat top-down
> texture-map presentation and neutral even lighting. Replace the entire coloured geometric pattern with a regular
> straight 5 by 5 checkerboard of alternating deep dark navy blue (#112441) and soft white (#ecebe5). Every cell is a
> complete square. No diagonal divisions, triangles, extra colours, border, perspective, props, text or watermark.
> Keep the subtle fibre variation within each colour and the original cosy woven texture. Fill the square image edge
> to edge; the room's existing geometry supplies the folds and lighting.

## Opening TV view

- `desk-plant-source.glb`: user-supplied **Desk Plant** by
  [jakecollingdesign](https://sketchfab.com/jakecollingdesign), from
  [Sketchfab](https://sketchfab.com/3d-models/desk-plant-cedfdeab85aa49d68125306b0cacde34).
  Embedded license: **CC BY-NC-SA 4.0**. `tv_dressing.py` resizes and places the
  scan, welds its split vertices before reducing triangles, cleans the ceramic albedo, then bakes shared room
  illumination with smoothed normals. The modified plant retains that license.
- `product-engineer-cover.png`: original 1024 × 1536 cover generated using the
  built-in OpenAI imagegen tool. The user's TV screenshot supplied the title and
  blue/amber art direction. The front insert replaces Battlefront II; the entire
  case turns 180° so the artwork's bottom points at the opening camera.

These are offline authoring sources. The plant uses one 1K baked atlas; the cover
is reduced to a maximum edge of 1K and replaces the old embedded cover texture.

### Product Engineer generation prompt

```text
Use case: illustration-story
Asset type: printed FRONT COVER texture for a nostalgic 1990s video-game case in a 3D portfolio room.
Primary request: original cover art for the game titled "PRODUCT ENGINEER", matching the supplied TV title screen reference: rich blueprint cobalt blue, large beveled amber-orange arcade lettering, playful technical diagrams and pixel-art sensibility.
Composition: flat, portrait 2:3 cover filling the entire image edge to edge. No physical case, perspective, border around the image, surrounding room, mockup, reflections or lighting baked into the paper. The top third carries the exact large readable two-line title "PRODUCT ENGINEER". Beneath it, an original vivid hand-painted 1990s PC-game illustration blended with crisp pixel-art motifs: a small engineer at a glowing CRT workstation assembling luminous interface blocks and a rising blueprint graph, visually coherent with a product-building game. Small tasteful footer reads "LEENDERS CORP." Keep the title dominant and readable at small size, give it clear breathing room. Premium nostalgic game-box artwork, clean contours, deliberate detailed illustration.
Reference image role: style and exact game title only; do not include the TV itself or reproduce Star Wars art or branding.
Text verbatim: "PRODUCT ENGINEER", "LEENDERS CORP."
Constraints: no platform logos, no unrelated brands, no watermarks, no extra text. Opaque full-bleed image.
```
