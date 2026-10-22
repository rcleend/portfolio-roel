# Looks

A *look* is one visual style for the game's characters: every playable hero, the Unhappy Customer and every skill (its icon and its in-game effect).
The game can draw any mix of looks — Hackerman in one, the customer in another — and plays exactly the same whatever is chosen: looks change pixels, never timing, damage or hitboxes.
This document is the contract between whoever draws a look and the code that loads it; docs/ARCHITECTURE.md › Looks describes the code side.

| Look id    | Style                                                              |
| ---------- | ------------------------------------------------------------------ |
| `classic`  | the art the game shipped with (pixel art in code, 32 × 40 heroes) |
| `arcade`   | Neo Geo / Metal Slug: near-black outline, bold cel shading         |
| `portrait` | slim, realistic, selective coloured outlines                       |
| `hibit`    | modern high-fidelity pixel art: rich ramps, lavish effects         |

Hero ids: `hackerman`, `artsy`, `strategy`. Skill ids: `full-stack-attack`, `agent-summon`, `ux-elixir`, `power-chord`, `north-star`, `churn-shield`. The customer has no id.

## A look folder

```
src/game/art/looks/<lookId>/
  characters/<characterId>/index.ts      registers the hero
  characters/<characterId>/sheet.png + sheet.json     the 8 hero animations, 64 × 64 frames
  characters/<characterId>/attack.png + attack.json   the basic attack: projectile + impact (optional)
  customer/index.ts + sheet.png + sheet.json          the 5 customer animations, 64 × 64 frames
  skills/<skillId>/index.ts + icon.png + icon.json    a 24 × 24 icon with one animation, idle
  skills/<skillId>/fx-<name>.png + fx-<name>.json     effect strips, any frame size (optional)
```

- Every piece is its own folder with an `index.ts`; the game finds it by its path, so adding a piece never edits a shared file. A folder with art but no `index.ts` fails the tests.
- A look may cover only some pieces: the selection offers only what exists.
- Generators, prompts and processing scripts live in `tools/looks/<lookId>/` (see *Making the art*); only the PNG + JSON outputs are loaded.

## Sheets: PNG + JSON

- **PNG**: RGBA, alpha strictly 0 or 255, a few dozen colours at most. One row per animation, in the order of the JSON `animations`, frames left to right. The image is `frame.w ×` the largest frame count wide and `frame.h ×` the animation count tall; unused cells stay transparent. The loader rejects a PNG whose size does not match its JSON.
- **JSON**:

```json
{
  "frame": { "w": 64, "h": 64 },
  "origin": { "x": 32, "y": 64 },
  "animations": [
    { "name": "idle", "fps": 8, "loop": true, "frames": 6 },
    { "name": "attack", "fps": 15, "loop": false, "frames": 5,
      "anchors": { "muzzle": [[50, 30], [52, 30], [54, 29], [54, 29], [52, 30]] } }
  ]
}
```

- `origin` is the point placed on the position the game draws at: for heroes and the customer, bottom-centre, the feet line.
- `anchors` are optional, per animation: named pixels, one `[x, y]` per frame, inside the frame.
  - `muzzle` on `attack`: where the basic attack leaves (the keyboard, the guitar, the throwing hand). The game simulates shots from a fixed hand point; a look with a muzzle has its shots and impacts *drawn* shifted to the muzzle of the first `attack` frame, so hits land exactly where they always did.
  - `hand` on `skill`: where a skill effect attaches (the potion, the guitar body). Skill visuals receive it in world pixels.
- Errors name the file and the field, e.g. `animations[2].anchors.muzzle[3] must be [x, y] inside the 64×64 frame`. Unknown keys are rejected, so a typo cannot vanish.
- The JSON is data, not source: Biome leaves `looks/**/*.json` alone, so a generator's output never fails the lint.

