# The CD player (`src/app/radio`)

Clicking the radio, its cabinet or the lava lamp in the room flies the camera to a frontal view of the CD boombox on the cabinet.
The radio wakes, its lid swings open and the CDs rise out of the well into an arc above it.
Choosing a disc sends it into the player, the radio's own ▷II key presses itself and the music starts; the keys on the radio, the keyboard, a touch bar and the OS media controls all play, pause, stop and skip like a real CD player.
The music keeps playing, a little farther off, while the visitor looks around the room or reads the résumé at the computer, and makes way for the game at the TV.

The room owns the radio as a device: the lid, the keys, the discs, their animation, the LCD, the camera and what the pointer does to the model (docs/ROOM.md).
The app owns the meaning: the shelf of albums, what plays, the sound, the words, and the DOM controls that make it usable without a mouse.
They meet through `room.radio`, a `RadioDeck`.

## Contract with the room

`deck.ts` re-exports the room's `RadioDeck` family from `@/room` (`DeckState`, `LcdReadout`, `DiscArt`, `RadioIntent`, `RadioCue`, `DiscAnchor`, `RadioLayout`, `ScreenRect`, `FramingInsets` and `RoomView`), types only, so the type checker proves `room.radio` is what the player relies on and no room code reaches the player's chunk.
The player was built beside the room's half against a structural copy of these types and the lab's `FakeDeck`, which still implements the same interface.

