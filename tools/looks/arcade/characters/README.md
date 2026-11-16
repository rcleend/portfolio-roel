# Arcade look · characters

The arcade (Neo Geo / Metal Slug) versions of the three heroes, their attack sprites and the Unhappy Customer, in the look-asset format of `src/game/art/looks/` (64 × 64 frames, origin at the feet).
Python 3.9+ and Pillow only; every shipped pixel comes from this folder, deterministically.

```sh
pnpm build:art --export src/game                          # the committed art back as PNGs beside its modules
python3 tools/looks/arcade/characters/build.py            # writes src/game/art/looks/arcade/{characters,customer}/
python3 tools/looks/arcade/characters/build.py --check    # fails if the sheets are stale
python3 tools/looks/arcade/characters/review.py --refs <look refs dir>   # review boards in /tmp
python3 -m unittest discover -s tools/looks/arcade/characters -t tools/looks/arcade/characters
pnpm build:art                                            # every PNG under src/game into its art module; removes the PNGs
```

The game's art is committed as `*.art.ts` modules holding the pixels, with each sheet's JSON beside it; a PNG under `src/game` exists only between the export and `pnpm build:art` (tools/art/README.md › Art modules).
Without the export, `--check` compares the JSON alone and exits 2 saying so, and the tests that read the sheets' pixels are skipped; with it, a sheet is compared with a fresh build pixel for pixel (`tools/looks/artfiles.py`).

## How a frame is made

```
kit/
  head.py         the likeness head kit: one face, expression patches, a cap variant
  hands.py        hand shapes drawn pointing down, turned in quarter turns to follow the forearm
  rig.py          skeleton, two-bone IK, capsule limbs, depth layers, the `lift` that sets leg length
  raster.py       capsules, polygons and arcs sampled at pixel centres, cel shaded from the top-left light
  compose.py      stacks parts and resolves outlines (near-black silhouette, softer inner lines, rim light)
  heroes/         one module per hero: outfit, prop, idle / attack / skill / victory; moves.py has the
                  shared run, jump, fall and hurt timing
  customer.py     the Unhappy Customer on the same rig with his own skeleton
  effects.py      attack projectiles, impacts and muzzle flashes
  sheet.py        packs frames into PNG + JSON (printed the way Biome formats JSON) and validates them
```

- **The head never wobbles.** `head.py` is drawn once; expressions patch only eyes, brows and mouth, and the cap replaces only the hair above the brow, so glasses, nose, jaw and ear are pixel-identical in every frame of every hero.
- **One rig, three outfits.** Poses name the pelvis and the wrist and ankle targets in frame pixels; IK keeps bone lengths fixed. Torsos, hands, shoes, props and heads are hand-authored key grids; sleeves and trouser legs are capsules shaded in the outfit's ramps, with cuffs, creases and limb-space prints (the tie-dye travels with the sleeve).
- **Outlines are resolved, not drawn.** Each part carries `o` on its rim; next to empty space it becomes the near-black silhouette, inside the figure it becomes the part's softer line colour, and it melts away where it would double up. Dark cloth gets a cool rim on its right edge: the TV's glow.
- **Shared timing.** Run, jump, fall and hurt are identical for the three heroes; each hero adapts them only through `carry()` (the keyboard on its strap, the Strat, the pad).

Image generation was used for two design studies only; see `tools/art/prompts/looks-arcade-characters.md`.
