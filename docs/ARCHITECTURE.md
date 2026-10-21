# Architecture

Roel's portfolio is a 16-bit arcade game running on a CRT television inside a 3D attic room.
This document is the contract every module is built against. If code and this document disagree, fix one of them in the same change.

## Experience in one paragraph

The page opens zoomed in on the television: bezel, power button and a little of the room around it are visible.
The TV powers on (CRT line-expansion), plays a Neo Geo-style boot ("REO·LEO"), then a Metal Slug-style title ("PRODUCT ENGINEER").
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
  gfx/      Gfx (pixel-snapped drawing), PixelArt (sprite definitions + compiler), SpriteSheet,
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
type SceneParamsMap = { boot: void; title: void; characterSelect: void; levelSelect: LevelSelectParams; level: LevelParams; stageClear: StageClearParams };
director.goTo('level', { levelId: 'luna', characterId: 'artsy' }, transitions.iris());
```

`goTo(id, params, transition?)`: params may be omitted only for `void` scenes (`goTo('title', undefined, fade())`); no transition means a cut.
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
All sheets face right; draw with `flipX` to face left. `sheet.duration(a)`, `frameIndex(a, t)` and `isFinished(a, t)` drive timing.
The characters and the customer are assembled from one shared body rig (`game/art/characters/rig.ts`: shared legs and arms, per-character head, torso, palette and props), so a crew can redraw a piece without touching the rest.

Shared sheets and their animation names are a contract between scenes:

| Sheet                                   | Frame   | Animations                                                      |
| --------------------------------------- | ------- | --------------------------------------------------------------- |
| `game/art/characters/<characterId>.ts`  | 32 × 40 | `idle`, `run`, `jump`, `fall`, `attack`, `skill`, `hurt`, `victory` |
| `game/art/enemies/unhappy-customer.ts`  | 32 × 40 | `walk`, `shout`, `hurt`, `stunned`, `happy`                     |
| `game/art/icons/skills.ts`              | 16 × 16 | one sheet per `SkillId`, animation `idle`                       |

Compiled sheets are available to scenes as `services.sprites.characters[id]`, `services.sprites.unhappyCustomer` and `services.sprites.skillIcons[skillId]`.

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
`gfx.measureText`, `layoutText` and the pure `wrapText` size text without drawing; `?scene=specimen` shows every font, style, sprite and widget.

### Audio

```ts
interface AudioService<MusicId, SfxId> {                     // engine/audio; the game uses GameAudio = AudioService<MusicId, SfxId>
  unlock(): Promise<void>;                                   // first user gesture
  playMusic(id: MusicId, options?: { loop?: boolean; fadeInMs?: number }): void;
  stopMusic(options?: { fadeOutMs?: number }): void;
  playSfx(id: SfxId, options?: { pan?: number; detune?: number }): void;
  muted: boolean;
}
```

All sound is synthesised with WebAudio (square, pulse, triangle and noise voices driven by a small sequencer), so there are no audio files.
Track and effect ids are string unions in `game/audio/ids.ts` (with `MUSIC_IDS` / `SFX_IDS` arrays). Until the synthesiser lands, `NullAudio` stands in silently.

## Game (`src/game`)

```
game/
  createGame.ts        composition: builds services, registers scenes, returns Game + GameSurface
  services.ts          GameServices: director, audio, fonts, text, sprites, assets, levelArt, session, rng, settings
  palette.ts           shared UI colours
  session.ts           persisted progress (localStorage, versioned schema)
  input/bindings.ts    Action union + default bindings
  audio/               ids, music (tracker data), sfx (synth recipes)
  fonts.ts             font registry and named TextStyles
  scenes/              boot, title, character-select, level-select, level, stage-clear
  ui/                  pixel UI widgets: Window, Tooltip, Button, TypewriterText, Hud
  entities/            player, unhappy customer, projectiles, pickups, platforms, hazards
  skills/              one module per SkillId implementing the shared Skill behaviour contract
  world/               level runtime: tile grid, AABB collision, layout DSL + validation, camera, World, autopilot
  levels/art/          LevelArt loader: validates each layers.json, preloads its PNGs, exposes parallax layers, Tileset and PropSheets
  levels/<levelId>/    level map, theme, generated parallax art + layers.json (tools/art/README.md)
  art/                 pixel-art sheets (characters, enemy, icons), procedural art (logos, crater)
