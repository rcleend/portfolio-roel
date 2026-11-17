# The visit without a GPU: measurements

Measured 17 Nov 2026 on the frozen production build `.shots/flights/dist-base` (built 09:41, before the flight
changes committed after it). Nothing under `src/`, `e2e/`, `docs/`, `index.html` or the existing scripts was edited.

**State of this file: first complete write-up, with three things still owed** (see "Still owed" at the end). The
laptop ran down to 8 % battery during the work; the heavy software-renderer runs were stopped and stay parked until
it is on mains.

**Second round, the same day on mains: the options for software-rendered visitors, measured on the current build.**
It is the next section; everything after it is the first round as it was written, on the older build.

## Options, measured on the fixed build (17 Nov)

Measured 17 Nov 2026, 14:00 to 15:15, on `.shots/flights/nogpu/dist-fixed` (the current build, frozen at 12:35), in
Chrome for Testing 151 headless, 1440 × 900 at device scale 2 unless a row says otherwise, the software renderer by
`--disable-gpu --enable-unsafe-swiftshader` (still the only way to it here: E). Nothing under `src/`, `e2e/`, `docs/`
or `index.html` was edited, nothing committed, no build made.

**The machine was shared and almost no run had it alone.** `foreign.py wait` said `quiet` before every run (after 0
to 315 s, never `NOISY`), and other checkouts' browsers and test runs started inside most runs all the same;
`foreign.py watch` ran beside each run from the second on, and "The runs" below says what it saw. A software
renderer's frame times are the CPU's: a stretch with other jobs on more than about 3 cores is called out, and one run's
frames (C) are not used at all. About 39 minutes of browser time went into it against the 35 aimed for; 14 of them
into waits for the camera that did not end.

### The table

