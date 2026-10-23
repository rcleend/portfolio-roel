# Arcade look · characters — image-generation prompts

The arcade heroes and the Unhappy Customer are **hand-authored**: every shipped pixel comes from the key grids and the rig in `tools/looks/arcade/characters/kit/` (see that folder's README).
Image generation was used twice, for design studies only: a model sheet to settle outfits and props at sprite scale, and a sheet of large heads to study how the likeness survives tiny sizes.
Neither image is traced, downsampled or shipped; box-downsampling them to sprite size destroys the glasses and the smile, which is why the head kit is drawn by hand.

Both were generated once with Codex CLI image generation, with the captain's photos and the room's Stratocaster render attached, in a scratch directory that holds copies of the references:

```sh
codex exec --skip-git-repo-check -s workspace-write -C <scratch dir> \
  -i roel-cap-face.jpg -i roel-shirt-blazer.jpg -i roel-smile.jpg [-i strat.png] -- \
  "Use your image generation tool to generate ONE image. <PROMPT> Landscape 1536x1024. \
   Then copy the generated image file into the current working directory as <name>.png \
   and print its absolute path and pixel dimensions. Do not do anything else." < /dev/null
```

`< /dev/null` matters: without it `codex exec` waits for more input on stdin when run from a script.
Raw outputs live outside the repo in `.looks-art-sources/arcade/characters/scratch/`.

## heroes-model-sheet.png — outfits and props at sprite scale

Attachments: `roel-cap-face.jpg`, `roel-shirt-blazer.jpg`, `roel-smile.jpg` (crops of `refs/roel-photo-*`) and `strat.png` (a crop of `refs/room-stratocaster-olympic-white.png`).

```text
The attached photos (also in the current directory as roel-cap-face.jpg, roel-shirt-blazer.jpg and roel-smile.jpg; use them as reference inputs of the image tool) show the real man to draw, and strat.png shows his guitar. PROMPT: 16-bit pixel art character sprite model sheet in the style of SNK Neo Geo Metal Slug sprites, crisp hand-placed pixels, big chunky readable pixels (each art pixel is a clearly visible square block about 14x14 image pixels), limited palette, a near-black 1-pixel outline around every figure, bold 4-tone cel shading per material with warm highlights and cool hue-shifted shadows, light from the top-left, no anti-aliasing, no blur, no text, no letters, no UI. Three full-body standing sprites of the SAME young man side by side with generous gaps, all facing right in three-quarter view, feet on one flat baseline near the bottom of the image, each figure about 60 art pixels tall and about 5 heads tall: slightly heroic Metal Slug proportions with big expressive hands and feet, a confident stance, a slim lean build. His likeness from the photos must be unmistakable: ash dark-blonde hair (light brown with sun-blonde highlights, never yellow), medium length on top, swept up and back off the forehead with real volume and a soft wave, a few loose strands falling onto the forehead, shorter sides with the ear visible; round panto glasses with a heavy black upper rim and thinner lower rims and fairly large lenses; a slim long oval face with a defined jaw, light warm pinkish skin, light eyebrows and a big warm toothy smile. LEFT figure: a black hoodie with the hood DOWN, bunched around the neck, white drawstrings with terminal-green tips, dark jeans, white sneakers, holding a chunky black mechanical computer keyboard with light grey keycaps and a green underglow in both hands like a keytar. MIDDLE figure: a washed charcoal baseball cap worn forward with hair sticking out at the sides and back and the glasses under the brim, a black and grey tie-dye knit sweater, dark brown trousers, dark sneakers, holding an Olympic white Fender Stratocaster (cream-white double-cutaway body, pale mint pickguard with three white single-coil pickups, chrome bridge, dark rosewood fingerboard with dot inlays, maple neck, natural wood six-in-line headstock) slung across his body. RIGHT figure: a crisp white open-collar shirt under a dark navy blazer, dark trousers, brown leather shoes, holding a small pad of yellow sticky notes. Background: flat solid pure magenta #FF00FF (no gradient, no shadow, no magenta inside the art).
```

What it settled: the keyboard worn like a keytar with a green underglow, the strap-slung Strat with its mint guard reading at small size, the blazer-over-white-shirt silhouette, brown belt and shoes.

## heads-kit.png — the likeness at small sizes

Attachments: the same three photo crops.

```text
The attached photos (also in the current directory as roel-cap-face.jpg, roel-shirt-blazer.jpg and roel-smile.jpg; use them as reference inputs of the image tool) show the real man to draw. PROMPT: Pixel art sprite sheet of tiny character HEADS for a 16-bit Neo Geo / Metal Slug arcade game, drawn on a strict pixel grid: each head is only about 16 pixels wide and 18 pixels tall, and every art pixel is a crisp square block of about 20x20 image pixels so the grid is clearly visible. Limited palette, a 1-pixel near-black outline, 4-tone cel shading with warm highlights and cool shadows, light from the top-left, no anti-aliasing, no blur, no text. Eight heads of the SAME young man in two rows of four with generous gaps, all in three-quarter view facing RIGHT. Top row bare-headed, bottom row wearing a washed charcoal baseball cap worn forward with the hair sticking out at the sides and back and the glasses under the brim. Columns left to right: 1 neutral soft smile, 2 focused and determined (brows down, mouth a flat line), 3 big warm toothy smile showing the upper teeth (his trademark), 4 hurt (eyes squeezed shut, mouth open in a grimace). His likeness must read even at this tiny size: ash dark-blonde hair (light brown with sun-blonde highlights, never yellow) swept up and back off the forehead with real volume and a soft wave, a loose strand on the forehead, short sides with the ear visible; round panto glasses with a heavy black upper rim and a thinner lower rim drawn as two clear round rings with light lenses and a bridge, a 1-pixel white glint on one lens; a slim long oval face with a defined jaw and a narrow chin; light warm pinkish skin; light eyebrows. Background: flat solid pure magenta #FF00FF (no gradient, no shadow, no magenta inside the art).
```

The model drew the heads about 45 px tall instead of 16, which made it a useful study rather than a source.
What it settled: the asymmetric quiff (high at the front, falling away to the back), the far lens sitting on the face's edge, the ear left of the temple arm, and the cap's brim reaching past the glasses.