```

`GameServices` (`director`, `audio`, `fonts`, `text`, `sprites`, `assets`, `levelArt`, `session`, `rng`, `settings.reducedMotion`) is created once in `createGame.ts` and passed to every scene's constructor; scenes never reach for globals.
`createGame(options)` resolves to `{ game, surface, services }`, stopped and without a scene: the app picks the first scene and starts the loop.

Scene registry (`game/scenes/index.ts`): each feature crew owns one folder and replaces its stub in place, keeping the class name and the `constructor(services: GameServices)` signature, so the registry never changes.

| Scene id          | File                                               | Params                |
| ----------------- | -------------------------------------------------- | --------------------- |
| `boot`            | `scenes/boot/BootScene.ts`                         | none                  |
| `title`           | `scenes/title/TitleScene.ts`                       | none                  |
| `characterSelect` | `scenes/character-select/CharacterSelectScene.ts`  | none                  |
| `levelSelect`     | `scenes/level-select/LevelSelectScene.ts`          | `{ focus?: LevelId }` |
| `level`           | `scenes/level/LevelScene.ts`                       | `{ levelId, characterId }` |
| `stageClear`      | `scenes/stage-clear/StageClearScene.ts`            | `{ levelId, characterId, result: LevelResult }` |
| `specimen` (dev)  | `scenes/specimen/SpecimenScene.ts`                 | `{ page?: 0–3 }`      |

Stubs draw a yellow `STUB · NAME` banner (`scenes/StubBanner.ts`); delete it once every stub is replaced.

UI kit (`game/ui`): `drawWindow(gfx, rect, windowThemes.indigo | steel | cream, { title })` with `windowContent(rect)` for the inner area; `Tooltip` (pops in over four frames with a 1 px overshoot); `Button` (pointer and focus, activates on release); `Paragraph` (wrapped once, can render the first N characters); `TypewriterText`; `handCursorSheet`. Shared UI colours live in `game/palette.ts`.

### Levels

A stage is a `StageDefinition` (`world/stage.ts`): a layout written in the text DSL of `world/map/layout.ts` (one character per 16 px tile, sections laid side by side; legend in `LEGEND`) plus a theme that dresses generic markers in the level's props (a moving platform is a cable car in `levels/luna/theme.ts`, a U-Bahn in `levels/scripe/theme.ts`).
`scenes/level/stages.test.ts` validates every stage against the player's jump (reachability, one "?" block per career highlight, markers on the ground).
`World` (`world/World.ts`) owns the simulation and reports `WorldEvent`s; `LevelScene` owns flow (intro, highlight cards, pause, respawn, finale), sound, HUD and overlays.
Skills implement `Skill` (`skills/Skill.ts`): `cast(world)` returns an `ActiveSkill` that is stepped until `done` and declares its rule changes as `modifiers`; cooldowns live in `SkillSlot`.
Level params also accept development switches (`scenes/level/devOptions.ts`): `debug: "hitboxes"`, `startAt` (checkpoint index or `"arena"`), `skipIntro`, and `autopilot` (an attract-mode demo used by `scripts/level-tour.ts` and `e2e/level.spec.ts`).

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

React 19 composition root. It creates the game once, chooses a host (`room` when WebGL is available, otherwise `flat`; overridable with `?host=`), and renders overlays: loading screen, sound toggle, view hint, touch pad, and the accessible résumé.
Hosts receive only `{ surface: GameSurface }`; `app/hosts/index.ts` maps host kinds to components and is the single seam where the room crew swaps `FlatHost` for `RoomHost`.
The flat host shows the canvas at the largest integer zoom inside a CSS television with scanlines and vignette, maps DOM pointer coordinates to native pixels, and enables keyboard input only while the screen has focus.
The résumé (`app/resume/Resume.tsx`) is real HTML rendered from `src/content` and is always in the DOM; it is visually hidden until the "Skip to résumé" link (first in tab order, visible on focus) targets it.

## Development harness

URL parameters (honoured in development, or in production with `?debug`):

| Param     | Effect                                                        |
| --------- | ------------------------------------------------------------- |
| `host`    | `room` or `flat`                                              |
| `scene`   | start directly in a scene id                                  |
| `params`  | JSON scene params for `scene`                                 |
| `seed`    | seeds the game RNG                                            |
| `frames`  | step this many frames synchronously, then pause (screenshots) |

`window.__arcade` exposes `{ game, goTo(scene, params?, transitionName?), step(frames), pause, resume, press(action, frames), state() }` and `window.__arcadeReady` turns true when the requested frame is on screen.
`press` holds the action for `frames` steps, releases it and steps once more; `state()` returns `{ scene, transition, frame, paused, session }`.

`pnpm shot` captures screenshots through Playwright:

```sh
pnpm shot --scene title --frames 150 --out .shots/title.png        # native canvas, scaled ×3 nearest-neighbour
pnpm shot --scene boot --frames 0:480:30 --out .shots/boot.png      # contact sheet every 30 frames
pnpm shot --host room --out .shots/room.png --page                  # full page
```

More options: `--params <json>`, `--scale <n>` (default 3), `--cols <n>` for sheets, `--seed <n>` (default 1), `--viewport WxH` for `--page`.
The script uses the dev server given by `--url`, otherwise starts Vite from the current checkout on a free port, and fails on any page error. Set `E2E_PORT` to give each checkout its own end-to-end server.

## Quality bar

- TypeScript `strict` with `noUncheckedIndexedAccess`; no `any`; named exports.
- Small, single-purpose modules. Comments explain *why*, not *what*.
- Unit tests (Vitest) sit next to the code they test; end-to-end smoke tests (Playwright) live in `e2e/`.
- `pnpm check` runs type-check, lint (Biome), unit tests and the architecture boundary test.
