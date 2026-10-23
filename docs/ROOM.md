# Room host (`src/room`)

The three.js attic that presents a `GameSurface` on a CRT television.
It is vanilla three.js (no React) and imports nothing from outside `src/room` except the `GameSurface` / `PointerSink` types.
The contract with the rest of the app is the `createRoom` API below; everything else is internal.

## Using it from the app

```ts
// Load lazily: three.js is ~180 kB gzipped and the flat host does not need it.
const { createRoom } = await import('@/room');

let room;
try {
  room = createRoom({
    container,                          // element the canvas fills; its size drives the framing
    surface,                            // the game's GameSurface (320×240)
    onProgress: (f) => setLoading(f),   // 0–1, weighted by file size
  });
} catch {
  // WebGL unavailable: createRoom throws synchronously → use the flat host.
}

await room.ready;          // assets loaded and the first frame drawn (TV dark, camera on the TV)
await room.powerOn();      // power LED, then the ~600 ms CRT turn-on; resolves when the picture is up
game.start();              // or surface.resume(); the boot scene's first frame lands on a live tube

room.onViewChange((view) => showHint(view));   // 'tv' | 'room'
room.setFramingInsets({ top: 0, right: 0, bottom: touchPadHeight, left: 0 }); // keep the TV clear of overlays
// room.showRoom() / room.focusTv() for buttons or keyboard shortcuts; room.dispose() on unmount.
```

What the room does to the game, so the app does not have to:

| Moment | Effect on the surface |
| --- | --- |
| `createRoom` | `setInputEnabled(true)` (the page opens on the TV) |
| Click/tap outside the TV while watching it, or `showRoom()` | pointer released, `setInputEnabled(false)`, `pause()` (only if running), camera flies to the room |
| Click/tap the TV in the room view, or `focusTv()` | camera flies back; on landing `resume()` (only if the room paused it) and `setInputEnabled(true)` |
| Pointer over the picture while settled on the TV and powered on | `pointer.move(x, y)` in native pixels, `down()` / `up()`, `leave()` when it leaves the picture |

A game the app paused itself (a menu, a hidden tab) is never resumed by the room.
Escape is deliberately not bound: the game uses it for menus.
The PAUSE on-screen display shows whenever the tube is on and `surface.paused` is true (checked on every drawn frame, since `GameSurface` has no pause event); the TV draws it, not the game.

### Public API

```ts
function createRoom(options: CreateRoomOptions): Room;

interface CreateRoomOptions {
  container: HTMLElement;
  surface: GameSurface;
  onProgress?: (fraction: number) => void;
  assetBaseUrl?: string;            // absolute URL of the assets folder; default `${BASE_URL}room/`
  maxPixelRatio?: number;           // default 2
  maxDrawingBufferPixels?: number;  // default 3 000 000
}

interface Room {
  readonly ready: Promise<void>;
  readonly view: RoomView;                 // 'tv' | 'room', the view at or flying to
  readonly powerState: PowerState;         // 'off' | 'powering-on' | 'on' | 'powering-off'
  powerOn(): Promise<void>;
  powerOff(): Promise<void>;
  focusTv(): void;
  showRoom(): void;
  onViewChange(listener: (view: RoomView) => void): () => void;
  setFramingInsets(insets: FramingInsets): void;   // CSS px covered by overlays
  registerInteractable(interactable: Interactable): () => void;
  readonly stats: RoomStats;               // frames rendered, draw calls, triangles, DPR, lava state
  dispose(): void;
}

interface Interactable {                   // future props: PC, radio, PS2, guitar, posters
  readonly id: string;
  readonly object: Object3D;               // ray-cast target, descendants included
  readonly gestureSurface?: Object3D;      // ray target while it owns a drag
  cursor(hit: InteractionHit): string;
  activate(hit: InteractionHit): void;     // click / tap
  pointerDown?(hit): boolean;              // return true to own the gesture (no activate follows)
  pointerMove?(hit | null): void;
  pointerUp?(): void;
  pointerLeave?(): void;
}
```

## Modules

