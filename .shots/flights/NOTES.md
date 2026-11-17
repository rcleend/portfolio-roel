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
  were made one at a time.

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

Files touched outside the camera and the render loop: `src/room/stage/IdleWork.ts`, `RoomStage.ts`,
`sceneWarmup.ts` (new), `src/room/atmosphere/RoomAtmosphere.ts`, `src/room/gen/GeneratedRoom.ts`,
`gen/bake/Baker.ts`, `gen/bake/pace.ts`, `src/room/assembleRoom.ts`, `createRoom.ts`, `ViewController.ts`,
`src/room/posters/PosterWall.ts`, `PostersSlot.ts`, `src/room/spotlight/SpotlightDoor.ts`,
`src/room/radio/RadioDeckHandle.ts`, `deviceContract.ts`, `device/RadioDevice.ts`, `device/Discs.ts`,
`src/app/hosts/RoomHost.tsx`, `src/app/pc/PcSlot.tsx`, `e2e/programs.ts`, `e2e/flights.spec.ts` (new),
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

Measured by a subagent on the build *before* the fixes (`.shots/flights/dist-base`), Chrome for Testing 151 and
Google Chrome 157, headless, M4 Pro. Not finished (battery): three items owed, listed at the end.

- **Hardware acceleration switched off means no WebGL at all** in both browsers (plain `--disable-gpu`, and the real
  settings switch in Local State): WebGL 1 and 2 are refused and the site shows the flat television, the game
  running at 0.9 s. Chrome no longer falls back to software WebGL by itself; SwiftShader only comes with
  `--enable-unsafe-swiftshader`. Playwright adds that flag to every macOS Chromium launch, so
  `PERF_CHROME_ARGS="--disable-gpu"` and the e2e suite's `ROOM_GL=swiftshader` test a path a Mac Chrome visitor no
  longer gets.
