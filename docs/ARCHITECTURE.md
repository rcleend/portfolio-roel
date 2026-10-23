# Architecture

Roel's portfolio is a 16-bit arcade game running on a CRT television inside a 3D attic room.
This document is the contract every module is built against. If code and this document disagree, fix one of them in the same change.

## Experience in one paragraph

The page opens zoomed in on the television: bezel, power button and a little of the room around it are visible.
The TV powers on (CRT line-expansion), plays a Neo Geo-style boot ("ROEL"), then a Metal Slug-style title ("PRODUCT ENGINEER").
Any button leads to a character select (three sides of Roel, each with two skills), then a mission select (one mission per employer: Luna in San Francisco, Scripe in Berlin), then a short side-scrolling level whose collectibles are real career highlights.
Clicking outside the TV pulls the camera back to the whole room and pauses the game; clicking the TV zooms back in and resumes.
Without WebGL the same game runs in a flat, CSS-framed TV. A semantic HTML résumé carries the same content for screen readers, crawlers and visitors who would rather read than play.

## Layers

```
src/
  content/   Portfolio data (CV as typed data). No imports outside itself.
  engine/    Generic 16-bit game engine. Knows nothing about Roel, three.js or React.
  game/      The portfolio game: scenes, entities, art, audio data. Uses engine + content.
  room/      The three.js attic room that presents a GameSurface on a CRT. Uses engine types only.
  app/       React composition root: picks a host, wires game + room + overlays + résumé.
```

Allowed imports (enforced by `src/architecture.test.ts`):

| from \ to | content | engine | game | room | app |
| --------- | ------- | ------ | ---- | ---- | --- |
| content   | yes     |        |      |      |     |
| engine    |         | yes    |      |      |     |
| game      | yes     | yes    | yes  |      |     |
| room      |         | types  |      | yes  |     |
| app       | yes     | yes    | yes  | yes  | yes |

`room` may import only *types* from `engine` (the `GameSurface` contract), never runtime game code.

## Rendering model

- The game renders into a single native-resolution canvas: **320 × 240** (4:3, square pixels), `imageSmoothingEnabled = false`, every draw call snapped to integer pixels.
- The game never applies display effects. Scanlines, glow, curvature and power-on/off animation belong to the host that presents the canvas (CRT shader in the room, CSS in the flat host).
- Simulation runs at a fixed **60 Hz** step with an accumulator (max 5 catch-up steps per animation frame). Rendering happens once per animation frame.
- All motion is a function of scene time accumulated from fixed steps, so frame N always looks the same. This is what makes screenshots and tests deterministic.

## Engine (`src/engine`)

```
engine/
  core/     Game (loop), Scene, Director (typed scene switching + transitions), GameSurface
  gfx/      Gfx (pixel-snapped drawing), PixelArt (sprite definitions + compiler), SpriteSheet (+ PNG/JSON spec),
            BitmapFont + TextStyle (crisp styled text), Parallax, Camera2D, color/dither helpers
  input/    InputManager<Action> (keyboard, gamepad, virtual buttons, host-injected pointer)
  audio/    AudioService contract, NullAudio, WebAudio synth + sequencer
  motion/   easing, progress/segment helpers, oscillators (blink, wobble, shake)
  math/     Vec2, Rect (AABB), seeded Rng, clamp/lerp
  assets/   AssetStore (preloads images and fonts)
```

### Scene

```ts
interface Scene<P = void, A extends string = string> {   // engine/core/Scene.ts
  enter(params: P): void;      // become active
  exit(): void;                // release resources
  update(step: Step<A>): void; // fixed 60 Hz
  render(gfx: Gfx): void;      // draw current state; never mutates state
}
interface Step<A> { readonly dt: number; readonly frame: number; readonly input: InputSnapshot<A> }
type GameScene<P = void> = Scene<P, Action>;              // game/scenes/params.ts, with GameStep = Step<Action>
```

The director creates a fresh scene instance on every `goTo`, so scenes never reset themselves.
Scenes own their elapsed time (`this.time += step.dt`). Choreography reads that time through `motion/progress` helpers, e.g. `segment(time, 1.2, 1.6, easeOutCubic)` returns 0 → 1 across that window.

### Director

`Director<M>` holds scene factories keyed by id and switches between them with typed params:

```ts
type SceneParamsMap = { boot: void; title: TitleParams | undefined; characterSelect: void; levelSelect: LevelSelectParams; level: LevelParams; stageClear: StageClearParams };
director.goTo('level', { levelId: 'luna', characterId: 'artsy' }, transitions.iris());
```