| The app | The room |
| --- | --- |
| `setDiscs(discs)`: the shelf in display order, plain discs first, then each with its print painted at `labelSize` | lays out the slots, uploads the prints at idle; a disc whose id is gone hands its place, mesh and motion to the newcomer at its index (`discHeirs`), so the app's albums arriving after the placeholder shelf has risen take it over in the air, with no second rise |
| `setState({ loaded, transport, lcd })`, called in the same call that answers every pick or press | animates the difference: insert, swap, return, spin up and down, the LCD; never changes the state itself |
| `press(key)` for DOM keys, the touch bar and media keys | presses the 3D key and emits its cues, no intent |
| `setAttention(disc)` on a keyboard focus | brings the disc forward (the pointer's own hover wins) |
| `setControlInsets(insets)`: the touch bar's strip | frames the radio clear of it |
| `prefetch('idle')` | loads and prepares its half |
| listens to `onIntent` | emits `pick` and `press` synchronously inside the pointer event: a user gesture, so media may start |
| listens to `onSeated` | the disc is on the spindle and ▷II is down: start the sound now (once per insert; in a microtask under reduced motion or out of sight) |
| listens to `onCue` | mechanical moments, as they happen, with a stereo pan |
| reads `layout`, `live`, `controls`, `labelSize`, `available` | where the discs and keys are on the page at the settled pose; the controls slot, visible only while the camera rests at the radio |
| reads `discsOut` (`onDiscsOutChange`) | true while the camera rests at the radio and the whole shelf hangs in its slots, label out (the teaching lines wait for it); false from the request to leave |

`RadioSlot` (`RadioSlot.tsx`) is the only module the room host loads, lazily (`React.lazy`), in a transition once the camera has first come to rest away from the TV, or as soon as it heads for the radio (never inside the click that leaves the TV, so that click costs what it did before the radio):

```tsx
<RadioSlot door={room.radio} view={view} settled={settled} powered={tvOn} muted={muted} onLeave={showRoom} onFocusStage={focusStage} />
```

`room.radio` is the room's door to the CD player (`available`, `prefetch`, `load()`); the slot loads the deck through it beside the player's chunk and renders a portal into `deck.controls` only, a sibling of the stage outside `role="application"`. A slot chunk that fails to load is warned once and the radio stays scenery.

## Loading

| Chunk | Contents | Loaded |
| --- | --- | --- |
| `RadioSlot-*` (`RadioSlot.tsx` + its failure message's style) | the loading policy, the portal, the failure message | once the camera first rests away from the TV, or heads for the radio (the room's door imports the deck's chunk just after the first TV leave's first flight frame) |
| `RadioExperience-*` (`RadioExperience.tsx` + CSS) | the player, the foley recipes, the Media Session, the print painter, the controls, the shelf's data and file URLs | at once when the view becomes `radio` (the 1.1 s flight hides it); or at idle once the camera has rested in the room view for 3 s (after the computer's screen, which loads as the camera lands, and the room's half, `deck.prefetch('idle')` at 0.4 s, so a visitor who heads for the radio at once still finds its device preparing on the way and the lid opening on time); it first mounts, and paints the prints, only while the camera rests; never on Save-Data, never before the TV's picture is up, never for a radio that is `available: false` |
| covers and prints | five WebPs, decoded off the main thread at the label size (`createImageBitmap` with a resize), then painted one per idle moment while the camera rests away from the TV (`labels/discPrints.ts`) on CPU canvases (nothing reads the GPU back) and handed to the room together; one that has not arrived in 6 s is given up on (`labels/loadArt.ts`) | when the player mounts |
| audio | one track at a time, streamed | from the pick that needs it |

Once loaded the player stays mounted for the page, so the music survives leaving the radio.
If the chunk fails to load, the controls slot says "The CD player could not load its music."; Escape and clicks outside still leave.

## The player (`player/`)

`playerState.ts` is a pure reducer with a real CD player's rules; `RadioPlayer.ts` feeds it the visitor's gestures, the room's mechanics and the element's events, runs its effects and keeps the deck, the OS and the live region in step.

| Event | Result |
| --- | --- |
| a pick (empty, or another disc loaded) | that disc, track 1, playing, going in; the track starts silently at once, inside the gesture (fading the playing disc out over 250 ms first) |
| the seat | the sound opens: rewound to 0:00, faded in over 120 ms; the LCD reads `-- --:--` until the first second of sound |
| ▷II | playing → paused (120 ms fade); paused → playing, sound first (80 ms); stopped → plays the current track at once; empty → "Choose a CD first." |
| ■ | playing or paused → stopped, back to track 1 at 0:00; the LCD shows the disc's track count and total |
| ⏭ / ⏮ | the track number changes at once; playing, the sound switches 250 ms after the last press (three quick presses fetch only the third track); ⏮ restarts the track after 3 s, else goes back one; paused or stopped, it only selects (stopped, the LCD shows the chosen track at `00:00` instead of the totals, back to the totals on track 1); ⏭ on the last track does nothing |
| a track ends | the next plays; after a disc's last, the next disc on the shelf goes in and plays (after the last disc, the first), like a CD changer; a shelf of one disc stops on track 1, "End of the CD." |
| a track fails | the LCD's own error (`00 -- --`), "This track could not be played."; playing with a next track, it moves on after 2 s; otherwise it stays on that track until the next action |
| the browser refuses to play (no user activation yet) | paused, "Press play to start the music."; the next press is a gesture and plays (a disc still going in starts again silently, for its seat to open) |
| the camera goes to the TV | a playing disc fades out over 350 ms and pauses; leaving the TV resumes it over 500 ms, unless the visitor paused or stopped it meanwhile |
| the OS pauses the element (a call, a headset unplugged) | paused, truthfully |

While a disc is going in the keys wait for its seat. Every visitor action clears an error and a pause for the TV.

**The element** (`MusicElement.ts`): one `<audio>` for the page, created on the first pick (`preload="none"` until then, so no audio is requested before a pick), never routed through Web Audio and never decoded to PCM: the browser streams it, iOS keeps it playing on the lock screen, an album hosted elsewhere needs no CORS.
Silence is `volume = 0`, or `muted` where volume is read-only (iOS, found by writing 0.5 and reading it back); fades are driven by animation frames and happen at once where volume is read-only or the page is hidden.
Element events about a track the player no longer means (a stale tick of a skipped track, a late error of a swapped one) are dropped.

**Where the sound comes from** (`audioPolicy.ts`): volume 1.0 at the radio, 0.79 (−2 dB) in the room, 0.56 (−5 dB) at the computer, gliding over 300 ms as the camera moves, times the album's `gainDb`; at the TV it yields, so two musics overlap only during that 350 ms hand-over.
The site's sound toggle mutes the element and the mechanical sounds; a pick while muted plays silently and says "Sound is off."
A hidden tab keeps playing.

**The LCD** (`lcdReadout.ts`): `no dISC` at an empty radio, `-- --:--` while a disc goes in, `▶ 01 00:37` / `‖ 01 00:37` while playing or paused, `02 04:31` stopped, `00 -- --` on an error; whole seconds, so the room repaints it once a second at most. Away from the radio the LCD (and the LED) stays lit only while a disc plays or is paused.

## Mechanical sounds (`player/foley.ts`, `player/FoleyPlayer.ts`)

Every cue the room emits plays a synthesised engine `SfxRecipe` (clicks, latches, whooshes, the motor's spin-up and spin-down, a pentatonic bell per rising disc, descending as they sink), plus the app's own `seek` tick on each skip, between −22 and −40 dBFS, panned from where the part moves on screen.
Nothing is continuous while playing: a real CD motor is silent at speed.
They play in a small `AudioContext` of their own (the game's is suspended whenever the camera leaves the TV). It is made with its mixer graph in an idle moment of its own after the player mounts away from the radio (suspended, once the page has had user activation: making one is the dearest part of the player's start, 74 ms on a slow phone), so the click that sends the camera there only resumes it, or else inside the first radio gesture; resumed in every radio gesture and on reaching the radio, suspended 2 s after leaving it; cues arriving while it sleeps are dropped. If it cannot be made the radio is silent of mechanics and the music is unaffected.
Each recipe's gain is calibrated from an offline render so it peaks at its level; `e2e/radio-player.spec.ts` renders every one through the engine's mixer and holds it to ±3 dB, no clipping, and silence by its end.

## Controls (`ui/`)

Portaled into `deck.controls`, a `<section aria-label="CD player">`. The layer takes no pointer: the discs and keys are the 3D model's.

- **CDs**: `role="toolbar" aria-label="CDs"`, one Tab stop, ←/→ and Home/End move between the albums (the shared roving tabindex, `app/a11y/roving.ts`). One button per album sits as a circle over its disc (over the seat for the loaded one), invisible until a keyboard focus rings the disc itself in white (`--ui-ink`) and brings it forward. Labels say "Night Shift by Studio Attic, 2 tracks", with ", in the player" and `aria-current` for the loaded disc. Enter or Space plays it (the loaded one: play/pause).
- **Transport** on fine pointers: `role="toolbar" aria-label="CD player controls"`, "Previous track", "Play"/"Pause" (the label changes, no `aria-pressed`), "Stop", "Next track", each over its key on the model; `aria-disabled` with an empty player (still focusable: activation says "Choose a CD first.").
- **Touch controls** on a primary coarse pointer (round six): one large play/pause key (80 px) centred at the foot of the screen on the sound toggle's round dark glass. Its soft, rounded glyph morphs: the play triangle's two halves melt into the two pause bars and back on an overshooting spring (`ui/PlayMorph.tsx`, eight points interpolated per frame while it moves), the glyph wobbles like jelly as it changes, the key squashes under the finger and springs back, and a soft ring breathes out of it every 2.4 s while a song plays; under reduced motion the glyph changes at once and nothing bounces or pulses. Over it, "Some songs I made" in Chewy (23 px) on a gentle SVG `<textPath>` arc (radius 118 px, its top 15 px over the rim; a hidden heading for screen readers), springing up out of the key while nothing plays. Nothing about the song is written beside the key: its name says it ("Pause It's all in your head, by Roel Leenders ft. Bram Reker"). Play on an empty player puts the first disc in. No skip keys: the discs are picked from the shelf, and each song ends into the next disc. The way back is a "Back to the room" pill (line arrow, Chewy) in the sound toggle's row at the top left, exactly its height. On a landscape phone under 480 px tall the back and play keys go down a right rail. The controls report their strips (the foot and the top row) through `setControlInsets`, and the room frames the radio clear of them.
- **Caption** (`aria-hidden`): under the disc that has the visitor's attention (over it for the disc in the player, so the keys stay in sight), on the room UI's dark glass, the title in Chewy and the rest in Nunito: "Night Shift — Studio Attic", "2 tracks · 1:38", a "placeholder" tag and "Sound is off" when they apply; a 120 ms fade, which on a touch screen starts only under a finger that stays 250 ms (a tap is a pick, so it never flashes the plate). The plate is in the page, empty and hidden, from the start of the visit, so the first attention fades and holds like every later one. It waits until the shelf has risen on this visit (a caption over a disc still on its way would point at empty air); the loaded disc's shows at once.
- **The way back**: with a mouse or a keyboard, the room guide's "Back to the room" button along the bottom (docs/ART-DIRECTION.md › The room's UI), Tab past the CDs and the keys; on a touch screen the touch controls' pill. The radio teaches no gesture of its own any more: its discs float up to be picked, and the caption names one under the pointer.
- **One live region** (`role="status"`, polite): "Playing Kettle On, track 1 of 2, from Night Shift by Studio Attic." (+ " Sound is off."), "Track 2 of 2, Window Seat." (a track chosen while paused or stopped), "Paused.", "Playing.", "Stopped.", "End of the CD.", "This track could not be played.", "Choose a CD first.", "The CD is still going in." (a key pressed before the disc is seated; it waits), "Press play to start the music." The same words within a second are said once; never the clock, a hover or a focus. The CDs' toolbar is described by "Enter plays a CD; Escape returns to the room." for a screen reader landing on it.
- **Keyboard**: arriving moves focus to the CDs (the loaded disc's button, else the first); Escape anywhere in the controls leaves for the room; the controls hiding with focus inside hand it back to the stage.

**Media Session** (`player/mediaSession.ts`): while a disc is loaded, the track's title, the artist, the album and its cover; `playbackState`; play, pause, stop, previous and next as the radio's keys (pressing the 3D key while the visitor is at the radio; at the TV, play only asks to resume on leaving); the position on play, pause, track changes and seeks. Nothing at all with no disc, or without the API.

## The shelf (`src/content/radio`)

`ALBUMS` (`albums.ts`) lists the albums in display order; `types.ts` is the format; `files.ts` bundles each file's URL (`import.meta.glob` with `?url`: fingerprinted, fetched only when needed); `audioFiles.ts` reads an MP4's `mvhd` and box order and an MP3's Xing, VBRI or CBR length without decoding; `validate.ts` holds the shelf's rules for `pnpm verify:radio` and `albums.test.ts`.
1–12 albums of 1–20 tracks.

The shelf holds Roel's own songs, one per CD: "It's all in your head" (ft. Bram Reker, 2016), "gekkeSynthLangeFrans" (2018), "DROP THE BOMBS" (2025), "Midnight Mirage" (2025) and "Async_002" (2026), loudness-matched and re-encoded from the masters (2.5–11 MB of 320 kb/s MP3, 31 MB; integrated loudness −24.1 to −10.2 LUFS) to AAC-LC at about 128 kb/s with `afconvert -f m4af -d aac -b 128000 -s 2` (15.2 MB together, 1.2–4.7 MB each, `<id>-v2.m4a`), the moov box first so they stream. Every song is at −16 LUFS integrated (BS.1770, as Apple Music's Sound Check) with true peaks at or under −1 dBTP after the encode: a plain gain for three, a transparent look-ahead limiter (3 ms attack, 80 ms release) on the peaks of DROP THE BOMBS (2.1 dB) and Async_002 (4.5 dB, a master already limited to 0 dBFS). −14 LUFS would have meant limiting Async_002 by nearly 6 dB. The player applies no gain of its own. The discs wear the earlier placeholders' seeded generative covers and prints (`scripts/radio/covers.ts`; the placeholder songs' tracker sources stay in `scripts/radio/songs`). `validate.ts` holds every track to 5 MB and the shelf's audio to 16 MB (`pnpm verify:radio`); none of it is in the first load.

Disc prints (`labels/discLabel.ts`): the album's `disc` print as it is, or its cover filling the disc, then the rim text every CD carries, "NIGHT SHIFT · STUDIO ATTIC", set round the top at 54.5 mm in 3.2 mm capitals (a placeholder says so in its caption, not on the disc); a print that fails to load, or has not arrived in 6 s, becomes a plain disc in a colour of its own, with its text.

## Your own albums

1. Make a folder `src/content/radio/albums/<album-id>/` (kebab-case) with `cover.jpg`, `cover.webp` or `cover.png` (square, at least 512 px), optionally `disc.png` or `disc.webp` (a 512² print, transparent wherever the silver should show), and the tracks as `.m4a` or `.mp3`.
   Convert with `afconvert -f m4af -d aac -s 3 -u vbrq 96 in.wav out.m4a` (macOS), or `ffmpeg -i in.flac -c:a aac -b:a 160k -movflags +faststart out.m4a`; keep tracks at 256 kb/s or less.
2. Add an entry to `src/content/radio/albums.ts`:

   ```ts
   {
     id: 'album-id',
     title: 'Album Title',
     artist: 'Artist',
     year: 2024,
     cover: 'cover.jpg',
     disc: 'disc.png', // optional
     tracks: [
       { title: 'First Song', file: '01-first-song.m4a', seconds: 0 },
       { title: 'Second Song', file: '02-second-song.m4a', seconds: 0 },
     ],
   },
   ```

3. Run `pnpm verify:radio`; paste the lengths it prints into `seconds`. `pnpm verify:radio --loudness` compares each album with the game's music and suggests a `gainDb` (0 or less) for albums mastered louder.
4. Delete the placeholder entries and their folders.

That is all: the shelf, the arc, the prints, the captions and the Media Session follow from the data.
For large collections, use Git LFS for the files, or give tracks as absolute `https://` URLs (audio needs no CORS); covers must stay in the folder or be served with CORS, because they are drawn into a texture.

## Dev lab

`/radio-lab.html` on the dev server runs the player on `FakeDeck` (`lab/FakeDeck.ts`), a DOM stand-in for `room.radio`: it draws the radio, its keys and the discs where the room would project them, turns clicks on them into the room's intents, seats a picked disc 890 ms after the answering `setState` (in a microtask under reduced motion), plays the room's cues on its timetable (the lid and the rise on landing, the sink on leaving) and records everything the player asks of it.
Like the site, it unlocks an audio context on the first gesture, so the radio's own context costs what it does there.

| Param | Effect |
| --- | --- |
| `view=radio` | land at the radio at once (default: the room, where the idle prefetch runs) |
| `muted=1` | start with the sound off |
| `coarse=1` | answer the pointer media queries like a touch screen: the touch controls on a desktop |
| `pick=<album>` | pick that disc as soon as the player has loaded, without a gesture (the autoplay refusal) |
| `clean` | hide the panel |

The panel moves the camera (radio, room, pc, tv) and toggles the sound; clicking outside the radio leaves.
`window.__radioLab` flies, leaves, sets the view, emits intents, renders foley offline and exposes the deck's event log for `e2e/radio-player.spec.ts`.

## Budgets and measurements

| Metric | Budget | Measured |
| --- | ---: | ---: |
| Entry JS: the room host's lazy slot, the hotspot and the input-modality watcher, against `feat/pc-desktop` | + 0.60 kB | + 0.55 kB |
| Entry CSS | + 0.15 kB | + 0.00 kB |
| Room chunk: the door, the click target, the framing hook, the model lookup (docs/ROOM.md › The CD player) | | − 0.09 kB: the radio's own + 2.70, less 2.79 the shaders give back since the build ships every shader, three.js's included, without comments, indentation or spaces inside brackets (`scripts/glslMinify.ts`) |
| First-load JavaScript, entry and room chunk together | + 0.60 kB | + 0.46 kB |
| `RadioSlot`, lazy | 1.2 kB | 1.08 kB |
| `RadioExperience` closure, JS + CSS, no three.js | 15 kB | 13.65 kB |
| `radioDevice`, lazy: the deck, the storyboard, disc shader, LCD and close-up assembly | 16 kB (held at 33.6, pending the captain's word: `bundle-budgets.json`) | 33.50 kB (33.75 before the posters moved the strip uploader and the slow-device rule into the room chunk, docs/ROOM.md › Posters) |
| Close-up asset `radio-closeup.glb`, lazy (the well's parts and their 512 px atlas, meshopt with filters) | 80 kB | 59.1 kB |
| `radio-skin-2k.webp`, lazy, the close-up's sharper skin (2048², unbranded) | 280 kB | 170.6 kB |
| The shelf's audio (only the track that plays is fetched, streamed) | 16 MB, 5 MB a track | 15.2 MB, ≤ 4.6 MB |
| Covers / prints | 40 kB / 60 kB each | ≤ 16.8 kB / ≤ 45.3 kB |

`radioDevice` is behaviour code (source maps: the storyboard 8.3 kB, the device 3.9, the disc motion 2.8, the disc shader 2.5, the LCD 1.5, the discs 1.5); no debug or test hook ships in it, and another minifier makes it larger. Halving it would mean dropping behaviour the reviews asked for. Moving the radio's room-side code (the click target 0.75 kB, the door 0.58, the model lookup 0.29) into the lazy chunk would save less than it seems: a click on the radio already waits for that chunk when it has not arrived (`createRoom.ts`, `whenReady`), but before it arrives the radio would show no `enter` cursor and drop a click unless a small stand-in target stayed in the first load, so it would save about 0.5–1 kB.

Every lazy file was re-examined (bytes at `0e0d685`, before the slimming pass, and now). All of them are fetched once the camera first leaves the TV (`RadioSlot`'s idle prefetch makes the device, which fetches its files ahead of a visit; only the skin's decode and upload wait for a hover, a focus or the tap that starts the flight), 361 kB in 13 files whether or not the visitor then opens the radio; a track only when it plays:

| File | Before | Now | |
| --- | ---: | ---: | --- |
| `radio-skin-2k.webp` (2048²) | 178,820 B | 170,594 B | Unbranded; WebP q90 effort 6. q85 would be 122 kB, but the small panel labels (FM/MW/LW, TAPE/RADIO/CD) soften at the close-up's 3× magnification. Fetching it only on intent would save 171 kB for visitors who never open the radio, at the cost of the skin sharpening a moment after the tap on a slow connection: the captain's call. |
| `radio-closeup.glb` | 56,028 B | 59,132 B | The lit well's atlas compresses less than the black one (4.6 → 13.3 kB); its normals are octahedral (12.3 → 4.3 kB) and stay, as three.js keys a program on whether a mesh has normals and the parts share the base meshes' program. |
| Disc prints, five 512² WebP | 82,838 B | 82,838 B | Kept: a disc is about 930 device pixels wide on a phone at the radio, and re-encoding at effort 6 saves nothing. |
| Covers, one 512² WebP per album played | 8.0–15.7 kB | same | Kept: fetched only for the Media Session once an album plays. |
| Placeholder tracks, AAC in MP4 | 393–530 kB each | same | Placeholders, only the track that plays. |

`radio-base.glb` is first-load and the captain's asset: its only material is unlit and nothing reads its normals, which are 317 kB of its 879 kB. Meshopt's `high` normal filter would save 214 kB with no visible change (`pnpm build:radio` must run after, as the geometry fingerprint changes); dropping its normals would save 319 kB but adds one shader program unless the room drops them everywhere (`room.glb` carries 1.1 MB of normals on mostly unlit materials). Not done here: the captain's call.

Measured in the real app (development server, Chromium on an M-series Mac, the radio prepared at idle; `e2e/radio-flow.spec.ts` holds pick → sound to 1.0 s, 1.5 s for a disc chosen before it is out, and 0.35 s under reduced motion):

| | 1× CPU | 6× CPU |
| --- | ---: | ---: |
| Pick → sound | 0.94 s | 0.93 s (a phone: 0.95 s) |
| A keyboard pick the moment the camera lands, the disc still inside the radio (it seats at its own climb's pace, so a later pick is heard sooner) | 1.61 s at the landing, 1.50 s 100 ms after it, 1.40 s 200 ms after it (where the e2e's Enter lands) | |
| Long animation frames over 50 ms in the flights to and from the radio, the arrival until the discs are up, an insert and a swap | none | none |
| The prints on the discs after an eager click (the radio clicked as soon as the camera rests in the room, the pointer moving over the discs now and then) | handed to the device at 1.10–1.15 s, on every disc by 3.0 s, as they turn over to their labels (5 of 5 runs; urgent idle work runs before the room's own) | |
| Frames over 2 s at the computer with a disc playing | 0 | |
| Media elements, `decodeAudioData` calls, audio contexts of the radio's own | 1, 0, 1 | |

And on the production build (6× CPU, two runs): no long animation frame over 50 ms from the click to the radio through its arrival and a pick, the longest frame gap 29–32 ms; 0 frames at rest at the radio, 2–3 in 2 s playing (the clock); the first look around the room fetches 376.7 kB of radio and computer work in 15 requests (the radio's 361.4 kB in 13), the pick 436 kB (the first track).

## Modules

```
radio/
  RadioSlot.tsx            the room host's entry: loading policy, the portal, the failure message (lazy)
  deck.ts                  the room's RadioDeck family, re-exported from @/room (types only)
  RadioExperience.tsx      the lazy chunk: the player, the prints for the room, the controls
  player/
    playerState.ts       ★ the reducer: CD semantics, the TV, the media keys
    audioPolicy.ts       ★ volume from where the camera is; arriving at and leaving the TV
    lcdReadout.ts        ★ the LCD for a state and a view
    announce.ts          ★ the live region's words and their deduplication
    MusicElement.ts      ★ the one <audio>: silent start, open, fades, events
    RadioPlayer.ts       ★ the shell: effects, debounce, error advance, deck, session, words
    foley.ts             ★ a recipe per cue
    FoleyPlayer.ts         the small AudioContext that plays them
    mediaSession.ts      ★ the OS media controls
    testing.ts             stand-ins for the unit tests
  labels/
    discLabel.ts         ★ a disc's print with its rim text
    discPrints.ts        ★ the shelf's prints for the room: plain discs at once, prints painted one per idle moment
    loadArt.ts             fetch and off-thread decode of covers and prints
  ui/
    RadioControls.tsx      CDs, transport, caption, live region, focus, Escape
    TransportBar.tsx       the touch controls: play/pause under its curved title, the way back
    RadioControls.css
  lab/                     FakeDeck + main.tsx (served by radio-lab.html)
a11y/roving.ts           ★ the toolbars' roving tabindex (shared with the PC reader)
content/radio/
  types.ts, albums.ts      the shelf
  files.ts                 the files' bundled URLs
  audioFiles.ts          ★ MP4 and MP3 lengths, codecs and box order without decoding
  validate.ts              the shelf's rules (pnpm verify:radio, albums.test.ts ★)
```

★: unit-tested next to the code. End to end, real media in Chromium under the strict autoplay policy (`--autoplay-policy=document-user-activation-required`): `e2e/radio-player.spec.ts` on the lab, and `e2e/radio-flow.spec.ts` on the real app with the room's radio (the integrated flows, the keyboard and the phone, mute, loading, frame budgets and long frames at 6× CPU).
