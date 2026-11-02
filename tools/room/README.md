# Room art pipeline

The checked-in `public/room/*.glb` files are ready to serve. A normal `pnpm build`
does not need Blender or the native source scene.

To regenerate them, use Blender 5.2 (tested with 5.2.2 LTS), Node 24 and the original
revision-5 `attic-room.blend` from the existing attic-room source export. That editable
scene and its packed original textures are a separate authoring input; they are **not**
downloaded by this project or included in Git. The scripts never overwrite that input.

```sh
pnpm install --frozen-lockfile
ROOM_SOURCE=/absolute/path/to/attic-room.blend pnpm build:room
pnpm verify:room
pnpm shot:room --only room-view,tv-desktop,room-phone --out .context/room-review
pnpm shot:room --only pc-desktop,pc-phone,pc-flight,pc-handoff --out .context/room-review
pnpm shot:room --only radio-desktop,radio-phone,radio-arrival,radio-insert --out .context/room-review
```

`BLENDER_BIN` overrides the Blender executable. `ROOM_BUILD_DIR` overrides the default
`.context/room-build` output. The output contains a packed, editable `room-source.blend`,
PNG atlases, raw GLBs, `bake-report.json` and a validated `optimized/` runtime export.
Blender defaults to eight CPU threads and 48 samples. On Apple Silicon, set
`ROOM_BAKE_DEVICE=METAL` to bake on the Metal GPU instead, or pass `--device METAL`
to `bake.py`. This is an offline authoring job.

## Stages

1. `restyle.py`: opens the original source, applies the shared material palette,
   refines existing geometry, removes the pillow/ceiling beams/wall art, tunes the night
   light rig and saves a new native scene. `desk_finishes.py` paints four drawer fronts;
   `room_finishes.py` restores natural floor grain without changing its oak palette;
   `rug.py` fits the supplied folded rug to a 2.3514 m square, rotated 15° clockwise.
   `basket_placement.py` moves the original lightweight basket clear of the desk
   and settles its 15 inner papers under gravity, keeping the three floor papers.
   The temporary physics scene is discarded; only transforms are applied to the
   original meshes. Supplied rug and generated textile inputs are under `assets/`.
   `desktop.py` rebuilds the CRT monitor, keyboard and mouse from a public visual
   reference, keeps the existing under-desk tower and removes desktop cords/floppies.
   The TV retains its original maps in the editable source; the bake keeps its printed
   color detail, softens the normal map and gives the casing a consistent satin finish.
   Material colors are sRGB swatches converted to scene-linear values.
   Light colors are already scene-linear: narrow blue window light, very dim cool fills,
   tungsten at the desk and amber around the lava lamp. World illumination is 12% of
   the original, and the broad fills approximately 10%, so local light sources stand
   out against deep shadows. The original 0.85 exposure is retained.
2. `bake.py`: binds source UVs before creating separate atlas UVs; checks UV area and
   bounds; bakes static surfaces and all four devices in the **same unchanged scene**.
   Original normal-map tangent spaces stay bound to the source UVs. Extended atlas
   gutters and 2K furniture/window/PC atlases protect small bevel highlights and close-ups.
   Objects sharing an atlas bake through a temporary joined copy so one object's
   gutters cannot overwrite another object's UV islands. Export nodes stay separate.
   The PC bezel uses a continuous projected island across its face and inner bevel,
   with weighted smooth normals; the automatic unwrap no longer cuts its corners into
   thin slivers. PC/radio surfaces bake at 4096² with at least 128 samples, then return
   to their existing runtime sizes during compression. The radio's imported split
   normals are rebuilt across coincident positions with a 50° crease limit. Its casing
   and controls use clean ABS reflectance while retaining the original dark printed
   markings; the speaker material keeps its perforation detail.
   The TV uses its original continuous UV layout before packing. Its casing, the TV
   cabinet, desk, desk lamp, static lava housing and window get the same area-weighted
   normal repair. The cabinet's tiny walnut wear flecks use its enamel finish instead.
   Round lamp housings use continuous cylindrical UV strips with a seam at the back
   and separate planar caps. Coincident imported vertices are joined for UV packing,
   without moving their surfaces or changing triangle counts.
   The TV and four affected furniture/window atlases also bake at 4096² / 128 samples.
   All bakes finish before materials become unlit, preventing light contamination
   from earlier atlases. Screen meshes/UVs, the rug and animated lava stay separate.
