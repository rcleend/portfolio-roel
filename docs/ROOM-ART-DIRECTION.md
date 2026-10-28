# After hours — room asset revision 6

The room keeps its composition, attic shell, furniture, electronics, guitar and game
cases, with improved finishes, edge treatment and night lighting. The floor pillow,
ceiling beams and the old wall posters/cards are removed. A supplied folded rug replaces the old rug.
The walls and the sloped ceiling are decorated as a 2007 teenager's attic (§ Posters).

Browser captures from the room lab, with the same camera and test picture:

| Before | After |
| --- | --- |
| ![Original room](room/before.webp) | ![Restyled room](room/after.webp) |

Clicking the computer or its desk seats the camera straight in front of the monitor, where the
app's live desktop replaces the baked screen picture (a capture from the app itself; see
[PC.md](PC.md) for what it shows and [ROOM.md](ROOM.md) for how the monitor hands over to it):

| At the computer |
| --- |
| ![The beige CRT seen straight on, showing an original early-2000s-style desktop](room/pc.webp) |

Clicking the radio, its cabinet or the lava lamp sits the camera over the CD player with its lid open and the
collection floating above it (a capture from the app itself, at rest, with one of the five original placeholder
albums spinning in the well; see [RADIO.md](RADIO.md) for the player and [ROOM.md](ROOM.md) › The CD player for
the device):

| At the CD player |
| --- |
| ![The boombox on the cabinet with its CD lid open, a disc spinning in the well and four printed CDs floating above](room/radio.webp) |

| Rebuilt desktop peripherals | Original basket with supported papers |
| --- | --- |
| ![Beige CRT, full-size keyboard and wheel mouse](room/desktop-detail.webp) | ![Basket clear of the desk, with papers reaching its base](room/basket.webp) |

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

| Aspect | Previous room | Revision 6 |
| --- | --- | --- |
| Material language | Worn scans, noisy paint, glossy electronics and flat props | Cream enamel, oak/walnut, muted teal cloth, slate ABS and restrained brushed metal |
| Surface detail | Strong scan grain and small wear marks competing with the silhouettes | Restrained furniture grain, natural floor fibers, quiet paint and readable original labels |
| Geometry | Sharp furniture, a flat photographed floor and faceted chair | Metre-scale edge radii, shallow bevelled floorboards, welded and smoothed upholstery and a rebuilt retro desktop |
| Lighting consistency | Baked furniture with independently lit PBR devices | One Cycles lighting setup baked across furniture **and all four devices** |
| Night atmosphere | Dark blue shadows with warm pools from the lamps | Original night colors and local practical lights, with much dimmer broad fills and world illumination |
| Contact and depth | Device lighting did not match its baked contact shadow | Device shading, soft contact shadows and surrounding bounce share a light source |
| Texture fidelity | Different texture densities and multiple PBR channels per device | Dedicated 2K TV-front/PC atlases, 1K TV-rear/radio/PS2 atlases, density allocated to visible details |
| Runtime cost | Environment capture and multiple live lights for imported devices | Unlit static assets; one hemisphere for moving lava/glass; existing CRT glow |

## Specific treatments

- **Lighting:** the original nighttime colors and local practical lights are preserved.
  World illumination is reduced to 12% of the original and broad blue fills to about
  10%, keeping the ceiling and corners in deep shadow. Narrow window highlights,
  the desk's tungsten light and the lava lamp's amber glow stand out against that
  darkness. Furniture and electronics share the same bake. AgX contrast and exposure
  remain at the original settings.
- **Room:** the same wall and ceiling geometry gets matte, muted plaster and cream trim.
  Wooden ceiling beams and the old wall posters, cards and masking tape are removed; the
  decorated walls (§ Posters) are a separate lazy layer baked in the same light.
  The original floor's footprint and top height are preserved while its mesh becomes
  shallow oak boards with small seams and rounded edges. The original wood scan adds
  natural grain and pores while the new floor's warm oak colors remain.