| Sheet               | Frame   | Origin    | Animations                                                          |
| ------------------- | ------- | --------- | ------------------------------------------------------------------- |
| hero `sheet`        | 64 × 64 | (32, 64)  | `idle`, `run`, `jump`, `fall`, `attack`, `skill`, `hurt`, `victory` |
| customer `sheet`    | 64 × 64 | (32, 64)  | `walk`, `shout`, `hurt`, `stunned`, `happy` (won over)              |
| skill `icon`        | 24 × 24 | (0, 0)    | `idle`, a subtle loop on a dark slot                                |
| `attack`, `fx-*`    | any     | any       | any; `attack` for `spriteAttack` has `projectile` and `impact`      |

All sheets face right; the game mirrors them around the origin. `idle`, `run`, `walk` and `victory` loop; `attack`, `skill` and `hurt` play once (gameplay holds them 0.22–0.4 s). A standing hero is about 54–60 px tall. Play keeps classic's hitboxes (heroes 12 × 28, customers 14 × 28; the escalated customer is the same sheet drawn at 2×), so taller art stands around the same boxes: everything the game shows above a customer rises with the art, but complaint bubbles still leave from the classic mouth height.

## Index modules

Each `index.ts` exports `look`, built with a helper from `src/game/art/looks/module.ts`. Import from outside the look folder with `@/game/…` paths, so a folder can move between looks unchanged.

```ts
// looks/arcade/characters/hackerman/index.ts
import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import attackPng from './attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

export const look = defineHeroLook('hackerman', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
```

```ts
// looks/arcade/customer/index.ts
import { defineCustomerLook } from '@/game/art/looks/module';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

export const look = defineCustomerLook({ sheet: { png: sheetPng, json: sheetJson } });
```

```ts
// looks/arcade/skills/power-chord/index.ts
import { defineSkillLook } from '@/game/art/looks/module';
import iconJson from './icon.json';
import iconPng from './icon.png';
import waveJson from './fx-wave.json';
import wavePng from './fx-wave.png';

export const look = defineSkillLook('power-chord', {
  icon: { png: iconPng, json: iconJson },
  fx: { wave: { png: wavePng, json: waveJson } },
  visual: (fx) => ({
    active: (gfx, state, caster, layer) => {
      if (layer !== 'front' || state.age >= state.duration) return;
      gfx.sprite(fx.wave, 'burst', state.age, state.origin.x, state.origin.y);
    },
  }),
});
```

- `fx` names extra sheets; the factory receives them loaded, typed by those names. PNGs are fetched only when the look is selected.
- Everything is optional except a hero's or the customer's `sheet`: a hero without `attack`, or a skill without an `icon` or with only some visual parts, is drawn by classic for the rest.
- `spriteAttack(sheet)` draws the `projectile` animation with the shot and plays `impact` once where it strikes. Write `attack: (fx) => ({ shot, impact })` for anything else.

## What a look draws

Behaviour reduces everything visible to small read-only state, and a look draws it in world pixels with the `Gfx` API (`gfx.sprite`, `fillRect`, `circle`, …). Visuals must not change state or roll dice: two runs with the same seed must look the same in every look.

**A hero's attack** (`AttackVisual`, `entities/shots/AttackVisual.ts`):

- `shot(gfx, shot)`: one shot in flight — `x`, `y` (its centre), `vx`, `vy`, `age`, `direction` and `index` (shots fired before it; classic Artsy cycles paint colours by it).
- `impact(gfx, impact)`: where it struck a customer or a wall — the spark burst the world rolled (`x`, `y`, `age`, `particles`) and the `direction` it flew.

**A skill** (`SkillVisual<K>`, `skills/SkillVisual.ts`), any of:

- `active(gfx, state, caster, layer)`: the running skill — cast moment and persistent effect — drawn twice a frame, `'behind'` the hero and `'front'`.
- `shot(gfx, shot)`: its projectiles.
- `effect(gfx, fx)`: what it leaves in the world: `fx.role` names it.