`goTo(id, params, transition?)`: params may be omitted only for `void` scenes (`goTo('characterSelect', undefined, fade())`); no transition means a cut.
Transitions are render-time overlays built by factories in `engine/core/transitions.ts`: `cut()`, `fade({ color, duration, levels })`, `flash({ color, duration })`, `iris({ x, y, duration })`, `wipe({ direction, duration })`, `pixelDissolve({ block, seed, duration })`.
The old scene is covered (`out`), swapped at full coverage, and the new one revealed (`in`); fades step through flat levels rather than gliding.
Scenes keep animating during a transition but receive idle input, so nothing can be triggered mid-switch.
A `goTo` issued from a scene's `update` applies right after that update returns; one issued during a transition is queued (latest wins).
`director.current`, `director.transition` and `onSceneChange(listener)` expose state to hosts, audio and the harness.

### GameSurface (the host contract)

Hosts present the game and feed it pointer input. They depend on this interface only:

```ts
interface GameSurface {
  readonly canvas: HTMLCanvasElement;          // native 320×240 pixels
  readonly width: number;
  readonly height: number;
  onFrame(listener: () => void): () => void;   // pixels changed; returns unsubscribe
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  setInputEnabled(enabled: boolean): void;     // keyboard/gamepad only while the TV has focus
  readonly pointer: PointerSink;               // native-pixel pointer events mapped by the host
}
interface PointerSink { move(x: number, y: number): void; leave(): void; down(): void; up(): void }
```

The room host maps a raycast hit on the TV screen mesh (UV 0–1) to native pixels; the flat host maps DOM coordinates.

### Input

`InputManager<A extends string>` turns bindings into one immutable `InputSnapshot<A>` per fixed step: `isDown(a)`, `wasPressed(a)`, `wasReleased(a)`, `anyPressed` (any action or a pointer press), `pointer` (`x`, `y`, `over`, `down`, `pressed`, `released`) and `lastDevice` (`keyboard`, `gamepad`, `pointer`, `touch`).
Edges are never lost: a key tapped between two steps reports both `wasPressed` and `wasReleased` on the next step, and a second key bound to an already-held action does not press it again.
Keyboard listens on `window` and is captured (and `preventDefault`ed) only while enabled and only for bound keys; the gamepad is polled with the standard mapping; `input.virtual.press(action)` / `release(action)` serve the touch pad and the harness.
Bindings live in the game (`game/input/bindings.ts`):

| Action  | Keyboard            | Gamepad (standard) |
| ------- | ------------------- | ------------------ |
| left/right/up/down | Arrows, WASD | D-pad, left stick |
| jump    | Z, Space, ↑, W      | A                  |
| attack  | X, J                | X                  |
| skill1  | C, K                | Y                  |
| skill2  | V, L                | B                  |
| confirm | Enter, Space, Z     | A, Start           |
| back    | Escape, Backspace   | B                  |
| pause   | Escape, P, Enter    | Start              |

Touch devices get an on-screen pad (React overlay) that presses the same actions through the virtual source.

### Gfx

`Gfx` wraps the native 2D context and rounds every coordinate to whole pixels: `clear(color)`, `pixel`, `fillRect(x, y, w, h, fill)` where `fill` is a colour or a banded gradient `{ stops, bands, direction?, dither?: 'bayer2' | 'bayer4' }`, `rect` (1 px outline inside the box), `line` (Bresenham), `circle(cx, cy, r, color, filled?)` (midpoint), `image(img, x, y, { source, flipX, alpha })`, `sprite(...)`, `text(...)`, `measureText(...)`, and the scoped helpers `withAlpha`, `withClip`, `withOffset`. The raw context is `gfx.ctx`, smoothing already off.
Also in `engine/gfx`: `drawParallax(gfx, layers, cameraX, cameraY?, time?)` with per-layer `factor`, `y`, `factorY`, `repeatX` and `drift`; `Camera2D` (`follow` with dead zone, bounds clamp, `shake(intensity, seconds)`, whole-pixel `view`); `drawNineSlice` (tiles, never stretches); colour helpers (`mix`, `shade`, `bandColors`) and Bayer dithering.

### Pixel art

Sprites are authored as data and compiled to canvas atlases at startup:

```ts
interface PixelArtSheet {
  readonly palette: Readonly<Record<string, string>>; // one-char key → '#rrggbb' | '#rrggbbaa'; '.' is transparent
  readonly size: { readonly w: number; readonly h: number };
  readonly origin?: { readonly x: number; readonly y: number }; // default: bottom-centre
  readonly animations: Readonly<Record<string, PixelArtAnimation>>;
}
interface PixelArtAnimation { readonly fps: number; readonly loop: boolean; readonly frames: readonly (readonly string[])[] }
```

