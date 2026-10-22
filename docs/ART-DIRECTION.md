# Art and motion direction

The target is a mid-90s Neo Geo arcade cabinet game (Metal Slug, King of Fighters) shown on a late-90s CRT, with modern restraint in timing.
It should feel authentic first and polished second: chunky hand-placed pixels, limited palettes, banded gradients, ordered dithering, hard flashes and snappy eases — never blurry upscales, soft drop shadows or web-UI rounded corners.

## Global rules

- Native resolution **320 × 240**. One art pixel is one native pixel. No sub-pixel drawing, no rotation of pixel art except deliberate 90° flips, no non-integer scaling of sprites (whole-scene transforms such as the boot logo spin are the exception, and are quantised to whole pixels).
- Palettes are small per element (4–16 colours). Gradients are **banded** (3–6 flat bands), optionally joined by a 2×2 or 4×4 Bayer dither row.
- Text is pixel text: crisp, outlined or shadowed, never anti-aliased.
- Blinking text uses an on/off cycle (e.g. 32 frames on, 16 off), never an opacity fade.
- Motion uses snappy curves: `easeOutExpo` / `easeOutBack` for arrivals, `easeInCubic` for exits, `steps(n)` when emulating sprite-frame animation. Overshoot and settle are welcome; floaty linear tweens are not.
- Every screen has something alive: a twinkle, a bob, a blinking prompt, drifting particles — but at most one focal motion at a time.
- Respect `prefers-reduced-motion`: skip full-screen white flashes and screen shake, shorten camera moves to quick cross-fades.

## The TV (room host)

- Initial framing: straight-on, the TV fills most of the viewport with its full bezel, bottom panel and power button visible and a small margin of the cabinet and wall around it.
- Power-on: the power LED lights, then the classic CRT turn-on — a bright dot, a horizontal line that snaps open vertically with slight overshoot, a brief brightness bloom and a little vertical roll — about 600 ms, before the boot scene's first frame.
- The screen is a CRT: visible scanlines aligned to the 240 game rows, a subtle aperture-grille mask, slight horizontal softness, edge vignette, gentle bloom on bright pixels, faint glass reflection. The screen's light spills onto the nearby cabinet and wall, following the average screen colour.
- When the camera pulls back to the room the game freezes and an on-screen-display style "PAUSE" glyph appears on the CRT.

## Boot — "ROEL" (homage to the Neo Geo MVS boot)

Reference timing at 60 fps (t in seconds from the first boot frame):

| t (s)       | What happens |
| ----------- | ------------ |
| 0.00        | Screen is white. |
| 0.00 – 0.55 | "ROEL" logo in black, **mirrored**, spins in around the vertical axis while zooming from small to full size (width grows from a sliver; the narrow phases look tall and condensed). |
| 0.55 – 0.80 | Mirrored logo holds at full size on white. |
| 0.80 – 1.35 | Background fades white → mid grey in 6–8 flat steps; the logo flips around the horizontal axis: its height squashes to a 1 px line while it greys. |
| 1.35 – 1.90 | Logo unflips, now readable and white, height growing back; background steps from grey to black. |
| 1.95 – 3.15 | Two lines of condensed bold sans type out under the logo, one character every 4 frames: "LEENDERS" then "PRODUCTION". A soft tick per character. |
| 4.00 – 4.40 | "RCL" fades in from near-black navy to bright royal blue (`#1f6fff`-ish) in 5 steps. Heavy, wide, italic lettering like the SNK mark. |
| 4.40 – 6.40 | Hold. Boot jingle resolves. Any button skips from here (and from 1.0 s on revisits). |
| 6.40        | Cut to black, then title. |

The logo is a high-contrast wide serif set tight, so the serifs almost touch: 144 × 34 px at rest, centred.

## Title — "PRODUCT ENGINEER" (homage to the Metal Slug title)

The title is a lockup on a backdrop that can be swapped independently (docs/ARCHITECTURE.md › Title variants). What follows is the default pair, `classic`: the khaki card, the fireball and the crater are the classic backdrop; the lettering, the name and the trademark are the classic lockup; the timing, the flash, the prompt and the copyright belong to the scene and hold for every pair.

- Background: warm khaki-olive vertical gradient, dark umber at the top (`#3f3424`) to pale khaki at the bottom (`#b3ab90`), overlaid with horizontal streak noise (rows randomly ±1–2 shades), like an old printed card.
- 0.00 – 0.30 s: a blinding white-core fireball (white → yellow → orange → red rim) collapses to nothing.
- 0.30 s: an impact crater appears centre-screen: a glowing orange-red molten core inside a grey metallic splash crown with long diagonal streaks, wobbling slightly.
- 0.90 – 1.20 s: "PRODUCT" slides in from the right and "ENGINEER" from the left, decelerating hard; they lock together with a 2-frame screen shake.
- 1.25 – 1.45 s: full-screen white flash (skipped under reduced motion), then the settled title. The crater stays partially visible behind the logo.
- Logo lettering: huge, heavy, slightly italic, irregular chunky letters. Face is banded orange (yellow-orange top highlight → orange → red-orange), with a rough rust/stone texture of darker streaks, a deep dark-red extrusion towards bottom-left and a near-black 1 px outline. Small "TM" to the lower right.
- "ROEL LEENDERS" sits above the logo's top-right in a condensed cream face (`#efe3b5`) with a dark outline, the way "SUPER VEHICLE-001" does.
- "PRESS ANY BUTTON" below the logo in the chunky arcade face: white → pale lavender banded gradient, dark navy outline and shadow. Blinks.
- "© 1996 LEENDERS CORP." near the bottom in the same face, smaller, appearing after the flash.
- No level or credit counters.

