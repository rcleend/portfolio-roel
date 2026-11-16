# Looks

A *look* is one visual style for the game's characters: every playable hero, the Unhappy Customer and every skill (its icon and its in-game effect).
The game can draw any mix of looks — Hackerman in one, the customer in another — and plays exactly the same whatever is chosen: looks change pixels, never timing, damage or hitboxes.
This document is the contract between whoever draws a look and the code that loads it; docs/ARCHITECTURE.md › Looks describes the code side.

| Look id            | Style                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| `classic`          | the art the game shipped with (pixel art in code, 32 × 40 heroes)              |
| `arcade`           | Neo Geo / Metal Slug: near-black outline, bold cel shading                     |
| `portrait`         | slim, realistic, selective coloured outlines                                   |
| `hibit`            | modern high-fidelity pixel art: rich ramps, lavish effects                     |
| `terraria`         | Terraria: classic-sized heroes and customer posed limb by limb                 |
| `terraria-revised` | the Terraria heroes revised: swept hair that moves, flat glasses (heroes only) |
| `terraria-hooded`  | the revised Terraria ENGINEER with his hood up (Hackerman only)                |

The game ships the `terraria-revised` heroes and the `terraria` customer, with classic's skills (`DEFAULT_LOOKS`, below). Every other piece can be picked with the harness's `looks` param (docs/ARCHITECTURE.md › Development harness), and looks load piece by piece on demand, so a visitor downloads only what the game draws.

Hero ids: `hackerman`, `artsy`, `strategy`. Skill ids: `full-stack-attack`, `agent-summon`, `ux-elixir`, `power-chord`, `north-star`, `churn-shield`. The customer has no id.

## A look folder

```
src/game/art/looks/<lookId>/
  characters/<characterId>/index.ts      registers the hero
  characters/<characterId>/sheet.png + sheet.json     the 8 hero animations (and any skill poses), 64 × 64 frames
  characters/<characterId>/attack.png + attack.json   the basic attack: projectile, impact, muzzle (optional)
  customer/index.ts + sheet.png + sheet.json          the 5 customer animations, 64 × 64 frames
  skills/<skillId>/index.ts + icon.png + icon.json    a 24 × 24 icon with one animation, idle
  skills/<skillId>/fx-<name>.png + fx-<name>.json     effect strips, any frame size (optional)
```

- Every piece is its own folder with an `index.ts`; the game finds it by its path, so adding a piece never edits a shared file. A folder with art but no `index.ts` fails the tests.
- A look may cover only some pieces: the selection offers only what exists.
- Generators, prompts and processing scripts live in `tools/looks/<lookId>/` (see *Making the art*); only their outputs are loaded.
- The game loads no PNG: once a sheet's PNG is written, `pnpm build:art` turns it into `sheet.art.ts` beside it, the same pixels as a string in code, and removes the PNG (docs/ARCHITECTURE.md › Art in code). Wherever this document says `sheet.png`, the repository holds `sheet.art.ts`; `pnpm build:art --export <dir>` writes the PNGs back out to look at or edit. A generator's `--check` compares its JSON always and its pixels once the PNGs are exported in place (`pnpm build:art --export src/game`; tools/art/README.md › Art modules); `src/game/art/art-digests.json` holds each committed module to its pixels.

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
  - `muzzle` on `attack`: where the basic attack leaves (the keyboard, the guitar, the throwing hand). The game simulates shots from a fixed hand point; a look with a muzzle has its whole attack (shots, impacts, hit sparks) *drawn* shifted to the muzzle of the first `attack` frame, so hits land exactly where they always did.
  - `hand` on `skill` (and on every skill pose): where a skill effect attaches (the potion, the guitar body). Skill visuals receive it, and any other anchor of the current frame, in world pixels.
  - `head` on every animation, for a look drawn smaller than its frame: the top of the head. The HUD frames its portrait at `idle`'s, the select screen's iris closes on the middle of the hero below it, the mission teaser's `?` floats over it, the results tally spaces its rows over the highest one the victory pair reaches (`figureHeight` in `Looks.ts`), classic's UX ELIXIR pops its flask over the current frame's, and everything shown above a customer (frustration pips, steam, hearts, the +MRR pop) stands on the head of the `walk` frame a still customer stands in; without it they take heads to sit near the frame's top, as they do in a look that fills it.
