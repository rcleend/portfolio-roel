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
   The TV retains its original color, normal and roughness/metallic textures, bypassing
   the other devices' matte surface adjustments before the shared bake.
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
   All bakes finish before materials become unlit, preventing light contamination
   from earlier atlases. Screen meshes/UVs, the rug and animated lava stay separate.
3. `optimize.mjs`: converts baked emissions to `KHR_materials_unlit`, compresses images
   to WebP and geometry to Meshopt with 16-bit UVs/positions, runs the glTF validator
   and asset-contract checks, then updates `public/room`, its hash manifest and the
   generated loading-progress weights in `src/room/assets/roomAssetSizes.json`.
4. `build-radio.mjs` (`pnpm build:radio`, also the last step of `pnpm build:room`): the CD
   player's lazy close-up, from the restyled `ROOM_BUILD_DIR/room-source.blend` (never saved).
   `radio_closeup.py --stage skin` re-runs `bake.py`'s own preparation and unwrap for the
   radio (`configure_bake`, `prepare_scene`, `unwrap` at the shipped 1024 layout, so the UVs
   are identical) and bakes its atlas at 2048² into `radio-skin-2k.png` plus a UV probe.
   `--stage closeup` splits the lid off the radio, measures the well (its floor plane, the
   rim heights, the slot), models the parts an open lid reveals (liner, turntable and nubs,
   pickup and rails, slot lips and screws, hinge barrels, the moulded lid underside), opens the
   lid to 84° about its hinge, bakes them into one 512² atlas in the same lit scene, returns the
   lid to its closed pose and exports `radio-closeup-raw.glb` with the measurements in
   `radio-closeup.json`. `radio-closeup.mjs` then proves the skin's UVs match the shipped
   `radio-base.glb` (≤ 2/65535; measured 0.5), finds the lid, the rocker's halves and the side
   keys in the shipped base as triangle lists, writes them with the base's geometry and UV
   fingerprints and the measured hinge, pivot, key travel, seat, slot, well, LCD and LED into
   the close-up's extras, converts to unlit, compresses (WebP q90, Meshopt) and validates it,
   and publishes `radio-closeup.glb` and `radio-skin-2k.webp` as `lazyFiles` in the manifest
   (the first-load `files`, `totalBytes` and size table are untouched). About 45 s with
   `ROOM_BAKE_DEVICE=METAL`. The close-up is reproducible byte for byte; Metal skin bakes
   differ between runs by a few pixels.

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

An already-built export can also be imported with
`ROOM_SOURCE=/path/to/optimized pnpm sync:room`. The importer requires a valid revision-6
manifest, checks hashes and asset contracts first, and does not erase the target folder.
It intentionally rejects the old machine-specific revision-5 export.

## Verification

`pnpm verify:room` checks all five runtime GLBs, file sizes and hashes, zero glTF
errors/warnings, static unlit materials, texture/geometry/transfer budgets, room groups,
the square rotated rug, desktop node names and geometry budget, seven animated wax
meshes and the 48-second clip. It also checks
both replaceable screens, the TV buttons, screen UV coverage, that the PC screen faces +Z
with planar UVs (the computer's flat live screen and projector UVs depend on it), removal of
the pillow/wall posters/ceiling beams and the unchanged TV aperture position. For the radio
it checks the lazy files' bytes and hashes, the close-up's size (≤ 80 KB), validator result,
single 512² atlas and triangle budget, its fingerprints of the current `radio-base.glb` (a room
rebuild without `pnpm build:radio` fails here), that the cut lid is one component spanning the
lid and the rocker one piece, the side keys mirror each other, the lid clears the antenna through
0–90°, and that the skin is exactly 2048² and ≤ 280 KB. `scripts/inspect-tv-screen.mjs` provides a finer ray-cast aperture measurement.

Use `pnpm e2e room.spec.ts touch.spec.ts pc-monitor.spec.ts radio-deck.spec.ts no-webgl.spec.ts` to exercise
room/TV/computer/radio navigation, power-on, keyboard/touch input, the computer's live screen and
fallback behavior. `pnpm shot:room --only perf` checks render-on-demand and reduced-motion
behavior and compares the computer's flights with the TV's; `--only radio-perf` does the same for
the radio (also at 6× CPU, and with `ROOM_SHOTS_GL=swiftshader`). Validate the build with `pnpm check` and
`pnpm build` before publishing a new asset revision.

See [the art direction study](../../docs/ROOM-ART-DIRECTION.md) for the reference findings
and [CREDITS.txt](../../public/room/CREDITS.txt) for retained model attribution.
