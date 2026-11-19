# Hibit skills: sources and prompts

The hibit look's six skills (icons and effects) use **no image generation**.
Every pixel is drawn by `tools/looks/hibit/skills/` (`python3 tools/looks/hibit/skills/build.py`), so there are no raw sources to keep and no prompts to replay.

Why code instead of generated paintings:

- A 24 × 24 icon or a 5 px beam layer has no room for a downsampled painting's soft edges; hand-placed pixel maps and whole-pixel geometry hit the hand-placed bar directly.
- Every effect shares one exact palette (`hibitfx/palette.py`), one key light and one outline rule, which a generator cannot guarantee across six skills.
- Motion is designed frame by frame (beat sheets in `docs/looks/hibit-skills.md`); procedural frames keep a beam's tiles seamless, a bubble's wobble exact and a spin's facets lit consistently.
- Rebuilds are pixel-identical (`build.py --check`, against the PNGs `pnpm build:art --export src/game` writes back), and no shared generation quota was spent.

## References used

- `refs/room-stratocaster-olympic-white.png`: the POWER CHORD icon's Strat (Olympic White double-cutaway body, mint pickguard, three white single-coils, chrome bridge, rosewood board on a maple neck, six-in-line headstock), hand-placed at 45°.
- `refs/style-reference-grid.png`: the quality and density target; the style board in `mockups.py` sets the effects beside it.
- `refs/current-customer-and-icons.png`: today's 16 × 16 icons, whose subjects each new icon keeps (stack, drone, potion, guitar, star, heart).

## Design briefs (the prompts a human artist would follow)

These are the briefs the generator implements, kept here so the intent survives future redraws.

### FULL-STACK ATTACK

Three stacked discs, cyan front-end on top, violet back-end, amber database below, firing their layers as one three-band beam with white cores and pointed tips.
In game the same three layers form a 23 px beam from the hand to the screen edge, with dark data glyphs (`</>`, `{.}`, table rows) streaming through each layer at its own speed, a charge of three converging sparks, a pierce burst on every customer and a collapse into dashes and dots.

### AGENT SUMMON

A friendly AI drone: a pearl dome with a dark visor and two cyan eyes, a rotor on a short mast, an amber status light, a little tool arm that fires cyan packets and a cyan thruster.
It prints itself into existence with a scanline, hovers in sync with its orbit, recoils and blinks contentedly when it fires, turns its light red in its last second and lifts away as cyan dust.

### UX ELIXIR

A round-bottomed flask of magenta elixir with a cork and a heart in the liquid, glass lit from the top-left.
In game it pops into the hand, floats to the lips, uncorks, tips and pours while the liquid stays level, tumbles away and poofs; a pastel wave of calm rolls out, a buff ring glows at the hero's feet and every customer wears a floating heart.

### POWER CHORD

The Olympic White Strat throwing violet sound arcs.
In game: a strum flare at the guitar body, three banded shockwave rings behind every body, sound crests racing along the ground, a spray of notes, and a crown of gold stars and a note orbiting each stunned customer.

### NORTH STAR

A faceted four-point gold star whose long needle points north, on a night-blue backlight.
In game it launches with a pillar of light, spins about its north-south axis without losing its north, leaves sparkles that cool from gold to night blue, and lands in a north-long flare.

### CHURN SHIELD

A glossy soap bubble with a heart inside: bright rim, teal band, iridescent film streaks, a bold curved specular.
In game it inflates around the hero, wobbles while its film slides round, dents and ripples where a customer bumps it (who floats off a heart in a tiny bubble), thins out and pops into droplets.
