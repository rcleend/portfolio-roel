# Smooth flights: diagnosis, fixes, measurements

Branch `fm/ship-portfolio-smooth-flights`, from `fm/scout-portfolio-procedural-room` at 7e4583a. Work in progress:
this file is kept current as the work goes; the last section says where it stands.

## How it was measured

- `node scripts/perf/flights.mjs` (new): a production build served locally, a cold load in a new browser each run,
  the first pull-back at a chosen moment and then every other transition. `scripts/perf/flightProbe.js` is injected
  ahead of the page and records, per display frame, when its callbacks ran, whether the room drew, the camera it drew
  from (read off the `cameraPosition` and `projectionMatrix` uniforms) and the WebGL work in it (programs, buffers,
  textures, targets, calls that wait for the GPU); beside the frames, idle callbacks and timers, worker messages,
  fetches, long animation frames. `scripts/perf/flightTrace.mjs` reads a Chromium trace of the same run: the frames
  the compositor expected and dropped (what reached the display), and the long tasks of the page and the GPU process.
- Machine: Apple M4 Pro. Headless Chromium here runs its frames at the built-in display's 120 Hz; `--headed` puts a
  window on the real display (built-in 120 Hz, the external Dell 60 Hz). "Phone" is 390 × 844 at 3× with the CPU
  throttled 6×: not a phone's GPU. "Slow GPU" is PR 19's stand-in (`slowGpu: 48, slowBake: 48`: every frame's and
  every bake draw's calls asked of the GPU 48 times): not a phone either.
- Other workers' browsers were using this GPU during the runs (19 % device utilisation seen from one of them); runs
  were made one at a time. From 12:14 on 17 Nov every row of the matrices waits until no other checkout's browser or
  test run is alive (`.shots/flights/foreign.py wait`) and says whether one was while it ran (`foreign.py watch`: the
  line `alone throughout` or `FOREIGN hh:mm:ss ...` under each row); a row another measurement ran through was run
  again, and which those were is said with the tables. The rows of before that were made one at a time behind a
  simpler check at their start only, each with the machine's load average beside it.
- A CPU profile names what a trace cannot (work in a promise's continuation): Playwright's CDP session,
  `Profiler.start` at 200 us on a build with source maps (`vite build --sourcemap --outDir <dir>`), the longest busy
  stretch of the main thread after the room is ready. That is how the rain's audio context was found.

## Diagnosis (before any change)

### What reproduces and what does not

- Idle M4 Pro, desktop, top tier, leaving the instant the room is ready: the first flight is clean at every level
  that can be measured. 132 frames at 8.3 ms, the longest 9.3 ms (page clock, headed, 120 Hz); 0 of 125–129 frames
  dropped at presentation (trace, RAF and CanvasAnimation trackers), the same as the second flight. WebKit
  (Playwright, 60 Hz): 66 frames, longest 19 ms.
- Phone stand-in (CPU 6×, this GPU): first flight worst frame 33.6 ms leaving at once, clean at +1 s, +10 s and
  after a level.
- Slow-GPU stand-in: the first flight has one frame of 134–177 ms on the desktop (33–49 ms at the phone's size),
  right at the start, when the visitor leaves before or as the room turns whole. It is gone at +10 s. And every
  flight there, first or not, has 20–50 % of its frames a display frame late.

### Root cause of the first flight's long frame

The bake's second pass (everything the opening view does not show) ends without waiting for the GPU.
`Baker.begin` gives a pass that lights no vertices an already-resolved result (`pending = Promise.resolve(colors)`),
and `GeneratedRoom.unit` deletes the last unit's fence unread, so `passed` runs a task after the last unit was
*handed* to the GPU: its last light pieces and the composing of all four pages with their mip chains, the largest
single piece of the bake. The room is `whole` then: the stage's hold ends, the bake's targets are freed, and a
flight that was waiting sets off, its frames queued behind that work.

- Trigger: the room turning whole. Condition: the visitor asked to leave before that (the flight is held until
  then) or leaves within the GPU's time for that tail. Symptom: the camera sets off, stands for the length of the
  tail, and jumps on. Later flights have no tail in front of them.
- Tested. Leaving exactly as the room turns whole without having asked before (no hold): 158 ms worst frame.
  50 ms later: the stall is still there (153 ms before the first moving frame). 150 ms later and more: gone
  (17–25 ms). Frames made 48× heavy but not the bake: no long frame (16.9, 17.0 ms). The bake made 48× heavy but not
  the frames: 125–146 ms. Half the load (24×): 50 ms. A blocking one-pixel read placed where the room turns whole
  takes 190–194 ms on the stand-in (4.7–10.6 ms on the idle M4 at the top tier, 0.2–2.8 ms at the phone's tier,
  56 ms at the phone's size on the stand-in), and with it there the flight's worst frame is 19–31 ms.
- What would have proved it wrong: the long frame staying when the GPU is made to finish first, or going when
  only the frames are slowed. Neither happened. (A first try with `gl.finish()` returned in 0.0 ms and changed
  nothing: Chromium's `finish` is a flush. The read is what blocks.)
- In the trace the stall is one task on the GPU process's main thread, 188.7 ms long, 9 ms into the flight:
  `SkiaOutputSurfaceImplOnGpu::SwapBuffers › IOSurfaceImageBacking::WaitForCommandsToBeScheduled::ANGLE`: the
  display waiting for the WebGL context's queued commands.
- The same tail stalls the TV's own frames when nobody leaves: frames at the TV stand for it too.

### The other causes found

1. Flights draw on every display frame, not on the paced frames. At rest the room draws sixty a second on a 120 Hz
   display; a flight is an animation and draws 120. A GPU that holds 60 but not 120 then gives a mix of one- and
   two-frame gaps: on the slow-GPU stand-in 24–44 of ~105 frames late in every flight (on time 50–77 %), where the
   same GPU at rest is steady. The quality governor tunes for sixty and calls up to 17.4 ms on time, so it never
   sees it. The idle M4 Pro holds 120 and shows none of this.
2. One-time work inside the first flight (desktop, leaving at once; counted by the probe):
   - 6 shader programs linked (2 the spotlight's, 2 the posters' ahead of their reveal, 2 more at the posters' first
     draw with a synchronous `getProgramParameter`: 4.5 ms in a frame on the M4, 4.9 ms at 6× CPU). At +1 s and
     later, 4.
   - 19 vertex arrays and 0.55 MB of buffers, created in the frames in which meshes first enter the frustum
     (+290 to +580 ms, the fastest part of the flight).
   - The posters: their chunk and worker fetched at departure, the 2 MP atlas allocated, 8 strips of 1 MB uploaded
     between the flight's frames, mip chain. At +1 s and later the atlas is up before the flight.
   - The spotlight's multisampled target and texture.
   - Lazy files fetched and run in the first frames: `Spotlight`, `deckChunk` (31 kB), `PosterWall`, the poster
     worker, `pcStill`, `desktopScale`, the guide's four icons, a font (`nunito 800`).
   - An idle unit of 30.8 ms at 6× CPU 65 ms into the flight (the frame behind it: 33.6 ms).
3. Leaving before the room is whole holds the picture still for the rest of the bake (0.2 s on the M4, 0.4–1.1 s on
   the stand-ins) with nothing on screen to say so: latency before the flight, not a frame of it.

### Found on the second pass, with the first fixes in (17 Nov, after the relaunch)

The first after-matrix was clean on the desktop and showed late frames on the phone stand-in (6x CPU) that the first
pass had not explained. Each was traced before it was touched:

4. **The page's first audio context is made at an arbitrary moment after the room is ready, and making it holds
   Chromium's main thread for a tenth of a second.** `RainSoundSlot` imported the rain's code in an idle unit and made
   the sound in the import's `then`, whenever the chunk came in. `new AudioContext()` is 97-119 ms on the main thread
   the first time a page makes one (Chromium, Apple M4; 1-5 ms for a second one; WebKit: 3 ms to make, 12-15 ms for
   each `resume()`). On a local server that was 14 ms after `ready`: one frame of 108-134 ms at the TV (in the build
   before the fixes too: 108-116 ms), inside the bake's hold when the visitor leaves at once. On a real network the
   chunk comes in later, and a visitor who leaves the TV in that moment has the block in the first flight. Found by
   CPU profile: 134 ms of self time in the `RainSound` chunk's class body, called from the room chunk's
   `import.then`. This is the one cause here that depends on the network, so no local run shows it in a flight; it
   fits "sometimes laggy, the first time only" on a deployed preview better than anything else found.
5. **The click's own work lands in the flight's first frame.** The interface takes the change of view as the camera
   sets off (the overview mounts): style and layout 11.2 ms, paint 4.6 ms at 6x CPU, 21.8 ms in one frame's
   `BeginMainFrame` (trace `traces/phone-low-round.json`). The frame behind it came 25-37 ms after it, and with the
   flight's clock started on the first frame that was the flight's first step, a late one (the camera had moved
   half a millimetre by then: not a visible jump, but a frame over the limit, in every first flight on a slow main
   thread and in most later ones).
6. **The CD player mounted inside the first flight to the radio.** By design ("hidden by the flight"): the player's
   chunk was asked for when the view became `radio` and mounted as it came in, 70 ms into the flight: style and
   layout 23 ms (layout 18 ms) in a 34.6 ms frame at 6x CPU, more at +155, +199 and +599 ms; 4 late frames, the
   longest 66 ms; under a 30-a-second cap on the same stand-in one frame of 142 ms.
7. **A mesh whose material is switched off was not warmed, and three.js uploads its buffers all the same** when it
   first comes into view: the monitor's bezel glow (off under the finish), three buffers of 128 bytes 0.66 s into a
   first flight left a second or more after the room was ready, once the monitor's still is painted (desktop; on a
   phone in the first flight to the computer). No late frame (0.1 ms), but something made in a flight, which the
   cold-flight test rejects. Found by recording who called `bufferData` on an unminified build.

Looked at and left: two vertex arrays are still made in the first flight to the radio (every device, 17.5 ms the
longest frame of those flights); the monitor's still, when it has gone stale out of sight, is painted and uploaded
at take-off before the camera moves (0.47 MP, `Monitor.prepare`, as designed before this work); the TV's own picture
(320 x 240) goes up in any frame the game draws one.

## Fixes (commits on `fm/ship-portfolio-smooth-flights`)

1. **The bake's end** (`201d3d5`, `src/room/gen/GeneratedRoom.ts`, `gen/bake/Baker.ts`, `gen/bake/pace.ts`). A
   pass's last unit is waited for with a fence like every other, so the room is whole when the GPU has finished it,
   and the composing of the pages is cut into sixteen slices a page by texel area (`composeSlices`), paced like the
   light's pieces (a page is cleared by its first slice ever, its mip chain made with its last). The root cause.
2. **Flights ride the paced frames** (`0697896`, `src/room/stage/RenderLoop.ts`). An animation's steps are drawn on the
   frames the room draws at rest: sixty a second on a 120 Hz display, not 120. Consequence to know: on a 120 Hz
   display with a GPU that could hold 120 (this M4 Pro), flights used to draw 120 frames a second and now draw sixty,
   like everything else on the page. Every step moves by the frame's own time, so nothing depends on the rate.
3. **Nothing else runs while the camera flies** (`ea0c41e`, `c459899`). `IdleWork` has a moment `flying` in which no
   unit runs, urgent or not; the bake's stall timer asks the same; what a lazy chunk makes as it arrives waits for
   the landing (the spotlight's programs and target, the walls' reveal, the guide's and the computer screen's
   mounting); no chunk is asked for in a flight.
4. **What a flight shows is made before it sets off** (same commits). New: every mesh is drawn once out of sight
   ahead of need (`RoomStage.warm`, `stage/sceneWarmup.ts`), the walls' and the discs' programs are compiled for the
   target frames draw into (`RoomStage.prepareAsync`; they were compiled for the screen and compiled again,
   synchronously, at their first draw in a flight). A visitor who leaves before all of it is made waits, bounded,
   with the game paused at the click and PAUSE on the tube as the cue (`ViewController.whenReady` › `createRoom` ›
   `preflight`: the rest of the bake, `IdleWork.drain`, the walls if painted, `RoomStage.gpuIdle`).
5. **The test** (`e2e/flights.spec.ts`, tagged `@frames`): a cold first flight at 6× CPU, left the moment the room is
   ready and two seconds later; fails when anything is made inside the flight, when a frame is long or when the
   camera's speed jumps.

6. **The review's five findings** (`38a565c`, `35ca62f`, `2587465`; a fresh agent read the whole change): the
   posters' slow-device rule is timed from the frame the camera leaves in (it was started at the click, before a
   waiting camera had set off, and measured nothing); `IdleWork.drain` settles whatever a unit does (a unit that
   threw in a later slice left the camera waiting for ever, the game paused); a request made while the camera flies
   holds no frames; a context lost while the camera waits lets it go and gives the game back; two waits share the
   hold. The governor finds a display wrongly taken for capped by its quickest frames (four of a window well ahead
   of the tick), expects the display's own frames again after a failed step down rather than a window's mean, and
   the stage watches a capped-looking display for up to 240 frames instead of 16.
7. **The clock starts with the flight's second frame** (`3e2e270`, `camera/CameraRig.ts`): the first frame shows the
   camera where it stands and takes the click's own work. One frame of latency (16.7 ms; 33 ms on a capped
   display) before the camera moves, every flight.
8. **The first flight to the radio waits for the app's half** (`3e2e270`): the room asks the app before the camera
   sets off (`RadioDoor.onBoarding`, answered by `RoomHost`), the glue and the player load and mount while the
   camera rests, their layout forced then, and the camera leaves when that is done or after 0.4 s. The player never
   mounts in a flight any more (`RadioSlot`: at rest only).
9. **The rain's sound is made in a unit of idle work** (`908df35`, `rain/RainSoundSlot.ts`), which never runs while
   the camera flies. It still costs its tenth of a second once, at the TV (as before) or at the landing.
10. **Switched-off materials are warmed** (`2c1e659`, `stage/sceneWarmup.ts`).

Files touched outside the camera and the render loop: `src/room/stage/IdleWork.ts`, `RoomStage.ts`,
`sceneWarmup.ts` (new), `src/room/atmosphere/RoomAtmosphere.ts`, `src/room/gen/GeneratedRoom.ts`,
`gen/bake/Baker.ts`, `gen/bake/pace.ts`, `src/room/assembleRoom.ts`, `createRoom.ts`, `ViewController.ts`,
`src/room/posters/PosterWall.ts`, `PostersSlot.ts`, `src/room/spotlight/SpotlightDoor.ts`,
`src/room/radio/RadioDeckHandle.ts`, `deviceContract.ts`, `device/RadioDevice.ts`, `device/Discs.ts`,
`src/room/radio/RadioDoor.ts`, `RadioDeck.ts`, `src/room/rain/RainSoundSlot.ts`, `src/room/stage/quality.ts`,
`src/app/hosts/RoomHost.tsx`, `src/app/pc/PcSlot.tsx`, `src/app/radio/RadioSlot.tsx`, `lab/FakeDeck.ts`, `lab/main.tsx`,
`e2e/programs.ts`, `e2e/flights.spec.ts` (new),
`docs/ROOM.md`, `scripts/perf/flights.mjs`, `flightProbe.js`, `flightTrace.mjs` (new). Not touched: `index.html`,
`src/app/startup/`, `scripts/still/`, the camera's paths and framings, the ease.

## Safari on an iPhone in Low Power Mode (the owner's report: "iPhone 16 on battery saver in Safari caused some lag")

Not reproducible on this machine as such: no iPhone, and macOS Low Power Mode needs administrator rights to switch on
here (`sudo pmset -a lowpowermode 1`; `pmset -g` reads `powermode 0`, and `NSProcessInfo.isLowPowerModeEnabled`, which
is what WebKit asks, reads false). What is engine-true and what is a stand-in is said with each number below.

### Verified facts (WebKit `main` read on 2026-11-17, and Apple's documentation; the research run's sources)

- **`requestAnimationFrame` is halved to thirty a second.** `Page::handleLowPowerModeChange()` sets
  `ThrottlingReason::LowPowerMode`, and `preferredFramesPerSecond()` then returns 30 for a nominal 60
  (`platform/graphics/AnimationFrameRate.cpp`, `page/Page.cpp`); on iOS the rate goes to the UI process's display
  link, so it is a true 30 Hz tick. The same in WKWebView and home-screen web apps, and in Safari on macOS (a 120 Hz
  Mac is first taken as 60). An Apple engineer on WebKit bug 215745: "This is intentional." Thermal mitigation and a
  cross-origin frame nobody has touched are throttled the same way. There is no API that says so: measuring the
  frames is the only way.
- **An iPhone 16 has a 60 Hz panel**; the Pro models are 120 Hz, but Safari hands out sixty there by default
  (`PreferPageRenderingUpdatesNear60FPSEnabled`), and thirty in Low Power Mode on both.
- **Timers are slowed only when deeply nested**: a `setInterval` from its fifth firing and a `setTimeout` chain ten
  deep are aligned to a 30 ms grid (`DOMTimer::defaultAlignmentIntervalInLowPowerOrThermallyMitigatedMode`). A timer
  set from a frame, an event or a promise is not. The room's timers are of the second kind (checked: the bake's looks
  at its fences are set from idle work, which Safari runs from a frame), and the two places that polled on a timer in
  a chain (`RoomStage.settle`, and the new `gpuIdle`) now use tasks.
- **CPU and GPU are slowed by the system** ("Reducing CPU and GPU performance", Apple); published Geekbench 6 scores
  drop 40-60 % (iPhone 16 Pro Max 3341/8270 to 1384/4093). No reliable GPU figure exists. So a real phone in Low Power
  Mode is both capped and slower: the cap is modelled here, the slowdown only by the CPU-throttled stand-ins.
- **WebKit's WebGL**: no timer queries (the bake times its units by their fences there, as written); sync objects
  work with a zero timeout only, and their status is refreshed once a task (the room polls once a task); programs
  link in the background (`KHR_parallel_shader_compile`); no `requestIdleCallback` and no `scheduler.postTask` (idle
  work runs after each frame, so thirty times a second in Low Power Mode).
- CSS animations on the compositor are not halved in released Safari as far as the sources say (medium confidence);
  those resolved on the main thread are.

Sources: WebKit `Source/WebCore/platform/graphics/AnimationFrameRate.cpp`, `page/Page.cpp`, `page/DOMTimer.h`,
`dom/Document.cpp`, `html/canvas/WebGLSync.cpp`, `html/canvas/WebGL2RenderingContext.cpp`,
`Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml`, `LayoutTests/fast/animation/request-animation-frame-throttling-lowPowerMode.html`;
bugs.webkit.org 168837, 215745, 169213, 281429; developer.apple.com `ProcessInfo.isLowPowerModeEnabled`;
support.apple.com 121029 and 121031 (iPhone 16 and 16 Pro specifications); 9to5mac.com and techlicious.com (the
benchmark scores, secondary).

### What a display that ticks thirty times a second did to the room (read off the code, then measured)

1. **The quality governor judged every frame against sixty a second** (`stage/quality.ts`: slow over 21 ms). At a
   steady 33.3 ms: after thirty frames (one second) the scale goes from 1 straight to 0.6 (a resize); the next window
   is no shorter, so the step is undone (a second resize) and the governor rests a minute; then the same again, for as
   long as the page is open. Each resize waits for the camera to land, so one that fell due in a flight landed as a
   hitch at its end, and for a second out of every sixty-one the room was drawn at 36 % of its pixels.
2. **The bake's pacing took every frame for late** (`gen/bake/pace.ts`: late over 20 ms). Each late frame halves what
   the rest of the bake may take, down to an eighth, with rests of up to 100 ms between its units: on a 30-a-second
   display the rest of the room was baked at an eighth of the pace for as long as the game played. A visitor who then
   left the TV waited for all that was left, the picture standing still, and the camera set off into the bake's tail
   (the root cause above). This is the path that fits the report best: the first pull-back only, on a capped display.
3. Unaffected, as read and as measured: the render loop's pacing (a 33 ms tick is drawn on every tick), the flights'
   and the discs' motion (by the frame's time, not a count of frames), the slow-device rule of the posters and the
   radio (a median over 34 ms; a 33.3 ms flight is not slow).