Each frame is `size.h` strings of exactly `size.w` characters. The compiler validates this and throws a `PixelArtError` naming the animation, frame, row and column.
Write frames with the `pixels` template-literal helper (one row per line, indentation trimmed) so formatters leave the shapes alone.
`SpriteSheet.compile(sheet, name)` builds one atlas; `gfx.sprite(sheet, animation, time, x, y, { flipX, alpha, flash })` draws the frame for `time` seconds with the origin at (x, y).
Sheets can also come as a PNG with a JSON spec (one row per animation, docs/LOOKS.md): `parseSpriteSheetSpec(json, source)` validates it with errors naming the file and field, and `SpriteSheet.fromImage(image, spec, name)` plays it through the same API, checking the PNG's size against the spec.
All sheets face right; draw with `flipX` to face left. `sheet.duration(a)`, `frameIndex(a, t)` and `isFinished(a, t)` drive timing.
Image sheets may name pixels per frame (`anchors`): `sheet.anchor(a, name, t)` returns the one on show in frame pixels, and `sheet.toScreen(point, x, y, flipX)` the screen pixel that shows it when drawn at (x, y), mirrored with the sprite.

The heroes, the customer and the skill icons are drawn through the selected *looks* (see Looks below); classic's are pixel art assembled from one shared body rig (`game/art/looks/classic/rig.ts`: shared legs and arms, per-character head, torso, palette and props), so a crew can redraw a piece without touching the rest.

### Text

`BitmapFont` builds a 1-bit glyph atlas, either from a pixel TTF rendered at its native size and alpha-thresholded, or from glyph data.
`TextStyle` composes fill (solid or banded vertical gradient), 1px outline and drop shadow into a cached styled atlas, so arcade lettering like "INSERT COIN" stays crisp at native resolution.
Fonts are self-hosted (`@fontsource/*`, OFL) and loaded before the first frame.

| Font     | Source                                         | Use                                               |
| -------- | ---------------------------------------------- | ------------------------------------------------- |
| `small`  | hand-drawn glyph data (`game/art/fonts/small.ts`), 7 px caps, proportional | body copy; ~28 characters in ~125 px |
| `label`  | Silkscreen Bold 8 px (`@fontsource/silkscreen`), 1 px tighter tracking | labels, HUD                     |
| `arcade` | hand-drawn glyph data (`game/art/fonts/arcade.ts`), 11 px caps, 2 px strokes | display prompts (caps only) |

Named styles (`services.text`): `body`, `label`, `prompt` (white → lavender, navy outline and shadow: the INSERT COIN look), `title` (orange bands, dark-red shadow), `hud` (outlined), `tooltip` (navy on cream).
Draw with `gfx.text(text, x, y, style, { align, maxWidth })`, where (x, y) is the top-left of the first glyph cell and `align` anchors each line on `x`; it returns the laid-out block.
Derive variants inline (`{ ...text.label, fill: palette.gold }`): styled atlases are cached by value.
`gfx.measureText`, `layoutText` and the pure `wrapText` size text without drawing, `textBounds` gives the box drawn text covers, outline and shadow included, and `textInk` the box of pixels it actually paints, for lining text up by its ink; `?scene=specimen` shows every font, style, sprite and widget.

### Audio

```ts
interface AudioService<MusicId, SfxId> {                     // engine/audio; the game uses GameAudio = AudioService<MusicId, SfxId>
  unlock(): Promise<void>;                                   // call from a user gesture; creates and resumes the context
  playMusic(id: MusicId, options?: { loop?: boolean; fadeInMs?: number }): void; // same id again is a no-op
  stopMusic(options?: { fadeOutMs?: number }): void;
  playSfx(id: SfxId, options?: { pan?: number; detune?: number }): void;
  setPaused(paused: boolean): void;                          // freeze/thaw everything in place (camera leaves the TV)
  muted: boolean;                                            // the app persists it in the session
}
```

All sound is synthesised with WebAudio, so there are no audio files. `WebAudioService` (the default where WebAudio exists; `NullAudio` otherwise, and in tests) creates its context on the first `unlock()`, so nothing touches audio before a gesture. Music requested earlier starts on unlock (a one-shot such as the boot jingle joins at the position it would have reached); effects requested while locked, paused or hidden are dropped. The context runs only while unlocked, not paused and the page is visible.

```
engine/audio/
  synth/       Patch (pulse with duty, triangle, saw, sine, white/metallic noise, 2-operator FM), ADSR, vibrato,
               sweeps, legato slides, arpeggios and chords; playVoice() builds one note's nodes on the audio clock
  sequencer/   tracker songs: lanes of text compiled to tick events (song.ts), swing timing, SongCursor (loop-aware windows)
  music/       TrackPlayer (one playing song + channel strips + echo) and MusicDeck (crossfades)
  sfx/         SfxRecipe (voices placed in time), SfxLimiter (cooldown, per-effect and global polyphony caps)
  mix/         Mixer: music and sfx buses → master → compressor → soft clipper → mute; tempo-synced echo; meter
  offline.ts   renders a song or effect through the same chain on an OfflineAudioContext
```