| Option | What the visitor gets | Frames a second: TV with a level / room / computer / radio | CPU cores busy | Waits | Pixels drawn | Pictures (`shots/`) |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Leave it** | the whole site, slowly | **20.7 / 17.1 / 16.4 / 17.7** (two more runs: 20.8 and 18.1 at the TV, 15.4 and 19.6 in the room); a flight is 15–23 frames, its worst frame 141 ms in the first pull-back and 58–92 ms in the other six | 7.0–8.7 in every view, at rest too (the GPU process; 9.1 at most for the whole browser) | game 0.8 s, room ready 5.7 s, **whole room lit 211 s** (242 s in C's run); leaving the TV before that: **31 s, 32 s, about 62 s, 68 s, and three waits that had not ended after 150 s, about 190 s and 385 s**: not bounded | 1200 × 750, 0.90 MP (`low` × 1, pixel ratio 0.833), never changed | `opt-a-swiftshader-{tv-still-title,tv-level,room,pc,radio}-view.jpg`; the wait: `opt-a-early-real-early-leave-waiting-2s-view.jpg` |
| **B. Fewer pixels** | the same room, blockier; the page's own text stays sharp | at 720 × 450 (0.32 MP): **46.5–50.7 / 42.7–44.3**; at 503 × 315 (0.16 MP): **61 / 59**; at 360 × 225 (0.08 MP): 60.6 / 61.3; computer and radio not measured. On the four efficiency cores at 0.32 MP: 3.3 at the TV while the room was lit behind it, the room at rest not reached | 7.3–9.2 at 0.32 MP, 5.8–8.8 at 0.16 MP, 4.0–7.0 at 0.08 MP: fewer pixels buy frames, not CPU, until 60 a second is held | room ready 4.7–5.0 s; leaving the TV at once: 21.5 s and 31 s at 0.32 MP, 2.4 s at 0.16 MP, 3.1 s at 0.08 MP. Efficiency cores: game 3.1 s, room ready 41.7 s, 68 s more to the camera | **30 a second ≈ 0.5 MP, 60 a second ≈ 0.16–0.2 MP** (on twelve M4 cores) | `opt-b-room-crops.jpg` (four pixel counts side by side at the display's pixels), `opt-b-told05-…`, `opt-b-told035-…`, `opt-b-told025-early-leave-room-view.jpg` |
| **C. Cuts instead of flights** | A's room; a move is a fade to black, a cut and a fade back | at rest as A (the TV view before the tour: median frame 42.0 ms against A's 44.8); the tour itself ran on a machine with 7–9 cores taken by other jobs (3–6 fps) and is not a measure of frames | as A | click to the new view fully shown, on that starved machine: **TV → room 0.61 s, room → computer 0.60 s** (room → TV 0.50, computer → room 0.97, room → radio 1.35, radio → room 0.68; the first TV → room 2.17 s); by the code about 0.3–0.4 s after the camera sets off at A's 50 ms frames (not measured clean). Whole room lit 242 s | as A | `opt-c-cuts-{room,pc,radio,tv-level}-view.jpg` |
| **D. The flat television** | the game at full rate in a CSS set; no room | **121** (the headless display's 120; worst frame 14.8 ms), game 60 steps a second | **0.18 + 0.23** (renderer + GPU process) in a level | game running **0.9 s**; 31 requests, 444 kB, no room file | the game's own canvas at a whole-number zoom | `opt-d-flat-level-view.jpg`, `opt-d-flat-load-sheet.jpg` |
| **E. Telling them apart** | nothing by itself: a test the page can make before it chooses a host. `failIfMajorPerformanceCaveat: true` gives null on the software renderer only, and the renderer's name says SwiftShader | — | — | one context asked for | — | — |

D reaches, without a keyboard: the game, the sound toggle, and the e-mail link through the game's menus. Not the
résumé, not the music, not LinkedIn, GitHub or X (below).

Technically viable as measured: D works today behind `?host=flat`, on less than half a core, and lacks the ways to
the résumé and the music. B works on a fast twelve-core CPU, at about 0.5 MP for 30 frames a second or 0.16 MP for
60; on four slow cores the one run made took 42 s to the room and drew 3 frames a second while the rest was lit (at
rest not measured). C shortens every move and changes nothing else. A as it is holds 15 to 21 frames a second with
eight cores busy, and its first wait has no bound. E works as a test.

### A. Leave it

`node scripts/perf/nogpu.mjs --dist .shots/flights/nogpu/dist-fixed --label opt-a-swiftshader --shots … --out …`
(`raw/opt-a-swiftshader.{log,json}`): the visitor stays at the TV until the whole room is lit, plays a level, then
tours room, TV, room, computer, room, radio, room.

- **Tier and scale:** `low` × 1, pixel ratio 0.833, 1200 × 750, from the first frame to the last, in this and every
  other run at this size.
- **Load:** first paint 108 ms, game running 782 ms, room ready 5.74 s (the opening view's bake 3.81 s), whole room
  lit **211.4 s** (156 views, the longest unit of the bake 1.06 s on the GPU). The game's freeze as the bake is made
  is still there: one display frame of 708 ms, the game at 51.6 steps a second over the five seconds of loading.
- **Frames** (room frames; ms on the page's clock):

  | stretch | fps | median ms | p95 ms | worst ms | GPU process cores | other jobs cores |
  | --- | --- | --- | --- | --- | --- | --- |
  | warming: room ready → whole room lit (206 s) | 21.1 | 44.8 | 65.8 | 158.3 | — | 1.8 |
  | TV: title on the still | 20.7 | 49.9 | 58.4 | 83.8 | 7.93 | 2.0 |
  | TV: level (game 59.9 steps a second) | 20.7 | 48.7 | 58.4 | 91.6 | 7.66 | 2.3 |
  | room | 17.1 | 50.5 | 114.7 | 133.5 | 7.68 | **4.4** (not alone: the p95 is theirs) |
  | computer | 16.4 | 58.3 | 91.6 | 100 | 6.98 | 1.5 |
  | radio | 17.7 | 57.9 | 66.4 | 82.7 | 8.67 | 2.0 |

  The two early-leave runs' short tours: room 15.4 and 19.6, TV with a level 20.8 and 18.1.
- **Flights:** TV → room 15 frames (12.8 fps, worst 141 ms, after a 331 ms wait); room → TV 22 (worst 73 ms);
  TV → room again 23 (91 ms); room → computer 20 (92 ms); computer → room 22 (92 ms); room → radio 23 (58 ms);
  radio → room 22 (58 ms). Every frame of every flight is over 33 ms.
- **CPU and memory:** the GPU process 7.0 to 8.7 cores in every stretch, the browser as a whole 8.25 at the median
  and 9.1 at most over the run; 1.07 to 1.37 GB resident in all, JS heap 13 to 20 MB.
- **Looked at:** all five views lit and complete. The monitor in the room view still shows the two-band placeholder
  (it has its wallpaper in B's 60-a-second runs: see B). The radio's five discs have their prints 8.5 s after landing
  (bare silver at that moment in the first round).

**The early leaver.** "Explore the room" is not there to click when the room is ready: the pill rises once a press
has begun the game. Two runs:

- *The probe's click on the hidden pill the moment the room is ready* (`--early-leave`, `raw/opt-a-early.*`): the
  camera set off **32.0 s** after the click. The page meanwhile: the startup still stays, with the boot logo frozen
  on it (the game is paused: frame 279 for the whole wait), **no PAUSE** (the still covers the room's TV, which is
  what draws it), no `aria-busy`, the pill hidden (`opt-a-early-early-leave-waiting-2s-view.jpg`). No visitor can do
  this; it is what `flightProbe.js`'s `leaveAfterMs` and `flights.mjs` do.
- *What a visitor can do* (`--early-leave --real-click`, `raw/opt-a-early-real.*`, not alone): the page's mouse
  pressed on the screen until the pill had risen (two presses, 0.78 s after the room was ready) and clicked it. The
  camera set off **31.3 s** later (first moved frame at 31.45 s). The page meanwhile, at 0.4, 2, 6, 15 and 30 s: the
  live room, the game's title frozen with the green **II PAUSE** over its logo, the pill still reading "Explore the
  room" as before the click, no `aria-busy`, nothing else (`opt-a-early-real-early-leave-waiting-2s-view.jpg`). The
  room's frames stand for the first 1.5 s (one frame of 1525 ms), then come at 18.5 a second.

**The wait is not bounded.** Nothing in the code ends it (`createRoom.ts › preflight` awaits
`GeneratedRoom.whenWhole()`, which has no deadline; `HURRY_HOLD_MS` bounds only how long the frames stand still),
and it was measured, every time from a click at or within a second of the room being ready unless said:

| run | pixels | the camera set off after | the machine |
| --- | --- | --- | --- |
| `opt-a-early` | 0.90 MP | 32.0 s | other jobs 2.7 cores, alone during the wait |
| `opt-a-early-real` | 0.90 MP | 31.3 s | not alone, other jobs 2.0 |
| `opt-c-cuts-after-landing` | 0.90 MP | **not within 60 s** (the watch ended; the room was whole 62.2 s after the click) | nearly alone, other jobs 0.7 |
| `opt-a-early-busy-never-left` | 0.90 MP | **not within 150 s** (half the bake's views done, one unit of it 30.9 s on the GPU) | not alone, other jobs 3.5 |
| `opt-c-cuts-context-never-left` (page loaded with reduced motion) | 0.90 MP | **not within about 190 s** (killed by me; nothing recorded but the log) | not watched |
| `opt-b-dsf1-quick-killed` (`--quick`: left 9.5 s after ready, a level running) | 0.90 MP | **not within 385 s** (killed by its time limit; nothing recorded but the log) | not alone, light jobs |
| `opt-b-720x450` | 0.73 MP | 68.3 s | not alone, other jobs 2.3 |
| `opt-b-dsf05`, `opt-b-told05` | 0.32 MP | 31.1 s, 21.5 s | other jobs 1.2–1.6 |
| `opt-b-told035`, `opt-b-told025` | 0.16, 0.08 MP | 2.4 s, 3.1 s | nearly alone |
| `opt-b-ecores` (efficiency cores) | 0.32 MP | 68.7 s (and 41.7 s to the room before it) | not alone, other jobs 1.7 |

Why the same click costs 31 s one time and several minutes another was not found; the load of the machine is not
the whole of it (62 s with the machine nearly free). The bake's hurried units are long on this renderer (3 to 31 s
each on the GPU where the unhurried ones are 1 s), which is where to look.

### B. A lighter software tier: frame time against pixels

The first try was `nogpu.mjs --quick` at 1440 × 900 with device scale 1, and it is the run above that never landed
in 385 s. The runs after it leave the TV the moment the room is ready instead (`--early-leave`), then measure the
room at rest, a level at the TV, and three flights. `--dpr 0.5` (new) tells the page the display's pixel ratio is
0.5 while the display stays at 2: the room then draws 720 × 450 and the browser scales it up to 2880 × 1800, which
is what a lighter tier would be on a visitor's screen. `raw/opt-b-*.{log,json}`, table by
`node scripts/perf/nogpuPixels.mjs` (`raw/opt-tables-pixels.md`).

| run | drawing buffer | MP | TV with a level: fps (median ms) | room: fps (median ms) | flights: fps, worst frame | GPU process cores (TV / room) | other jobs cores |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A, 1440 × 900 @ 2 | 1200 × 750 | 0.90 | 20.7 (48.7) | 17.1 (50.5) | 17.6–20.7, 58–92 ms | 7.7 / 7.7 | 2.3 / 4.4 |
| 720 × 450 @ 2 (`opt-b-720x450`, not alone) | 1080 × 675 | 0.73 | 19.8 (48.2) | 19.5 (48.1) | 19.0–23.5, 57–80 ms | 6.4 / 7.5 | 2.9 / 2.6 |
| 1440 × 900 @ 0.5 (`opt-b-dsf05`) | 720 × 450 | 0.32 | 50.7 (21.1) | 44.3 (22.9) | 50.3–51.7, 25–26 ms | 8.1 / 9.2 | 0.9 / 1.5 |
| 1440 × 900 @ 2, told 0.5 (`opt-b-told05`) | 720 × 450 | 0.32 | 46.5 (24.2) | 42.7 (23.5) | 45.1–48.3, 33–34 ms | 7.3 / 8.9 | 2.2 / 1.7 |
| @ 2, told 0.35 (`opt-b-told035`) | 503 × 315 | 0.16 | 61.0 (16.2) | 59.0 (16.4) | 53.8–60.4, 24–28 ms | 5.8 / 8.8 | 1.6 / 1.0 |
| @ 2, told 0.25 (`opt-b-told025`) | 360 × 225 | 0.08 | 60.6 (16.6) | 61.3 (16.3) | 60.0–62.1, 17.5 ms | 4.0 / 7.0 | 2.0 / 1.3 |

(Flights: the two made once the room was whole. The first pull-back of each run has a frame of 40 to 108 ms.)

- **The frame is nearly all pixels.** A line through the 0.90 MP and 0.32 MP runs (least squares on the mean
  interval): room 3.2 ms + 61 ms a megapixel, TV with a level 3.8 ms + 52 ms a megapixel. That puts **30 frames a
  second at 0.49–0.57 MP** (about 890 × 556 for this window: between the `low` tier's scales 0.85 and 0.7) and 60 at
  0.22–0.25 MP.
  Measured, **60 is held at 0.16 MP** (503 × 315) with the GPU process at 8.8 cores in the room view, so with nothing
  to spare, and at 0.08 MP with four to seven. The 0.73 MP run does not sit on the line (48 ms where it says 44–48):
  it shared the machine.
- **The 0.32 MP of these runs is `low` × 0.6**, the floor the governor already has (`QUALITY_SCALES`) and never
  uses here, because a software renderer's quality is fixed (`quality.ts`): 720 × 450 for this window, 43 to 51
  frames a second on this machine.
- **The scaling up costs little:** the same 720 × 450 on a 0.32 MP page and on a 5.2 MP one differ by 1 to 3 ms a
  frame (22.9 against 23.5 in the room, 21.1 against 24.2 at the TV).
- **What it looks like** (`opt-b-room-crops.jpg`, the desk and the posters at the display's own pixels): at 0.32 MP
  the room reads as the same room, soft, poster titles legible and their small print not; at 0.16 MP edges are steps
  the width of a blind's slat and only the largest poster type reads; at 0.08 MP it is a mosaic. The page's own text
  (menu, labels, the résumé) is as sharp as ever at every size.
- **At 60 frames a second the idle work gets done:** in the 0.16 and 0.08 MP runs the monitor has its wallpaper and
  the radio its "Music" label 1.5 s after landing, where the 0.90 and 0.32 MP runs show the placeholder and no label.
  That is the first round's guess (idle work starved by frames that are always late) seen from the other side.
- **A slower CPU** (`opt-b-ecores`: every process of the browser on the four efficiency cores by `taskpolicy -b`,
  told 0.5, not alone): first paint 300 ms, game running 3.1 s, **room ready 41.7 s** (the game on the still at 8.4
  frames and 41.6 steps a second meanwhile, one frame of 3.9 s), then **3.3 frames a second at the TV** (median
  293 ms) for the 68 s the rest of the room took. The room at rest was not reached: the watch ended at 60 s and the
  camera left at 68.7 s. The browser had 2.6 cores in all. So the pixel count that gives this machine 45 frames a
  second gives four slow cores 3 while the room is lit; what they get at rest is not measured.
- Each frame time here is a multiple of the headless display's 8.3 ms. On a 60 Hz screen a frame that misses 16.7 ms
  waits for 33.3 (inferred: no 60 Hz display was run), so "60" needs the frame under 16.7 ms every time, which
  0.16 MP did for nine frames in ten in the room.

### C. Cuts instead of flights

`nogpu.mjs --reduced-motion` (Playwright's `reducedMotion: 'reduce'` on the context), the whole visit
(`raw/opt-c-cuts.*`). **Its tour ran while other jobs took 6.7 to 8.9 cores** (the browser got 2.4; 3 to 6 frames a
second), so its frames at rest and its times are a starved machine's:

| move | wait before the camera set off | click → the cut (the frame drawn from the new place, black) | click → the new view fully shown |
| --- | --- | --- | --- |
| TV → room, the first | 512 ms | 779 ms | 2172 ms |
| room → TV | 125 ms | 263 ms | 500 ms |
| **TV → room** | 0 ms | 351 ms | **609 ms** |
| **room → computer** | 212 ms | 417 ms | **596 ms** |
| computer → room | 545 ms | 795 ms | 971 ms |
| room → radio (the black holds for the device) | 596 ms | 988 ms | 1348 ms |
| radio → room | 137 ms | 325 ms | 675 ms |

- Every move is one change of the camera, as a cut should be (the flights of A are 15 to 23).
- By the code a cut is 140 ms of fade, the cut, 140 ms of fade back (`CameraRig.ts › REDUCED_FADE_MS`): at A's
  50 ms frames three frames each way, about 0.3 to 0.4 s after the camera sets off, against 1.15 to 1.2 s for a
  flight. **Not measured on a free machine:** the second attempt (`--early-leave --reduce-after-landing`, which
  switches reduced motion on once in the room) lost its minute to the early leaver's wait.
- **Frames at rest:** the TV view over the 237 s before the tour, median 42.0 ms a frame against A's 44.8 (17.4
  against 21.1 a second by the mean: other jobs took 5 cores in its first minute). Unchanged, as it must be: the
  same frames are drawn. The room and the computer at rest in this run (2.7 and 4.1 a second) are the starved
  machine's.
- **A page loaded with reduced motion:** first paint 76 ms, game running 143 ms (the tube does not animate on),
  room ready 5.0 s, whole room lit 242 s. And an early leaver there had not left after about 190 s (above).
- Looked at: `opt-c-cuts-{room,pc,radio,tv-level}-view.jpg` are A's views.

### D. The flat television for software-rendered visitors

`nogpuFlat.mjs --args "--disable-gpu --enable-unsafe-swiftshader" --query '&host=flat'` (`raw/opt-d-flat.*`, alone
throughout). WebGL 2 was to be had and was not asked for.

- **Load:** first paint 80 ms, the flat host mounted at 135 ms, **game running at 908 ms**; 31 requests, 444 kB, no
  room file; at the end no animation running, the still hidden, no canvas of the room.
- **Frames:** 122.4 a second at the title and 121.3 in a level (median 8.2 ms, worst 14.8, none over 20 ms; 972
  frames), the game at 60.0 steps a second. **Cores:** renderer 0.18 + GPU process 0.23 in a level (0.03 + 0.22 at
  the title). 1.19 GB resident, JS heap 9.7 MB.
- Picture: `opt-d-flat-level-view.jpg`.

**What a mouse or a finger reaches, by trying** (`node scripts/perf/nogpuReach.mjs`, new: desktop with the page's
mouse, `--device phone` with touches that last 90 ms; `raw/opt-d-reach-{mouse,touch,touch-pad}.*`):

- A pointer can land on two things that act: the screen and the sound toggle; on a phone also the touch pad once the
  game has begun. Everything else on top anywhere on the page (the set's body, its panel, REO·LEO, MVS-1996, the
  knobs, POWER, the page around it) was clicked or tapped, and with the mouse double-clicked and right-clicked:
  nothing changed (no hash, no résumé, no tab, no navigation, no audio file asked for).
- The page does not scroll: the document is as tall as the window (900 of 900 px, 844 of 844 on the phone); a wheel
  and a swipe moved nothing.
- **Résumé: no way.** It and "Skip to résumé" are in the page and clipped away until the keyboard's focus or
  `#resume` in the address shows them.
- **Music: no way** (nor with a keyboard): no player, no media element, and no file under `/audio/` was asked of the
  server in any of the runs.
- **E-mail: yes, through the game.** Mouse: a click on the title, a click on the character's card, a click on the
  last card of the mission select: the site's `mailto:` link (`emailLink` in `src/content/profile.ts`; caught and cancelled in the page's `navigate` event,
  so no mail client opened). Finger: a tap on the title, the pad's START at the character, a tap on the last card
  and the pad's A: the same link. Taps on the cards alone do nothing there (120 tried, across the cards' rows; the
  panel's CONTACT button and the CONFIRM hint below were not tapped): a finger's lift takes the pointer off the
  screen before the game reads the release (`PointerState.leave`), so a tap picks a card and the pad acts on it. The
  address itself is printed on that screen once the card is picked (`opt-d-reach-touch-pad-level-select-after-view.jpg`).
- **LinkedIn, GitHub, the paper, the credits: no way** (they are the résumé's links). **X: nowhere** in the flat
  host.
- **Missing, then, for a visitor with a mouse or a finger:** the résumé; the music; LinkedIn, GitHub and X; and any
  word that they exist (the hint under the set names the game's keys and nothing else).

### E. Telling them apart

`nogpuProbe.mjs` on `dist-fixed` (`raw/opt-probe.jsonl`), each context asked for on a bare page of the site's origin:

| Launched with | `getContext('webgl2')` | `getContext('webgl2', { failIfMajorPerformanceCaveat: true })` | unmasked renderer | host, quality |
| --- | --- | --- | --- | --- |
| `--disable-gpu --enable-unsafe-swiftshader` | a context | **null** | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)` | room, `low` × 1, ready in 4.9 s |
| nothing (hardware) | a context | **a context** | `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)` | room, `high` × 1, ready in 1.2 s |
| `--disable-gpu` | null | null | — (`GL_VENDOR = Disabled`) | flat, game running in 1.0 s |

So yes: of the two browsers that give WebGL, the caveat flag refuses only the software one, and the name read off an
ordinary context says which it is (`softwareGpu.ts` matches it). The first round found one launch where the flag
does not tell (`--use-angle=swiftshader`: SwiftShader and the flag granted); the name tells there too. Not repeated
on this build: that launch, Chrome 157, and any other platform.

### Against the first round

- **Fewer pixels buy more than the first round thought.** It read 0.74 MP against 0.90 MP as "18 % fewer pixels
  bought 10–20 %; the frame is not all fill". Measured over a wider range the frame is 3 to 4 ms fixed and the rest
  in proportion to pixels: a third of the pixels, 2.3 times the frames.
- **The early leaver:** the fixed build does pause the game and shows PAUSE, once a real press has handed the still
  over; the wait itself is as it was (27 to 222 s and one that had not ended at 177 s then; 31 to 68 s and three that had
  not ended at 150, 190 and 385 s now).
- **The whole room** took 211 and 242 s (175 to 190 s then).
- **The radio's discs** have their prints 8.5 s after landing (bare until about 20 s then).
- **The game's link-out** in the flat host, read from the source then, was clicked now and works with a mouse, and
  with a finger only through the pad.
- The probe reports `navigator.webdriver` true in these launches (the first round wrote false). On a software
  renderer the quality is fixed either way (`quality.ts`), so nothing here depends on it.
- Unchanged: no WebGL at all with `--disable-gpu` alone and the flat host there; SwiftShader only with the flag;
  `low` × 1 throughout; 15 to 21 frames a second with seven to nine cores busy; the 0.7 s freeze as the bake is
  made; the monitor's placeholder; no mouse or touch way to the résumé or the music in the flat host.

### The runs

| run (`raw/…`) | what | other measurements alive (`foreign.py watch`) | other jobs, cores (median / most) |
| --- | --- | --- | --- |
| `opt-probe.jsonl` | E, three launches of seconds each | not watched | — |
| `opt-a-swiftshader` | A, the whole visit | not watched | 1.8 / 5.4 (4.4 in the room stretch) |
| `opt-a-early` | A, the probe's early leave | 5 of 42 samples, all in the tour after the wait | 2.7 / 6.5 |
| `opt-a-early-real` | A, a real click | **38 of 42** | 2.0 / 4.1 |
| `opt-b-dsf1-quick-killed` | B, `--quick` at device scale 1: never landed, killed at 400 s | **243 of 259** | not sampled |
| `opt-b-dsf05` | B, 0.32 MP | **20 of 40** | 1.2 / 2.3 |
| `opt-b-told05` | B, 0.32 MP on a 2× display | **18 of 34** | 1.6 / 2.8 |
| `opt-b-told025` | B, 0.08 MP | 2 of 21 | 1.6 / 2.5 |
| `opt-b-720x450` | B, 0.73 MP | **48 of 63** | 2.3 / 5.7 |
| `opt-c-cuts-context-never-left` | C, an early leave under reduced motion: never left, killed | lost with the run | — |
| `opt-a-early-busy-never-left` | an early leave that had not left at 150 s | **69 of 105** | 3.5 / 6.6 |
| `opt-d-flat` | D | **alone throughout** | — |
| `opt-d-reach-mouse`, `-touch`, `-touch-pad` | D, what can be reached (not a timing) | 14 of 25, 28 of 54, 5 of 54 | — |
| `opt-c-cuts` | C, the whole visit under reduced motion | **128 of 197** | 2.4 / 10.3 (6.7–8.9 during the tour: frames not used) |
| `opt-b-told035` | B, 0.16 MP | 3 of 21 | 1.1 / 1.8 |
| `opt-c-cuts-after-landing` | C again: the camera had not left at 60 s | 4 of 46 | 0.7 / 2.3 |
| `opt-b-ecores` | B on the efficiency cores | **42 of 74** | 1.7 / 2.5 |

New and changed drivers: `scripts/perf/nogpu.mjs` (`--dpr`, `--reduced-motion`, `--reduce-after-landing`, `--pc`
with `--early-leave`, `--real-click`, `--leave-after`, `--moments`, `--wait-cap`, progress on stderr, and a wait
that outlasts its cap is reported instead of failing the run), `scripts/perf/nogpuReach.mjs` (new),
`scripts/perf/nogpuPixels.mjs` (new). The runs were started by `.shots/flights/nogpu/opt-run.sh` (the wait for a
quiet machine, a time limit, the watch) from `opt-batch-{b,d,e}.sh`.

### Verified by running, inferred, and cut

Verified by running: every number in the tables above; tier and scale; the three launches of E; the PAUSE on the
TV during a real early leaver's wait and its absence after the probe's click; every picture named (looked at); the
flat host's frames, cores and requests on the software-WebGL browser; each click, tap, wheel and swipe of D and the
`mailto:` they end in.

Inferred: that nothing bounds the early leaver's wait (read in `createRoom.ts` and `GeneratedRoom.ts`; seen as three
waits that did not end, none followed to its end); a cut's length on a free machine (from `REDUCED_FADE_MS` and A's
frame times); why taps on the mission cards do nothing (`PointerState.ts`, seen as 120 taps without effect); that
the monitor's wallpaper and the radio's label wait for idle time; what a 60 Hz display does with these frame times;
which pixel count a tier would need on other machines.

Cut, or lost: `--quick` at device scale 1 (its one run never landed; it draws A's 1200 × 750, and what it would
have added, the cost of the page's own surface, came from the two 0.32 MP runs); the cuts on a free machine; the
room at rest on the efficiency cores; a picture at 0.5 MP (the 30-a-second candidate was not run: the line puts it
between the 0.32 and 0.90 MP pictures); the computer and the radio at fewer pixels; a trace of the frames presented.

## How it was measured

- Machine: Apple M4 Pro (12 cores: 8 performance, 4 efficiency), 24 GB. Shared with other agents' jobs during every
  run; each run records what else the machine was doing (the "other jobs" column: cores kept busy by everything that
  is not the browser under test). Runs with other jobs above about 3 cores are called out.
- Browsers: Chrome for Testing 151.0.7922.34 (Playwright's) and the installed Google Chrome 157.0.8103.79, both
  headless, each in a new temporary profile. Headless Chrome for Testing gives a page 120 frames a second here (the
  built-in display's rate); headless Chrome 157 gives 60.
- **Playwright adds `--enable-unsafe-swiftshader` to every Chromium it launches on macOS** (playwright-core 1.62.1,
  `chromium.ts › _innerDefaultArgs`). That is why `PERF_CHROME_ARGS="--disable-gpu" node scripts/perf/flights.mjs` and
  the e2e suite get software WebGL where a visitor's browser gets none. The drivers here take the flag out unless it
  is asked for by name.
- **Chrome's Energy Saver caps every page at 30 frames a second on battery at 20 % or less.** Proven: a blank page
  in headless Chrome for Testing got 30 fps (33.3 ms) with the laptop at 14 %, and 121 fps (8.3 ms) with
  `{"performance_tuning":{"battery_saver_mode":{"state":0}}}` in the profile's `Local State`;
  `--disable-features=BatterySaverModeAvailable` does not lift it. Three reference runs and one flat run taken under
  the cap are discarded below (named where they would have appeared). `nogpuLib.mjs › launch` now always switches it
  off; `node scripts/perf/nogpuRate.mjs` prints the bare frame rate in four seconds.
- Frame intervals are on the page's clock (`requestAnimationFrame` timestamps, `scripts/perf/flightProbe.js`): a
  "room" frame is a display frame in which WebGL drew, a "display" frame any frame the page was given. Under software
  WebGL the two are the same frames. That these are also the frames presented was **not** checked with a trace; what
  supports it is that the GPU process holds 8 to 9.5 cores busy in every stretch (it is the limit, not the page).
- The game's speed is its own clock: fixed steps a second from `__arcade.state().frame` (60 is full speed; it catches
  up to five steps a frame, so it keeps full speed down to 12 frames a second and slows below that).

New files (all under `scripts/perf/`): `nogpuLib.mjs` (serving, launching, statistics, the machine sampler),
`nogpuProbe.mjs` (which WebGL a set of flags gives, and which host), `nogpu.mjs` (the whole visit),
`nogpuFlat.mjs` (the visit when WebGL is refused or the room fails), `nogpuRadio.mjs` and `nogpuWait.mjs` (two
focused checks), `nogpuRate.mjs` (the bare frame rate), `nogpuReport.mjs` (tables from the JSON). Raw results:
`.shots/flights/nogpu/raw/`. Screenshots: `.shots/flights/nogpu/shots/` (`*-view.jpg` are 1280 px copies).
`.shots/flights/nogpu/probes/` holds the committed `flightProbe.js` and `glProfiler.js` as they were when the work
began, because the working tree's were being edited.

## Case a: hardware acceleration switched off

### What a visitor actually gets (verified by running, both browsers)

`node scripts/perf/nogpuProbe.mjs --dist .shots/flights/dist-base --browser cft|chrome --args "…"`; results in
`raw/probe.jsonl`. Identical in Chrome for Testing 151 and Google Chrome 157:

| Launched with | WebGL 2 / WebGL 1 | chrome://gpu says | Host the site shows | Room quality |
| --- | --- | --- | --- | --- |
| nothing (the reference) | Metal (`ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)`) | webgl enabled | room, ready 0.6 s | high × 1 |
| `--disable-gpu` | **refused** (`GL_VENDOR = Disabled`) | webgl `disabled_off`, compositing and 2D canvas `disabled_software` | **flat**, game running at 0.9 s | — |
| the settings switch itself (`hardware_acceleration_mode.enabled = false` in Local State, no flag) | **refused** | the same | **flat** | — |
| `--disable-gpu --disable-software-rasterizer` | refused | the same | flat | — |
| `--disable-3d-apis` | refused | webgl "enabled" (the API is off, not the GPU) | flat | — |
| `--disable-gpu --enable-unsafe-swiftshader` | **SwiftShader** (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`) | webgl `unavailable_software`, compositing `disabled_software` | room, ready 5 s | low × 1 |
| `--use-gl=angle --use-angle=swiftshader` (with or without the unsafe flag) | SwiftShader, and the compositor on it too | webgl "enabled" | room, ready 10 s | low × 1 |
| `--enable-unsafe-swiftshader` alone | Metal | webgl enabled | room | high × 1 |

So: **a visitor who switches hardware acceleration off in Chrome 151 or 157 on a Mac gets no WebGL at all and lands
on the flat television (case b). Software WebGL is not what they get.** It runs only with
`--enable-unsafe-swiftshader` (or the enterprise policy of the same name), or when SwiftShader is asked for as the GL
driver, which is a test configuration. Chromium's "Intent to Remove: SwiftShader Fallback" says the automatic fallback
was deprecated from Chrome 130 with removal planned for desktop 137, and that the devices affected are "primarily
older Windows devices"; a console line in the runs above still reads "Automatic fallback to software WebGL has been
deprecated". **Not verified here:** Chrome on Windows or Linux (whether anything else stands in there), Firefox, and
older Chromes still in use, any of which may hand the page a software renderer. `softwareGpu.ts` also matches
`llvmpipe`, `softpipe` and `basic render` (WARP), none of which could be produced on this Mac.

A context asked for with `failIfMajorPerformanceCaveat: true` is refused under
`--disable-gpu --enable-unsafe-swiftshader` (both browsers), and granted under `--use-angle=swiftshader`. The app
never asks with it (`chooseHost.ts › detectWebGL`, `RoomStage.ts`: `powerPreference: 'high-performance'` only).

### Software WebGL where it does run: the whole visit

`node scripts/perf/nogpu.mjs --dist .shots/flights/dist-base --label … --args "--disable-gpu --enable-unsafe-swiftshader" [--device phone] --probes .shots/flights/nogpu/probes --shots … --out …`,
Chrome for Testing 151, no CPU throttling. Desktop is 1440 × 900 at device scale 2, phone 390 × 844 at 3 (the
viewport and its pixels only: the CPU is the M4's). The visitor stays on the title until the whole room is lit, plays
a level, then tours room, TV, room, computer, room, radio, room.

Load (ms unless marked s). The reference is the same driver on Metal.

| run | renderer | tier × scale, drawing buffer | first paint | first contentful paint | game running | room ready (s) | opening view bake (s) | whole room lit (s) | other jobs (cores, median/max) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop, run 2 | SwiftShader | low × 1, 1200×750 (pixel ratio 0.833) | 48 | 132 | 608 | 5.22 | 3.47 | 174.7 | 1.6 / 3.1 |
| desktop, load only 1 | SwiftShader | low × 1, 1200×750 | 48 | 128 | 628 | 5.12 | 3.36 | 189.8 | — |
| desktop, load only 2 | SwiftShader | low × 1, 1200×750 | 56 | 140 | 623 | 5.16 | 3.42 | 175.8 | — |
| desktop, run 1 (machine busy at the start) | SwiftShader | low × 1, 1200×750 | 104 | 236 | 1724 | 37.2 | 31.7 | 216.9 | not sampled |
| phone | SwiftShader | low × 1, 585×1266 (pixel ratio 1.5) | 56 | 132 | 601 | 4.91 | 3.43 | **292.9** | 1.8 / 3.6 |
| desktop, Metal | Metal | high × 1, 2190×1369 | 88 | 196 | 504 | 0.60 | 0.11 | 1.38 | — |

- **Tier and scale: `low` × 1 from the first frame to the last, in every software run**, desktop and phone, with
  `navigator.webdriver` false (so the governor was free to act, and did not): the docs' "starts on the lowest tier
  and stays there" holds. Pixel ratio 0.833 on the desktop (the 0.9 MP cap), 1.5 on the phone (0.74 MP).
- **The bake.** `generatedStats`: 156 views, the opening view lit in 3.4 to 3.5 s (0.11 s on Metal), main-thread
  time 35 to 80 ms in all. The rest of the room takes **170 to 190 s on the desktop and 288 s at the phone's size
  while the visitor stays at the TV**, against 0.9 s on Metal. Cause, read from `gen/bake/pace.ts` at the build's
  commit: behind the room's frames the bake gives way whenever a frame is later than 20 ms, down to an eighth of a
  unit with up to 100 ms of rest between units, and under SwiftShader every frame is late.
- **One freeze of 0.7 s in the game as it starts**, in every software run: a single main-thread task of 685 to
  759 ms between the bake's marks `wired` (≈ 650 ms) and `baker` (≈ 1400 ms), that is, making the bake (41 ms on
  Metal). The game began at 0.6 s, so it stands still from about 0.65 to 1.4 s; its clock ran at 50.6 to 53.3 steps
  a second over the 4.5 s of loading because of it. Apart from that the game on the still gets 105 to 110 frames a
  second while the room loads (median 7.9 ms, 99 % within 20 ms).
- **Leaving the TV as soon as the room is handed out** (`--early-leave`, and `flights.mjs` with
  `PERF_CHROME_ARGS="--disable-gpu"`): the camera sets off only when the whole room is lit, and that took **27 s,
  66 s, 92 s (machine busy) and 222 s in four runs; in a fifth it had not left 177 s after the click** when the
  watch ended (`nogpuWait.mjs`: still at the TV, `generated: 'opening'`). In this build nothing on the page says the
  click was taken: the view stays `tv`, the game is not paused and goes on at 60 steps a second, no `aria-busy`, the
  way-out pill unchanged (`raw/early-swiftshader-desktop-1.log`, last lines). Read from the source at the build's
  commit: the hold that gives the bake the GPU lasts `HURRY_HOLD_MS` = 1.5 s, after which the TV's frames come back
  and the hurried bake queues behind each 40 ms frame. (The commits made after the build pause the game at the
  click; not measured here.)

Stretches of the visit (room frames; before the room is in, the display's):

| run | stretch | s | fps | median ms | p95 ms | worst ms | > 20 ms % | > 33 ms % | > 50 ms % | game steps/s | main thread ms/frame | GPU process cores | other jobs cores |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SwiftShader desktop | loading: game running → room ready | 4.6 | 105.4 | 7.9 | 8.8 | 752.5 | 0.8 | 0.8 | 0.6 | 50.6 | 0 | — | 2.09 |
| SwiftShader desktop | warming: room ready → whole room lit | 169.5 | 22.4 | 44 | 54.1 | 104.1 | 100 | 99.7 | 14.8 | 60 | 0.6 | — | 1.73 |
| SwiftShader desktop | tv: title on the still | 3.1 | 22.4 | 45.1 | 55.6 | 63 | 100 | 100 | 14.7 | 59.9 | 0.6 | 8.27 | 1.33 |
| SwiftShader desktop | tv: level | 6.1 | 21.9 | 45.8 | 54.2 | 67.7 | 100 | 100 | 19.7 | 59.8 | 3.2 | 7.89 | 1.28 |
| SwiftShader desktop | room | 5.1 | 19 | 53 | 62.4 | 110.8 | 100 | 100 | 66.3 | — | 0.3 | 8.69 | 1.12 |
| SwiftShader desktop | pc | 5.1 | 17.1 | 58.3 | 73.9 | 117.4 | 96.5 | 96.5 | 92.9 | — | 0.2 | 7.13 | 1.22 |
| SwiftShader desktop | radio | 5.1 | 20.2 | 50.1 | 58 | 80 | 100 | 100 | 51.5 | — | 0.2 | 9.53 | 0.87 |
| SwiftShader phone | loading: game running → room ready | 4.3 | 110.2 | 7.8 | 9 | 536.4 | 0.8 | 0.6 | 0.2 | 53.3 | 0 | — | 2.17 |
| SwiftShader phone | warming: room ready → whole room lit | 288 | 23.6 | 41.7 | 50.1 | 141.6 | 100 | 98.2 | 6.4 | 59.9 | 0.6 | — | 1.83 |
| SwiftShader phone | tv: title on the still | 3 | 26.3 | 40.4 | 44.9 | 55 | 100 | 67.1 | 2.5 | 60.2 | 0.6 | 8.79 | 0.86 |
| SwiftShader phone | tv: level | 6.1 | 24.5 | 41 | 49.4 | 72.4 | 100 | 85.1 | 3.4 | 60 | 1.7 | 8.26 | 0.83 |
| SwiftShader phone | room | 5.1 | 23.7 | 41.2 | 49.7 | 66 | 100 | 95 | 4.2 | — | 0.2 | 8.76 | 2.04 |
| SwiftShader phone | pc | 5.1 | 23.1 | 40.7 | 49.2 | 97.7 | 100 | 95.7 | 3.4 | — | 0.2 | 8.35 | 2.01 |
| SwiftShader phone | radio | 5 | 21.4 | 48.6 | 52.2 | 76.4 | 100 | 100 | 11.2 | — | 0.2 | 8.95 | 1.65 |
| Metal desktop | tv: title on the still | 3 | 60 | 16.7 | 17.2 | 17.7 | 0 | 0 | 0 | 59.6 | 0.2 | 0.2 | — |
| Metal desktop | tv: level | 6 | 60 | 16.7 | 17.4 | 17.6 | 0 | 0 | 0 | 60 | 0.4 | 0.19 | — |
| Metal desktop | room | 5 | 84.8 | 13.2 | 16.7 | 17.6 | 0 | 0 | 0 | — | 0.3 | 0.18 | — |
| Metal desktop | pc | 5 | 65.6 | 15.2 | 17.1 | 23 | 0.9 | 0 | 0 | — | 0.1 | 0.11 | — |
| Metal desktop | radio | 5 | 64.5 | 15.8 | 17.3 | 20.1 | 0.3 | 0 | 0 | — | 0.1 | 0.07 | — |

(The first desktop software run, with the machine busy only at its start, gave the same once loaded: level 22.8 fps,
room 18.8, pc 18.0, radio 19.6; `raw/visit-swiftshader-desktop.log`.)

Flights (the frames the camera moved in; the first is the first pull-back, made after the whole room was lit):

| run | flight | frames | fps | median ms | worst ms | > 20 ms % | > 33 ms % | > 50 ms % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SwiftShader desktop | tv→room #1 | 19 | 16.9 | 45.8 | 193.9 | 100 | 100 | 36.8 |
| SwiftShader desktop | room→tv | 22 | 19.5 | 50.1 | 66.8 | 100 | 100 | 50 |
| SwiftShader desktop | tv→room #2 | 23 | 20.3 | 50 | 81.4 | 100 | 100 | 47.8 |
| SwiftShader desktop | room→pc | 18 | 16.4 | 62.1 | 86.9 | 100 | 100 | 77.8 |
| SwiftShader desktop | pc→room | 23 | 20.3 | 46.3 | 90 | 100 | 100 | 34.8 |
| SwiftShader desktop | room→radio | 21 | 19 | 50.6 | 90.6 | 100 | 100 | 66.7 |
| SwiftShader desktop | radio→room | 23 | 20.9 | 47.9 | 72.9 | 100 | 100 | 26.1 |
| SwiftShader phone | tv→room #1 | 22 | 19.9 | 41.2 | 189.4 | 100 | 86.4 | 22.7 |
| SwiftShader phone | room→tv | 27 | 24.3 | 41.1 | 50.6 | 100 | 92.6 | 3.7 |
| SwiftShader phone | tv→room #2 | 28 | 24.9 | 41 | 49.3 | 100 | 82.1 | 0 |
| SwiftShader phone | room→pc | 22 | 19.5 | 49.2 | 129.3 | 100 | 100 | 13.6 |
| SwiftShader phone | pc→room | 25 | 22.4 | 42.6 | 52.1 | 100 | 100 | 8 |
| SwiftShader phone | room→radio | 25 | 22.4 | 41.9 | 56.8 | 100 | 100 | 8 |
| SwiftShader phone | radio→room | 24 | 21.9 | 46.4 | 73.7 | 100 | 100 | 8.3 |
| Metal desktop | tv→room #1 | 126 | 114.6 | 8.3 | 57.4 | 0.8 | 0.8 | 0.8 |
| Metal desktop | the other six | 144–150 | 130–137 | 7.5–7.9 | 9–13.9 | 0 | 0 | 0 |

A 1.1 s flight is 18 to 28 frames on the software renderer; the first pull-back has one frame of 190 ms in it on
both sizes. `flights.mjs` itself, leaving at once (`raw/flights-desktop-swiftshader.log`): 15 to 23 frames a flight,
worst 61 to 204 ms, every frame over 20 ms.

Memory (MB; resident size from `ps`, which on Metal does not count what lives on the GPU):

| run | where | JS heap used / total | renderer | GPU process | all processes |
| --- | --- | --- | --- | --- | --- |
| SwiftShader desktop | tv, whole room lit | 12.4 / 14.9 | 321 | 251 | 887 |
| SwiftShader desktop | tv, level | 15 / 21 | 446 | 264 | 1120 |
| SwiftShader desktop | room | 17.1 / 27 | 469 | 280 | 1159 |
| SwiftShader desktop | pc | 17.9 / 22.5 | 497 | 309 | 1217 |
| SwiftShader desktop | radio | 19.1 / 23.1 | 485 | 292 | 1188 |
| SwiftShader phone | tv, level | 15.8 / 21.8 | 401 | 263 | 1067 |
| SwiftShader phone | pc | 17.6 / 21.4 | 491 | 304 | 1201 |
| Metal desktop | tv, level | 13.2 / 28.3 | 550 | 261 | 1277 |
| Metal desktop | room | 20.3 / 32.8 | 357 | 200 | 967 |
| flat, `--disable-gpu` | level | 8.8 / 15.7 | 425 | 154 | 1040 |

The JS heap is 12 to 21 MB everywhere. The software renderer does not cost more memory than Metal by this measure;
what it costs is CPU: **the GPU process keeps 7 to 9.5 of the 12 cores busy for as long as the page is open, in
every view, at rest too** (the room draws sixty frames a second whether or not something moves, and here never
finishes one in time), the computer view with the résumé over it included.

### What the views look like (looked at, all of them)

| File (`.shots/flights/nogpu/shots/`) | Shows |
| --- | --- |
| `swiftshader-desktop-tv-still-title-view.jpg` | the startup still with the title playing on it, room lit behind |
| `swiftshader-desktop-tv-level-view.jpg` / `metal-high-desktop-tv-level-view.jpg` | the TV view with a level: lit, lamp, plant, LED all there; softer than Metal (pixel ratio 0.83 against 1.52) |
| `swiftshader-desktop-room-view.jpg` / `metal-high-desktop-room-view.jpg` | the room: fully lit, every prop and poster there; stair-stepped edges (no multisampling) |
| `swiftshader-desktop-pc-view.jpg` | the computer: the résumé document, sharp (it is the page's own text over the room) |
| `swiftshader-desktop-radio-view.jpg` / `metal-high-desktop-radio-view.jpg` | the radio 8.5 s after landing: **the five discs bare silver**, where Metal has their prints |
| `swiftshader-desktop-radio-wait-{5,15,30,60}s-view.jpg` | the radio over a minute: prints up by 30 s (`radioTexturePixels` 18 432 → 455 337 at +20.6 s) |
| `sheet-swiftshader-phone.jpg` | the four views at the phone's size: all lit and complete, discs bare again |
| `sheet-room-desk-crops.jpg` | the desk in four runs: **the monitor shows a two-band placeholder (blue over green) on SwiftShader**, the wallpaper picture on Metal at the same `low` tier |
| `swiftshader-wait-ready+{0.5,2,6,12,25}s-view.jpg`, `swiftshader-wait-end-view.jpg` | the page while an early leaver waits: boot (a black picture) then the title, and still the title 177 s later |

Nothing is black or unlit in any view. What differs from the hardware picture beyond resolution and aliasing:

1. The radio's disc prints arrive about 20 s after landing there (one run followed that long; bare at 8.5 s in the
   two tours).
2. The monitor's wallpaper is still the placeholder 1.5 s and 7 s after landing in the room (two runs). Whether it
   ever arrives was not followed; `stats.backgroundPending` stayed true for the whole minute of the radio run.
   Both look like work that waits for an idle moment the software renderer never leaves (inferred, not traced).

## Case b: WebGL refused altogether

`node scripts/perf/nogpuFlat.mjs --dist .shots/flights/dist-base --label … --args "--disable-gpu" --shots … --out …`.
Chrome for Testing 151, desktop, Energy Saver off (`raw/flat-cft-disable-gpu.log`):

- **Load:** first paint 52 ms, first contentful paint 156 ms, the flat host mounted at 132 ms, the still told to go
  at 107 ms, the tube's CSS power-on from 132 to 905 ms, **game running at 905 ms**. `detectWebGL` is false, so the
  host is `flat` from the first render.
- **What it shows while loading** (`shots/flat-cft-disable-gpu-load-sheet-early.jpg`, frames of a screencast at 33,
  52, 121 … 514 ms; all 135 frames in `shots/flat-cft-disable-gpu-load/`): the first picture (52 ms) is the **room's**
  startup still, the dark 3D-looking set on its cabinet; from about 150 to 500 ms it cross-fades into the flat
  television, a larger set of another shape, the two showing through each other for the 400 ms of the fade; then the
  power-on line (300 ms), the bloom (514 ms), the picture. No broken room, no black frame and no canvas, but one TV
  is swapped for another in front of the visitor.
- **Frames:** 121 frames a second on boot and title (median 8.2 ms, worst 10.6) and in a level on autopilot (median
  8.2 ms, worst 13.6, none over 20 ms, 977 frames); the game's clock 60.0 to 60.4 steps a second. CPU: renderer
  0.05 to 0.19 of a core, GPU process (the software compositor) 0.24.
- **Nothing waits on a room:** 31 requests, 440 kB over the wire. No room file is asked for (`room-…js`, the bake's
  worker, the scene, the guide, the radio, the computer): none. The only failure is `/_vercel/insights/script.js`
  404, which is the local server lacking Vercel's analytics script. At the end: no animation running, the still
  `visibility: hidden`, no `aria-busy`, no room canvas, no "would not load" message.
- **What can be reached** (`shots/flat-cft-disable-gpu-{title,level,after-four-tabs,skip-link,resume}-view.jpg`):
  - With a keyboard: Tab from the screen goes to the sound toggle, then into the résumé, which shows itself as focus
    enters it ("Back to the game", then its links). Shift+Tab goes to "Skip to résumé"; Enter shows the résumé
    (`#resume`); "Back to the game" returns focus to the screen. The résumé's links: e-mail, LinkedIn, GitHub, the
    paper's DOI, `/CREDITS.txt`. **The game is not paused while the résumé covers it** (`paused: false` with a level
    running).
  - **With a mouse or a finger alone, the only things on the page are the screen and the sound toggle.** There is
    no visible way to the résumé (it exists only behind the skip link and Tab), and the hint under the set does not
    mention it. On a phone, with no Tab key, that leaves the URL `#resume`.
  - **The music is not reachable at all**: there is no radio in the flat host (as `FlatHost.tsx` says), no player,
    no track is requested.
  - The room's social links (X, LinkedIn, GitHub, e-mail) are the guide's and are not in the flat host; LinkedIn,
    GitHub and e-mail are in the résumé, X nowhere. The game's own link-outs (the next-level teaser's call to
    action in level select and stage clear) work as in the room (read from the source, not clicked).

The other flat runs (`raw/flat-*.log`; Energy Saver off; all end with no animation running, the still hidden, no
`aria-busy`, no canvas; all 31 requests, 440 kB, no room file; the same keyboard path and the same two controls
for a mouse):

| run | browser, flags, size | game running (ms) | boot and title | level | worst frame in the level (ms) | game steps/s | cores (renderer + GPU process) | JS heap used (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `flat-cft-disable-gpu` | 151, `--disable-gpu`, desktop | 905 | 121.3 fps | 121.5 fps | 13.6 | 60.0 | 0.19 + 0.24 | 8.8 |
| `flat-chrome157-disable-gpu` | 157, `--disable-gpu`, desktop | 915 | 60 fps | 58.3 fps | 166.7 (one frame; the rest ≤ 16.8) | 59.2 | 0.27 + 0.33 | 8.1 |
| `flat-cft-disable-3d-apis` | 151, `--disable-3d-apis`, desktop | 1383 (first paint 208: a slow start of that browser) | 121.5 fps | 130.9 fps | 13.9 | 60 | 0.24 + 0.19 | 8.0 |
| `flat-chrome157-disable-3d-apis` | 157, `--disable-3d-apis`, desktop | 911 | 60 fps | 60 fps | 16.8 | 60 | 0.16 + 0.12 | 9.7 |
| `flat-cft-disable-gpu-phone` | 151, `--disable-gpu`, 390×844 at 3 | 919 | 122 fps | 121.8 fps | 13.6 | 60 | 0.18 + 0.04 | 8.8 |
| `flat-cft-disable-gpu-slow` | 151, `--disable-gpu`, Slow 4G and CPU ÷ 4 | 4274 | 114.8 fps | 99.7 fps | 41.5 | 60 | 0.96 + 0.23 | — |

(Headless Chrome 157 gives a page 60 frames a second, 151 gives 120: the flat host holds whichever it is given.)

**On a slow connection the fallback shows an empty page for a second and a half**
(`shots/flat-cft-disable-gpu-slow-load-sheet.jpg`; Slow 4G, CPU four times slower): first paint at 436 ms is the
room's still; the app takes it away at 1788 ms, as soon as it has run (`TvStill` is told `shown: false` on the first
render because the host is flat); the flat host is mounted only at 3482 ms, when the game's assets are in (`Arcade`
is rendered once `created`). Between about 2.1 s and 3.5 s the screencast has one frame and it is a bare dark page:
no still, no television. On the fast local load the gap is 25 ms and hides inside the still's 400 ms fade.

**The flat host costs the same with a GPU as without** (`raw/flat-hw-forced.log`, `?host=flat` on Metal): 121 fps,
worst frame 9.5 ms, 0.16 + 0.12 of a core, the same 31 requests and 440 kB.

**A room that fails after it was chosen** (the host is `room` because `detectWebGL` said yes, then the room cannot
be made). Both fall back and end clean (no animation, no still, no canvas, no message), game at 60 steps a second:

| run | what fails | host sequence (ms) | game running (ms) | requests, over the wire | wasted |
| --- | --- | --- | --- | --- | --- |
| `flat-hw-room-chunk-blocked` | the request for `room-….js` | room@151 → flat@166 | 938 | 32, 440 kB | the failed request |
| `flat-hw-webgl1-only` | `getContext('webgl2')` gives null, WebGL 1 works: three.js throws "Error creating WebGL context" | room@141 → flat@165 | 955 | 32, **628 kB** | `room-….js`, 192 kB, fetched and run for nothing |
| `flat-hw-webgl1-only-slow` | the same on Slow 4G with the CPU four times slower | room@3457 → flat@4750 | 3802 (on the still) | 35, 634 kB | the room's chunk and the guide's (192 + 6 kB) |

`detectWebGL` answers yes to a browser with WebGL 1 only, and the room needs WebGL 2, so that visitor always pays
for the room's chunk before getting the flat television. On the slow connection it shows
(`shots/flat-hw-webgl1-only-slow-load-sheet.jpg`): the game powers on and plays its boot on the room's still from
3.8 s; at 4.75 s the room gives up, the still cross-fades into the flat television, and **that television runs its
own power-on (line, bloom) over the game that has been running for a second**, until 5.5 s. The visitor sees the TV
turn on twice and loses the middle of the boot. (The WebGL-1-only browser was stood in for by making the page's
`getContext('webgl2')` return null on a hardware Chrome; no real such browser was run.)

`raw/room-hw-reference.log` (the room host's own request list, for comparison) failed with the browser closing
under it and was not repeated.

## Case c: the GPU process lost mid-visit

Owed: `E2E_PORT=4391 pnpm exec playwright test e2e/gpu-reset.spec.ts` had not been run when this was written.

## The judgement asked for

**Does the software renderer hold a usable frame rate in the 3D room on the lowest tier? No.** On twelve M4 cores
with eight to nine of them working, the room gives 17 to 22 frames a second at 1440 × 900 (median frame 46 to 58 ms,
every frame over 33 ms, a fifth to nine tenths over 50 ms depending on the view) and 21 to 26 at the phone's size;
flights are 18 to 28 frames. The game inside it keeps full speed and its input, shown at those 20-odd frames. The
room is not whole for three to five minutes, and a visitor who clicks "Explore the room" in that time waits half a
minute to several minutes with nothing on the page saying so (this build). A machine that has no GPU rarely has
twelve fast cores; how it goes on four was to be measured and is owed.

The options, with what was measured for each:

| Option | What the visitor gets | Numbers |
| --- | --- | --- |
| Leave it: the room on the software renderer at `low` × 1 | the whole site, slowly | 17–26 fps, 7–9.5 cores busy for the whole visit, whole room after 3–5 min, 0.7 s freeze in the game at start |
| Fewer pixels on the software renderer | the same picture, blockier | measured since (the section at the top, B): 30 frames a second at about 0.5 MP, 60 at about 0.16 MP on this machine. What the first round had in hand (0.74 MP against 0.90 MP: 41 ms against 46–53 ms a frame, "the frame is not all fill") did not hold over a wider range |
| The flat television for software renderers too | the game at full rate; no room, no radio, résumé behind the keyboard only | 121 fps (worst frame 13.6 ms), 0.3–0.45 of a core, game running at 0.9 s, 440 kB, nothing else fetched |
| Telling them apart | — | `failIfMajorPerformanceCaveat: true` is refused exactly where the renderer is SwiftShader behind `--disable-gpu`, and the renderer's name is readable on the probe context (`softwareGpu.ts` already reads it later, once the room's chunk is in) |

And two things that hold whichever is chosen: in current Chrome on a Mac the no-GPU visitor is on the flat
television already, so what that host lacks (a way to the résumé for a mouse or a finger, the music, the swap of one
TV for another at load) is what that visitor meets; and the software path is what `flights.mjs`, `profile.mjs`
with `PERF_GL=swiftshader` and every e2e run under Playwright exercise, because Playwright passes the flag.

## Verified by running, and inferred

Verified by running: everything in the tables; the launch matrix in both browsers; tier and scale; the bake's
times; the 0.7 s task and where it falls between the bake's marks; the early-leave waits and the page's state during
one; every screenshot described; the flat host's load, frames, requests and keyboard path; the Energy Saver cap and
its cure; Playwright's default flag (read in its source and seen in the browser's command line).

