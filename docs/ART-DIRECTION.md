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

## Boot — "REO·LEO" (homage to the Neo Geo MVS boot)

Reference timing at 60 fps (t in seconds from the first boot frame):

| t (s)       | What happens |
| ----------- | ------------ |
| 0.00        | Screen is white. |
| 0.00 – 0.55 | "REO·LEO" logo in black, **mirrored**, spins in around the vertical axis while zooming from small to full size (width grows from a sliver; the narrow phases look tall and condensed). |
| 0.55 – 0.80 | Mirrored logo holds at full size on white. |
| 0.80 – 1.35 | Background fades white → mid grey in 6–8 flat steps; the logo flips around the horizontal axis: its height squashes to a 1 px line while it greys. |
| 1.35 – 1.90 | Logo unflips, now readable and white, height growing back; background steps from grey to black. |
| 1.95 – 3.90 | Two lines of condensed bold sans type out under the logo, one character every 4 frames: "A LEENDERS" then "PRODUCTION". A soft tick per character. |
| 4.00 – 4.40 | "RCL" fades in from near-black navy to bright royal blue (`#1f6fff`-ish) in 5 steps. Heavy, wide, italic lettering like the SNK mark. |
| 4.40 – 6.40 | Hold. Boot jingle resolves. Any button skips from here (and from 1.0 s on revisits). |
| 6.40        | Cut to black, then title. |

The logo is a high-contrast wide serif with a centred interpunct, roughly 230 × 30 px at rest.

## Title — "PRODUCT ENGINEER" (homage to the Metal Slug title)

- Background: warm khaki-olive vertical gradient, dark umber at the top (`#3f3424`) to pale khaki at the bottom (`#b3ab90`), overlaid with horizontal streak noise (rows randomly ±1–2 shades), like an old printed card.
- 0.00 – 0.30 s: a blinding white-core fireball (white → yellow → orange → red rim) collapses to nothing.
- 0.30 s: an impact crater appears centre-screen: a glowing orange-red molten core inside a grey metallic splash crown with long diagonal streaks, wobbling slightly.
- 0.90 – 1.25 s: "PRODUCT" slides in from the right and "ENGINEER" from the left, decelerating hard; they lock together with a 2-frame screen shake.
- 1.25 – 1.45 s: full-screen white flash (skipped under reduced motion), then the settled title. The crater stays partially visible behind the logo.
- Logo lettering: huge, heavy, slightly italic, irregular chunky letters. Face is banded orange (yellow-orange top highlight → orange → red-orange), with a rough rust/stone texture of darker streaks, a deep dark-red extrusion towards bottom-left and a near-black 1 px outline. Small "TM" to the lower right.
- "ROEL LEENDERS" sits above the logo's top-right in a condensed cream face (`#efe3b5`) with a dark outline, the way "SUPER VEHICLE-001" does.
- "PRESS ANY BUTTON" below the logo in the chunky arcade face: white → pale lavender banded gradient, dark navy outline and shadow. Blinks.
- "© 1996 LEENDERS CORP." near the bottom in the same face, smaller, appearing after the flash.
- No level or credit counters.

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