- **Furniture:** the original desk, dresser and TV cabinet retain their proportions and
  placement. Shared cream paint and wood finishes replace unrelated scans and wear.
  All four desk drawer fronts use the desk's white enamel; their original handles remain.
  Six-millimetre furniture bevels and smaller trim bevels make edges catch light.
- **Rug:** the supplied Sousinho rug keeps its original folded mesh and backing. It
  becomes a 2.3514 m square, matching the old rug's width, and rotates 15° clockwise.
  The folded corner remains nearest the TV. A new plush geometric textile follows
  the user's reference palette of teal, aqua, mustard, rust, green, ivory and charcoal.
  The pattern covers the top; the folded underside remains plain woven backing.
- **Chair:** petrol upholstery uses a fine, low-amplitude weave. Welding its UV-split
  vertices before subdivision avoids cracks between imported triangles; its original
  silhouette remains recognizable. The floor pillow is removed from the exported scene.
- **Electronics:** the TV, radio, PS2 and controllers keep their source models,
  controls, labels and logos. The TV keeps its original printed color and grille detail,
  with reduced normal-map strength and a consistent satin casing response. Its imported
  split normals are repaired and its continuous source UVs retained before packing.
  All static surfaces are baked in the room.
  The TV front has its own 2K atlas for the opening close-up; the rear uses 1K.
  Screens remain separate and replaceable.
- **Furniture and lamps:** the TV cabinet, desk, desk lamp, static lava housing and
  window use continuous area-weighted normals across imported seams, with a 50° crease
  limit preserving the actual corners. Tiny cabinet wear flecks share its enamel finish.
  The round lamp housings use continuous cylindrical UV strips with seams at the back,
  eliminating the fragmented triangle islands that left vertical smudges on the metal.
  Four shared atlases bake at 4K / 128 samples and reduce to the existing 2K sizes, cleaning
  rough bevels and smudged highlights without adding runtime materials or lighting.
  Wood grain, window blinds and the animated lava retain their character.
- **Desktop:** a new beige CRT monitor, two-tone full-size keyboard and wheel mouse
  are modelled from public views of FaceTheEdge's
  [90s PC desktop style 002](https://sketchfab.com/3d-models/90s-pc-desktop-style-002-ec97f236db9342d0802a3ab75cf4da4b).
  The reference is not downloadable; this is an original lightweight reconstruction,
  with no extracted geometry or texture maps. Broad bevels, a deep tapered shell,
  recessed controls and a low swivel foot define the monitor. The existing tower
  under the desk remains; no second system unit is added. Desktop cables and floppy
  disks are removed. The existing screen mapping and desk interaction are preserved.
  One shared 2K PC atlas preserves keycap and curved-mouse detail in the close-up.
  The bezel's face and inset now share a continuous UV island, with smoothly weighted
  corner normals. A 4K, 128-sample offline bake is reduced to the same 2K runtime atlas
  to remove the former diagonal seams and jagged bevel shading.
- **CD player:** clicking the radio, its cabinet or the lava lamp sits the camera over the
  boombox at a 24° pitch; its lid opens and the collection rises out of the disc slot.
  The boombox carries no brand: the source model's maker and model lettering and its
  marketing marks are painted out of every atlas from the moulding beside them, while the
  function labels (band, function, tone, the dial, the tape keys) stay.
  What an open lid reveals did not exist in the source model, so the lid underside (ribs,
  clamp puck, latch hook), hinge barrels, well liner, dark turntable with three ball-clamp
  nubs, pickup sled with its blue lens on two rails and the slot's lips and screws are new
  geometry in the radio's own language, baked open in the room's own Cycles scene, lights,
  AgX and exposure. The room's lamp only grazes the rim, so the close-up's bake adds the
  lava lamp's glass glow from its side and a faint bounce from the far side: the well and
  the lid's underside read as grey-brown moulded plastic, lit on the lamp's side and darker
  across the well, still at night, and the lamp-lit seated disc stays the bright subject.
  The hinge barrels outside the well keep the room's light alone. Visitors who reach for
  the radio on a capable screen get its atlas re-baked at 2K on the identical UVs. The
  discs are drawn, not baked: the bake's own three sources (the lilac ambient, the lava
  lamp, the moon) by name, a silver foil that reflects the dark room and draws the lamp's
  spoke and rainbow across its tracks, matte ink under a varnish glint and a smoky hub, so
  plain silver discs already read as CDs in the night palette rather than as stickers.
  Their data side, which faces the camera as they rise and go home, is a lit silver mirror
  with the lamp's spoke and rainbow and a polished rim, never a flat grey; the placeholder
  prints are a CD's (a skyline, a tide across the label), not a record's grooves. Nothing
  added carries a mark.
  The casing and controls have clean ABS reflectance, retaining printed function labels
  and the separate speaker-grille detail. Rebuilt area-weighted normals suppress the
  imported triangular shading patches. The base/skin are supersampled at 4K and the
  lid interior at 1K before returning to their existing 1K/2K/512² runtime sizes.
