# Arcade look · the six skills

The `arcade` look of every skill: a 24 × 24 icon and the sprite strips its in-game effect is built from, plus the motion spec below that turns them into the effect.
It is Neo Geo / Metal Slug sensibility at the new hero scale (54–60 px heroes in 64 × 64 frames): chunky high-contrast shapes, white impact frames, stepped-band glows instead of blur, and one bold energy colour per skill.
Gameplay is untouched: every duration, speed and hit test below is read from `src/game/skills/*` and `src/content/characters.ts`, and the effects are timed to them.

This document is the Phase B blueprint: what each sprite is for, when it plays, where it attaches, what it is drawn in front of, and what code draws instead of a sprite.

## Files

```
src/game/art/looks/arcade/skills/<skillId>/
  icon.png + icon.json            24 × 24, one 16-frame "idle" loop
  fx-<name>.png + fx-<name>.json  effect strips (ASSETS.md format)
tools/looks/arcade/skills/
  build.py                        writes every PNG + JSON above; --check verifies the committed files
  review.py                       review renders: icons in their slots, contact sheets, key frames in both levels
  pixkit/                         the pixel kit: canvas and shapes, palette, sheet packing, Biome-shaped JSON, review stages
  skillart/                       one module per skill (icon + strips), the shared icon frame, shared motifs
  tests/                          the asset contract, freshness, and the pixel kit
```

```sh
python3 tools/looks/arcade/skills/build.py            # rebuild all six (or name skill ids)
python3 tools/looks/arcade/skills/build.py --check    # fail if a committed file is stale
python3 tools/looks/arcade/skills/review.py icons strips scenes
python3 -m unittest discover -s tools/looks/arcade/skills -t tools/looks/arcade/skills
```