```
room/
  index.ts              public exports
  createRoom.ts         public API: stage + view controller + lazy scene assembly
  assembleRoom.ts       wires the loaded scene: lighting, TV, camera rig, lava, interaction
  ViewController.ts     applies the view policy to the surface (pause/resume/input) and camera
  viewState.ts          pure reducer: view requests/arrivals → effects
  assets/
    roomAssets.ts       GLTFLoader + MeshoptDecoder; loads the five GLBs in parallel
    loadProgress.ts     byte-weighted progress across files
  stage/
    RoomStage.ts        renderer (sRGB, no tone mapping), scene, camera, DPR/buffer caps, resize, context loss
    RenderLoop.ts       render-on-demand scheduler: invalidate() + animation steps, coalesced per frame
    FramePacer.ts       presents game frames at most ~60/s (120 Hz displays report each state twice)
    roomLighting.ts     a small hemisphere for lava/glass; all static surfaces share a bake
    LavaLamp.ts         48 s lava clip at 24 fps, only while visible
  camera/
    CameraRig.ts        tv / room viewpoints, flights, reduced-motion cut, pointer parallax
    framing.ts          pure: fit points into (part of) the viewport for a fov and aspect
    cameraPath.ts       pure: arc interpolation between viewpoints, fov-for-aspect
    ScreenFade.ts       black veil for the reduced-motion cut
  tv/
    tvModel.ts          finds the screen/buttons in the TV asset; measured aperture constant
    Television.ts       the device: CRT + LED + room glow, power choreography
    CrtScreen.ts        ShaderMaterial on the glass, CanvasTexture updated on onFrame, power state
    crtShader.ts        GLSL: scanlines, aperture grille, bloom, vignette, power raster, glass
    powerTimeline.ts    pure: power-on/off animation as a function of time
    osd.ts              the TV's PAUSE on-screen display (5×7 bitmap font)
    ScreenGlow.ts       additive light-spill quads tinted by the screen's mean colour
    glowLayout.ts       where the spill lands in the attic (bezel, cabinet top, floor)
    PowerLed.ts         emissive LED + halo beside the power button
    TvInteractable.ts   the TV as an Interactable: focus button in the room, pointer surface on the TV
    screenMapping.ts    pure: picture rect in UV space, UV → native pixel
  interaction/
    Interactable.ts     the props contract
    RoomInteraction.ts  DOM pointer events → ray hits → hover cursor, click, gestures
  motion/easing.ts      easing curves (the room may not import engine runtime code)
  lab/                  dev lab: MockGameSurface + main.ts (served by room-lab.html)
```

## Assets

`public/room/` contains the revision-6 runtime export, generated and validated by `tools/room/`:

```sh
ROOM_SOURCE=/path/to/original/attic-room.blend pnpm build:room
pnpm verify:room
```

It produces `room.glb` (baked environment and lava animation), `tv-high.glb` (we open zoomed on the TV, so it ships at close-up detail), `pc-base.glb`, `radio-base.glb`, `ps2-base.glb`, and `manifest.json` with byte sizes, SHA-256 and source revision 6. Existing attribution remains in `CREDITS.txt`.
The loader imports a generated size table from `src/room/assets/roomAssetSizes.json` to weight download progress without another request. The pipeline keeps it synchronized with the public manifest. See the manifest for exact transfer sizes.
The existing device geometry is retained, with static device surfaces now baked in the same lighting as the furniture. Only the moving lava and its glass require live lighting; the CRT picture and additive glow remain dynamic. There is no runtime studio environment capture.
See [ROOM-ART-DIRECTION.md](ROOM-ART-DIRECTION.md) for the reference study and [the rebuild guide](../tools/room/README.md) for native source requirements. Normal application builds use the checked-in assets and do not require Blender. To import an already-built revision-6 runtime directory, use `ROOM_SOURCE=/path/to/optimized pnpm sync:room`.
The GLBs use `EXT_meshopt_compression`, `KHR_mesh_quantization`, `EXT_texture_webp`, `KHR_materials_unlit` and `KHR_materials_emissive_strength`; three's `GLTFLoader` with `MeshoptDecoder` handles all of them.
Baked surfaces already contain Blender's display transform (AgX), so the renderer uses `SRGBColorSpace` output and `NoToneMapping`.
`CREDITS.txt` must stay reachable from the site (several assets are CC BY 4.0).

### Original TV geometry contract (retained in revision 6)

Run `node scripts/inspect-glb.mjs public/room/tv-high.glb` (node tree, extras, world AABBs) and `node scripts/inspect-tv-screen.mjs public/room/tv-high.glb` (decoded UVs, normals and the visible aperture).

- The TV faces **-X** (into the room), standing on the white cabinet against the wall at x = 2.80.
  Whole-set bounds: x 2.153–2.657, y 0.486–1.076, z -0.625 to -0.015 (0.61 m wide, 0.59 m tall).
