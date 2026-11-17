# Room host (`src/room`)

The three.js attic that presents a `GameSurface` on a CRT television, a computer the app fills with its own DOM and a CD player the app plays music through.
It is vanilla three.js (no React) and imports nothing from outside `src/room` except the `GameSurface` / `PointerSink` types.
The contract with the rest of the app is the `createRoom` API below; everything else is internal.

## Using it from the app

```ts
// Load lazily: the room's chunk, three.js included, is about 190 kB gzipped (bundle-budgets.json) and the flat
// host does not need it.
const { createRoom } = await import('@/room');

let room;
try {
  room = createRoom({
    container,                          // element the canvas fills; its size drives the framing
    overlayContainer,                   // same box, outside role="application": the computer's live screen goes here
    surface,                            // the game's GameSurface (320×240)
    framingInsets,                      // optional: the overlays' strips, as setFramingInsets takes them
  });
} catch {
  // WebGL unavailable: createRoom throws synchronously → use the flat host.
}

room.pc.setStill(paintDesktop); // usable before `ready`: what the monitor shows when the live screen does not
// render the computer's DOM into room.pc.screen; it is visible only while room.pc.live
// (the app does both in app/pc/PcSlot.tsx, see docs/PC.md)

await room.ready;          // built, the TV view lit and its first frame drawn (TV dark, camera on the TV)
await room.powerOn();      // power LED, then the ~600 ms CRT turn-on; resolves when the picture is up
game.start();              // or surface.resume(); the boot scene's first frame lands on a live tube
// The app instead starts the game on its startup still and lights the tube at once: room.powerOn({ instant: true })
// (§ Startup).

const deck = await room.radio.load();  // the CD player's deck, its chunk imported on first call (room.radio is its door)
deck.setDiscs(discs);        // the CD player's discs and, below, its state
deck.setState(state);        // the app owns albums, tracks and sound (app/radio/RadioSlot.tsx, see docs/RADIO.md)

room.onViewChange((view) => showHint(view));   // 'tv' | 'room' | 'pc' | 'radio', as the camera sets off
room.onSettle((view) => showOverview(view));   // as it comes to rest
room.setFramingInsets({ top: 0, right: 0, bottom: touchPadHeight, left: 0 }); // keep the TV clear of overlays
room.onAnchorsChange((anchors) => note(anchors)); // where the TV, the computer and the radio sit in the room view
room.setTapToBegin(true);  // while the game's title waits: a finger on the set or anywhere below its top presses it, as on the picture
room.spotlight.light('radio');                     // a menu item has the pointer or the keyboard: the radio glows and bounces
room.spotlight.onChange((lit) => placeLabel(lit)); // the lit prop (the pointer's or the app's) and its label point
// room.showRoom() / room.focusTv() / room.focusPc() / room.focusRadio() for navigation.
// room.dispose() on unmount.
```

What the room does to the game, so the app does not have to:

| Moment | Effect on the surface | The computer's live screen |
| --- | --- | --- |
| `createRoom` | `setInputEnabled(true)` (the page opens on the TV) | hidden |
| Click outside the TV while watching it, or `showRoom()` (a tap or a pen leaves only from above the set, where it lands in NDC over the set's top: below and beside it is the touch pad's plate and too easy to hit, `ignoresClick` in `assembleRoom.ts`) | pointer released, `setInputEnabled(false)`, `pause()` (only if running), camera flies to the room | hidden |
| Click/tap the TV in the room view, or `focusTv()` | camera flies back; on landing `resume()` (only if the room paused it) and `setInputEnabled(true)` | hidden |
| Click/tap the computer or the desk in the room view, or `focusPc()` | camera cranes onto the desk, straight in front of the monitor; the game stays paused with input disabled | revealed on the landing frame (`pc.live` turns true), fading in over 160 ms |
| Click/tap outside the computer (wall, window, desk…), Escape on the stage, or `showRoom()` while at or flying to the computer | camera pulls back to the room; the game stays paused | hidden synchronously, before the flight's first frame |
| Click/tap the radio, its cabinet or the lava lamp in the room view, or `focusRadio()` | camera flies to the CD player (§ The CD player); the game stays paused with input disabled; the lid opens and the discs rise | hidden; `radio.controls` goes live on the landing frame |
| Click/tap outside the radio (cabinet, lamp, wall…), Escape on the stage, or `showRoom()` while at or flying to the radio | `radio.controls` hidden synchronously; the discs sink home, the lid closes, the camera pulls back; the game stays paused | hidden |
| Pointer over the picture while settled on the TV and powered on | `pointer.move(x, y)` in native pixels, `down()` / `up()`, `leave()` when it leaves the picture | — |
| A tap or a pen anywhere on the TV set (its bezel, its bottom panel) or below the set's top (the cabinet it stands on, the floor, the room beside it) while settled on the TV and powered on, and `setTapToBegin(true)` (the app turns it on while the game shows its title, "PRESS TO BEGIN"); above the set a tap still leaves | `down()` / `up()` without a move, as a press on the picture: the title begins | — |

A game the app paused itself (a menu, a hidden tab) is never resumed by the room.
At the computer, its own parts (glass border, bezel, keyboard, mouse) do nothing when clicked: the visitor is using it; at the radio, so does its body.
The app reaches the props without the mouse through the room view's menu (`app/guide/`, docs/ART-DIRECTION.md › The room's UI), whose items light the props through `room.spotlight` and fly to them with `focusPc()`, `focusRadio()` and `focusTv()` (its music item only while `radio.available`). Enter or Space on the room stage returns to the TV; Escape on the stage leaves the computer or the radio. Escape remains available to the game's menus at the TV.
The PAUSE on-screen display shows whenever the tube is on and `surface.paused` is true (checked on every drawn frame, since `GameSurface` has no pause event); the TV draws it, not the game.

### Public API

```ts
function createRoom(options: CreateRoomOptions): Room;

interface CreateRoomOptions {
  container: HTMLElement;
  overlayContainer?: HTMLElement;   // same box as `container`, outside role="application"; default `container`
  surface: GameSurface;
  framingInsets?: FramingInsets;    // as setFramingInsets: the opening view is framed, and lit first, as it will be shown
  quality?: QualityTier | 'auto';   // default 'auto': the device's own tier, governed by its frame times (§ Quality)
  maxPixelRatio?: number;           // a further cap under the tier's own
  maxDrawingBufferPixels?: number;  // a further cap under the tier's own
  posters?: boolean;                // default true; false keeps the walls bare (tests measure what they add)
  mood?: RoomMood;                  // 'original' (default: the bake without a finish), 'honey', 'rose' or 'midnight'
  air?: RoomAir;                    // { haze, dust }, as setAir takes them
}

interface Room {
  readonly ready: Promise<void>;           // the opening view is built, lit and drawn; rejects when the room cannot
                                           // be built or lit: use the flat host
  readonly generatedReady: Promise<boolean>; // true once the whole room is lit, false when it could not be
  readonly postersReady: Promise<boolean>; // true once the walls are shown, false when they will not be this page load
  readonly shown: boolean;                 // false after a lost WebGL context until the room is lit again (§ Lost canvases)
  onShownChange(listener: (shown: boolean) => void): () => void;
  readonly view: RoomView;                 // 'tv' | 'room' | 'pc' | 'radio', at or flying to
  readonly settled: boolean;               // the camera rests at `view`
  readonly mood: RoomMood;
  setMood(mood: RoomMood): void;           // changes the finish in place, with no animation or reload
  setAir(air: RoomAir): void;              // haze/dust multipliers, each 0–2 (1 uses the mood's settings)
  setMuted(muted: boolean): void;          // the app's sound switch, for the rain (§ Rain audio)
  readonly powerState: PowerState;         // 'off' | 'powering-on' | 'on' | 'powering-off'
  powerOn(options?: { instant?: boolean }): Promise<void>;  // instant: lit at once (§ Startup)
  powerOff(): Promise<void>;
  focusTv(): void;
  showRoom(): void;
  focusPc(): void;                         // straight in front of the monitor; the game stays paused
  focusRadio(): void;                      // the CD player on the cabinet; the game stays paused
  onViewChange(listener: (view: RoomView) => void): () => void;   // as the camera sets off
  onSettle(listener: (view: RoomView) => void): () => void;       // as it comes to rest
  setFramingInsets(insets: FramingInsets): void;   // CSS px covered by overlays
  setTilt(tilt: { x: number; y: number } | null): void;  // a phone's tilt, −1…1 each way: looks round the room view
  setTapToBegin(on: boolean): void;        // a tap on the set presses the game (the title's "PRESS TO BEGIN")
  registerInteractable(interactable: Interactable): () => void;
  readonly pc: PcMonitor;                  // the computer's monitor; usable before `ready`
  readonly radio: RadioDoor;               // the CD player's door: available, prefetch, load() → the RadioDeck
                                           // (src/room/radio/RadioDeck.ts); usable before `ready`
  readonly spotlight: PropSpotlight;       // the props' glow, bounce and label point (§ The spotlight); usable before `ready`
  readonly anchors: readonly PropAnchor[]; // the TV, the computer and the radio in the settled room view
  onAnchorsChange(listener: (anchors: readonly PropAnchor[]) => void): () => void;
  readonly stats: RoomStats;               // frames, draw calls, triangles, DPR, quality (tier and scale), lava, programs,
                                           // pcTexturePixels, backgroundPending (work still waiting for idle moments),
                                           // radioReady, radioTexturePixels (labels and LCD), radioLidDegrees, radioAmbient,
                                           // posters, postersTexturePixels, postersPath, spotlight (its chunk is in), rainReady,
                                           // generated and generatedStats (§ The generated room › Reading it)
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

interface PropSpotlight {                  // spotlight/PropSpotlight.ts
  light(target: RoomTarget | null): void;  // the app's pick (a menu item pointed at or focused); null hands back to the pointer
  readonly lit: LitProp | null;            // { target, x, y }: the lit prop and the middle of its top on the page
  onChange(listener: (lit: LitProp | null) => void): () => void;   // on a new prop and on every frame its label point moves
}

interface PropAnchor {                     // RoomTarget = 'tv' | 'pc' | 'radio'
  target: RoomTarget;
  x: number; y: number;                    // CSS px in the room container
  inFrame: boolean;                        // false behind the camera or within 24 px of an edge; x and y are idle then
}

interface Interactable {                   // registered: the TV, the computer and its desk, the radio; extensible
  readonly id: string;
  readonly object: Object3D;               // ray-cast target with its descendants as registered
  readonly gestureSurface?: Object3D;      // ray target while it owns a drag
  intersect?(raycaster: Raycaster): { hit: InteractionHit; distance: number } | null;
                                           // its own ray test, used instead of casting at `object` (and never cut
                                           // into pick chunks): proxies, a mesh filtered by region, moving parts
  cursor(hit: InteractionHit): RoomCursor; // what a click does here (Cursors, below)
  activate(hit: InteractionHit): void;     // click / tap
  pointerDown?(hit): boolean;              // return true to own the gesture (no activate follows)
  pointerMove?(hit | null): void;
  pointerUp?(): void;
  pointerLeave?(): void;
}
```

#### Cursors

The stage's cursor says what a click would do under the pointer, as a `RoomCursor`, and `RoomInteraction` writes it to the canvas twice: by name (`data-cursor`, for hosts and tests) and drawn (`style.cursor = var(--room-cursor-<name>, <stock>)`), so a page that defines the custom property draws its own and any other gets the stock cursor:

