# After hours — the room's art direction

A teenager's attic bedroom on a rainy evening, after dark, some time around 2007. The lamps are on low, the game on
the television is paused, the lava lamp is turning over and rain runs down the window. Nobody is in the picture, and
somebody just was.

This document is the room's art bible: the picture every part of the room is held to, and why. A prop, a surface, a
light or a poster is right when it serves this picture, not when it is good by itself. How the room is made is in
[ROOM.md](ROOM.md) › The generated room: every prop is a function in `src/room/gen/props/`, every surface a function
in `src/room/gen/materials.ts`, the light a table in `src/room/gen/rig.ts` that the visitor's GPU bakes once, the
finish a handful of numbers in `src/room/atmosphere/moods.ts`, and the posters are paintings in
`src/room/posters/paint/`. No model, texture or image is shipped. A change to the look is a change to that code.

Five words decide every question: **nostalgic, warm, cosy, slightly dusty, dark and rainy.**

## The story

It is Roel's room under the roof, as he remembers it: the room where he taught himself to make things. Everything in
it belongs to one of three loves, and each love is one of the site's doors.

| Love | Its corner | What stands there | The door |
| --- | --- | --- | --- |
| Games | The television on its white cabinet, against the knee wall | A black CRT set, a console and two pads on the floor, a game case, a bare bulb and an opal lamp either side | Play game |
| Computers | The desk under the window | A beige CRT monitor, keyboard, mouse and tower, an arm lamp, a mug, a plate | About me |
| Music | The pine dresser and the wall above it | A boombox and his own CDs, a lava lamp, a guitar on its stand, a band's posters | Music by me |

It is a memory, so it is a little warmer, a little softer and a little dustier than the room was. Things have stood
where they stand for years: the rug's corner has been kicked over and left, paper missed the basket, the posters went
up one by one and overlap. Nothing is broken, dirty or sad. The night and the rain are outside; inside is lamplight.

## The colour script

Two families, and one rule between them.

- **Warm is inside**: lamplight and what it touches. Tungsten amber, from the deep orange of the dimmed bare bulb and
  the lava lamp, through the desk lamp's amber, to the opal globe's warm cream. Never pink, never lemon.
- **Cool is outside**: the rain, the night through the window, and what the room keeps of them in its shadows. Slate
  blue to ink blue. Never violet or magenta, never neon cyan.
- **The rule: value decides temperature.** What is lit is warm and what is in shadow is cool. The darks are ink blue,
  never neutral black and never brown; the lights are amber and cream. Only two things are bright and cool: the patch
  the window throws past the desk, and a screen's own picture.

The proportions in the overview are about two thirds cool and dark to one third warm and lit, and the warm third owns
the brightest values. A warm pool always falls off into cool shadow within the frame, so every view has both.