Inferred from reading code or documents: why the rest of the bake takes minutes (`pace.ts`) and why the early
leaver's wait is long (`HURRY_HOLD_MS`); that the late disc prints and the monitor's placeholder are idle work
starved by frames that are always late; what Chrome does on other platforms (Chromium's intent thread, not run);
that the game's teaser links work in the flat host.

Not checked: that the page-clock frames are the frames presented under software WebGL (no trace taken); Windows,
Linux, Firefox, Safari; a real machine without a GPU.

## Still owed

1. ~~**Frame time against pixels** on the software renderer (`nogpu.mjs --quick` at 1440×900 with device scale 1 and
   0.5, at 720×450, and with every process on the efficiency cores via `--ecores` as a stand-in for a four-core
   machine). Each run holds 8–9 cores for minutes: parked until the laptop is on mains.~~ **Closed in the second
   round** ("Options, measured on the fixed build", B), on the current build: device scale 0.5, 720×450, three
   pixel ratios on a 2× display, and one run on the efficiency cores. Left open there: device scale 1 (its run never
   landed), and the room at rest on the efficiency cores (only the load and the TV view while the room was lit).
2. **Chrome 157 on software WebGL** (still owed; not part of the second round) (its one run, and the Metal `low` and phone references, were taken under the
   Energy Saver cap and are discarded: `raw/early-swiftshader-desktop-chrome157.*`, `raw/visit-metal-low-desktop.*`,
   `raw/visit-metal-phone.*`; their screenshots are valid, their frame numbers are not).
3. **The rest of case b and case c**: the flat host in Chrome 157 and at the phone's size, `--disable-3d-apis`, a
   room that fails after it was chosen (its chunk blocked; WebGL 1 without WebGL 2), the forced flat host on a
   hardware GPU for comparison, and the gpu-reset e2e test. *Second round:* the flat-host items are all in "Case b"
   above (this entry was not struck when they were written up), and the forced flat host is now measured on the
   software-WebGL browser too (D), with what a mouse and a finger reach in it. **Still owed: case c, the gpu-reset
   e2e test** (the second round was not to run e2e).

Owed from the second round: the cuts on a machine nobody else is using (C); the early leaver's wait followed to
its end when it is long, with what the bake is doing (A); the room at rest on a slow CPU at fewer pixels (B).
