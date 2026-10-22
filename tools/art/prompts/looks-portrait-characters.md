# Portrait look · characters and customer — image-generation prompts

The portrait heroes (`hackerman`, `artsy`, `strategy`), the Unhappy Customer and their attack effects are drawn by code: `tools/looks/portrait/characters/build.py` paints every frame from a hand-drawn head kit, a posed body rig, outfit painters and prop painters, and writes the sheets deterministically.
No generated pixel ends up in a sprite.

Image generation was used twice, economically, for design references only: to see how the captain's likeness, the outfits, the Strat and a customer caricature simplify in the style of `refs/style-reference-grid.png` before drawing them by hand.
The raw sources live outside the repo in `.looks-art-sources/portrait/characters/` (next to the checkout's workspace).

```sh
codex exec --skip-git-repo-check -s workspace-write -C <scratch dir> -i style.png [-i more references] -- \
  "Use your image generation tool to generate ONE image: <PROMPT> Landscape 1536x1024. \
   Then copy the generated image file into the current working directory as <name>.png \
   and print its absolute path and pixel dimensions. Do not do anything else."
```

## heroes-model-sheet.png — the three heroes

Attached, in order: `style.png` (`refs/style-reference-grid.png`), `roel-blazer.jpg`, `roel-smile.jpg`, `roel-cap.jpg` (the three `refs/roel-photo-*.jpg`, the cap photo downscaled to 768 px) and `strat.png` (the guitar cropped from `refs/room-stratocaster-olympic-white.png`).

```text
16-bit pixel art character sprites drawn in exactly the style of the first attached image (a grid of small full-body pixel-art game characters): slim realistic proportions about six heads tall, selective coloured outlines (dark outer silhouette, coloured inner lines), restrained three-to-four-tone shading in clean pixel clusters, natural slightly muted palette, light from the top-left. Draw THREE full-body sprites of the SAME young man shown in the attached photos, each standing in a relaxed three-quarter view facing right, evenly spaced side by side on a flat plain light grey background, each sprite about 60 art pixels tall. Likeness is the priority: ash-blonde (light brown with sun-bleached highlights, never yellow) medium-length hair swept up and back with soft volume and a few loose strands falling onto the forehead, shorter at the sides with the ears visible; round panto glasses with a heavy dark upper rim and thin lower rims; a slim long oval face with a defined jaw; a big warm toothy smile; slim lean build. LEFT sprite, the engineer: black hoodie with the hood down bunched around the neck, drawstrings with small green tips, dark jeans, white sneakers, holding a chunky black mechanical computer keyboard with light grey keycaps and a green underglow in both hands at waist height. MIDDLE sprite, the designer: a washed charcoal baseball cap worn forward with the glasses under the brim and hair sticking out at the sides, a black-and-grey tie-dye knit sweater, dark brown trousers, dark sneakers, an Olympic White Fender Stratocaster electric guitar exactly like the attached guitar photo (cream-white double-cutaway body, pale mint pickguard, three white single-coil pickups, dark rosewood fingerboard, maple six-in-line headstock) slung on a strap and held in playing position. RIGHT sprite, the strategist: crisp white shirt with an open collar, an open dark navy blazer, charcoal trousers, brown leather shoes, holding a small yellow sticky-note pad. Crisp hand-placed pixels on a strict grid where every art pixel is an 8x8 block of identical colour, no anti-aliasing, no blur, no gradients, no text, no labels, no shadows on the background.
```

Used for: the three-quarter-profile head angle (both lens rings visible, facing the direction of travel), the quiff rising to its highest point at the front, ash rather than yellow hair tones, the hoodie's green drawstring tips, the keyboard held in both hands at the waist, the tie-dye "spider" blotches, the Strat's cream body with a dark outline and a mint pickguard, and the open blazer over the white shirt with a belt.
It renders the figures at roughly 110 art pixels tall, so it is a design reference, not a source: area-downsampled to the contract's 57 px the faces turn to mush, which is why the head kit is drawn pixel by pixel instead.

## customer-model-sheet.png — the Unhappy Customer's five states

Attached: `style.png` (`refs/style-reference-grid.png`).

```text
16-bit pixel art character sprites drawn in exactly the style of the attached image (a grid of small full-body pixel-art game characters): slim realistic proportions, selective coloured outlines (dark outer silhouette, coloured inner lines), restrained three-to-four-tone shading in clean pixel clusters, natural slightly muted palette, light from the top-left. Draw FIVE full-body sprites of the SAME comic character side by side on a flat plain light grey background, each in three-quarter view facing right, each about 55 art pixels tall: an exasperated older customer, a hilarious caricature of the 'I want to speak to the manager' type. He is in his late fifties, short and stout with a round pot belly, bald on top with a grey horseshoe fringe and one long comb-over strand, a huge bushy grey walrus moustache, bushy angry grey eyebrows, a big red nose and a flushed red face. He wears a tucked-in mustard-yellow polo shirt, khaki shorts with a brown belt pulled up high, white tube socks pulled up to the calves and chunky white dad sneakers. He holds a smartphone in one hand and a long crumpled paper receipt in the other. Pose 1 WALK: stomping forward furiously, leaning in, waving the receipt. Pose 2 SHOUT: leaning forward, mouth wide open yelling, jabbing the phone, a vein on his forehead, steam puffing from his ears, the comb-over strand flying up. Pose 3 HURT: recoiling backwards, eyes squeezed shut, moustache bristling. Pose 4 STUNNED: dazed and wobbly, spiral eyes, tongue out, knees buckling. Pose 5 HAPPY: won over, face back to a calm normal skin tone, a huge grin under the moustache, skipping happily with a thumbs up. Crisp hand-placed pixels on a strict grid where every art pixel is an 8x8 block of identical colour, no anti-aliasing, no blur, no gradients, no text, no labels, no shadows on the background.
```

Used for: the caricature proportions (a bigger head than the heroes, a pot belly, short legs), the grey side tufts and the comb-over strand that flies up when he shouts, the red bulb of a nose under bushy brows, the walrus moustache lifting off an open bellow, the phone shoved forward while the receipt is brandished overhead, steam from both ears, spiral eyes with the tongue out and buckling knees, and the calm-skinned thumbs-up skip.

## Not generated

- The likeness head kit (`portraitkit/heads.py`) is drawn pixel by pixel from the three photos; a downsample of the photo heads to 12–16 px confirmed which masses survive at sprite scale (the glasses as a dark band with light lens dots, the hair as the light top mass, the smile as a light row near the chin).
- Bodies, outfits, the keyboard, the Strat (rasterised from geometry in guitar-local coordinates), the sticky-note pad, the customer and every attack effect are code: see the module docstrings under `tools/looks/portrait/characters/portraitkit/`.