### Fix (`ad53baa`)

The stage looks at the display's own frames before the room draws any (`RoomStage.watchDisplay`: sixteen in a row,
the second quickest interval), and what it finds is what frames are meant to come at (`expectedFrameMs`: a 60 Hz
frame for anything about that fast or faster, the display's own tick where it is slower). The governor's three limits
(slow, target, on time) and the bake's lateness stretch with it. A step down that does not shorten the frames is not
tried again a minute later (frames are expected as they came), so a cap that only starts later costs one step down
and back, once; frames that come much quicker than expected end the cap. The measurement before the first frame
(`RoomStage.settle`) no longer uses timers, which a browser saving power may slow down.

### How to check on the phone (one screenshot)

`?debug=perf` now shows, in the page's top left corner, two lines:

    medium ×1 dpr 2.00 · 30 fps · display 30/s capped · 0 changes
    flight tv→room: 33 frames, 0 late, worst 34 ms

the tier, scale and pixel ratio; the frames drawn in the last half second; the rate the page takes the display to
hand out frames at and whether it takes that for a cap; how often the quality changed (each change is a resize);
and for the last flight its frames, how many came more than one and a half display frames late, and the longest.

Steps, on the iPhone, in Safari:

1. Open the preview's address with `?debug=perf` added (for PR 19's preview: `<preview address>/?debug=perf`).
2. With Low Power Mode **on** (Settings › Battery, or the battery tile in Control Centre): close the tab, open the
   address again in a new tab (a cold load), wait until the game's title shows, then pull back from the TV (tap
   above the set, or the pill "Explore the room") straight away. Screenshot once the camera has landed.