`caster` is the hero this frame: `x`, `y` (body centre), `feet`, `facing`, `height` (the hero sprite's frame height) and the current frame's `hand` and `muzzle` anchors in world pixels, or `null`.

| Skill               | `active` state (all have `age`, `duration`)               | `shot`              | `effect` roles            | Runs      |
| ------------------- | --------------------------------------------------------- | ------------------- | ------------------------- | --------- |
| `full-stack-attack` | `facing`, `area` (the beam, also its hit box)             | —                   | `struck` (a burst)        | 0.6 s     |
| `agent-summon`      | `angle` (behind the hero while `sin < 0`), `droneAt(caster)` | a pulse          | `impact` (a burst)        | 8 s       |
| `ux-elixir`         | —                                                         | —                   | `sparkle` (a burst)       | 6 s       |
| `power-chord`       | `origin` (caster centre at the strum)                     | —                   | `ring` (`radius`, `life`, `index`) | 0.5 s; rings 0.45 s |
| `north-star`        | none: the cast is instant                                 | the star (`trail`)  | `launch`, `impact` (bursts) | star ≤ 2.6 s |
| `churn-shield`      | `radius`, `centerAt(caster)`                              | —                   | —                         | 5 s       |

A running skill is drawn only while it runs. Impacts and skill effects stay on stage at least 0.5 s (`LOOK_EFFECT_SECONDS`), even after classic's sparks are gone, so a look's impact animation can play out. Shared feedback — the white hit spark on any hit, the heart and +MRR when a customer is won over, complaint bubbles, dust — belongs to no look.

## Choosing and previewing looks

- `DEFAULT_LOOKS` (`src/game/art/looks/selection.ts`) is what the game ships: classic everywhere. Promoting a pick is one line there.
- `?looks=<json>` (development, or with `?debug`) overrides any pieces: `?looks={"characters":{"hackerman":"arcade"},"customer":"hibit","skills":{"power-chord":"portrait"}}`. Unknown ids, and pieces a look has not drawn, fail loudly with the ones that exist. `pnpm shot` takes the same JSON as `--looks`.
- The showcase plays a look in the game, looping and frame-exact (`?scene=showcase`):

```sh
pnpm shot --scene showcase --params '{"hero":"artsy","demo":"moves"}' --looks '{"characters":{"artsy":"arcade"}}' --frames 0:405:27 --out .shots/moves.png
pnpm shot --scene showcase --params '{"demo":"skill","skill":"power-chord"}' --looks '{"skills":{"power-chord":"hibit"}}' --frames 0:270:15 --out .shots/chord.png
pnpm shot --scene showcase --params '{"demo":"customer","levelId":"luna"}' --looks '{"customer":"portrait"}' --frames 0:405:27 --out .shots/customer.png
```

- `?scene=specimen&params={"page":1}` shows every hero animation, `{"page":2}` the customer and the icons.
- `tools/looks/placeholder/generate.py` writes a 64 × 64 hero and customer, a 24 × 24 icon and an attack strip in this format. They are not a look: copy them into a look folder with an `index.ts` to try a layout, and never commit that.

## Checks

- `pnpm test` (`registeredLooks.test.ts`): every index module declares its piece; every sheet meets its kind's animations, frame size and origin; every PNG has the size its JSON describes; every folder with art has an `index.ts`.
- `pnpm e2e` (`e2e/looks.spec.ts`): every registered look loads in the browser, and the first and last frame of every animation is non-blank with alpha only 0 or 255; every showcase demo plays without errors.

## Making the art

Any technique is fine; commit the recipe.

- **Hand-placed or procedural**: commit the generator under `tools/looks/<lookId>/` (TypeScript or Python with Pillow), writing the PNG + JSON deterministically.
- **Image generation**: follow `tools/art/README.md` and `tools/art/prompts/*.md`. Keep raw sources out of the repository, commit the exact prompts as `tools/art/prompts/looks-<lookId>.md` and the processing script (crop → area downsample → quantise → outline → align on the feet line → pack). Generated frames always need a cleanup pass to native-pixel quality: keep the head pixel-identical across frames so the likeness never wobbles, fix stray pixels, unify palettes and register the feet.
- The bar is hand-placed-looking pixel art at native 320 × 240: one art pixel is one screen pixel, no anti-aliasing, no semi-transparent pixels, no text baked into sprites beyond tiny deliberate glyphs.