| `RoomCursor` | Where | Stock |
| --- | --- | --- |
| `idle` | nothing to do, or the thing in use (the room's walls, the computer while seated, the radio's body, mid-flight) | `default` |
| `enter` | a prop the click flies to (the room view) | `zoom-in` |
| `leave` | anything that leaves for the room (beside the TV, the computer or the radio, the desk while seated) | `zoom-out` |
| `press` | a part to press (the radio's discs and keys) | `pointer` |
| `play-arrow` | the game's picture while the TV plays, where a click acts on nothing (the bezel is `idle`) | `default` |
| `play` | the same over anything a click acts on in the game (a button, a key of a legend, a card, a mission) | `pointer` |
| `walk` | over a level's play, where a click walks the hero | `pointer` |
| `jump` | the same where the way there jumps somewhere: a girder, a vehicle, a "?" block, the floor past a pit | `pointer` |
| `attack` | anywhere else in a level's play, where a click attacks | `crosshair` |

Over the picture the TV takes the game's own cursor (`GameSurface.cursor`, docs/ARCHITECTURE.md › GameSurface and › Mouse play), `play-arrow` standing for its arrow and `play` for its hand (`roomCursorOf`), and the stage redraws it when the game changes it under a resting mouse (`RoomInteraction.redrawCursor`), a press held on the picture included, without telling anyone of a new hover. The app draws them in the room UI's style (`app/cursors/cursors.css`, docs/ART-DIRECTION.md › The room's UI › Cursors).

## Startup

The page does not wait for the room to show it (`app/startup/`, `app/hosts/StillPicture.tsx`, `index.html` › `.tv-still`):

- The first paint is a still of the room's TV view, the tube lit on a black picture, drawn by a small script inlined in `index.html` right after the still's element (`scripts/stillPlugin.ts` bundles `src/app/startup/still/inline.ts` into the page, in development and in the build; no image and no request). The script holds the view as outlines in the room's own space and the room's own camera: `camera.ts` is `tvViewpoint` and `frameSubject` again in plain numbers (held to them within a twentieth of a pixel over some three hundred viewports by `camera.test.ts`), so for any window, and for the touch pad's strips on a touch screen (228 px under a portrait picture, 138 and 174 px beside a landscape one, each plus the display's safe area), every point lands where the live room will put it. `draw.ts` writes them as one SVG (paths, a few discs and the set's print as text; gradients anchored in the room, so the baked light stays on its surfaces under every camera) and `inline.ts` sets `--picture-*`, where the app lays the game's picture, and draws again on a resize while the still is up or as it comes back. A disc whose middle is off the page is not drawn: the opal lamp's bloom is there only in the windows wide enough to show the lamp. What the set shows only when it is on, the power lamp and the picture's light along the lip's outer edge, is the SVG's one group, which `index.html` shows once the still holds a powered picture (`:has([data-powered="true"])`), so the still is a dark set until the game's tube blooms.
- The still's data is generated, never drawn by hand (`pnpm build:still`, `scripts/still/`). Its outlines come from the generators: `layers.ts` names the layers back to front (the wall, the cabinet's boards, the lamps' pools with the set's shadow cut out of them, the lamps, the plant, the set's plinth, shell and glass, its jacks, lamp and print), each layer is drawn alone in software from the nominal view (1440 × 900), its outline traced (a quarter of a pixel fine, kept to 0.3–0.4 px for the set and looser for the lamps and the plant, as a curve's control points where that takes fewer) and every vertex put back at its own depth in the room, so what hides what is only the order of drawing and the picture is right from every camera of the family. Its colours come from the live room: the build serves a production build, opens it in Chromium on this machine's GPU at top quality with the tube dark (`?debug&capture`) at six viewports that between them show every shape, and fits each paint's stops to the pixels the shape covers (`fit.ts`; a glow over the still as drawn so far; the power lamp and the lip's light from one more shot with the set on and the game's title up). `--no-sample` makes the outlines again and keeps the colours (`scripts/still/colours.json`). The data is one string of whole numbers (`encode.ts` says what they are).
- The game needs only its own assets: it powers on (a 320 ms bloom) and plays boot and title flat on the still, its canvas laid over the still's picture and made to look like the tube's (`StillPicture.css`): added to the still's dark glass as the tube adds its light (`mix-blend-mode: screen`, so black is the glass and the picture has no box round it), under one `filter` and one multiplied layer of scanlines, tint and edge falloff fitted by least squares to the live tube's picture of the title on a desktop and a phone (a channel's mean within 3 levels of the live tube's after it; the scanlines are one repeating gradient, never a tiled background: on an iPhone a tile a fraction of a pixel tall painted the picture's lower part as one solid shade). The sound toggle is already there. Keys reach it from the start, and the pointer until the room is in; on a touch screen the title says "PRESS TO BEGIN", a tap anywhere begins, and the pad fades in only once the title is left.
- The room is made behind it (§ The generated room): its geometry in a worker from the moment the room's chunk runs, then the light of what the TV view shows, and then it is `ready` and lights its tube at once (`powerOn({ instant: true })`), the stage underneath taking the pointer. The rest of the room is lit behind the running game. The visitor's first key or press, the game leaving its title, or the camera leaving the TV, whichever comes once the room shows the game, fades the still and its picture out as one in 400 ms (at once under reduced motion) over the identical live scene: nothing moves but the tube's light; the game's own title transition covers the change of picture. A press before the room is in is remembered, and the still waits for it.
- A visitor who leaves the TV before everything the flight shows is made waits for it (`ViewController.whenReady`, § Flights): the game stops at the click and its PAUSE comes up on the tube, the room's frames then stand still, the rest of the bake has the GPU to itself, the buffers and textures no frame has drawn are made, and the camera sets off once the GPU is through with all of it; no view but the TV's ever shows a surface without its light. On an Apple M4 that wait is 0.2 s (a click in the frame the room becomes ready) and nothing from half a second later on; it is the GPU's time for the remaining views whatever a frame costs it (§ The generated room › Leaving early, A slow GPU), and no real phone has been measured (§ Known gaps).
- Should the room fail (no WebGL, no worker and no main-thread build, a bake that lights nothing), `ready` rejects, the flat host takes over and the still goes. The still follows the room by being built again, not by hand: after a change to the set, the cabinet, the lamps, the plant, the TV view's framing or the room's light near the TV, run `pnpm build:still`. `scripts/still/still.test.ts` fails when the generators no longer give what the still was made from (a fingerprint of the triangles each layer picks, the framing and the layer table, beside the colours in `source.json`), and `e2e/still.spec.ts` shoots the still and the live room behind it at seven viewports and holds them to each other: the picture's place, the outlines (an edge of one within a pixel of an edge of the other) and the colour of nine places. What the still does not have: the screen's light on the cabinet and the casing (only its band on the lip, in the title's colour whatever the picture shows), the finish's bloom and grain, the plant's shadows on the cabinet, and the wall's boards.
- A lost WebGL context takes the room's light (§ Lost canvases): `room.shown` turns false, and at the TV view the app puts the still back, the game playing on it, until the room is lit again.

## Modules

```
room/
  index.ts              public exports
  createRoom.ts         public API: stage + view controller + the computer's live screen + the generated room
  assembleRoom.ts       wires the built room: TV, computer, radio, camera rig, interaction, anchors, the two glasses
  ViewController.ts     applies the view policy to the surface (pause/resume/input), the live screen and the camera
  viewState.ts          pure reducer: view requests/arrivals → effects
  gen/                  the room itself (§ The generated room). Only genKit.ts imports three.js at runtime
    GeneratedRoom.ts    the worker's door, the meshes, the two-pass bake and its pacing, context loss, stats
    GeneratedRadio.ts   the CD player's parts as meshes on the pivots RADIO_SPEC names
    LavaWax.ts          the lava lamp's wax and glass: a lathe posed by the clock
    genKit.ts           the three.js classes gen/ builds and bakes with, handed over (room chunk)
    scene.ts            runs every prop generator and packs the charts; no three.js (worker.ts runs it)
    worker.ts           the generators' worker
    roomSpec.ts         plain numbers: where the TV, the computer, the lamps and the view outside are
    rig.ts              the night's lights, as a table
    materials.ts        surface functions (GLSL the bake evaluates once per texel)
    art.ts, artPaint.ts the art page: the game covers, the set's legends and wordmark, the console's, painted
                        on one 2D canvas; radioArt.ts paints the CD player's strip of it
    tiers.ts            what each quality tier builds and bakes at
    bake/               Baker.ts (shadow maps, light pages, the vertices' page, compose) and its three programs;
                        pace.ts (how its units are sized and spaced)
    kit/                builder.ts (placed primitives → flat arrays), vec.ts (vectors as triples: what the bake
                        shares with the builder), charts.ts (flat rectangles packed into pages), hash.ts
                        (integer hashes, the same in GLSL and JavaScript)
    props/              one module a corner: shell (walls, floor, rug, door, window, blind), cabinet, tvSet,
                        cabinetLamps, plant, console, deskCorner, dresserCorner, lavaLamp (+ lavaWax, its
                        measurements and the wax's pose, which the main thread runs), radio + radioSpec
  stage/
    RoomStage.ts        renderer (sRGB, no tone mapping), scene, camera, the quality's pixel ratio, resize, context loss
    RenderLoop.ts       frame scheduler: invalidate() + animation steps, coalesced per frame; tells a run
                        of frames (whose intervals measure the device) from frames that were only waited for
    quality.ts          pure: the quality tiers, the tier a device starts on, and the governor that moves the scale
                        and the tier with measured frame times (§ Quality)
    IdleWork.ts         work ahead of need, in small units on idle time: never in a flight, never making a frame late;
                        `drain` makes what a flight shows before it sets off
    sceneWarmup.ts      every mesh drawn once out of sight before a frame draws it (§ Flights › Warming)
    softwareGpu.ts      pure: whether the GPU is software (2D canvases then paint on the CPU)
    slowDevice.ts       pure: whether the device is slow (a software GPU, or a first flight under 30 fps), for the radio and the posters
    stripUpload.ts      a large texture uploaded a 1 MB strip per background unit (the posters)
    sceneTextures.ts    every texture of the scene: anisotropy, disposal, and the upload of those no frame has drawn
    canvasRestore.ts    repaints a canvas painted once when a GPU reset hands it back blank (§ Lost canvases)
    FramePacer.ts       presents game frames at most ~60/s (120 Hz displays report each state twice)
  atmosphere/
    moods.ts            three summer-night finishes, and `original`: the bake with no finish, for comparison
    RoomAtmosphere.ts   one room render, quarter-size highlight extraction, mip-based bloom and split-tone finish; the
                        TV's light in the haze, and only its brightest pixels' glare from a display
    RoomDust.ts         one point draw of 580 seeded world-space motes, depth-tested and excluded from screens
    AirMotion.ts        dust clock at at most 24 Hz, resting when hidden, disabled or under reduced motion
    WindowRain.ts       water on the window's glass, refracting the view outside, in the composite
    RoomGloss.ts        view-dependent varnish on the baked hard surfaces; lights them with the TV's picture
                        (tv/screenLight.ts) and the storm's flashes
    RoomHalation.ts     depth-tested warm halos at the practical lamps (the opal lamp's and the bare bulb's too); no animation
    tvLamp.ts           the opal lamp beside the TV (§ The opal lamp): its uniforms, for its reflection and its air
    bulbLamp.ts         the bare-bulb lamp (§ The bulb lamp): its intensity and its halo (its light is baked)
    RoomScreens.ts      display mask in the frame's alpha; keeps content clear and hides the monitor's bezel quad
    LiveScreenMood.ts   matching subtle SVG colour tint for the live DOM computer screen; no blur over text
  rain/
    RainSoundSlot.ts    imports the rain's sound at idle after power-on (room chunk)
    RainSound.ts        the `RainSound` chunk: the recording, its seamless loop, mute and fades (§ Rain audio)
  camera/
    CameraRig.ts        TV / room / computer viewpoints, flights, reduced-motion cut, pointer (and phone tilt) parallax
    roomFraming.ts      pure: the whole-room overview for an aspect, tall to wide
    framing.ts          pure: fit points into (part of) the viewport for a fov and aspect
    cameraPath.ts       pure: arc and crane interpolation between viewpoints, look-at lead, fov-for-aspect
    pageProjection.ts   pure: world points → page CSS px for a viewpoint (a scratch camera, never the live one)
    anchors.ts          pure: the props' positions in the settled room view, and whether they are in shot
    ScreenFade.ts       black veil for the reduced-motion cut
  tv/
    tvModel.ts          the TV as the room's spec has it; the aperture constant
    tvGlass.ts          the glass: a display mesh made on the main thread to the screen's contract
    tvFraming.ts        pure: the TV viewpoint (the whole set, or the picture on portrait and short screens); the
                        picture's outline on the curved glass
    tvFixtures.ts       the set's numbers for tests
    Television.ts       the device: CRT + LED + the light its picture casts, power choreography
    CrtScreen.ts        ShaderMaterial on the glass, CanvasTexture updated on onFrame, power state
    crtShader.ts        GLSL: scanlines, aperture grille, bloom, vignette, power raster, halation, glass
    screenLight.ts      the picture as an area light (§ The TV's light): its frame on the glass, and the GLSL the
                        finish lights the room and its haze with
    powerTimeline.ts    pure: power-on/off animation as a function of time
    osd.ts              the TV's PAUSE on-screen display (5×7 bitmap font)
    ScreenGlow.ts       additive light-spill quads tinted by a screen's mean colour (the computer's monitor)
    PowerLed.ts         emissive LED + halo beside the power button
    TvInteractable.ts   the TV as an Interactable: focus button in the room, pointer surface on the TV
    screenMapping.ts    pure: picture rect in UV space, UV → native pixel
  radio/                the CD player; only the door, the click target and the model lookup are in the room chunk
    RadioDeck.ts        the public RadioDoor and RadioDeck types
    RadioDoor.ts        room.radio (room chunk): available, prefetch, load() → the deck; imports deckChunk.ts at the
                        first landing away from the TV, on a prefetch or on a request for the radio view (which waits)
    RadioInteractable.ts the radio, its cabinet and the lava lamp as one click target (room chunk; the table below)
    radioModel.ts       the radio as `RADIO_SPEC` has it, with its cabinet and the lamp's bounds (room chunk)
    radioFixtures.ts    the radio's bounds and the framing table's viewports, for tests
    deviceFacts.ts      Save-Data and device-memory probes (room chunk)
    deviceContract.ts   the seam to the lazy device (types only): RadioHost, RadioLink, RadioDevice
    partsProvider.ts    what the generated room hands the device (types only): the parts on their pivots, the spec
    deckChunk.ts        the radio's lazy chunk (`radioDevice`): the deck below and the device, one chunk
    RadioDeckHandle.ts  the deck: listeners, live, label size; remembers discs/state until the device exists
    RadioParts.ts       the radio view's half of the click target: the device's discs, well and keys
    radioFraming.ts     pure: the 24° viewpoint over the radio and its discs, lens, lamp truck, portrait crop; the
                        lid and hinge it frames
    discLayout.ts       pure: the disc slots (arc or stack) for a count and aspect; label size
    ControlsLayer.ts    the app's controls slot over the room, shown only while live
    device/             the rest of the `radioDevice` chunk
      RadioDevice.ts    createRadioDevice: waits for the generated radio's parts; the device (state, gestures, cues, frames)
      choreography.ts   pure: every disc, the lid and the keys as functions of time; cues as timed moments
      discMotion.ts     pure: rise, glide and flip, settle, flight, drop and bounce, unseat, idle, attention
      discContact.ts    pure: whether two discs touch (the planners' and the tests' measure)
      lidMotion.ts      pure: push, pop, the damped swing and the close as timed plans
      keyMotion.ts      pure: rocker tilt and side-key travel, hold and spring release, key shading
      springs.ts        pure: closed-form damped springs and spin tracks
      timeWarp.ts       pure: a stretch of the storyboard played sooner (a leave mid-pick)
      monotonicClock.ts the device's one clock, which never runs backwards
      deckLayout.ts     pure: the deck's seat, slot and keys; the layout on the page
      Discs.ts          the disc meshes, labels (one upload per idle unit), radial averages, analytic picking
      discGeometry.ts   one 512-triangle disc (label face, data face, edge, hole wall)
      discShader.ts     the discs' one program: foil, diffraction, label, spin blur; JS mirrors for tests
      radialAverage.ts  a label's 64-bin radial average (the label at play speed)
      Lcd.ts            the segment display: canvas, warm-up flicker, fades, blink
      lcdSegments.ts    pure: glyphs and the readout's frame
      AmbientPacer.ts   the idle float at ≤ 30 frames per second
      storyboardSweep.ts the contact tests' harness
  pc/
    pcModel.ts          the computer as the room's spec has it; the picture's border and radius constants
    pcGlass.ts          the glass: a display mesh made on the main thread (planar UVs, v = 0 at the top)
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
    PostersSlot.ts      the room's half: the TV-side import, the first-departure hook, the cut hold, stats
    posterKit.ts        what the lazy wall uses of the room's chunk, handed over: tier, boxes, materials, meshes, uploader
    posterTier.ts       pure: the atlas painted at 2K or 1K, from the room view's focal length, memory, GPU
    posterVisibility.ts pure: each piece's box, and whether a pose's frame holds any of them
    PosterWall.ts       the `posterWall` chunk: the door to the painter, strip upload, compile, reveal or fade, per-pose hide
    wall/               pure: the layout, the geometry and atlas plan made from it, the night's light on the walls
    paint/              the painter (a worker; a lazy chunk where there is none): the kit, the designs, the atlas
  spotlight/
    PropSpotlight.ts    the public PropSpotlight and LitProp types
    SpotlightDoor.ts    room.spotlight (room chunk): the pointer's prop, else the app's pick, while the camera rests in
                        the room view; imports the chunk from the TV behind the room's warming, or at the first landing
    spotlightKit.ts     the three.js classes the chunk draws with, handed over (room chunk)
    spotlightContract.ts the seam to the lazy chunk (types only)
    Spotlight.ts        the `propSpotlight` chunk: the glow passes, the jelly, the brighter colours, the label point
  interaction/
    Interactable.ts     the props contract
    RoomInteraction.ts  DOM pointer events → ray hits → hover cursor, click, gestures
    pickMeshes.ts       what a pointer ray tests: large meshes cut into compact chunks, in the background
  motion/easing.ts      easing curves (the room may not import engine runtime code)
  lab/                  dev lab: MockGameSurface, MockPcScreen, MockRadioApp + main.ts (served by room-lab.html)
```

## Assets

The room ships no model, texture or image, and fetches none. Its geometry, its surfaces, its prints and its light are
made in the browser (§ The generated room), the posters' paintings and geometry too (§ Posters), and the startup still
is CSS (§ Startup). The only file the room downloads besides its code is the rain's recording,
`public/audio/attic-rain.mp3` (§ Rain audio).

What the room's code needs to know of the room without building it (where the TV, its glass and its LED are, the
monitor's glass and shell, the lamps, the lava lamp's box, the view outside, the radio's hinge and keys) is
`gen/roomSpec.ts` and `gen/props/radioSpec.ts`: plain numbers, which `gen/gen.test.ts` and `gen/props/radio.test.ts`
hold to the generators. Baked surfaces carry a filmic display transform of their own, so the renderer uses
`SRGBColorSpace` output and `NoToneMapping`. `public/CREDITS.txt` (linked from the résumé) says what the site is made
with.

Until commit `0e275c7` the room was authored in Blender, baked offline and shipped as five GLB models and WebP
textures under `public/room/`, built and checked by `tools/room/` (`pnpm build:room`, `verify:room`). All of that is
removed; the commit before it is where to look for the pipeline. `docs/gen/reference/` keeps pictures of that room,
which the generated one was matched to (§ The generated room › Comparing it).

### TV geometry contract

- The TV faces **-X** (into the room), standing on the white cabinet against the wall at x = 2.80.
  Whole-set bounds (`TV_SPEC.bounds`): x 2.153–2.657, y 0.486–1.076, z -0.625 to -0.015 (0.61 m wide, 0.59 m tall).
- The glass (`tv/tvGlass.ts`, from `TV_SPEC.glass`) is a display mesh made on the main thread, not a baked one:
  `userData.interaction_id = "tv-screen"`, `replaceable_screen = true`, its material replaced by the CRT shader. A
  16 × 12 grid, curved as a parabola each way: the centre is at x 2.159, the corners 2.5 cm further back.
  Its 0–1 UV square is a planar projection spanning z -0.611 to -0.029 and y 1.058 to 0.614 (0.583 × 0.444 m, aspect 1.31).
  **Orientation:** u runs left → right as seen by the viewer (+Z), **v = 0 is the top edge**; with `flipY = false` the canvas maps upright and unmirrored (verified with the lab's corner labels).
- The bezel's lip (gen/props/tvSet.ts) covers the UV square's rim: a steep wall, 8 mm wider than the aperture where it turns onto the face over a 1.6 mm radius, its inner ring behind the glass all round (the glass crosses the wall, 3–5 mm outside the aperture at the sides' middles, where the tube bulges nearest). The straight-on visible aperture is u 0.058–0.942, v 0.050–0.950 with rounded corners (`TV_SCREEN_APERTURE`).
  The 4:3 picture is fitted inside it with a 2 % inset (`fitContentRect`), leaving a thin dark tube border like a real set; pointer mapping uses the same rect, and so does the TV view's framing.
- The TV view (`tvFraming.ts`) looks along −facing pitched 4° down through a 28° lens, widened 2° at a time up to 60° while the eye would stand more than 1.75 m back from the set's middle (it would back into the desk), into the viewport minus the framing insets. It frames the whole set with a 6 % margin, unless the viewport is portrait or the whole set would show the picture under 300 CSS px tall (1.25 px per game row: a phone on its side, a very short window); then it frames the picture alone, the content rect's outline on the curved glass (its corners and every crossing with the glass's triangle edges, so no column or row is ever cut), with a 0.1 % hairline. A portrait picture spans the width, centred in the space above the touch pad, with the bezel cropped at the sides: at 390 × 844 (40° lens) its top row covers 389.2 of 390 px and, keystoned by the pitch, its bottom row 382.5. A phone on its side is limited by its height, between the pad's clusters: at 844 × 390 (28°) the picture is 389.2 px tall and 521 px wide, and the room stays in shot beside the set above the clusters (x < 69 and > 737) to tap out of the TV, as it does past the safe areas of a notched phone. Desktops and tablets in landscape keep the whole set (1440 × 900: the picture 662 × 496 px).
- Controls: the generated strip of round keys under the printed legends POWER, VOLUME, CHANNEL, ACTION, TV/VIDEO (z -0.477 to -0.348, y ≈ 0.55), each through the face in its own dark gap. The large POWER key is its leftmost element. Right of them the remote's smoked window, the wordmark's badge above it at the set's middle, and the three front jacks in a well 9 mm deep (z -0.262 to -0.194).
  The set's lamp is a 5 mm lamp's body through the face, unlit plastic: `PowerLed` mounts its light, a 2.4 mm emissive lens with an additive halo, at `TV_SPEC.led`, a millimetre off the body's tip and 2.2 cm left of the strip.
- The face is not a plane: it is crowned across (5 mm further back at its sides than at its middle, where it is on x = 2.1542) and leans back 1–2 mm under the keys, and the chin's bottom edge hangs 16 mm lower at the middle than at the corners. What stands on the face is placed on it by `face(across, up)`; the prints are five strips of the legends' rectangle laid along it.
- Around the TV: cabinet top y = 0.486, cabinet front face x = 2.144 (the TV stands flush with it), floor/rug top y ≈ 0.035, wall x = 2.80.

## Rendering and performance

- **Frames.** `RenderLoop` by itself draws only when asked: game frames (paced to ≤ 60/s), camera flights and
  parallax, power animations, the lava's and the air's ticks, resizes. Once the room is lit, `GeneratedRoom` has the
  loop draw all the time in every view (`RenderLoop.pace`, stopped while a lost context leaves it unlit), whether or
  not anything moves, as a run of frames the quality governor judges (§ The generated room › Sixty frames a second), and not while
  the canvas is off screen or the tab hidden. The paced loop follows the display's own frames
  (`requestAnimationFrame`) and draws on every one of them, or on every second or third of a display faster than
  95 Hz: sixty a second on a 60 Hz and on a 120 Hz display, 72 at 144 Hz, 80 at 240 Hz, 75 and 90 on displays of those
  rates, and always a whole number of display frames apart, so the frames are evenly spaced. (A timer asking sixty
  times a second drew a 120 Hz display at 67 a second in a mix of one- and two-frame gaps.) A one-off request (the
  lava's tick, a pointer move, the game's own frame) is drawn by the next of those frames, not by one of its own in
  between, and so is every step of an animation (a flight, the radio's choreography, the tube's turn-on): it moves by
  the time its step is given, on the frames the room draws at rest, the ones its quality is governed for. (Flights
  used to draw on every display frame: 120 a second on a 120 Hz display, twice what the room at rest asked of the
  GPU, and one that held sixty but not 120 gave a mix of one- and two-frame gaps, § Flights.) Before the room is lit
  the loop is not paced and an animation draws on every display frame.
  So a resting room draws sixty frames a second at the TV with the game
  paused, in the room view, at the computer and at the radio, under reduced motion too (`node scripts/room-shots.mjs
  --only perf` prints them). The slower clocks (the lava's 24 a second, the air's) decide
  what moves in those frames, not how many are drawn; the radio's floating discs move in every one (`RenderLoop.ride`:
  a step run before each frame drawn that asks for none). The room with shipped files drew no frame at rest; the frame
  counts at rest that these docs quoted from that time are gone (§ Known gaps).

- **Work ahead of need.** `IdleWork` runs background work in small units in idle callbacks, from the first frame on, and asks the room first what the screen is doing:
  - the camera flies: nothing runs, urgent or not (`IdleMoment` `flying`, § Flights); what a flight shows was made before it set off, and whatever is left waits for the landing;
  - the TV turns on or off (from the moment its LED lights), or the radio's lid and discs move: nothing runs but urgent work (the radio's prints at the radio), and that only as it may while the game plays, since a unit invisible on a still frame is a dropped frame in motion; a sliced urgent task (`sliceMs`) also gets one unit right after a frame that leaves no idle period or too short a one, while its units of that kind stay within the slice (the median of its last three CPU units or of its last three uploads, and none of them judges before three have been timed);
  - the game plays on the TV, or the visitor uses the computer's live screen: a unit runs only when the idle period left can hold it, judged by how long its task's previous unit took (or, for a task's first, its own estimate, `estimateMs`, else the longest so far), so no frame is late, and a unit at the head of the queue that does not fit steps aside for the first behind it that does; units marked `QUIET` (GPU uploads, whose cost the main thread cannot time, and work only needed where nothing plays) wait, except a task's small uploads (`smallUploads`: the posters' 1 MB strips at the TV), which run like CPU units, each with an idle period to itself;
  - otherwise (the room loading behind the startup still, a paused game, the room view): units run until the idle period is spent, always at least one.

  On a device too slow to fit a unit between the game's frames the work waits for a quiet moment, or for the flight that needs it. The room queues:
  - **The bake's second pass**, the light of everything the opening view does not show, a few pieces of its views a unit
    (§ The generated room › Pacing).
  - **The pick chunks** (below), for quiet moments: the room view.
  - **The monitor's glass finish**, in bands of 32 rows.
  - **The monitor's still**, as soon as the app hands over its painter (§ The computer's monitor).
  - **The posters' atlas**, in 1 MB strips (§ Posters), and at the radio the discs' labels (§ The CD player).
  - **Every texture no frame has drawn yet** (`sceneTextures.ts`), one upload per unit, a while after the TV turns on
    (`assembleRoom` › `prewarm`) or at the latest as the visitor first leaves the TV, before the camera sets off.
    three uploads a texture the first time a frame draws it, which would otherwise land in a flight. In the generated
    room this is little: the baked pages are render targets, on the GPU since the bake, so what is left are the
    canvas textures a view has not shown yet (the view outside the window, the monitor's still).
  - **Every mesh no frame has drawn yet** (`sceneWarmup.ts`, § Flights › Warming), a few to a unit, behind the
    textures.

- **Pointer picking.** Every pointer event casts one ray at the registered props. three.js tests every triangle of a
  mesh whose bounds the ray crosses, so `pickMeshes` cuts any registered mesh over 8,192 triangles into chunks of at
  most 1,024 that share the mesh's attributes and carry their own bounds, in units of 4,096 triangle visits in quiet
  moments; a ray tests only the chunks it crosses and finds the same hits. The generated room's click targets are
  small meshes of their own or index ranges of the merged props (§ The generated room › Picking), so little or
  nothing is cut now; what a pick costs has not been measured since.

- **Software GPUs.** Where the GPU is software (SwiftShader, llvmpipe: `softwareGpu.ts` reads the renderer's name), a 2D canvas the browser accelerates queues its raster behind the room's frames on the same CPU: the computer's first wallpaper paint took the running game 1.1 s there. The monitor then paints its still and glass finish on CPU canvases (`willReadFrequently`) and asks the app's painter to do the same (`StillRequest.cpuCanvas`), so the work lands on the main thread, 7 ms of it, in the idle moments the room chooses.
- **Not measured since the room is generated**: the game's frame rate and the turn-on's worst frame gap on a slow
  CPU, long tasks in the flights to and from the computer, the click-to-first-flight-frame time, and the time to the
  first frame at 6× and 20× CPU throttling. The numbers this section used to carry were taken on the room with
  shipped files, whose load (a 7 MB download, decode and upload) and whose frame (353 k triangles) were different
  work. `node scripts/perf/profile.mjs` measures a production build along the visitor's path;
  `stats.generatedStats.marks` has the way to the first shown frame.

- **Resolution.** On the top tier DPR ≤ 2 and the drawing buffer ≤ 3 MP (1440 × 900 renders at DPR 1.52); a lower
  tier or scale draws fewer pixels (§ Quality).
  Scanlines need roughly ≥ 2.5 device pixels per game row; below that the shader fades scanlines and the aperture grille out instead of letting them alias.
- **Cost.** The generated geometry is 118,180 triangles on the top tier, 81,442 on `medium` and 71,154 on `low`
  (`stats.generatedStats.triangles`; every prop has a budget in `gen/gen.test.ts`). Read from `room.stats` in the lab
  (the `rose` finish, 1440 × 900, top tier, headless Chromium on an Apple GPU, the posters shown, five mock discs): the
  TV view draws about 56 k triangles in 20 calls, the room view 120 k in 41, the computer's 84 k in 18, the radio's
  with its discs up 61 k in 29 (on `low`: 33 k, 73 k, 50 k and 46 k, in the same calls). No three.js light is in the scene
  and nothing is shadowed per frame: static surfaces are unlit materials that read the bake (a chart's page, or vertex
  colours), and the finish extends those same materials (varnish, the TV's light, the storm).
  The picture texture is a 320 × 240 `CanvasTexture` re-uploaded with mipmaps only when the game reports a frame; the picture's light reads its colours from those mips on the GPU (no pixel readback).
- **Memory.** The baked pages dominate (`stats.generatedStats.pages`, `pageBytes`): four 2048² pages with their mips,
  89.5 MB, on a device that starts on the top tier; four 1024² pages, 22.4 MB, on one that starts lower. They are
  render targets: nothing is downloaded, decoded or uploaded for them, and they are allocated at the TV, when the bake
  is made. While it runs the bake holds 45.8 MB more (38.2 MB on `low`; `transientBytes`), freed once the whole room is
  lit. Beside them: the art page and the view outside (canvas textures, 1024² and 512² below the top tier), the
  posters' atlas (2,097,152 texels, ≈ 10.7 MiB with mipmaps, a quarter of that at 1K; `stats.postersTexturePixels`),
  the monitor's still (at most 1024 × 817; `stats.pcTexturePixels`), the discs' labels and the LCD
  (`stats.radioTexturePixels`: 1.06 M with five 384² labels) and the finish's own targets, which are the size of the
  drawing buffer and which `room.stats` does not count.

- **Lost canvases.** A GPU process reset (a laptop waking from sleep, a display change, a driver reset) loses the WebGL context and wipes every 2D canvas on the page, CPU ones (`willReadFrequently`) included, handing each back blank with its context's state reset; the restored WebGL context then uploads whatever a texture's canvas holds. A canvas painted once paints again on its `contextrestored` (`stage/canvasRestore.ts`): the radio's LCD, the TV's PAUSE OSD (`tv/osd.ts`), the monitor's composed still and its glass finish (`pc/Monitor.ts`, `MonitorTexture`; the still is composed again at once), the app's wallpaper (which then asks the glass for a repaint) and the disc prints (`app/radio/labels/discPrints.ts`: the decoded art is closed once painted, so it is fetched from the HTTP cache and decoded again, then painted on a new canvas that the room takes like any new print). The game's own caches (atlases, glyph strips, pre-rendered backdrops) are painted through the engine's `paintCanvas` (`engine/gfx/canvas.ts`), which repaints the restored ones, and everything painted after them, in the order they were first painted, then has the game draw its frame again, paused or not. The room's own light goes with the context too: its baked pages are render targets, so the bake runs again and `room.shown` is false until what the camera shows is lit (§ The generated room › Loss and failure); at the TV the app covers the canvas with the startup still meanwhile. A new canvas painted once must do the same; `e2e/gpu-reset.spec.ts` crashes the GPU process with CDP (`Browser.crashGpuProcess`) in a browser of its own and checks each surface.

## Flights

A flight is the one moment the whole picture moves, so a frame that comes late in it is a jump the eye cannot miss.
Three rules keep its frames to themselves (`e2e/flights.spec.ts` holds a cold first flight to them):

- **Nothing else runs while the camera flies.** `IdleWork` has a moment for it, `flying`, in which no unit runs, urgent
  or not: no bake unit (the bake's own stall timer asks the same question), no upload, no pick chunk, no still. What
  a lazy chunk makes as it arrives (the spotlight's two programs and its target, the walls' reveal, the guide's and
  the computer screen's mounting in the app) waits for the landing (`createRoom` › `atRest`, `PosterWall` ›
  `#reveal`, `RoomHost` › `atRest`, `PcSlot`); no chunk is asked for in a flight (the spotlight's from the TV behind
  the warming, the radio's deck at the first landing). The governor's changes of scale and tier wait for the landing
  too (§ Quality). A reduced-motion cut held black is not a flight: what runs then is out of sight.
- **What a flight shows is made before it sets off.** `ViewController.request` asks `whenReady`, which says whether
  anything is left to make: the rest of the room's light (`GeneratedRoom.whenWhole`), the work `IdleWork` holds for
  flights (`IdleTaskOptions.flight`: the textures no frame has drawn, the warming below, the walls' upload once they
  are painted, the radio's discs for the flight to the radio), the walls' and the discs' programs. Normally nothing
  is, and the camera sets off in the click's own task. Otherwise the game stops at the click (its PAUSE on the tube
  is the cue; `ViewController` gives the game back if the visitor stays), the frames are held (`RoomStage.hold`),
  `IdleWork.drain` runs that work unit after unit, and the camera leaves once the GPU's fence says it is through
  (`RoomStage.gpuIdle`). Each step is bounded (`PREFLIGHT_WORK_MS`, `PREFLIGHT_GPU_MS`, 0.4 s each; the bake alone is
  waited for however long, since no view may show a surface without its light): what is not made by then waits for
  the landing like everything else. Walls still being painted are not waited for: they fade in once the camera has
  landed. The first flight to the radio waits for the app's half the same way (`RadioDoor.onBoarding`: the CD
  player and its controls load and mount while the camera still rests; their layout alone is 23 ms of a slow phone's
  main thread, and stood 70 ms into that flight). A request made while the camera already flies makes nothing and
  holds no frame: the flight under way is not stopped for the next.
- **The camera moves by the clock, on the paced frames.** Every step takes the time of the frame it is drawn for and
  places the camera where the curve says for that time (`CameraRig.flightStep`), so a frame that does come late shows
  the camera where it should be by then, not a frame behind. The frames are the room's own (§ Rendering and
  performance › Frames): sixty a second on a 60 and on a 120 Hz display, evenly spaced. The curve is the house ease
  (`easeInOutCubic`): the camera starts and lands with no speed and no acceleration at any frame rate. The clock
  starts with the flight's second frame: the first shows the camera where it stands, because the click's own work
  falls into it (the page's interface takes the change of view: style, layout and paint, 22 ms on a phone-speed main
  thread), and the frame behind such a one comes late however little the room draws.

### Warming

three.js makes a mesh's vertex array and uploads its buffers the first time a frame draws it, and the driver builds
its own state for a program the first time it draws with one vertex layout into one kind of target. For everything
the TV view leaves out, that first time was a frame of the first flight, as the mesh came into the picture: 19
vertex arrays and 0.55 MB of buffers between 0.29 and 0.58 s into the flight, the fastest part of it. So every mesh
is drawn once where nobody sees it (`stage/sceneWarmup.ts`, `RoomStage.warm`): stand-ins with its geometry, its
material and its place, on a layer only the warming's camera sees, into one pixel of a target like the one frames draw
the room into (its format, its samples, its depth; `RoomAtmosphere.warm`). A few meshes a unit (24 k vertices), from
the TV a while after it turns on (`prewarm`), each unit an upload with an idle period to itself; whatever is left when
the visitor leaves is drawn before the camera sets off. The stand-ins share the meshes' programs (`e2e/programs.ts`
would count a new one), a mesh hidden for now is warmed too, one that is never drawn says so
(`userData.neverDrawn`: the pick meshes). A tier with other samples and a restored context are warmed again. A
program must be compiled for the target it is drawn into: `RoomStage.prepare` and `prepareAsync` bind the finish's
target first. (The walls' and the discs' programs were compiled for the screen: programs nothing drew with, while the
ones that did draw were linked, the main thread waiting, in the flight's frame that first showed a poster or a disc.)

### Measuring flights

`node scripts/perf/flights.mjs` loads a production build cold and makes the first flight at a chosen moment
(`--leave 0|1000|10000`, `--after-whole`, `--level`), then the others (`--path round|all`), on a desktop or a
phone-sized viewport with a throttled CPU, headless or in a window on the real display (`--headed`), with the slow-GPU
stand-in (`--config`), in Chromium or WebKit. `flightProbe.js` records every display frame, the camera the room drew
from in it and what WebGL was asked to make; the script prints each flight's frames against the paced frame (the
longest, how many came late, the largest step in speed) and what was made inside it, and `--timeline` everything that
ran in the first. `--trace` takes a Chromium trace of it, which `flightTrace.mjs` reads: the frames the compositor
dropped, which the page's own clock cannot see, and the long tasks of the page and of the GPU process.

## Quality

How much the room draws is a **tier** and a **scale** (`stage/quality.ts`), so a five-year-old phone holds its frame
rate and a laptop shows everything. Every tier keeps the room's look: the finish, the TV's and the lamps' light on the
room, the haze, the rain and the dust are drawn on all of them. A lower one gives up pixels, the baked pages' texel
density and, on the lowest, multisampling, the width of the bloom's filter and half the bake's light samples; nothing
else.

| Tier | Pixel ratio | Drawing buffer | Scene target | Bloom taps a level | Baked pages, for a device that starts there | Starts on |
| --- | --- | --- | --- | --- | --- | --- |
| `high` | ≤ 2 | ≤ 3.0 MP | 2 samples | 5 | up to 2048², full density | anything that is not a phone |
| `medium` | ≤ 2 | ≤ 1.6 MP | 2 samples | 5 | 1024², half the density | a phone (a finger for a pointer and a screen under 600 CSS px across): the picture `high` draws there |
| `low` | ≤ 1.5 | ≤ 0.9 MP | not multisampled | 1 | 1024², half the density, a shorter bake | a software renderer (which then stays there); otherwise only reached by the governor, which leaves the pages as they were baked |

- **Pages.** A device that starts below the top tier bakes smaller chart pages (`gen/tiers.ts`, § The generated
  room): 22 MB of them against 89 MB. The choice is made once, from the starting tier.
- **The scale** multiplies the tier's pixel ratio: 1, 0.85, 0.7 or 0.6. The canvas itself is drawn smaller and the
  browser scales it to the page, so the scene, both post passes and the dust all shrink together (the composite is the
  frame's dearest pass per pixel, so a full-size canvas over a smaller scene target would save least where it costs
  most).
- **The governor** (`QualityGovernor`) follows measured frame times, never the user agent. It judges only *runs* of
  frames (`RenderLoop.runInterval`: an animation's, each asked for as the one before it ends, and the game's, each asked
  for within 25 ms of the one before it; the lava's and the air's 24 a second and the radio's float at 30 were only
  waited for and say nothing), thirty at a time by their mean
  without the two longest, and never a pause (over 250 ms: a hidden tab).
  - Slower than 21 ms a frame: the scale steps down, far enough to reach 15 ms if a frame's time goes with its pixels
    (33 ms goes straight to 0.6).
  - At the floor and still slow twice: the tier drops (to scale 0.7 of the lower one) and never comes back this page
    load. The scene's target is made again without its samples; no shader is compiled (the bloom's width is a uniform).
  - Every frame on time (≤ 17.4 ms) and the scale under 1: one step up, after a wait every step down doubles (30 s, then
    a minute, up to four), so a device on the edge settles instead of pumping.
  - A step down that does not shorten the frames by 8 % undoes itself and rests the governor a minute: what was slow
    was the main thread, not the pixels (the game's first frames at 6× CPU throttling, say).
  - Not governed: a fixed tier (`quality: 'low'`), a software renderer (its frame times are the CPU's) and a browser
    under automation (`navigator.webdriver`: a test's paused clock or throttled CPU says nothing about the device, so
    end-to-end tests always draw the starting tier; `scripts/perf` unsets it to measure what a visitor gets).
- **A capped display.** Everything above is measured against the interval frames are meant to come at, which is a
  60 Hz frame only where the display hands out sixty a second or more. Safari in Low Power Mode hands out thirty,
  on an iPhone or a Mac, however quick the GPU; nothing a page does adds a frame. So the stage looks at the display's
  own frames before the room draws any (`RoomStage.watchDisplay`: sixteen in a row, the second quickest interval;
  a busy main thread makes some longer and nothing makes one much shorter) and `expectedFrameMs` turns that into what
  frames are expected at: a 60 Hz frame for a display about that fast or faster (the loop paces a faster one down),
  the display's own tick for a slower one. The governor's limits stretch with it (at thirty a second: slow over 42 ms,
  on time up to 34.8 ms), and so does the bake's idea of a late frame (§ The generated room › Pacing). A step down
  that does not shorten the frames is not tried again a minute later: frames are then expected as they came (a cap
  that began after the page opened, a main thread that is the limit), which costs one step down and back, once.
  Frames a quarter quicker than expected end the cap. (Judged against sixty, a capped phone stepped its scale to the
  floor and back every minute, two resizes each time, and baked the rest of the room at an eighth of the pace, every
  frame counting as late.) `room.stats.display` says what is expected and whether it is a cap; `qualityChanges` counts
  the resizes.
- **A change is a resize**: the stage's resize listeners run (the CRT's and the dust's pixel ratio, the monitor's pose),
  and the next frame is drawn whole at the new size. It waits for the camera to land: a flight's frames have no room
  for it (about 100 ms at 6× CPU). A tier with other samples is another kind of target, so the scene is warmed for
  it again (§ Flights › Warming).
- **The canvas is not multisampled** under a finish: the room is drawn into the finish's own target, and only two
  triangles and the dust onto the canvas. (The unprocessed bake, `mood: 'original'` at creation, draws straight onto
  the canvas and keeps its antialiasing.)
- **Reading.** Below the top tier the room's air (dust, rain) holds still while the camera rests at the computer: on a
  phone the live screen covers the room. On the top tier it drifts on beside the monitor.
- **Before the first frame.** The starting tier is a guess from what the device is; the governor needs thirty frames
  a window to correct it, which at ten frames a second is the room's first several seconds. So once the opening view
  is lit and before the still goes, `RoomStage.settle` draws the room behind it, a frame on each display frame, and
  times each by a fence: a frame within one and a half 60 Hz frames ends it at once with the quality as it was (a
  quick GPU draws one frame here and can never lose its tier to it); otherwise four are drawn, the first being the one
  that uploads the view's textures, and the quickest of the other three says how many pixels fit 15 ms
  (`fittingQuality`, `stage/quality.ts`: down the scales, then the tiers). The governor goes on from there. Not where
  the quality is fixed (`?quality=`, a software renderer, a browser under automation).
- **Seeing it.** `room.stats.quality` is the tier and scale; `?debug` hands out `window.__room` in a production build,
  `?debug=perf` shows the tier, scale, pixel ratio and frames a second in the page's corner, the rate the display
  hands out frames at and whether that is a cap, how often the quality changed, and the last flight's frames, late
  frames and longest frame (the way to read them on a phone: `app/hosts/perfReadout.ts`, its own chunk), and
  `?debug&quality=low` fixes a tier. The lab takes `?quality=`.
- **Measuring it.** `node scripts/perf/profile.mjs` drives a production build along the visitor's path (the game on
  the TV, the room, the computer, the radio) with a WebGL profiler injected ahead of the page (`glProfiler.js`: GPU
  timer queries, draw calls, the pixels of every pass, the main thread's time in each WebGL call), on a desktop or a
  phone-sized viewport with CPU throttling, in Chromium or WebKit; `--config '{"slowGpu":60}'` overloads the GPU to
  watch the governor work (every frame's WebGL calls are asked of the GPU that many times; `slowBake` does the same to
  the bake's draws, which are outside the frames, and `repeat` replays inside each frame's timer query), `--shots` takes the same poses of any build. `node scripts/perf/counterfactuals.mjs`
  switches each effect and pass off in turn. CPU throttling does not slow the GPU: a phone's GPU is reasoned about from
  the pixels a frame shades and each pass's share.

What the measurements said (Apple M4 Pro, headless Chromium on Metal, production build, each frame drawn ten times
over so the GPU's time stands clear of its timer's noise), and so what was and was not changed:

- A frame's GPU time goes with its pixels more than with anything in it: 3 MP costs 3.6 ms, a phone's 1.3 MP 1.4 ms.
  One pixel ratio step (2 → 1.5) takes 32 % off; no single effect takes more than 17 %.
- By effect, at the TV on a phone's 1.3 MP: the scene target's multisampling 15 %, the composite's bloom taps 13 %
  (all of the composite's finish 17 %), half-float targets 11 %, varnish 10 %, the eyes of a toy robot that stood beside the set 9 % (a per-pixel term; the bare-bulb lamp that took its place is baked), the CRT shader
  9 %, the canvas's own multisampling 4 %; the TV's area light, the opal lamp, the haze volumes, the rain and the dust
  are each within the measurement's noise (± 3 %). So the lights and the air stay on every tier.
- The main thread's dearest call at the TV is the picture's upload (`texSubImage2D` of the 320 × 240 canvas): 2 ms a
  frame at 6× CPU in Chromium, and in WebKit 2.5–3.5 ms unthrottled, where it reads the canvas back from the GPU
  process. Nothing tried makes it cheaper there (a CPU canvas makes it 10 ms; `getImageData` saves a third in WebKit
  and costs Chromium 86 ms), so it stays as it is.

## The generated room

The room every visitor gets is made in the browser (`src/room/gen/`): the TV set, its cabinet and game cases, the opal
lamp, the bare-bulb lamp, the plant, the floor, rug, walls, ceilings, door, window and blind, the view outside, the desk
corner and the computer, the dresser, guitar, lava lamp, console and CD player. No model or texture is fetched and
none is shipped (§ Assets); the two screens' glass are display meshes made on the main thread (`tv/tvGlass.ts`,
`pc/pcGlass.ts`).

- **Who builds what, when.** `createRoom` makes the stage and, at once, a `GeneratedRoom` (in the room's chunk: it is
  on the room's critical path), which starts the worker and, while that builds, compiles the bake's programs on a
  bake of nothing. The worker hands back every prop as flat arrays (0.12–0.2 s for the tiers' 74–127 k triangles in the lab's
  development build on an Apple M4; `generatedStats.buildMs`).
  The main thread then, a task at a time so the game starting on the still is not held up (each slice yields to an idle
  page, at most 120 ms on a busy one): paints the prints, makes the meshes, wires the room to them (`assembleRoom`:
  the glasses, the devices, the camera, the interaction), makes the bake and compiles the display's programs, and
  bakes. `ready` resolves when what the TV view shows is lit and drawn.
- **The bake is ordered.** Its chart quads are cut into cells of at most half a metre (`kit/charts.ts`); the cells the
  opening view's frustum touches, widened by 12 %, are the first pass (`generatedStats.openingShare`: 1 % of them at 1440 × 900 on the top tier, 4 % on the lowest,
  whose cells are fewer), with every prop's
  vertices; `Baker.begin` limits each view's light to a part of the receivers. That pass runs unit after unit as fast
  as the GPU takes them, and the stage draws no frame meanwhile (`RoomStage.held`: the startup still covers the
  canvas, so a frame would be a picture nobody sees that every unit queues behind on the GPU): about 100 ms on an
  Apple M4. The second pass, the other cells, runs behind the running game (Pacing, below): about 0.5 s there, behind
  the title screen or a level. Both passes render every view's shadow map, so the order costs the bake one
  more depth render a view and no light.
- **Leaving early.** No view but the TV's is shown before the second pass is done: a request for another view waits
  for it (`GeneratedRoom.whenWhole`, through `ViewController.whenReady`), and while one waits the stage is held again, for 1.5 s at most
  (`HURRY_HOLD_MS`): the TV's picture stands still on the game's PAUSE, the units take 12 ms of GPU each and follow each other as fast as
  the GPU takes them, so the wait is the GPU's time for what is left and not a frame's time for every view. A GPU that
  needs longer gets its frames back and the bake goes on a view at a time behind them. The room is whole when the GPU
  says so: a pass's last unit is waited for like every other (a fence), the pass that lights the rest of the room
  included, which reads nothing back. (It used to end the task after its last unit was handed over, with the
  composing of every page still on the GPU, and the camera that had waited for it set off into that: § Flights.)
  A viewport or inset change that
  makes the TV view show cells its pass left out hurries the rest the same way (`reframed`); a resized canvas gets its
  one frame while held.
- **Picking.** A click is tested against the props' own triangles: the TV set and the monitor are meshes of their own
  (scene.ts moves the desktop set's triangles inside `PC_SPEC.shell` into `monitor`), the desk's and the dresser's
  flat faces are their chart meshes, and the keyboard, the mouse, the chair, the tower, the lamp and the basket are
  index ranges of the desk corner's props mesh (`PropStats.ranges`) as meshes that are never drawn (`pickMesh`), and
  never compiled: `GeneratedRoom` takes them out of the scene for `stage.prepare`, because `renderer.compile` prepares
  invisible meshes too and theirs would be a program nothing draws.
- **Loss and failure.** A lost context takes the pages (the vertices' colours are kept and uploaded again): the bake's
  targets are freed in the `webglcontextlost` handler, where a lost context takes the calls in silence, `room.shown`
  turns false, and on the restore the prints are painted again and the bake runs again, TV view first when the camera
  is there (0.3 s on an M4; the result is the same light, `e2e/gpu-reset.spec.ts`). Away from the TV the canvas shows
  the room's props with unlit, black flat surfaces for that long (§ Known gaps). No worker and no main-thread build, a bake that throws or
  one that lights nothing: `ready` rejects and the app shows the flat television.
- **Geometry** is code: each prop is a function that adds placed primitives (lofted rounded rings, bevelled boxes,
  lathes, cylinders) to a builder (`gen/kit/builder.ts`, `gen/props/`). `gen/scene.ts` runs them all, in a worker
  (`gen/worker.ts`; on the main thread where a worker cannot be had, as the `roomBuilder` chunk), and hands back flat
  arrays. Every prop declares a triangle budget that `gen.test.ts` holds it to. Flat surfaces
  (the cabinet's faces, the floor, the wall, the printed covers) are *charts*: rectangles packed into texture pages at
  their own texel density (`gen/kit/charts.ts`), so nothing is unwrapped.
- **Surfaces** are functions (`gen/materials.ts`): oak boards, enamel, painted beadboard, evaluated once per texel by
  the bake. Their noise is integer hashes (`gen/kit/hash.ts`), exact in GLSL ES 3.0 and in JavaScript, so every GPU
  draws the same grain. Prints (the fictional game covers, the set's legends and wordmark, the console's) are
  painted on one 2D canvas (`gen/artPaint.ts`), and painted again when a GPU reset blanks it (§ Lost canvases).
- **Light** is a table of nineteen lights (`gen/rig.ts`, The night's rig below): the colours of the rig the room was
  first lit with in Blender, places read off the room. `gen/bake/Baker.ts` renders each light once from several
  points of its emitter (144 views on `high` and `medium`, 78 on `low`, each rendered in both passes, so
  `generatedStats.views` is 288 and 156; a fill that nothing shadows needs no shadow map), each through a shadow
  map of the room's real geometry (read as a tent over nine texels, so an edge is a ramp and not the map's staircase), and adds it to the charts' light pages and to a page holding one texel per prop
  vertex: soft shadows by accumulation, which a frame could never afford and a load can. It then composes surface ×
  light under the display curve into the pages the charts draw with, and reads the vertices' colours back. Without
  half-float render targets it accumulates in eight bits.
- **The display curve** (`gen/bake/shaders.ts` › `display`): scene-linear `c = albedo × light × exposure`, then a toe
  and a shoulder, `c ← c^1.4` and `c ← 1.15 c / (c + 0.3475)`, which stand in for the filmic transform the Blender
  bake held (AgX, medium-high contrast); after it the lamps' warm pools and the two `finish` lights are added in the
  finish's own terms. The renderer does no tone mapping of its own (§ Assets).
- **The finish's static lights are in the bake.** The opal lamp, the bare bulb and the lamps' warm pools never
  change, so the generated surfaces carry them, in the finish's own terms and with real shadows, and their materials
  names say so; the per-frame surface shader (`RoomGloss`) has no such terms any more. What runs every frame is what
  changes: the TV's light, the storm, the varnish. The bake reads the mood once; a mood changed
  afterwards (the lab) keeps the pools and lamp it was baked with.
- **A frame**: unlit materials named for the finish (their varnish and sheen), one map or vertex colours; what the
  views draw is under § Rendering and performance › Cost.
- **Pacing** (`gen/bake/pace.ts`). A view is drawn in pieces (its shadow map, each page's light, the vertices' light:
  `Baker.step(pieces)`; the shadow map is the bake's own target and waits there between units), and a unit is as many
  pieces as the GPU has been seen to finish in 4 ms, at least one. After the views a pass composes its pages, and
  that is pieces too: sixteen slices of about the same texel area a page (`composeSlices`), a page cleared by its
  first slice ever and never again (a later pass draws over the pages the room's frames are showing), its mip chain
  made with its last. In one piece the composing of the four pages was the bake's largest draw by far and no frame
  got past it. A reading (a timer query's, or the wait for the
  unit's fence) can only be too long, a frame's work having been on the GPU ahead of the unit, so behind the room's
  frames a piece is taken to cost the smallest of the last three. IdleWork decides when the main thread runs a unit,
  between a playing game's frames; one it has not run for 100 ms runs anyway (a main thread that is never idle while
  the game plays), except while the camera flies or the tube turns on. The next is not queued until a fence says the
  GPU has the last one behind it, so frames always go in between. When three units in a row say a single piece takes
  over 5 ms, the units are spaced out to a quarter of the GPU's time and never more than 100 ms apart
  (`generatedStats.deferred`): the rest of the room arrives however slow the GPU, where it used to wait for a quiet
  moment that a visitor at the title screen never gives it. A game being played comes first: every frame of the room
  that comes a fifth later than frames are meant to here (over 20 ms on a 60 Hz display, over 40 ms on one capped at
  thirty a second: § Quality › A capped display) halves what the bake's units take, down to an eighth, and rests the
  bake up to 100 ms between them; frames on time give it back a tenth at a time (`BakePace.frame`). A visitor waiting
  to leave, and the opening pass, are not paced by frames at all. The bake's programs and the display materials' link
  without blocking where the GPU allows it.
- **A slow GPU.** The opening pass times its own units (nothing else draws, so the wait for a unit's fence is the
  bake's time); when the quickest of its first five says the pass would take over 0.8 s (`OPENING_BUDGET_MS`), the bake
  starts over with the lowest tier's sample counts whatever the tier (`generatedStats.profile` `short`: 77 views a pass
  instead of 143, so penumbras in fewer steps; the shadow map and the pages stay the tier's). A GPU about twenty times
  slower than an Apple M4 Pro's gets it; that machine and anything within ten times of it bake as before, pixel for
  pixel. Measured with the perf script's stand-ins (§ Quality › Measuring it: every frame and every draw of the bake
  asked of the M4 Pro's GPU 48 times, which is not a phone), medians of three:
  at 1440 × 900 on the top tier the room is ready in 2.9 s (16.3 s before the bake was paced this way; 0.55 s
  unslowed) and a visitor who leaves in that frame waits 0.8 s (12.1 s; 0.2 s); at a phone's size on the middle tier,
  with the CPU throttled six times, 3.1 s (10.4 s; 1.5 s) and 0.9 s (7.4 s; 0.3 s). The time to ready that is left
  is the opening pass itself, most of it the props' vertices, lit as points in every view, and the three or four
  frames that find the quality to show the room at (§ Quality › Before the first frame: 0.3–0.4 s on that stand-in,
  none measurable unslowed). With a level started as the room turns ready, the same stand-ins then hold 62–66 frames
  a second from the first second on the desktop (`low × 0.85`) and 56–64 on the phone (`low × 0.7`, where its
  throttled main thread is the limit), and the whole room is lit 2.8 s and 0.9 s after ready.
- **Tiers** (`gen/tiers.ts`, read once from the starting tier): `high` packs charts at full density into pages up to
  2048² (four pages, 89 MB with mips) and bakes light at half the pages' size; `medium` and `low` use half the
  density in 1024² pages (22 MB); `low` also halves the shadow map and the samples (which a GPU measured slow takes on any tier: A slow GPU, above). The bake's own targets peak at
  46 MB (38 MB on `low`) and are freed when it ends.
- **Sixty frames a second.** While the room is lit its loop is paced (`RenderLoop.pace`, § Rendering and performance ›
  Frames): it draws on the display's own frames, evenly spaced and sixty a second on 60 and 120 Hz displays, in every
  view, as a run the quality governor judges (§ Quality), whether or not anything moves; none while the canvas is off
  screen or the tab hidden (it looks again four times a second).
- **The lava lamp** (`gen/props/lavaLamp.ts` the generator; `gen/props/lavaWax.ts` its measurements and the wax's
  pose, plain arithmetic kept apart so the room's chunk carries no generator; `gen/LavaWax.ts`): a lathed foot and
  cap in the baked props, the bottle as a film of added light, and wax that is a function of the clock. Six blobs ride
  the bottle's axis on periods that share no multiple (23 to 79 s), each a soft kernel stretched along its way; the
  wax's surface is where their sum with the pool's crosses a threshold, so blobs grow necks, merge and part. Around
  the axis it is a circle, so the whole of it is a lathe of 56 moving rings (560 vertices, 1,120 triangles) that
  `poseWax` fills in about 0.013 ms, at most thirty times a second, and only while the lamp is in the frustum, the
  canvas on screen, the tab visible and reduced motion off (then it stands in one pose). No shader of its own, no
  texture, no clip: two unlit vertex-colour programs that are the same on every tier, the wax's and the glass's, which
  the bare bulb's glass shares. The bottle is one front-faced draw whose index holds every triangle twice, once wound
  each way, so both its walls add their light without the two passes, and two programs, of a double-sided blended
  material. When no other frame
  comes it asks for 24 a second; `stats.lavaRunning` says whether it moves.
- **The CD player** (`gen/props/radio.ts`, `gen/GeneratedRadio.ts`) is generated part by part: the body, the lid and
  its underside, the rocker's two halves, the side keys, the well and the plate that closes the body under a shut lid,
  nine vertex-lit meshes and no texture (its legends are a strip of the art page, `gen/radioArt.ts`). `RADIO_SPEC`
  (`gen/props/radioSpec.ts`, the constants the generator builds from) is the machine's measurements (hinge, rocker pivot, key travel, turntable, slot, well, display, lamp,
  bounds), and the geometry is built from it; `radio.test.ts` holds it to the constants the cameras, the choreography
  and the overlays use (`DECK`, `LID_FRAMING`, `RADIO_FIXTURE`, `RADIO_ANCHOR`) within half a millimetre. The device
  takes its parts from the generated room (`radio/partsProvider.ts`): it waits for their light and hangs nothing
  itself (`GeneratedRadio` has the parts on their pivots). In the bake only the body casts a shadow: the well is lit
  through the open hole and the lid's underside is generated, and lit, where the open lid holds it, then hung on the
  pivot turned back by the open angle. Vertex colours rather than charted pages: the radio is curved, moulded and
  moving, a chart is a flat rectangle, and at the close-up's 3.6 device pixels a millimetre its panel alone would want
  a 2048² page (22 MB with mips) where the vertices cost 0.6 MB and nothing to upload.
- **The night's rig** (`gen/rig.ts`; what each light is for and what explains it: ROOM-ART-DIRECTION.md › The
  light). Each of the seven lights of the Blender rig has its counterpart, by the names
  the table's comments quote: the warm attic practical, which had no fitting and is now the lamps' own dim warm
  bounce (`pool`, with `bounce` and `floor` for what its pool sends back up), the TV's reflected blue (`tv-glow`, and `fill` on the left wall), the blue-hour window (`moon`,
  `moon-through-blind`, `moon-on-blind`), the window's reflected corner fill (`blind-scatter`, and `fill`), the lava
  lamp's amber spill (`lava`, `lava-spill`), the tungsten task light (`desk`, `desk-wall`, `desk-fill`) and the computer's CRT
  bounce (`crt`). Beside them: the `ambient` dome that only furniture shadows (its light from below, the floor's bounce, only by
  what stands within 1.1 m of a surface: sixteen outlines of the furniture on a ceiling are blotches), `blind` (the room's own light on the
  slats' face), and the two `finish` lights, `opal` and `bulb`, which stand where `gen/roomSpec.ts` says the lamps
  are (`TV_LAMP_SPEC`, `BULB_SPEC`). The window's light is a small emitter outside and above the sash, in two parts:
  what comes under the blind (the bright patch past the desk's end) and what comes through it (a third, unstriped:
  `clear` ends its shadow map past the slats, whose stripes a handful of emitter points cannot resolve). A pool over
  the middle of the floor and its bounce stand for indirect light, which the bake does not compute; the desk lamp and the lava lamp are
  small omnis that their own housings do not shadow (`clear`); what the desk lamp sends past the desk's left end is a
  fill (`desk-wall`, the `desk` light's exact complement: its arm, the sill's horn and the casing would be drawn a metre
  wide and hard on the walls), and the lava lamp's spill lights nothing of the dresser it stands on (`beam.facing`); the blind and the casing are lit from the room side
  through a portal the size of the casing. Eight-bit light pages (no float colour buffers) round each pass by a hash
  and are read through a small blur, so a hundred weak passes still sum to the light's mean.
- **Comparing it.** `node scripts/gen-shots.mjs` shoots the four views and seventeen true-zoom crops from fixed
  cameras (`--tier`, `--viewport desktop|phone`, `--mood`, `--eight-bit`, `--only`, `--out`); `--compare
  docs/gen/reference` writes each beside the same picture of the room with shipped files. `docs/gen/reference/` is
  that room's record (high and low, desktop and phone, and its posters), taken before its files were removed; it
  cannot be taken again.

- **Reading it.** `room.stats.generated` is `loading`, `opening` (the TV view lit, the rest on its way), `ready` or
  `failed`; `generatedStats` has where the geometry was built, the views baked, the bake's main-thread and wall time
  to the opening view and to the whole room, the opening pass's share of the cells, the longest view on the GPU,
  whether the rest's units had to be spaced out (`deferred`), the bake's `profile`, and `marks`, the way to the first shown frame in ms since the room's creation.
  `e2e/generated-room.spec.ts` covers it.
- **Finely made props.** The TV set, the desk set, the chair, the desk lamp, the tower, the wire basket, the rug, the plant and the bare-bulb lamp are built to be seen
  at arm's length (`gen/props/tvSet.ts`, `monitor.ts`, `keyboard.ts`, `mouse.ts`, `tower.ts`, `deskLamp.ts`, `chair.ts`,
  `deskThings.ts`, `wireBasket.ts`, `plant.ts`, `cabinetLamps.ts`, the rug in `shell.ts`), to measurements read off the shipped room's models before they were removed. `gen/props/form.ts` is what they share: skins and
  patches toned a vertex at a time (`MeshBuilder.gradient`), outlines cut along their sides so the light baked at the
  vertices can change across a face, mouldings with eased edges, turned parts, slabs. A tone finer than the mesh shows
  as specks a vertex wide: unevenness is kept slower than the vertices. The keyboard's 104 legends, the lock lamps'
  words and the lamps' glow are prints on the art page (`gen/deskArt.ts`, laid out by `props/keyboardLayout.ts`).
- **Detail by tier.** A prop builds to `PropSink.detail` (`gen/tiers.ts`: 1 on `high`, 0.6 on `medium`, 0.45 on
  `low`): `form.segments` turns it into segments, and the smallest parts go first (a spring's coils become a striped
  sleeve, a cap loses its bevel and dish, the louvres halve). The room is 127 k triangles at full detail, 85 k and
  74 k below it (the shipped room: 353 k); a prop's budget in `gen.test.ts` is for full detail.
- **The TV set** (`gen/props/tvSet.ts`; 11.0 k triangles at full detail, 5.6 k and 4.9 k below it, against 15.9 k for
  the model it stands for) is built to that model's sections: a front shell whose outline is a squircle (superellipse
  corners 6 cm long), its face crowned and its chin's edge a smile, a steep lip to the glass, a soft shoulder, a seam,
  and the rear cover: a tray, the chassis' drum round in plan with the neck's housing, the tube's hood with its
  cooling slots. It stands on a plinth with a bowed toe and four pads. The shell and the tray are one skin of loops
  that are all cut at the same places (`loop`, `cutsAt`), so its lines run straight and a block of the face's quads
  can be left out for the jacks' well, which a collar (`collar`) joins to the block's rim: a real hole, its wall and
  floor behind the face. Keys, jacks and the lamp's body are turned parts; the speakers' louvres and the hood's slots
  are dark strips a hair proud. Nothing is built that no view can see: the connectors on the wall under the neck face
  the room's wall 14 cm away. The startup still's outlines are traced from this set (§ Startup).
- **Two prop meshes.** The desk corner's props are a mesh of their own (`MeshName` `desk`), small enough about the
  desk that the TV view's frustum leaves it out: on the top tier the opening view draws 64 k triangles, the computer's
  84 k, the room's 120 k (§ Rendering and performance › Cost). Anything new at the desk joins it; anything that would stretch its bounds across the room does not.
- **Relief.** A chart may be a sheet that does not lie flat (`Chart.relief`, `gen/kit/charts.ts`): cut into cells and
  lifted off its rectangle's plane by a height function, its texels still the flat rectangle's and its light baked on
  the lifted surface (with `emphasis`, on steeper slopes than the real ones, so soft cloth reads). The rug is one: a
  ridge, a crease and rucks, 75 cells a side on `high`, 50 and 25 below. Past the crease of its turned corner the chart
  dives under the boards, and the corner itself is geometry: the cloth rolled back over the pile, jute side out. The rug
  has its own chart group (`03_Room_rug_BAKED_UNLIT`: wool takes no varnish) on the TV corner's page, which had room
  for it at full density; the floor's page holds the boards a quarter sharper for it, in the same memory.
- **The boards are at 6 mm** (`FLOOR`, `gen/props/types.ts`), where the shipped floor's top is and where everything
  that stands on it was measured to stand; a prop on the floor rests on `FLOOR`, not on 0 (the game console's
  heights are all from `FLOOR`: built from 0 it stood 6 mm into the boards).
- **The bake's vertices are points**: a prop vertex is lit as one point on its texel (a third of the triangle it
  used to be, to build and to upload), so the bake's longest main-thread unit is 11–14 ms for the top tier's 118 k
  triangles on an Apple M4 (`generatedStats.longestUnitMs`).
- **Close inspection.** `node scripts/gen-closeups.mjs --label <name> [--tier low] [--only monitor,keyboard/macro] [--studio [--gain 10]] [--still]`
  shoots a prop from fixed cameras at arm's length (front, three-quarter, top, low, details); `--studio` lights the
  props with a plain key and fill instead of the room's bake, to judge form and albedo whatever the rig (`--gain`
  times as bright: the set's black plastic shows its form at 10); `--still`
  asks for reduced motion, so the wax stands still and two runs compare pixel for pixel; `--sheet a,b,c` lays labels
  side by side. A changed prop is held to its own pictures from before the change.

## Atmosphere

The production app fixes **Velvet dusk** (`rose`) at **70% haze and 30% dust**, passed to `createRoom` together so the
first frame already has the intended finish. There are no mood controls or production URL overrides. The lab keeps
`?mood=original|honey|rose|midnight` and `setMood`/`setAir` for visual regression comparisons.

| Mood | Direction |
| --- | --- |
| Honey & dust (`honey`) | Golden lamps, tobacco-brown shadows and slowly drifting amber dust; the warmest evening. |
| Velvet dusk (`rose`) | Amber lamplight against the blue of a rainy night, ink-blue shadows, soft haze and the most dust; the app's finish, and the room's colour script in numbers (ROOM-ART-DIRECTION.md › The colour script). |
| Moonlit hideaway (`midnight`) | The darkest exposure, cool blue window air, copper lamps and finer silver dust. |

The bake remains the source of light and occlusion. Hard surfaces receive a shared shader extension for restrained,
view-dependent lamp/window reflections; fabric, posters and screens stay matte. All baked room surfaces keep their
occlusion while their light near the lamps warms up. The lamps carry soft, depth-tested halos; the opal lamp beside
the TV is light the finish adds (§ The opal lamp).
The scene draws once into a half-float target, multisampled on the top quality tier (§ Quality; 8-bit fallback
without float colour buffers), then two full-screen triangles extract highlights at quarter resolution and composite their mip-based glow
with a linear split-tone grade and vignette. No second tone mapping is applied to the baked display transform.
The finish stays on throughout the room, TV, radio and computer views, including their camera flights. Warm pools of
light sit against darker ambient exposure, with restrained bloom and varnish. Screens keep their contrast and sharpness:
`RoomScreens` marks the `replaceable_screen` meshes in the existing frame's alpha, so their pictures receive only 12%
of the colour grade and no additional bloom or vignette. The mask follows the real geometry, including occlusion and
hover movement, with no extra render pass. Additive light preserves that alpha. A display is light of its own colour,
not lamplight: in the highlight extraction only its brightest pixels (a soft knee from 0.65 to 1.3) glare, at a
fraction and with the warm bloom tint divided out, so the picture's mean colour no longer settles over the set as a
milky veil; its light reaches the room as light (§ The TV's light). `LiveScreenMood` applies the same subtle tint to
the computer's live DOM screen; its SVG filter is removed for the original comparison. The monitor's fixed bezel glow
quad is disabled while a finish is active, avoiding a detached rectangular rim during flights and hover; its spill is
decoded from its display-space tuning before drawing into a linear target, preventing double encoding and glare. Grain
is fixed.

### The TV's light

The picture is an area light (`tv/screenLight.ts`), and the finish lights the room with it. `Television` measures it
on the set: the picture's outline on the curved glass gives its extent and the plane it emits from (the depth of its
edges, about 1 cm behind the glass's bulging middle), and the bezel's aperture at the front of the set, 1.6 cm in
front of that plane, is the opening it is seen through. It publishes the uniforms on the glass (`userData.screenLight`)
and sets their output from the tube's (`syncGlow`, so power on and off dim it); `RoomAtmosphere` shares them with its
composite and with every baked surface `RoomGloss` extends, scaled by the finish (three times the picture's displayed
values, as the tube outshines the dim baked room more than an 8-bit display can show; zero for the original bake).

- **Diffuse.** Every baked surface in front of the picture's plane receives the form factor of the part of the picture
  the opening lets it see: Lambert's polygon formula over its four corners (three's LTC edge fit), with Heitz and
  Hill's clipped-sphere horizon. The opening, projected from the surface onto the picture's plane, hides what the chin
  and the bezel hide from the cabinet top and the plant beside the set. The bake stands in for albedo (25 × the baked
  colour, at most 0.85: the room's dim night light is about 4 % of full light where the TV stands). Nothing is lit
  behind the picture's plane (the wall, the cabinet top beside the set), nothing whose horizon hides the whole picture
  (the flat front of the set around it, which a recessed picture cannot reach), and nothing beyond 3.5 m (it fades from
  2.5 m, where it is a fraction of an 8-bit step).
- **Colour.** The picture near the surface, from the picture texture's mip chain: a footprint 2.5 × the surface's
  distance wide (half of a Lambertian surface's light from a large emitter comes from within about that radius). So the
  bezel's lip takes the colour of the picture's edge beside it, and the floor a metre away the picture's mean.
- **Specular.** The set's own plastic (`device_tv_front_BAKED_UNLIT`) mirrors the picture through a satin lobe about 25°
  wide: where its mirror ray meets the picture, blurred over the lobe's footprint and weighted by Fresnel and by how
  much of the lobe the picture fills. Its steep lip round the picture shows a blurred band of the picture's edge, as
  on a real set, brightest where the lip turns onto the face (the wall beside the glass sees the picture edge on).
- **Haze.** The composite adds single scattering of the picture's mean colour in the air in front of the set: a
  Lambertian point 25 cm behind the glass, its cos / r² intensity integrated in closed form along the view ray, over the
  cone within 1.2 m in front of the glass and from 2 m from the eye on. Across the room it hangs in front of the set;
  from the TV view (at most 1.75 m back) the air between the eye and the set is too thin to see, so it never veils the
  set or the picture.
- **The glass.** The CRT shader's halation carries a little of the picture's light (its LOD 2, so the edge's own
  colour) a few millimetres past the raster into the tube's dark border, fading before the bezel (`exp(−0.4 ×` native
  pixels`)`); away from the glass's sheen the border is black rather than flat grey.

The light follows every game frame (a phosphor's afterglow lasts about a millisecond), from the mips the picture's
upload already makes: no readback, no extra pass, draw call, render target or program. The unprocessed bake (`original`)
has no live TV light. `e2e/tv-light.spec.ts` paints the lab's picture in
menu colours and checks that the lip and the tube's border take its colour, the set's front stays dark (the veil this
replaced added 19–31 levels there), the floor before the set brightens and the far wall does not.

The frame also resolves its depth. The composite integrates three soft volumes of illuminated air (desk lamp, lava
lamp and slanted window light) along the camera ray, ending at the first surface. There is no ray marching or temporal
history to leave trails during flights. A final single draw of 580 deterministically placed points adds fine, gently
drifting dust. Each mote checks the frame depth for occlusion and its alpha to stay off both screen pictures; size is
capped at five CSS pixels to avoid foreground glare. Neither haze nor particles cover live PC text.
Rain shares the existing composite: no additional render target, draw call, shader program or texture. A camera ray
intersects the window plane at z=-2.43 within its world bounds. Scene depth masks the frame, blinds, sash and computer.
Rounded water lenses and fine beads distort the view outside directly (the plate behind the window, painted in code:
`gen/artPaint.ts` › `paintExterior`); its mip chain
softens the damp glass between drops. Moving drops pause and accelerate, leaving narrow, irregular tapered trails.
Small warm/cool reflections and darker menisci give the clear beads volume. World-space coordinates keep them attached
to the glass through flights. Sampling the exterior directly prevents foreground objects from bleeding into refraction.
The visual reference is Surin's [Rain drips on glass](https://www.youtube.com/watch?v=yl6Vh-hmKjk).

Sporadic off-screen storm flashes brighten the exterior and send cool light through the actual opening. The baked
materials receive a directional flash with projected sash/blind bands and softer indirect bounce, retaining the baked
contact shadows and texture detail. Window haze also catches the flash. There are no visible bolts or screen overlays.
An irregular double flicker lasts about a second every 45–91 seconds; the first is around 18 seconds into the first
room visit. Reduced motion suppresses flashes entirely, including clearing an active flash immediately. The recording
supplies its own quiet thunder; flash timing is independent of those recorded sounds.

The shared rain/dust timer requests at most 24 frames/s and defers to existing game/flight frames. It stops at the TV,
with the original bake, while hidden or context-lost, on disposal, or when both dust is zero and the window is outside
the frustum. Reduced motion freezes rain and dust. The resolved depth adds at most 12 MB at the 3 MP cap.

`e2e/programs.ts` is where the program counts are pinned, with what draws with each: the room holds 12 from its first
frame without a finish, the posters add 1 and the spotlight 2, and a night finish adds 10 to that (its halation,
highlight extraction, composition and dust, the monitor's display mask, two variants the varnish splits off, and the
posters' linear-target variants): 25 after the first room view in the app, 27 once the radio's discs have been drawn.
Reduced motion adds none. `e2e/room-moods.spec.ts` covers distinct colour/brightness, program reuse,
reduced motion, the fixed production finish, dust visibility and scheduling, device navigation, TV contrast and exclusion of
dust/haze from its picture, live-PC tint and hand-over, resize and WebGL context restoration.

### The opal lamp

A small opal globe lamp stands on the right-hand end of the TV cabinet (`gen/props/cabinetLamps.ts` › `opalLamp`: a
round metal foot and a 16 cm globe), so the opening TV view is not lost in the dark around the set.

- **Its light is baked.** `gen/rig.ts` › `opal` is a sphere light at the globe's centre (`TV_LAMP_SPEC`,
  `gen/roomSpec.ts`), rendered through shadow maps of the room's geometry like every other light: Lambert with a
  slight wrap, softened to `1 / (d² + 0.04)` and faded out from 1.4 m to 2 m. It is a `finish` light: the bake adds it
  in the finish's own terms (`TV_LAMP_INTENSITY`, 0.14 × the lamp's colour), so the wall
  beside the set, the plant, the set's right side and the cabinet top carry it with real shadows, and the surface
  shader has no term for it. `gen.test.ts` holds the copy in `gen/tiers.ts` to `atmosphere/tvLamp.ts`.
- **What a frame adds** is what depends on the eye (`atmosphere/tvLamp.ts`, two uniforms): its reflection in the
  varnished surfaces (`RoomGloss`), a little warm air in the composite and its halo (`RoomHalation`). The globe's
  mesh is drawn as light: its colour × `glow` (2.8), past white, which the finish's highlights bloom around.
- **Programs.** The globe and the bulb's filament draw with the room's plain-colour program; under a finish the varnish
  gives them a variant of their own (`e2e/programs.ts`).
- **Original.** The unprocessed bake (`original`) has no finish lights: it shows the globe but no light from it.

The startup still (§ Startup) draws the lamp, its pool and its halo.

### The bulb lamp

A bare-bulb lamp stands on the left-hand end of the TV cabinet, turned most of the way down
(`gen/props/cabinetLamps.ts` › `bulbLamp`), so the dark left of the set has light and something to look at: a lamp
of today, a cast concrete cylinder (84 mm across, 62 high, on a cork pad) with a smooth matte black socket, and a
clear pear-shaped bulb, 21 cm in all. It stands
forward of the set's flank, so the room's overview sees it past the set as the TV view does beside it. Its filament
is a cage, strung up and down between the hooks of two glass buttons on the stem, so it reads as a filament from every
side and can be looked at. A grey cloth flex leaves the base's back, lies across the top through a small pale inline
switch and drops behind the cabinet. It builds lighter on the lower tiers (the concrete's grain is a speck a vertex,
so the top tier cuts the drum finer; fewer segments below it).

- **Its light is baked.** `gen/rig.ts` › `bulb` is a point of light at the middle of the filament (`BULB_SPEC`,
  `gen/roomSpec.ts`), softened to `1 / (d² + 0.06)` and faded out from 1 m to 1.6 m: a warm pool on the cabinet top,
  on the set's flank and on the wall behind. Like the opal lamp's it is a `finish` light, three fifths of its
  intensity (`BULB_LAMP_INTENSITY`, 0.084; `gen.test.ts` holds the rig to it). The lamp itself, its flex and its switch stand
  inside the light's `clear` and shade nothing of it: what the holder would shade lies under the base, and a base's
  edge drawn hard on the top's few light texels is a ring of teeth around its foot.
- **What a frame adds** is three small draws and no term in any shader. The filament is drawn as light of its own
  colour, like a display (`RoomGloss` › `EMITTERS` writes alpha 0, `RoomScreens`' mask): the finish's bloom spreads a
  thin bright line into squares, so it passes it by, and the glow is one round depth-tested halo about the filament
  (`RoomHalation.addLamp` with a tint, `BULB_LAMP_HALO`, 11 cm). The glass is clear, so it is only what it reflects: a
  film of light added to the frame in colours its generator gives it (a faint sheen, the filament's glow in it, its
  limbs as the room's eye sees them, the window's glint), drawn like the lava lamp's bottle. The stem and the
  buttons are glass too, and part of the same film.
- **Programs.** None of its own: the lamp is part of the merged props, the filament shares the globe's program, the
  halo the halation's, and the glass the program of the lava lamp's bottle (`e2e/programs.ts`).
- **Original.** The unprocessed bake shows the lamp, its filament and its glass but no light from them.

The startup still does not show the lamp either.

### Rain audio

`rain/RainSoundSlot` imports the native Web Audio implementation on idle after TV power-on. The supplied
`public/audio/attic-rain.mp3` is decoded once at 24 kHz stereo (~23 MB) and driven by one looping AudioBufferSourceNode.
An offline equal-power crossfade blends its final eight seconds into the first eight; the loop resumes at t=8,
continuing the incoming samples without MP3 padding or a JS timer seam. The original file is retained verbatim.
`Room.setMuted` shares the app sound switch. Rain plays throughout room/PC/radio navigation; the gain fades over
180 ms at the TV, on mute or when the document hides, then the audio context suspends. Returning resumes the same
source/playhead. Browser autoplay restrictions are retried on real gestures. Disposal aborts loading, removes
listeners and closes the context. `stats.rainReady`/`rainPlaying` expose diagnostics. `e2e/rain.spec.ts` checks the
actual decoded loop seam, stereo/rate, all views, mute, one-source reuse and context cleanup.

### The rug

`gen/props/shell.ts` › `rug`: a 2.35 m square of wool 2 cm thick, turned 15° clockwise, its rim a soft shoulder over
the cut side and the jute backing, with the corner nearest the TV rolled back over itself: a fat roll (wool this thick
does not crease), jute side out, that comes down in a soft S and lies on the pile. Its pile is a surface function
(`gen/materials.ts` › `rug`): navy and oatmeal checks (an old rug: the pale wool is aged, so the room's largest pattern stays under the
lamps' pools in value) with tufts, rows of weft and the nap a brush and a vacuum cleaner
leave, which the navy shows about three times as strongly as the ivory (dark wool does), baked like every chart.
Changing the pattern is a change to that function; there is no image.

### The window

`gen/props/shell.ts` › `windowFrame`, to the shipped window's measures: a 13 cm casing (a bead at its inner edge, a
band at its outer, a head board under a bed mould and a cap) whose face stands 87 mm proud of the wall, a stained sill
with a rounded nose over its apron, the jamb with its stops, and two sashes, the lower in front of the upper, that meet
at 1.65 m (`MEETING`): under the blind, where their two cam fasteners show; two hook lifts on the bottom rail. The
blind (`BLIND`) hangs on the casing's face, in front of the opening: a head rail and valance, twenty crowned slats
tilted open with their room-side edges low (the eye sees the night between them from below, and the rig's window light
does not depend on them: docs › The night's rig), drawn up 47 mm crooked at the right, on ladder cords with a rung a
slat, a bottom rail, the tilt wand at the left and the lift cords with a turned wooden pull at the right. The glass is
not the generator's: the rain's plane stands at z = −2.43, behind both sashes (`WindowRain.ts`).

## CRT look (crtShader.ts)

Linear-light pipeline: the sRGB canvas texture is decoded on sampling and re-encoded by three's `colorspace_fragment`.
Per pixel: content rect → power deflection and vertical roll → sharp-bilinear horizontal sampling (slight softness) → Gaussian beam per scanline (brighter rows bloom wider) → white raster mix during power-on → mip-based bloom on bright pixels → aperture grille in device pixels → vignette → rounded raster edge → halation a few millimetres past it into the dark border → glass (soft sheen, Fresnel) on top of a dark green-grey unlit tube.
Power-on (≈600 ms after a 140 ms LED lead): dot → horizontal line → vertical snap-open with overshoot → white raster fades into the picture with a brightness bloom and a short roll. Power-off reverses it. Under `prefers-reduced-motion` both are 160 ms fades and camera moves become a 280 ms fade-through-black cut.

## The computer's monitor (`pc/`)

The room owns the monitor as a device and knows nothing about what the app shows on it, just as it shows a `GameSurface` it does not understand.

- **Glass contract.** The glass (`pc/pcGlass.ts`, from `PC_SPEC.glass`) is a display mesh made on the main thread, not a baked one (`interaction_id "pc-screen"`, `replaceable_screen`): a 12 × 10 grid facing +Z with planar UVs (v = 0 at the top), flat along its rim and domed 11 mm inside it, because the flat DOM screen and the projector UVs depend on that facing and those UVs. Bounds x −1.518…−1.162, y 0.929…1.213, the rim at z −1.679; the picture is that rim rectangle inset by a 10 mm tube border with 6 mm corners (`PC_PICTURE_BORDER`, `PC_PICTURE_RADIUS`). The shell, the keyboard and the desk top it measures against are `PC_SPEC` too (`gen/roomSpec.ts`), which `gen.test.ts` holds to the generated desktop set.

- **Camera.** `pcViewpoint` looks exactly along −facing (zero pitch, yaw and roll) and fits the glass plus 18 mm of bezel (30 mm chin) into the whole viewport with a 2 % margin, starting at a 30° lens and widening while the eye would be further than 0.72 m from the glass (it stays clear of the chair). Clicking outside the computer is a way back to the room, so the frame always leaves 6 % of room beyond the CRT shell, on both sides of it or above it, whichever keeps the picture larger: wide and tall screens already do; squarer ones (4:3, 5:4, a window that is not maximised) step back for it, so 1024 × 768 shows the window and the wall beside the monitor round a 635 × 499 picture. Flights to and from it take the usual 1.1 s on a crane path (control point halfway across, 5 cm above the higher eye, at the desk eye's depth) that clears the chair back by 27 cm (landscape) to 18 cm (portrait); arriving, the look-at reaches the glass at 82 % of the flight, so the landing is a pure settle.
- **Material.** The glass has an unlit `MeshBasicMaterial` with a map, cloned with only its `map` swapped for the still, so it draws with the program the room's charts already use and the computer compiles none (under a finish, the display mask gives it one variant: `e2e/programs.ts`).

- **Still.** One canvas covering the glass's UV square: tube colour, the app's still painter clipped to the rounded picture, the glass finish on top, uploaded with `renderer.initTexture`. Its width follows the glass's size at the landing in render pixels (≤ 600 → 512, ≤ 900 → 768, else 1024; at most 768 when `navigator.deviceMemory` ≤ 2), so at most 1024 × 817. It is made in the background (`IdleWork`) as soon as the app hands over a painter, and again whenever `invalidateStill()` or a new size or placement makes it stale while the glass can be seen (in the room view, at the computer and on any flight; the TV's and the radio's frames keep it out of sight, so there a stale still waits for the next flight): the painter's own preparation (`StillPainter.prepare`, its fonts and wallpaper) and the composition are units that may go between the game's frames, and the upload waits for a quiet moment, so the TV view allocates nothing for it. A flight that starts before the background got there finishes the job first (what is left of it, usually the upload): any flight when nothing is shown yet, a flight to or from the computer when the still is stale; and a still that went stale on the way in (a resize, the clock's minute) is repainted on the landing frame, before the live screen fades in over it. Nothing paints per frame. Until a painter exists, or if one throws (warned once), the glass shows a 1 × 1 dark standby tube.
- **Registration.** On every pose change the glass's UVs are replaced by a projection from the settled eye onto the rim plane, so from that eye the texture is exactly the flat rectangle the DOM covers: the hand-off differs by 1.8/255 on average (lab test card, 1440 × 900 @2; `node scripts/room-shots.mjs --only pc-handoff` prints it).
- **Live screen.** `ScreenOverlay` lays `div[data-pc-screen]` over the picture in the overlay container: a device-pixel-snapped 2D translate, rounded clip, `contain: strict`, and the very glass-finish canvas the still uses, stretched over the glass and clipped. It is revealed in the landing frame's callback (160 ms fade unless reduced motion) and concealed synchronously in the request to leave, so the flight's first frame (identical to the still) is the next thing painted. While it is live the glass under it does not change; `setLight` (e.g. a white page) brightens the spill around it.
- **Light spill.** Three `ScreenGlow` patches (the TV's shader and program) on the bezel lip, the desk in front of the monitor and the keyboard, tinted by the still's 1 × 1 mip or the `setLight` colour. The bezel's emitter has the picture's rounded corners, so the corners catch the same light as the border along the edges.
- **Glass finish.** An edge shadow (23 % in the corners, 8 % at the edge midpoints, nothing over the central 70 %) and a 6.5 % warm sheen of the desk lamp at the top left, the top of their tuning range, so the screen reads as a tube's curved glass.

## The CD player (`radio/`)

The radio on the cabinet is the room's third device. The room owns the machine — the lid, the keys, the discs floating over it and seated in its well, the LCD and the OPR LED, the camera and what the pointer does to them — and knows nothing about albums, tracks or sound: the app drives it declaratively (`room.radio.setDiscs`, `setState`) and hears back through intents, cues and `seated` (`RadioDeck.ts` is the contract; `app/radio/RadioSlot.tsx` the app side, see docs/RADIO.md).

### Who loads what

| What | Where | When |
| --- | --- | --- |
| The door (`RadioDoor`, `room.radio`), the click target (`RadioInteractable`: the radio, its cabinet and the lamp), `radioModel` | room chunk | first load, with nothing of it solved before the room's first frame |
| The radio itself: its body and its moving parts (`gen/props/radio.ts`), as nine vertex-lit meshes with the lid, the rocker's halves and the side keys on the pivots `RADIO_SPEC` names (`gen/GeneratedRadio.ts`) | the room's worker and bake | with the room (§ The generated room › The CD player). No file is fetched for it |
| The deck (`RadioDeckHandle`, `ControlsLayer`, `RadioParts`, `radioFraming`, `discLayout`), with the device below in one chunk (`deckChunk.ts`, so that three.js stays in the room chunk) | lazy | imported as the camera first sets off from the TV (behind that flight), or on a prefetch or a request for the radio view, which waits for it (the latest request wins); the camera frames the radio through a hook the deck installs (`CameraRig.setRadioFraming`), the radio's pose solved when first needed and again only after a resize or new insets |
| The device (`radio/device/**`, in the same chunk) | lazy | made on `prefetch('idle')` from the app, `prefetch('intent')` when the pointer reaches a radio target in the room view or the overview's Music item takes the pointer or the keyboard, or the approach; Save-Data: intent only. It waits for the generated room's radio to be lit (`host.generated.ready`), takes its parts from it (`partsProvider.ts`) and makes the LCD, the LED and the discs in one `IdleWork` unit |
| The labels, one `IdleWork` unit each: a label's upload and its radial average. Uploads wait for a moment where nothing plays, because the main thread cannot time what an upload costs a weak GPU; nothing while the camera moves. On the way to the radio and there its tasks are urgent: they also run between the flight's frames when they fit (the landing and the visit wait for them), and a print that has waited 400 ms for an idle period that can hold it runs in the next one anyway, one per period | — | as the app hands the prints over |
| The disc program | — | compiled with `renderer.compileAsync` at the approach, never at idle. The discs rise only once it is ready (one that rose before would appear mid-air). Shader error checks (a synchronous GPU read per program) run in development only |

The radio's chunk is not requested before the camera first leaves the TV (`e2e/radio-deck.spec.ts`, and in the real app `e2e/radio-flow.spec.ts`). In the app, `prefetch('idle')` comes 0.4 s after the camera rests in the room view, so a visitor who heads for the radio at once still finds its device preparing on the way, and the player 3 s after (docs/RADIO.md › Loading). Nothing the device prepares reads the GPU back: the slow tier's software-renderer test is the stage's `softwareGpu`, read once when the renderer is made, and the app paints its prints on CPU canvases. Away from the radio a new deck state moves nothing (the lid is shut and the choreography is a function of time, so the next visit samples it). The discs rise whether or not their prints are there; the prints show together once the last is up, fading in over the bare silver in 260 ms at the radio. A chunk that fails to load, or a room without its radio, makes the radio scenery: `available` turns false (warned once), the overview's menu drops its Music item, the interactable answers nothing and a camera at or flying to the radio returns to the room.

### Views and interaction

`viewState` gains `'radio'` with three effects: `approachRadio` after `moveCamera` (the device schedules the lid from `FLIGHT_MS`/`REDUCED_FADE_MS`), `revealRadio` on arrival (`radio.controls` goes live) and `concealRadio` prepended to every request that leaves it (controls hidden synchronously, before the camera moves). `RadioInteractable` is one click target for the radio, its cabinet (`04_Drawer_surfaces`, hits between x 0.30 and 1.40 only: the mesh also holds the floor books and the mains cable) and the lava lamp (a proxy box), through the new optional `Interactable.intersect` (its own ray test; never cut into pick chunks):

| View | Floating disc | Disc in the well | ▷II / ■ halves, ⏮ / ⏭ | Radio body | Cabinet, lamp |
| --- | --- | --- | --- | --- | --- |
| tv, pc | — | — | — | nothing (the room's miss) | nothing |
| room | — | — | — | `enter`, click flies to the radio; the pointer over it prefetches | same |
| radio | `press`: hover attends, click picks (touch: attention on down, pick on up over the same disc) | `press`: ▷II ghost press | `press`: pressed while held (the device owns the gesture) | `idle`, nothing | `leave`, the room |

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

Reduced motion: the existing fade-cut-fade lands on the open lid with the discs in their slots (on a first visit the screen stays black until the device is ready, at most 1.2 s, so it is one cut to the open radio rather than a shut one that then snaps open); a pick seats the disc in one frame, draws ▷II pressed for 120 ms and fires `seated` in a microtask; only state-change cues sound (the latch too, when it leaves); no step outlives 300 ms. The slow tier (a software renderer, or a first flight to the radio whose median frame exceeds 34 ms) keeps the choreography on its warm timings and drops the ambient float and the blink.

### Look

- **Discs** (`discShader.ts`, one `ShaderMaterial` program for every disc, one draw call each): no three.js lights; the disc carries three of the room's sources by name (the ink-blue ambient, the lava lamp as a point light, the night from the window), constants recorded in `DISC_LIGHT` and tuned against the baked cabinet and wall. Bare foil reflects a dark ink-blue room and, where the disc has tracks (out to where its programme ends, a different radius per disc), draws the lamp's spoke across them — an anisotropic lobe through the centre pointing at the lamp — with its diffraction rainbow along it (the lamp grazes the label side, so only the third order lands in the visible), plus a dim sheen from the room's upper half; the smooth mirror band and the foil past the programme are a little brighter than the tracks' haze. Thin-film iridescence weighted by the lamp's glint shimmers when a disc tilts. Ink is lit as matte print (the lamp wraps round it) under a varnish highlight that travels as the disc drifts and brightens under attention; at play speed a still spoke of the lamp across the varnish says the disc spins. The hub is smoky polycarbonate with its moulded stacking ring. The data face (the rise, the flip, the leave) reads as a silver disc, never a flat grey: a mirror brightening towards grazing, the lamp's spoke and the room's sheen across its tracks, the lamp and the moon diffracted in the first two orders (the rainbow spoke stays put while the disc turns), softly shouldered so a disc right by the lamp flashes but never burns out; a polished rim catches the room and the lamp, so overlapping discs keep their outlines. Spin blur: six taps along the arc swept in 1/60 s, blended into the label's radial average from 0.8 to 2 rev/s, so a disc at play speed is the same image every frame and costs none.
- **Labels**: the app's prints at `labelSize` (256, 384 or 512 from the discs' size at the radio; 256 with little memory or software GL), uploaded one per idle unit; the discs never wait for them: they show together once the last is up, fading in over the bare silver (260 ms) when the visitor is watching.
- **LCD** (`Lcd.ts`): a 256 × 72 (512 × 144 when it lands wider than 140 render px) positive STN canvas on a quad 0.3 mm in front of the dial glass, on the charts' own program; painted only when the readout or the blink phase changes, and asks for a frame only at the radio. The empty radio's `no dISC` is painted as the device is made, so lighting it on the approach repaints nothing. Its material's colour is its backlight level and nobody else's to set: the mesh says so (`userData.ownColour`) and the prop spotlight, which brightens a lit prop's textured materials by writing their colours back every frame, leaves it out (it took the black of a display that was off and wrote it over the warm-up: a radio lit by the pointer, the menu or the first look around once its device was made showed a black display at the radio, lamp on; `Lcd.spotlight.test.ts`). The OPR LED is a `PowerLed` (`{ lensRadius: 0.0015, haloRadius: 0.010 }`), lit while the LCD is.
- **Well and lid**: generated parts (the well with its turntable and pickup, the lid's ribbed underside), lit by the bake as the open lid shows them (§ The generated room › The CD player); dark at night, so the lamp-lit seated disc is the bright subject.

### Frames and budgets

The room draws its steady sixty frames a second at the radio as everywhere (§ Rendering and performance › Frames).
The device's own motion sits inside them: the choreography's step while something moves (every display frame), and
the discs' float, which rides the room's frames (`RenderLoop.ride`): the discs are posed in every frame the room
draws and the float asks for none. Beside a room that draws by itself the float must not pace frames of its own:
`AmbientPacer`, below, restarts its grid at every frame drawn for another cause, so next to sixty of those a second
its own never came due, and the discs stood still in 95–100 % of the frames and jumped (up to 175° for a playing
disc) whenever something else posed them (`e2e/radio-spin.spec.ts` holds the float to every frame). The pacer is kept
for a loop that draws on demand only.

Events are stamped with the time of the last frame drawn rather than `performance.now()` (`monotonicClock.ts` ›
`eventTime`): the browser hands a pointer move over a millisecond or so into a frame, and the frame held to that time
by the device's clock was drawn late against the next, so everything moving under a moving pointer stepped unevenly
(7–9 % at the median on a 120 Hz display, under 0.5 % now).

`AmbientPacer` watches the display's own frames and asks for one whenever the next would reach a slot of a 30-a-second grid, so a 60 Hz display draws every second frame, a 120 Hz one every fourth, and one in between (75 Hz, or Playwright's 62.5 Hz fake clock) mixes gaps of one and two frames and still averages 30, never more in any second (`AmbientPacer.test.ts`); a frame drawn for another cause restarts the grid a full interval after it, and a stall is followed by one interval, not a burst.

The radio adds one shader program, the discs', and a second under a finish (compiled for the screen, then drawn into the finish's linear target); its body and parts draw with the room's vertex-lit program and the LCD with the charts'. `e2e/programs.ts` pins the counts. The stage sets `renderer.debug.checkShaderErrors` only in development, for the whole room (the TV and the computer too): checking a program's link status makes the main thread wait for the driver to finish linking it, a quarter of a second for the disc's program under SwiftShader, which lacks `KHR_parallel_shader_compile`; a shader error therefore shows only in development builds. GPU memory: labels N × labelSize² × 4/3 pixels and the LCD, nothing else, since the radio itself has no texture (`stats.radioTexturePixels`: 1,056,768 with five 384² labels and the 512 × 144 LCD). Away from the radio a new layout (a phone turned in the room, at the computer or at the TV) is only noted in the resize handler and applied in the room's next idle moment (one background unit, never during a flight), or as the camera sets off for the radio if that comes first, so neither the rotation nor the click that next goes to the radio pays for the planning. The re-layout's search for clear glides works each moment of the other discs' ways out once and checks every sixth sample first: with twelve discs mid-rise it plans in 6.0 ms on average and 7.6 ms at worst on an M-series Mac, five discs in 1.7 ms. Bundle: the lazy `radioDevice` chunk is about 31 kB gzip (`pnpm report:bundle`; docs/RADIO.md › Budgets).

Not measured since the radio is generated: long frames in the flights to and from the radio at 6× CPU, and the frame rate of the first flight while the device prepares.

### Measurements

The radio has no asset. `RADIO_SPEC` (`gen/props/radioSpec.ts`) is the machine's measurements and its generator
(`gen/props/radio.ts`) builds from it: hinge, rocker pivot, key travel, turntable, slot, well, display, lamp, bounds.
The constants the cameras, the choreography and the overlays use (`DECK` in `device/deckLayout.ts`, `LID_FRAMING` in
`radioFraming.ts`, `RADIO_FIXTURE`, `RADIO_ANCHOR`) were measured on the model the room used to ship; the generated
radio is built to them, and `gen/props/radio.test.ts` holds the two together within half a millimetre. The radio
carries no brand: its wordmark is the site's own and its legends are plain words (`gen/radioArt.ts`).

## Posters (`posters/`)

Twenty-nine printed pieces and a corkboard cover the back wall and the sloped ceiling, where the room's layout put them ([ROOM-ART-DIRECTION.md](ROOM-ART-DIRECTION.md) › Posters). Everything on them is drawn in code: no model and no picture is fetched for the walls. The artwork is original and fictional, made for this room; an earlier, unpublished collection of third-party artwork gave it only its topics: one band, The Loud Hours, across a retail poster, a tour banner, an album print, a CD single, a live pull-out and a ticket stub; the three games on the room's own shelf (Powder Rush, Crown & Key, Brick Galaxy) as shop posters, and three more that never existed (a rhythm game, a stealth game, an online world); a star chart, a patent drawing, a blueprint, a travel print, a film one-sheet, a teaser, a festival bill, two photocopied flyers, a typographic print, a bumper sticker, a sticker, and on the cork a postcard, a note, a boarding pass and a snapshot. `node scripts/poster-sheet.mjs` paints them all flat on one contact sheet (`--texels` at the density the wall carries).

### Who makes what

| What | Where | When |
| --- | --- | --- |
| `PostersSlot` (the TV-side trigger, the first-departure hook, the cut hold, `stats.posters`, `room.postersReady`) and `posterKit` (the tier choice, the per-pose visibility boxes, the two materials and their meshes, the strip uploader) | room chunk | first load; nothing runs before the room's first frame |
| `PosterWall` (the `posterWall` chunk), with the layout (`wall/layout.ts`) and the geometry and atlas plan made from it (`wall/geometry.ts`): the door to the painter, the upload, reveal, per-pose hiding, slow-flight demotion, context loss | lazy | imported by one idle unit at the TV, judged by its own 1 ms estimate; the geometry is one unit of background work (1,343 card and 192 skirt triangles) |
| The painter (`paint/worker.ts`): the designs (`paint/music.ts`, `games.ts`, `prints.ts`) with their kit (`paint/kit.ts`), the atlas painter (`paint/atlas.ts`) and the night's light (`wall/light.ts`) | a worker | started by the wall at the TV. It loads the site's three faces from the files the app's own `@font-face` rules name (`paint/faces.ts`), paints the whole atlas on an `OffscreenCanvas` and hands back one `ImageBitmap`; the main thread spends nothing on it |
| The same painter as a chunk (`paint/atlas.ts`) | lazy | only where a worker or `OffscreenCanvas` cannot be had (or the worker fails): the main thread paints, a sheet per unit of background work, each unit rasterized as it ends (a canvas only records until its pixels are read), after waiting at most 2.5 s for the faces |
| The upload | — | from the moment the atlas is painted on a hardware GPU: one unit for the storage and the program (`compileAsync`), then 1 MB strips, each a small upload that goes between the playing game's frames with an idle period to itself (`IdleTaskOptions.smallUploads`), the node hidden. On a software GPU (the lite path) it waits for the first departure, since its GPU is the CPU that draws the game. Whatever is left when the camera first leaves the TV becomes urgent, sliced work between that flight's frames |

One size is painted (`posterTier.ts`): 2048 × 1024 when the room view's focal length is at least 505 drawing-buffer pixels, `deviceMemory` is unknown or over 2 GB and the GPU is hardware; else 1024 × 512, a quarter of the pixels to paint, upload and keep, under the same coordinates. The tier is decided once and never changes. The node is shown at the first frame where the texture is complete and the program compiled; on a hardware GPU that is normally at the TV, seconds before the first departure, and otherwise early in the first flight, before any piece is in frame. A late arrival (a visitor who leaves the TV before the painter is done) fades the pieces already in frame in over 300 ms, under reduced motion too (a fade is not motion, and the room's own cuts fade); under reduced motion a cut to the room view also holds its black (`holdCut`, at most 1.2 s over the session) from the moment the atlas is painted until it is up, never while the painter or its faces are still on their way; a cut to the TV, PC or radio view never waits for the posters. `stats.posters` reads `loading`, then `staged` once the atlas is painted and the geometry built (only the upload is left), then `ready`; `loading` again from a context loss until they are back; `off` when they will not show (`?posters=0`, or no painter and no 2D canvas). A software GPU takes the lite path: the 1K, no skirts, no fade, no program of its own (`stats.postersPath`). A hardware GPU whose first flight runs slower than 30 fps drops the skirts at the next moment none of the node is on screen.

The painted pixels are not kept: the bitmap is closed (or the main thread's canvas emptied) as the last strip goes up. After a context loss the painter is asked again and the atlas strip-uploaded again, the node hidden until it is up; a loss while the painter works, during the upload or the fade ends that and starts over, and a program compiled for the old context no longer counts. Where the main thread painted, its canvas coming back blank before it is all on the GPU (§ Lost canvases) starts the painting over too.

`PosterWall`, its worker and its painter import nothing of the room's chunk at runtime (`PosterWall.test.ts` walks their imports): Rolldown folds a module that the room and a lazy chunk share into the room's chunk only when that lazy chunk already depends on the room's, and a runtime import of three.js or any room module from the wall split them into a common chunk on the critical path (+2.2 kB gzip, measured). The room hands those over in `posterKit` instead. The designs share the integer hashes of `gen/kit/hash.ts` with the generated room's lazy chunk.

### The paintings

A design is a small function that draws one sheet in millimetres with the 2D canvas, the site's three faces (Nunito, Chewy, Silkscreen) and the kit's few tools: gradients, a hashed starfield, a ridgeline of value noise, halftone dots sized by a tone function, sunbursts, pixel art from rows of characters, bars for small print. Each keeps to a handful of colours. The atlas carries 4 to 8.25 texels per centimetre (the layout's densities, the 2K's; the sweep test holds what the camera does with them), so a millimetre is about half a texel: designs are built from bold shapes and headline type, and small print is there to read as small print.

The atlas painter gives each sheet its island (a skyline packing of the cards, the corkboard, a block of tape strips, the pins' heads and the skirts' ramp, each with a 4-texel gutter filled with its own edge for the mip levels) and then does to it what the wall does: the shadow of any sheet taped over it, the folds a pull-out came with, a corner that has come away turned from the light, a gloss sheet's sheen, its own masking tape (cream on the back wall, white paper tape on the pale slope) with the small shadow under it, paper grain from a hashed tile, and last the night's light, multiplied in. That light (`wall/light.ts`) is analytic, matched by sampled values and by eye to the offline bake the walls first had: a dim mauve fill right of the window, bluer and dimmer left of it and under the desk lamp's shade, the lava lamp's amber pool under the cluster, the slope fading from the ridge to the knee wall; a small grid of samples per sheet, interpolated. It is in the texture, so the cards stay on the room's unlit program and cost nothing per frame. The room's light rig (`gen/rig.ts`) is not used for it: that is a GPU bake into the room's own charts, and the painter runs in a worker with no GPU.

### Rendering

One node, two meshes sharing the atlas. The cards (every sheet with a sub-grid that carries a curled corner, the tape overhangs that ramp down to the wall, the corkboard and its eight-sided pin heads) draw with the room's opaque unlit `MeshBasicMaterial` program, each card 1 + 0.75 · n mm off the wall by its layer n; their geometry carries normals only because three keys a program by whether there are any, and without them the cards would compile a second one. The skirts, a few centimetres of contact shadow around every piece, are four mitred trapezoids a piece mapped onto one small ramp of the atlas (white at its outer rows, exactly, so they fade into the wall without a seam) and multiplied onto the wall (`MultiplyBlending`, premultiplied, no depth write). Both draw in the opaque pass, ordered rather than depth-tested against each other: the room (`renderOrder` 0), then the skirts (`POSTERS_SKIRTS_ORDER`), then the cards (`POSTERS_CARDS_ORDER`), so a card or a tape overhang always covers the skirt under it. Their polygon offsets (-1 / -1 for the cards, -2 / -2 for the skirts) only pull them over the wall; a depth test between a skirt 0.1 mm off the wall and an overhang 0.3 mm off it would be lost at oblique angles (`posters.spec.ts` renders the room view with and without the skirts and allows at most 5 pixels over the cards to darken, none by 8 levels or more). No alpha test anywhere: the sticker and the cut-out logo are rectangles of white stock. The full path adds exactly one program (the premultiplied, non-opaque one, shared by the multiplied skirts and the fading cards); the lite path adds none. When the camera rests in the TV, PC or radio view, and on every resize there, the node is hidden only if no piece's box (measured from the geometry as it is built) meets the resting frustum, so with the shipped discs up to 21:9 those views draw nothing of it. Leaving a pose never pops anything.

### Frames and budgets

Measured in headless Chromium on an M-series Mac (`node scripts/room-shots.mjs --only posters-perf,posters-views`), before the room was generated; the painter and the walls' geometry have not changed since:

| | |
| --- | --- |
| Painting | the whole atlas in 44 ms at the 2K and 15 ms at the 1K in one go, which is what the worker does, off the main thread. On the main thread (the fallback), 36 units: 45 ms in all at the 2K, median 1.1 ms, longest 4.0 ms; at 6× CPU 93 ms in all, median 1.8 ms, longest 15 ms (the star chart), and 74 ms at the 1K |
| GPU memory (`stats.postersTexturePixels`) | 2K: 2,097,152 texels, 8 MiB, ≈ 10.7 MiB with mipmaps; 1K: 524,288 texels, ≈ 2.7 MiB. Nothing of the painting is kept on the CPU once it is up |
| Draw calls and programs at rest | room view +2 calls (+1 on the lite path), +1 program (0) without a finish, 4 under one (`e2e/programs.ts`); TV, PC and radio views +0 |

Bytes: nothing of the walls is in the first load but the room chunk's trigger and kit. Lazy, per visitor: `posterWall` about 6.7 kB gzip and the painter's worker about 18.1 kB (`pnpm report:bundle`; `bundle-budgets.json` itemises them). No file is fetched for the walls.

### The layout

`wall/layout.ts` is the layout as code: each piece's surface, place, size, turn, layer, tape, density, finish, curls, creases and skirt widths. The tape's frames follow from it (a corner strip lies across the corner's diagonal, 4 mm onto the sheet). `wall/geometry.test.ts` holds the geometry to its triangle counts and boxes (those of the node the room first shipped); `posterVisibility.sweep.test.ts` measures the magnification from it and the shipped camera path, in drawing-buffer pixels per texel on screens up to 32:9 with the tier each size gets: 0.89 in the room view, 1.9 in the TV ↔ room flights, and up to 5.0 in the flights to and from the computer and the radio, which pass 1.25–1.6 m from the pieces over the desk for about a quarter of a second at their fastest.

## The spotlight (`spotlight/`)

The room's answer to a pointer over a prop, after c-na.dev/explore's (the study: `glow-study.md` beside the task's screenshots): the prop glows, plays a little jelly and wants a label, in the room view only, while the camera rests there. `RoomInteraction` reports the interactable under the pointer (`onHover`; a hover after a flight is picked again where the mouse rests), `assembleRoom` maps it to the prop its click flies to (the desk's is the computer, the cabinet's and the lamp's the radio), and `room.spotlight` lights `hovered ?? request`: the prop under the pointer first, else what the app asks for (its menu's item under the pointer, else the one its keyboard has, else the first visit's tour; docs/ART-DIRECTION.md › The room's UI). So a mouse resting on a prop shows that prop while it rests there, even with a menu item focused or the tour running. A flight closes it at once and the lit prop goes home.

| | |
| --- | --- |
| What glows and bounces | the TV whole; the computer's monitor (its shell and glass: the keyboard the chair half hides would glow through it); the radio whole, its lid, keys and well with it (they are parts of its node) — and the device's discs, which hang in the scene beside it, join the prop as it lights, once they are there (`SpotlitProp.joins`, read through `radio.prepared`), so the outline, the brightening and the bounce stay whole |
| Glow | after the room's frame, only while a prop has any: its meshes (position-only proxies sharing the meshes' buffers and world matrices) go into a quarter-resolution, 4× multisampled mask (red: there; green: its level), a nine-tap Gaussian across and down (σ 6 CSS px), and one full-screen triangle adds warm white (`0.50, 0.47, 0.42` in display values) outside the outline only: full from the outline to about 3 px out, gone by about 12, the c-na.dev headset's profile. Fades are exponential, 80 ms in and 110 ms out (95 % in about 240 and 330 ms); a hand-off cross-fades, each prop at its own level |
| Brighter | the prop's textured baked materials' colour × 1.12 at full light, given back as it fades. A material it shares with a mesh outside the prop (the computer's device material is the keyboard's and the mouse's too) becomes the prop's own copy, so the lift reaches no further than the prop |
| Jelly | the moment a prop lights: [t, across, up] keys (0, 1, 1), (0.2, 1.03, 0.97), (0.45, 0.98, 1.035), (0.7, 1.02, 0.995), (1, 1.015, 1.015) over 520 ms, smoothstepped, about the middle of its foot; it holds 1.015 while lit and goes home at an exponential rate of 8 /s (95 % in 375 ms). The same prop lit again within 500 ms of its own jelly eases back up instead (a pointer wobbling on an edge) |
| Label point | the middle of the prop's top as it bounces, projected with the live camera after every drawn frame (`LitProp`), so the app's label rides the jelly and the parallax |
| Holding still | the radio until its device is prepared, so its discs never hang from a pose mid-bounce; it still glows and has its label. Afterwards the bounce runs in the room view only, and the device measures its world poses nowhere else |
| Reduced motion | no jelly; the glow and the brighter colours still fade (a fade is not motion) |

Who loads what: the door, the kit and the props' hover are in the room chunk (+0.63 kB with the props it lights; `bundle-budgets.json` itemises it); `Spotlight.ts` is the lazy `propSpotlight` chunk (3.11 kB), imported just after the first flight frame away from the TV, beside the radio's deck, and imports types only (`scripts/bundle-report.mjs`'s `propSpotlight` row, `three: 'room'`, holds it to that). Its two programs, the mask-and-blur one and the glow's, are compiled then with `compileAsync` (the mask's for a render target), so the first hover never stalls: `stats.programs` is 2 more after the first room view (`e2e/programs.ts` › `SPOTLIGHT_PROGRAMS`, `stats.spotlight` once the chunk is in). The passes add their draw calls to `stats.drawCalls` while a prop glows (the lit prop's meshes once more at a sixteenth of the pixels, and three full-screen triangles); nothing at all while none does.

## Dev lab and screenshots

```sh
pnpm dev                     # then open /room-lab.html  (?clean hides the panel, ?autopower=0 keeps the TV off,
                             #   ?view=room, ?view=pc or ?view=radio flies there after power-on, ?mockpc=1 puts a
                             #   test card on the computer, ?mockradio=1 hands the radio five numbered discs and a
                             #   fake player, ?mood=original|honey|rose|midnight (the lab's default is original, the
                             #   bake without a finish; the app's is rose), ?quality=high|medium|low, ?posters=0)
node scripts/gen-shots.mjs   # the four views and seventeen crops from fixed cameras → .shots/gen/final/<viewport>-<tier>/
                             #   (§ The generated room › Comparing it)
node scripts/room-shots.mjs  # headless Chromium (Metal ANGLE) → .shots/room/*.png; `pnpm shot:room` is the same
node scripts/room-shots.mjs --only power-on,perf
node scripts/room-shots.mjs --only pc-desktop,pc-phone,pc-flight,pc-handoff
node scripts/room-shots.mjs --only radio-desktop,radio-wide,radio-phone,radio-arrival,radio-insert,radio-swap,radio-press
node scripts/room-shots.mjs --only radio-perf   # also ROOM_SHOTS_GL=swiftshader
node scripts/room-shots.mjs --only posters-detail,posters-perf,posters-views   # perf and views also with ROOM_SHOTS_GL=swiftshader
```

`MockGameSurface` draws an animated test card at 320 × 240 with corner labels, a white edge ring and a crosshair at the reported pointer pixel, so mapping, pause/resume and the CRT look can be checked without the game.
`MockPcScreen` paints the computer's still and its live screen from one test card (a 50 px grid, an edge ring, labelled corners and colour ramps), so registration and the hand-off can be measured; the lab's status line shows the view, `live`, frames, draw calls, programs and the still's pixels.
`MockRadioApp` answers the radio like the app does (picks load and play, the keys act, a fake clock runs on the LCD) and logs every intent, cue and `seated` with its time; the lab's radio button and ▷II / ■ / ⏭ press through it.
`room-shots.mjs` drives the lab only, so every recipe works on the generated room as it did on the shipped one; the frame rates it prints are now the room's steady sixty (§ Rendering and performance › Frames). It uses Playwright's fake clock for frame-exact power-on and crane-flight frames and for the radio's strips (arrival 0–2200 ms, insert, swap, the rocker's press; the clock is installed before the page loads so `performance.now()` never jumps), probes pointer mapping at the picture corners, prints the hand-off difference and prints frame rates per view, per flight and per radio state (`radio-perf` also at 6× CPU).
Set `ROOM_SHOTS_GL=swiftshader` for software GL and `CHROMIUM_PATH` to choose a browser.

## Known gaps

- Clicks are ray-cast against registered interactables only, so a prop standing in front of the TV in the room view would not block a click on the TV (none does from the room viewpoint today).
- The room draws sixty frames a second at rest in every view (§ Rendering and performance › Frames), where the room with shipped files drew none. That costs battery: how much on a phone has not been measured, and neither has anything else in the lists marked "not measured since" above.
- Leaving the TV before the whole room is baked holds the flight until it is (§ The generated room › Leaving early). Behind a playing game the rest of the bake takes about 0.5 s on an Apple M4, and a visitor who leaves in that time waits for what is left of it with the TV's picture standing still: 0.2 s on that machine, 0.8–0.9 s with its GPU made 48 times slower (§ The generated room › A slow GPU), and nothing on screen says why the camera has not set off. On a GPU that slow the room is also ready seconds later than the room with shipped files was (0.4–0.5 s whatever the GPU).
- A context lost away from the TV shows the room's flat surfaces unlit, black under their props, until the bake has run again (0.3 s on an M4): the startup still that covers this at the TV has no counterpart for the other views.
- Nothing has been measured on a real phone: not the build, the bake, the frame rate, the wait above nor the memory. Phone-sized viewports with a throttled CPU say nothing of a phone's GPU.
- The numbers the room's code shares with its generators are copies held together by tests, not one source: `TV_SCREEN_APERTURE` (`tv/tvModel.ts`) against the set's lip, `DECK` and `LID_FRAMING` against `RADIO_SPEC`, the finish's lamp intensities in `gen/tiers.ts`. Moving a prop means changing the spec (`gen/roomSpec.ts`, `gen/props/radioSpec.ts`) and following the tests that fail.
- The startup still is generated from the room (§ Startup), but not as the room is built: a change to the set, the cabinet, the lamps, the plant, their light or the TV view's framing needs `pnpm build:still` (a test fails until then), and `src/app/startup/still/camera.ts` repeats `tv/tvFraming.ts` and `camera/framing.ts` in plain numbers (a test holds it to them).
- The bake has no indirect light: a pool and a bounce light in the rig stand for it (§ The generated room › The night's rig).
- A mood changed after the bake (the lab's `setMood`) keeps the lamp pools it was baked with.
- Under software GL the room is fill-bound everywhere, and the bake's shadow maps run on the CPU; the room starts on the lowest tier there and is not governed.
- Lab screenshots and every number in this file come from Apple-GPU headless Chromium; real low-end GPUs are untested as well.
- The radio: the rocker pivots 7 mm behind its face, so while pressed (6°, deep enough to be seen) it slides 0.7 mm across the panel. A disc chosen before it is out of the radio comes out first, so it is heard 1.2–1.6 s after the pick (its own climb out of the well), not 0.95 s. A phone turned while the discs are rising or between picks can still make two discs graze: in the 5-disc sweeps (portrait 390 × 844 ↔ landscape 844 × 390) a turn with no pick touches in 18 of the swept turn times, all 2260–2430 ms after the click towards the radio (up to 7.9 mm, for one 8 ms frame; landscape to portrait none), and a pick, a turn 0–1000 ms later and another pick 0–1500 ms after it touch in 312 of 2112 runs portrait to landscape and 81 landscape to portrait (none jumps). A disc hovered within 100 ms of the pick of its neighbour on a portrait phone can come forward into the inserting disc's path (5 of 1220 runs). The radio's 3D keys are mouse-sized from 1280 × 720 up; phones get the app's transport bar.