| | Where it sits |
| --- | --- |
| Darkest values | The ridge and the left wall's top, the black plastics (the set, the boombox, the console), under the desk. Ink blue, never crushed to nothing over an area: a dark wall still shows its boards. |
| Brightest values | The emitters themselves (the globe, the filament, the wax, the desk lamp's bulb, the two screens), then the surface right under each lamp, then paper and white enamel in fill. Nothing else. |
| Most saturated warm | The lava lamp's wax and its pool on the dresser: the one loud warm note. The bare bulb's filament second. |
| Most saturated cool | The chair's petrol cloth and the rug's navy: accents, both a step under the lava's saturation. The night in the glass. |
| Quiet | Walls, ceilings, floor and furniture are low in saturation: they take the colour of the light on them. |
| The screens | A picture is light and content: it keeps its own colours and contrast whatever the room's grade (ROOM.md › Atmosphere). |
| Whites and blacks | Whites are aged: cream enamel, ivory plastic, oatmeal wool; no surface is paper white but paper. Blacks are plastic with a cool sheen, never a hole. |

The finish (`moods.ts` › `rose`, Velvet dusk) says the same thing in numbers: shadows are tinted ink blue with a
breath of violet, highlights amber, the bloom and the lamps' air amber, the window's air rain blue.

## Value and focus, view by view

Each view is one picture with one thing to look at first. The eye goes to the brightest, most contrasted, most
saturated place, so those three are spent where the view's subject is and held back everywhere else.

| View | First | Second | Third | Held back |
| --- | --- | --- | --- | --- |
| The television (the opening view) | The picture on the tube | The bare bulb's filament and its pool on the cabinet top, left | The plant in the opal lamp's light, right | The set itself (black on a wall a step lighter, so its outline reads), the wall (a quiet gradient, warm low by the lamps to ink blue above), the cabinet's front |
| The room (the overview) | The desk corner: lamp, monitor, the window's rain | The lava lamp's pool and the boombox | The television and its two lamps | The rug (large, near and patterned, so it is kept dark and aged), the blind (large and pale, so it is lit only by what is in the room), the slope's posters, the left wall, the floor's far corners |
| The computer | The screen | The warm sill and blind slats, left | The night in the glass, right | The bezel: aged ivory, warm and soft, darker to its edges |
| The CD player | The discs and the panel's display | The lava lamp's amber on the dresser top, left | The lid and the deck's keys | The wall, falling from amber at the left to ink at the right |
| Flights | No frame of a flight is a different film: the same pools in the same dark, whatever the camera passes |

On a phone held upright the television's view is the picture with wall above and the cabinet's front below, and the
overview is the television's corner over the rug: there the rug is nearly half the frame and carries the site's name
in white, so its near squares lie in shadow.

## The light

Every light has a job and a reason to be there. A light nothing in the room explains is cut or handed to something
that does explain it. Colours are the rig's (scene-linear, before the display curve, which deepens them).

| Light (`rig.ts`) | Job | Colour | What it is |
| --- | --- | --- | --- |
| `desk`, `desk-wall`, `desk-fill` | Key of the desk corner | Tungsten amber | The arm lamp's bulb under its shade, the glow it throws on the wall beside it, and what the lit desk and blind send back down on the keyboard |
| `lava`, `lava-spill` | Practical and accent; key of the CD player's view | Deep orange | The lava lamp: a small pool on the dresser's top and the wall, a breath of it across to the cabinet's end |
| `opal` | Key of the television's corner | Warm cream | The opal globe: the cabinet top, the plant, the wall, the set's right flank |
| `bulb` | Practical; the opening view's second read | Deep amber, dim | The bare bulb turned most of the way down: a pool a hand wide, a crisp shadow of the set |
| `moon`, `moon-through-blind`, `moon-on-blind` | Cool key from outside: the patch past the desk, a rim on the chair and the desk's end | Rain blue | The night sky and the street behind the tree, through the lower sash and, a third of it, through the slats |
| `blind-scatter`, `fill` | Cool fill | Slate blue | What the pale blind and the left wall give back of the window's light |
| The television (`tv-glow`, and the picture every frame) | A coloured key on the boards and the console before the set | The picture's own | The tube: a standing dim blue in the bake, and the picture of the moment on top of it (ROOM.md › The TV's light) |
| `crt` | Small cool fill on the keys | Screen blue | The monitor |
| `pool`, `bounce`, `floor` | Warm fill: the room's own bounce | Dim warm | What three lamps and a lit oak floor send round the room; it stands in for indirect light and is kept well under any lamp's own pool |
| `ambient` | Ink in the shadows | Blue from above, warm brown from below | The night's sky light through the window and the floor's bounce; it is what a shadow is made of |
| `blind` | The blind's face | Dim warm | The room's own light on the slats |

The lamps are the keys; the window is the cool counter-key; the fills are dim enough that turning one lamp off would
visibly darken its corner. There is no light from nowhere: the old overhead pool, a lilac light with no fitting, is now
the lamps' bounce.

## Material families

Things made of the same stuff answer the light the same way, whoever built them. One family, one response; a prop
varies within its family by a little hue and a little age, never by a different idea of the material.