3. `optimize.mjs`: converts baked emissions to `KHR_materials_unlit`, compresses images
   to WebP and geometry to Meshopt with 16-bit UVs/positions, runs the glTF validator
   and asset-contract checks, then updates `public/room`, its hash manifest and the
   generated loading-progress weights in `src/room/assets/roomAssetSizes.json`. The radio's
   atlas first loses the source model's brand, model and marketing lettering:
   `debrand.mjs` lists each one as a rect in atlas UV space and refills it from the moulding
   on either side, so one table serves the 1K atlas and the 2K skin. `debrand-base.mjs`
   repaints an already shipped `radio-base.glb` the same way (its geometry and UVs proven
   untouched) and leaves a clean one alone; `verify.mjs` fails on any lettering left.
   `baked-textures.mjs` reduces supersampled bakes to their existing atlas dimensions;
   refined surfaces use WebP q94. Larger offline images never increase GPU allocation.
4. `build-radio.mjs` (`pnpm build:radio`, also the last step of `pnpm build:room`): the CD
   player's lazy close-up, from the restyled `ROOM_BUILD_DIR/room-source.blend` (never saved).
   `radio_closeup.py --stage skin` re-runs `bake.py`'s own preparation and unwrap for the
   radio (`configure_bake`, `prepare_scene`, `unwrap` at the shipped 1024 layout, so the UVs
   are identical) and bakes its atlas at 2048² into `radio-skin-2k.png` plus a UV probe.
   `--stage closeup` splits the lid off the radio, measures the well (its floor plane, the
   rim heights, the slot), models the parts an open lid reveals (liner, turntable and nubs,
   pickup and rails, slot lips and screws, hinge barrels, the moulded lid underside), opens
   the lid to 84° about its hinge, leaves the body's own tub floor under the liner out (it
   would seal the pickup pocket and the slit from every light), bakes them into one 512²
   atlas in the same lit scene plus a soft glow from the lava lamp's side (the room's lamp
   only grazes the rim) and a faint bounce from the far side, re-bakes the hinge barrels
   outside the well in the room's light alone, returns the lid to its closed pose and
   exports `radio-closeup-raw.glb` with the measurements in `radio-closeup.json`.
   `radio-closeup.mjs` then proves the skin's UVs match the shipped `radio-base.glb` (≤
   2/65535; measured 0.5), finds the lid, the rocker's halves, the side keys and the tub
   floor in the shipped base as triangle lists, writes them with the base's geometry and UV
   fingerprints and the measured hinge, pivot, key travel, seat, slot, well, LCD and LED
   into the close-up's extras, converts to unlit, compresses (WebP q94, Meshopt) and
   validates it, and publishes `radio-closeup.glb` and `radio-skin-2k.webp` as `lazyFiles`
   in the manifest (the first-load `files`, `totalBytes` and size table are untouched).
   The skin now bakes at 4096² / at least 128 samples and is reduced to 2048²;
   the open-lid parts bake at 1024² and return to 512². The lid underside also has
   continuous, area-weighted normals. Runtime texture dimensions and geometry budgets
   are unchanged. Metal bakes differ between runs by a few pixels.
