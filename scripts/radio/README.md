# Placeholder albums (authoring)

Placeholder albums for the CD player are made here, by code: five original albums that stood on the shelf until Roel's own songs replaced them (docs/RADIO.md › The shelf), kept so a shelf can be filled again without anyone's music.
The script writes into `src/content/radio/albums/`; an album also needs its entry in `albums.ts`.
Nothing in this folder runs in the site or in `pnpm build`.
Everything is original: music composed for this site in the game's own tracker, and seeded generative art with no text, logos or marks.
To put your own albums on the shelf instead, see docs/RADIO.md › Your own albums.

```sh
pnpm build:radio-placeholders                      # covers, disc prints and audio for every album
pnpm build:radio-placeholders --only low-tide      # one album (comma-separated for more)
pnpm build:radio-placeholders --covers-only        # just the art
pnpm verify:radio                                  # then check the shelf; paste any lengths it prints
```

Needs macOS for the audio (Apple's `afconvert`, an authoring-only tool; no ffmpeg needed) and the repository's Playwright Chromium.
A full run takes about two minutes.

## Music (`songs/`)

One tracker `Song` per track (`@/engine/audio/sequencer`), played on the game's band (`@/game/audio/instruments`) plus a few patches of their own (`songs/instruments.ts`): a worn FM e-piano, tape hiss and seeded vinyl crackle, slow pads and harbour bells, a saw bass and a gated snare, brushes, a flute and a vibraphone.
Every song is a one-shot with a real intro and ending, not a loop.

| Album | Artist | Style | Tracks |
| --- | --- | --- | --- |
| `night-shift` Night Shift | Studio Attic | lo-fi, 82 bpm, F minor, swung sixteenths | Kettle On, Window Seat |
| `insert-coin` Insert Coin | 8-Bit Lodgers | chiptune, 150 bpm, C major, the game's pulse and triangle band | Attract Mode, High Score Dreams, Continue? |
| `low-tide` Low Tide | Harbour Lights | ambient, 68 bpm, D Lydian pads and FM bells | Slow Water, Lighthouse |
| `solar-drive` Solar Drive | Neon Rafters | synthwave, 104 bpm, A minor | Overdrive, Last Exit |
| `sunday-roast` Sunday Roast | Trio Placeholder | bossa nova, 126 bpm, E♭ major sevenths | Coffee Break, Encore |

`songs/index.ts` lists each album's songs in track order with the file's slug (`01-kettle-on.m4a`).

## Rendering (`render-placeholders.ts`, `render.html`, `render-page.ts`)

`render-placeholders.ts` starts a private Vite server and Playwright's Chromium and opens `render.html`, whose `render-page.ts`:

1. renders the song offline through the game's own synth, track player and master bus (`renderSong`), as the game would play it;
2. matches its gated loudness (`measure().loudnessDb`) to one pass of the game's `level-luna`, re-rendering at a corrected track gain (the master bus compresses, so loudness is not linear in gain) and applying what is left as a plain gain, never above −1.2 dBFS;
3. trims the tail where the last echo falls below −66 dBFS, fades out the last 50 ms and returns a 16-bit WAV.

The script then encodes it with `afconvert -f m4af -d aac -s 3 -u vbrq 64` (AAC-LC, VBR, about 80 kb/s, `moov` before `mdat` so it streams), checks the loudness is within 1 dB of the game's, the codec and the box order, and that all the audio stays under 5.5 MB.

## Art (`covers.ts`)

A seeded painter per album draws SVG that sharp rasterises into `cover.webp` (512², opaque, WebP q80, at most 40 kB) and `disc.webp` (512² RGBA, at most 60 kB): the ink of the print where its mask is white, bare silver foil where it is clear. The label area on the disc runs from 23 mm to 58.5 mm of its 60 mm radius; the player adds the rim text itself.

| Album | Cover | Disc print |
| --- | --- | --- |
| Night Shift | a night skyline with lit windows under a lamp-coloured moon | the skyline round the lower half of the label, its windows and the stars in foil |
| Insert Coin | a formation of seeded pixel creatures and a coin over scanlines | the creatures marching round in foil |
| Low Tide | tide lines on a grey-green sea, a lighthouse and its beam | the tide straight across the label and the beam in foil (no rings: a CD's print, not a record's grooves) |
| Solar Drive | a banded sun over a perspective grid | the sun's bands and the grid in foil |
| Sunday Roast | overlapping plates on a gingham cloth | foil dots between the plates |

`pnpm exec tsx --tsconfig tsconfig.node.json scripts/radio/covers.ts` runs the art alone.