Songs are written in TypeScript as lanes, one per channel (`sequencer/lane.ts` documents the syntax): bars separated by `|`, each bar's tokens sharing it evenly (4 tokens are quarters, 16 are sixteenths, 12 triplet eighths); `C4`, `F#3`, `Bb5` notes, `.` hold, `-` release, `~E4` legato slide, `C4[47]` hex intervals (an arpeggio, or a chord on `play: 'chord'` channels), `:0`–`:9` velocity, and lowercase kit pieces on drum channels. Patterns combine lanes; `sequence: ['intro', 'A', 'A+5']` arranges and transposes them; `loopFrom` sets the loop point. Notes are scheduled with a 200 ms lookahead on the audio clock, so timer jitter never moves a note.

The game's audio lives in `game/audio/`: `ids.ts` (`MUSIC_IDS` / `SFX_IDS`), `instruments/` (the shared band of patches and the drum kit), `music/` (one song per `MusicId`), `sfx/` (one recipe per `SfxId`) and `createGameAudio()`. `audio-lab.html` (development only) plays every track and effect and measures offline renders; `e2e/audio.spec.ts` asserts no NaNs, peaks below -1 dBFS, track loudness within 3 dB of the mean, short fully-decayed effects, and live unlock, mute, pause and hidden-tab behaviour; `scripts/audio-report.ts` prints the level table.

## Game (`src/game`)

```
game/
  createGame.ts        composition: builds services, registers scenes, returns Game + GameSurface
  resources.ts         loadGameResources: fonts, text styles and level art, loaded once per page
  composeServices.ts   ties services and scenes together, for createGame and scene previews alike
  services.ts          GameServices: director, audio, fonts, text, looks, assets, levelArt, session, rng, settings
  preview/             scenes shown in isolation for the playground: createPreviewServices, ScenePreview
  palette.ts           shared UI colours
  session.ts           persisted progress (localStorage, versioned schema)
  input/bindings.ts    Action union + default bindings
  audio/               ids, music (tracker data), sfx (synth recipes)
  fonts.ts             font registry and named TextStyles
  scenes/              boot, title, character-select, level-select, level, stage-clear
  ui/                  pixel UI widgets: Window, Tooltip, Button, KeyHints, TypewriterText, Hud
  entities/            player, unhappy customer, projectiles, pickups, platforms, hazards
  skills/              one module per SkillId implementing the shared Skill behaviour contract
  world/               level runtime: tile grid, AABB collision, layout DSL + validation, camera, World, autopilot
  levels/art/          LevelArt loader: validates each layers.json, preloads its PNGs, exposes parallax layers, Tileset and PropSheets
  levels/<levelId>/    level map, theme, generated parallax art + layers.json (tools/art/README.md)
  art/                 looks (looks/: one folder per look, classic included), shared fx sheets, fonts, procedural logos (logos/); scene-only art lives in its scene folder
```

`GameServices` (`director`, `audio`, `fonts`, `text`, `looks`, `assets`, `levelArt`, `session`, `rng`, `settings.reducedMotion`) is created once in `createGame.ts` and passed to every scene's constructor; scenes never reach for globals.
The playground builds one per scene preview instead, with `createPreviewServices` (Development harness › Playground).
`createGame(options)` resolves to `{ game, surface, services }`, stopped and without a scene: the app picks the first scene and starts the loop. `options.looks` picks the looks (a partial `LookSelection`).

Scene registry (`game/scenes/index.ts`): each feature crew owns one folder and replaces its stub in place, keeping the class name and the `constructor(services: GameServices)` signature, so the registry never changes.

| Scene id          | File                                               | Params                |
| ----------------- | -------------------------------------------------- | --------------------- |
| `boot`            | `scenes/boot/BootScene.ts`                         | none                  |
| `title`           | `scenes/title/TitleScene.ts`                       | `{ lockup?, backdrop? }` (variant ids) |
| `characterSelect` | `scenes/character-select/CharacterSelectScene.ts`  | none                  |
| `levelSelect`     | `scenes/level-select/LevelSelectScene.ts`          | `{ focus?: LevelId }` |
| `level`           | `scenes/level/LevelScene.ts`                       | `{ levelId, characterId }` |
| `stageClear`      | `scenes/stage-clear/StageClearScene.ts`            | `{ levelId, characterId, result: LevelResult }` |
| `specimen` (dev)  | `scenes/specimen/SpecimenScene.ts`                 | `{ page?: 0–3 }`      |
| `showcase` (dev)  | `scenes/showcase/ShowcaseScene.ts`                 | `{ demo?, hero?, skill?, levelId? }` (see Looks) |
| `lineup` (dev)    | `scenes/lineup/LineupScene.ts`                     | `{ cast?: 'terraria' \| 'game', backdrop?: 'menu' \| LevelId }` |