3. The same again, but wait ten seconds at the title before pulling back. Screenshot.
4. Low Power Mode **off**: the same two. Four screenshots in all.

What to expect after the fix, Low Power Mode on: `display 30/s capped`, `0 changes`, and a flight of about 33 frames
with `0 late`. Low Power Mode off: `display 60/s`, a flight of about 66 frames, `0 late`. A number of changes above 0
on a first load, `late` above 1, or a `worst` over 50 ms (25 ms with Low Power Mode off) is what to send back.

## No GPU (the owner's added request) - summary; full notes in `.shots/flights/nogpu/NOTES.md`

Two rounds, both by a subagent on this M4 Pro, headless Chrome for Testing 151 (the first also Google Chrome 157):
the first on the build before the fixes, the second (17 Nov, 14:00 to 15:15, on mains) on the fixed build frozen at
`.shots/flights/nogpu/dist-fixed`. **This is an owner's decision and is not decided here**; the options and their
numbers are below, the pictures are in `.shots/flights/nogpu/shots/` (not committed: 197 MB).

What a visitor without a GPU meets today:

- **Hardware acceleration switched off means no WebGL at all** in current Chrome on a Mac (plain `--disable-gpu`,
  and the real settings switch): WebGL 1 and 2 are refused and the site shows the flat television, the game running
  at 0.9 s. Chrome no longer falls back to software WebGL by itself; SwiftShader only comes with
  `--enable-unsafe-swiftshader`. Playwright adds that flag to every macOS Chromium launch, so
  `PERF_CHROME_ARGS="--disable-gpu"` and the e2e suite's `ROOM_GL=swiftshader` test a path a Mac Chrome visitor no
  longer gets. Windows (WARP), Linux, Firefox and Safari were not run.
