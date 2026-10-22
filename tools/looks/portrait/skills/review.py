#!/usr/bin/env python3
"""Review sheets for the portrait skill art (written outside the repo).

  review.py                                  # everything -> /tmp/arcade-looks-portrait-skills/
  review.py icons strips                     # only some sections
  review.py mockups --ref <style-reference-grid.png>

Sections:
  icons     the six icons on the game's bevelled slots: every idle frame at 4x,
            the set side by side, and 1x HUD / select-screen rows (shown at 3x)
  strips    every effect strip, one row per animation, at 4x on dark and mid backgrounds
  mockups   storyboards of each skill's key frames over the real level backdrops,
            with stand-in heroes and customers at the new 54-60 px scale
  styleref  effect key frames beside the captain's style reference grid
  boards    the curated review set: the icon board, one board per hero with
            both skills' key frames (one on the Berlin night, one in the San
            Francisco golden hour), the style reference, every effect sprite

Stand-ins are cut from the style reference at review time when `--ref` is
given (they are never committed); otherwise plain silhouettes are drawn.
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(HERE))

from portrait_fx import preview  # noqa: E402
from portrait_fx.sheet import Strip  # noqa: E402
from portrait_fx.skills import SKILLS  # noqa: E402
from storyboards import STORYBOARDS, STYLEREF, Moment, Sprite, Stage, draw_code  # noqa: E402

DEFAULT_OUT = Path("/tmp/arcade-looks-portrait-skills")
DEFAULT_BOARDS = Path("/tmp/arcade-looks-portrait-skills-review")
#: The part of a mockup the zoomed review shows: hero on the left, customers on the right.
ZOOM = (56, 112, 296, 208)
GROUND_Y = 200
NAVY = (20, 18, 58, 255)
MID = (118, 112, 140, 255)


# ── Loading ───────────────────────────────────────────────────────────────


def strips_of(skill_id: str) -> Dict[str, Strip]:
    return {strip.name: strip for strip in SKILLS[skill_id].strips()}


def frame_image(strip: Strip, animation: str, index: int) -> Image.Image:
    anim = next(a for a in strip.animations if a.name == animation)
    return anim.frames[min(index, len(anim.frames) - 1)].to_image()


# ── Icons ─────────────────────────────────────────────────────────────────


def review_icons(out: Path) -> List[Path]:
    written = []
    rows = []
    for skill_id in SKILLS:
        icon = strips_of(skill_id)["icon"]
        cells = []
        for frame in icon.animations[0].frames:
            slot = preview.slot(32, "steel")
            slot.alpha_composite(frame.to_image(), (4, 4))
            cells.append(slot)
        rows.append((skill_id, cells))
    scale = 4
    cell = 32 * scale + 4
    sheet = Image.new("RGBA", (16 * cell + 140, len(rows) * cell + 24), (16, 15, 30, 255))
    draw = ImageDraw.Draw(sheet)
    for f in range(16):
        draw.text((140 + f * cell + 4, 6), f"f{f}", fill=(180, 180, 200, 255))
    for r, (skill_id, cells) in enumerate(rows):
        draw.text((6, 24 + r * cell + 56), skill_id, fill=(220, 220, 235, 255))
        for c, image in enumerate(cells):
            sheet.alpha_composite(preview.scaled(image, scale), (140 + c * cell, 24 + r * cell))
    path = out / "icons-loops-4x.png"
    sheet.save(path)
    written.append(path)

    # The set at rest, on the steel slot (HUD, unlit select row) and the indigo slot (lit select row).
    scale = 4
    set_sheet = Image.new("RGBA", (6 * (32 * scale + 12) + 12, 2 * (32 * scale + 12) + 12), (16, 15, 30, 255))
    for r, theme in enumerate(("steel", "indigo")):
        for c, skill_id in enumerate(SKILLS):
            slot = preview.slot(32, theme)
            slot.alpha_composite(strips_of(skill_id)["icon"].animations[0].frames[0].to_image(), (4, 4))
            set_sheet.alpha_composite(
                preview.scaled(slot, scale), (12 + c * (32 * scale + 12), 12 + r * (32 * scale + 12))
            )
    path = out / "icons-set-4x.png"
    set_sheet.save(path)
    written.append(path)

    path = out / "icons-in-context-3x.png"
    preview.scaled(icons_in_context(), 3).save(path)
    written.append(path)
    return written


def icons_in_context() -> Image.Image:
    """The select screen's skill rows and the HUD strip, at native resolution."""
    scene = Image.new("RGBA", (320, 120), (14, 12, 40, 255))
    draw = ImageDraw.Draw(scene)
    pairs = (("full-stack-attack", "agent-summon"), ("ux-elixir", "power-chord"), ("north-star", "churn-shield"))
    for column, pair in enumerate(pairs):
        x = 6 + column * 104
        for row, skill_id in enumerate(pair):
            theme = "indigo" if row == 0 else "steel"
            slot = preview.slot(32, theme)
            slot.alpha_composite(strips_of(skill_id)["icon"].animations[0].frames[0].to_image(), (4, 4))
            scene.alpha_composite(slot, (x, 8 + row * 36))
            draw.text((x + 36, 18 + row * 36), skill_id.upper().replace("-", " ")[:12], fill=(255, 255, 255, 255))
    # HUD: two slots over the night stage, as in the level.
    stage = level_backdrop("scripe", 0).crop((0, 0, 320, 40))
    scene.alpha_composite(stage, (0, 80))
    for i, skill_id in enumerate(("full-stack-attack", "agent-summon")):
        slot = preview.slot(32, "steel")
        slot.alpha_composite(strips_of(skill_id)["icon"].animations[0].frames[0].to_image(), (4, 4))
        scene.alpha_composite(slot, (96 + i * 36, 83))
    return scene


