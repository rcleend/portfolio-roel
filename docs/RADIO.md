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
| `setDiscs(discs)`: the shelf in display order, plain discs first, then each with its print painted at `labelSize` | lays out the slots, uploads the prints at idle |
| `setState({ loaded, transport, lcd })`, called in the same call that answers every pick or press | animates the difference: insert, swap, return, spin up and down, the LCD; never changes the state itself |
| `press(key)` for DOM keys, the touch bar and media keys | presses the 3D key and emits its cues, no intent |
| `setAttention(disc)` on a keyboard focus | brings the disc forward (the pointer's own hover wins) |
| `setControlInsets(insets)`: the touch bar's strip | frames the radio clear of it |
| `prefetch('idle')` | loads and prepares its half |
| listens to `onIntent` | emits `pick` and `press` synchronously inside the pointer event: a user gesture, so media may start |
| listens to `onSeated` | the disc is on the spindle and ▷II is down: start the sound now (once per insert; in a microtask under reduced motion or out of sight) |
| listens to `onCue` | mechanical moments, as they happen, with a stereo pan |
| reads `layout`, `live`, `controls`, `labelSize`, `available` | where the discs and keys are on the page at the settled pose; the controls slot, visible only while the camera rests at the radio |

`RadioSlot` (`RadioSlot.tsx`) is the only module the room host imports:

```tsx
<RadioSlot deck={room?.radio ?? null} view={view} powered={tvOn} muted={muted} onLeave={showRoom} onFocusStage={focusStage} />
```

It renders a portal into `deck.controls` only, a sibling of the stage outside `role="application"`.

## Loading

| Chunk | Contents | Loaded |
| --- | --- | --- |
| main bundle | `RadioSlot.tsx` and its failure message's style | first load |
| `RadioExperience-*` (`RadioExperience.tsx` + CSS) | the player, the foley recipes, the Media Session, the print painter, the controls, the shelf's data and file URLs | at once when the view becomes `radio` (the 1.1 s flight hides it); or at idle once the camera has rested in the room view for 3 s (after the computer's screen, which loads as the camera lands, and the room's half, `deck.prefetch('idle')` at 1.5 s, so the lid opens on time for a visitor who heads for the radio soon); it first mounts, and paints the prints, only while the camera rests; never on Save-Data, never before the TV's picture is up, never for a radio that is `available: false` |
| covers and prints | five WebPs, decoded off the main thread at the label size (`createImageBitmap` with a resize), then painted one per idle moment while the camera rests away from the TV (`labels/discPrints.ts`) and handed to the room together | when the player mounts |
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
| ⏭ / ⏮ | the track number changes at once; playing, the sound switches 250 ms after the last press (three quick presses fetch only the third track); ⏮ restarts the track after 3 s, else goes back one; paused or stopped, it only selects; ⏭ on the last track does nothing |
| a track ends | the next plays; after the last, stopped on track 1, "End of the CD." |
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
They play in a small `AudioContext` of their own (the game's is suspended whenever the camera leaves the TV), made inside the first radio gesture once the page has had user activation, resumed on reaching the radio, suspended 2 s after leaving it; cues arriving while it sleeps are dropped. If it cannot be made the radio is silent of mechanics and the music is unaffected.
Each recipe's gain is calibrated from an offline render so it peaks at its level; `e2e/radio-player.spec.ts` renders every one through the engine's mixer and holds it to ±3 dB, no clipping, and silence by its end.

## Controls (`ui/`)

Portaled into `deck.controls`, a `<section aria-label="CD player">`. The layer takes no pointer: the discs and keys are the 3D model's.

- **CDs**: `role="toolbar" aria-label="CDs"`, one Tab stop, ←/→ and Home/End move between the albums (the shared roving tabindex, `app/a11y/roving.ts`). One button per album sits as a circle over its disc (over the seat for the loaded one), invisible until a keyboard focus rings the disc itself in `#ffc83d` and brings it forward. Labels say "Night Shift by Studio Attic, 2 tracks", with ", in the player" and `aria-current` for the loaded disc. Enter or Space plays it (the loaded one: play/pause).
- **Transport** on fine pointers: `role="toolbar" aria-label="CD player controls"`, "Previous track", "Play"/"Pause" (the label changes, no `aria-pressed`), "Stop", "Next track", each over its key on the model; `aria-disabled` with an empty player (still focusable: activation says "Choose a CD first.").
- **Touch bar** on a primary coarse pointer: 48 px keys on the sound toggle's dark plate: back ("Look around the room"), ⏮, ▶/‖, ■, ⏭ and "Kettle On · Night Shift" along the bottom (64 px plus the safe area), or stacked down a right rail on a landscape phone under 480 px tall. Each key presses its 3D twin too. It reports its strip through `setControlInsets`, and the room frames the radio clear of it.
- **Caption** (`aria-hidden`): under the disc that has the visitor's attention (over it for the disc in the player, so the keys stay in sight), in the view hint's pixel plate: "Night Shift — Studio Attic", "2 tracks · 1:38", a "placeholder" tag and "Sound is off" when they apply; a 120 ms fade.
- **Hint** (`radioHints.ts`, `localStorage` `reo-leo:radio-hints`): 1.2 s after landing, "Click a CD to play it" ("Tap…" on touch) until the first pick; then, with a mouse, "Click outside the radio to look around" until the visitor has left once.
- **One live region** (`role="status"`, polite): "Playing Kettle On, track 1 of 2, from Night Shift by Studio Attic." (+ " Sound is off."), "Paused.", "Playing.", "Stopped.", "End of the CD.", "This track could not be played.", "Choose a CD first.", "Press play to start the music." The same words within a second are said once; never the clock, a hover or a focus.
- **Keyboard**: arriving moves focus to the CDs (the loaded disc's button, else the first); Escape anywhere in the controls leaves for the room; the controls hiding with focus inside hand it back to the stage.

**Media Session** (`player/mediaSession.ts`): while a disc is loaded, the track's title, the artist, the album and its cover; `playbackState`; play, pause, stop, previous and next as the radio's keys (pressing the 3D key while the visitor is at the radio; at the TV, play only asks to resume on leaving); the position on play, pause, track changes and seeks. Nothing at all with no disc, or without the API.

## The shelf (`src/content/radio`)

`ALBUMS` (`albums.ts`) lists the albums in display order; `types.ts` is the format; `files.ts` bundles each file's URL (`import.meta.glob` with `?url`: fingerprinted, fetched only when needed); `audioFiles.ts` reads an MP4's `mvhd` and box order and an MP3's Xing, VBRI or CBR length without decoding; `validate.ts` holds the shelf's rules for `pnpm verify:radio` and `albums.test.ts`.
1–12 albums of 1–20 tracks.

The five placeholders are original, made for this site: eleven tracks composed in the game's own tracker (`scripts/radio/songs`), rendered through the game's synth, loudness-matched to the game's first stage and encoded to AAC (4.94 MB together), and seeded generative covers and prints without text or marks (`scripts/radio/covers.ts`); see `scripts/radio/README.md`.
Each is marked `placeholder: true`, so its caption and its print say so.

Disc prints (`labels/discLabel.ts`): the album's `disc` print as it is, or its cover filling the disc, then the rim text every CD carries, "NIGHT SHIFT · STUDIO ATTIC · PLACEHOLDER", set round the top at 54.5 mm in 3.2 mm capitals; a print that fails to load becomes a plain disc in a colour of its own, with its text.

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
| `coarse=1` | answer the pointer media queries like a touch screen: the touch bar on a desktop |
| `pick=<album>` | pick that disc as soon as the player has loaded, without a gesture (the autoplay refusal) |
| `clean` | hide the panel |

The panel moves the camera (radio, room, pc, tv) and toggles the sound; clicking outside the radio leaves.
`window.__radioLab` flies, leaves, sets the view, emits intents, renders foley offline and exposes the deck's event log for `e2e/radio-player.spec.ts`.

## Budgets and measurements

| Metric | Budget | Measured |
| --- | ---: | ---: |
| Entry JS: `RadioSlot` and its import in the room host (with the room host's own radio changes) | + 0.60 kB | + 0.34 kB |
| Entry CSS | + 0.15 kB | + 0.03 kB |
| `RadioExperience` closure, JS + CSS, no three.js | 15 kB | 12.4 kB (Vite: 11.1 kB JS + 1.2 kB CSS) |
| Placeholder audio | 5.5 MB | 4.94 MB |
| Covers / prints | 40 kB / 60 kB each | ≤ 16.8 kB / ≤ 45.3 kB |

Measured on the production lab build (Chromium, M-series Mac):

| | 1× CPU | 6× CPU |
| --- | ---: | ---: |
| Pick → sound | 0.92 s | 0.92 s |
| Pick → sound, reduced motion | 0.03 s | 0.08 s |
| Long tasks over 50 ms: the player mounting and painting the prints, the flight in, a pick, a swap, the keys | none | none |
| Media elements, `decodeAudioData` calls, audio contexts of the radio's own | 1, 0, 1 | |

## Modules

```
radio/
  RadioSlot.tsx            the room host's entry: loading policy, the portal, the failure message (main bundle)
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
    RadioControls.tsx      CDs, transport, caption, hint, live region, focus, Escape
    TransportBar.tsx       the touch bar and rail
    radioHints.ts        ★ the radio's teaching line
    icons.tsx              the transport's pixel glyphs
    RadioControls.css
  lab/                     FakeDeck + main.tsx (served by radio-lab.html)
a11y/roving.ts           ★ the toolbars' roving tabindex (shared with the PC reader)
content/radio/
  types.ts, albums.ts      the shelf
  files.ts                 the files' bundled URLs
  audioFiles.ts          ★ MP4 and MP3 lengths, codecs and box order without decoding
  validate.ts              the shelf's rules (pnpm verify:radio, albums.test.ts ★)
```

★: unit-tested next to the code. End to end: `e2e/radio-player.spec.ts` on the lab, real media in Chromium under the strict autoplay policy (`--autoplay-policy=document-user-activation-required`).