- **The GPU process lost mid-visit** (case c): `e2e/gpu-reset.spec.ts` passes in all three whole runs of the suite.
- **Software WebGL, where a browser does give it**: the room at `low` x 1 from start to finish (a software
  renderer's quality is fixed, `quality.ts`), which is option A below.

### The options, measured on the fixed build (software WebGL, 1440 x 900 at device scale 2)

| Option | What the visitor gets | Frames a second: TV with a level / room / computer / radio | CPU cores busy | Waits | Picture |
| --- | --- | --- | --- | --- | --- |
| **A. Leave it** | the whole site, slowly; all views lit and complete | 20.7 / 17.1 / 16.4 / 17.7; a flight is 15-23 frames, worst frame 141 ms on the first pull-back, 58-92 ms on the rest | 7.0-8.7 of 12, at rest too | game 0.8 s, room ready 5.7 s, whole room lit 211 s; **leaving the TV before that: 31 s, 32 s, about 62 s, 68 s, and three waits not over after 150 s, about 190 s and 385 s** (PAUSE on the tube, nothing else said) | `opt-a-swiftshader-room-view.jpg`, the wait: `opt-a-early-real-early-leave-waiting-2s-view.jpg` |
| **B. Fewer pixels** (0.90 MP today) | the same room, softer; the page's own text stays sharp | 0.32 MP (`low` x 0.6, the governor's existing floor): 46.5-50.7 / 42.7-44.3; 0.16 MP: 61 / 59; 0.08 MP: 60.6 / 61.3 (computer, radio not run) | 7.3-9.2 at 0.32 MP; 4-7 only at 0.08 MP: fewer pixels buy frames, not CPU | leaving at once: 21.5 s and 31 s at 0.32 MP, 2.4-3.1 s below. **On the four efficiency cores at 0.32 MP: room ready 41.7 s, then 3.3 frames a second while the rest was lit** (at rest not reached) | `opt-b-room-crops.jpg` (0.90 / 0.32 / 0.16 / 0.08 MP side by side) |
| **C. Cuts instead of flights** | A's room; a move is a fade, a cut and a fade back (what reduced motion gets today) | at rest as A | as A | click to the new view shown: TV to room 0.61 s, room to computer 0.60 s, **on a machine other jobs were starving**; by the code 0.3-0.4 s against a flight's 1.2 s (not measured clean). The early leaver's wait is A's | `opt-c-cuts-room-view.jpg` |
| **D. The flat television** (`?host=flat` today) | the game at full rate in a CSS set; no room | 121 (worst frame 14.8 ms), game at 60 steps a second | 0.18 + 0.23 | game running 0.9 s; 31 requests, 444 kB, no room file | `opt-d-flat-level-view.jpg` |
| **E. Telling them apart** | nothing by itself: the test A-D would hang on | - | - | one context asked for before the room's chunk loads | - |

- **B's frame is nearly all pixels**: 3-4 ms fixed plus 52-61 ms a megapixel, so 30 frames a second needs about
  0.5 MP and 60 about 0.16-0.2 MP **on twelve fast cores**. A machine without a GPU rarely has them; the one run on
  four slow cores is the 3.3 frames a second above. At 0.32 MP poster titles read and their small print does not; at
  0.16 MP edges are steps a blind's slat wide; at 0.08 MP it is a mosaic.
- **A's first wait has no bound**: `createRoom.ts > preflight` awaits `GeneratedRoom.whenWhole()` with no deadline
  (read in the code; seen as three waits that never ended, none followed to its end). Why the same click costs 31 s
  one time and minutes another was not found; the bake's hurried units take 3 to 31 s each on this renderer.
  On a GPU the whole room is lit within seconds, so this is the software renderer's wait alone.