- **Wastepaper:** the original lightweight basket and all 18 crumpled papers remain.
  The basket moves 17 cm left to clear the desk and wall trim. Its 15 inner papers
  settle under gravity into a supported pile reaching the bottom; three original
  papers remain on the floor. Settling runs only during authoring, and the export
  retains the original geometry, materials and desk atlas without runtime physics.
- **Game case:** the original SSX3 case and printed insert remain. Its separate
  translucent overwrap is removed for the matte finish, so an opaque lightmap cannot
  obscure the original cover. The remaining case geometry and placement are preserved.
  The Battlefront II case on the TV cabinet instead carries generated **Product
  Engineer** art matching the blue/amber TV title, with matching spine lettering.
  Its body, sleeve, print, spine and hinges rotate together 180° so the cover's
  bottom faces the opening camera. All three separate printed inserts are baked
  under the room lights on their original UVs, including the shelf's occlusion;
  raw artwork is no longer displayed almost full-bright. The imported SSX3 case
  already shares the PS2's room-lit atlas.
- **TV cabinet and plant:** the top and front lip share one continuous lightmap
  island, avoiding the dark UV-gutter strip below the television while retaining
  its contact shadow. A dim 2 W rectangular emitter follows the glass plane and
  faces into the room; the previous tilted 20 W disk made the edge unnaturally
  bright. The cabinet uses that occluded bake without a second additive strip
  behind the screen. A 21 cm desk plant sits to the TV's right, grounded on the
  cabinet top. Its supplied scan keeps the variegated leaves, with reduced geometry,
  repaired smooth normals, clean ivory ceramic and shared baked room illumination.
- **Guitar, lamps and clutter:** warm ivory lacquer, restrained metal, muted book colors
  and warm paper sit in the same palette. Other game-cover artwork remains.
  Hidden box-body caps beneath the fitted game-box lids are removed: their coplanar
  surfaces caused black stripes and depth fighting in WebGL.

## Posters

The walls take the reference room's habit of covering every free surface with what its
owner loved, dated 2007 and limited to eleven of Roel's childhood topics: Avatar: The Last
Airbender, Oblivion, Guitar Hero III, Star Wars, Radiohead's In Rainbows, Rage Against the
Machine, LEGO Star Wars, SSX 3, RuneScape, Green Day and Call of Duty 4. Every piece is the
original artwork (sources in `tools/room/assets/posters/SOURCES.md`; third-party, to be
cleared or replaced before publishing).

- **Composition:** a focal music corner above the dresser (In Rainbows, The Battle of Los
  Angeles overlapping it, the 2007 RATM reunion flyers, the Radiohead bear sticker across a
  seam, the RATM wordmark strip, a CoD4 SAS print, LEGO Star Wars, American Idiot under the
  slope); the Green Day 2004 poster over a RuneScape Void Knight print with the RuneScape 2
  logo taped across it, between the window and the dresser; an uneven frieze over the window
  (Guitar Hero III, Avatar, the Green Day 2005 tour banner, SSX 3); the Oblivion box art as a
  store promo left of the window above a corkboard of six pinned, overlapping pieces; and on
  the slope Star Wars 1977 Style A, Avatar Book 2, Revenge of the Sith, two folded magazine
  pull-outs and the Battle of Kvatch print near the ridge. Nothing on the knee wall, nothing
  near the window casing and nothing in the resting TV, PC or radio frames.
