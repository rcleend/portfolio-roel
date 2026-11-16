# Hibit skills: motion spec

The hibit look of the six skills: their icons and their in-game effects.
This is the Phase B blueprint: what every sprite is for, when it plays, where it is drawn and what code draws around it.

- Assets: `src/game/art/looks/hibit/skills/<skillId>/` (`icon` plus `fx-*` strips in the looks sheet format, each a `.json` and an `.art.ts` module holding its PNG's pixels).
- Generator: `python3 tools/looks/hibit/skills/build.py` (`--check` verifies the checkout's files against a fresh build: the JSON always, the pixels once `pnpm build:art --export src/game` has written the PNGs back; run `pnpm build:art` after building or checking, tools/art/README.md › Art modules).
- Review: `python3 tools/looks/hibit/skills/mockups.py` writes key-frame mock-ups in both levels, the icon, HUD, select and style boards, and contact sheets of every animation to `/tmp/arcade-looks-hibit-skills/mockups/`.
- Tests: `python3 -m unittest discover -s tools/looks/hibit/skills -t tools/looks/hibit/skills`.

Everything is drawn in code, deterministically: hand-placed pixel maps for objects (the Strat, the potion masks, hearts, notes, glyphs) and whole-pixel geometry for light and motion (beams, rings, flares, the bubble).
No image generation is involved (see `tools/art/prompts/looks-hibit-skills.md`).

## Shared language

### Scale

Heroes and customers are being redrawn at 54–60 px tall in 64 × 64 frames, so every effect is sized for those bodies, not for today's 40 px sprites.

| Element | Size | Why |
| --- | --- | --- |
| FULL-STACK beam | 23 px tall (3 layers of 5 px) | Crosses a customer's torso; the hero's head stays above it. |
| AGENT drone | 19 × 19 px with rotor and thruster | A sidekick about a third of the hero's height. |
| UX ELIXIR potion | 9 × 13 px | About the size of the hero's head. |
| POWER CHORD stun crown | 27 × 14 px | Rings a 60 px customer's head. |
| NORTH STAR in flight | 17 × 24 px with its night rim | Reads on a busy sky; its hitbox stays 10 × 10. |
| CHURN SHIELD bubble | radius 33.5 px | Wraps a 58 px hero with a few pixels to spare. |

### Light and palette

- Key light from the top-left, a cool cyan rim from the right (the television's glow), exactly like the heroes.
- One six-tone, hue-shifted ramp per material (`tools/looks/hibit/skills/hibitfx/palette.py`): shadows lean blue-violet, highlights warm.
  Tone 0 is the material's coloured outline and tone 1 its outline where the edge faces the key light, so outlines lighten on lit edges.
- Effects are stepped bands from a white core through light and saturated tones to a dark keyline (tone 0).
  The keyline is what keeps them legible on San Francisco's golden hour, the white core on Berlin's night.
  The outermost glow band is a 50 % Bayer dither, never alpha.
- Every sheet stays under 30 colours.

| Skill | Ramps |
| --- | --- |
| FULL-STACK ATTACK | `CYAN` front-end, `VIOLET` back-end, `AMBER` database, `INK` separators |
| AGENT SUMMON | `PEARL` chassis, `VISOR` glass, `CYAN` optics and shots, `AMBER` status light (`HEART` when it turns red) |
| UX ELIXIR | `POTION` magenta elixir, `GLASS`, `CORK`; `CALM` lilac, `MINT` and `HEART` for the calm motifs |
| POWER CHORD | `STRAT`, `GUARD`, `ROSEWOOD`, `MAPLE`, `CHROME` (the guitar); `SOUND` violet; `GOLD` stun stars |
| NORTH STAR | `GOLD` star and trail, `NIGHT` blue for its dithered rim and the trail's cooled end |
| CHURN SHIELD | `BUBBLE` teal rim, `FILM` iridescence (pink, lilac, mint, butter), `HEART` |

### Layering

The level draws, back to front: props, skills' `behind` layer, customers, the hero, shots, complaint bubbles, skills' `front` layer, world effects, foreground.

- `behind`: the shockwave rings, the calm wave, the elixir aura, the drone on the far half of its orbit.
- `front`: beams, muzzle flashes, the potion, the strum, the bubble, stun crowns, hearts, hits.
- Nothing covers the hero's head: the beam starts at the hand, the drone orbits at chest height, the bubble is hollow and its specular sits upper-left, away from the face.

### Sprite or code

Sprites are what must be drawn by hand: objects, flares, bursts, glyphs, and every frame whose shape carries the motion.
Code does what code does better, in whole-pixel steps: positions and paths, tiling a beam across the screen, scrolling data, rings that grow (midpoint circles), particle fields, and timing.
Code may play a strip at its own `fps` or pick frames by age when the beat sheet needs a different timing.

### Facing and origins

Every strip faces right; code mirrors it for a left-facing hero (`flipX`).
Origins sit on the point that attaches to the world (the hand, the strum point, a body centre, the feet line), so a mirrored frame stays attached.

### Busy screens

- Short and big, or long and small: the screen-wide moments (beam, shockwave) last at most 0.6 s; the long ones (drone 8 s, elixir 6 s, shield 5 s) are small, hollow or behind the bodies and only flare on events.
- One focal flash per event, local to it: no full-screen flashes of our own.
- Large areas never strobe: the beam's sustain shimmers through its glow dither, a core line and the data riding it, never through a whole-beam brightness flicker (a 5 Hz flicker over 9 % of the screen is a photosensitivity risk).

### Reduced motion

The world already drops the gameplay shakes and flashes.
On top of that each skill below names its calmer variant: skip the white impact frames (start those strips one or two frames later), hold loops on a steady frame where they would alternate, and halve scroll speeds.

### Timing notation

`f` counts 60 Hz frames from the cast (gameplay steps at 60 Hz).
A strip written as `name` 9 @ 30 has 9 frames at 30 fps (each frame holds two 60 Hz frames).

## Icons

All six are 24 × 24, one `idle` loop of 24 frames at 12 fps (two seconds).

- Shared frame: a stepped backlight disc in the skill's own colour (a dithered rim at r 10.6, a dark band to r 9.2, a brighter core to r 6.6), the subject lit top-left with a cool right rim and coloured outlines, one accent per loop.
- Frame 0 is the rest pose; the HUD shows frame 0 while a skill recharges, so a recharging icon is calm.
- The accent: skill-1 icons play theirs in frames 3–14, skill-2 icons in frames 15–23.
  The two icons in a hero's HUD and select card therefore take turns instead of glinting together.
- Slots: drawn for a dark bevelled slot. 30 × 30 in the HUD (3 px padding), 32 × 32 on the select screen (4 px padding); the cooldown sweep covers the 24 × 24 icon.

| Skill | Subject | Backlight | Accent |
| --- | --- | --- | --- |
| FULL-STACK ATTACK | Three stacked discs (cyan front-end, violet back-end, amber database) firing their layers as one beam | violet | A data packet races down each beam in turn, then the top disc glints |
| AGENT SUMMON | The drone itself: pearl dome, dark visor, two cyan eyes, rotor, status light, tool arm, thruster | cyan | It wakes: the rotor spins up, it lifts a pixel, blinks |
| UX ELIXIR | A round flask of magenta elixir with a cork and a heart in the liquid | mint | A bubble rises, the surface sways, the glass glints |
| POWER CHORD | The Olympic White Strat from the room: double cutaway, mint guard, three single-coils, rosewood board, six-in-line headstock | sound violet | The strings flash and three sound arcs roll out of the body |
| NORTH STAR | A faceted four-point gold star, its long needle pointing north | night blue | It turns once on its north-south axis, then the core glints |
| CHURN SHIELD | A glossy soap bubble with a heart inside | teal | The iridescent streaks slide round the rim and the heart beats |

## FULL-STACK ATTACK

Gameplay (`src/game/skills/fullStackAttack.ts`): the beam lasts 0.6 s (36 f), grows over 0.08 s (5 f) and fades over the last 0.15 s (9 f); every customer in line is hit (3 damage) on the first update it overlaps, and the cast shakes the camera (2 px, 0.25 s).

| f | Beat |
| --- | --- |
| 0–2 | Wind-up: `fx-beam-muzzle` `charge` 3 @ 60 at the `hand` anchor. Three sparks (one per layer) arrive from behind the hand; at f2 the port flares with eight rays. |
| 0–4 | Release: the beam front travels from the hand to the view edge, ease-out-cubic over 5 frames (code). The tiles play `fx-beam` `open` 5 @ 60: a 3 px tracer, the back-end alone, three thin layers, a 21 px overshoot, settle. `fx-beam-tip` `grow` rides the front. |
| 5–26 | Effect: `fx-beam` `sustain` 4 @ 20 and `fx-beam-muzzle` `sustain` 4 @ 20. The three `fx-beam-data` tracks scroll through their layers at 4, 3 and 2 px per frame (front-end fastest, the database heaviest). |
| hits | When the front first reaches a customer (front x ≥ customer centre − 6): `fx-beam-hit` `pierce` 10 @ 30 on the customer, on the beam's centre line, mirrored with the beam. Code throws 4–6 `fx-bits` glyphs forward (60–140 px/s, ±40°, life 0.25–0.4 s, `bright` then `dim` for the last third). |
| 27–35 | Dissipate: `fx-beam` `collapse` 7 @ 40: the glow drops, the outer layers thin, break into dashes and dots, the back-end core goes last. `fx-beam-muzzle` `collapse` 5 @ 30: a ring and three exhaust bits. |

- Layer: `front`. The beam is drawn over the customers it pierces and starts in front of the hero's hand.
- Code: tile `fx-beam` frames every 16 px from the hand to the view edge (clip the last tile), the front position, which frame plays, the data scroll offsets, the bit particles.
  The beam's centre line is the `hand` anchor's y; the tile origin (0, 14) sits on it.
- Busy screen: cyan and amber keylines plus ink separators give the beam a hard edge on light skies; the white back-end core carries it at night.
- Reduced motion: replace `open` frame 3 (overshoot) with `sustain` frame 0, hold `sustain` on frame 0, scroll data at half speed, start `pierce` at frame 1.
- Gameplay hits stay where they are (the 14 px band at feet − 24); the visual centre line follows the new pose's hand.

## AGENT SUMMON

Gameplay (`agentSummon.ts`, `DroneShot.ts`): the drone lives 8 s, orbiting the hero once every 1.6 s on an ellipse 22 × 6 px, 22 px above the body centre; it is behind the hero while `sin(angle) < 0`.
It first fires at 0.35 s, then every 0.55 s at the nearest customer on screen within 280 px; shots fly at 250 px/s for at most 0.8 s.

| t | Beat |
| --- | --- |
| 0–0.43 s | Summon: `fx-drone` `summon` 13 @ 30 at the drone's orbit position (it materialises while it moves): a spark, a ring, a scanline printing a cyan wireframe top to bottom, a cyan flash, then it boots (eyes off, half, open). Optional code tether: a 1 px dotted `CYAN[3]` line from the hand to the drone for the first 12 frames. |
| 0.43–7.0 s | Hover: `hover` 24 @ 15 (exactly one 1.6 s orbit) on the near half, `hover-far` on the far half at the same frame index, so the swap is seamless. Rotor, thruster, a 1 px bob and one blink per orbit are in the frames. |
| each shot | `fire` 6 @ 30, mirrored towards the target: eyes flash, muzzle flash at the tool arm, two pixels of recoil, a satisfied blink. The shot spawns where gameplay spawns it (the drone centre). |
| in flight | `fx-drone-shot` `fly` 4 @ 20; afterimages at the shot's positions 2, 4 and 6 frames ago with `trail` frames 0, 1, 2 (frame 3 when it dies unspent). |
| hits | `fx-drone-impact` `impact` 7 @ 30 at the hit point. |
| 7.0–7.73 s | Last second: `powerdown` 4 @ 8, the status light turns red, the eyes dim, the rotor slows. It replaces the gameplay blink. |
| 7.73–8.0 s | `dissolve` 8 @ 30: eyes close and a scanline lifts the drone away as cyan dust. |

- Layer: `behind` or `front` by orbit half (gameplay already decides); shots and impacts `front`.
- At the new scale the orbit runs at chest height, so the front pass crosses the torso and never the face.
- Busy screen: the pearl body with its dark outline reads on both skies; shots are cyan with a dark keyline and a dithered halo.
- Reduced motion: no change needed (nothing large flashes); optionally hold `powerdown` on frame 0.

## UX ELIXIR

Gameplay (`uxElixir.ts`): for 6 s customers walk at 0.35 speed, stop shouting and are won over in one hit; the classic flask shows for 0.7 s; every 0.18 s each customer gives off sparkles.

| f / t | Beat |
| --- | --- |
| f0–9 | Cast: `fx-potion` `appear` 5 @ 30 at the `hand` anchor (a glint, a white pop, the bottle). |
| f10–17 | It floats up to the lips (code: ease-out-back over 8 frames) playing `uncork` 4 @ 20; the cork pops off with a ring of fizz. Lips: a `mouth` anchor if the hero pose provides one, otherwise (x + 6 · facing, feet − 46). |
| f18–41 | Drink: `drink` 8 @ 20 at the lips, mirrored so the neck tips towards the face. It tips 45°, lies on its side and pours while the elixir drains; the liquid surface stays level because liquid and highlights are painted in screen space. |
| f22 | Understanding lands: `fx-elixir-burst` `aha` 8 @ 30 at the top of the head. The calm wave starts and `fx-elixir-aura` `rise` 6 @ 20 plays between the feet. |
| f42–65 | Follow-through: the empty bottle tumbles away behind the hero on a short arc (code: 34 px back, up 20 px and down, 0.4 s) playing `tumble` 8 @ 20, then `poof` 6 @ 20. |
| wave | Code: a ring from the hero's centre growing 7 px per frame (420 px/s) in three bands, `CALM[5]`, `CALM[3]` and a dithered `MINT[3]`, until it leaves the screen. |
| 0.3–5.6 s | Effect: `fx-elixir-aura` `loop` 8 @ 10 at the feet. Each customer the wave has reached wears `fx-calm` `heart` 8 @ 8 four pixels above its head. The gameplay sparkles become `fx-calm` `mote` 6 @ 12 rising at 20 px/s. |
| 5.6–6.0 s | Dissipate: `fx-elixir-aura` `fade` 4 @ 12; every heart plays `heart-pop` 6 @ 20. |

- Layer: the wave and the aura `behind`; the potion, the burst, hearts and motes `front`.
- Busy screen: the potion has a dark glass outline; hearts use the darkest heart tone as outline so they hold on the golden-hour sky; the wave is thin and behind every body.
- Reduced motion: skip `appear` frame 1 (white pop) and `aha` frame 0, draw the wave as a single band at half speed, hold the aura on `loop` frame 0.

## POWER CHORD

Gameplay (`powerChord.ts`): the strum stuns every customer on screen for 3 s and pops every complaint bubble on the frame of the cast, shakes the camera (4 px, 0.35 s) and flashes white for 0.08 s.
Its visual lasts 0.5 s: three rings at 0, 0.07 and 0.14 s growing to 300, 260 and 220 px over 0.45 s, and two wave fronts racing along the ground at 520 px/s.

| f / t | Beat |
| --- | --- |
| f0–17 | The strum: `fx-strum` `strum` 9 @ 30 at the strum point (Artsy's `hand` anchor at the guitar body): a flare with eight rays, a ring, three sound arcs thrown forward, amp sparks. |
| f0–30 | Shockwave (code): three midpoint rings from the hero's centre, radius = R · ease-out-cubic(age / 0.45), 3 px thick until 40 % of the way, 2 px until 75 %, then 1 px; bands white, `SOUND[4]`, `SOUND[3]` (the middle ring `SOUND[5]`, `SOUND[3]`, `SOUND[2]`). |
| f0–30 | Crests: `fx-wavefront` `crest` 4 @ 20 on the feet line at origin ± 520 px/s, mirrored for the left-going wave, until each leaves the view. |
| f0–54 | Notes: code launches six `fx-notes` particles from the strum point, alternating `eighth` and `beamed`, one every 2 frames, in an upward fan (−70° to −20° from the facing direction, 60–90 px/s, gravity 60 px/s², life 0.9 s), frame by age at 12 fps. |
| stun | When the first ring reaches a customer (distance / 520 s after the cast) its crown appears: `fx-stun` `orbit` 12 @ 12 above the head (origin on the head top), three stars and a note circling, the far ones smaller and dimmer. The last 0.5 s of the 3 s stun plays `fade` 6 @ 12. |

- Layer: rings `behind` (so they never draw over a face); strum, crests, notes and crowns `front`.
- Busy screen: rings are thin and short-lived and lead with white; stars are gold with a dark keyline on any sky.
- Reduced motion: start `strum` at frame 2 (skipping the two brightest flare frames), draw one ring 1 px thick, play `orbit` at 6 fps.

## NORTH STAR

Gameplay (`northStar.ts`, `HomingStar.ts`): the star spawns at (x + 8 · facing, feet − 30) moving up and forward, then homes on the most frustrated customer at 200 px/s, turning at most 6.5 rad/s; it lives 2.6 s and hits for 4.

| f / t | Beat |
| --- | --- |
| f0–13 | Launch: `fx-star-launch` `launch` 7 @ 30 at the `hand` anchor, a pillar of light shooting north and a ring. `fx-star` `spawn` 4 @ 30 on the star: a twinkle, small, overshoot, full. |
| flight | `spin` 8 @ 15 (one half turn per loop): the star turns about its north-south axis, the side spikes foreshortening to an edge-on glint and back, so it never loses its north. Every second frame code drops an `fx-star-trail` sparkle at the star's position; each plays `twinkle` 6 @ 20, cooling from white gold to night blue (about nine alive at once). |
| hit | `fx-star-impact` `impact` 11 @ 30 at the target's centre: a north-long four-point flare with a night rim, a gold ring, eight sparkles flying out. It replaces `BURSTS.starImpact`. |
| expired | `fizzle` 6 @ 20 where the star dies unspent. |

- Layer: `front` (it is a shot).
- Busy screen: the star's dithered night-blue rim separates gold from San Francisco's gold sky; on Berlin's night the gold carries itself.
- Reduced motion: start `launch` at frame 2 and `impact` at frame 2 (skipping the brightest flares), `spin` at 8 fps.

## CHURN SHIELD

Gameplay (`churnShield.ts`): 5 s of no damage; customers touching a 20 px circle around (x, feet − 15) calm down by 1.5, at most once per 0.6 s each; the classic bubble blinks in its last 0.8 s.
Visually the bubble is centred on the new body, (x, feet − 30), with a 33.5 px radius.

| f / t | Beat |
| --- | --- |
| f0–15 | Form: `fx-bubble` `form` 8 @ 30. It inflates from the `hand` anchor (code moves the sprite to the body centre over the first 12 frames), overshoots with a white rim, squashes and settles. |
| 0.27–4.2 s | Effect: `shell` 12 @ 10: the bubble wobbles a pixel and its iridescent film slides 30° a frame; specular upper-left, cool reflection lower-right, nothing inside. |
| bump | On each gameplay bump: `fx-bubble-bump` `bump` 8 @ 30 at the rim point facing the customer, (centre x ± 33, centre y), mirrored for the left. The film dents and flashes white, ripples run up and down the rim, droplets push back out. The customer gets `fx-shield-calm` `puff` 8 @ 12 above its head: a heart in a tiny bubble that floats up and pops. |
| 4.2–4.73 s | Warning: `thin` 2 @ 10, alternating a dim rim and a dotted rim. It replaces the gameplay blink. |
| 4.73–5.0 s | Dissipate: `pop` 8 @ 30: a big wobble, a white snap, the film tearing into arcs that fly apart, then falling droplets. It plays inside the last 0.27 s so it finishes when the skill does. |

- Layer: `front`; the bubble is hollow and the specular avoids the face.
- Busy screen: a bright rim over a teal band reads on both skies; the iridescent film is a dithered inner band.
- Reduced motion: skip `form` frame 4 (white rim) and `pop` frame 2 (white snap), hold `thin` on frame 0, start `bump` at frame 1.

## Asset index

| Skill | File | Frame | Origin | Animations (frames @ fps) |
| --- | --- | --- | --- | --- |
| full-stack-attack | `icon` | 24×24 | 0, 0 | `idle` 24 @ 12 loop |
| | `fx-beam` | 16×28 | 0, 14 | `open` 5 @ 60, `sustain` 4 @ 20 loop, `collapse` 7 @ 40 |
| | `fx-beam-data` | 32×5 | 0, 2 | `front-end`, `back-end`, `database` (one tileable frame each) |
| | `fx-beam-muzzle` | 32×40 | 10, 20 | `charge` 3 @ 60, `sustain` 4 @ 20 loop, `collapse` 5 @ 30 |
| | `fx-beam-tip` | 24×28 | 0, 14 | `grow` 3 @ 30 loop |
| | `fx-beam-hit` | 40×40 | 20, 20 | `pierce` 10 @ 30 |
| | `fx-bits` | 5×7 | 2, 3 | `bright`, `dim` (8 glyphs each: 0 1 < { } ; = and a database) |
| agent-summon | `icon` | 24×24 | 0, 0 | `idle` 24 @ 12 loop |
| | `fx-drone` | 32×32 | 16, 16 | `summon` 13 @ 30, `hover` 24 @ 15 loop, `hover-far` 24 @ 15 loop, `fire` 6 @ 30, `powerdown` 4 @ 8 loop, `dissolve` 8 @ 30 |
| | `fx-drone-shot` | 12×12 | 6, 6 | `fly` 4 @ 20 loop, `trail` 4 @ 30 |
| | `fx-drone-impact` | 24×24 | 12, 12 | `impact` 7 @ 30 |
| ux-elixir | `icon` | 24×24 | 0, 0 | `idle` 24 @ 12 loop |
| | `fx-potion` | 20×20 | 10, 10 | `appear` 5 @ 30, `held` 4 @ 8 loop, `uncork` 4 @ 20, `drink` 8 @ 20, `tumble` 8 @ 20 loop, `poof` 6 @ 20 |
| | `fx-elixir-burst` | 32×32 | 16, 16 | `aha` 8 @ 30 |
| | `fx-elixir-aura` | 48×16 | 24, 11 | `rise` 6 @ 20, `loop` 8 @ 10 loop, `fade` 4 @ 12 |
| | `fx-calm` | 16×16 | 8, 15 | `heart` 8 @ 8 loop, `heart-pop` 6 @ 20, `mote` 6 @ 12 |
| power-chord | `icon` | 24×24 | 0, 0 | `idle` 24 @ 12 loop |
| | `fx-strum` | 40×40 | 20, 20 | `strum` 9 @ 30 |
| | `fx-wavefront` | 16×48 | 8, 47 | `crest` 4 @ 20 loop |
| | `fx-stun` | 32×16 | 16, 15 | `orbit` 12 @ 12 loop, `fade` 6 @ 12 |
| | `fx-notes` | 12×12 | 6, 6 | `eighth` 6 @ 12, `beamed` 6 @ 12 |
| north-star | `icon` | 24×24 | 0, 0 | `idle` 24 @ 12 loop |
| | `fx-star` | 24×24 | 12, 12 | `spawn` 4 @ 30, `spin` 8 @ 15 loop, `fizzle` 6 @ 20 |
| | `fx-star-trail` | 9×9 | 4, 4 | `twinkle` 6 @ 20 |
| | `fx-star-launch` | 32×48 | 16, 34 | `launch` 7 @ 30 |
| | `fx-star-impact` | 48×48 | 24, 24 | `impact` 11 @ 30 |
| churn-shield | `icon` | 24×24 | 0, 0 | `idle` 24 @ 12 loop |
| | `fx-bubble` | 76×76 | 38, 38 | `form` 8 @ 30, `shell` 12 @ 10 loop, `thin` 2 @ 10 loop, `pop` 8 @ 30 |
| | `fx-bubble-bump` | 24×40 | 12, 20 | `bump` 8 @ 30 |
| | `fx-shield-calm` | 16×24 | 8, 23 | `puff` 8 @ 12 |

## Phase B notes and open questions

- Shots and their impacts: NORTH STAR's star and AGENT SUMMON's packets are `Shot`s that draw themselves, and their impacts are world effects created from `ShotImpact`.
  The hibit look needs the foundation's skill visual to cover them (draw the shot, its trail and its impact), not only the skill's own `render`.
- Who draws the status motifs: today the customer renderer draws the calm heart under UX ELIXIR, and the current customer sheet has stun stars in `stunned`.
  With these effects the skill should own the crown and the hearts, and the customer's `stunned` pose should show a dizzy face without stars, or they double up.
- Gameplay geometry was tuned for 40 px sprites: the shield bumps at 20 px around feet − 15 while the bubble that wraps a 58 px hero has a 33.5 px radius, so customers will visually enter the bubble before they bump it.
  Recommendation: scale the shield's gameplay circle with the art (33 px around feet − 30); the beam band and hitboxes are worth the same review.
  Gameplay stays as it is until someone decides.
- End beats inside the duration: the drone's dissolve, the shield's pop and the elixir's fade play inside each skill's last fraction of a second, because a skill stops rendering when it reports `done`.
- Anchors from the hero crew: the effects need the `hand` anchor on `skill` (beam start, potion, strum point, star launch, bubble origin).
  A `mouth` anchor on Artsy's `skill` would let the potion meet his lips exactly; without it the spec above estimates the lips from the body.