- Errors name the file and the field, e.g. `animations[2].anchors.muzzle[3] must be [x, y] inside the 64×64 frame`. Unknown keys are rejected, so a typo cannot vanish.
- The JSON is data, not source: Biome leaves `looks/**/*.json` alone, so a generator's output never fails the lint.

| Sheet               | Frame   | Origin    | Animations                                                          |
| ------------------- | ------- | --------- | ------------------------------------------------------------------- |
| hero `sheet`        | 64 × 64 | (32, 64)  | `idle`, `run`, `jump`, `fall`, `attack`, `skill`, `hurt`, `victory`; optionally `skill-<skillId>`, and layers: `run-legs`, `jump-legs`, `fall-legs` and `<pose>-upper` for every attack and skill pose |
| customer `sheet`    | 64 × 64 | (32, 64)  | `walk`, `shout`, `hurt`, `stunned`, `happy` (won over)              |
| skill `icon`        | 24 × 24 | (0, 0)    | `idle`, a subtle loop on a dark slot                                |
| `attack`, `fx-*`    | any     | any       | any; for `spriteAttack`: `projectile`, `impact`, optional `muzzle` and variants (`projectile-<v>`, `impact-<v>`, `muzzle-<v>`) |

All sheets face right; the game mirrors them around the origin. `idle`, `run`, `walk` and `victory` loop; `attack`, `skill` and `hurt` play once (gameplay holds them 0.22–0.4 s). A standing hero is about 54–60 px tall, or about 30 in a look drawn at classic's size (the Terraria looks). Play keeps classic's hitboxes (heroes 12 × 28, customers 14 × 28; the escalated customer is the same sheet drawn at 2×), so taller art stands around the same boxes: everything the game shows above a customer rises or sinks with the art's head (its `head` anchor, else its frame's top), but complaint bubbles still leave from the classic mouth height, and the customer's label hangs a pixel under the feet line whatever the look. A customer's `walk` plays by the distance he covers rather than by the clock, as Terraria steps its walkers by their speed: one second of it for every 30 px of art he walks (a regular customer's pace, so a look draws its walk to plant the feet there), so a patrolling or UX ELIXIR-slowed customer steps slower, a charging one faster, and the escalated customer, twice the size, takes steps half as often.

`skill` serves both of a hero's skills. A hero sheet may also pose one of its own hero's skills its own way, as Terraria gives every item its own use: `skill-<skillId>` (`skill-ux-elixir`) plays instead of `skill` whenever that skill is cast, held to the same rules (once, 0.4 s, its first frame the cast, `hand` on every frame). Any other extra animation is rejected at load, naming it. Classic's UX ELIXIR pops its flask only over a hero who does not pose `skill-ux-elixir`; one who does drinks his own potion in it (`caster.posesOwn(skill)` tells a skill visual).

A hero attacks and casts on the move the way Terraria does: the legs keep the current move and the arms swing the item. A sheet drawn in layers splits each of `run`, `jump` and `fall` into its legs (`run-legs`, `jump-legs`, `fall-legs`, no anchors) and each attack and skill pose it plays into its upper body (`attack-upper`, `skill-upper`, `skill-ux-elixir-upper`, with the pose's anchors), each split row playing as many frames as fast as the row it splits, and the game draws the move's legs with the pose's upper body over them, the legs keeping their stride through the attack (`heroFrame` in `contracts.ts`). Standing, or on a sheet drawn whole, the whole pose plays as before: such a sheet shows its skill pose's standing legs mid-air and drops the attack pose while the hero runs, jumps or falls, as classic does. A sheet with any layer must have them all, and the loader names a missing or mistimed one.

## Index modules

Each `index.ts` exports `look`, built with a helper from `src/game/art/looks/module.ts`. Import from outside the look folder with `@/game/…` paths, so a folder can move between looks unchanged.

```ts
// looks/arcade/characters/hackerman/index.ts
import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import { art as attackArt } from './attack.art';
import sheetJson from './sheet.json';
import { art as sheetArt } from './sheet.art';

export const look = defineHeroLook('hackerman', {
  sheet: { art: sheetArt, json: sheetJson },
  fx: { attack: { art: attackArt, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
```

```ts
// looks/arcade/customer/index.ts
import { defineCustomerLook } from '@/game/art/looks/module';
import sheetJson from './sheet.json';
import { art as sheetArt } from './sheet.art';

export const look = defineCustomerLook({ sheet: { art: sheetArt, json: sheetJson } });
```

```ts
// looks/arcade/skills/power-chord/index.ts
import { defineSkillLook } from '@/game/art/looks/module';
import iconJson from './icon.json';
import { art as iconArt } from './icon.art';
import waveJson from './fx-wave.json';
import { art as waveArt } from './fx-wave.art';

export const look = defineSkillLook('power-chord', {
  icon: { art: iconArt, json: iconJson },
  fx: { wave: { art: waveArt, json: waveJson } },
  visual: (fx) => ({
    active: (gfx, state, caster, layer) => {
      if (layer !== 'front' || state.age >= state.duration) return;
      gfx.sprite(fx.wave, 'burst', state.age, state.origin.x, state.origin.y);
    },
  }),
});
```

- `fx` names extra sheets; the factory receives them loaded, typed by those names. A piece's sheets travel in its own chunk, fetched only when the look is selected.
- Everything is optional except a hero's or the customer's `sheet`: a hero without `attack`, or a skill without an `icon` or with only some visual parts, is drawn by classic for the rest.
- `spriteAttack(sheet)` draws the `projectile` animation with the shot, plays `muzzle` (if the strip has one) once where the shot leaves the hand and `impact` once where it strikes, and adds nothing on the customer it hit. The strip's origin is the projectile's centre.
- A strip may vary its shots: every `projectile-<v>` is a variant that successive shots take turns with, after the plain `projectile`, in sheet order. A variant's shot plays `impact-<v>` and `muzzle-<v>` where the strip has them and the plain ones otherwise, so Artsy's paint can cycle pink, cyan, yellow with `projectile`, `projectile-cyan`, `impact-cyan`, `projectile-yellow`, `impact-yellow`.
- Write `attack: (fx) => ({ shot, impact, hit })`, or any of them, for anything else.

## What a look draws

Behaviour reduces everything visible to small read-only state, and a look draws it in world pixels with the `Gfx` API (`gfx.sprite`, `fillRect`, `circle`, …). Visuals must not change state or roll dice: two runs with the same seed must look the same in every look.

**A hero's attack** (`AttackVisual`, `entities/shots/AttackVisual.ts`):

- `shot(gfx, shot)`: one shot in flight — `x`, `y` (its centre), `vx`, `vy`, `age`, `direction`, `index` (shots fired before it; classic Artsy cycles paint colours by it) and `from` (where it left the hand, for a muzzle flash).
- `impact(gfx, impact)`: where it struck a customer or a wall — the spark burst the world rolled (`x`, `y`, `age`, `particles`), the `direction` it flew and the shot's `index`, to match a varied shot.
- `hit(gfx, hit)`: the spark on the customer it hit, at the customer's centre, alongside the `impact` at the shot. Classic draws a white spark; `spriteAttack` draws nothing, letting its impact speak.

**A skill** (`SkillVisual<K>`, `skills/SkillVisual.ts`), any of:

- `active(gfx, state, caster, layer)`: the running skill — cast moment and persistent effect — drawn twice a frame, `'behind'` the hero and `'front'`.
- `shot(gfx, shot)`: its projectiles.
- `effect(gfx, fx)`: what it leaves in the world, which may outlive the skill: `fx.role` names it.
- `customer(gfx, customer)`: what it puts on every customer it holds a rule over, drawn after the customer's frustration meter. Only UX ELIXIR has one: classic's calm heart over each calmed customer, which a look replaces by drawing its own.

`caster` is the hero this frame: `x`, `y` (body centre), `feet`, `facing`, `height` (the hero sprite's frame height), the current frame's `hand` and `muzzle` anchors in world pixels or `null`, `anchor(name)` for any other, and `posesOwn(skill)`, whether the hero's look poses that skill its own way.

| Skill               | `active` state (all have `age`, `duration`)                                          | `shot`                      | `effect` roles                                                         | Runs                |
| ------------------- | ------------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------- | ------------------- |
| `full-stack-attack` | `facing`, `area` (the beam, also its hit box)                                        | —                           | `hit`; `struck` (a burst with the beam's `area` and `facing`); `ended` | 0.6 s               |
| `agent-summon`      | `angle` (behind the hero while `sin < 0`), `droneAt(caster)`, `lastShot` (`age`, `toward`) | a pulse               | `hit`, `impact`; `ended`                                               | 8 s                 |
| `ux-elixir`         | — (`customer`: `x`, `feet`, `scale`, `lift`, `elixir`)                               | —                           | `sparkle`; `ended`                                                     | 6 s                 |
| `power-chord`       | `origin` (caster centre at the strum)                                                | —                           | `ring` (`radius`, `life`, `index`); `stunned`; `ended`                 | 0.5 s; rings 0.45 s |
| `north-star`        | none: the cast is instant                                                            | the star (`trail`, `target`) | `launch`, `hit`, `impact`                                             | star ≤ 2.6 s        |
| `churn-shield`      | `radius`, `centerAt(caster)`                                                         | —                           | `hit` (every bump); `ended`                                            | 5 s                 |

- `hit`, `impact`, `launch`, `sparkle` and `struck` carry the burst the world rolled (`x`, `y`, `age`, `particles`). `hit` is the spark on a customer the skill hit, at its centre; classic draws it white, like every hit.
- `stunned` is left on every customer the strum stunned and lasts the 3 s stun: `target` (read live: `rect`, `stunned`, `escalated`), the shockwave's `origin` and a `timer` (`age`, `seconds`).
- `ended` is left when a timed skill ends, for a last beat after it is gone: its final `state`, the `caster` as it ended and a `timer`.
- `lastShot` is when (seconds into the skill) and at what point the drone last fired, or `null`; a star's `target` is the customer it is homing on this step, or `null`.
- `customer.lift` is how much taller the customer look stands than classic at `scale`; `elixir` is the running elixir's state, or `null` on the one frame its rule outlasts it.

A running skill is drawn only while it runs. Impacts and skill effects stay on stage at least 0.5 s (`LOOK_EFFECT_SECONDS`), even after classic's sparks are gone, so a look's impact animation can play out; `ended` lasts exactly that. Shared feedback — the spark of a stomp, the heart and +MRR when a customer is won over, complaint bubbles, dust, the label under every customer's feet — belongs to no look.

Icon slots grow with the icons and keep each screen's classic margin: 24 × 24 icons sit in 32 × 32 slots on the select screen and 30 × 30 in the HUD and pause menu.

## Choosing and previewing looks

- `DEFAULT_LOOKS` (`src/game/art/looks/selection.ts`) is what the game ships: the `terraria-revised` heroes, the `terraria` customer and classic's skills. Promoting a pick is one line there.
- `?looks=<json>` (development, or with `?debug`) overrides any pieces: `?looks={"characters":{"hackerman":"arcade"},"customer":"hibit","skills":{"power-chord":"portrait"}}`. Unknown ids, and pieces a look has not drawn, fail loudly with the ones that exist. `pnpm shot` takes the same JSON as `--looks`.
- The showcase plays a look in the game, looping and frame-exact (`?scene=showcase`):

```sh
pnpm shot --scene showcase --params '{"hero":"artsy","demo":"moves"}' --looks '{"characters":{"artsy":"arcade"}}' --frames 0:405:27 --out .shots/moves.png
pnpm shot --scene showcase --params '{"demo":"skill","skill":"power-chord"}' --looks '{"skills":{"power-chord":"hibit"}}' --frames 0:270:15 --out .shots/chord.png
pnpm shot --scene showcase --params '{"demo":"customer","levelId":"luna"}' --looks '{"customer":"portrait"}' --frames 0:405:27 --out .shots/customer.png
```

- `?scene=specimen&params={"page":1}` shows every hero animation, `{"page":2}` the customer and the icons.
- `tools/looks/placeholder/generate.py` writes a 64 × 64 hero and customer, a 24 × 24 icon and an attack strip in this format. They are not a look: copy them into a look folder with an `index.ts` and run `pnpm build:art` to try a layout, and never commit that.

## The Terraria look

`terraria` draws the three heroes as Terraria players, at classic's size (30 px tall, around the same 12 × 28 hitbox and hand point) in the shared 64 × 64 frames; their skills are classic's, and its customer is the `on-the-phone` concept animated (below). `tools/looks/terraria/generate.py` composes every frame from hand-placed parts shared the way Terraria shares a player's (far arm, legs and shoes, torso, head, hair, ear, eye, glasses, cap, near arm), so the three are one man in three outfits, and poses them the way Terraria poses its player: a drawing per limb per pose, chosen frame by frame, with the upper body moving as one.

- The limbs follow Terraria's own sprites at about 5/4 of their art-pixel size: standing, the near arm hangs over the back of the torso and only the far hand shows at the front; the near leg is the wide one at the back.
- `idle` stands still and blinks, as Terraria's player does; `run` is Terraria's 13-frame walk (its leg-sheet frames 7–19, the arm cell it pairs with each, the bob on the first three frames of each stride) at 30 fps; `jump` and `fall` are its one airborne frame, legs split, the near fist folded up behind the head and the far hand peeking out ahead of the face (falling, it sinks a pixel); `hurt` throws the arms open and the body back, then curls into that frame; `victory` raises a fist, the only pose besides the skills with one above the head, and hops, leaving the ground fast and hanging at the top.
- Props exist only while used, in `attack` and the skill poses alone. The ENGINEER types two-handed on a keyboard and slams Enter for his skill, the keyboard winking into being under his raised fists. The DESIGNER strums a white Stratocaster held along one diagonal, outlined dark so his trousers and back leg show around it, pumping his arm the way Terraria's guitars do; his `skill` crashes a power chord (POWER CHORD), and `skill-ux-elixir` drinks a pink potion the way Terraria drinks one, the guitar put away and the potion lifted to his lips in the far hand, so nothing else is in front of his face. The STRATEGIST throws empty-handed in Terraria's swing order, arm up, over, out and down, as Terraria hides a thrown item, and raises both hands for his skills, a star glinting over the front one. An attack's first frame is the shot leaving, with its `muzzle` there; a skill's first frame is its cast, with `hand` (the prop or the hand) and `mouth` anchors on every frame.
- The head is the same pixels in every frame of every hero: only the eye changes, to blink or to wince, and in the revision the hair's loose ends.
- `python3 tools/looks/terraria/review.py` writes GIFs and strips of every animation, and the same held still on the head (it reads the sheets' PNGs, so export them first); `python3 -m unittest discover -s tools/looks/terraria -t tools/looks/terraria` checks that the sheets are what the generator writes (their JSON always; their pixels, and the pixel tests that follow, once the PNGs are exported), crisp, standing on the feet line, with one head, each frame one figure, and no attack or skill frame held. The generator writes every hero in layers too (`pose.strokes(layer=...)`): legs rows for the moves and upper-body rows for the attack and skill poses, which its tests hold to compose back into the whole frames.

### Its revision: `terraria-revised` and `terraria-hooded`

The revision (`tools/looks/terraria/kit/revision.py`) redraws only head layers over the same bodies, posed in the same moves: the hair after the Terraria hairstyle the captain picked (143), glasses with one flat heavy rim and nothing standing on it, the DESIGNER's cap with only its front spot and the hair pushed out behind it in a tuft, and the ENGINEER with his hood up. The generator writes the three heroes as `terraria-revised` and the hood as `terraria-hooded`, a look that covers only Hackerman; both play the Terraria look's own attack strips, importing them from its folder, and are held to the same checks.

- The hair moves as 143 does in Terraria, a frame behind the body and a pixel at a time, while the crown and the fringe on the glasses never move. Its front lock bounces up on the frames 143's does through the walk. In the air it rests on the way up, as Terraria draws hair in its airborne frame; coming down (falling, after the top of victory's hop, and curled up after a hit) the lock lifts a pixel and the nape floats off the ear, and both drop back to rest the frame he lands, a pixel each, as his whole body does. The hit itself flares the lock forward. Standing, attacking and casting, the hair rests, so the head is as still as the look's.
- Under the cap and the hood the hair never moves: Terraria draws a hairstyle's hat version under headgear (`Player_HairAlt_143`) and never redraws it, so the DESIGNER's tuft and the hooded ENGINEER's lock stay as drawn in every frame.
- The hood moves with his head and shoulders as one drawing, and only the fringe and the lock show under it.
- The game ships the revision's three heroes; the Terraria look's own heroes and the hood stay registered, for the harness (`?looks={"characters":{"hackerman":"terraria-hooded"}}`). The lineup (`?scene=lineup`, `art/looks/terraria/designs.ts`) stands their sheets idling beside the game's cast, on the select screen's paper or a stage (`backdrop`), whatever look the game is set to: the look's heroes by default, the revision with `{"cast":"revised"}`.
- `python3 tools/looks/terraria/review.py --look terraria-revised` (or `terraria-hooded`) writes the same review boards for them.

### Terraria customer concepts

Three concepts for the Unhappy Customer in the heroes' Terraria style, each a different person with a different gag, drawn at the heroes' size and in their construction (each material outlined in its own darkest tone, the same head and limb proportions, palettes of 30 to 40 colours) but never in a hero's colours, so none reads as Roel. Each is drawn in its two key poses, shouting (`shout`, red in the face and to the scalp, the hands only a step warmer) and won over (`happy`, calm again), the two ends the five customer animations will run between:

| Concept        | Shouting                                                                            | Won over                                        |
| -------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| `on-the-phone` | a balding middle manager with a paunch and a gold tie yells into a 1996 brick phone pressed to his ear, elbow up, jabbing a finger at you, Terraria's anger emote over him | the phone lowered, a grin and a thumbs up       |
| `the-receipt`  | a shopper in a mustard raincoat holds up a receipt as long as she is, steam puffing off her curls, her shopping bag in the other hand | the receipt folded into the bag, a thumbs up    |
| `one-star`     | an app user in a beanie and a pink track jacket brandishes a cracked tablet reading 1★ | the tablet whole again, showing five stars, a fist in the air |

The game mirrors a customer to face left, and a customer faces the player, so a sheet must read both ways: one-star's screen shows only glyphs that are their own mirror image (a plain 1 on its foot, stars), so mirrored it still reads 1★ and five stars. The lineup stands every mood facing right and then left to show it.

They are not a look: nothing registers them and the game never loads them. `art/looks/terraria/customer-concepts/` holds their sheets (64 × 64 frames on the customer's origin, `mouth` and `head` anchors on both frames) and `concepts.ts` their catalogue; the lineup's customers cast (`?scene=lineup&params={"cast":"customers","customer":"one-star"}`) stands them, whatever look the game is set to.

`tools/looks/terraria/customer/generate.py` draws them, apart from the heroes' generator but writing its sheets with the heroes' packer: every customer is a set of layers hung from joints (`customer_kit/rig.py`): the legs on the ground, the torso from the hips, the head from the neck, each arm from its shoulder, each prop by its grip from a hand, and the steam and anger marks from the head. A pose only names a drawing per limb, how far the body and head move, what each hand holds and the mood, which dyes the face's skin and, a step milder, the hands'; animating a concept is adding drawings and poses, never redrawing it. `python3 tools/looks/terraria/customer/review.py --refs <folder of Terraria sprites>` writes an 8× lineup beside Terraria's own figures and a Terraria Roel at one size of art pixel, its black silhouettes and a native-size strip facing both ways; `python3 -m unittest discover -s tools/looks/terraria/customer -t tools/looks/terraria/customer` checks that the committed sheets are what the generator writes, crisp, on the feet line, 28 to 32 px tall, one figure each, outlined in their own darkest tones, calm when won over and flushed in the face but not the hands, that one-star's screens read the same mirrored, and that every limb drawn hangs from its joint.

### The Terraria customer

The look's customer is `on-the-phone` in all five customer animations, posed like the heroes (a drawing per limb chosen frame by frame, the upper body moved as one) and timed to how long the game holds each mood (`entities/customer/Customer.ts`):

- `walk` is a Terraria walker's heavy plod, 8 frames at 12 fps (the 0.67 s classic's takes), a step to each foot: the foot he stands on steps back 2.5 px a frame, 30 px a second, so with the walk played by distance it stays planted at any speed and either scale while the other passes it lifted and swings through, and the legs swap leads every step, the far leg a flat shade behind the lit near one. He leans a pixel into the stride with a 1 px stomp on each foot, the phone fixed at his ear, the free finger jabbing through a half jab on every step and the jaw still going, so the gag never pauses. The frame shown 1/6 s in, where the game stands a still customer, is a foot striking, both feet down.
- `shout` is one 0.4 s loop for the windup: the first frame is the yell, a lunge a pixel past his walking lean with his chin thrust out, its `mouth` where the bubble leaves; then he settles, rocks back upright drawing breath and sinks into the next yell. Terraria's anger emote swells with the yell behind his head, clear of the antenna, only while he shouts, and shrinks back only as he draws breath; without Terraria's white bubble behind it, it is rimmed in near-black red, so it holds over a red mailbox as well as the night.
- `hurt` is Terraria's knockback in 0.2 s of the 0.22 s hit: thrown back 3 px off his feet, then down to 1 px, arms thrown wide, the phone yanked off his ear to arm's length below the overhead pips, eye shut, tie flung up, then landing with a stomp and the phone back. The hit flash stays the game's white, since a red tint would vanish on his flushed face.
- `stunned` sways for the 3 s stun, eyelid drooping, the eye rolling up and back and the jaw slack, the phone hanging upside down from a limp hand, its antenna pointing down but stopping 3 px clear of the ground, its lower end lagging a frame behind the sway; the head sways twice as far as the body, a pixel a frame. Two of Terraria's Dazed stars (`customer_kit/dazed.py`) circle his head on a tilted orbit, behind it on the far half, so they never stand one above the other.
- `happy` hops twice in the 0.8 s he cheers and loops on as he strolls off: the call held away from his ear, a thumbs up bounced at you, his tie flying.

His phone antenna tops out 32 px over his feet, two over classic's head, so the overhead stack rises 2 px (4 on the escalated customer, drawn at 2×); `mouth` sits 19 px over his feet, the height a regular complaint leaves at (`world/Complaints.ts`; the escalated customer's volley flies at its own fixed heights). `customer_kit/moves.py` holds the poses and `customer_kit/on_the_phone.py` the drawings they are made of; the concept as it was judged is kept apart in `customer_kit/on_the_phone_concept.py`, so its key poses on the concepts board stay as drawn. `python3 tools/looks/terraria/customer/generate.py` writes `art/looks/terraria/customer/sheet.png` and `.json` with the concepts; the generator's tests also hold every animation to the outline rule, the feet line and the palette cap, and `art/looks/terraria/customer.test.ts` holds the sheet to the game's timings.

## Checks

- `pnpm test` (`registeredLooks.test.ts`): every index module declares its piece; every sheet meets its kind's animations, frame size and origin; every sheet's pixels have the size its JSON describes; every folder with art has an `index.ts`.
- `pnpm e2e` (`e2e/looks.spec.ts`): every registered look loads in the browser, and the first and last frame of every animation is non-blank with alpha only 0 or 255; every showcase demo plays without errors.

## Making the art

Any technique is fine; commit the recipe.

- **Hand-placed or procedural**: commit the generator under `tools/looks/<lookId>/` (TypeScript or Python with Pillow), writing the PNG + JSON deterministically; `pnpm build:art` then turns the PNG into the committed art module.
- **Image generation**: follow `tools/art/README.md` and `tools/art/prompts/*.md`. Keep raw sources out of the repository, commit the exact prompts as `tools/art/prompts/looks-<lookId>.md` and the processing script (crop → area downsample → quantise → outline → align on the feet line → pack). Generated frames always need a cleanup pass to native-pixel quality: keep the head pixel-identical across frames so the likeness never wobbles, fix stray pixels, unify palettes and register the feet.
- The bar is hand-placed-looking pixel art at native 320 × 240: one art pixel is one screen pixel, no anti-aliasing, no semi-transparent pixels, no text baked into sprites beyond tiny deliberate glyphs.
