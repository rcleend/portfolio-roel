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
    overlayContainer,                   // same box, outside role="application": the computer's live screen goes here
    surface,                            // the game's GameSurface (320×240)
    onProgress: (f) => setLoading(f),   // 0–1, weighted by file size
  });
} catch {
  // WebGL unavailable: createRoom throws synchronously → use the flat host.
}

room.pc.setStill(paintDesktop); // usable before `ready`: what the monitor shows when the live screen does not
// render the computer's DOM into room.pc.screen; it is visible only while room.pc.live
// (the app does both in app/pc/PcSlot.tsx, see docs/PC.md)

await room.ready;          // assets loaded and the first frame drawn (TV dark, camera on the TV)
await room.powerOn();      // power LED, then the ~600 ms CRT turn-on; resolves when the picture is up
game.start();              // or surface.resume(); the boot scene's first frame lands on a live tube

room.onViewChange((view) => showHint(view));   // 'tv' | 'room' | 'pc', as the camera sets off
room.onSettle((view) => showChip(view));       // as it comes to rest
room.setFramingInsets({ top: 0, right: 0, bottom: touchPadHeight, left: 0 }); // keep the TV clear of overlays
room.onAnchorsChange((anchors) => placeHotspots(anchors)); // where the TV and the computer sit in the room view
// room.showRoom() / room.focusTv() / room.focusPc() for navigation.
// room.dispose() on unmount.
```

What the room does to the game, so the app does not have to:

| Moment | Effect on the surface | The computer's live screen |
| --- | --- | --- |
| `createRoom` | `setInputEnabled(true)` (the page opens on the TV) | hidden |
| Click/tap outside the TV while watching it, or `showRoom()` | pointer released, `setInputEnabled(false)`, `pause()` (only if running), camera flies to the room | hidden |
| Click/tap the TV in the room view, or `focusTv()` | camera flies back; on landing `resume()` (only if the room paused it) and `setInputEnabled(true)` | hidden |
| Click/tap the computer or the desk in the room view, or `focusPc()` | camera cranes onto the desk, straight in front of the monitor; the game stays paused with input disabled | revealed on the landing frame (`pc.live` turns true), fading in over 160 ms |
| Click/tap outside the computer (wall, window, desk…), Escape on the stage, or `showRoom()` while at or flying to the computer | camera pulls back to the room; the game stays paused | hidden synchronously, before the flight's first frame |
| Pointer over the picture while settled on the TV and powered on | `pointer.move(x, y)` in native pixels, `down()` / `up()`, `leave()` when it leaves the picture | — |

A game the app paused itself (a menu, a hidden tab) is never resumed by the room.
At the computer, its own parts (glass border, bezel, keyboard, mouse) do nothing when clicked: the visitor is using it. The radio cabinet and the lava lamp are scenery.
The app reaches the props without the mouse through hotspot buttons pinned at `room.anchors` (hidden until keyboard focus) and, whenever the portrait room view crops the computer out, a visible "◂ COMPUTER" chip on that edge (`app/overlays/room-hotspots`). Enter or Space on the room stage returns to the TV; Escape on the stage leaves the computer. Escape remains available to the game's menus at the TV.
The PAUSE on-screen display shows whenever the tube is on and `surface.paused` is true (checked on every drawn frame, since `GameSurface` has no pause event); the TV draws it, not the game.

### Public API

```ts
function createRoom(options: CreateRoomOptions): Room;

interface CreateRoomOptions {
  container: HTMLElement;
  overlayContainer?: HTMLElement;   // same box as `container`, outside role="application"; default `container`
  surface: GameSurface;
  onProgress?: (fraction: number) => void;
  assetBaseUrl?: string;            // absolute URL of the assets folder; default `${BASE_URL}room/`
  maxPixelRatio?: number;           // default 2
  maxDrawingBufferPixels?: number;  // default 3 000 000
}

