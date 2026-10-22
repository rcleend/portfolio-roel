# Portrait look: the six skills

The motion spec for the **portrait** look of the six skills (STYLES.md: "refined and designed, geometric, UI-flavoured for tech skills, elegant arcs and clean particles; restraint over noise").
It is the Phase B blueprint: which sprite plays when, where it is anchored, what it is layered against, and what code draws instead of sprites.

- Assets: `src/game/art/looks/portrait/skills/<skillId>/icon.*` and `fx-*.*`, in the look-asset format (one row per animation, alpha 0 or 255, a few dozen colours).
- Generators: `tools/looks/portrait/skills/` (`build.py` rebuilds every file deterministically, `review.py` renders contact sheets and storyboards, `python3 -m unittest discover -s tools/looks/portrait/skills -t tools/looks/portrait/skills` checks the contract and that the committed files are current).
- Every pixel is drawn by those generators from geometry and hand-written character art; nothing is image-generated (`tools/art/prompts/looks-portrait-skills.md` says why).

## Shared rules

**Scale.** Heroes and customers are 54–60 px tall in 64 × 64 frames, origin (32, 64) on the feet line.
Every effect is sized against that figure: the shield bubble is 64 px across, the beam is 16 px tall (a quarter of a body), the drone is about one and a half head-widths.