| Family | Where | Colour | Response |
| --- | --- | --- | --- |
| Painted wood | Desk, television cabinet, window casing, skirting, door frame, blind slats | Cream enamel, a little yellowed | Satin: a soft broad reflection of the lamps, brush grain and orange peel only at arm's length. Edges eased so they catch a lamp. |
| Bare and stained wood | Oak floor, pine dresser, window sill, the guitar's neck, the door | Warm browns: oak red-brown, pine honey, the sill and door darker | Varnished: the floor mirrors the lamps most, furniture half as much. Grain is quiet and runs the right way; boards differ a little from one another. |
| Plastic of the era, ivory | Monitor, keyboard, mouse, tower | One aged ivory, the keys' two tones either side of it | Matte moulded ABS: no gloss, soft form shading, a faint texture. All four read as bought together. |
| Plastic of the era, black | Television, console, pads, boombox shell, game cases | Near black with a cool cast | Satin: a sheen from the screens and the window, the form shown by its edges. The set mirrors its own picture in its lip. |
| Plastic, silver | The boombox's panel and keys | Cool silver paint | Satin, brighter than the black around it, never chrome. |
| Fabric | Chair cloth, rug wool, speaker cloth | Petrol blue; navy and oatmeal; charcoal | Matte, no reflection. Form by soft shading; pile and weave only at arm's length. Dark wool shows its nap. |
| Metal | Lamp arm and springs, chair's lift and base, guitar hardware, window fasteners, basket wire, lava lamp's foot and cap | Zinc, nickel, worn brass, painted wire, anodised aubergine | Restrained: lighter and darker along a form, a small highlight; never mirror chrome. |
| Glass | The window, the bulb, the lava bottle, the two tubes | Clear | Only what it reflects and what shines through it: a film of light, rain beads, a tube's sheen. |
| Ceramic and concrete | Mug, plate, plant pot, the bulb lamp's base | Stoneware cream, cast grey | Matte with a soft speck; the pot and the mug are of one shelf. |
| Paper | Posters, the sheet and the crumpled balls, books, game covers, the corkboard's notes | Paper white under ink | Matte; sits in the wall's light, never brighter than a white surface beside it would be. Gloss sheets have a faint sheen. |
| Plaster and painted boards | Walls (slate blue beadboard), ceilings (cream plaster) | Quiet | Matte, slow unevenness, the boards' grooves. They are the stage: they take the light's colour and keep out of the way. |

## Shape and detail

- **How stylised.** A carefully made miniature: true proportions and real construction (a drawer has a gap, a lamp
  has springs), simplified where the eye does not go. Stylised realism: not flat-shaded low poly, not a scan.
- **Edges.** Nothing is knife-sharp. Furniture is eased 2–6 mm, moulded plastic 1–2 mm, cloth and pottery are soft all
  over. An edge exists to catch a lamp.
- **Where detail goes.** At silhouettes and at what a hand touches: keys, knobs, switches, handles, hinges, legends.
  Broad faces stay quiet: a texture on a wall, a floor or a cabinet front moves its value by a few per cent, no more.
- **Wear and dust.** Slight, and the same everywhere: paint with a brush's unevenness, wool that has been walked on, a
  rug corner left turned over, tape on the posters, a ring where a mug stood. Dust is in the air, in the lamps' light,
  not as dirt on things. No scratches, stains, chips, rust or grime.
- **Density.** One texel density per kind of surface (walls 5 mm a texel, floor and furniture under 3 mm, the rug and
  small furniture finer; half of each below the top tier) and one level of modelled detail: a prop is built to be seen
  at arm's length, and no prop is built finer than the one beside it.
- **Graphics.** Legends are plain words in the site's faces; the wordmarks are the site's own. Posters are bold
  shapes in a few colours each, which hold at the wall's density and at a phone's size.

## Atmosphere