interface Room {
  readonly ready: Promise<void>;
  readonly view: RoomView;                 // 'tv' | 'room' | 'pc', at or flying to
  readonly settled: boolean;               // the camera rests at `view`
  readonly powerState: PowerState;         // 'off' | 'powering-on' | 'on' | 'powering-off'
  powerOn(): Promise<void>;
  powerOff(): Promise<void>;
  focusTv(): void;
  showRoom(): void;
  focusPc(): void;                         // straight in front of the monitor; the game stays paused
  onViewChange(listener: (view: RoomView) => void): () => void;   // as the camera sets off
  onSettle(listener: (view: RoomView) => void): () => void;       // as it comes to rest
  setFramingInsets(insets: FramingInsets): void;   // CSS px covered by overlays
  registerInteractable(interactable: Interactable): () => void;
  readonly pc: PcMonitor;                  // the computer's monitor; usable before `ready`
  readonly anchors: readonly PropAnchor[]; // the TV and the computer in the settled room view
  onAnchorsChange(listener: (anchors: readonly PropAnchor[]) => void): () => void;
  readonly stats: RoomStats;               // frames, draw calls, triangles, DPR, lava, programs, pcTexturePixels,
                                           // backgroundPending (work still waiting for idle moments)
  dispose(): void;
}

interface PcMonitor {
  readonly screen: HTMLElement;            // content slot laid exactly over the picture; visible only while `live`
  readonly placement: ScreenRect;          // the picture on the page when settled at the PC (CSS px, device-pixel snapped)
  onPlacementChange(listener: (placement: ScreenRect) => void): () => void;
  readonly live: boolean;                  // true from the landing frame until the camera is asked to leave
  onLiveChange(listener: (live: boolean) => void): () => void;
  setStill(painter: StillPainter | null): void;   // what the glass shows otherwise; null = dark standby tube
  invalidateStill(): void;                 // repainted in the background, before the PC is next seen up close
  setLight(color: RgbColor | null): void;  // light the screen spills while live differs from the still
}
interface StillPainter {
  (context: CanvasRenderingContext2D, request: StillRequest): void;
  prepare?(request: StillRequest): Iterable<void>;  // the first paint's one-time work, a unit per yield
}
interface StillRequest {
  width: number; height: number;           // canvas px of the picture
  placement: ScreenRect;                   // the live screen's rectangle
  cpuCanvas: boolean;                      // a software GPU: make canvases painted ahead CPU ones
}

interface PropAnchor {                     // RoomTarget = 'tv' | 'pc'
  target: RoomTarget;
  x: number; y: number;                    // CSS px; clamped 24 px inside the nearest edge when out of frame
  inFrame: boolean;
  edge: 'left' | 'right' | 'top' | 'bottom' | null;
}