- **Software WebGL where it is forced**: tier `low` x 1 from start to finish (not governed, as documented: confirmed).
  First paint 48-56 ms, game running 0.6 s, room ready 4.9-5.2 s (opening bake 3.4 s against 0.11 s on Metal), one
  0.7 s main-thread freeze in the game at 0.65-1.4 s. Frames: TV with a level 22 a second, room 19, computer 17,
  radio 20, flights 16-21 (worst frame 194 ms on the first pull-back); phone size 21-26. The GPU process holds 7-9.5
  of 12 cores, at rest too. The whole room is lit only after 170-190 s (288 s at the phone's size), and a visitor
  who clicks "Explore the room" as the room turns ready waits for that: 27 s, 66 s, 92 s, 222 s in four runs, not
  gone after 177 s in a fifth, with no cue (on the fixed build the game now pauses at the click, but the wait is the
  bake's and is as long). Nothing black or unlit in the four views; the discs' prints arrive about 20 s after
  landing and the monitor showed its placeholder instead of the wallpaper at 1.5 s and 7 s.
- **The flat television (WebGL refused)**: game running at 0.9 s, the display's rate held (worst frame 13.6 ms), under
  half a core, 31 requests and 440 kB, no room file fetched, nothing left waiting. Gaps: the first picture is the
  room's startup still, which cross-fades over 0.4 s into a differently shaped flat TV (two sets showing through each
  other); the résumé is reachable only by keyboard (Tab twice, or the skip link), not by mouse or touch; the music
  is unreachable (no radio); the X link is nowhere, LinkedIn, GitHub and e-mail only inside the résumé; the game
  keeps running under the open résumé.
- **Judgement to bring to the owner (needs-decision, not decided here)**: the software renderer does not hold a
  usable rate in the 3D room on the lowest tier (17-26 frames a second with 8-9 fast cores busy, and a first
  pull-back that can wait minutes). Options: (a) hand software-rendered visitors the flat television
  (`failIfMajorPerformanceCaveat: true` is refused exactly in that case, so it can be told before the room's chunk
  loads): full frame rate for half a core, but the flat host then needs a way to the résumé, the music and the links
  by mouse and touch, and its hand-over from the still fixed; (b) keep the 3D room there and bound the bake (a far
  shorter software profile) and the wait; (c) leave it, since Chrome on a Mac no longer reaches this path at all
  (Windows uses WARP, not measured; Firefox and Safari not measured).
- Owed: frame time against pixels and a 4-core stand-in on software WebGL; Chrome 157 software frames and the Metal
  low/phone references (taken under the 30-a-second cap, discarded); case (c), `e2e/gpu-reset.spec.ts`, not run; the
  fallbacks when the room fails after it was chosen (chunk blocked, WebGL 1 only).

## Chrome's Energy Saver (found while measuring)

On battery at 20 % or less, Chrome hands out thirty frames a second, headless Chrome for Testing included (proven:
a blank page reads 33.3 ms; the same launch with a profile whose `Local State` holds
`{"performance_tuning":{"battery_saver_mode":{"state":0}}}` reads 8.3 ms; `--disable-features=BatterySaverModeAvailable`
does not lift it). A real visitor on a laptop under 20 % battery gets this cap too, which is the same thing to the
room as Safari's Low Power Mode. To measure on battery: `chromium.launchPersistentContext(tmpProfile, ...)` after
writing that file, as `scripts/perf/nogpuLib.mjs` > `launch` does (`node scripts/perf/nogpuRate.mjs` prints the bare
frame rate as a check); `scripts/perf/flights.mjs` does not do this yet. Simpler: measure on mains.

## Where this stands (2026-11-17, about 10:45)

**Interrupted by the machine's battery.** The Mac went to 5 % on battery during the after-measurements. Chrome
(Energy Saver, on below 20 % on battery) then hands out thirty frames a second, headless included: every run from
that moment shows a 33 ms display tick, so none of them says anything about 60 or 120 Hz. The batch was stopped.

Done and pushed (`fm/ship-portfolio-smooth-flights`): the diagnosis above; the fixes (bake's end, flights on the
paced frames, nothing runs in a flight, what a flight shows is made first, the capped display, the readout); unit
tests for all of it (`pnpm typecheck`, `pnpm lint` and vitest pass); docs/ROOM.md (structure; numbers still to add).

Measured on the fixed build before the battery went (idle M4 Pro, headless, 120 Hz, desktop top tier):

| Flight (first time each) | Wait before take-off | Frames | Longest | Late | Made inside the flight |
| --- | --- | --- | --- | --- | --- |
| TV to room, left the moment the room is ready | 227 ms | 66 at 16.6 ms | 17.4 ms | 0 | nothing (before: 6 programs, 19 vertex arrays, 40 buffers, 4.3 MP of texture) |
| room to TV | 2 ms | 66 | 17.5 ms | 0 | nothing |
| room to computer | 1 ms | 66 | 17.4 ms | 0 | nothing |
| computer to room | 206 ms (the screen's own close) | 67 | 17.4 ms | 0 | nothing |
| room to radio | 16 ms | 67 | 17.6 ms | 0 | 2 vertex arrays |
| radio to room | 2 ms | 66 | 17.7 ms | 0 | nothing |

Measured on the fixed build *after* the battery went, which is a real 30-a-second cap in Chromium (its own Energy
Saver, not a stand-in), all 18 transitions each: desktop top and lowest tier, the phone stand-in (CPU 6x) on its tier
and the lowest. Every flight is 33-35 frames at 33 ms, none late, the longest 34-40 ms; the page reports
`capped`, frames expected every 29.6-32.7 ms, 0 changes of quality. On the slow-GPU stand-in under the same cap: the
first pull-back waits 1.06-1.12 s for the rest of the bake and then flies 34 frames with none late (longest 34.4 and
36.8 ms); one of the 36 flights there (room to TV, second time, desktop) had 5 of 27 frames late, the longest 58.6 ms,
4 quality changes over 38 s (steps up after the waits, one back down). Logs: `.shots/flights/logs/after-*.log`.

Not done: the after-matrix at 60 and 120 Hz (desktop, phone stand-in, slow-GPU stand-in, the leave at 1 s, 10 s and
after a level, the TV view while the room warms), the before/after on WebKit and on the 30-a-second stand-in, the
headed 120 Hz trace of the fixed build, the whole e2e suite (pinned program counts changed; the first leave is
sometimes asynchronous now), `pnpm report:bundle`, the no-GPU section (the subagent's raw data and screenshots are
in `.shots/flights/nogpu/`, its notes not yet written), the numbers in docs/ROOM.md, AGENTS.md. Scripts to rerun:
`sh .shots/flights/after.sh` then `sh .shots/flights/before.sh` (the second needs `.shots/flights/dist-base`, a
build of 7e4583a).

For whoever picks this up (a relaunch with a fresh context): read this file top to bottom first; then, on mains
power, `pnpm build`, `sh .shots/flights/after.sh`, `sh .shots/flights/before.sh`, read the summaries with
`grep -E "^###|^run|→|quality:|tv while" .shots/flights/logs/after-*.log | grep -v "^  [a-z]*→"`; a headed 120 Hz
trace (`node scripts/perf/flights.mjs --leave 0 --path round --headed --trace t.json --trace-light`, then
`node scripts/perf/flightTrace.mjs t.json`); `E2E_PORT=4391 pnpm e2e` (expect fallout in tests that leave the TV under
a paused clock and in pinned program counts: `e2e/programs.ts` was updated by reasoning, not by a run);
`pnpm report:bundle` (the room chunk grew: check `bundle-budgets.json`); then the numbers into docs/ROOM.md
(§ Flights, § Startup, § Known gaps), an AGENTS.md line for the flight rule, the no-GPU needs-decision above, and
the done line. Open questions worth a look: the two vertex arrays still made in the first flight to the radio; the
ease is unchanged (cubic in and out: at thirty frames a second its largest step in speed is 6-9 % of the top speed,
at sixty 3 %); under the 30-a-second cap on the slow-GPU stand-in the governor stepped up twice and back once in
38 s (its ordinary waits), and one flight of 36 had 5 late frames.