# ── Strips ────────────────────────────────────────────────────────────────


def strip_sheet(strip: Strip, scale: int, background: Tuple[int, int, int, int], title: str = "") -> Image.Image:
    """Every animation of a strip as a row of frames at `scale`, with the origin marked in red."""
    fw, fh = strip.frame_w * scale, strip.frame_h * scale
    row_h = max(fh, 46)  # room for the three lines of the row's label
    columns = max(len(a.frames) for a in strip.animations)
    label_w = 110
    heading = f"{title or strip.name}  {strip.frame_w}x{strip.frame_h}  origin {strip.origin}"
    width = max(
        label_w + columns * (fw + 4) + 4, round(ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(heading)) + 12
    )
    sheet = Image.new("RGBA", (width, len(strip.animations) * (row_h + 16) + 20), (16, 15, 30, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((4, 4), heading, fill=(230, 230, 240, 255))
    for r, animation in enumerate(strip.animations):
        y = 20 + r * (row_h + 16)
        draw.text((4, y + 4), f"{animation.name}", fill=(220, 220, 235, 255))
        draw.text((4, y + 18), f"{len(animation.frames)}f @{animation.fps:g}fps", fill=(150, 150, 170, 255))
        draw.text((4, y + 32), "loop" if animation.loop else "once", fill=(150, 150, 170, 255))
        for c, frame in enumerate(animation.frames):
            cell = Image.new("RGBA", (strip.frame_w, strip.frame_h), background)
            cell.alpha_composite(frame.to_image())
            x = label_w + c * (fw + 4)
            sheet.alpha_composite(preview.scaled(cell, scale), (x, y))
            # Origin cross-hair, one native pixel.
            ox, oy = x + strip.origin[0] * scale, y + strip.origin[1] * scale
            draw.rectangle((ox, oy, ox + scale - 1, oy + scale - 1), outline=(255, 60, 60, 255))
    return sheet


def review_strips(out: Path) -> List[Path]:
    written = []
    for skill_id in SKILLS:
        sheets = []
        for name, strip in strips_of(skill_id).items():
            if name == "icon":
                continue
            scale = 4 if max(strip.frame_w, strip.frame_h) <= 48 else 3
            dark = strip_sheet(strip, scale, NAVY)
            mid = strip_sheet(strip, scale, MID)
            pair = Image.new("RGBA", (dark.width, dark.height + mid.height + 8), (8, 8, 12, 255))
            pair.alpha_composite(dark, (0, 0))
            pair.alpha_composite(mid, (0, dark.height + 8))
            sheets.append(pair)
        if not sheets:
            continue
        sheet = Image.new("RGBA", (max(s.width for s in sheets), sum(s.height + 12 for s in sheets)), (8, 8, 12, 255))
        y = 0
        for part in sheets:
            sheet.alpha_composite(part, (0, y))
            y += part.height + 12
        path = out / f"strips-{skill_id}.png"
        sheet.save(path)
        written.append(path)
    return written


# ── Backdrops and stand-ins ───────────────────────────────────────────────


def _level_preview_module():
    spec = importlib.util.spec_from_file_location("level_preview", REPO / "tools" / "art" / "preview.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("tools/art/preview.py not found")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_LEVELS: Dict[str, object] = {}


def level_backdrop(level_id: str, camera_x: int, foreground: bool = False) -> Image.Image:
    """The level composited like the game (tools/art/preview.py), foreground layer optional."""
    module = _level_preview_module()
    level = _LEVELS.get(level_id) or module.Level(level_id)
    _LEVELS[level_id] = level
    frame = Image.new("RGBA", (level.width, level.height), (0, 0, 0, 255))
    for layer in level.manifest["layers"]:
        if not layer["foreground"]:
            module.draw_layer(frame, level.images[layer["id"]], layer, camera_x)
    # Flat ground only: the demo pit and platforms would distract from the effect.
    for col in range(level.width // 16 + 1):
        for i, name in enumerate(("ground_top", "ground_fill", "ground_base")):
            module._composite_clipped(
                frame, level.tile(name + ("_alt" if col % 2 else "")), col * 16, level.ground_y + i * 16
            )
    if foreground:
        for layer in level.manifest["layers"]:
            if layer["foreground"]:
                module.draw_layer(frame, level.images[layer["id"]], layer, camera_x)
    return frame


@dataclass
class Cast:
    hero: Image.Image
    customers: List[Image.Image] = field(default_factory=list)


def cut_figures(reference: Path) -> List[Image.Image]:
    """Figures from the style reference at the native hero scale (~58 px), for scale only."""
    image = Image.open(reference).convert("RGB")
    background = image.getpixel((2, 2))
    w, h = image.size

    def is_background(p: Tuple[int, int, int]) -> bool:
        return max(abs(a - b) for a, b in zip(p, background)) < 40

    seen = [[False] * w for _ in range(h)]
    figures = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or is_background(image.getpixel((x, y))):
                continue
            stack, points = [(x, y)], []
            seen[y][x] = True
            while stack:
                cx, cy = stack.pop()
                points.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if (
                            0 <= nx < w
                            and 0 <= ny < h
                            and not seen[ny][nx]
                            and not is_background(image.getpixel((nx, ny)))
                        ):
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            if len(points) < 300:
                continue
            xs, ys = [p[0] for p in points], [p[1] for p in points]
            cut = Image.new("RGBA", (max(xs) - min(xs) + 1, max(ys) - min(ys) + 1), (0, 0, 0, 0))
            for px, py in points:
                cut.putpixel((px - min(xs), py - min(ys)), image.getpixel((px, py)) + (255,))
            scale = 58 / cut.height
            small = cut.resize((max(1, round(cut.width * scale)), 58), Image.Resampling.NEAREST)
            figures.append(_despeckle(small))
    return figures


def _despeckle(image: Image.Image) -> Image.Image:
    px = image.load()
    w, h = image.size
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            neighbours = sum(
                1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if 0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3]
            )
            if neighbours <= 1:
                px[x, y] = (0, 0, 0, 0)
    return image


def silhouette(height: int, body: str, skin: str, width: int = 18) -> Image.Image:
    """A plain stand-in figure when no reference is available."""
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    head = height // 7
    draw.ellipse((width // 2 - head // 2 - 1, 0, width // 2 + head // 2, head + 1), fill=skin)
    draw.rectangle((width // 2 - 5, head + 2, width // 2 + 4, int(height * 0.55)), fill=body)
    draw.rectangle((width // 2 - 4, int(height * 0.55), width // 2 - 1, height - 1), fill="#2a2a3a")
    draw.rectangle((width // 2 + 1, int(height * 0.55), width // 2 + 3, height - 1), fill="#2a2a3a")
    return image


def make_cast(reference: Optional[Path]) -> Cast:
    if reference and reference.exists():
        figures = cut_figures(reference)
        by_size = {i: f for i, f in enumerate(figures)}
        hero = by_size.get(1) or figures[0]
        customers = [
            f.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            for f in (by_size.get(8), by_size.get(13), by_size.get(12))
            if f
        ]
        return Cast(hero, customers)
    return Cast(
        silhouette(58, "#2a2f45", "#e8b896"),
        [silhouette(56, "#c86a3a", "#f0a080").transpose(Image.Transpose.FLIP_LEFT_RIGHT)] * 3,
    )


# ── Mockups ───────────────────────────────────────────────────────────────


def place(canvas: Image.Image, strip: Strip, sprite: Sprite) -> None:
    image = frame_image(strip, sprite.animation, sprite.frame)
    ox, oy = strip.origin
    if sprite.flip:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        ox = strip.frame_w - 1 - ox
    _composite_clipped(canvas, image, sprite.x - ox, sprite.y - oy)


def _composite_clipped(canvas: Image.Image, image: Image.Image, x: int, y: int) -> None:
    sx, sy = max(0, -x), max(0, -y)
    if sx >= image.width or sy >= image.height:
        return
    canvas.alpha_composite(image.crop((sx, sy, image.width, image.height)), (max(0, x), max(0, y)))


def render_moment(skill_id: str, level: str, moment: Moment, cast: Cast, positions: Stage) -> Image.Image:
    strips = strips_of(skill_id)
    canvas = level_backdrop(level, positions.camera)
    for kind, params in moment.code:
        if kind != "aura" and params.get("layer", "behind") == "behind":
            draw_code(canvas, kind, params)
    for sprite in moment.sprites:
        if sprite.layer == "behind":
            place(canvas, strips[sprite.strip], sprite)
    auras = {i: params for kind, params in moment.code if kind == "aura" for i in params["customers"]}
    for i, (cx, flip) in enumerate(positions.customers):
        figure = cast.customers[i % len(cast.customers)]
        if flip:
            figure = figure.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        x, y = cx - figure.width // 2, GROUND_Y - figure.height
        if i in auras:
            # Phase B draws this with the sheet's flash atlas: the silhouette, one pixel out, behind the sprite.
            ring = Image.new("RGBA", figure.size, preview.rgba(auras[i]["color"]))
            ring.putalpha(figure.getchannel("A"))
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                _composite_clipped(canvas, ring, x + dx, y + dy)
        _composite_clipped(canvas, figure, x, y)
    hero = cast.hero
    _composite_clipped(canvas, hero, positions.hero - hero.width // 2, GROUND_Y - hero.height)
    for kind, params in moment.code:
        if kind != "aura" and params.get("layer", "behind") == "front":
            draw_code(canvas, kind, params)
    for sprite in moment.sprites:
        if sprite.layer == "front":
            place(canvas, strips[sprite.strip], sprite)
    return canvas


def review_mockups(out: Path, reference: Optional[Path]) -> List[Path]:
    cast = make_cast(reference)
    written = []
    for skill_id, board in STORYBOARDS.items():
        for level, camera in (("scripe", 140), ("luna", 60)):
            stage = Stage(camera=camera)
            moments = board(stage)
            frames = [(m.label, render_moment(skill_id, level, m, cast, stage)) for m in moments]
            cells = [(label, preview.scaled(image, 2)) for label, image in frames]
            path = out / f"mockup-{skill_id}-{level}.png"
            preview.label_sheet(cells, 2).save(path)
            written.append(path)
            # The action region at 4x: where the hero, the effect and the customers meet.
            zoom = [(label, preview.scaled(image.crop(ZOOM), 4)) for label, image in frames]
            path = out / f"mockup-{skill_id}-{level}-zoom.png"
            preview.label_sheet(zoom, 2).save(path)
            written.append(path)
    return written


def review_styleref(out: Path, reference: Optional[Path]) -> List[Path]:
    if not reference or not reference.exists():
        print("styleref: skipped (no --ref)")
        return []
    base = Image.open(reference).convert("RGBA")
    # The reference is shown at its own pixel scale (~1.4 screen px per art px); effects are scaled to match it.
    factor = 82 / 58
    canvas = Image.new("RGBA", (base.width * 2, base.height), (199, 199, 212, 255))
    canvas.alpha_composite(base, (0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.text((base.width + 6, 4), "portrait skill fx at the reference's pixel scale", fill=(40, 40, 60, 255))
    x, y, row_h = base.width + 10, 24, 0
    for skill_id, items in STYLEREF.items():
        strips = strips_of(skill_id)
        for strip_name, animation, frame in items:
            image = frame_image(strips[strip_name], animation, frame)
            image = image.resize((round(image.width * factor), round(image.height * factor)), Image.Resampling.NEAREST)
            if x + image.width > canvas.width - 6:
                x, y, row_h = base.width + 10, y + row_h + 8, 0
            canvas.alpha_composite(image, (x, y))
            x += image.width + 8
            row_h = max(row_h, image.height)
    path = out / "styleref.png"
    preview.scaled(canvas, 2).save(path)
    return [path]


# ── Boards: the curated review set ───────────────────────────────────────

#: Each hero's two skills and the stage each is shown on, so every board shows both backdrops.
HERO_BOARDS = (
    ("hackerman", (("full-stack-attack", "scripe", 140), ("agent-summon", "luna", 60))),
    ("artsy", (("ux-elixir", "luna", 60), ("power-chord", "scripe", 140))),
    ("strategy", (("north-star", "scripe", 140), ("churn-shield", "luna", 60))),
)
#: Where the action is: hero on the left, the customers to the right, the ground at the bottom.
BOARD_CROP = (36, 100, 316, 208)
BOARD_SCALE = 3


def _titled(image: Image.Image, title: str, subtitle: str = "") -> Image.Image:
    bar = 34 if subtitle else 22
    out = Image.new("RGBA", (image.width, image.height + bar), (12, 11, 24, 255))
    draw = ImageDraw.Draw(out)
    draw.text((8, 5), title, fill=(240, 236, 255, 255))
    if subtitle:
        draw.text((8, 19), subtitle, fill=(160, 156, 190, 255))
    out.alpha_composite(image, (0, bar))
    return out


def _stack(images: List[Image.Image], gap: int = 10) -> Image.Image:
    out = Image.new("RGBA", (max(i.width for i in images), sum(i.height + gap for i in images) - gap), (8, 8, 14, 255))
    y = 0
    for image in images:
        out.alpha_composite(image, (0, y))
        y += image.height + gap
    return out


def review_boards(out: Path, reference: Optional[Path]) -> List[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written = []

    icons = []
    set_row = Image.open(DEFAULT_OUT / "icons-set-4x.png") if (DEFAULT_OUT / "icons-set-4x.png").exists() else None
    if set_row is None:
        review_icons(DEFAULT_OUT)
        set_row = Image.open(DEFAULT_OUT / "icons-set-4x.png")
    icons.append(
        _titled(
            set_row.convert("RGBA"),
            "The six icons at rest, 4x",
            "top: steel slot (HUD, unlit row) / bottom: indigo slot (lit row)",
        )
    )
    loops = Image.open(DEFAULT_OUT / "icons-loops-4x.png").convert("RGBA")
    loops = loops.resize((loops.width // 2, loops.height // 2), Image.Resampling.NEAREST)
    icons.append(
        _titled(
            loops,
            "Idle loops, 16 frames at 8 fps (shown at 2x)",
            "one moment of life each, a hero's two icons never move together",
        )
    )
    context = Image.open(DEFAULT_OUT / "icons-in-context-3x.png").convert("RGBA")
    icons.append(_titled(context, "At 1x in the select rows and the HUD (shown at 3x)"))
    path = out / "01-icons.png"
    _stack(icons).save(path)
    written.append(path)

    cast = make_cast(reference)
    for number, (hero, skills) in enumerate(HERO_BOARDS, start=2):
        parts = []
        for skill_id, level, camera in skills:
            stage = Stage(camera=camera)
            moments = STORYBOARDS[skill_id](stage)
            cells = [
                (m.label, preview.scaled(render_moment(skill_id, level, m, cast, stage).crop(BOARD_CROP), BOARD_SCALE))
                for m in moments
            ]
            where = "Berlin night" if level == "scripe" else "San Francisco golden hour"
            parts.append(
                _titled(
                    preview.label_sheet(cells, 2), f"{skill_id.upper().replace('-', ' ')} - {where}, {BOARD_SCALE}x"
                )
            )
        title = f"PORTRAIT - {hero.upper()} - key frames at the new 54-60 px hero scale (stand-ins cut from the style reference)"
        path = out / f"0{number}-{hero}-skills.png"
        _titled(_stack(parts), title).save(path)
        written.append(path)

    styleref = review_styleref(DEFAULT_OUT, reference)
    if styleref:
        path = out / "05-style-reference.png"
        _titled(
            Image.open(styleref[0]).convert("RGBA"),
            "Effect key frames beside the captain's style reference, at its pixel scale",
        ).save(path)
        written.append(path)

    sheets = []
    for skill_id in SKILLS:
        for name, strip in strips_of(skill_id).items():
            if name != "icon":
                scale = 2 if max(strip.frame_w, strip.frame_h) <= 48 else 1
                sheets.append(strip_sheet(strip, scale, NAVY, f"{skill_id} / {name}"))
    columns = [[], []]
    heights = [0, 0]
    for sheet in sheets:
        column = heights.index(min(heights))
        columns[column].append(sheet)
        heights[column] += sheet.height + 8
    halves = [_stack(c, 8) for c in columns if c]
    board = Image.new("RGBA", (sum(h.width for h in halves) + 12, max(h.height for h in halves)), (8, 8, 14, 255))
    board.alpha_composite(halves[0], (0, 0))
    if len(halves) > 1:
        board.alpha_composite(halves[1], (halves[0].width + 12, 0))
    path = out / "06-effect-sprites.png"
    _titled(board, "Every effect strip, one row per animation (red: origin)").save(path)
    written.append(path)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sections", nargs="*", default=["icons", "strips", "mockups", "styleref", "boards"])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--boards", type=Path, default=DEFAULT_BOARDS, help="where the curated review set goes")
    parser.add_argument(
        "--ref", type=Path, default=None, help="refs/style-reference-grid.png, for stand-ins and the side-by-side"
    )
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    written: List[Path] = []
    if "icons" in args.sections:
        written += review_icons(args.out)
    if "strips" in args.sections:
        written += review_strips(args.out)
    if "mockups" in args.sections:
        written += review_mockups(args.out, args.ref)
    if "styleref" in args.sections:
        written += review_styleref(args.out, args.ref)
    if "boards" in args.sections:
        written += review_boards(args.boards, args.ref)
    for path in written:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