- **Haze.** A little: the lamps and the window light the air near them (amber round each lamp, rain blue in the
  window's slant), never a fog over the room. It separates the corners in depth and is where "dusty" lives.
- **Dust.** Fine motes drifting slowly, seen in the lamps' light, sparse (the app runs 30 % of the finish's own).
- **Rain.** On the glass: beads and slow trails that refract the night outside; the tree's crown and a few lit leaves
  behind. The storm's flashes are rare, cool and from outside.
- **Bloom.** Only light blooms: the globe, the filament, the wax, the desk bulb, a screen's brightest pixels. A lit
  surface does not glow and a dark corner never fogs.
- **The grade.** Split tone: ink blue with a breath of violet into the shadows, amber into the lights, saturation a
  little under full, the exposure of a night interior. A vignette darkens the corners, where the page's type sits.
  Screens are graded at an eighth of that, so their pictures stay what the game and the desktop drew.

## Tiers and framings

The picture is the same on every quality tier and in both framings; a tier gives up pixels, texel density, samples of
soft shadow and modelled detail, never a light, a colour or an effect (ROOM.md › Quality). What that asks of the art:

- Nothing in the look may depend on fine, high-contrast detail. The blind's slats, the beadboard's grooves, the
  floor's seams and the keys are the finest patterns in the room; each is kept low enough in contrast that it does not
  shimmer on the lowest tier, where nothing is multisampled.
- The lowest tier bakes soft shadows from half the samples: lights are sized and placed so that a penumbra in fewer
  steps still reads as soft.
- A view's first read must hold in an upright phone's crop, where the lamps beside the television are out of frame
  and the rug is half the overview.

## The room, part by part

- **Room.** 5.6 m × 4.8 m, 3.28 m high on the left, the ceiling sloping down to a 1.88 m knee wall on the right.
  Slate-blue painted beadboard walls with a cream skirting, cream plaster ceilings, a door behind the camera. The
  floor is oak boards with small seams and restrained grain. The window has a narrow cream casing, a deep stained
  sill, two sashes and a venetian blind let halfway down, its slats nearly shut; rain runs down the glass, and behind
  it a tree's crown stands against the night sky, a few leaves catching the street's light.
- **Furniture.** A white desk under the window (a frame leg at the left, a three-drawer unit at the right), a
  honey pine dresser with a drawer and two panelled doors against the back wall, and the white TV cabinet against
  the knee wall (two drawers, two open shelves, a low plinth). Cream enamel and wood; edges are eased so they
  catch the lamps.
- **Rug.** A 2.35 m square of navy and oatmeal checks with a soft pile, turned 15° clockwise, the corner nearest the
  TV rolled back to show its jute backing. An old wool rug: the pale squares are aged, not white, so the largest
  pattern in the room stays under the lamps' pools in value. Straight checks; no coloured or diagonal patches.
- **Chair.** A swivel chair in petrol cloth on a gas lift and a five-armed base on castors, facing the desk.
- **Desktop.** An ivory CRT monitor on a swivel foot, a two-tone full-size keyboard with every key and a wheel mouse
  on a mat; an ivory tower with two drive bays under the desk and a jointed arm lamp. The screen is a separate glass
  the app paints ([PC.md](PC.md)).
- **Television.** A black ABS set of its years: a front shell with soft squared corners and a face crowned a few
  millimetres, a steep lip down to the glass, a chin whose lower edge hangs in a shallow smile, domed keys under
  printed legends, a smoked remote window, three front jacks standing in a well, speaker louvres in the sides, a
  plinth on rubber pads, and behind the seam a rear cover that narrows to the tube's neck under a slotted hood. Its
  wordmark is the site's own, on a low badge. The glass is a separate mesh with the CRT shader.
- **TV cabinet top.** At the set's right an opal globe lamp on a round metal foot and a 21 cm plant in an ivory
  pot, broad dark leaves with a paler midrib; at its left a bare-bulb lamp of today turned most of the way down (a
  plain cast concrete cylinder, a smooth matte black socket, a clear bulb whose cage filament glows orange, a grey
  cloth flex with a small pale inline switch).