- **D reaches, with a mouse or a finger**: the game, the sound toggle, and the e-mail link through the game's menus
  (three clicks; by touch the pad's START and A). **Not the resume** (keyboard focus or `#resume` only), **not the
  music** (no radio, with a keyboard neither), **not LinkedIn, GitHub or X**, and nothing says they exist; the page
  does not scroll (`opt-d-reach-touch-pad-level-select-after-view.jpg`). The first round also saw the startup still
  cross-fade over 0.4 s into the differently shaped flat set. All of this is what the Mac Chrome visitor with
  acceleration off meets **today**, whichever option is chosen.
- **E works**: `getContext('webgl2', { failIfMajorPerformanceCaveat: true })` is null on the software browser only,
  and the renderer's name says it (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...` against `ANGLE (Apple,
  ANGLE Metal Renderer: Apple M4 Pro ...`; `softwareGpu.ts` matches it already). One launch where the flag does not
  tell (`--use-angle=swiftshader`) is told by the name.

**How far to trust it.** Only D's run had the machine to itself; other checkouts started inside most of the others
(`foreign.py watch` beside each; the full list is in the helper's notes, "The runs"). C's tour is a starved
machine's and its frames are discarded; A's room stretch had 4.4 cores of other jobs. Not run: a 60 Hz display, a
real machine without a GPU, Windows, Linux, Firefox, Safari, Chrome 157 on software WebGL, device scale 1, a picture
at 0.5 MP, the room at rest on slow cores.

**My reading, for the owner to overrule**: D with E (send a software-rendered visitor to the flat television before
the room's chunk loads) is the only option that holds a full frame rate on a slow CPU, and it costs under half a
core; B holds only on a fast one, and A and C leave a first wait nothing bounds. But D is worth choosing only
together with giving the flat television a way to the resume and the links by mouse and touch, which is new work
outside the camera and the render loop, and which today's acceleration-off visitor lacks already.

## Chrome's Energy Saver (found while measuring)

On battery at 20 % or less, Chrome hands out thirty frames a second, headless Chrome for Testing included (proven:
a blank page reads 33.3 ms; the same launch with a profile whose `Local State` holds
`{"performance_tuning":{"battery_saver_mode":{"state":0}}}` reads 8.3 ms; `--disable-features=BatterySaverModeAvailable`
does not lift it). A real visitor on a laptop under 20 % battery gets this cap too, which is the same thing to the
room as Safari's Low Power Mode. To measure on battery: `chromium.launchPersistentContext(tmpProfile, ...)` after
writing that file, as `scripts/perf/nogpuLib.mjs` > `launch` does (`node scripts/perf/nogpuRate.mjs` prints the bare
frame rate as a check); `scripts/perf/flights.mjs` does not do this yet. Simpler: measure on mains.

## Results, before and after (17 Nov, on mains, display ticking 120 a second)

Before is `.shots/flights/dist-base` (PR 19's branch at 7e4583a); after is this branch. A row is one cold load in a
new browser. "Wait" is from the click to the camera setting off; "late" is a frame interval over one and a half paced
frames; "speed step" is the largest change of the camera's speed from one frame to the next, as a share of its top
speed (the ease's own bend is 3 % at sixty frames a second, 9 % at thirty). `tv→room` rows are named by the
script's arguments: `--device phone` is 390 x 844 at 3x with the CPU 6x slower, `&quality=low` the lowest tier,
`slowGpu/slowBake 48` the overloaded-GPU stand-in, `--raf 30` a display that hands out thirty frames a second,
`--leave n` the ms after `ready` at which the visitor leaves, `--level` a level played for six seconds first.

Which runs these are. The six `--leave 0 --path all` rows of the desktop, the phone and the slow-GPU stand-ins were
measured 11:50-11:58, before another checkout began measuring on this machine at 11:59 (the desktop, phone and
phone-low ones again at 13:10-13:13 on the final build, alone). Every other row was run again, some three times,
until it had a run with no other checkout's browser or test run alive (`alone throughout` in the log). Three rows
never got one in the attempts made and are marked †: both Chromium `--raf 30 --path all` rows and the WebKit phone
`--raf 30 --path all` row; all three are clean as measured (another's load can only add late frames). The rows
were measured on 2c1e659; the rain's `apart` flag (caa57fd) came after, and five rows were measured again with it.
The 30-a-second rows, before and after, use the final stand-in (13:14-13:34); three earlier versions of it gave
frames no capped display shows (logs `standin*-*.log`), which is said in `scripts/perf/flightProbe.js`.

#### The first pull-back

| Run | | Wait | Frames | Longest | Late | On time | Speed step | Made inside the flight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chromium30: --device phone --raf 30 --leave 0 --path all --tv | before | 240 ms | 33 at 33.33 ms | 33.3 ms | 0 | 100.0 % | 8.9 % | programs 6 shaders 12 buffers 44 texture 4.27MP targets 2 vaos 17 |
|  | after † | 332 ms | 33 at 33.33 ms | 33.3 ms | 0 | 100.0 % | 8.9 % | nothing |
| chromium30: --device phone --raf 30 --leave 10000 --tv | before | 173 ms | 27 at 33.33 ms | 33.3 ms | 0 | 100.0 % | 8.9 % | programs 4 shaders 8 buffers 40 texture 0.08MP targets 2 vaos 16 |
|  | after | 181 ms | 33 at 33.33 ms | 33.3 ms | 0 | 100.0 % | 8.9 % | texture 0.08MP |
| chromium30: --raf 30 --leave 0 --path all | before | 223 ms | 33 at 33.33 ms | 33.3 ms | 0 | 100.0 % | 8.9 % | programs 6 shaders 12 buffers 40 texture 4.27MP targets 2 vaos 19 |
|  | after † | 211 ms | 33 at 33.33 ms | 33.3 ms | 0 | 100.0 % | 8.9 % | nothing |
| chromium30: --device phone --raf 30 --leave 0 --config {"slowGpu":48,"slowBake":48} | after | 1051 ms | 33 at 33.33 ms | 33.3 ms | 0 | 100.0 % | 8.9 % | nothing |
| desktop-low: --leave 0 --path all --query &quality=low | after | 192 ms | 66 at 16.6 ms | 17.5 ms | 0 | 100.0 % | 3.1 % | nothing |
| desktop-low: --leave 1000 --path first --query &quality=low | after | 22 ms | 66 at 16.6 ms | 17.6 ms | 0 | 100.0 % | 3.1 % | nothing |
| desktop-low: --leave 10000 --path first --query &quality=low | after | 5 ms | 67 at 16.6 ms | 17.6 ms | 0 | 100.0 % | 3.0 % | texture 0.08MP |
| desktop: --leave 0 --path all --tv | before | 200 ms | 133 at 8.3 ms | 9.2 ms | 0 | 100.0 % | 2.2 % | programs 6 shaders 12 buffers 40 texture 4.27MP targets 2 vaos 19 |
|  | after | 180 ms | 66 at 16.6 ms | 17.6 ms | 0 | 100.0 % | 3.0 % | nothing |
| desktop: --leave 1000 --path first --tv | before | 4 ms | 131 at 8.3 ms | 17.3 ms | 1 | 99.2 % | 1.8 % | programs 4 shaders 8 buffers 47 texture 0.08MP targets 2 vaos 20 |
|  | after | 20 ms | 66 at 16.6 ms | 17.3 ms | 0 | 100.0 % | 3.1 % | nothing |
| desktop: --leave 10000 --path first --tv | before | 5 ms | 147 at 7.7 ms | 14.7 ms | 2 | 98.6 % | 1.9 % | programs 4 shaders 8 buffers 47 texture 0.00MP targets 2 vaos 20 |
|  | after | 6 ms | 66 at 16.6 ms | 17.6 ms | 0 | 100.0 % | 3.1 % | nothing |
| desktop: --level 6000 --tv | before | 1 ms | 143 at 7.9 ms | 9.3 ms | 0 | 100.0 % | 1.5 % | programs 4 shaders 8 buffers 47 texture 0.00MP targets 2 vaos 20 |
|  | after | 1 ms | 66 at 16.6 ms | 17.7 ms | 0 | 100.0 % | 3.1 % | texture 0.08MP |
| phone-low: --device phone --leave 0 --path all --query &quality=low | after | 322 ms | 66 at 16.6 ms | 17.5 ms | 0 | 100.0 % | 3.3 % | nothing |
| phone-low: --device phone --leave 1000 --path first --query &quality=low | after | 177 ms | 66 at 16.6 ms | 18.6 ms | 0 | 100.0 % | 3.7 % | nothing |
| phone-low: --device phone --leave 10000 --path first --query &quality=low | after | 193 ms | 66 at 16.6 ms | 17.5 ms | 0 | 100.0 % | 3.1 % | nothing |
| phone: --device phone --leave 0 --path all --tv | before | 262 ms | 125 at 8.4 ms | 34.3 ms | 4 | 96.8 % | 1.6 % | programs 6 shaders 12 buffers 44 texture 4.27MP targets 2 vaos 17 |
|  | after | 343 ms | 66 at 16.6 ms | 17.6 ms | 0 | 100.0 % | 3.3 % | nothing |
| phone: --device phone --leave 1000 --path first --tv | after | 201 ms | 66 at 16.6 ms | 17.6 ms | 0 | 100.0 % | 3.3 % | nothing |
| phone: --device phone --leave 10000 --path first --tv | after | 178 ms | 66 at 16.6 ms | 17.7 ms | 0 | 100.0 % | 3.4 % | nothing |
| phone: --device phone --level 6000 --tv | before | 33 ms | 132 at 8.4 ms | 16.7 ms | 2 | 98.5 % | 1.7 % | programs 4 shaders 8 buffers 40 texture 0.00MP targets 2 vaos 16 |
|  | after | 32 ms | 66 at 17.6 ms | 17.7 ms | 0 | 100.0 % | 3.2 % | nothing |
| slow-desktop: --leave 0 --path all --config {"slowGpu":48,"slowBake":48} --tv | after | 891 ms | 66 at 16.6 ms | 17.5 ms | 0 | 100.0 % | 3.0 % | nothing |
| slow-desktop: --leave 1000 --path first --config {"slowGpu":48,"slowBake":48} --tv | after | 703 ms | 66 at 16.6 ms | 17.4 ms | 0 | 100.0 % | 4.1 % | nothing |
| slow-desktop: --leave 10000 --path first --config {"slowGpu":48,"slowBake":48} --tv | after | 6 ms | 66 at 16.6 ms | 17.5 ms | 0 | 100.0 % | 3.1 % | nothing |
| slow-phone: --device phone --leave 0 --path all --config {"slowGpu":48,"slowBake":48} --tv | before | 1216 ms | 113 at 8.3 ms | 41.7 ms | 15 | 86.7 % | 1.5 % | programs 6 shaders 12 buffers 44 texture 1.13MP targets 2 vaos 17 |
|  | after | 949 ms | 66 at 16.6 ms | 17.7 ms | 0 | 100.0 % | 3.1 % | nothing |
| slow-phone: --device phone --leave 1000 --path first --config {"slowGpu":48,"slowBake":48} --tv | after | 218 ms | 67 at 16.0 ms | 19.1 ms | 0 | 100.0 % | 3.7 % | nothing |
| slow-phone: --device phone --leave 10000 --path first --config {"slowGpu":48,"slowBake":48} --tv | after | 214 ms | 66 at 16.6 ms | 17.5 ms | 0 | 100.0 % | 3.0 % | nothing |
| slow-phone: --device phone --level 6000 --config {"slowGpu":48,"slowBake":48} --tv | before | 50 ms | 133 at 8.2 ms | 21.7 ms | 2 | 98.5 % | 1.7 % | programs 4 shaders 8 buffers 40 texture 0.00MP targets 2 vaos 16 |
|  | after | 48 ms | 66 at 17.0 ms | 17.7 ms | 0 | 100.0 % | 3.1 % | nothing |
| webkit: --browser webkit --leave 0 --path all | before | 75 ms | 75 at 15.0 ms | 19.0 ms | 0 | 100.0 % | 3.6 % | programs 6 shaders 12 buffers 40 texture 4.27MP targets 2 vaos 19 |
|  | after | 111 ms | 66 at 17.0 ms | 17.0 ms | 0 | 100.0 % | 4.1 % | nothing |
| webkit: --browser webkit --leave 1000 | after | 153 ms | 66 at 17.0 ms | 20.0 ms | 0 | 100.0 % | 3.2 % | nothing |
| webkit: --browser webkit --device phone --leave 0 --path all | before | 74 ms | 73 at 16.0 ms | 19.0 ms | 0 | 100.0 % | 4.2 % | programs 6 shaders 12 buffers 44 texture 4.27MP targets 2 vaos 17 |
|  | after | 175 ms | 66 at 17.0 ms | 19.0 ms | 0 | 100.0 % | 3.3 % | nothing |
| webkit30: --browser webkit --raf 30 --leave 0 --path all | before | 91 ms | 33 at 33.0 ms | 35.0 ms | 0 | 100.0 % | 8.9 % | programs 6 shaders 12 buffers 40 texture 4.27MP targets 2 vaos 19 |
|  | after | 108 ms | 33 at 33.0 ms | 35.0 ms | 0 | 100.0 % | 8.8 % | nothing |
| webkit30: --browser webkit --raf 30 --device phone --leave 0 --path all | before | 71 ms | 33 at 33.0 ms | 35.0 ms | 0 | 100.0 % | 8.9 % | programs 6 shaders 12 buffers 44 texture 4.27MP targets 2 vaos 17 |
|  | after † | 91 ms | 33 at 33.0 ms | 34.0 ms | 0 | 100.0 % | 8.9 % | nothing |
| webkit30: --browser webkit --raf 30 --device phone --leave 10000 | after | 19 ms | 34 at 32.0 ms | 37.0 ms | 0 | 100.0 % | 7.6 % | nothing |

#### Every other transition, before

| Run | Quality | Flights | Longest frame of any | Late frames (flights with any) | Lowest on time | Largest speed step |
| --- | --- | --- | --- | --- | --- | --- |
| chromium30: --device phone --raf 30 --leave 0 --path all --tv | medium×1 | 17 | 33.3 ms | 0 in 0 | 100.0 % | 8.9 % |
| chromium30: --raf 30 --leave 0 --path all | high×1 | 17 | 33.3 ms | 0 in 0 | 100.0 % | 9.0 % |
| desktop: --leave 0 --path all --tv | high×1 | 17 | 9.4 ms | 0 in 0 | 100.0 % | 2.3 % |
| phone: --device phone --leave 0 --path all --tv | medium×1 | 17 | 41.6 ms | 12 in 7: room→radio#1 5 (41.6 ms), radio→room#1 1 (16.0 ms), room→pc#2 1 (33.1 ms), room→radio#2 1 (16.8 ms), radio→room#2 1 (15.9 ms), room→tv#2 1 (22.4 ms) … | 95.9 % | 2.3 % |
| slow-phone: --device phone --leave 0 --path all --config {"slowGpu":48,"slowBake":48} --tv | low×0.7 | 17 | 34.3 ms | 249 in 15: room→tv#1 19 (17.5 ms), tv→room#2 18 (17.4 ms), room→pc#1 31 (17.5 ms), room→radio#1 1 (34.3 ms), radio→room#1 2 (25.5 ms), room→pc#2 35 (18.8 ms) … | 54.6 % | 4.6 % |
| webkit: --browser webkit --leave 0 --path all | high×1 | 17 | 26.0 ms | 2 in 1: room→radio#1 2 (26.0 ms) | 97.2 % | 4.3 % |
| webkit: --browser webkit --device phone --leave 0 --path all | medium×1 | 17 | 26.0 ms | 2 in 2: tv→room#2 1 (24.0 ms), room→tv#2 1 (26.0 ms) | 98.6 % | 4.7 % |
| webkit30: --browser webkit --raf 30 --leave 0 --path all | high×1 | 17 | 41.0 ms | 0 in 0 | 100.0 % | 9.0 % |
| webkit30: --browser webkit --raf 30 --device phone --leave 0 --path all | medium×1 | 17 | 37.0 ms | 0 in 0 | 100.0 % | 9.0 % |

#### Every other transition, after

| Run | Quality | Flights | Longest frame of any | Late frames (flights with any) | Lowest on time | Largest speed step |
| --- | --- | --- | --- | --- | --- | --- |
| chromium30: --device phone --raf 30 --leave 0 --path all --tv † | medium×1 | 17 | 33.3 ms | 0 in 0 | 100.0 % | 8.9 % |
| chromium30: --raf 30 --leave 0 --path all † | high×1 | 17 | 33.3 ms | 0 in 0 | 100.0 % | 9.0 % |
| desktop-low: --leave 0 --path all --query &quality=low | low×1 | 17 | 21.5 ms | 0 in 0 | 100.0 % | 4.5 % |
| desktop: --leave 0 --path all --tv | high×1 | 17 | 17.7 ms | 0 in 0 | 100.0 % | 4.2 % |
| phone-low: --device phone --leave 0 --path all --query &quality=low | low×1 | 17 | 19.6 ms | 0 in 0 | 100.0 % | 4.6 % |
| phone: --device phone --leave 0 --path all --tv | medium×1 | 17 | 17.7 ms | 0 in 0 | 100.0 % | 4.5 % |
| slow-desktop: --leave 0 --path all --config {"slowGpu":48,"slowBake":48} --tv | low×1 | 17 | 50.0 ms | 8 in 4: room→radio#2 1 (25.3 ms), room→tv#2 1 (50.0 ms), radio→tv#1 3 (25.2 ms), radio→pc#1 3 (25.1 ms) | 95.4 % | 5.0 % |
| slow-phone: --device phone --leave 0 --path all --config {"slowGpu":48,"slowBake":48} --tv | medium×0.6 | 17 | 79.9 ms | 20 in 6: radio→room#1 3 (33.6 ms), room→radio#2 1 (26.4 ms), room→tv#2 6 (23.4 ms), radio→tv#1 2 (29.6 ms), radio→pc#1 7 (30.0 ms), pc→tv#1 1 (79.9 ms) | 86.3 % | 5.6 % |
| webkit: --browser webkit --leave 0 --path all | high×1 | 17 | 20.0 ms | 0 in 0 | 100.0 % | 4.1 % |
| webkit: --browser webkit --device phone --leave 0 --path all | medium×1 | 17 | 29.0 ms | 1 in 1: room→radio#2 1 (29.0 ms) | 98.5 % | 4.4 % |
| webkit30: --browser webkit --raf 30 --leave 0 --path all | high×1 | 17 | 37.0 ms | 0 in 0 | 100.0 % | 9.0 % |
| webkit30: --browser webkit --raf 30 --device phone --leave 0 --path all † | medium×1 | 17 | 39.0 ms | 0 in 0 | 100.0 % | 9.0 % |

#### The TV view until the visitor leaves

| Run | | Frames at the TV | Median | Longest | Over 33 ms | Quality changes |
| --- | --- | --- | --- | --- | --- | --- |
| chromium30: --device phone --raf 30 --leave 10000 --tv | before | 290 | 33.3 ms | 266.7 ms | 289 | medium×1@1661 → medium×0.6@2874 → medium×1@4277 |
| chromium30: --device phone --raf 30 --leave 10000 --tv | after | 290 | 33.3 ms | 266.7 ms | 289 | medium×1@1689  (frames expected every 33.3 ms, capped, 0 changes) |
| desktop: --leave 1000 --path first --tv | before | 56 | 16.7 ms | 114.3 ms | 1 | 0 |
| desktop: --leave 1000 --path first --tv | after | 53 | 16.7 ms | 150 ms | 1 | 0 |
| desktop: --leave 10000 --path first --tv | before | 647 | 15.6 ms | 108.5 ms | 2 | 0 |
| desktop: --leave 10000 --path first --tv | after | 594 | 16.7 ms | 125 ms | 2 | 0 |
| desktop: --level 6000 --tv | before | 595 | 15.2 ms | 116.1 ms | 2 | 0 |
| desktop: --level 6000 --tv | after | 537 | 16.7 ms | 125 ms | 1 | 0 |
| phone: --device phone --leave 1000 --path first --tv | after | 53 | 16.7 ms | 192.5 ms | 1 | 0 |
| phone: --device phone --leave 10000 --path first --tv | after | 581 | 16.7 ms | 240.7 ms | 1 | 0 |
| phone: --device phone --level 6000 --tv | before | 494 | 16.7 ms | 183.9 ms | 7 | medium×1@1766 → medium×0.7@9987 → medium×1@11128 |
| phone: --device phone --level 6000 --tv | after | 508 | 16.7 ms | 190.9 ms | 4 | medium×1@1754 → medium×0.7@11254  (frames expected every 16.7 ms, 1 changes) |
| slow-desktop: --leave 1000 --path first --config {"slowGpu":48,"slowBake":48} --tv | after | 57 | 16.6 ms | 125 ms | 1 | 0 |
| slow-desktop: --leave 10000 --path first --config {"slowGpu":48,"slowBake":48} --tv | after | 593 | 16.7 ms | 109 ms | 2 | 0 |
| slow-phone: --device phone --leave 10000 --path first --config {"slowGpu":48,"slowBake":48} --tv | after | 528 | 16.7 ms | 251 ms | 2 | low×0.7@3225 → low×0.85@15289  (frames expected every 16.7 ms, 2 changes) |
| slow-phone: --device phone --level 6000 --config {"slowGpu":48,"slowBake":48} --tv | before | 491 | 15.9 ms | 154.4 ms | 6 | medium×0.6@2719 → low×0.7@11148 |
| slow-phone: --device phone --level 6000 --config {"slowGpu":48,"slowBake":48} --tv | after | 459 | 16.7 ms | 150.7 ms | 12 | medium×0.6@3130 → low×0.7@12146  (frames expected every 16.7 ms, 2 changes) |

Read against the acceptance numbers (no interval over one and a half paced frames, no jump, 99 % on time):

- **The first pull-back** meets them in every row: desktop top and lowest tier, the phone stand-in on its tier and
  the lowest, WebKit, both 30-a-second stand-ins and both slow-GPU stand-ins, left at once, one and ten seconds after
  ready and after a level. Nothing is made inside it but the TV's own 320 x 240 picture.
- **Every other transition** meets them on the desktop (both tiers), the phone stand-in (both tiers), WebKit desktop
  and under the 30-a-second cap in both engines. WebKit at the phone's size had one frame of 29 ms in the second
  flight to the radio (limit 25.5 ms; 98.5 % on time).
- **The overloaded-GPU stand-in falls short**, as before but less: 8 late frames in 4 of 17 flights on the desktop
  (before: not measured), 20 in 6 on the phone (before: 249 in 15, as low as 54.6 % on time; now 86.3 % at the
  lowest, the longest frame 79.9 ms). Its first pull-back is clean after a wait of 0.9-1.0 s behind PAUSE (before:
  1.2 s with nothing said, then 15 late frames). The governor moves the scale there every 15-30 s (3-5 changes
  in a minute); that is the second stage's item 2.
- **The wait before the first pull-back** is longer where it used to be shorter than the work: 0.19 s on the
  desktop left at once (before 0.20 s), 0.32-0.40 s on the phone stand-in left at once (before 0.26 s), with the game
  paused and PAUSE on the tube. From one second after ready on, the desktop waits 6-22 ms.
- **The phone stand-in's 0.18 s between the click and take-off from one second on is not this work's**: the
  monitor's still is painted in the click (`Monitor.prepare`, 0.47 MP, one task of 170-190 ms at 6x CPU) in the old
  build and the new alike (measured on both: 179 and 178 ms). It is never painted at the TV there in ten seconds.
  Latency, not a late frame; worth its own look.
- **The TV view** has one long frame in old and new alike: the rain's audio context, 108-116 ms before, 109-150 ms
  after on the desktop (it now runs as an idle unit, 0.18 s after ready), 240-267 ms on the phone stand-in. Not
  made worse on purpose, not made better either; the level runs' other long frames are the game's own (155 ms in
  `onkeydown` at 6x CPU as the first level starts).

## Checks

- `pnpm check`: 282 files, 2973 tests pass (13:34).
- `pnpm e2e` (195 tests): three whole runs on the final code, each 190 or 189 of 191 run tests passing (4 skipped), never the same failure
  twice in my own area: run 1 failed `radio-deck.spec.ts:129` (the test timed the lid from the click; the camera now
  waits for the discs first, so the test times it from take-off: fixed, the file's 18 tests pass) and
  `room.spec.ts:18`; run 2 failed `radio-player.spec.ts:31` (a real-time bound of 1000 ms missed by 12 ms under the
  parallel run; 4 of 4 alone); run 3 failed `room.spec.ts:18` again. **`room.spec.ts:18` (the game's picture on the
  startup still) fails in two of three whole runs and passes 3 of 3 alone**: it is the startup still's test, in
  the other worker's work in progress (d96cfed), and nothing here touches it, but I have not shown it fails without
  this branch. `e2e/flights.spec.ts` (new) passes in all three whole runs and in 7 of 8 runs alone; its longest-frame
  limit was then widened from 2.5 to 3.5 paced frames for the development server (said in the test). The gpu-reset
  test (case c of the no-GPU request) passes in all three runs.
- `pnpm report:bundle`: **passes** (15:30, after the budgets were raised as below). Before the raise it failed by what this work added: the room's chunk 194.08 kB
  against 191.6 (this work: +2.60 kB of gzip, 1.4 %: the warming, the wait before a flight, the bake's sliced end,
  the capped display, the idle work's flight rule), the entry 215.12 against 215 (this work: +0.15 kB, the room
  host's waits), the posters' chunk 6.83 against 6.7 (+0.14 kB). Measured against the build before the fixes with the
  report's own gzip: room 191.48 to 194.08, index 212.72 to 212.87, PosterWall 6.69 to 6.83; the debug readout's
  chunk 0.38 to 0.73 (loaded with `?debug=perf` only, no budget row). Firstmate's answer (message 007): check
  that nothing debug-only is in those chunks, then raise the budgets to the measured figures plus the usual small
  headroom and say so in the budget file. Checked: the readout is its own chunk, imported only with `?debug=perf`
  (`RoomHost.tsx`), and the measuring probe is never built; what the room's chunk gained is the fix itself. Budgets
  raised in `bundle-budgets.json` with the itemised note: room 191.6 to 194.2, entry JS 215.0 to 215.2, posterWall
  6.7 to 6.9.

## Not verified on a real phone

Everything here is this Mac (Apple M4 Pro): no phone's GPU, no iOS, no real Low Power Mode. Open on a device:
whether the first pull-back is smooth on the owner's iPhone 16 with Low Power Mode on (the one-screenshot check
above); what `new AudioContext()` and `resume()` cost there (WebKit on this Mac: 3 ms and 12-15 ms); how long the
wait behind PAUSE is on a slow phone's GPU (the stand-in says 0.3-1.0 s); the monitor's still painted in the click;
whether the display is taken for capped correctly (the readout says).

## Second stage (owner's decisions, firstmate's message 006 of 17 Nov, 13:39) - NOT STARTED

Two items added to this task, to be done on this branch after the above and before `ready for integration`:

1. **Rest pacing.** The owner: "There is no need for 60 fps at rest. Focus on optimization rather than keeping
   60fps." When the camera is still and the visitor is not interacting, draw only as often as the fastest visible
   thing in the view needs (nothing if nothing changes); flights, drag/tilt/hover and the played game unchanged.
   The rest rate must divide the display's rate (60, 120, 90, a 30-capped display) and motion advance by elapsed
   time (the discs juddered once when a 30-a-second pacer beat against the display); the first frame of a flight
   or of a response to input must not be late for the rest; nothing drawn or simulated on a hidden page; measured
   before and after per view (frames drawn a second, GPU and main-thread time a second, an honest energy proxy),
   desktop, phone stand-in and lowest tier; the flight rows that start from rest run again; `?debug=perf` shows
   that the page rests and why; every test, doc and PR claim of sixty at rest updated.
2. **The governor under overload.** An overloaded device drops to the lowest tier sooner instead of settling on
   the middle tier at a reduced scale; no flapping; never on a display that is merely capped at thirty; the
   overloaded phone stand-in before and after, and a healthy device unchanged.

Where to start: `src/room/stage/RenderLoop.ts` (`pace`, `ride`, the wanted poll), `quality.ts`
(`FLOOR_HITS`, the scale ladder), docs/ROOM.md › Frames and › Quality, `node scripts/perf/profile.mjs` for a view at
rest, and the slow-GPU rows above for the governor (it changes the scale 3-5 times a minute there).

## To do next, in this order (for whoever picks this up)

1. **Attribute `e2e/room.spec.ts:18`** (firstmate, message 007: before integration, not left open). It failed in
   two of three whole e2e runs on this branch and passes alone. Cheapest test: the whole suite three times on the
   merge-base (PR 19's branch at d96cfed, which this branch merged in 0b7a36a) in a scratch checkout, on a quiet
   machine (`python3 .shots/flights/foreign.py wait` first), and compare. If it fails there too it is the still's
   work in progress or the machine's load: say which. If only here: the test screenshots the game's picture on the
   still right after `scene === 'title'`, and found 23 % of the pixels differing where it wants over 50 %; the
   bake's end and the idle units after ready (the rain's sound, the warming) are what this branch changed at that
   moment.
2. **The second stage** (above): rest pacing, then the governor under overload.
3. **The no-GPU decision** is with the owner (raised 17 Nov, 15:40, `needs-decision … [key=nogpu]`): the options
   and their numbers are in "No GPU" above. Nothing of it is built; if the answer is the flat television, the ways
   to the résumé and the links by mouse and touch are a task of their own.
4. Steady state, before against after, was not measured as such in the first stage: frame time per view at rest and
   memory (`node scripts/perf/profile.mjs --dist .shots/flights/dist-base` against `--dist dist`); it belongs with
   the second stage's rest measurements. Room-ready times are in the tables' logs: desktop 549-634 ms before,
   564-701 ms after; phone stand-in 1523-1765 ms before, 1382-1580 ms after (they move with the machine's load).

## Where this stands (17 Nov, 15:40)

The first stage is done and pushed: diagnosis, fixes, the review's findings, the matrices, the tables above, the
docs, the budgets (`pnpm report:bundle` passes). The no-GPU options are measured on the fixed build and raised to
the owner. Open, in the order of the list above: the attribution of `e2e/room.spec.ts:18`, then the second stage.
To re-run any measurement: `sh .shots/flights/after.sh` (the whole matrix), `python3 .shots/flights/until-clean.py`
(rows without a run alone, again), `python3 .shots/flights/tables.py` (the tables).