interface Interactable {                   // registered: the TV, the computer and its desk; extensible to other props
  readonly id: string;
  readonly object: Object3D;               // ray-cast target with its descendants as registered
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
  createRoom.ts         public API: stage + view controller + the computer's live screen + lazy scene assembly
  assembleRoom.ts       wires the loaded scene: lighting, TV, computer, camera rig, lava, interaction, anchors
  ViewController.ts     applies the view policy to the surface (pause/resume/input), the live screen and the camera
  viewState.ts          pure reducer: view requests/arrivals → effects
  assets/
    roomAssets.ts       GLTFLoader + MeshoptDecoder; loads the five GLBs in parallel
    loadProgress.ts     byte-weighted progress across files
    modelQueries.ts     mesh lookups shared by the device models
  stage/
    RoomStage.ts        renderer (sRGB, no tone mapping), scene, camera, DPR/buffer caps, resize, context loss
    RenderLoop.ts       render-on-demand scheduler: invalidate() + animation steps, coalesced per frame
    IdleWork.ts         work ahead of need, in small units on idle time: never in motion, never making a frame late
    softwareGpu.ts      pure: whether the GPU is software (2D canvases then paint on the CPU)
    sceneTextures.ts    every texture of the scene: anisotropy, disposal, and the upload of those no frame has drawn
    FramePacer.ts       presents game frames at most ~60/s (120 Hz displays report each state twice)
    roomLighting.ts     a small hemisphere for lava/glass; all static surfaces share a bake
    LavaLamp.ts         48 s lava clip at 24 fps, only while visible
  camera/
    CameraRig.ts        TV / room / computer viewpoints, flights, reduced-motion cut, pointer parallax
    roomFraming.ts      pure: the whole-room overview for an aspect, tall to wide
    framing.ts          pure: fit points into (part of) the viewport for a fov and aspect
    cameraPath.ts       pure: arc and crane interpolation between viewpoints, look-at lead, fov-for-aspect
    pageProjection.ts   pure: world points → page CSS px for a viewpoint (a scratch camera, never the live one)
    anchors.ts          pure: the props' positions in the settled room view, edge-clamped when cropped out
    ScreenFade.ts       black veil for the reduced-motion cut
  tv/
    tvModel.ts          finds the screen/buttons in the TV asset; measured aperture constant
    Television.ts       the device: CRT + LED + room glow, power choreography
    CrtScreen.ts        ShaderMaterial on the glass, CanvasTexture updated on onFrame, power state
    crtShader.ts        GLSL: scanlines, aperture grille, bloom, vignette, power raster, glass
    powerTimeline.ts    pure: power-on/off animation as a function of time
    osd.ts              the TV's PAUSE on-screen display (5×7 bitmap font)
    ScreenGlow.ts       additive light-spill quads tinted by a screen's mean colour (shared by every screen)
    glowLayout.ts       where the TV's spill lands in the attic (bezel, cabinet top, floor)
    PowerLed.ts         emissive LED + halo beside the power button
    TvInteractable.ts   the TV as an Interactable: focus button in the room, pointer surface on the TV
    screenMapping.ts    pure: picture rect in UV space, UV → native pixel
  pc/
    pcModel.ts          finds the glass, shell front, keyboard and desk; the picture's border and radius constants
    pcFraming.ts        pure: the straight-on viewpoint in front of the monitor
    glassPlane.ts       pure: the flat rectangle a display's picture is registered to
    projectorUvs.ts     pure: glass UVs re-projected from the settled eye
    screenPlacement.ts  pure: the picture's device-pixel-snapped rectangle on the page
    textureTier.ts      pure: still texture size from the landing size and device memory
    glassLayer.ts       pure: the static glass finish (edge shadow, lamp sheen)
    MonitorTexture.ts   the still: standby tube, composite (border + still + finish), upload, paint rules
    monitorGlow.ts      pure: light-spill patches on the bezel lip, desk top and keyboard
    Monitor.ts          the device: material swap, still, glow, registration, placement, light override
    ScreenOverlay.ts    the room-owned live DOM screen: position, clip, glass finish, reveal/conceal
    PcMonitor.ts        the public PcMonitor object and its types
    PcInteractable.ts   the computer and the desk as click targets
  interaction/
    Interactable.ts     the props contract
    RoomInteraction.ts  DOM pointer events → ray hits → hover cursor, click, gestures
    pickMeshes.ts       what a pointer ray tests: large meshes cut into compact chunks, in the background
  motion/easing.ts      easing curves (the room may not import engine runtime code)
  lab/                  dev lab: MockGameSurface, MockPcScreen + main.ts (served by room-lab.html)
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
The night rig keeps blue window highlights, tungsten desk light and amber lava glow, with substantially reduced ambient/fill illumination for deep shadows and stronger local contrast. The pillow, ceiling beams and wall posters are removed. The folded rug is square at the original width and rotated 15° clockwise; its raised corner is nearest the TV. Desk drawer fronts share the white enamel, and the oak floor has more natural grain. Changing the baked mood requires rebuilding all atlases.
The monitor, keyboard and mouse are rebuilt as a lightweight beige 1990s desktop set from the linked Sketchfab visual reference. The existing tower under the desk remains; desktop cables and floppy disks are removed.
The original lightweight wastepaper basket is moved clear of the desk. Its 15 inner papers settle onto the base in an offline physics pass; the three original floor papers remain. No runtime geometry or physics is added. The TV's pre-overhaul surface maps are restored before the night bake; its screen and interactions remain unchanged.
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
  Measured in the lab (headless Chromium, Apple GPU, 1440 × 900): ~60 fps with the game running on the TV, **0** with the game paused on the TV, 24 in the room view (lava), 0 in the room view under reduced motion, **0** while seated at the computer (the lava lamp is out of shot; the live screen is DOM).
  In the app with the real screen (`e2e/pc-flow.spec.ts` keeps it so): one frame from the landing to the open reader (the white page's light), then none while the visitor reads or scrolls.
- **Work ahead of need.** `IdleWork` runs background work in small units in idle callbacks, from the first frame on, and asks the room first what the screen is doing:
  - the camera flies, or the TV turns on or off (from the moment its LED lights): nothing runs, since a unit invisible on a still frame is a dropped frame in motion;
  - the game plays on the TV, or the visitor uses the computer's live screen: a unit runs only when the idle period left can hold it, judged by how long its task's previous unit took (or, for a task's first, the longest so far), so no frame is late; units marked `QUIET` (GPU uploads, whose cost the main thread cannot time, and work only needed where nothing plays) wait;
  - otherwise (the dark TV behind the loading screen, a paused game, the room view): units run until the idle period is spent, always at least one.

  On a device too slow to fit a unit between the game's frames the work waits for a quiet moment, or for the flight that needs it. The room queues:
  - **The pick chunks** (below), for quiet moments: the loading screen's fade and the room view.
  - **The monitor's glass finish**, in bands of 32 rows (17-50 ms in all on a phone twenty times slower than a laptop).
  - **The monitor's still**, as soon as the app hands over its painter (§ The computer's monitor).
  - **Every texture no frame has drawn yet** (`sceneTextures.ts`), one upload per unit, for quiet moments, once the visitor first leaves the TV. three uploads a texture the first time a frame draws it: the TV view's own are on the GPU with the first frame; the first look around draws (and uploads) the rest of the room mid-flight, as it did before the computer; and the room view's quiet uploads what only the flight to the computer draws (two 2048² atlases on a portrait phone, 27-36 ms each at 6× CPU). A visitor who stays at the TV never allocates the room's other atlases: 97.8 MB of textures at the TV, as before the computer, against 221 MB once the room has been seen.
- **Pointer picking.** Every pointer event casts one ray at the registered props. three.js tests every triangle of a mesh whose bounds the ray crosses, and the baked desk is one 54 k-triangle mesh that spans the left half of the room, so `pickMeshes` cuts meshes over 8192 triangles into chunks of at most 1024 that share the mesh's attributes and carry their own bounds; a ray tests only the chunks it crosses and finds the same hits. A pick costs at most 0.7 ms (2.5 ms at 6× CPU) instead of 3.3 ms (23 ms). Cutting the desk takes about 9 ms (50 ms at 6×), in units of 4096 triangle visits in quiet moments after the first frame (under the loading screen's fade, else in the room view); until then rays test the whole meshes (from the TV, rays point away from the desk).
- **Software GPUs.** Where the GPU is software (SwiftShader, llvmpipe: `softwareGpu.ts` reads the renderer's name), a 2D canvas the browser accelerates queues its raster behind the room's frames on the same CPU: the computer's first wallpaper paint took the running game 1.1 s there. The monitor then paints its still and glass finish on CPU canvases (`willReadFrequently`) and asks the app's painter to do the same (`StillRequest.cpuCanvas`), so the work lands on the main thread, 7 ms of it, in the idle moments the room chooses.
- **The game and the TV's turn-on stay as they were** (production builds, 3-6 runs each against the build before the computer): at 20× CPU on a phone, the game's first 3 s run at 52-61 frames/s with a worst frame gap of 21-32 ms (before: 54-60, 20-32 ms) and the turn-on's worst gap is 83-92 ms (81-89 ms), with no long task in either; under SwiftShader the game's longest frame is 82-139 ms (90-205 ms) and nothing freezes it; at 6× the game's worst gap is 11-18 ms (10-17 ms).
- **Flights on a slow CPU** (production build, Apple GPU, 6× CPU throttling, clicks pressed for 80 ms): no long task over 50 ms in any flight to or from the computer, and the click answers with a flight frame within 10–16 ms. The first leave from the TV takes 26 ms from pointerup to the first flight frame (26 ms before the computer existed): the still was prepared between the game's frames and only its upload is left for the click. On a phone twenty times slower than a laptop no unit fits between the game's frames, and the first leave pays the still once, about 110-125 ms after the game has paused and before the camera moves. A visitor's first gesture also creates the page's `AudioContext`, a 100–135 ms task at 6× in headless Chromium (app audio, before this room).
- **First frame.** The background work starts after it: 1049 ms at 6× (1062 ms before the computer existed), 4186 ms on a phone at 20× (4275 ms).
- **Resolution.** DPR ≤ 2 and the drawing buffer ≤ 3 MP (1440 × 900 renders at DPR 1.52).
  Scanlines need roughly ≥ 2.5 device pixels per game row; below that the shader fades scanlines and the aperture grille out instead of letting them alias.
- **Cost.** Revision 6 uses 57 draw calls and ~337 k triangles in the room view, plus 3 for the monitor's light spill once it shows a still; the TV view culls most of the room. The five runtime GLBs and credits total 6.97 MB, with 44.84 million decoded texture pixels. The additional geometry refines the original chair, furniture edges and floorboards; static devices no longer need PBR lights or an environment capture.
  The picture texture is a 320 × 240 `CanvasTexture` re-uploaded with mipmaps only when the game reports a frame; the room glow reads the screen's mean colour from the 1 × 1 mip on the GPU (no pixel readback).
- **Memory.** Baked atlases dominate allocation. `pnpm verify:room` reports decoded texture pixels and enforces the budget; WebP reduces transfer size, not GPU allocation. No KTX2 yet. Device normal/roughness maps and the studio environment are no longer loaded at runtime.

## CRT look (crtShader.ts)

Linear-light pipeline: the sRGB canvas texture is decoded on sampling and re-encoded by three's `colorspace_fragment`.
Per pixel: content rect → power deflection and vertical roll → sharp-bilinear horizontal sampling (slight softness) → Gaussian beam per scanline (brighter rows bloom wider) → white raster mix during power-on → mip-based bloom on bright pixels → aperture grille in device pixels → vignette → rounded raster edge → glass (soft sheen, Fresnel) on top of a dark green-grey unlit tube.
Power-on (≈600 ms after a 140 ms LED lead): dot → horizontal line → vertical snap-open with overshoot → white raster fades into the picture with a brightness bloom and a short roll. Power-off reverses it. Under `prefers-reduced-motion` both are 160 ms fades and camera moves become a 280 ms fade-through-black cut.

## The computer's monitor (`pc/`)

The room owns the monitor as a device and knows nothing about what the app shows on it, just as it shows a `GameSurface` it does not understand.

- **Glass contract.** `pc-base.glb`'s `PC_Interactive_Screen_base` (`interaction_id "pc-screen"`, `replaceable_screen`) faces +Z with planar UVs (v = 0 at the top); `pnpm verify:room` asserts both (within 0.5° and 0.002), because the flat DOM screen and the projector UVs depend on them. Bounds x −1.518…−1.162, y 0.929…1.213, z −1.679…−1.668 (11 mm of bulge); the picture is that rim rectangle inset by a 10 mm tube border with 6 mm corners (`PC_PICTURE_BORDER`, `PC_PICTURE_RADIUS`), everything else is found at runtime.
- **Camera.** `pcViewpoint` looks exactly along −facing (zero pitch, yaw and roll) and fits the glass plus 18 mm of bezel (30 mm chin) into the whole viewport with a 2 % margin, starting at a 30° lens and widening while the eye would be further than 0.72 m from the glass (it stays clear of the chair). Clicking outside the computer is a way back to the room, so the frame always leaves 6 % of room beyond the CRT shell, on both sides of it or above it, whichever keeps the picture larger: wide and tall screens already do; squarer ones (4:3, 5:4, a window that is not maximised) step back for it, so 1024 × 768 shows the window and the wall beside the monitor round a 635 × 499 picture. Flights to and from it take the usual 1.1 s on a crane path (control point halfway across, 5 cm above the higher eye, at the desk eye's depth) that clears the chair back by 27 cm (landscape) to 18 cm (portrait); arriving, the look-at reaches the glass at 82 % of the flight, so the landing is a pure settle.
- **Material.** The glass keeps its baked unlit `MeshBasicMaterial`, cloned with only its `map` swapped, so the computer compiles no shader program (7 in the lab after the first room view, before and after). The baked 2048² desktop picture is disposed and its `ImageBitmap` closed at assembly, before it could ever be uploaded.
- **Still.** One canvas covering the glass's UV square: tube colour, the app's still painter clipped to the rounded picture, the glass finish on top, uploaded with `renderer.initTexture`. Its width follows the glass's size at the landing in render pixels (≤ 600 → 512, ≤ 900 → 768, else 1024; at most 768 when `navigator.deviceMemory` ≤ 2), so at most 1024 × 817. It is made in the background (`IdleWork`) as soon as the app hands over a painter, and again whenever `invalidateStill()` or a new size or placement makes it stale while the glass can be seen: the painter's own preparation (`StillPainter.prepare`, its fonts and wallpaper) and the composition are units that may go between the game's frames, and the upload waits for a quiet moment, so the TV view allocates nothing for it. A flight that starts before the background got there finishes the job first (what is left of it, usually the upload): any flight when nothing is shown yet, a flight to or from the computer when the still is stale; and a still that went stale on the way in (a resize, the clock's minute) is repainted on the landing frame, before the live screen fades in over it. Nothing paints per frame. Until a painter exists, or if one throws (warned once), the glass shows a 1 × 1 dark standby tube.
- **Registration.** On every pose change the glass's UVs are replaced by a projection from the settled eye onto the rim plane, so from that eye the texture is exactly the flat rectangle the DOM covers: the hand-off differs by 2.1/255 on average (lab test card, 1440 × 900 @2).
- **Live screen.** `ScreenOverlay` lays `div[data-pc-screen]` over the picture in the overlay container: a device-pixel-snapped 2D translate, rounded clip, `contain: strict`, and the very glass-finish canvas the still uses, stretched over the glass and clipped. It is revealed in the landing frame's callback (160 ms fade unless reduced motion) and concealed synchronously in the request to leave, so the flight's first frame (identical to the still) is the next thing painted. While it is live the room draws nothing; `setLight` (e.g. a white page) renders one frame of brighter spill.
- **Light spill.** Three `ScreenGlow` patches (the TV's shader and program) on the bezel lip, the desk in front of the monitor and the keyboard, tinted by the still's 1 × 1 mip or the `setLight` colour. The bezel's emitter has the picture's rounded corners, so the corners catch the same light as the border along the edges.
- **Glass finish.** An edge shadow (23 % in the corners, 8 % at the edge midpoints, nothing over the central 70 %) and a 6.5 % warm sheen of the desk lamp at the top left, the top of their tuning range, so the screen reads as a tube's curved glass.

## Dev lab and screenshots

```sh
pnpm dev                     # then open /room-lab.html  (?clean hides the panel, ?autopower=0 keeps the TV off,
                             #   ?view=pc flies to the computer after power-on, ?mockpc=1 puts a test card on it)
node scripts/room-shots.mjs  # headless Chromium (Metal ANGLE) → .shots/room/*.png
node scripts/room-shots.mjs --only power-on,perf
node scripts/room-shots.mjs --only pc-desktop,pc-phone,pc-flight,pc-handoff
```

`MockGameSurface` draws an animated test card at 320 × 240 with corner labels, a white edge ring and a crosshair at the reported pointer pixel, so mapping, pause/resume and the CRT look can be checked without the game.
`MockPcScreen` paints the computer's still and its live screen from one test card (a 50 px grid, an edge ring, labelled corners and colour ramps), so registration and the hand-off can be measured; the lab's status line shows the view, `live`, frames, draw calls, programs and the still's pixels.
The shot script uses Playwright's fake clock for frame-exact power-on and crane-flight frames, probes pointer mapping at the picture corners, prints the hand-off difference and prints frame rates per view and per flight.
Set `ROOM_SHOTS_GL=swiftshader` for software GL and `CHROMIUM_PATH` to choose a browser.

## Known gaps

- Clicks are ray-cast against registered interactables only, so a prop standing in front of the TV in the room view would not block a click on the TV (none does from the room viewpoint today).
- The room glow layout assumes the attic's TV placement (TV facing -X); moving the TV in Blender means re-measuring the three surface numbers in `glowLayout.ts`. Likewise `monitorGlow.ts` measures the desk top (y 0.785).
- `TV_SCREEN_APERTURE` is a measured constant; re-run `scripts/inspect-tv-screen.mjs` after a TV asset change.
- `pc-base.glb` still ships the baked 52 KB desktop picture that the room discards at assembly; strip it at the next asset rebuild (`optimize.mjs` dropping base-colour textures of `replaceable_screen` materials, asserted by `verify:room`).
- Device "high" LODs for the PC, radio and PS2 are not loaded; the PC's base LOD carries the close-up.
- Under software GL the room is fill-bound everywhere (flights 5–15 fps under SwiftShader, the computer's no slower than the TV's); adaptive flight resolution is a room-wide follow-up. The first frame under SwiftShader comes about 60 ms later than before the computer (it did in the previous round too).
- The first look around uploads the room's atlases the TV view never drew in the middle of its flight (as before the computer: a few frames over 34 ms at 6×, a 277 ms task at the reduced-motion cut). Uploading them ahead at the TV would cost every visitor ~120 MB of GPU memory and, on weak or software GPUs, frames of the game; KTX2/Basis textures with pre-built mipmaps would make the uploads cheap enough for both and cut texture memory by about four, a room-wide follow-up.
- Lab screenshots come from Apple-GPU headless Chromium; real low-end/mobile GPUs are untested.