- **Console.** On the floor in front of the cabinet: a slim black console of its years, a design of its own with
  the room's wordmark, two pads on their cables, a memory card and a game case beside it.
- **Game cases.** With covers made for this room: Powder Rush, Crown & Key and Brick Galaxy, the games the posters
  advertise.
- **CD player.** A portable radio cassette CD deck of the nineties, drawn for this room: two speaker pods with
  louvred fronts either side of a silver panel (a display lens, a round transport cluster, a tuning dial, a chin of
  switches), a cassette deck and the CD lid on its sloping top, a folded handle and an aerial. It carries no brand:
  its wordmark is the site's and its legends are plain words. Under the lid: a ribbed underside, a well with a dark
  turntable, a pickup and the slot the discs rise from, dark at night so the lamp-lit disc is the bright subject.
  The discs are drawn, not baked: silver foil that reflects the dark room and draws the lava lamp's spoke and
  rainbow across its tracks, matte ink under a varnish glint and a smoky hub, so plain silver discs already read as
  CDs in the night palette rather than as stickers. Their data side, which faces the camera as they rise and go
  home, is a lit silver mirror with a polished rim, never a flat grey. Prints are a CD's, not a record's grooves.
- **Lava lamp.** An hourglass foot and a cone of a cap in anodised aubergine metal, dark enough that the wax is the
  only bright thing about it; the wax rises, necks, merges and parts on slow clocks that never repeat within a
  visit.
- **Guitar.** A cream double-cutaway electric on a tripod stand between the dresser and the TV: a white scratch
  plate with three pickups, a maple neck with a rosewood board.
- **Wastepaper and clutter.** A wire basket by the wall with crumpled sheets in it and around it and one flat sheet
  beside it; books on the desk and three big ones stacked on the floor by the dresser; the radio's mains lead.

## Posters

The walls are covered with what the room's owner loved. Twenty-nine printed pieces and a corkboard, all original and
fictional, made for this room and painted in code ([ROOM.md](ROOM.md) › Posters lists them): one band, The Loud
Hours, across a poster, a tour banner, an album print and a ticket stub; the three games on the room's own shelf as
shop posters and three more that never existed; a star chart, a patent drawing, a blueprint, a travel print, film
sheets, flyers and stickers.

- **Composition:** a focal music corner above the dresser with pieces overlapping; an uneven frieze over the
  window; a store promo left of the window above a corkboard of pinned, overlapping pieces; and on the slope film
  sheets and folded magazine pull-outs up to the ridge. Nothing on the knee wall, nothing near the window casing
  and nothing in the resting TV, PC or radio frames.
- **Physical detail:** every sheet has its own masking tape (cream on the back wall, white paper tape on the pale
  slope) with the small shadow under it; overhangs ramp down from the card to the wall. Paper sits
  1 + 0.75 · n mm off the wall by layer, with a contact shadow (the skirt) multiplied onto the wall around it. The
  pull-outs keep their folds, corners curl away from the light, gloss sheets have a sheen, the cork has grain and
  pins.
- **In the room's light.** A poster is paper on a wall and is lit as the wall is: the night's light is painted into
  the pieces (`posters/wall/light.ts`) in the room's own two families: a dim warm fill right of the window where the
  lamps' bounce reaches, cooler and dimmer left of it, the lava lamp's amber pool under the music corner, and the
  slope fading from the knee wall up to the ridge. No poster is brighter than white enamel in the same place would
  be, and none is a light.
- **Designs:** bold shapes and headline type in a handful of colours each, in the site's three faces. At the
  wall's density a millimetre is about half a texel, so small print is there to read as small print. As a wall they
  are the room's one place for many colours, which is why each sheet keeps to a few and the room's light is what
  ties them together.

## Reference study

