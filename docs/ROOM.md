# Room host (`src/room`)

The three.js attic that presents a `GameSurface` on a CRT television, a computer the app fills with its own DOM and a CD player the app plays music through.
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

const deck = await room.radio.load();  // the CD player's deck, its chunk imported on first call (room.radio is its door)
deck.setDiscs(discs);        // the CD player's discs and, below, its state
deck.setState(state);        // the app owns albums, tracks and sound (app/radio/RadioSlot.tsx, see docs/RADIO.md)

room.onViewChange((view) => showHint(view));   // 'tv' | 'room' | 'pc' | 'radio', as the camera sets off
room.onSettle((view) => showChip(view));       // as it comes to rest
room.setFramingInsets({ top: 0, right: 0, bottom: touchPadHeight, left: 0 }); // keep the TV clear of overlays
room.onAnchorsChange((anchors) => placeHotspots(anchors)); // where the TV, the computer and the radio sit in the room view
// room.showRoom() / room.focusTv() / room.focusPc() / room.focusRadio() for navigation.
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
| Click/tap the radio, its cabinet or the lava lamp in the room view, or `focusRadio()` | camera flies to the CD player (§ The CD player); the game stays paused with input disabled; the lid opens and the discs rise | hidden; `radio.controls` goes live on the landing frame |
| Click/tap outside the radio (cabinet, lamp, wall…), Escape on the stage, or `showRoom()` while at or flying to the radio | `radio.controls` hidden synchronously; the discs sink home, the lid closes, the camera pulls back; the game stays paused | hidden |
| Pointer over the picture while settled on the TV and powered on | `pointer.move(x, y)` in native pixels, `down()` / `up()`, `leave()` when it leaves the picture | — |

A game the app paused itself (a menu, a hidden tab) is never resumed by the room.
At the computer, its own parts (glass border, bezel, keyboard, mouse) do nothing when clicked: the visitor is using it; at the radio, so does its body.
The app reaches the props without the mouse through hotspot buttons pinned at `room.anchors` (hidden until keyboard focus; "Play some music" only while `radio.available`) and, whenever the portrait room view crops the computer or the radio out, a visible edge chip ("◂ COMPUTER", "RADIO ▸") on that edge (`app/overlays/room-hotspots`), shown once the camera has landed and raised onto the bare wall above its prop's height, so it never reads as the label of the radio or the lamp standing there. Enter or Space on the room stage returns to the TV; Escape on the stage leaves the computer or the radio. Escape remains available to the game's menus at the TV.
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
  readonly view: RoomView;                 // 'tv' | 'room' | 'pc' | 'radio', at or flying to
  readonly settled: boolean;               // the camera rests at `view`
  readonly powerState: PowerState;         // 'off' | 'powering-on' | 'on' | 'powering-off'
  powerOn(): Promise<void>;
  powerOff(): Promise<void>;
  focusTv(): void;
  showRoom(): void;
  focusPc(): void;                         // straight in front of the monitor; the game stays paused
  focusRadio(): void;                      // the CD player on the cabinet; the game stays paused
  onViewChange(listener: (view: RoomView) => void): () => void;   // as the camera sets off
  onSettle(listener: (view: RoomView) => void): () => void;       // as it comes to rest
  setFramingInsets(insets: FramingInsets): void;   // CSS px covered by overlays
  registerInteractable(interactable: Interactable): () => void;
  readonly pc: PcMonitor;                  // the computer's monitor; usable before `ready`
  readonly radio: RadioDeck;               // the CD player (src/room/radio/RadioDeck.ts); usable before `ready`
  readonly anchors: readonly PropAnchor[]; // the TV, the computer and the radio in the settled room view
  onAnchorsChange(listener: (anchors: readonly PropAnchor[]) => void): () => void;
  readonly stats: RoomStats;               // frames, draw calls, triangles, DPR, lava, programs, pcTexturePixels,
                                           // backgroundPending (work still waiting for idle moments), radioReady,
                                           // radioTexturePixels, radioLidDegrees, radioAmbient
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

interface PropAnchor {                     // RoomTarget = 'tv' | 'pc' | 'radio'
  target: RoomTarget;
  x: number; y: number;                    // CSS px; clamped 24 px inside the nearest edge when out of frame
  inFrame: boolean;
  edge: 'left' | 'right' | 'top' | 'bottom' | null;
}