### Blueprint backdrop (`blueprint`)

The product, drafted: the title card is the engineering drawing of what the engineer builds. The fireball becomes a plotter-pen strike, the crater becomes measured construction geometry, and the orange logo sits on its complementary blue.

- Palette: one 17-step ramp from unexposed navy (`#050f28`) through Prussian (`#0a1f4a`), cobalt (`#113572`) and blueprint blue (`#1f53a0`) up to the line inks: mid cyan (`#7fb2e8`), pale (`#b0d4f4`), near-white (`#d8eeff`) and the white-hot pen tip. Everything is drawn as a step of it, so the light table switching on, ink cooling and erasing are palette steps, never alpha.
- Sheet: banded paper with Bayer-dithered band edges and sparse grain, darker towards the top corners and lifted by a broad light-table glow behind the logo, so the logo's near-black outline and dark-red extrusion keep about 3:1 against it. Grid lines one step above the paper every 8 px, two steps every 32 px. A drafting frame with zone references 1–8 and A–F in the margin, and a title block, "DWG RL-1996 · SCALE 1:1 · REV A · SHT 1", in 3 × 5 drafting lettering.
- 0.00 – 0.30 s: the strike. A white-hot plot point with a thick cross flare that retracts into it; nine compass rings snap outwards every two frames, fast then slowing, each cooling a ramp step every two frames. The light table switches on behind the newest ring, its grid glowing at the leading edge, so the drawing boots outwards from the impact.
- 0.30 – 0.90 s: measuring. A registration mark lands (9 → 6 px); dimension arrows shoot from the strike to the frame one after another, overshoot a pixel or two and settle, their numbers ticking up to 152, 152, 92 and 132; dashed construction boxes blink in over the lockup's two lines, from its settled bounds, and hold still for the last third of a second.
- 0.90 – 1.20 s: nothing moves but the words; a dash-dot datum line marks the row they meet on.
- 1.20 – 1.45 s: the lock satisfies the construction, which flares white for the two shake frames and is gone under the flash; a 1 px ripple runs out through the grid from the middle of the lockup and is still spreading when the white clears.
- Settled (25 s): a pen plotter drafts one wireframe at a time in the corners beside the prompt and copyright: a phone dimensioned 375, IDEA → ? → SHIP with its NO loop, an eight-tooth gear marked Ø31, and a hockey stick. A small ring echoes the strike as the pen touches down, fresh ink cools behind its crosshair, whose shadow drops as it lifts between strokes. Each drawing holds, then steps back into the paper. Every finished drawing bumps the title block's revision, A → E, between two glints of the logo; once a loop the light table's scan line passes down the sheet. The loop starts and ends on a clean sheet.
- Reduced motion: no flare or rings (the light table warms up in four steps behind a still plot point), the arms draw together without overshoot, the boxes never blink, the measurements step down at the lock, the ripple is slow and faint, and there is no scan line or white-hot stamp.

## Character select

Layout follows a classic RPG select (portrait card left, details right) but rendered as Neo Geo pixel UI:

- Left: a tall card with a bevelled pixel frame (light lavender rim, darker inner rim), deep indigo starfield background with twinkling stars and drifting class-themed particles (green code glyphs, paint flecks, sticky notes), the character idling on a pixel pedestal with a pulsing glow. Chunky triangular arrows either side bob towards the edge and flash on press; switching characters slides the card content with a quick horizontal wipe.
- Right: the character name in the large arcade face (white, outlined) followed by "ROEL" in blue, a class label, the bio in the small face, and two skills, each a 16 × 16 icon in a bevelled slot plus its name.
- Hovering (pointer) or highlighting (keys/pad) a skill opens a pixel tooltip window with the skill's tooltip text; it pops in over 4 frames with a 1 px overshoot.
- A "SELECT" button with a blinking hand/arrow cursor confirms. Confirming plays the character's victory pose, a white flash on the card and a "READY!" stamp before transitioning.

## Mission select

A tongue-in-cheek mission briefing screen: missions are employers, the location is the stage.

- Each mission is a postcard-like window previewing its parallax stage (live, slowly panning), stamped with mission number, company, city and years.
- The selected mission shows a briefing panel: role, briefing copy, hazards list and "THREAT: UNHAPPY CUSTOMERS".
- A locked third slot reads "MISSION 3 — YOUR TEAM?" with a "contact" call to action instead of a stage.
- A plane or route line animates between the cities in chronological order.

## Levels

Short (60–90 s), forgiving side-scrollers in the spirit of Metal Slug and Super Mario.

- Four or more parallax layers per stage, generated as painted pixel art and quantised to small palettes: sky, far landmark skyline, mid city, near props, plus an optional sparse foreground layer that passes in front of the player.
- **Luna · San Francisco** — golden-hour fog rolling over the Golden Gate, Painted Ladies on steep streets, cable-car tracks, the Transamerica Pyramid. Warm oranges and cool fog blues.
- **Scripe · Berlin** — night, Fernsehturm on the horizon, Altbau facades with graffiti, the yellow U-Bahn on its viaduct, Späti neon, construction fences. Deep violets, sodium yellows, neon pinks.
- The only enemy is the **Unhappy Customer**: shouts complaint speech-bubbles (the level's complaint lines) that hurt on contact. Attacks lower their frustration; at zero they turn happy (palette swap to calm colours, a heart and a "+MRR" pop) and stroll off. Nobody dies.
- Career highlights are collected from "?" blocks and shown as an achievement banner; the stage-clear screen lists every highlight with metrics.