5. `build-posters.mjs` (`pnpm build:posters`, run by `pnpm build:room` after the radio): the
   decorated walls (docs/ROOM.md › Posters), from `tools/room/assets/posters/layout.json` and
   the artwork masters in `POSTERS_SOURCE` (not committed: `masters.json` pins their SHA-256 and
   size, `SOURCES.md` their origin). `posters.py --stage layout` validates the layout (the
   keep-outs, tapes, pins and skirts included; declared overlaps on distinct layers; the eleven
   topics), derives every shipped piece (cards 1 + 0.75 · n mm off the wall, tape overhangs
   that ramp down to it, curled corners, skirts, the corkboard and pins) and packs the atlas
   islands at their real size. `--stage bake` builds the detailed sheets, the tape as lit
   geometry, the pins and the cork in the restyled scene and bakes them onto the shipped
   pieces, one whole-atlas pass per Blender process (`beauty`, `under` for the die-cut
   sticker, `bare` and `shadow` for the skirts' factor, `albedo` and `normal` as OIDN guides).
   `--stage compose` (no scene) denoises, derives each skirt side's factor normalised by its far
   field, die-cuts the sticker, and writes the 2K atlas and the 1K built per island. It fails
   when a tape overhang reads under 1.3 times its bare wall (1.10 on the pale slope, where white
   paper tape can read only its albedo over the paint's: 1.13-1.21 measured), when an on-sheet tape over art darker
   than 0.06 display luma reads under 1.15 times that art, when under 75 % of all on-sheet tapes
   read 1.15 times their art (each one is in `posters-tapes.json`), or when the flat art is
   grainier than 1.1 times the room wall at the same brightness. The wall's grain comes from `WORK/posters-wall-baseline.png`,
   which `build-posters.mjs` writes from the room build's own bake when the work folder has it
   and from the wall atlas `room.glb` ships otherwise; without it the stage stops. A skirt side
   whose outer ring does not reach the wall's own value (its mean under 0.99, or any 1 cm
   segment darkening the wall by more than 0.02 of full scale, about 5 levels in 255) is widened
   and the loop runs again (at most four layouts). `posters.mjs` then checks that every tape
   overhang starts on its card's own surface (within 0.1 mm, curled corners included), builds
   `posters.glb` from the shipped geometry with each item's box in the node's extras, converts
   to unlit, compresses (Meshopt; WebP for both tiers), validates it against the geometry
   contract in `posters-geometry.mjs` (below) and publishes `posters.glb`, `posters-2k.webp` and
   `posters-1k.webp` as `lazyFiles` (merged by name with the radio's; `room.glb` is untouched).
   A rebuild from the same layout and masters gives a byte-identical `posters.glb`; the atlases
   differ only by the bake's sampling noise (PSNR ≈ 46–47 dB at 2K and 45–46 dB at 1K on Metal, as with
   the radio's skin). About 6.5 min per layout with `ROOM_BAKE_DEVICE=METAL`, most of it the
   beauty pass (≈ 290 s) and the under pass (≈ 160 s). Those two stay one Blender process each,
   over SPEC 5.2's two-minute guide: each is one bake call over the whole atlas, so that its
   samples, its margin and the denoise see one image, and splitting it by island group would trade
   that for several partial bakes into one image; run `pnpm build:posters` in the background and
   follow its log.

Individual stages can be run for iteration:

```sh
"$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/restyle.py -- \
  --source /path/to/attic-room.blend --out .context/room-build --render
"$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/bake.py -- \
  --work .context/room-build
node tools/room/optimize.mjs --work .context/room-build
```

Set `BLENDER_BIN` first when using those individual commands. `--render` writes a native
direction preview; browser screenshots are the final appearance check. `--reuse-bakes`
is only safe for atlases whose source geometry, packing and lighting are unchanged.
Delete every affected PNG before reusing the others; lighting changes require a full bake.

### Device surface refinement

To rebuild only the computer and radio, first regenerate `room-source.blend` with the
current `restyle.py` (it contains the continuous PC bezel). Then run:

```sh
"$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/bake.py -- \
  --work .context/room-build --only pc --device METAL
"$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/radio_closeup.py -- \
  --work .context/room-build --stage skin --device METAL
node tools/room/refine-devices.mjs --work .context/room-build
"$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/radio_closeup.py -- \
  --work .context/room-build --stage closeup --device METAL
node tools/room/radio-closeup.mjs --work .context/room-build
pnpm verify:room
```

The targeted publisher stages and validates every output before replacing runtime
files. It proves the radio bake uses the shipped UVs and replaces only its texture,
preserving the lid/key triangle indices and fingerprints. It rebuilds the PC GLB for
the new bezel UVs and validates the screen registration. Other room assets remain
byte-identical. Neither pipeline adds runtime lights, shaders, textures or draw calls.

To refresh the TV, TV cabinet, desk, desk lamp, lava housing and window frame:

```sh
"$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/bake.py -- \
  --work .context/room-build --only tv --device METAL
"$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/bake.py -- \
  --work .context/room-build --only furnishings --device METAL
node tools/room/refine-furnishings.mjs --work .context/room-build
pnpm verify:room
```

This stages only `room.glb` and `tv-high.glb`. It verifies all furniture triangles
stay in place, then replaces four textures and the two atlas meshes containing the
lamps' new UVs. The cabinet/window UVs and all other room geometry/UVs are checked
against the shipped version. The TV's casing gets continuous UVs; its geometry and
screen registration are also checked. All atlas dimensions stay fixed; the animated
lava, glass, other room atlases and other devices stay intact.

To update the opening-view cabinet and props, first generate `room-source.blend`
with the current `restyle.py` (which calls `tv_dressing.py`), then:

```sh
"$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/bake.py -- \
  --work .context/room-build --only tv-dressing --device METAL
node tools/room/tv-dressing.mjs --work .context/room-build
pnpm verify:room
```

The cabinet top/front lip shares a continuous UV island so the contact shadow
does not break into a dark strip at the bevel. `align_tv_light()` replaces the
tilted disk light with a dim 2 W rectangular emitter aligned to the glass,
preventing the bright blue stripe along that lip. It runs during authoring and
baking so older editable sources also receive the correction. The supplied plant is grounded on
the right of the TV, welded before reducing it to about 15K triangles, smoothed and baked at 4K/128
samples before returning to one 1K runtime atlas. The generated Product Engineer
cover replaces Battlefront II; all six case pieces turn together by 180°.
`bake_game_prints()` bakes all three separate cover inserts under the room lights,
on their original UVs and at their existing runtime resolutions. This preserves
readable art while giving the shelf cases their actual shadows. SSX3 already
uses the shared, room-lit PS2 atlas. The
publisher replaces only the cabinet atlas mesh, three covers and plant,
checking unrelated room geometry/UV fingerprints and all asset contracts before
publication. Source attribution and the generation prompt live in `assets/README.md`.
The live CRT glow keeps the bezel and floor patches. The cabinet's redundant
additive strip is removed: it lit surfaces behind the screen, overriding the
occlusion and adding a bright cutout along the edge. This saves one draw call.

The opal desk lamp on the right-hand end of the TV cabinet is not baked: `tv-lamp.mjs`
(`node tools/room/tv-lamp.mjs`, also the last step of `pnpm build:room`) takes the supplied
`assets/tv-lamp-source.glb`, keeps only its opal globe and the round metal base under it (the cord,
the Sketchfab backdrop plane, the translucent plexi box, its corner rails and the box's four feet
are left out of the asset), drops the base onto the cabinet top, writes both parts as unlit
`_BAKED_UNLIT` materials with the globe's light (centre, colour, glow) in the lamp node's extras,
and adds it to `room.glb` under `01_TV`, checking that no other geometry or UV changed. The finish
draws its light at runtime (docs/ROOM.md › The opal lamp). Re-running it replaces the lamp in place
and gives a byte-identical `room.glb`.

The neon R on the left-hand end of the TV cabinet is not baked either: `neon-sign.mjs`
(`node tools/room/neon-sign.mjs`, the step after the lamp in `pnpm build:room`) builds it from
scratch at the proportions of the reference "Neon Open Sign" (Logan S., CC-BY-4.0; the reference
itself is not needed to run it): a blue rounded-rectangle border tube and a red R bent from one
continuous tube, swept circles with round caps, sized so the R reaches halfway up the set and leaning
back against the wall. Both are unlit `_BAKED_UNLIT` materials, with the sign's plane and the tubes'
extents in the node's extras for the finish's light (docs/ROOM.md › The neon sign). Both publishers
share `publish-tv-prop.mjs`, which replaces the prop under `01_TV`, checks that no other geometry or
UV changed and re-verifies the room assets before writing.

An already-built export can also be imported with
`ROOM_SOURCE=/path/to/optimized pnpm sync:room`. The importer requires a valid revision-6
manifest, checks hashes and asset contracts first, and does not erase the target folder.
It intentionally rejects the old machine-specific revision-5 export.

## Verification

`pnpm verify:room` checks all five runtime GLBs, file sizes and hashes, zero glTF
errors/warnings, static unlit materials, texture/geometry/transfer budgets, room groups,
the square rotated rug, the plant's grounding/size/position/triangle budget, the opal lamp's
grounding, place past the plant and its two shipped parts, the neon sign's grounding, lean on the
wall, place left of the set and its two tubes, the
Product Engineer cover's camera-facing bottom, room-lit game inserts, desktop node names and geometry budget, seven animated wax
meshes and the 48-second clip. It also checks
both replaceable screens, the TV buttons, screen UV coverage, that the PC screen faces +Z
with planar UVs (the computer's flat live screen and projector UVs depend on it), removal of
the pillow/old wall posters/ceiling beams and the unchanged TV aperture position. For the radio
it checks the lazy files' bytes and hashes, the close-up's size (≤ 80 KB), validator result,
single 512² atlas and triangle budget, its fingerprints of the current `radio-base.glb` (a room
rebuild without `pnpm build:radio` fails here), that the cut lid is one component spanning the
lid and the rocker one piece, the side keys mirror each other, the lid clears the antenna through
0–90°, and that the skin is exactly 2048² and ≤ 280 KB. For the posters it checks the lazy files' bytes and hashes, that `posters.glb` is ≤ 80 KB, validator-clean, unlit, one node of two primitives (cards, skirts) with no embedded image, ≤ 3,000 triangles, the geometry contract of `posters-geometry.mjs` (exactly the eleven topics; the layout's keep-outs, surface bounds and declared overlaps; every triangle inside its own item's box and on that item's surface, at most 30 mm off it; the decoded atlas exactly the tier's pixels), the tiers' exact sizes (2048 × 1024 ≤ 480 KB, 1024 × 512 ≤ 170 KB) and that every skirt side's outer ring decodes to the wall's own value in both tiers (each run of the side's ring, as the glb's extras list it, means ≥ 0.985 after encoding; sides a keep-out caps or a neighbouring card covers are listed by the compose stage instead). The compose stage itself fails on the tape's measured visibility. `scripts/inspect-tv-screen.mjs` provides a finer ray-cast aperture measurement.

Use `pnpm e2e room.spec.ts touch.spec.ts pc-monitor.spec.ts radio-deck.spec.ts no-webgl.spec.ts` to exercise
room/TV/computer/radio navigation, power-on, keyboard/touch input, the computer's live screen and
fallback behavior. `pnpm shot:room --only perf` checks render-on-demand and reduced-motion
behavior and compares the computer's flights with the TV's; `--only radio-perf` does the same for
the radio (also at 6× CPU, and with `ROOM_SHOTS_GL=swiftshader`). Validate the build with `pnpm check` and
`pnpm build` before publishing a new asset revision.

See [the art direction study](../../docs/ROOM-ART-DIRECTION.md) for the reference findings
and [CREDITS.txt](../../public/room/CREDITS.txt) for retained model attribution.
