# Room authoring inputs

- `rug-source.glb`: the supplied **Rug - Square pattern** by
  [Sousinho](https://sketchfab.com/3d-models/rug-square-pattern-e45054df5644444ebca0670d75a6cf93),
  licensed CC BY 4.0 according to its embedded metadata. The original file is retained
  here; `rug.py` performs the square sizing, placement, 15° rotation and material changes.
- `rug-geometric.png`: a 1254 × 1254 square albedo map, generated with the built-in
  OpenAI image generation tool from the user's attached bedroom/rug reference.
  The source photograph is a visual reference only and is not redistributed.

The runtime receives the rendered rug inside the shared floor atlas. These files
are authoring inputs, not additional browser downloads. The folded underside has
its own plain wool material; it does not use the printed top texture.

## Generation prompt

> Transform the rug pattern and textile appearance in the supplied reference photograph into a production-ready SQUARE rug albedo texture for a 3D model. Output one perfectly square 2048x2048 image, exact flat orthographic top-down view, with the textile filling the entire image edge to edge. Extract the artistic language of the rug only: a balanced patchwork of large squares and diagonal half-square triangles, approximately a 5 by 5 grid, in teal blue, light aqua, mustard yellow, muted leaf green, rust orange, warm ivory and charcoal grey. Use the reference's cheerful modern geometric composition and soft dense woven tufted pile, with fine restrained textile fibers, while creating a coherent original square arrangement. Flat neutral diffuse colour/albedo, uniform illumination across the surface, enough subtle fiber detail for close views, no directional shadows, no highlights, no vignette. This is a texture map, not a photograph of a rug lying in a room: no perspective, no folded corner, no surrounding floor, no background, no furniture, no bed, no props, no border, no tassels, no text or watermark. The 3D geometry will supply the folded corner and lighting separately.

The tool returned a 1254 px square image; that original resolution is retained.

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
