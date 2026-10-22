# Arcade look · skills — image-generation prompts

None.
Every icon and effect strip of the arcade look's six skills is drawn by code in `tools/looks/arcade/skills/` (`skillart/` per skill, `pixkit/` for the shared kit), so there are no generated sources and no prompts to replay.

Why no generation here, when the levels use it:
at 24 × 24 an icon is a few hundred pixels, and an effect frame is a handful of shapes whose every pixel and every frame-to-frame step is the motion design.
A downsampled painting would need redrawing pixel by pixel anyway, while drawing them as code keeps them crisp, deterministic and easy to retime (`python3 tools/looks/arcade/skills/build.py`).

The motion spec is in `docs/looks/arcade-skills.md`.