- Screen mesh `TV_Interactive_Screen_high`: `userData.interaction_id = "tv-screen"`, `replaceable_screen = true`, material `TV replaceable phosphor screen` (replaced by the CRT shader at runtime).
  117 vertices, curved: the centre is at x 2.159, the corners 2.5 cm further back.
  Its 0–1 UV square spans z -0.611 to -0.029 and y 1.056 to 0.615 (0.583 × 0.441 m, aspect 1.32).
  **Orientation:** u runs left → right as seen by the viewer (+Z), **v = 0 is the top edge**; with `flipY = false` the canvas maps upright and unmirrored (verified with the lab's corner labels).
- The bezel covers the UV square's rim. The straight-on visible aperture is u 0.058–0.942, v 0.050–0.950 with rounded corners (`TV_SCREEN_APERTURE`).
  The 4:3 picture is fitted inside it with a 2 % inset (`fitContentRect`), leaving a thin dark tube border like a real set; pointer mapping uses the same rect.
- Controls: `TV_Imported_Front_buttons_high` (`interaction_id = "tv-buttons"`) is the strip of round buttons under the printed labels POWER, VOLUME, CHANNEL, ACTION, TV/VIDEO (z -0.477 to -0.348, y ≈ 0.55). The large POWER button is its leftmost element.
  There is **no LED mesh**, so `PowerLed` mounts a 2.4 mm emissive lens with an additive halo 2.2 cm left of the button strip.
  Other parts: `Front_section` (bezel/shell), `rear_section`, `Logo` (Panasonic), `AV_front` jacks, `AV_back`, `Coax_connector`, `Screw`.
- Room surfaces around the TV (ray cast in `room.glb`): cabinet top y = 0.486, cabinet front face x = 2.144 (the TV stands flush with it), floor/rug top y ≈ 0.035, wall x = 2.80.
- The lava lamp's nodes carry `userData.supplied_asset = "lava"`; the `Lava flow` clip is 48 s.

## Rendering and performance

- **On demand.** `RenderLoop` only draws when asked: game frames (paced to ≤ 60/s), camera flights and parallax, power animations, lava ticks (24 fps, only when the lamp is in the frustum, the canvas on screen, the tab visible and reduced motion off) and resizes.
  Measured in the lab (headless Chromium, Apple GPU, 1440 × 900): ~60 fps with the game running on the TV, **0** with the game paused on the TV, 24 in the room view (lava), 0 in the room view under reduced motion.
- **Resolution.** DPR ≤ 2 and the drawing buffer ≤ 3 MP (1440 × 900 renders at DPR 1.52).
  Scanlines need roughly ≥ 2.5 device pixels per game row; below that the shader fades scanlines and the aperture grille out instead of letting them alias.
- **Cost.** Revision 6 uses 68 draw calls and ~353 k triangles in the room view; the TV view culls most of the room. The additional geometry refines the original chair, furniture edges and floorboards; static devices no longer need PBR lights or an environment capture.
  The picture texture is a 320 × 240 `CanvasTexture` re-uploaded with mipmaps only when the game reports a frame; the room glow reads the screen's mean colour from the 1 × 1 mip on the GPU (no pixel readback).
- **Memory.** Baked atlases dominate allocation. `pnpm verify:room` reports decoded texture pixels and enforces the budget; WebP reduces transfer size, not GPU allocation. No KTX2 yet. Device normal/roughness maps and the studio environment are no longer loaded at runtime.

## CRT look (crtShader.ts)

Linear-light pipeline: the sRGB canvas texture is decoded on sampling and re-encoded by three's `colorspace_fragment`.
Per pixel: content rect → power deflection and vertical roll → sharp-bilinear horizontal sampling (slight softness) → Gaussian beam per scanline (brighter rows bloom wider) → white raster mix during power-on → mip-based bloom on bright pixels → aperture grille in device pixels → vignette → rounded raster edge → glass (soft sheen, Fresnel) on top of a dark green-grey unlit tube.
Power-on (≈600 ms after a 140 ms LED lead): dot → horizontal line → vertical snap-open with overshoot → white raster fades into the picture with a brightness bloom and a short roll. Power-off reverses it. Under `prefers-reduced-motion` both are 160 ms fades and camera moves become a 280 ms fade-through-black cut.

## Dev lab and screenshots

```sh
pnpm dev                     # then open /room-lab.html  (?clean hides the panel, ?autopower=0 keeps the TV off)
node scripts/room-shots.mjs  # headless Chromium (Metal ANGLE) → .shots/room/*.png
node scripts/room-shots.mjs --only power-on,perf
```

`MockGameSurface` draws an animated test card at 320 × 240 with corner labels, a white edge ring and a crosshair at the reported pointer pixel, so mapping, pause/resume and the CRT look can be checked without the game.
The shot script uses Playwright's fake clock for frame-exact power-on frames, probes pointer mapping at the picture corners and prints frame rates per view.
Set `ROOM_SHOTS_GL=swiftshader` for software GL and `CHROMIUM_PATH` to choose a browser.

## Known gaps

- Clicks are ray-cast against registered interactables only, so a prop standing in front of the TV in the room view would not block a click on the TV (none does from the room viewpoint today).
- The room glow layout assumes the attic's TV placement (TV facing -X); moving the TV in Blender means re-measuring the three surface numbers in `glowLayout.ts`.
- `TV_SCREEN_APERTURE` is a measured constant; re-run `scripts/inspect-tv-screen.mjs` after a TV asset change.
- Device "high" LODs for the PC, radio and PS2 are not loaded (not needed until those props become interactive).
- Lab screenshots come from Apple-GPU headless Chromium; real low-end/mobile GPUs are untested.