Stubs draw a yellow `STUB · NAME` banner (`scenes/StubBanner.ts`); delete it once every stub is replaced.
A development scene may draw art the game itself never loads, such as the lineup's Terraria designs: `preloadSceneArt(id, assets)` (`scenes/index.ts`) fetches it, and the harness awaits it before opening that scene; the playground loads the designs up front with everything else.

UI kit (`game/ui`): `drawWindow(gfx, rect, windowThemes.indigo | steel | cream, { title })` with `windowContent(rect)` for the inner area; `Tooltip` (pops in over four frames with a 1 px overshoot); `Button` (pointer and focus, activates on release); `KeyHints` (the clickable ⏎ CONFIRM ⌫ BACK legend that closes both select screens' controls: keys light while pointed at, sink while pressed and click on release, and `HINT_COLORS` and `legendGlyphTop` keep other legends in step); `Paragraph` (wrapped once, can render the first N characters); `TypewriterText`; `handCursorSheet`. Shared UI colours live in `game/palette.ts`.
Both select screens stand on the blueprint title's paper: `printOnPaper(pattern)` (`scenes/title/backdrops/blueprint/sheet.ts`) paints it as the title lights it, with a screen's own lines a ramp step above, so the menus and the title cannot drift apart.

### Title variants

The title's look is a **lockup** on a **backdrop**, picked by the `title` params, so variants can be compared side by side; the default pair is the `classic` lockup on the `blueprint` backdrop (docs/ART-DIRECTION.md › Title).
`TitleScene` keeps the choreography both play to: `TITLE_TIMES`, the slide and its ease, the lock shake, the white flash, the glint's timing, the prompt and copyright, input, audio and the attract loop.

- A lockup (`scenes/title/lockups/TitleLockup.ts`) is the logo lines, the name and the trademark. Its `prepare()` paints it once and returns a `LockupArt`: `draw(gfx, travel)` at any point of the slide (`travel` runs from `SLIDE_DISTANCE` down to 0, settled), the settled `bounds` and the `glint` targets.
- A backdrop (`scenes/title/backdrops/TitleBackdrop.ts`) is everything behind the lockup, plus an optional layer in front of it and under the prompt and flash. Its `prepare()` paints the static art once and returns a `BackdropArt`: `drawBehind(gfx, frame)` and an optional `drawInFront(gfx, frame)`, both pure functions of a `TitleFrame` (intro `time`, the `beats`, `reducedMotion`, `screen`, the `impact` point and the settled `lockupBounds`). The contract's doc comment says how a backdrop should behave across the beats, from the opening hit to the idle loop.
- Each variant is a folder, `lockups/<id>/` or `backdrops/<id>/`, whose `index.ts` exports `{ id, name, description, prepare }`, and is listed in `lockups/index.ts` or `backdrops/index.ts`: adding one is a folder plus an import and an entry in that list. `TitleLockupId` and `TitleBackdropId` derive from the lists.
- Params are `{ lockup?: TitleLockupId; backdrop?: TitleBackdropId }`. Whatever they leave out comes from `TITLE_DEFAULTS` (`scenes/title/variants.ts`), so promoting a winner is a one-line change; unknown ids throw, naming the registered ones. The boot's black frames paint the default title with `prepareTitle()`.
- Every registered variant gets a live tile on `/playground` (Development harness › Playground).
- `scenes/title/variants.test.ts` covers every registered variant: unique ids, every beat drawn with and without reduced motion, drawing as a pure function of its input, seeded randomness only, and lockup bounds that cover the settled drawing, on screen and above the prompt.

Preview a variant through the harness (`?scene=title&params={"lockup":"classic","backdrop":"classic"}`) or with `pnpm shot`:

```sh
pnpm shot --scene title --params '{"backdrop":"classic"}' --frames 0:180:6 --scale 1 --out .shots/intro.png  # the intro, every 6th frame
pnpm shot --scene title --params '{"lockup":"classic"}' --frames 200 --out .shots/settled.png                 # settled, ×3
```

### Levels

A stage is a `StageDefinition` (`world/stage.ts`): a layout written in the text DSL of `world/map/layout.ts` (one character per 16 px tile, sections laid side by side; legend in `LEGEND`) plus a theme that dresses generic markers in the level's props (a moving platform is a cable car in `levels/luna/theme.ts`, a U-Bahn in `levels/scripe/theme.ts`).
`scenes/level/stages.test.ts` validates every stage against the player's jump (reachability, one "?" block per career highlight, markers on the ground).
`World` (`world/World.ts`) owns the simulation and reports `WorldEvent`s; `LevelScene` owns flow (intro, highlight cards, pause, respawn, finale), sound, HUD and overlays.
Skills implement `Skill` (`skills/Skill.ts`): `cast(world)` returns an `ActiveSkill` that is stepped until `done` and declares its rule changes as `modifiers`; cooldowns live in `SkillSlot`. How a skill looks belongs to its look (below).
Level params also accept development switches (`scenes/level/devOptions.ts`): `debug: "hitboxes"`, `startAt` (checkpoint index or `"arena"`), `skipIntro`, and `autopilot` (an attract-mode demo used by `scripts/level-tour.ts` and `e2e/level.spec.ts`).

### Looks

The heroes, the customer and every skill (icon and in-game effect) are drawn in a *look*: `classic`, the shipped art, or one of the new styles, chosen per piece without touching play. docs/LOOKS.md is the asset contract for drawing one.

- **Selection** (`art/looks/selection.ts`): a `LookSelection` maps every hero, the customer and every skill to a `LookId` (`classic | arcade | portrait | hibit`). `DEFAULT_LOOKS` is the one constant the game ships with, classic everywhere. `parseLookSelection` reads untrusted JSON as a partial `LookSelectionInput`; `resolveLooks(input, offer)` fills in the defaults and rejects unknown ids, or a piece a look has not drawn, naming what exists.
- **Registry** (`art/looks/registry.ts`): each piece is a folder whose `index.ts` exports `look`, built with `defineHeroLook`, `defineCustomerLook` or `defineSkillLook` (`module.ts`). `import.meta.glob` finds `looks/*/characters/*/index.ts`, `looks/*/customer/index.ts` and `looks/*/skills/*/index.ts`, validates the folder names at startup, and keeps each piece in its own chunk; `lookRegistry.offer` lists the looks each piece has.
- **Loading** (`art/looks/load.ts`): `loadLooks(selection, assets)` fetches only the selected pieces, holds each sheet to its kind's contract (`contracts.ts`: animations; 64 × 64 frames on a bottom-centre origin for heroes and the customer, 24 × 24 icons) and fills whatever a look leaves out (a hero's attack, a skill's icon or visual parts) from classic. `loadLookLibrary(assets)` loads every piece of every look and assembles any selection synchronously, for the playground.
- **Drawing** (`art/looks/Looks.ts`): `services.looks` holds `characters[id]` (`sheet`, `attack`), `customer` (`sheet`) and `skills[id]` (`icon`, `visual`); scenes and entities draw only through it and lay out from the sheets' sizes, with classic's numbers as the floor (icon slots in `ui/iconSlot.ts`, the HUD portrait, the select card, the results tally, the specimen; everything above a customer rises with a taller look via `overheadLift`).
- **Visual seams**: behaviour keeps timing, damage, targeting and every random roll, and hands read-only state to the look.
  - A hero's basic attack is an `AttackShot` flying as `PRIMARY_ATTACKS` says, drawn by the hero look's `AttackVisual` (`entities/shots/AttackVisual.ts`): `shot`, then `impact` and `hit` for the `AttackImpact`s wrapping the world's spark bursts where the shot ended and on the customer it hit. A `muzzle` anchor on the first `attack` frame shifts all three on screen from the simulated hand (`entities/shots/launch.ts`); hits stay put. `spriteAttack` (`art/looks/spriteAttack.ts`) builds one from a single strip, pairing each shot's variant with its impact and muzzle through the shot's `index`.
  - A skill's `ActiveSkill` exposes its typed state (`SkillVisualTypes` in `skills/SkillVisual.ts`) and renders through `looks.skills[id].visual.active` with a `CasterSnapshot` (the caster, its sprite height and the current frame's anchors in world pixels). Its shots draw through `visual.shot`; what it leaves in the world (hit sparks, sparkles, rings, stuns, impacts, its end) is a `SkillEffect` drawn through `visual.effect`, kept at least `LOOK_EFFECT_SECONDS` so a look's animation can finish. A skill hands `SkillWorld.hit` a `spark` wrapper so even the spark on a customer it hits is its look's; `visual.customer` draws over every customer under its rule (UX ELIXIR's calm heart).
  - Shared feedback — a stomp's spark, heart and +MRR, complaint bubbles, dust — belongs to no look.
- **Showcase** (`scenes/showcase/`): a development scene looping one deterministic demo on a one-screen stretch of a real stage, with the real `World`, entities, skills and effects: `{"demo":"moves","hero":"artsy"}`, `{"demo":"skill","skill":"power-chord"}` (cast by its owner) or `{"demo":"customer"}`, in Berlin unless `"levelId":"luna"`. A `ScriptedInput` plays timed beats as the hero's input from outside the world, and every loop rebuilds the world with `DEMO_SEED`, so loops are seamless and frames reproducible.

Preview any look through the harness (`?scene=showcase&params=…&looks=…`) or with `pnpm shot`:

```sh
pnpm shot --scene showcase --params '{"demo":"skill","skill":"power-chord"}' --looks '{"skills":{"power-chord":"arcade"}}' --frames 0:270:15 --out .shots/chord.png
pnpm shot --scene specimen --params '{"page":1}' --looks '{"characters":{"hackerman":"hibit"}}' --frames 30 --out .shots/heroes.png
```

### Session

```ts
interface SessionState {
  version: 1;
  characterId: CharacterId | null;
  completed: LevelId[];
  highlights: Partial<Record<LevelId, string[]>>; // collected Highlight ids
  bestScore: Partial<Record<LevelId, number>>;
  bootSeen: boolean;
  muted: boolean;
}
```

`SessionStore` (`services.session`) loads on start, `update(state => next)` persists immediately, unknown ids and wrong types are dropped, and storage failures degrade to an in-memory session.

## Room (`src/room`)

A vanilla three.js stage that loads the attic room exported from Blender (`public/room/`), shows a `GameSurface` on the TV through a CRT `ShaderMaterial`, and owns the camera rig:

- `tv` viewpoint: straight-on, framing the whole TV (bezel, controls, power button) plus a margin of lit surroundings; computed from the TV's bounding box and the viewport aspect.
- `room` viewpoint: the whole room.
- Clicking outside the TV while focused moves to `room` and pauses; clicking the TV moves to `tv` and resumes.
- Other props register as `Interactable`s with a hit test and an `activate()` hook, so future interactions (PC, radio, PlayStation, guitar, posters) plug in without touching the TV logic.

Rendering is on demand: 60 fps while the TV is focused and the game runs, otherwise only on camera motion, lava-lamp animation (24 fps, only when visible) or resize.

## App (`src/app`)

React 19 composition root. It starts `createGame` before the first render, chooses a host (`room` when WebGL is available, otherwise `flat`; overridable with `?host=`), and renders overlays: loading screen, sound toggle, view hint, touch pad, and the accessible résumé.

Startup is a pure state machine (`app/startup/startup.ts`): `loading` (game assets, then the room's three.js chunk and models, one segmented bar) → `revealing` (the NOW LOADING screen steps out over the dark TV) → `powering` (the host lights the tube; `power-on` sfx) → `running` (only now `startGame` picks the first scene, so its first frame lands on a live tube). `#game[data-phase]` exposes the phase to tests.

Hosts receive `HostProps` (`app/hosts/types.ts`): the `surface`, `powered` (light the tube once true), `insets` (CSS-pixel strips covered by overlays) and `events` (`onProgress`, `onReady(kind)`, `onPoweredOn`, `onViewChange`). `app/hosts/index.ts` maps host kinds to components.
`RoomHost` lazy-loads `@/room`, creates exactly one room (StrictMode safe) and disposes it on unmount; it hands the room a `FocusGatedSurface`, so keyboard and gamepad reach the game only while the room wants it *and* the stage element has focus. Any failure (no WebGL, chunk or model download) falls back to `FlatHost` in place. In the room view, Enter or Space on the stage returns to the TV.
The flat host shows the canvas at the largest integer zoom inside a CSS television with scanlines and vignette, runs a CSS power-on, maps DOM pointer coordinates to native pixels, and enables keyboard input only while the screen has focus.
Overlays: the sound toggle persists `session.muted`; audio unlocks on the first gesture anywhere and is paused (`audio.setPaused`) while the camera is in the room view. The view hint teaches "look around" and "come back" and retires each line once done (`localStorage` `reo-leo:view-hints`). On coarse pointers a Neo Geo-style pad (D-pad, JUMP/ATTACK/SKILL 1/SKILL 2, START) presses the actions of the matching gamepad buttons through `game.input.virtual`, multi-touch, shown only in the TV view; its covered strips become the room's framing insets.
`openLink` (passed to `createGame`) opens `mailto:` in place and `https:` in a `noopener` tab, and refuses anything else.
`app/playground/` is the composition root of a second, development-only page, the playground (Development harness › Playground).
The résumé (`app/resume/Resume.tsx`) is real HTML rendered from `src/content` and is always in the DOM; it is visually hidden until the "Skip to résumé" link (first in tab order, visible on focus) targets it. `index.html` carries meta/Open Graph tags, a JSON-LD `Person` and a `<noscript>` summary, kept in step with `src/content` by `app/indexHtml.test.ts`.

## Development harness

URL parameters (honoured in development, or in production with `?debug`):

| Param     | Effect                                                        |
| --------- | ------------------------------------------------------------- |
| `host`    | `room` or `flat`                                              |
| `scene`   | start directly in a scene id                                  |
| `params`  | JSON scene params for `scene`                                 |
| `seed`    | seeds the game RNG                                            |
| `frames`  | step this many frames synchronously, then pause (screenshots) |
| `looks`   | JSON `LookSelectionInput`: which look each piece is drawn in   |

`window.__arcade` exposes `{ game, goTo(scene, params?, transitionName?), step(frames), pause, resume, press(action, frames), state() }` and `window.__arcadeReady` turns true when the requested frame is on screen.
`press` holds the action for `frames` steps, releases it and steps once more; `state()` returns `{ scene, transition, frame, paused, session }`.

`pnpm shot` captures screenshots through Playwright:

```sh
pnpm shot --scene title --frames 150 --out .shots/title.png        # native canvas, scaled ×3 nearest-neighbour
pnpm shot --scene boot --frames 0:480:30 --out .shots/boot.png      # contact sheet every 30 frames
pnpm shot --host room --out .shots/room.png --page                  # full page
```

More options: `--params <json>`, `--looks <json>`, `--scale <n>` (default 3), `--cols <n>` for sheets, `--seed <n>` (default 1), `--viewport WxH` for `--page`.
The script uses the dev server given by `--url`, otherwise starts Vite from the current checkout on a free port, and fails on any page error. Set `E2E_PORT` to give each checkout its own end-to-end server.

### Playground

`/playground` on the dev server (`playground.html`, development only) compares title variants live and side by side, to pick winners.
The **Title lockup** board shows every registered lockup on one backdrop and the **Backdrop** board every registered backdrop behind one lockup, each with a picker for the half they share.
The **Characters**, **Skills** and **Customer** boards give every hero, every skill (grouped by hero) and the customer a row with a tile per registered look (docs/LOOKS.md), each playing its showcase demo; a skill's hero wears the skill's look where it has one. Every look loads once (`loadLookLibrary`) and each tile assembles its own selection.
The **Terraria Roels** board stands the still Terraria designs (docs/LOOKS.md › Terraria designs) in the lineup scene, a classic hero beside them for scale, next to the classic cast the game ships: a row per backdrop, the select screen's blueprint paper and every stage.
A tile is the real scene (`TitleScene`, or the showcase for looks) at a whole-number zoom with the variant's name and line from its registry; what `TITLE_DEFAULTS` ships is marked current, and a variant appears as soon as it is registered.
Click a tile or press 1–9 (the first nine tiles of the board in view) for focus mode: one combination at the largest whole zoom that fits, with a picker for everything it shows, so any hero look can meet any skill and customer look. Esc closes it.

One transport drives every preview from a single fixed 60 Hz clock: replay (R), play and pause (Space), a frame back or forward (←/→), 0.25×, 0.5× or 1× speed, and a scrubber over the first six seconds with a button per beat (hit, slide, lock, flash, settled).
Seeking re-runs each scene from a fresh start to the exact frame, so every tile shows frame N as the game would.
Toggles: CRT (the flat host's own scanlines and vignette), reduced motion (every scene re-created with `settings.reducedMotion`) and sound, which only the focused view ever plays.
The URL describes the page, so a combination can be shared:

| Param                                     | Effect                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `lockups.backdrop`, `backdrops.lockup`    | the half each board's tiles share                                             |
| `focus`, `focus.lockup`, `focus.backdrop` | the combination in focus mode (`focus=title`)                                 |
| `crt`, `reduced`, `sound`                 | `1` turns the toggle on                                                       |
| `zoom`                                    | tile zoom, `1`–`3`; left out, the largest that keeps two tiles side by side   |

Anything a link names that this checkout does not have falls back to what the game ships and is listed at the top of the page.

`app/playground/main.tsx` loads fonts and level art once with `loadGameResources()`, the game's own looks with `loadLooks(DEFAULT_LOOKS, assets)` and the Terraria designs with `loadTerrariaDesigns(assets)`, and shares them with every preview.
`createPreviewServices` (`game/preview/`) builds `GameServices` for one scene in isolation: those resources, the looks it is given (`library.looks(selection)` from a `LookLibrary` previews any other selection), a fresh in-memory session, a director that records `goTo` instead of following it, no input, and silence unless it is given the synthesiser.
`ScenePreview` runs one scene on its own native canvas; every run starts from fresh services with the same seed, which is what makes seeking exact, and effects passed while catching up to a frame stay silent.
`PreviewLoop` (`app/playground/runtime/`) is the page's one animation-frame loop: it steps every preview from the clock, so off-screen tiles never fall out of step, but only draws those an IntersectionObserver reports in view, and none behind focus mode.
A board (`app/playground/boards/`) is a titled grid of tiles comparing every choice of one picker of a subject, a scene plus the pickers that shape it, with the subject's other pickers shared; adding one is a `Board` in `boards/catalog.ts`.
`window.__playground` exposes the boards' choices and the loop to `e2e/playground.spec.ts`.

## Quality bar

- TypeScript `strict` with `noUncheckedIndexedAccess`; no `any`; named exports.
- Small, single-purpose modules. Comments explain *why*, not *what*.
- Unit tests (Vitest) sit next to the code they test; end-to-end smoke tests (Playwright) live in `e2e/`.
- `pnpm check` runs type-check, lint (Biome), unit tests and the architecture boundary test.