- **Physical detail:** tape is lit geometry in the bake, so each strip catches the
  window's blue or the lamp's tungsten and casts its own small shadow; overhangs ramp down
  from the card to the wall. The back wall has cream masking tape; the pale slope has
  white paper tape, which still reads a little brighter than the ivory around it. Paper
  sits 1 + 0.75 · n mm off the wall by layer, with a baked contact shadow (the skirt)
  multiplied onto the wall around it. The skirt only darkens, and it is baked without
  the tape, so a strip carries only its own shadow and no dark ring. The Radiohead bear
  sticker is die-cut: outside the bear, its card carries the wall and poster edge under
  it. The magazine pull-outs' folds are real ridges and valleys in the bake mesh. Curled
  corners, pins and the cork's grain are in the bake, not in runtime lighting.
- **Fidelity in the browser:** one 2048 × 1024 atlas (or 1024 × 512 on small screens,
  low-memory devices, Save-Data, slow links and software GPUs), its texel density set by the closest
  resting view each piece is seen in, loaded only after the first frame and uploaded in
  strips on the way into the room (docs/ROOM.md › Posters).

## Boundaries and tradeoffs

This adopts the reference's material discipline and baked-light approach; it does not
copy its furniture, isometric camera or interactive day/night blending. Roel's layout,
original room/TV viewpoints and arcade behavior remain unchanged.

Static reflections are baked, so they do not move when the camera moves. That is a
deliberate compromise for consistent appearance and economical rendering. Moving a
device or changing the room lights requires a rebake. The existing animated lava and
interactive CRT picture/glow remain live. Source license and attribution notes remain
in `public/room/CREDITS.txt`.

Furniture and window atlases are 2K to keep fine edge highlights readable. Source
normal maps keep their original tangent-space UVs during the bake; atlas gutters
extend each island's own color to limit dark seams when textures are filtered.

| Runtime asset cost | Revision 5 | Revision 6 |
| --- | ---: | ---: |
| Five GLBs and credits | 7.87 MB | 7.79 MB |
| Decoded texture pixels | 47.72 million | 46.21 million |
| Total asset triangles | 245,893 | 351,791 |
| Room-view draw calls | 55 | 57 |

The CD player adds nothing to that first load: `radio-closeup.glb` (65 KB, 2,366 triangles,
one 512² atlas) and `radio-skin-2k.webp` (240 KB) are lazy files fetched only when the radio
is prepared, the skin only on screens where the radio lands wider than 900 render pixels.
The posters add none of their art to it, only the room code that triggers them (about 1.7 kB
gzip in the room chunk): `posters.glb`
(30 KB, 1,535 triangles) and one atlas tier, `posters-2k.webp` (239 KB, 2048 × 1024) or
`posters-1k.webp` (89 KB, 1024 × 512), are lazy files fetched and decoded behind the opening TV
view and uploaded on the first departure. They add 2.1 million decoded texture pixels (0.5 million
at 1K), one shader program and two room-view draw calls; the TV, PC and radio views draw none of
them (docs/ROOM.md › Posters › Frames and budgets).

Texture allocation stays below revision 5 despite the sharper front-facing atlases, because
static devices no longer ship separate normal/roughness maps. More geometry goes to
silhouettes and bevels. The room still idles at zero renders with reduced motion;
visible lava schedules 24 frames per second. These are local Chromium measurements,
not a guarantee of a particular frame rate on every device.

The rebuild recipe, source requirements and verification commands are documented in
[tools/room/README.md](../tools/room/README.md). The generated rug texture, its prompt
and the supplied rug's attribution are documented in
[the room authoring inputs](../tools/room/assets/README.md).
