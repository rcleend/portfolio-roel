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
interface Scene<P = void> {
  enter(params: P): void;   // become active
  exit(): void;             // release resources
  update(step: Step): void; // fixed 60 Hz
  render(gfx: Gfx): void;   // draw current state; never mutates state
}
interface Step { readonly dt: number; readonly frame: number; readonly input: InputSnapshot<Action> }
```

Scenes own their elapsed time (`this.time += step.dt`). Choreography reads that time through `motion/progress` helpers, e.g. `segment(time, 1.2, 1.6, easeOutCubic)` returns 0 → 1 across that window.

### Director

`Director<M>` holds scene factories keyed by id and switches between them with typed params:

```ts
type SceneParamsMap = { boot: void; title: void; characterSelect: void; levelSelect: LevelSelectParams; level: LevelParams; stageClear: StageClearParams };
director.goTo('level', { levelId: 'luna', characterId: 'artsy' }, transitions.iris());
```

Transitions are render-time overlays (`cut`, `fade(color)`, `flash`, `iris`, `wipe`, `pixelDissolve`). Input is ignored while a transition runs.

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

`InputManager<A extends string>` turns bindings into one immutable `InputSnapshot<A>` per fixed step: `isDown(a)`, `wasPressed(a)`, `wasReleased(a)`, `anyPressed`, `pointer` (`x`, `y`, `over`, `down`, `pressed`, `released`) and `lastDevice`.
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

Each frame is `size.h` strings of exactly `size.w` characters. The compiler validates this and throws on mismatch.
`SpriteSheet` supports `flipX`, alpha, and a solid "flash" tint for hit feedback.

Shared sheets and their animation names are a contract between scenes:

| Sheet                                   | Frame   | Animations                                                      |
| --------------------------------------- | ------- | --------------------------------------------------------------- |
| `game/art/characters/<characterId>.ts`  | 32 × 40 | `idle`, `run`, `jump`, `fall`, `attack`, `skill`, `hurt`, `victory` |
| `game/art/enemies/unhappy-customer.ts`  | 32 × 40 | `walk`, `shout`, `hurt`, `stunned`, `happy`                     |
| `game/art/icons/skills.ts`              | 16 × 16 | one sheet per `SkillId`, animation `idle`                       |

### Text

`BitmapFont` builds a 1-bit glyph atlas, either from a pixel TTF rendered at its native size and alpha-thresholded, or from glyph data.
`TextStyle` composes fill (solid or banded vertical gradient), 1px outline and drop shadow into a cached styled atlas, so arcade lettering like "INSERT COIN" stays crisp at native resolution.
Fonts are self-hosted (`@fontsource/*`, OFL) and loaded before the first frame.

### Audio

```ts
interface AudioService {
  unlock(): Promise<void>;                                   // first user gesture
  playMusic(id: MusicId, options?: { loop?: boolean; fadeInMs?: number }): void;
  stopMusic(options?: { fadeOutMs?: number }): void;
  playSfx(id: SfxId, options?: { pan?: number; detune?: number }): void;
  muted: boolean;
}
```

All sound is synthesised with WebAudio (square, pulse, triangle and noise voices driven by a small sequencer), so there are no audio files.
Track and effect ids are string unions in `game/audio/ids.ts`.

## Game (`src/game`)

```
game/
  createGame.ts        composition: builds services, registers scenes, returns Game + GameSurface
  services.ts          GameServices: director, audio, fonts, assets, session, rng
  session.ts           persisted progress (localStorage, versioned schema)
  input/bindings.ts    Action union + default bindings
  audio/               ids, music (tracker data), sfx (synth recipes)
  fonts.ts             font registry and named TextStyles
  scenes/              boot, title, character-select, level-select, level, stage-clear
  ui/                  pixel UI widgets: Window, Tooltip, Button, TypewriterText, Hud
  entities/            player, unhappy customer, projectiles, pickups, platforms, hazards
  skills/              one module per SkillId implementing the shared Skill behaviour contract
  levels/<levelId>/    level map, theme, generated parallax art + layers.json
  art/                 pixel-art sheets (characters, enemy, icons), procedural art (logos, crater)
```

`GameServices` is created once in `createGame.ts` and injected into scene factories; scenes never reach for globals.

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

## Room (`src/room`)

A vanilla three.js stage that loads the attic room exported from Blender (`public/room/`), shows a `GameSurface` on the TV through a CRT `ShaderMaterial`, and owns the camera rig:

- `tv` viewpoint: straight-on, framing the whole TV (bezel, controls, power button) plus a margin of lit surroundings; computed from the TV's bounding box and the viewport aspect.
- `room` viewpoint: the whole room.
- Clicking outside the TV while focused moves to `room` and pauses; clicking the TV moves to `tv` and resumes.
- Other props register as `Interactable`s with a hit test and an `activate()` hook, so future interactions (PC, radio, PlayStation, guitar, posters) plug in without touching the TV logic.

Rendering is on demand: 60 fps while the TV is focused and the game runs, otherwise only on camera motion, lava-lamp animation (24 fps, only when visible) or resize.

## App (`src/app`)

React 19 composition root. It creates the game once, chooses a host (`room` when WebGL is available, otherwise `flat`; overridable with `?host=`), and renders overlays: loading screen, sound toggle, view hint, touch pad, and the accessible résumé.
The résumé is real HTML rendered from `src/content` and is always in the DOM.

## Development harness

URL parameters (honoured in development, or in production with `?debug`):

| Param     | Effect                                                        |
| --------- | ------------------------------------------------------------- |
| `host`    | `room` or `flat`                                              |
| `scene`   | start directly in a scene id                                  |
| `params`  | JSON scene params for `scene`                                 |
| `seed`    | seeds the game RNG                                            |
| `frames`  | step this many frames synchronously, then pause (screenshots) |

`window.__arcade` exposes `{ game, goTo, step, pause, resume, press, state }` and `window.__arcadeReady` turns true when the requested frame is on screen.

`pnpm shot` captures screenshots through Playwright:

```sh
pnpm shot --scene title --frames 150 --out .shots/title.png        # native canvas, scaled ×3 nearest-neighbour
pnpm shot --scene boot --frames 0:480:30 --out .shots/boot.png      # contact sheet every 30 frames
pnpm shot --host room --out .shots/room.png --page                  # full page
```

## Quality bar

- TypeScript `strict` with `noUncheckedIndexedAccess`; no `any`; named exports.
- Small, single-purpose modules. Comments explain *why*, not *what*.
- Unit tests (Vitest) sit next to the code they test; end-to-end smoke tests (Playwright) live in `e2e/`.
- `pnpm check` runs type-check, lint (Biome), unit tests and the architecture boundary test.