interface Interactable {                   // registered: the TV, the computer and its desk, the radio; extensible
  readonly id: string;
  readonly object: Object3D;               // ray-cast target with its descendants as registered
  readonly gestureSurface?: Object3D;      // ray target while it owns a drag
  intersect?(raycaster: Raycaster): { hit: InteractionHit; distance: number } | null;
                                           // its own ray test, used instead of casting at `object` (and never cut
                                           // into pick chunks): proxies, a mesh filtered by region, moving parts
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
    slowDevice.ts       pure: whether the device is slow (a software GPU, or a first flight under 30 fps), for the radio and the posters
    stripUpload.ts      a large texture uploaded a 1 MB strip per background unit (the radio's 2K skin, the posters)
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
  radio/                the CD player; only the door, the click target and the model lookup are in the room chunk
    RadioDeck.ts        the public RadioDoor and RadioDeck types
    RadioDoor.ts        room.radio (room chunk): available, prefetch, load() → the deck; imports deckChunk.ts just
                        after the first TV leave's first flight frame, on a prefetch or on a request for the radio view (which waits)
    RadioInteractable.ts the radio, its cabinet and the lava lamp as one click target (room chunk; the table below)
    radioModel.ts       finds the radio and its cabinet in the assets (room chunk; the lamp's bounds come from LavaLamp)
    deviceFacts.ts      Save-Data and device-memory probes (room chunk)
    deviceContract.ts   the seam to the lazy device (types only): RadioHost, RadioLink, RadioDevice
    deckChunk.ts        the radio's lazy chunk (`radioDevice`): the deck below and the device, one chunk
    RadioDeckHandle.ts  the deck: listeners, live, label size; remembers discs/state until the device exists
    RadioParts.ts       the radio view's half of the click target: the device's discs, well and keys
    radioFraming.ts     pure: the 24° viewpoint over the radio and its discs, lens, lamp truck, portrait crop; the
                        measured lid and hinge
    discLayout.ts       pure: the disc slots (arc or stack) for a count and aspect; label size
    ControlsLayer.ts    the app's controls slot over the room, shown only while live
    rendererInfo.ts     renderer string, device memory and Save-Data probes
    device/             the `radioDevice` chunk, loaded on demand
      RadioDevice.ts    createRadioDevice: download, parse, cut, prepare; the device (state, gestures, cues, frames)
      choreography.ts   pure: every disc, the lid and the keys as functions of time; cues as timed moments
      discMotion.ts     pure: rise, glide and flip, settle, flight, drop and bounce, unseat, idle, attention
      lidMotion.ts      pure: push, pop, the damped swing and the close as timed plans
      keyMotion.ts      pure: rocker tilt and side-key travel, hold and spring release, key shading
      springs.ts        pure: closed-form damped springs and spin tracks
      deckLayout.ts     pure: the deck's measured seat, slot and keys; the layout on the page
      Discs.ts          the disc meshes, labels (one upload per idle unit), radial averages, analytic picking
      discGeometry.ts   one 512-triangle disc (label face, data face, edge, hole wall)
      discShader.ts     the discs' one program: foil, diffraction, label, spin blur; JS mirrors for tests
      radialAverage.ts  a label's 64-bin radial average (the label at play speed)
      Lcd.ts            the segment display: canvas, warm-up flicker, fades, blink
      lcdSegments.ts    pure: glyphs and the readout's frame
      closeUpAsset.ts   radio-closeup.glb: extras, fingerprints, cut lists, pivots; the 2K skin
      cutParts.ts       pure: cut triangle lists out of an indexed mesh (shared attributes)
      deviceTier.ts     pure: 2K skin rule (the slow tier is stage/slowDevice.ts)
      AmbientPacer.ts   the idle float at ≤ 30 frames per second
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
  posters/
    PostersSlot.ts      the room's half: the TV-side import and fetch, the first-departure hook, the cut hold, stats
    posterKit.ts        what the lazy wall uses of the room's chunk, handed over: tier, boxes, materials, uploader
    posterTier.ts       pure: the 2K or the 1K atlas, from the room view's focal length, memory, Save-Data, GPU
    posterVisibility.ts pure: each piece's box from the glb, and whether a pose's frame holds any of them
    PosterWall.ts       the `posterWall` chunk: parse, decode, strip upload, compile, reveal or fade, per-pose hide
  interaction/
    Interactable.ts     the props contract
    RoomInteraction.ts  DOM pointer events → ray hits → hover cursor, click, gestures
    pickMeshes.ts       what a pointer ray tests: large meshes cut into compact chunks, in the background
  motion/easing.ts      easing curves (the room may not import engine runtime code)
  lab/                  dev lab: MockGameSurface, MockPcScreen, MockRadioApp + main.ts (served by room-lab.html)
```

## Assets

`public/room/` contains the revision-6 runtime export, generated and validated by `tools/room/`:

```sh
ROOM_SOURCE=/path/to/original/attic-room.blend pnpm build:room
pnpm verify:room
```

It produces `room.glb` (baked environment and lava animation), `tv-high.glb` (we open zoomed on the TV, so it ships at close-up detail), `pc-base.glb`, `radio-base.glb`, `ps2-base.glb`, and `manifest.json` with byte sizes, SHA-256 and source revision 6, then the radio's lazy `radio-closeup.glb` and `radio-skin-2k.webp` and the posters' `posters.glb`, `posters-2k.webp` and `posters-1k.webp` (`lazyFiles`; § The CD player, § Posters). Existing attribution remains in `CREDITS.txt`, which now also records the close-up.
The loader imports a generated size table from `src/room/assets/roomAssetSizes.json` to weight download progress without another request. The pipeline keeps it synchronized with the public manifest. See the manifest for exact transfer sizes.
The existing device geometry is retained, with static device surfaces now baked in the same lighting as the furniture. Only the moving lava and its glass require live lighting; the CRT picture and additive glow remain dynamic. There is no runtime studio environment capture.
The night rig keeps blue window highlights, tungsten desk light and amber lava glow, with substantially reduced ambient/fill illumination for deep shadows and stronger local contrast. The pillow and ceiling beams are removed; the old wall posters gave way to the decorated walls (§ Posters). The folded rug is square at the original width and rotated 15° clockwise; its raised corner is nearest the TV. Desk drawer fronts share the white enamel, and the oak floor has more natural grain. Changing the baked mood requires rebuilding all atlases.
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
  - the camera flies, or the TV turns on or off (from the moment its LED lights): nothing runs but urgent work (the radio's preparation on the way to it, whatever of the posters' the first departure finds unfinished), and that only as it may while the game plays, since a unit invisible on a still frame is a dropped frame in motion; a sliced urgent task (`sliceMs`, the posters') also gets one unit right after a frame that leaves no idle period or too short a one, while its units of that kind stay within the slice (6.5 ms; the median of its last three CPU units or of its last three uploads, and none of them judges before three have been timed, so neither the set-up unit before the strips nor one slow first strip, a phone's first copy out of a fresh bitmap at 7.6–20.9 ms against 0.3–5 ms for the rest at 6× CPU, ends the slicing), because a slow CPU drawing a large canvas grants the flight slivers of idle time at most and the flight itself is waiting for that work;
  - the game plays on the TV, or the visitor uses the computer's live screen: a unit runs only when the idle period left can hold it, judged by how long its task's previous unit took (or, for a task's first, its own estimate, `estimateMs`, else the longest so far), so no frame is late, and a unit at the head of the queue that does not fit steps aside for the first behind it that does; units marked `QUIET` (GPU uploads, whose cost the main thread cannot time, and work only needed where nothing plays) wait, except a task's small uploads (`smallUploads`: the posters' 1 MB strips at the TV), which run like CPU units, each with an idle period to itself;
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
- **Still.** One canvas covering the glass's UV square: tube colour, the app's still painter clipped to the rounded picture, the glass finish on top, uploaded with `renderer.initTexture`. Its width follows the glass's size at the landing in render pixels (≤ 600 → 512, ≤ 900 → 768, else 1024; at most 768 when `navigator.deviceMemory` ≤ 2), so at most 1024 × 817. It is made in the background (`IdleWork`) as soon as the app hands over a painter, and again whenever `invalidateStill()` or a new size or placement makes it stale while the glass can be seen (in the room view, at the computer and on any flight; the TV's and the radio's frames keep it out of sight, so there a stale still waits for the next flight and a resting radio draws no frame for the clock's minute): the painter's own preparation (`StillPainter.prepare`, its fonts and wallpaper) and the composition are units that may go between the game's frames, and the upload waits for a quiet moment, so the TV view allocates nothing for it. A flight that starts before the background got there finishes the job first (what is left of it, usually the upload): any flight when nothing is shown yet, a flight to or from the computer when the still is stale; and a still that went stale on the way in (a resize, the clock's minute) is repainted on the landing frame, before the live screen fades in over it. Nothing paints per frame. Until a painter exists, or if one throws (warned once), the glass shows a 1 × 1 dark standby tube.
- **Registration.** On every pose change the glass's UVs are replaced by a projection from the settled eye onto the rim plane, so from that eye the texture is exactly the flat rectangle the DOM covers: the hand-off differs by 2.1/255 on average (lab test card, 1440 × 900 @2).
- **Live screen.** `ScreenOverlay` lays `div[data-pc-screen]` over the picture in the overlay container: a device-pixel-snapped 2D translate, rounded clip, `contain: strict`, and the very glass-finish canvas the still uses, stretched over the glass and clipped. It is revealed in the landing frame's callback (160 ms fade unless reduced motion) and concealed synchronously in the request to leave, so the flight's first frame (identical to the still) is the next thing painted. While it is live the room draws nothing; `setLight` (e.g. a white page) renders one frame of brighter spill.
- **Light spill.** Three `ScreenGlow` patches (the TV's shader and program) on the bezel lip, the desk in front of the monitor and the keyboard, tinted by the still's 1 × 1 mip or the `setLight` colour. The bezel's emitter has the picture's rounded corners, so the corners catch the same light as the border along the edges.
- **Glass finish.** An edge shadow (23 % in the corners, 8 % at the edge midpoints, nothing over the central 70 %) and a 6.5 % warm sheen of the desk lamp at the top left, the top of their tuning range, so the screen reads as a tube's curved glass.

## The CD player (`radio/`)

The radio on the cabinet is the room's third device. The room owns the machine — the lid, the keys, the discs floating over it and seated in its well, the LCD and the OPR LED, the camera and what the pointer does to them — and knows nothing about albums, tracks or sound: the app drives it declaratively (`room.radio.setDiscs`, `setState`) and hears back through intents, cues and `seated` (`RadioDeck.ts` is the contract; `app/radio/RadioSlot.tsx` the app side, see docs/RADIO.md).

### Who loads what

| What | Where | When |
| --- | --- | --- |
| The door (`RadioDoor`, `room.radio`), the click target (`RadioInteractable`: the radio, its cabinet and the lamp), `radioModel` | room chunk | first load, with nothing of it solved before the room's first frame |
| The deck (`RadioDeckHandle`, `ControlsLayer`, `RadioParts`, `radioFraming`, `discLayout`), with the device below in one chunk (`deckChunk.ts`, so that three.js stays in the room chunk) | lazy | imported as the camera first sets off from the TV (behind that flight), or on a prefetch or a request for the radio view, which waits for it (the latest request wins); the camera frames the radio through a hook the deck installs (`CameraRig.setRadioFraming`), the radio's pose solved when first needed and again only after a resize or new insets |
| The device (`radio/device/**`, in the same chunk), `radio-closeup.glb` (56 KB, downloaded beside the chunk, not after it), `radio-skin-2k.webp` (179 KB, downloaded after the close-up on devices it is for, decoded off the main thread only on an intent) | lazy | `prefetch('idle')` from the app, `prefetch('intent')` when the pointer reaches a radio target in the room view or the hotspot gets focus, or the approach; Save-Data: intent only |
| Preparation, one `IdleWork` unit at a time: CPU units between the frames of whatever plays (the game, the computer's screen, the discs' float) when they fit the idle period; GPU uploads (the atlas, the prints, the skin's strips) only when nothing plays, because the main thread cannot time what an upload costs a weak GPU; nothing while the camera moves. On the way to the radio and there its tasks are urgent: they also run between the flight's frames, uploads included, when they fit (the landing and the visit wait for them), and a print or a strip that has waited 400 ms for an idle period that can hold it runs in the next one anyway, one per period (judged by the longest unit so far, the close-up's assembly, none might fit between the float's frames on a fast display, and the prints would wait seconds for the float to rest) | — | parse the close-up (in meshopt's worker); check its fingerprint of `radio-base.glb`, plan all five cuts (the lid, the rocker's halves, the side keys: lists precomputed by the build, shared attributes, same material or a clone, same program) and check every part lies where the build measured it before any base mesh changes; build the well, lid underside, LCD, LED and discs; upload the close-up atlas; one label and its radial average per unit; the 2K skin, after an intent (a hover or a focus; on a touch screen, which cannot hover, the tap that starts the flight, so a phone that never visits the radio never holds its 20 MB on the GPU), in 16 strips of 128 rows (≈ 1 MB, a millisecond each) with the mipmaps on the last, so no unit is the whole 2048² upload (30–40 ms, 80 ms on a slow phone) and the skin is up within moments of the arrival |
| The disc program | — | compiled with `renderer.compileAsync` at the approach, never at idle: the first room view and the computer keep their 7 programs; the radio adds one. The discs rise only once it is ready (one that rose before would appear mid-air). Shader error checks (a synchronous GPU read per program) run in development only |

Nothing of the radio is requested before the first room view (`e2e/radio-deck.spec.ts`, and in the real app `e2e/radio-flow.spec.ts`). In the app, `prefetch('idle')` comes 0.4 s after the camera rests in the room view, so a visitor who heads for the radio at once still finds its device preparing on the way, and the player 3 s after (docs/RADIO.md › Loading). Nothing the device prepares reads the GPU back: the slow tier's software-renderer test is the stage's `softwareGpu`, read once when the renderer is made, and the app paints its prints on CPU canvases. Away from the radio a new deck state draws nothing (the lid is shut and the choreography is a function of time, so the next visit samples it). The discs rise whether or not their prints are there; the prints show together once the last is up, fading in over the bare silver in 260 ms at the radio. A close-up that fails to load, a fingerprint or a cut part that does not match (a room rebuild without `pnpm build:radio`) or a chunk that fails makes the radio scenery again (at runtime the fingerprint is each base mesh's vertex and triangle count, and each cut part's measured bounds; the build's SHA-256 of the geometry is checked by `pnpm verify:room`, not in the browser), its base meshes exactly as baked: `available` turns false (warned once), the hotspot hides, the interactable answers nothing and a camera at or flying to the radio returns to the room.

### Views and interaction

`viewState` gains `'radio'` with three effects: `approachRadio` after `moveCamera` (the device schedules the lid from `FLIGHT_MS`/`REDUCED_FADE_MS`), `revealRadio` on arrival (`radio.controls` goes live) and `concealRadio` prepended to every request that leaves it (controls hidden synchronously, before the camera moves). `RadioInteractable` is one click target for the radio, its cabinet (`04_Drawer_surfaces`, hits between x 0.30 and 1.40 only: the mesh also holds the floor books and the mains cable) and the lava lamp (a proxy box), through the new optional `Interactable.intersect` (its own ray test; never cut into pick chunks):

| View | Floating disc | Disc in the well | ▷II / ■ halves, ⏮ / ⏭ | Radio body | Cabinet, lamp |
| --- | --- | --- | --- | --- | --- |
| tv, pc | — | — | — | nothing (the room's miss) | nothing |
| room | — | — | — | `zoom-in`, click flies to the radio; the pointer over it prefetches | same |
| radio | `pointer`: hover attends, click picks (touch: attention on down, pick on up over the same disc) | `pointer`: ▷II ghost press | `pointer`: pressed while held (the device owns the gesture) | `default`, nothing | `zoom-out`, the room |

At the radio the device's parts win over the body (a box 3 mm bigger than it), which wins over the surroundings. Discs are picked analytically (the ray against each disc's plane, the hole counting as disc); keys and lid by three's raycast on the cut meshes.

### Camera and layout

- **Viewpoint** (`radioFraming.ts`): the radio's facing pitched 24° down, framing the body (portrait: its CD half, x 0.93–1.245 above y 1.02), the open lid's corners and a 66 mm ring around every disc slot into the viewport minus the control insets with a 5 % margin. A 30° lens widens a degree at a time while the eye is further than 1.25 m, up to 50°. When the lava lamp would show inside the left 2 % band the eye and target truck right by exactly that much (wide and landscape-phone screens), never dolly.
- **Slots** (`discLayout.ts`): an arc over the well for aspects ≥ 0.9 (one row up to six discs, two for 7–12), a stack of two or three columns on portrait screens. Even discs stand 12 mm proud and odd ones sit back (the design had it the other way round: with the lamp truck at 21:9 the proud odd discs overlapped their neighbours on screen).
- **Flights** use the house arc (lift 0.16) and the device legs' look-at lead (`deviceLegProgress`, renamed from `pcLegProgress`); a leg with the computer at either end keeps the crane.

Frames with five discs (pinned ±3 px, ±1° by `radioFraming.test.ts`; the phone sizes include the 64 px transport bar or rail):

| Viewport | Lens | Eye → target | Truck | Radio centre | Disc Ø (CSS px) | Rocker | LCD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2560 × 1440 | 30° | 0.983 m | 0 | 43.7 % | 336–349 | 73 × 119 | 165 × 47 |
| 3440 × 1440 | 30° | 0.983 m | 0.17 m | 33.2 % | 331–358 | 74 × 119 | 163 × 47 |
| 1920 × 1080 | 30° | 0.983 m | 0 | 43.7 % | 252–261 | 54 × 89 | 124 × 35 |
| 1440 × 900 | 30° | 0.983 m | 0 | 43 % | 210–218 | 45 × 75 | 103 × 29 |
| 1366 × 768 | 30° | 0.983 m | 0 | 43.7 % | 179–186 | 38 × 63 | 88 × 25 |
| 1280 × 720 | 30° | 0.983 m | 0 | 43.7 % | 168–174 | 36 × 59 | 82 × 23 |
| 1024 × 768 | 30° | 1.165 m | 0 | 42.6 % | 150–154 | 33 × 53 | 74 × 21 |
| 820 × 1180 (bar) | 33° | 1.213 m | 0 | 37.1 % | 196–206 | 42 × 66 | 95 × 26 |
| 768 × 1024 (bar) | 33° | 1.223 m | 0 | 38.1 % | 169–177 | 35 × 58 | 82 × 22 |
| 844 × 390 (rail) | 30° | 0.983 m | 0.064 m | 36.6 % | 90–95 | 20 × 33 | 44 × 13 |
| 667 × 375 (rail) | 30° | 0.983 m | 0 | 39.7 % | 88–90 | 19 × 31 | 43 × 12 |
| 390 × 844 (bar) | 35° | 1.245 m | 0 | 32.2 % | 128–135 | 27 × 44 | 62 × 17 |
| 375 × 667 (bar) | 34° | 1.23 m | 0 | 34.7 % | 106–111 | 23 × 36 | 51 × 14 |
| 360 × 640 (bar) | 34° | 1.235 m | 0 | 34.8 % | 101–106 | 21 × 34 | 49 × 14 |

`discLayout.test.ts` holds the slots to their invariants for 1–12 discs on these viewports: no two discs overlap on screen, the seated disc stays ≥ 15 px clear of a disc at attention, every slot clears the body by 20 mm and the open lid's plate (80–88°, the swing's whole overshoot) by 10 mm, and the size floors (≥ 160 px at 1280 × 720 … ≥ 80 on landscape phones for six discs, ≥ 64 for 7–12). Two documented limits: on 21:9 with more than ten discs neighbours may kiss by up to 4.5 px, and 7–12 discs on landscape phones are ≥ 62 px. The lid's full swept volume (0–84°) cannot clear the arc's slots for two to four discs, so the rule the motion relies on is the 80° gate: no disc rises before the lid is past 80°, from where its plate is behind every slot.

### Motion

Everything that moves is a pure function of time (`choreography.ts` over `discMotion`, `lidMotion`, `keyMotion`, `springs`): poses are segments with closed-form ends, spins are tracks with closed-form angles, cues are moments the frame step fires once when it passes them, and an interruption retargets from the live pose. When no frame comes (a hidden tab, a phone locked mid-insert) a timer fires the next moment 120 ms after its time instead, drawing nothing, so a seated disc still starts its music. The timings, from the click at t = 0 with the camera landing at L = 1100 ms (pinned by `choreography.test.ts` and `e2e/radio-deck.spec.ts`; five discs):

| | t (ms) |
| --- | --- |
| Arrival: `power-on` (LCD warm-up flicker, LED); lid push −0.6°, pop to 5°, damped swing (ζ 0.72, 1.4 Hz, v₀ 220°/s) | 0; 700, 780, 840 |
| The lid at 72° / its peak 87.2° / within ±0.3° of 84° | 1079 / 1309 / 1621 |
| Discs rise once landed and the lid is past 80°, the furthest slot first (stagger clamp(240 / (N − 1), 55, 60) ms): 200 ms up out of the slot like toast, into a lane of its own once clear of the lips (the first up furthest forward, 10 mm between lanes); 320 ms across to its slot's column in that lane, upright; 240 ms forward into the slot, turning over to its label (`disc-flip`) where no other disc passes; a 6 mm settle. A warm visit: 180, 280 and 220 ms, a 55 ms stagger | 1136 → 1376; the shelf is up (`discsOut`, the hint may show) at L + 1340 (L + 1700 for twelve) |
| Pick: anticipation (the label turns to upright from the tap, never faster than the spin blur's onset, so a disc stopped mid-turn never washes grey); a 90 ms dip and lean that reads at once, ending at rest; flight out of the shelf, building its leaving speed evenly over its first 60 ms so the dip and the flight meet at one speed, towards the camera and up (at its pick scale for the first third, so the move is not cancelled by the shrink), then down in front of the radio, upright for 40 % and flat by 90 %; with the well free it glides through the point in front of the radio without stopping (C1: the flight arrives level at the slide's own speed) and back over the seat under the shelf, easing out above the spindle; with a disc still leaving the well it lands softly in front and waits; the drop (145 ms, about g) begins 35 ms before the slide has eased out, so the disc settles onto the spindle as it lines up instead of hanging above it; contact (`disc-seat`) and a 1.5 mm bounce; the radio presses its own ▷II, the bottom (`seated`: the sound), held 150 ms; spin-up to 7.5 rev/s over 900 ms | 0, 90, 490, 605, 750, 810, 900 |
| Keys (a tap, the bar's or the app's own presses, the radio's ▷II after a seat): the rocker tilts 6° about its pivot in 50 ms, ⏮ and ⏭ go 2.5 mm in in 35 ms; held at least 140 ms; a sprung release. Seen from the front the travel runs along the view, so the light tells it: the pressed face darkens to 55 %, the rocker's other half tips out into 118 % | `key-down` 0, `key-up` 140 |
| Swap: the playing disc brakes (220 ms), lifts off the spindle and stands up with its label to the camera (220 ms), and goes home behind the shelf; the new one sets off so as to wait no longer than 80 ms in front of the radio (a wait of 120 ms or less is flown instead: its flight takes that much longer and glides through the front point as the well clears, so it never stops there), and slides over the seat once the outgoing disc's lower edge is 12 mm above it | `seated` at 1080–1120 |
| Leave: controls hidden; discs go home nearest first (45 ms stagger, one down the slot every 50 ms at most): out of the slot into a lane, turning back to the data side, across, down; the lid starts down as the last disc does (340 ms, slowly at first, so it is still behind the slot's plane) and latches | 0, 45k, 460 + 50k; ≈ 660 → ≈ 1000, still by 1070 (twelve discs: latched at ≈ 1300) |
| Leave mid-pick: the radio packs up while the camera flies. The disc going in commits (the rest of its way plays sooner, never faster than 4 m/s; it still seats, presses ▷II and plays); one leaving the player takes the short way (brakes in 120 ms at most, stands up, backs straight into the slot's plane and goes down it; one already across the back goes on to over the slot instead of into its own); each shelf disc sets off once in its slot and clear of any disc hurrying home, its moves paced down to 65 % of their length (never past 4 m/s) so the lid starts down within 690 ms | leaving an insert at any moment: lid shut by L + 50 with up to six discs (the five shipped), past six the slot's 50 ms gap sets the pace, one gap later per further disc (twelve: by L + 350); leaving a swap sends the disc leaving the player down the slot too, and the shelf waits for its way across from the well: one gap more (five discs: L + 100; twelve: L + 450) |

No disc passes through another, nor through the radio's body, the well floor beside the slot or the open lid, and none jumps, in the scenarios `choreography.contact.test.ts` samples every 8 ms on four framed viewports for 1–12 discs: the arrival, picks during the rise (and another 0–1000 ms later), inserts, swaps, three picks in a row, a pick, another and the first again, the leave during the rise, turning back mid-leave (during the rise too, and 0–500 ms after the lid has started down: a disc retracing its way waits for the lid's 80° gate, as on the way up), the leave 0, 150, 300, 600 and 900 ms into an insert and into a swap, and a warm arrival. Where the leave, the swap and a change of mind meet, the moment matters to within a frame, so `choreography.dense.test.ts` sweeps the five shipped discs on the same four viewports over whole windows: the leave every 20 ms from 0 to 1400 ms into an insert (two discs) and into a swap (three pairs); a pick, another 700 or 1500 ms later and the first again 100–1500 ms after that, in 100 ms steps (a keyboard can pick the disc on its way home); a pick, another 600–900 ms later and the first again 16–112 ms after that (the second's drop is hurried to its contact and called straight out), and five picks between two discs at a steady 150–750 ms beat; and a pick 0–600 ms into a warm arrival's rise with a disc in the player. It tests every pair of discs with the exact intersection of their slabs (`discContact.ts`; the storyboard before this rule touched 14,412 times), fails any visible disc that moves more than 60 mm between two samples (faster than any drawn path), and checks the mid-pick leave's bound above. Interruptions outside these scenarios retarget from the live pose by the same rules but are not swept. A new layout (a window resized, a phone turned) cuts the discs at rest to their new slots with the camera's own cut; one still on its way glides over once its move is done and its glide is clear of every other disc, bowed towards the camera if that clears it, and of two discs each waiting where the other must go, the first steps out of the shelf towards the camera, lets the other by and comes back in front of the shelf; a disc with no clear way over and nobody waiting goes round the shelf, out towards the camera, across and back in (or the same behind the shelf), and a disc picked on its glide finishes the glide before it flies, so it never leaves from a slot it has not reached. Measured portrait to landscape at rest, 400 ms after landing (mid-rise), mid-insert and mid-swap: no contact but mid-rise, one grazing 8 ms frame for five discs (from 22) and 40 samples for twelve (from 106), the documented limit. The rule shapes the paths: rising and leaving discs keep to lanes of their own (parallel discs in different lanes cannot touch), each turns over only in front of its own slot, an outgoing disc goes home behind the shelf while the incoming one comes in front of it, a disc called back from in front of the shelf, or one on its way home when picked again, goes back the way it came if that way is clear of every disc shown (else it goes on home and comes in from its slot like any pick), a flight into the player waits until its way is clear of the discs still rising, a disc leaving the player waits for the rise before it sets off home, and on a leave each shelf disc waits until its way is clear of the disc hurrying down the slot. Every planner asks the same question (`clearAlong`): a way sampled every 10 ms keeps 2 mm clear of every other disc, the margin grown by how far the pair closed in since the step before, so two discs crossing face to face between steps count too.

A disc chosen before it is out (a keyboard can choose one the moment the camera lands) comes up and over to its column first and flies on from there with no wind-up: heard about 1.4 s after such a pick, against 0.95 s once the shelf is up (`e2e/radio-flow.spec.ts`). The other departures from the design's motion are its invariants' doing too: the approach is straight above the seat, so the flat disc slides under the shelf rather than past it; neighbours lean away from the eye while a disc has attention; the seat and its approach follow the well floor's measured 5.7° tilt; the side keys travel along the panel's measured normal.

Reduced motion: the existing fade-cut-fade lands on the open lid with the discs in their slots (on a first visit the screen stays black until the device is ready, at most 1.2 s, so it is one cut to the open radio rather than a shut one that then snaps open); a pick seats the disc in one frame, draws ▷II pressed for 120 ms and fires `seated` in a microtask; only state-change cues sound (the latch too, when it leaves); no step outlives 300 ms. The slow tier (a software renderer, or a first flight to the radio whose median frame exceeds 34 ms) keeps the choreography on its warm timings and drops the ambient float, the 2K skin and the blink.

### Look

- **Discs** (`discShader.ts`, one `ShaderMaterial` program for every disc, one draw call each): no three.js lights; the disc carries the bake's three sources by name (the lilac ambient, the lava lamp as a point light, the moon from the window), constants recorded in `DISC_LIGHT` and tuned against the baked cabinet and wall. Bare foil reflects a dark lilac room and, where the disc has tracks (out to where its programme ends, a different radius per disc), draws the lamp's spoke across them — an anisotropic lobe through the centre pointing at the lamp — with its diffraction rainbow along it (the lamp grazes the label side, so only the third order lands in the visible), plus a dim sheen from the room's upper half; the smooth mirror band and the foil past the programme are a little brighter than the tracks' haze. Thin-film iridescence weighted by the lamp's glint shimmers when a disc tilts. Ink is lit as matte print (the lamp wraps round it) under a varnish highlight that travels as the disc drifts and brightens under attention; at play speed a still spoke of the lamp across the varnish says the disc spins. The hub is smoky polycarbonate with its moulded stacking ring. The data face (the rise, the flip, the leave) reads as a silver disc, never a flat grey: a mirror brightening towards grazing, the lamp's spoke and the room's sheen across its tracks, the lamp and the moon diffracted in the first two orders (the rainbow spoke stays put while the disc turns), softly shouldered so a disc right by the lamp flashes but never burns out; a polished rim catches the room and the lamp, so overlapping discs keep their outlines. Spin blur: six taps along the arc swept in 1/60 s, blended into the label's radial average from 0.8 to 2 rev/s, so a disc at play speed is the same image every frame and costs none.
- **Labels**: the app's prints at `labelSize` (256, 384 or 512 from the discs' size at the radio; 256 with little memory or software GL), uploaded one per idle unit; the discs never wait for them: they show together once the last is up, fading in over the bare silver (260 ms) when the visitor is watching.
- **LCD** (`Lcd.ts`): a 256 × 72 (512 × 144 when it lands wider than 140 render px) positive STN canvas on a quad 0.3 mm in front of the dial glass, on the baked surfaces' own program; painted only when the readout or the blink phase changes, which draws a frame only at the radio (elsewhere the clock of a playing disc shows on the next frame drawn for another reason, so music at the computer costs no frames). The empty radio's `no dISC` is painted as the device is made, so lighting it on the approach repaints nothing. The OPR LED is a `PowerLed` (`{ lensRadius: 0.0015, haloRadius: 0.010 }`), lit while the LCD is.
- **Well and lid**: the close-up's parts, baked open in the room's Cycles scene; dark at night as the bake says, so the lamp-lit seated disc is the bright subject.

### Frames and budgets

| State (real app, Apple GPU Metal, headless Chromium, 1440 × 900) | Frames/s |
| --- | ---: |
| At the radio, resting | 0 |
| A disc paying attention, waking, coming to rest (`AmbientPacer`) | 30, at 1× and 6× CPU (median frame 33.2 ms on a 130 Hz headless display) |
| Playing, resting | 1 (the clock) |
| Playing, at the computer | 0 |
| The first flight to the radio, its device preparing on the way (headless, uncapped) | 116–120, longest frame 10 ms (24 ms at 6× CPU) |

`AmbientPacer` watches the display's own frames and asks for one whenever the next would reach a slot of a 30-a-second grid, so a 60 Hz display draws every second frame, a 120 Hz one every fourth, and one in between (75 Hz, or Playwright's 62.5 Hz fake clock) mixes gaps of one and two frames and still averages 30, never more in any second (`AmbientPacer.test.ts`); a frame drawn for another cause restarts the grid a full interval after it, and a stall is followed by one interval, not a burst. The previous 33 ms timer could not see the display's frames and drew 18 a second at 60 Hz.

`stats.programs` is 7 after the first room view and at the computer, 8 once the radio has been visited (one more for the posters on a hardware GPU, see Posters › Frames and budgets). The stage sets `renderer.debug.checkShaderErrors` only in development, for the whole room (the TV and the computer too): checking a program's link status makes the main thread wait for the driver to finish linking it, a quarter of a second for the disc's program under SwiftShader, which lacks `KHR_parallel_shader_compile`; a shader error therefore shows only in development builds. GPU memory: labels N × labelSize² × 4/3 pixels, the 512² close-up atlas, the LCD, and where it applies the 2K skin, which replaces the radio's 1K atlas (`stats.radioTexturePixels` counts all four: 5.5 M with five 384² labels and the skin). On a slow CPU (6×, the real app on the dev server): no long animation frame over 50 ms in the flights to and from the radio, the arrival, an insert or a swap; a pick is heard 0.93–0.95 s after the click. The room's first frame is unchanged by the radio (production, 6× CPU, median of six: 1,096 ms against 1,122 ms before these changes; a phone 1,132 against 1,146). Away from the radio a new layout (a phone turned in the room, at the computer or at the TV) is only noted in the resize handler and applied in the room's next idle moment (one background unit, never during a flight), or as the camera sets off for the radio if that comes first, so neither the rotation nor the click that next goes to the radio pays for the planning, and it draws no frame. The re-layout's search for clear glides works each moment of the other discs' ways out once and checks every sixth sample first: with twelve discs mid-rise it plans in 6.0 ms on average and 7.6 ms at worst on an M-series Mac (13.3 and 17.6 before), five discs in 1.7 ms. Bundle (`bundle-budgets.json`, against `feat/pc-desktop`): the room chunk grows 2.69 kB gzip (184.58 → 187.28; the design's +2.5, pending the captain's word: the door, the click target with its cabinet and the lamp, the camera's framing hook and the model lookup) and the entry 0.54 kB (209.82 → 210.38; +0.6), together +3.26 kB of first-load JavaScript (+5.69 before the third review moved the glue out); the lazy chunk with the deck and the device is 34.1 kB (the design's 16 kB, pending the captain's word); see the budget file's note.

### Assets

`pnpm build:radio` (after `pnpm build:room`, which runs it too) bakes the 2K skin on the shipped radio's UVs and the parts an open lid reveals in the restyled room's own Cycles scene (`tools/room/radio_closeup.py`, two Blender processes), then proves, compresses and publishes them (`tools/room/radio-closeup.mjs`): the skin's UVs match `radio-base.glb` to 0.5/65535, the close-up carries the base's geometry and UV fingerprints, the triangle lists that cut the lid, the rocker's halves and the side keys, and the measured hinge, rocker pivot, key travel, seat, slot, well, LCD and LED. `radio-base.glb` and every first-load file stay byte-identical; both new files are `lazyFiles` in `manifest.json`. `pnpm verify:room` checks the contract (sizes ≤ 80 KB and ≤ 280 KB, the fingerprints, the cut parts' shapes, the lid's 9 mm clearance from the antenna through 0–90°). See [the rebuild guide](../tools/room/README.md).

## Posters (`posters/`)

Twenty-nine printed pieces and a corkboard cover the back wall and the sloped ceiling, all from 2007 or before and all from the eleven topics the captain chose (the layout, the reasons and the reference study are in [ROOM-ART-DIRECTION.md](ROOM-ART-DIRECTION.md) › Posters; every artwork's source is in `tools/room/assets/posters/SOURCES.md`). They are baked in the room's own night scene, masking tape and pins included as lit geometry, and ship as one lazy node: `posters.glb` (the cards, the tape overhangs that ramp down to the wall, the pins and the corkboard, ≈ 1,500 triangles) and one unlit WebP atlas in two tiers, `posters-2k.webp` (2048 × 1024) and `posters-1k.webp` (1024 × 512, built per island rather than resampled). None of their art is in the first load: `room.glb` is byte-identical, and what the first load gains is the room chunk's trigger and kit (`PostersSlot`, `posterKit`). Of their three lazy files, the glb and the one tier this device gets are requested from the room's first frame on, with the `posterWall` chunk, at low priority while the TV boots its game (≈ 270 KB more before the game runs; the game starts as soon as without them, 1,478 against 1,492 ms in a local production build).

### Who loads what

| What | Where | When |
| --- | --- | --- |
| `PostersSlot` (the TV-side trigger, the first-departure hook, the cut hold, `stats.posters`, `room.postersReady`) and `posterKit` (the tier choice, the per-pose visibility boxes, the two materials, the strip uploader) | room chunk | first load; nothing runs before the room's first frame |
| `PosterWall` (the `posterWall` chunk): fetch and decode, upload, reveal, per-pose hiding, slow-flight demotion, context loss | lazy | imported by one idle unit at the TV, judged by its own 1 ms estimate (`IdleTaskOptions.estimateMs`) rather than the room's heaviest unit, and a longer room unit at the head of the queue that does not fit the idle period steps aside for it; a playing game that leaves no idle period of even that length has the first departure queue it again as urgent, sliced work |
| One tier (`posterTier.ts`: 2K when the room view's focal length is at least 505 drawing-buffer pixels, `deviceMemory` is unknown or over 2 GB, no Save-Data, a link the browser does not estimate at 3G or slower (`effectiveType`), a hardware GPU; else 1K) and `posters.glb` | lazy | fetched (`priority: 'low'`) and decoded at the TV: `createImageBitmap` off the main thread, the glb's Meshopt parse as one unit, judged by its measured 3 ms (1.6–2.8 ms with its decode at 6× CPU; urgent and sliced, like the upload, if it has not run by the first departure). On Save-Data nothing is fetched until the visitor leaves the TV |
| The upload | — | on a hardware GPU at the TV, as soon as the tier is decoded and the glb parsed: ordinary background work whose strips are small uploads (`IdleTaskOptions.smallUploads`), so they go between the playing game's frames, each in an idle period that can hold the previous unit and with that idle period to itself; the node is hidden there, so the first flight has nothing left to do but draw it. Unit 1 allocates the texture and compiles the one new program (`compileAsync`), judged by its measured 4 ms (3.9–4.5 ms at 6× CPU), then 8 strips of 128 rows (2K, 1 MB each) or 4 (1K) through `stage/stripUpload.ts`, shared with the radio's skin, mipmaps on the last. On a software GPU (whose GPU is the CPU drawing the game) it waits for the first departure. Whatever is left at the first departure becomes urgent and sliced: while the camera moves each strip has an idle period, or a slice after a frame, to itself. The uploader primes three's cache of the five unpack parameters when it allocates, so the page's first strip does not read them back from the GPU (each read waits for the GPU to drain: 250–780 ms on SwiftShader, 8–17 ms at 6× CPU on Metal, measured) |

The tier is decided once and never changes: one download, no swap. The node is shown at the first frame where the texture is complete and the program compiled; on a hardware GPU that is normally at the TV, seconds before the first departure, and otherwise early in the first flight, before any piece is in frame, so the first flight already passes decorated walls. Late bytes (a visitor who leaves the TV before the decode finishes, on a slow link) fade the pieces already in frame in over 300 ms, under reduced motion too (a fade is not motion, and the room's own cuts fade); under reduced motion a cut to the room view also holds its black (`holdCut`, at most 1.2 s) while what is left needs no network (the parse, the program, the strips), and the held black is a quiet moment for `IdleWork` (`CameraRig.veiled`), so those units run in whole idle periods under it; a cut to the TV, PC or radio view never waits for the posters. `stats.posters` reads `loading`, then `staged` once the tier is decoded and the glb parsed (only the upload is left), then `ready` (on a hardware GPU normally at the TV, the node hidden there); `loading` again from a context loss until they are back; `off` when they will not show. A software GPU takes the lite path: the 1K, no skirts, no fade, no program of its own (`stats.postersPath` reads `full` or `lite`). A hardware GPU whose first flight runs slower than 30 fps (median frame over 34 ms) drops the skirts at the next moment none of the node is on screen. After a context loss the kept encoded bytes are decoded and strip-uploaded again and the node stays hidden until they are up; a loss during the upload or the fade, or while it is still queued, ends that upload (its bitmap closed) and the fade (the cards opaque again) and starts over, and a program compile from the old context no longer counts. A failed fetch, decode or parse, a glb without the posters' node among them, leaves the walls bare (warned once). However the posters fare, they hold reduced-motion cuts black for at most 1.2 s in all over the session, so a state that never resolves costs one long black, not one on every cut; `?posters=0` in the lab keeps them bare to measure what they add.

`PosterWall` imports types only (`PosterWall.test.ts`): Rolldown folds a module that the room and a lazy chunk share into the room's chunk only when that lazy chunk already depends on the room's, and a runtime import of three.js or any room module from the wall split them into a common chunk on the critical path (+2.2 kB gzip, measured). The room hands those over in `posterKit` instead.

### Rendering

One node, two primitives sharing the atlas. The cards draw with the room's opaque unlit `MeshBasicMaterial` program, each card 1 + 0.75 · n mm off the wall by its layer n. The skirts, a few centimetres of contact shadow around every piece (a factor of at most 1: they only darken, and they are baked without the tape, so a tape strip casts its own small shadow and no ring), are multiplied onto the wall (`MultiplyBlending`, premultiplied, no depth write). Both draw in the opaque pass, ordered rather than depth-tested against each other: the room (`renderOrder` 0), then the skirts (`POSTERS_SKIRTS_ORDER`), then the cards (`POSTERS_CARDS_ORDER`), so a card or a tape overhang always covers the skirt under it. Their polygon offsets (-1 / -1 for the cards, -2 / -2 for the skirts) only pull them over the wall; a depth test between a skirt 0.1 mm off the wall and an overhang 0.3 mm off it would be lost at oblique angles, where the offsets' slope term outweighs that gap, and multiply the overhangs nearly black (round 1's dark tape corners; `posters.spec.ts` renders the room view with and without the skirts and allows at most 5 pixels over the cards to darken, none by 8 levels or more). Their outer edge is 1 by construction (the build holds each side's ring at ≥ 0.99 before encoding and `pnpm verify:room` at ≥ 0.985 after), so they fade into the baked wall without a seam. No alpha test anywhere: the one die-cut piece, the Radiohead bear sticker, keeps a rectangular card that carries the wall and the poster edge baked under it (the stage bakes what lies under the sticker with the sticker's own sheet out of the scene, and cuts the bear in by its alpha). The full path adds exactly one program (the premultiplied, non-opaque one, shared by the multiplied skirts and the fading cards); the lite path adds none. When the camera rests in the TV, PC or radio view, and on every resize there, the node is hidden only if no item's box meets the resting frustum, so with the shipped discs up to 21:9 those views draw nothing of it, and at 32:9 at the PC or with nine or more discs at the radio it stays drawn where a piece shows. Leaving a pose never pops anything.

### Frames and budgets

Measured in headless Chromium on an M-series Mac, at 1440 × 900 and on a 390 × 844 phone (in brackets). The resting views in the lab against `?posters=0` (`node scripts/room-shots.mjs --only posters-perf,posters-views`, and the same with `ROOM_SHOTS_GL=swiftshader`); the TV and the first departure in the real app's production build (with `window.__room` exposed) against `feat/radio-cd`, interleaved at a load average of 5–10, with a real click or tap on the TV, so the click's own handlers, the room's first-look uploads and the radio's and computer's lazy loads are in it (the lab's `showRoom()` has none of them, and its numbers were three to ten times too kind on a slow CPU):

| | Hardware GPU (Metal ANGLE) | Software GPU (SwiftShader) |
| --- | --- | --- |
| Tier and GPU memory (`stats.postersTexturePixels`) | 2K: 2,097,152 texels, 8 MiB, ≈ 10.7 MiB with mipmaps, from the TV on; the 8 MiB decoded bitmap is closed as the last strip goes up | 1K: 524,288 texels, ≈ 2.7 MiB with mipmaps, from the first flight on |
| Programs | +1 (7 → 8 after the first room view, 8 → 9 once the radio has been visited) | +0 |
| Draw calls, room view | +2 (63 → 65 [56 → 58] in the lab with the radio prepared; 68 [59] in the app) | +1 |
| Draw calls, TV, PC and radio views at rest | +0 (the node is hidden) | +0 |
| Room view at rest | 23–23.5 frames/s (the lava's 24) against 23–23.5 bare; 0 under reduced motion | 5.5 / 5.5 [8.5 / 9.5] frames/s, as fast as the software renderer draws the lava (on a machine at a load average of 11 both swing between 1.5 and 8.5 from run to run, the posters never below bare); 0 under reduced motion |
| Walls up (the last strip; the first piece enters the TV-to-room flight's frame at 400 ms) | at the TV, before the first departure: 16–32 ms after the bytes are staged, while the TV still reveals its game (1× and 6× CPU, desktop and phone), so ≈ 4 s before a departure 3 s into the game and 0.94–0.97 s before a tap the moment the game runs [6×]. With the bytes held 2.5 s so that the upload runs while the game plays: 93–324 ms [76–84 ms] after staging at 6× CPU, unit 1 4.1–4.5 ms [3.9–4.1], the strips 0.1–3.2 ms [0.1–4.0] one per idle period, and no game frame over 17 ms that the bare build does not also have (0–1 in 600, the game's first). Before this round the upload rode the first flight and at 6× CPU often came after the first piece was in frame (a fade in 5 of 8 desktop flights, at 0.79–1.28 s): the click's own long task (130–620 ms) and the room's first-look uploads (40–156 ms frames) leave that flight too few frames | 232–383 ms in eight of twelve runs, at load averages of 11–24; 474–676 ms in the other four (16–30), where the click's own frame or the next took 300–820 ms: the walls go up at the first frame after the four 1K strips (0.0–0.5 ms each) |
| First flight, the 1.1 s after the click | 101.8–103.6 frames/s against 102.7–104.5; 6× CPU 88.2–90.9 against 87.3–91.8 [104.5–107.3 against 105.5–106.4]; the longest frame is the click's own, as bare | 5–11 frames per flight on both, set by the room's own first-look uploads (100–330 ms each, a different set each run): 7.3–9.1 frames/s against 5.5–10.9 for the same build without posters (three pairs at a load average of 13); against `feat/radio-cd` on a busier machine (11–30), 3.6–8.2 against 4.5–10.9 (nine pairs, the posters' run lower in seven, by one to three frames) |
| A reduced-motion cut from the TV to the room view | the walls are up at the TV, so the cut neither holds nor waits for them. A tap the moment the game runs on a 6× CPU phone [375 × 667] comes before their bytes are staged: they arrive as late bytes 334–358 ms after it and fade in over 300 ms | it opens on decorated walls in every run (ready at 383–1,267 ms, five runs at load averages of 14–25). The software renderer's own stall at the room view's first frames (0.4–1.5 s with no script running; the build without posters has it too, after its shorter cut) then lands inside the fade back, so the view is clear at 1.0–3.3 s against 0.5–0.6 s without posters |

Bytes, against `feat/radio-cd`: the first load grows by the room chunk's 1.83 kB gzip (`bundle-budgets.json`, which itemises it) and nothing else (the entry's only change is the room chunk's hashed name in it, within 0.01 kB); `room.glb` and every other file the first load fetches are byte-identical (in `public/room`, `CREDITS.txt` gains the artwork's note, 915 bytes, and `manifest.json` lists it and the three lazy files; neither is fetched). Lazy, per visitor and never both tiers: `posterWall` 2.32 kB gzip, `posters.glb` 30.2 KB and `posters-2k.webp` 238.5 KB (≈ 270 KB) or `posters-1k.webp` 89.0 KB (≈ 120 KB).

On a software GPU the strips no longer hold the walls back. They used to come 1.6–2.6 s after the click, after the landing: the page's first strip read three's unpack state back from the GPU (The upload, above) and blocked the main thread for 250–780 ms, after which a slice judged by that strip's time never fitted again. With the state primed the four 1K strips take 0.0–0.5 ms each on the main thread, and the walls are up at the first frame after them. Every later visit and every other view is unaffected.

### Assets

`pnpm build:posters` (after `pnpm build:radio`; `pnpm build:room` runs both) builds the stage in Blender from the restyled scene (`tools/room/posters.py`: layout and packing, geometry, six whole-atlas bake passes, compose) and optimises, encodes, validates and publishes it (`tools/room/posters.mjs`). `pnpm verify:room` checks the contract: the sizes, the triangle budget, the eleven topics, the layout's keep-outs and declared overlaps, every triangle on its own item's box and surface, the decoded pixels and the skirts' outer ring; the tape's visibility is the build's own gate (the compose stage). The atlas carries 1.1 × the densest on-screen density of any resting room view; `posterVisibility.sweep.test.ts` measures the magnification from the built `posters.glb` and the shipped camera path, in drawing-buffer pixels per texel on screens up to 32:9 with the tier each size gets: 0.95 in the room view (3:4), 1.9 in the TV ↔ room flights (32:9), and up to 5.0 in the flights to and from the computer and the radio (3:4, the radio to the computer), which pass 1.25–1.6 m from the pieces over the desk for about a quarter of a second at their fastest. Holding those flights to 2 as well would take 2.5 × those pieces' density, which does not fit the 2K atlas (84 % full), so the test bounds what ships (1, 2 and 5). See [the rebuild guide](../tools/room/README.md) › Posters. The artwork is third-party, used by the captain's choice for now, and must be cleared or replaced before the site is published (`public/room/CREDITS.txt`).

## Dev lab and screenshots

```sh
pnpm dev                     # then open /room-lab.html  (?clean hides the panel, ?autopower=0 keeps the TV off,
                             #   ?view=pc or ?view=radio flies there after power-on, ?mockpc=1 puts a test card on
                             #   the computer, ?mockradio=1 hands the radio five numbered discs and a fake player)
node scripts/room-shots.mjs  # headless Chromium (Metal ANGLE) → .shots/room/*.png
node scripts/room-shots.mjs --only power-on,perf
node scripts/room-shots.mjs --only pc-desktop,pc-phone,pc-flight,pc-handoff
node scripts/room-shots.mjs --only radio-desktop,radio-wide,radio-phone,radio-arrival,radio-insert,radio-swap,radio-press
node scripts/room-shots.mjs --only radio-perf   # also ROOM_SHOTS_GL=swiftshader
node scripts/room-shots.mjs --only posters-detail,posters-perf,posters-views   # perf and views also with ROOM_SHOTS_GL=swiftshader
```

`MockGameSurface` draws an animated test card at 320 × 240 with corner labels, a white edge ring and a crosshair at the reported pointer pixel, so mapping, pause/resume and the CRT look can be checked without the game.
`MockPcScreen` paints the computer's still and its live screen from one test card (a 50 px grid, an edge ring, labelled corners and colour ramps), so registration and the hand-off can be measured; the lab's status line shows the view, `live`, frames, draw calls, programs and the still's pixels.
`MockRadioApp` answers the radio like the app does (picks load and play, the keys act, a fake clock runs on the LCD) and logs every intent, cue and `seated` with its time; the lab's radio button and ▷II / ■ / ⏭ press through it.
The shot script uses Playwright's fake clock for frame-exact power-on and crane-flight frames and for the radio's strips (arrival 0–2200 ms, insert, swap, the rocker's press; the clock is installed before the page loads so `performance.now()` never jumps), probes pointer mapping at the picture corners, prints the hand-off difference and prints frame rates per view, per flight and per radio state (`radio-perf` also at 6× CPU).
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
- The radio: a room rebuild changes `radio-base.glb`'s fingerprint, so `verify:room` fails (and the radio stays scenery at runtime) until `pnpm build:radio` runs; Metal bakes of the 2K skin differ between runs by a few pixels (mean 0.05/255), the close-up is reproducible byte for byte. The rocker pivots 7 mm behind its face, so while pressed (6°, deep enough to be seen) it slides 0.7 mm across the panel and a few sub-pixel specks of the neighbouring keys' bevels can show in a close crop. The well's walls and the lid's underside are drawn 1.7× brighter than baked (`INTERIOR_LIFT`), so the open well reads at night; it still has no fill light of its own. A disc chosen before it is out of the radio comes out first, so it is heard 1.2–1.6 s after the pick (its own climb out of the well), not 0.95 s. A phone turned while the discs are rising or between picks can still make two discs graze: in the 5-disc sweeps (portrait 390 × 844 ↔ landscape 844 × 390) a turn with no pick touches in 18 of the swept turn times, all 2260–2430 ms after the click towards the radio (up to 7.9 mm, for one 8 ms frame; landscape to portrait none), and a pick, a turn 0–1000 ms later and another pick 0–1500 ms after it touch in 312 of 2112 runs portrait to landscape and 81 landscape to portrait (none jumps). A disc hovered within 100 ms of the pick of its neighbour on a portrait phone can come forward into the inserting disc's path (5 of 1220 runs). The radio's 3D keys are mouse-sized from 1280 × 720 up; phones get the app's transport bar.
