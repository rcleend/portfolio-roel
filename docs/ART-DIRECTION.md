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

### Backdrop: Up and to the right (`growth`)

Every product engineer's dream chart on a 1996 phosphor metrics terminal: a hockey stick that breaks through the top of its own chart as the words lock.

- Palette: teal-navy glass from `#01070c` in the corners to a `#276076` haze behind the logo, grid lines a level or two up the same ramp, phosphor-green data ink (`#5cff8a` with a `#c8ffd8` core, white-hot while freshly drawn) and a cyan secondary series (`#3bc3cf`). Nothing warm, so the orange logo is the one hot thing on screen. The haze climbs to a mid value across the logo's band so its dark-red extrusion and near-black outline still read; every other row sits a level lower, a raster texture that lines up with the CRT's scanlines.
- Layout: the chart wraps the classic lockup. Its flat start runs between the logo and the prompt, its blade climbs past the logo's right edge, and it breaks the ceiling at the top right, so the whole hockey stick stays in view. Bars stand between the prompt and the copyright and a ticker runs under the copyright; nothing moves in the prompt and copyright rows.
- Beat sheet, in frames at 60 fps:

| Frames (s)          | What happens |
| ------------------- | ------------ |
| 0 (0.00)            | Impact frame: the whole tube overdrives for one frame, and a spike of light hits the impact point (white core, flat rings of green glow, stepped rays). |
| 1–17 (0.02–0.28)    | The spike retracts in steps while the raster opens from its horizontal ray with a hot leading edge and the grid strips flicker on, outward from the impact row; from frame 12 the beam spot flies to the y axis, leading the eye to where the line starts. |
| 18–51 (0.30–0.85)   | The line draws itself, easing into the trough of sorrow, the last three frames' worth cooling from white-hot to rest. Bars spring up with an overshoot as the head passes them; the scale counts up to 100 %. |
| 52–53 (0.87–0.88)   | The head holds at the turn while the last bars surge: the anticipation pose. |
| 54–71 (0.90–1.18)   | While the words slide, the head rockets up the blade, accelerating as they decelerate. |
| 72 (1.20)           | As the words lock the head breaks the ceiling, tears it open and overshoots before settling just above; a smaller spike lights the breach; data-point confetti (squares, plus signs, triangles, splinters of the ceiling and dimmer, slower specks behind for depth) skids out over the logo; the tube overloads. |
| 87–95 (1.45–1.58)   | After the flash the overload cools a level every three frames into the settled screen, while the confetti flutters down and cools out. |
| From 87 (settled)   | The 25 s idle loop: the head blinks as a cursor in step with the prompt; the tape scrolls at 30 px/s, exactly one tape per loop; the bars ripple to new values halfway between the logo's glints; twice a loop the live bar tops its record and "▲ NEW HIGH" pops beside the cursor. |

- Reduced motion: no impact frame, rays, flare or overload; the glass brightens in steps, the grid lights without stuttering, the rocket eases instead of accelerating, a few pieces drift down without spinning, the cursor and the live dot hold steady and the tape scrolls at half speed.
- Wit: the curve is the startup curve (wiggles of false hope, the trough of sorrow, then the hockey stick), the line goes through the 100 % ceiling, the readout says "LEENDERS CORP · Q4 1996" like the copyright, and the ticker quotes the CV's real metrics straight from the content, with what went down (churn, unhappy customers) in cool cyan.

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
