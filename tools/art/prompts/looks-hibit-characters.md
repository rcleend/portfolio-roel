# HI-BIT look · characters and customer: image-generation prompts

The hibit cast (`src/game/art/looks/hibit/characters/**`, `src/game/art/looks/hibit/customer/**`) is built by `tools/looks/hibit/characters/build.py`.
No generated pixels ship. Bodies are 3D volumes rendered straight to native pixels, and everything that carries identity is hand-placed pixel art: the likeness head kit, the Strat, the keyboard, hands, the customer's head and every effect sprite.

Image generation was used twice, for design reference only:

- to calibrate costumes, props and proportions;
- to see how a pixel artist compresses Roel's face into a ~14 px head before hand-placing the kit.

Raw sources live outside the repo in `.looks-art-sources/hibit/characters/` (next to the checkouts).
Both were generated once with Codex CLI image generation (one image per call), using the captain's photos as references:

```sh
codex exec --skip-git-repo-check -s workspace-write -C <scratch dir> \
  -i roel-photo-smile-closeup.jpg -i roel-photo-white-shirt-blazer.jpg -i roel-photo-cap-sweater.jpg \
  [-i room-stratocaster-olympic-white.png] -- "<PROMPT>"
```

## gen-heroes/heroes-model-sheet.png: the three heroes (reference for outfits, props, palette)

Also passed `-i room-stratocaster-olympic-white.png`.

```text
Use your image generation tool to generate ONE image: Hi-bit pixel art character model sheet in the style of Owlboy, Dead Cells and Eastward: three full-body game sprites of the SAME real man shown in the attached photos, drawn as a faithful, instantly recognisable likeness: large round panto glasses with a dark heavy upper rim and thin lower rims, ash-blonde / light-brown hair with sun-blonde highlights swept up and back off the forehead with real volume and a soft wave, a few loose strands falling onto the forehead, shorter at the sides with the ears visible, a long oval face with a defined jaw, light warm skin, a big warm toothy smile, a slim lean build. All three stand in a three-quarter view facing right, side by side with generous space between them, on a flat solid pure magenta #FF00FF background. LEFT, the hacker: a black hoodie with the hood DOWN, bunched around the neck and shoulders, drawstrings with neon terminal-green tips, dark slim jeans, white sneakers; he holds a chunky black mechanical computer keyboard slung diagonally across his body like a keytar, its light keycaps clearly visible and a green RGB underglow along its edge. MIDDLE, the designer: a washed charcoal-grey baseball cap worn forward with hair sticking out at the sides and back and the glasses under the brim, a loose black-and-grey tie-dye knit sweater, dark brown trousers, dark sneakers; he holds the Olympic White Fender Stratocaster from the attached photo across his body with the neck pointing forward and up: cream-white double-cutaway body, pale mint pickguard with three white single-coil pickups, dark rosewood fingerboard with dot inlays, maple neck, six-in-line natural-wood headstock, chrome bridge. RIGHT, the strategist: a crisp white shirt with an open collar under an open dark navy blazer, dark trousers, brown leather shoes, holding a small yellow sticky-note pad, confident consultant stance. Each sprite is about 60 art pixels tall and every art pixel is a crisp 8x8 block of image pixels; hand-placed pixel art, rich hue-shifted ramps of 5 to 6 tones per material, coloured outlines that lighten on lit edges, light from the top-left, a subtle cool cyan rim light on the right-hand edges, no anti-aliasing, no blur, no text, no letters, no UI. Landscape 1536x1024. Then copy the generated image file into the current working directory as heroes-model-sheet.png and print its absolute path and pixel dimensions. Do not do anything else.
```

What it settled:

- the keytar hold with its green underglow;
- the Strat carried neck-forward and up;
- the white shirt under a navy blazer, with brown shoes and a pad of notes;
- roughly six heads tall at this resolution, which the hibit kit nudges towards 5.5 for likeness.

## gen-heads/heads-sheet.png: the likeness at sprite scale (reference for the head kit)

```text
Use your image generation tool to generate ONE image: a tiny low-resolution pixel art head sprite sheet of the real man in the attached photos, for a 16-bit hi-bit game in the style of Owlboy and Eastward. Eight heads in a 4 x 2 grid with lots of space between them, all in a three-quarter view facing RIGHT, on a flat solid pure magenta #FF00FF background. Each head is only about 14 art pixels tall and 13 art pixels wide (hair top to chin), and every art pixel is a large crisp square block of exactly 32 x 32 image pixels, so the pixel grid is perfectly regular and clearly visible. The likeness must be instantly recognisable even at this tiny size: ash-blonde / light-brown hair with sun-blonde highlights swept UP and BACK off the forehead in a high soft wave with real volume, a couple of loose strands falling onto the forehead at the front, shorter at the sides with the ear visible; large round panto glasses drawn as two clear rings with a darker heavy upper rim and thin grey lower rims, the eyes visible inside the lenses, the far lens narrower; a long oval face with a defined jaw, light warm skin. Top row, bare head: (1) big warm toothy smile, (2) neutral relaxed closed-mouth smile, (3) focused and determined, brows lowered, (4) hurt, eyes squeezed shut and teeth gritted. Bottom row, the same four expressions wearing a washed charcoal-grey baseball cap worn forward with the brim pointing right, hair sticking out at the side and back, the glasses under the brim. Hand-placed pixel art, 4 to 5 tone hue-shifted ramps, coloured outlines, light from the top-left, no anti-aliasing, no blur, no text. Landscape 1536x1024. Then copy the generated image file into the current working directory as heads-sheet.png and print its absolute path and pixel dimensions. Do not do anything else.
```

The model drew ~45-pixel heads rather than 14, so the sheet is a stylisation reference, not a source.
What it settled, all hand-placed in `tools/looks/hibit/characters/hibit/head.py`:

- the far lens and its hinge poking past the cheek;
- the forehead lock;
- the long angled jaw;
- the cap's brim line.

The face's silhouette was fitted to the reference's alpha mask at the kit's exact size.