Reference: [Bruno Simon's My Room in 3D](https://my-room-in-3d.vercel.app/)
and its [source](https://github.com/brunosimon/my-room-in-3d).
The live scene was inspected at desktop size, alongside `Baked.js`, its fragment shader,
the asset list and the renderer. No reference geometry, artwork or source code is included.

The defining quality is a carefully modelled miniature. Large shapes are simple and
readable, with enough bevels to catch light. Detail is concentrated in silhouettes,
controls, keys, books and personal objects. Broad surfaces are quiet: wood has restrained
grain, fabrics have soft shading, and plastic does not look like polished metal.
It is stylized realism, rather than flat-shaded low poly or heavily weathered realism.

The reference's lighting is particularly important. Its shader blends day, night and
neutral baked textures, with a separate RGB light mask for the desk, PC and TV. Soft
contact shadows, reflected light and warm/cool separation make individually different
objects feel like a single scene. Its renderer does not rely on expensive runtime
shadow maps or a postprocessing stack for that appearance.

What the room takes from it:

| Aspect | The room |
| --- | --- |
| Material language | Cream enamel, oak and honey pine, petrol cloth, black and ivory ABS, restrained metal |
| Surface detail | Restrained grain on furniture and floor, quiet paint, readable labels in plain words; slight wear, no scans |
| Geometry | Rounded edges and bevels that catch light, detail kept to silhouettes, controls and keys |
| Lighting consistency | One set of lights for furniture and devices alike, baked once with soft shadows |
| Night atmosphere | Cool, dark corners and ceiling with warm pools at the lamps |
| Contact and depth | Every prop's contact shadow comes from the same lights as its shading |
| Runtime cost | Unlit surfaces that read the bake; only what changes (the TV's picture, the storm, the wax) is live |

## Boundaries and tradeoffs

This adopts the reference's material discipline and baked-light approach; it does not
copy its furniture, isometric camera or interactive day/night blending. Roel's layout,
room and TV viewpoints and arcade behavior are the room's own.

The light is baked, so shadows and the lamps' pools do not move; the varnish, the TV's picture on the room and the
storm's flashes are the live exceptions. Moving a prop or changing a lamp is a change to the code and costs nothing
to rebuild, because every visit bakes it. The bake has no indirect light: a pool over the floor and a bounce stand in
for it, placed by eye, and the posters' light is a small model of the same rig, matched to it by eye.

Art direction happens inside the frame budget: light, colour and wear are static, so they live in the bake and in
what is generated once at load; the finish's numbers may be retuned but it gets no new pass, texture read or term
(ROOM.md › Quality).

The props are parametric, which suits furniture, cases and moulded plastic and stylises what is organic: the plant's
leaves are folded blades grown from a seed. Nothing in the room is a scan.

Nothing in the room carries a third party's mark, artwork or model: the wordmarks are the site's own, the game
covers and posters are fictional, and the devices are designs of their own in the manner of their years.

The pictures under `docs/room/` (`after.webp`, `pc.webp`, `radio.webp`, `desktop-detail.webp`, `basket.webp`) and
under `docs/gen/reference/` were captured from the room with shipped models (§ History), in the earlier, pinker
finish. They show the layout; the palette and the light are the ones described here.

## History

The room was first built in Blender ("room asset revision 6"): sourced and hand-made models restyled to the look
above, lit by one Cycles setup, baked into atlases and shipped as five GLB files, with the posters as a baked layer of
third-party artwork that was never published. A pipeline under `tools/room/` built and verified it. Commit `0e275c7`
replaced all of it with the generated room and removed the files and the pipeline; the generated props stand where
those stood and were matched to them in place, size, palette and light, from pictures (`docs/gen/reference/`) and
from measurements kept as numbers in `src/room/gen/roomSpec.ts` and `gen/props/radioSpec.ts`. None of the earlier
meshes, UV layouts or textures is in the repository or in what a visitor downloads.

The generated props were then rebuilt one at a time, each against its old model. The room was art-directed as one
picture afterwards: until then its finish was peach and plum (every lamp red, every shadow magenta, the window
violet), its floor was lit by a lilac pool with no lamp to explain it, and its navy and white rug was the brightest
thing in the overview. The colour script, the light's roles and the material families above are from that pass.