**Time.** Beat sheets count 60 Hz ticks from the cast (`t0`, the tick `SkillSlot.tryCast` returns the running skill, which is also the first tick of the hero's 0.4 s `skill` pose).
Gameplay is fixed: every duration below comes from `src/game/skills/*` and `src/content/characters.ts`.
Sprite loops sit at 8–12 fps; one-shot bursts and impacts run at 15–30 fps so they land in 0.2–0.4 s.

**Anchors.** Effects that start at the hero attach to the `hand` anchor of the hero's `skill` animation (frame by frame): the keyboard for HACKERMAN, the flask hand and the guitar body for ARTSY, the casting hand for STRATEGY.
Until the portrait character sheets exist, the storyboards assume hand = feet + (14, −34) (hackerman), (11, −40) (artsy, flask), (6, −25) (artsy, guitar body) and (14, −36) (strategy).

**Layers.** `behind` is drawn before customers and the hero, `front` after them (`SkillLayer`).
Large shapes that pass over people (rings, the wave of understanding, the far half of the shield) go behind; small bright marks (impacts, hearts, notes, stars) go in front.

**Light and readability.** Light comes from the top-left; most ramps end in a pale, slightly cool step (the TV's glow).
Emissive parts have a bright core and a dark coloured rim on the shadow side, so they glow on the Berlin night and keep an edge on the golden-hour sky.
Glows are stepped bands and ordered dither, never blur or alpha.
Each skill owns a colour family, so effects stay attributable on a busy screen: FULL-STACK cyan / violet / amber, AGENT porcelain and cyan, ELIXIR rose, POWER CHORD lilac with gold stars, NORTH STAR gold, CHURN SHIELD aqua with a coral heart.
Large white areas appear for at most one frame; complaint bubbles and hit flashes stay the only big whites on screen.

**Reduced motion.** The visuals add no screen flashes or shakes of their own (gameplay's `world.flash` and `world.shake` are already skipped).
Every strip with a white flash frame ships a `-calm` twin without it (`charge-calm`, `hit-calm`, `strum-calm`, `impact-calm`, `pop-calm`); flickering loops are replaced by a held frame, and code-driven particle counts are halved.

**Sprite or code.** Sprites are what must be hand-made: shapes, poses, faceting, impacts.
Code does what code does better: paths and orbits, tiling a beam to the edge of the screen, scrolling its textures, rings that grow in whole-pixel steps, particle fields, and silhouettes traced from other sprites.
Every code-drawn element below names its exact colours and whole-pixel rules.

## Icons

24 × 24, one `idle` loop of 16 frames at 8 fps (2 s), origin (0, 0), for a 32 × 32 bevelled slot (icon at +4, +4).

- One object per skill over a shared two-band **glow disc** (radius 11 and 8, centred on the icon), mixed by one rule from the slot's mid tone `#262a3c` towards the skill's colour (`icon_kit.glow`). The disc is the set's frame; on frames 9–12 every disc breathes out by one pixel.
- Objects are lit from the top-left, rimmed in their own darkest hue, with a cool step on the right where it helps.
- Frame 0 is the rest pose: the HUD freezes icons on frame 0 while a skill cools down (`slot.charge >= 1 ? time : 0`).
- Each icon has one moment of life per loop, and a hero's two icons never move together:

| Hero | Skill | Moment of life |
| --- | --- | --- |
| hackerman | FULL-STACK ATTACK | f4–7: the flare's heart swells and a packet of light runs along the front-end layer |
| hackerman | AGENT SUMMON | f8–11: a one-pixel hover bob; f12–15: the eye's bright core scans across the visor; the rotor alternates blurs every 2 frames |
| artsy | UX ELIXIR | f4–6: a glint on the bulb; f8–13: a bubble rises through the elixir |
| artsy | POWER CHORD | f12–14: a bright pulse travels out through the three sound arcs |
| strategy | NORTH STAR | f4–6: a four-point glint blooms from the star's heart |
| strategy | CHURN SHIELD | f12–13: the heart beats inside the bubble |

What each says in one glance: a charged orb firing three parallel layers (front-end cyan, back-end violet with traffic chevrons, database amber in records); a porcelain rotor drone with a scanning cyan eye and a hover jet; a round flask of rose elixir with a cork; the Olympic White Strat (cream body, mint pickguard, rosewood board, maple headstock) with three sound arcs; a faceted gold compass star in a fine ring; a glass bubble with a coral heart.

## FULL-STACK ATTACK

A three-layer beam that pierces every customer in a line (0.6 s, cooldown 6 s; hits on its first update, `GROW_SECONDS` 0.08, `SHRINK_SECONDS` 0.15).

| Strip | Frame, origin | Animations |
| --- | --- | --- |
| `fx-muzzle` | 24 × 32, (10, 16) | `charge` 5 @ 30, `hold` 4 @ 15 loop, `fade` 4 @ 25, `charge-calm` 5 @ 30 |
| `fx-beam` | 24 × 16, (0, 8) | `grow` 3 @ 30, `hold` 4 @ 15 loop, `fade` 4 @ 25 |
| `fx-tip` | 16 × 16, (0, 8) | `race` 2 @ 30 loop |
| `fx-hit` | 48 × 48, (24, 24) | `hit` 6 @ 20, `hit-calm` 5 @ 20 |

The beam leaves a charged orb at the hand, the same orb as the icon, so the skill reads the same in its slot and in play.
Its cross-section is three 4-row layers with 2-row gaps (rows 0–3 front-end, 6–9 back-end, 12–15 database): top edge, white-hot core, light, dark rim.
The stage, and the customers it pierces, show through the gaps like a stack diagram.

**Beat sheet**

| Ticks | Beat |
| --- | --- |
| 0–1 | Wind-up: three motes (cyan, violet, amber) converge on the hand (`fx-muzzle` `charge` f0). The hero's pose carries the rest of the anticipation. |
| 2–7 | Cast: the motes meet in a hot point and the orb swells to its one-frame four-point flare (f1–f3) while the beam races to the screen edge: `fx-beam` `grow` f0 (cores only) → f1 → f2 (every core burns white for one frame), `fx-tip` riding the leading edge. |
| 2–7 | Hits: gameplay damages every customer in the band on its first update; each gets `fx-hit` when the beam's visible front reaches it, a selection box that snaps round its torso with corners outside the beam. |
| 8–26 | Effect: `fx-beam` `hold` loop, textures scrolling away from the hero; the orb's white heart breathes (`fx-muzzle` `hold`). Customers entering the band later get their own `fx-hit`. |
| 27–35 | Dissipate: follow-through: the beam's far end whips back into the orb while `fx-beam` `fade` thins it (rims go, the cores break into dashes, then dots), and the orb shrinks away (`fx-muzzle` `fade`); hit boxes finish opening out. |

**Code (Phase B)**

- Tile `fx-beam` from 3 px in front of the hand (under the orb's front edge) to the edge of the view, origin row on `hand.y`; mirror with `flipX` when facing left. Draw the beam before `fx-muzzle`, so the orb covers its root.
- The visible beam starts 2 ticks after the cast, once the motes have converged: its length is `round(reach * easeOutCubic((age - 2 / 60) / 0.08))`, whole pixels, and `fx-tip` sits at its leading edge until it reaches the view edge. Damage is not delayed; 33 ms of anticipation is invisible as lag.
- Scroll each layer separately (clip to its 4 rows), always away from the hero, in whole pixels per tick and below half of each texture's period so nothing strobes backwards: front-end 6 px/tick (24 px packets), back-end 3 px/tick (8 px chevrons), database 2 px/tick (6 px records).
- During the last 0.15 s the length shrinks from the far end, `round(reach * (1 - easeInCubic(fadeProgress)))`, so the beam retracts into the orb as it thins.
- Under reduced motion: `charge-calm`, `hit-calm`, and the textures hold still.

**Layer:** front (it pierces; the gaps keep the customers readable). **Busy screen:** three bright parallel rules in three hues are unlike anything else in play; the hit boxes mark exactly who was struck.
**Palette:** cyan `#0e3442 #17596e #2c93ae #62cde2 #b6f0f6`, violet `#221a4a #3c2e86 #6650c0 #9d8bea #d4ccfa`, amber `#3a1e08 #76400e #bd7a1c #eeb444 #ffe39a`, white `#ffffff`.

## AGENT SUMMON

An AI drone orbits the hero for 8 s and fires at the nearest customer every 0.55 s (first shot at 0.35 s; orbit 1.6 s, radius 22 × 6, lifted 22 px above the hero's centre; shots fly at 250 px/s).

| Strip | Frame, origin | Animations |
| --- | --- | --- |
| `fx-drone` | 28 × 24, (12, 12) | `summon` 6 @ 15, `hover` 16 @ 10 loop, `fire` 4 @ 15 (anchor `muzzle`), `dismiss` 6 @ 15 |
| `fx-shot` | 9 × 9, (4, 4) | `fly` 2 @ 15 loop |
| `fx-impact` | 24 × 24, (12, 12) | `hit` 6 @ 20, `hit-calm` 5 @ 20 |

The drone is drawn side-on, facing right: a porcelain teardrop pod, a wraparound smoked visor with one bright eye, a cyan status light on its flank, a swept tail fin, a rotor on a mast and a cyan hover jet.

**Beat sheet**

| Time | Beat |
| --- | --- |
| 0.00–0.40 s | Cast: `summon` at the drone's orbit position: a point of light, a scan line with corner brackets marking the space, a cyan wireframe, the pod printing itself top to bottom, a glowing outline, then online. |
| 0.40–7.60 s | Effect: `hover` (one 16-frame loop is exactly one orbit; a one-pixel bob, rotor blur, jet flicker, a blink every lap). |
| each shot | `fire` (0.27 s): the pod kicks back a pixel, the eye flares, a cyan muzzle flash at the nose. The shot flies as `fx-shot`; its hit plays `fx-impact`: a targeting reticle that locks, snaps and breaks into four arcs. |
| 7.60–8.00 s | Dissipate: `dismiss`: the eye shuts, the outline glows, the hologram un-prints, collapses to a scan line and a point (replaces today's blink-out). |

**Code (Phase B)**

- Position: the gameplay orbit. Draw `behind` while `sin(angle) < 0`, `front` otherwise (today's rule).
- Facing: `flipX` towards the current nearest target in view, otherwise the hero's facing.
- `hover` time is the orbit time, so the blink lands on the same point of every lap.
- Shot trail: three pixels behind the shot along its velocity, at 2, 4 and 6 px: `#62cde2`, `#2c93ae`, `#17596e`.
- `fx-impact` replaces the generic `hitSpark` burst for drone shots.

**Layer:** orbit-dependent; shots and impacts front. **Busy screen:** a small white shape with one cyan eye, always within 30 px of the hero; its reticles say which customer it chose.
**Palette:** shell `#151a2c #3a4058 #7c829e #b9bfd2 #e7eaf2`, visor `#0a0f1e #18233c #2b3d5e`, eye `#17596e #2c93ae #62cde2 #b6f0f6 #effdff`.
**Reduced motion:** `hit-calm`; the summon and dismiss holograms are slow enough to keep.

## UX ELIXIR

He drinks a potion; for 6 s customers calm down, slow down and are won over in one hit (the modifiers apply from the first tick).

| Strip | Frame, origin | Animations |
| --- | --- | --- |
| `fx-potion` | 20 × 20, (10, 10) at the grip | `appear` 3 @ 20, `drink` 5 @ 10, `vanish` 4 @ 15 |
| `fx-glint` | 11 × 11, (5, 5) | `glint` 5 @ 20 |
| `fx-calm-heart` | 11 × 11, (5, 10) bottom-centre | `pop` 4 @ 15, `beat` 8 @ 8 loop, `wane` 4 @ 8 |
| `fx-calm-motes` | 7 × 7, (3, 3) | `heart` 3 @ 6, `spark` 3 @ 6, `bubble` 3 @ 6 |

The flask is rasterised at every tilt from its geometry, and the elixir is whatever part of the bulb lies below a horizontal line: as he tips the flask to his mouth, the surface stays level and drops.

**Beat sheet**

| Time | Beat |
| --- | --- |
| 0.00–0.15 s | Wind-up: `appear`: a rose sparkle at the hand, a pale flash-in of the flask's silhouette, the flask. |
| 0.15–0.65 s | Cast: `drink`: upright, 40°, 80°, 115° towards his face, the elixir level dropping from full to empty. |
| 0.55 s | `fx-glint` on the bulb: the moment it takes effect. |
| 0.50–1.00 s | Effect: the wave of understanding (code) leaves his chest and sweeps the screen. As it reaches each customer: their rose aura appears and `fx-calm-heart` `pop`s over their head. |
| 0.65–0.92 s | `vanish`: the empty flask turns pale and breaks into rose motes. |
| 1.0–5.5 s | Hold: hearts `beat` (lub … dub, once a second), motes drift up around each calmed customer. |
| 5.5–6.0 s | Dissipate: hearts `wane` into two motes; the auras switch off when the modifier ends. |

**Code (Phase B)**

- Wave of understanding: an ellipse centred on the hero's chest (feet − 30), `rx` growing to 340 px over 0.5 s (easeOutCubic), `ry = 0.3 rx`, whole pixels; bands from the leading edge `#ffc0dc`, `#ea74ad`, `#c23f88` (3 px while `rx < 120`, then 2, then 1), the trailing bands dashed 3 on / 3 off. Layer behind.
- Aura: the customer's current frame drawn four times with `flash: '#c23f88'` at ±1 px (left, right, up, down) behind the sprite, a one-pixel rose rim that follows every pose; it brightens to `#ea74ad` on the heart's beat frames.
- `fx-calm-heart` replaces `renderCustomer`'s code-drawn calm heart (its frustration pips can keep their pink).
- Motes: one per calmed customer every 0.45 s, cycling heart / spark / bubble, spawned around the head and shoulders, rising 10 px/s with a ±2 px sine sway (1.5 s period); frames advance with age, then the mote is gone. They replace today's sparkle bursts.
- Mirror the flask with `flipX` when facing left: it always tips towards his face.

**Layers:** flask, glint, hearts and motes front; wave behind; aura directly behind each customer. **Busy screen:** rose belongs to this skill alone, and the rim, heart and motes mark every calmed customer without covering a face.
**Palette:** rose `#40102f #80205e #c23f88 #ea74ad #ffc0dc #ffe6f1`, glass `#251c3a #535c80 #8f9cc0 #cad6ee #f1f6ff`, cork `#3e2416 #7a4e2c #b07e4e #d8ac78`.
**Reduced motion:** no change to the sprites; motes halved; the aura does not pulse.

## POWER CHORD

One strum: a screen-wide shockwave stuns every customer in view for 3 s (rings at 0, 0.07 and 0.14 s, each 0.45 s; the skill lasts 0.5 s; gameplay flashes white for 0.08 s and shakes, both skipped under reduced motion).

| Strip | Frame, origin | Animations |
| --- | --- | --- |
| `fx-strum` | 48 × 48, (24, 24) at the guitar body | `strum` 6 @ 20, `strum-calm` 4 @ 20 |
| `fx-notes` | 11 × 11, (5, 9) | `eighth` 2 @ 8 loop, `beamed` 2 @ 8 loop |
| `fx-stun` | 27 × 13, (13, 12) bottom-centre | `orbit` 8 @ 12 loop |

**Beat sheet**

| Ticks | Beat |
| --- | --- |
| 0–2 | Wind-up: `strum` f0: the pick's stroke, a white crescent across the strings. The first ring (code) leaves from under it, still small. |
| 3–5 | Cast: f1: the chord lands, a lilac burst with a white heart. The second ring leaves at tick 4. |
| 6–18 | Effect: f2–f5: the burst's ring opens and breaks into sparkles. The third ring leaves at tick 8; all three sweep the screen as domes over the street, throwing off notes. |
| as each ring passes | Hits: every customer in view is already stunned (gameplay, first tick); `fx-stun` starts circling their head when the first ring reaches them. |
| 30–180 | Dissipate: rings thin from 3 px to 1 px and end at 0.6 s; notes drift up and blink out by 1 s; stun stars circle until each stun ends, 3 s after the strum. |

**Code (Phase B)**

- Rings: three ellipses centred on the guitar body, growing over 0.45 s (easeOutCubic) to `rx` 320, 280 and 240 px, `ry = 0.45 rx`, whole pixels; bands from the leading edge `#ebe7ff`, `#bdb2f6`, `#8676dc`: 3 px while progress < 0.4, 2 px below 0.75, then 1 px. Clip every ring at the ground line, so the wave rolls over the street instead of cutting through it. Layer behind. They replace the white `Ring` effects and the zig-zag ground columns.
- Notes: six, alternating `eighth` and `beamed` (mirrored on the left), launched along the first ring's leading edge, drifting 20 px/s up and outwards for 0.6–1.0 s, blinking out over their last 0.2 s.
- `fx-stun` origin on the top of the customer's head (feet − 56), in front, for the length of the stun.

**Busy screen:** the rings are thin and pass behind everyone; the notes and stars are small, outlined and owned by this skill.
**Palette:** sound `#2a2060 #4c3c9e #8676dc #bdb2f6 #ebe7ff`, stars gold `#3a2006 #cf8d1e #f4c44a #ffe895 #fff8dc`.
**Reduced motion:** `strum-calm`; rings start at `#bdb2f6` (no pale leading band); three notes instead of six.

## NORTH STAR

A homing star that seeks the most frustrated customer (200 px/s, turn rate 6.5 rad/s, life 2.6 s; launched up and forward from `caster.x + 8·facing`, feet − 30; a 6-point trail).

| Strip | Frame, origin | Animations |
| --- | --- | --- |
| `fx-sparkle` | 24 × 24, (12, 12) | `launch` 5 @ 20, `fizzle` 4 @ 15 |
| `fx-star` | 17 × 17, (8, 8) | `spin` 8 @ 12 loop |
| `fx-trail` | 7 × 7, (3, 3) | `spark` 3 @ 15, `dot` 2 @ 10 |
| `fx-impact` | 48 × 48, (24, 24) | `impact` 8 @ 20, `impact-calm` 7 @ 20 |

The star is a faceted four-point star that turns about its north-south axis like a hanging ornament: the north-south rays never change, so it always points north, the east-west rays foreshorten through edge-on, where it catches the light in a glint, and the half turn loops seamlessly.
A flat spin was tried and dropped: its in-between angles read as a shuriken, which is STRATEGY's sticky-note attack.

**Beat sheet**

| Time | Beat |
| --- | --- |
| 0.00–0.25 s | Cast: `launch` at the spawn point: a twinkle, a gold cross, a ring, scattered sparks; the star leaves on the same tick. |
| flight | Effect: `spin` loop (one half turn every 0.67 s), arcing up then homing; the trail streams behind it. |
| on hit | Hits: `impact`: a compass-star flash on the customer (long north–south rays), the star inside a ring, the ring opening into four sparkles that drift out. |
| no hit | Dissipate: `fizzle` where the star expires. |

**Code (Phase B)**

- Trail: a one-pixel ribbon through the star's six trail points, `#ffe895` for the nearest two segments, `#f4c44a` for the next two, `#cf8d1e` for the last; `fx-trail` `spark` at every second point, its frame advancing with the point's age.
- `fx-impact` replaces `BURSTS.starImpact`; `impact-calm` under reduced motion.

**Layer:** front. **Busy screen:** the only gold in play, so the eye can follow the arc to the customer that matters.
**Palette:** gold `#3a2006 #83500e #cf8d1e #f4c44a #ffe895 #fff8dc`, white `#ffffff`.

## CHURN SHIELD

A retention bubble blocks all damage for 5 s; customers who bump into it calm down (at most once per 0.6 s each).

| Strip | Frame, origin | Animations |
| --- | --- | --- |
| `fx-shell-back` | 88 × 88, (44, 44) | `form` 5 @ 20, `shimmer` 8 @ 8 loop, `wane` 4 @ 8 loop |
| `fx-shell` | 88 × 88, (44, 44) | `form` 5 @ 20, `shimmer` 8 @ 8 loop, `wane` 4 @ 8 loop, `pop` 6 @ 20, `pop-calm` 5 @ 20 |
| `fx-ripple` | 28 × 48, (24, 24) at the contact point | `bump` 6 @ 20 |
| `fx-heart` | 9 × 9, (4, 7) | `pop` 5 @ 10 |

The bubble is 64 px across, centred 31 px above the hero's feet: it rests on the ground and clears his hair.
It is two layers so it can enclose him without veiling him: the back layer (the far rim and a thin film near the edge, whose dither drifts as it shimmers) goes behind the hero, the front layer (a 2 px rim shaded by direction, a dark outline on the shadow side only, four thin-film colour bands that turn a quarter per second, the window highlight) goes in front.

**Beat sheet**

| Time | Beat |
| --- | --- |
| 0.00–0.25 s | Cast: `form`: a bright bead at his chest grows to 35 px radius, overshoots, settles at 32. |
| 0.25–4.20 s | Effect: `shimmer` loop. |
| each bump | Hits: `fx-ripple` at the rim facing the customer: a white contact glow, then arcs spreading over the bubble's surface; `fx-heart` rises from the contact point. |
| 4.20–4.70 s | Warning: `wane` loop: the rim alternates whole and dashed, the highlight dims. |
| 4.70–5.00 s | Dissipate: front `pop` (a white tension frame, eight arcs flying apart, droplets falling); the back layer ends at 4.70 s. |

**Code (Phase B)**

- Both layers use the same animation and time; `fx-shell-back` in `behind`, `fx-shell` in `front`.
- Ripple position: the rim point towards the customer, `(x ± 32, feet − 31 + clamp(dy, −10, 10))`, mirrored with `flipX` on the left.
- Under reduced motion: `wane` holds frame 0 (no dashes), `pop-calm`.

**Busy screen:** the bubble is a thin outline around the hero, never a fill over him; aqua and coral are this skill's alone.
**Palette:** aqua `#0b2a33 #16566a #2b93a8 #68d0de #b6f1f5 #e9fdff`, thin film `#a99aec #ec9fcb #f2dc9a`, coral `#5c1428 #b8344f #ee6a7e #ffb4bc`.

## Open questions

1. **Hand anchors.** The effects assume the `hand` positions listed under Shared rules; the portrait character sheets decide. ARTSY's single `skill` pose has to serve both the flask (ideally near the mouth on the drink frames) and the strum (the guitar body).
2. **Scale of the gameplay shapes.** Three behaviours were sized for 40 px sprites: the beam's hit band (feet − 24 to feet − 10) sits below the new chest height (~feet − 34), the shield's 20 px radius at feet − 15 is smaller than the 32 px bubble that now encloses the hero, and the drone's orbit (22 px out, 22 px up) runs at chest height close to the body. Visuals follow gameplay as they are; matching the gameplay shapes to the new heroes is a behaviour change for the captain to decide.
3. **Visuals the running skill does not own.** The drone's shots and the north star are `Shot`s that draw themselves; hit sparks, the elixir's sparkle bursts, the shockwave `Ring`s and the star's impact are `Effect`s the behaviour emits through `world.effect`; `renderCustomer` draws the calm heart; and POWER CHORD's rings, notes and stun stars outlive the skill's 0.5 s. A look needs seams for shot rendering, emitted effects and per-customer overlays (or a way to keep drawing after `done`), otherwise the classic visuals draw over the portrait ones.
4. **Stun stars.** If the portrait customer's `stunned` animation draws its own stars, `fx-stun` doubles them; one of the two should own them.
5. **Slots.** 24 × 24 icons need 32 × 32 slots in the select screen and the HUD (today 24 × 24 and 22 × 22).