Every pixel is drawn by code: hand-written character grids for the subjects that need a hand (the drone, the icon's flask, the Strat, hearts, notes) and parametric drawing for the rest (beam bands, bursts, rings, the tilting flask, the faceted star).
No image generation was used, so there are no raw sources; `tools/art/prompts/looks-arcade-skills.md` records that.
The build is deterministic and the freshness test compares a fresh build with the committed files pixel for pixel.

### Inventory

All origins are the point placed on the entity or anchor position; all sheets face right and are flipped for left.

| Skill | Strip | Frame | Origin | Animations (frames @ fps, ⟳ loops) |
| --- | --- | --- | --- | --- |
| FULL-STACK ATTACK | `fx-beam` | 16 × 24 | 0, 11 | `fire` 4 @ 30 ⟳, `collapse` 5 @ 30 |
| | `fx-beam-head` | 24 × 24 | 0, 11 | `head` 3 @ 30 ⟳ |
| | `fx-muzzle` | 32 × 32 | 16, 16 | `charge` 3 @ 30, `charge-calm`, `flare` 4 @ 20 ⟳, `smoke` 6 @ 15 |
| | `fx-hit` | 48 × 48 | 24, 24 | `hit` 7 @ 30, `hit-calm` |
| | `fx-bits` | 8 × 8 | 4, 4 | `variants` 8 (one glyph per frame: `<` `>` `{` `}` `0` `1` `/` `;`) |
| AGENT SUMMON | `fx-drone` | 32 × 32 | 16, 16 | `summon` 8 @ 20, `summon-calm`, `hover` 12 @ 12 ⟳, `expiring` 4 @ 12 ⟳, `fire` 4 @ 24 (anchor `muzzle`), `dismiss` 7 @ 20, `dismiss-calm` |
| | `fx-drone-shot` | 13 × 13 | 6, 6 | `fly` 4 @ 20 ⟳, `trail` 3 @ 20 |
| | `fx-drone-zap` | 32 × 32 | 16, 16 | `hit` 6 @ 30, `hit-calm` |
| | `fx-summon-circle` | 48 × 16 | 24, 8 | `open` 7 @ 20 |
| UX ELIXIR | `fx-potion` | 28 × 28 | 14, 14 (the grip) | `appear` 3 @ 30, `appear-calm`, `hold` 2 @ 8 ⟳, `drink` 6 @ 20 (anchor `lip`), `pop` 5 @ 20, `pop-calm` |
| | `fx-glint` | 17 × 17 | 8, 8 | `twinkle` 6 @ 20 |
| | `fx-calm` | 24 × 24 | 12, 12 | `touch` 6 @ 20, `wave` 4 @ 8 ⟳, `sparkle` 5 @ 15 |
| | `fx-aura` | 48 × 16 | 24, 10 (on the street) | `ground` 4 @ 6 ⟳, `bubble` 6 @ 12 |
| POWER CHORD | `fx-strum` | 48 × 48 | 24, 24 | `strum` 8 @ 30, `strum-calm` |
| | `fx-wave` | 32 × 48 | 16, 48 (on the street) | `travel` 4 @ 30 ⟳ |
| | `fx-sound-hit` | 40 × 40 | 20, 20 | `hit` 6 @ 30, `hit-calm` |
| | `fx-notes` | 12 × 12 | 6, 6 | `variants` 6 (eighth and beamed notes in pink, cyan, gold) |
| NORTH STAR | `fx-star` | 24 × 24 | 12, 12 | `spin` 8 @ 15 ⟳, `launch` 3 @ 30, `launch-calm` |
| | `fx-star-trail` | 12 × 12 | 6, 6 | `sparkle` 6 @ 20 |
| | `fx-star-lock` | 32 × 32 | 16, 16 | `lock` 4 @ 12 ⟳ |
| | `fx-star-impact` | 48 × 48 | 24, 24 | `burst` 9 @ 30, `burst-calm` |
| CHURN SHIELD | `fx-shield` | 88 × 88 | 44, 44 (the bubble's centre) | `form` 6 @ 30, `hold` 8 @ 12 ⟳, `wobble` 4 @ 15 ⟳, `pop` 7 @ 30, `pop-calm` |
| | `fx-shield-bump` | 32 × 48 | 6, 28 (the touch point on the film) | `bump` 6 @ 30 |

`variants` strips are particle sprites: code picks a frame per particle and draws it with `time = index / fps`; they do not animate.

## The shared language

### Palette

One near-black ink (`#120e24`) and one white are shared by everything; each skill owns one energy ramp (`tools/looks/arcade/skills/pixkit/palette.py`).
Every ramp runs deep → dark → mid → light → pale and is hue-shifted the Neo Geo way: shadows lean cool and violet, highlights lean warm.

| Skill | Energy colour | Ramp (deep → pale) | Supporting colours |
| --- | --- | --- | --- |
| FULL-STACK ATTACK | front-end cyan, back-end violet, database gold | `#1b1f5e #1d5fb8 #22a8f0 #6fe8ff #d4fff8` · `#2a0f4f #6123a8 #a24ee8 #d79bff #f7ddff` · `#5a1f0a #b5470c #f08c14 #ffd23a #fff6b8` | smoke `#2e2638 … #ece6ee` |
| AGENT SUMMON | agent cyan | as above | white shell `#262a4a … #ffffff`, visor `#18163a`, gold hub |
| UX ELIXIR | elixir pink | `#4a0c3c #a3156a #e8379a #ff86c8 #ffd9ef` | glass `#25305c … #ffffff`, cork wood |
| POWER CHORD | sound lavender | `#2a1f6a #5a48c8 #a99cf0 #dcd4ff #f4f0ff` | gold bolt and stun stars, notes in Artsy's paint colours, the Strat's cream, mint, rosewood and maple |
| NORTH STAR | guiding gold | the gold ramp above | — |
| CHURN SHIELD | retention teal | `#0c2f4a #12769a #2fc4d8 #8ff4ec #e2fff8` | soap film lavender and pink, heart red `#a8163e #f03a5c #ff8aa2` |

The three Hackerman/Artsy/Strategy pairs never share a lead colour, so a glance at the HUD tells the two skills apart.

### Light, outlines and glows

- Light comes from the top-left: lit facets, window reflections and speculars sit top-left; shadow sides are bottom-right.
- Solid objects (the drone, the flask, notes, hearts, glyph bits) wear the shared 1 px ink outline so they read on both levels.
- Light itself (beams, flashes, rings, sparks) is never ink-outlined: it is built from a white core out through its ramp to a deep rim (a selective outline), which keeps it luminous.
- Glows are stepped bands, never blur: the icon's glow is two bands that follow the subject's silhouette; the star wears a warm rim and a deep halo; the bubble's film has a dark edge.
- No sprite has a semi-transparent pixel; dissolving smoke breaks into smaller clumps instead of fading.

### Impact frames and calm twins

Releases and hits open on a white impact frame (Metal Slug), held for two ticks.
Every animation with one has a `-calm` twin of the same length and fps in which that frame is replaced by its neighbour; anchors follow their frames.
Under reduced motion, play the twin (`reducedMotion ? 'hit-calm' : 'hit'`) and nothing else needs to change.
The arcade look adds no screen shake and no full-screen flash of its own; the shakes and flashes the skills already request go through `SkillWorld`, which ignores them under reduced motion.

### Timing grammar

All times are in ticks of the 60 Hz simulation.

- Impacts and releases run at 30 fps (2 ticks a frame): fast enough to snap, slow enough to see each frame.
- Loops sit at 12–15 fps (4–5 ticks a frame): the classic sprite-animation hold.
- Anything that moves through space (beam length, orbits, paths, particles, rings) is code at 60 Hz, quantised to whole pixels.
- The hero's `skill` pose lasts 24 ticks (`player.strike('skill', 0.4)`); cast moments are timed inside it and anything later detaches from the hand.

### Sprite or code

Hand-made pieces are sprites: subjects, bursts, impact frames, smoke, dissolves, the beam's cross-section and the shield's film.
Motion that code does better stays in code: the beam's length and tiling, the drone's orbit, every path and trail placement, particle fields (glyph bits, notes, sparkles), screen-wide rings that grow in whole-pixel steps, target selection for the star's lock, flipping by facing, and every timing decision.

## Icons

Each icon is the same three layers, which is what makes the six read as one set:

1. a midnight dome (`#0f0d26`, lit half `#19193f`, rim `#2b2d68` / `#4c4e9a` on the top-left);
2. a two-band glow in the skill's own colour (its dark then deep tone) hugging the subject's silhouette;
3. the subject, ink-outlined and lit from the top-left, breaking out of the dome where it wants to (rotor, headstock, beams).

| Skill | Subject | Idle motion (on top of the shared glint) |
| --- | --- | --- |
| FULL-STACK ATTACK | the stack: three slabs (front-end, back-end, database) each firing its beam into one white hit spark | a data pulse runs out along each beam; the spark breathes |
| AGENT SUMMON | the drone itself, the same sprite as in play | rotor spins, hover bob, one blink, thruster flicker |
| UX ELIXIR | a round-bottomed flask of pink elixir, cork and glass highlight | a bubble rises; the drinking glint winks on the shoulder |
| POWER CHORD | the Olympic White Strat at 45°: cream body, mint guard, three single coils, rosewood board, six-in-line headstock, and a gold bolt of power | sound rings roll off the strings |
| NORTH STAR | a faceted gold four-point star, taller than wide like a compass north, with its homing trail | the heart flares once; trail sparkles twinkle |
| CHURN SHIELD | a soap bubble holding a heart: the relationship it protects | the film's colours turn; the heart beats once |

The loop is 16 frames at 8 fps (2 s).
Frame 0 is the clean rest pose, which matters because the HUD freezes on it while a skill cools down.
On frames 10–13 a diagonal glint sweeps every icon top-left to bottom-right; the select screen and HUD show both of a hero's skills at once and the glints cross them together.

The slots must grow with the icons: a 24 px icon needs a 32 × 32 bevelled slot (4 px bevel) in the select screen (today 24) and in the HUD (today 22), and `drawCooldownSweep` should be called with size 24.

## FULL-STACK ATTACK

**In play** (`fullStackAttack.ts`): a 0.6 s (36-tick) beam from the hand (`caster.x + facing × 10`) to the edge of the view, hit band `feet − 24 … feet − 10`; it grows for 0.08 s, shrinks for the last 0.15 s, and hits every customer in the band once (3 damage) on its first tick; `shake(2, 0.25)` on cast.

| Ticks | On screen | Sprite | Code | Layer |
| --- | --- | --- | --- | --- |
| 0–5 | Charge at the hand: three sparks rush in, a white impact frame, a tri-colour starburst | `fx-muzzle/charge` | at the `hand` anchor | front |
| 0–4 | The beam races to the screen edge, the back-end layer as the spearhead and a shock front ahead of it | `fx-beam/fire` tiles + `fx-beam-head/head` at the leading end | length = reach × min(1, age / 0.08) | front |
| 1–5 | Each customer in the line is hit as the head reaches it: white star, tri-colour burst, torn ring, shards, twinkles | `fx-hit/hit` (14 ticks) at the customer's centre on the beam line | delay each hit by distance / reach × 5 ticks; throw 4–6 `fx-bits` | effects |
| 6–26 | The full beam hums: data pulses race out along each layer, the rims buzz | `fx-beam/fire` loop, `fx-muzzle/flare` loop | tile segments from the hand to the edge | front |
| 27–36 | It collapses: the outer layers thin and break first and it dies on the back-end core | `fx-beam/collapse` (10 ticks) | — | front |
| 27–50 | The spent hand smokes: a puff rises, splits and breaks up | `fx-muzzle/smoke` (24 ticks) | spawn as an effect at the hand so it outlives the skill | effects |

**Placement.**
Segments are laid from the hand: segment `i` at `x = hand.x + i × 16` (facing right) or flipped at `hand.x − (i + 1) × 16` (facing left), the last one clipped to the view.
The muzzle sits on the `hand` anchor; the beam runs level with it, clamped to `feet − 34 … feet − 18` so it always crosses the customers' torsos even if the pose raises the keyboard (the 32 px muzzle burst covers the step between hand and beam).
The gameplay band stays the hit test.
The glyph bits fly back and up from each hit (speed 60–120 px/s, angle −150°…−100° mirrored by facing, gravity 300 px/s², life 0.4–0.6 s), blinking out over the last quarter.

**On a busy screen.**
Three saturated bands with near-white cores and deep seams between them are the brightest, most graphic thing on screen, and the seams keep the three layers apart over Berlin's neon and Luna's pastel facades.
The band is 19 px of a 56 px customer, so heads and legs stay visible; it is gone in 0.6 s.

**Reduced motion.** `charge-calm`, `hit-calm`; hold `fire` on frame 0 instead of looping (no buzz); no shake (already ignored).

## AGENT SUMMON

**In play** (`agentSummon.ts`): a drone orbits for 8 s (480 ticks) at `caster.x ± 22`, `caster.y − 22 ± 6` (one orbit per 1.6 s), drawn behind the hero on the far half; it fires a `DroneShot` (250 px/s, 0.8 s) at the nearest on-screen customer at 0.35 s and then every 0.55 s.

| Ticks | On screen | Sprite | Code | Layer |
| --- | --- | --- | --- | --- |
| 0–23 | A column of light at the drone's spot; the drone prints in scanline by scanline, flashes white, lands with a squash and a stretch; a summoning circle opens beneath | `fx-drone/summon`, `fx-summon-circle/open` (21 ticks) | the circle stays where the summon began, 12 px under the drone | drone per orbit half, circle behind |
| 24–419 | It hovers: rotor spinning, a slow bob, a blink a second | `fx-drone/hover` (1 s loop) | the orbit moves it | behind on the far half, front on the near half |
| 21, then every 33 | It fires: eyes flare white, recoil, a cyan muzzle flash on the `muzzle` anchor | `fx-drone/fire` (10 ticks), then back to `hover` | flip to face the target while firing; the shot itself starts at the drone's centre (gameplay) and clears the visor within two ticks | as the drone |
| shot flight | A cyan plasma bolt with three afterimages | `fx-drone-shot/fly`; `trail` frames 0–2 | trail frames at the shot's positions 2, 4 and 6 ticks ago | front |
| on a hit | A white pop and a crackle of static | `fx-drone-zap/hit` (12 ticks) | at the shot's last position | effects |
| 420–458 | Battery low: the eyes blink amber and the thruster sputters | `fx-drone/expiring` | replaces today's last-second blink | as the drone |
| 459–479 | It warps out: white, squeezed to a line, a sparkle, gone exactly at 8 s | `fx-drone/dismiss` (21 ticks) | — | as the drone |

**On a busy screen.**
The drone is the only white object in either level and is ink-outlined; the black visor and cyan eyes give it a face at 22 px.
Shots are small but white-hot with cyan spikes that read at any angle.

**Reduced motion.** `summon-calm`, `dismiss-calm`, `fx-drone-zap/hit-calm`; hold `expiring` on frame 0 (steady amber eyes, no blinking).

## UX ELIXIR

**In play** (`uxElixir.ts`): for 6 s (360 ticks) customers move at 0.35× speed, stop shouting and are won over in one hit; today a flask pops over the head for 0.7 s and pink sparkles rise from every customer every 0.18 s.
The calm heart over each calmed customer belongs to the customer: the shared customer renderer draws it whatever calmed them, so the elixir draws its own marks around it and never a heart over a head.

| Ticks | On screen | Sprite | Code | Layer |
| --- | --- | --- | --- | --- |
| 0–5 | The potion pops into his hand | `fx-potion/appear` | at the `hand` anchor | front |
| 6–23 | He drinks: the flask tips to his lips while the elixir stays level and drains into the neck | `fx-potion/drink` (18 ticks) | lip to `mouth` (see below) | front |
| 18–35 | The glint: it clicks | `fx-glint/twinkle` (18 ticks) | at the `mouth` anchor, 6 px up (the glasses) | front |
| 24–38 | The empty flask pops into pink smoke and a little heart: understanding, absorbed | `fx-potion/pop` (15 ticks) | where the flask last was (the pose has ended) | front |
| 24–54 | Calm rolls out along the street | — | stepped pink ellipse rings at the hero's feet: rx 0 → 340 px in 0.5 s (easeOutCubic), ry = rx × 0.16; three 1 px bands (`#ff86c8`, `#e8379a`, `#a3156a`) 3 px apart | behind |
| ring arrival | As the ring reaches each customer: a soft pink ring blooms round their chest and breaks into sparkles | `fx-calm/touch` (18 ticks) | at the customer's chest when the ring's rx passes their distance | front |
| arrival – 360 | Each customer breathes calm where its steam would be; sparkles drift off it | `fx-calm/wave` beside the head, `fx-calm/sparkle` | the wave on the side away from the hero; one sparkle per customer every 0.36 s drifting up 12 px/s | front |
| 24–360 | The elixir still working in him: a pink glow breathing at his feet, bubbles rising off it | `fx-aura/ground` (loop), `fx-aura/bubble` | the ground glow follows his feet; a bubble every 0.4 s at ±12 px round his feet | behind |
| 330–360 | It wears off: the glow and the waves stop, one last sparkle per customer | `fx-calm/sparkle` | — | front |

**Lips to the mouth.**
Artsy's `skill` pose carries a `mouth` anchor (frame pixels, per frame) as well as `hand`.
Each `drink` frame carries a `lip` anchor: the tip of the flask's neck.
While drinking, place the flask so that `lip` lands on `mouth` (origin = mouth − (lip − origin)), so the elixir meets his lips whatever the pose; outside `drink` it sits on `hand`.
The frames tip the neck towards the upper left, which is right for a mouth up and to the left of the hand; when the mouth is to the right of the hand (after the facing flip), draw them mirrored.
Without a `mouth` anchor, estimate one 10 px below the hero's top at the head's centre.

**On a busy screen.**
Pink is the only pink in either level's play plane; the marks on customers are small and sit beside heads and chests, never over faces, and leave the head clear for the customer's own calm heart.

**Reduced motion.** `appear-calm`, `pop-calm`; draw the calm ring as a single band; hold `fx-aura/ground` on frame 0.

## POWER CHORD

**In play** (`powerChord.ts`): one strum stuns every on-screen customer for 3 s (180 ticks) and pops every complaint bubble; the active skill lasts 0.5 s (30 ticks), with rings at 0, 0.07 and 0.14 s (radius 300 / 260 / 220, life 0.45 s), wave fronts at 520 px/s, `shake(4, 0.35)` and `flash('#ffffff', 0.08)`.
The dizzy stars over a stunned customer belong to the customer (its `stunned` animation draws them, whatever stunned it); the chord draws everything up to the hit.

| Ticks | On screen | Sprite | Code | Layer |
| --- | --- | --- | --- | --- |
| 0–15 | The strum: six strings flash, a white burst, a lavender burst with a ring, the ring frays into arcs and sparkles | `fx-strum/strum` (16 ticks) | at the `hand` anchor, the guitar body | front |
| 0 / 4 / 8 → +27 | The shockwave: a bold banded wavefront and two thinner echoes tear across the screen | — | see "The wavefront" below | front |
| 0–29 | Two walls of sound race along the street | `fx-wave/travel` | origins at `hero.x ± 520 px/s × t` on the feet line, the left one flipped | front |
| as the front reaches each customer | The wave slams into them: a white thump and brackets of sound bursting off both sides | `fx-sound-hit/hit` (12 ticks) | at the customer's chest, when the main ring's radius passes their distance from the strum | front |
| 2–50 | Notes fly off the strings | `fx-notes/variants` | 6–8 particles: 60–140 px/s at −160°…−20°, gravity 180 px/s², life 0.5–0.8 s, ±1 px sine wobble, blink out over the last quarter | front |

**The wavefront.**
Arcade's shockwave is punchy, not a hairline: a 10 px banded front with a white leading edge and a dark rim that carries it over Luna's bright sky.
The game draws each ring as filled annulus bands (per-row spans of the pixels whose centres lie between two whole-pixel radii), not as stacked 1 px circles, which leave speckled gaps and cost more.
Radius grows 0 → 300 (main), 260 and 220 (echoes) over 0.45 s with easeOutCubic; the banding, from the leading edge inwards, steps through four stages of the ring's life (`skillart/power_chord.py` holds the same data):

| Life | Main ring (1 px each, outside → in) | Echoes |
| --- | --- | --- |
| 0–35 % | deep · white · white · white · pale · pale · light · light · mid · dark | deep · white · pale · light · mid |
| 35–65 % | deep · white · white · pale · light · mid · dark | deep · pale · light · mid |
| 65–85 % | deep · pale · light · mid | light · mid |
| 85–100 % | light · mid, broken into 8° dashes | mid, broken into 8° dashes |

Lavender ramp: deep `#2a1f6a`, dark `#5a48c8`, mid `#a99cf0`, light `#dcd4ff`, pale `#f4f0ff`.

**On a busy screen.**
It is the loudest moment in the game and the shortest: everything is gone in half a second, and the band thins as it grows so it never sits on the screen as a wall of lavender.
The hits make the stun legible before the customer's own stars take over.

**Reduced motion.** `strum-calm`, `fx-sound-hit/hit-calm`; draw only the main ring, in its stage 2 banding throughout; the game's own flash and shake are already ignored.

## NORTH STAR

**In play** (`northStar.ts`, `HomingStar.ts`): the cast is instant; a star leaves `(caster.x + facing × 8, feet − 30)` moving up and forward, homes on the most frustrated customer (200 px/s, turning up to 6.5 rad/s) for up to 2.6 s and hits for 4.

| Ticks | On screen | Sprite | Code | Layer |
| --- | --- | --- | --- | --- |
| 0–5 | A pop of white light at the hand, then the star | `fx-star/launch` | at the shot's spawn point | front |
| 6 → hit | The star spins like a coin as it arcs and homes | `fx-star/spin` | at the shot's position | front |
| flight | A sparkle trail that tapers on its own | `fx-star-trail/sparkle` (18 ticks each) | drop one every 3 ticks at the star's position | front |
| flight | Gold brackets lock onto the chosen customer | `fx-star-lock/lock` | on `mostFrustrated(targets)` each frame, snapping when the choice changes | front |
| hit | A white star, a gold burst, a hollow star ring with four small stars flying off | `fx-star-impact/burst` (18 ticks) | at the impact point | effects |
| no target | It fizzles | one `fx-star-trail/sparkle` | at its last position | front |

**On a busy screen.**
The lock is the strategist's tell: before the star lands, the player sees which customer it chose.
The star's warm rim and deep halo make it glow on the night street and keep a crisp edge on Luna's bright sky.

**Reduced motion.** `launch-calm`, `burst-calm`; hold `spin` on frame 0 (no spin) and keep the trail.

## CHURN SHIELD

**In play** (`churnShield.ts`): no damage for 5 s (300 ticks); a customer touching a 20 px circle around `(caster.x, feet − 15)` is calmed by 1.5, at most once every 0.6 s; today the bubble blinks for the last 0.8 s.

| Ticks | On screen | Sprite | Code | Layer |
| --- | --- | --- | --- | --- |
| 0–11 | A bubble is blown up from his chest, swells past its size and settles | `fx-shield/form` | centred at `(caster.x, feet − 31)` | front |
| 12–251 | It holds: the soap film's colours turn, motes twinkle in it | `fx-shield/hold` | follows the hero | front |
| on a bump | The film dents and flashes, rings ripple out and droplets of film spray off | `fx-shield-bump/bump` (12 ticks) | origin on the film at `(centre x ± 24, customer's chest y)`, flipped on the left | effects |
| 252–285 | It wears thin: a wobble | `fx-shield/wobble` | replaces today's blink | front |
| 286–299 | It pops: the film tears into arcs, beads off, two hearts float up; done exactly at 5 s | `fx-shield/pop` (14 ticks) | — | front |

**Shape.**
The bubble is an upright capsule (48 × 62), not a 62 px ball.
The game's bump test is a 20 px circle around the hero's 12 px body box, so a customer's centre is 26 px from the hero when it bumps; at this width the customer meets the film just then, where a round bubble would let them walk half way in first.

**On a busy screen.**
Only the film is drawn, so the hero is never hidden; its dark edge carries it on Luna's light facades and its teal-to-pink film on Berlin's dark ones.

**Reduced motion.** `pop-calm`; keep the wobble (a 2 px squash, no flash).

## For Phase B

- **Slots.** 24 px icons need 32 × 32 slots in the select screen and the HUD; the cooldown sweep's size becomes 24.
- **Customer-owned indicators.** Stun stars and the calm heart belong to the customer (Phase B decision): no skill strip draws them.
- **Projectiles and impacts.** The look covers them: NORTH STAR's star, trail, lock and impact and the drone's shots, trail and zaps hang off the shots' positions, velocities and impacts (NORTH STAR's cast is instant; the drone fires real `Shot`s), not off the active skill.
- **Effects that outlive their skill.** The FULL-STACK muzzle smoke, the UX ELIXIR pop (after the pose) and every hit are effects in their own right.
- **Anchors.** Artsy's `hand` should follow the strumming hand (the guitar body for POWER CHORD) and his `mouth` meets the flask's `lip`.
- **Gameplay sizes stay as they are**, so some visuals meet hit tests built for 40 px heroes:
  - the beam runs level with the hand anchor, clamped to `feet − 34 … feet − 18`, while the hit band is `feet − 24 … feet − 10`;
  - the bubble is shaped to today's 20 px bump radius (customers meet its film as the bump fires); if the radius is retuned, `RX`/`RY` in `skillart/churn_shield.py` are the one place to change;
  - the drone orbits ±22 px round a hero that is now ±12 px wide, so it crosses his chest on the near half of its orbit;
  - NORTH STAR's star spawns at chest height while Strategy's current skill pose points straight up: draw `launch` on the `hand` anchor and ease the drawn star from the anchor to its true position over its first 6 ticks.
