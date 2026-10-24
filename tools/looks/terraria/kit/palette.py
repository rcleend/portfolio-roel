"""Every colour the Terraria Roels and their props are painted in, as ramps from the outline up to the light."""
from __future__ import annotations

from typing import Dict, Tuple

RAMPS: Dict[str, Tuple[str, ...]] = {
    # ── The body, shared by every hero ──
    # Light, warm and a little pink (CAST notes), outlined in a deep brown as Terraria outlines skin.
    'skin': ('#3d1c17', '#d99a82', '#f3c3a7', '#fddcc8'),
    # Ash blonde: light brown with sun-bleached highlights, never yellow (CAST notes).
    'hair': ('#2e2118', '#4f3e2c', '#6b5640', '#8a7353', '#a8906a', '#c6af85', '#e0cfa2'),
    'eye': ('#f4f1ec', '#3f6470'),
    # Panto frames: a heavy dark upper rim over a lighter, thinner lower rim.
    'glasses': ('#1d1819', '#5e5250'),
    # ── Cloth: outline, shade, base, light, highlight, accent ──
    # Black, as Terraria draws black cloth: a dark grey base between a near-black outline and grey lights,
    # so its folds and edges still read on the dark stages. The drawstrings' tips are the ENGINEER's green.
    'hoodie': ('#111115', '#23242b', '#32333c', '#4a4c58', '#6f7282', '#3ddc84'),
    'jeans': ('#10172a', '#233559', '#31497a', '#4a68a0'),
    'sneakers-dark': ('#0f0f13', '#26272e', '#383a44', '#555867', '#d9dbe0'),
    # The black and sage tie-dye knit from the cap photo: a charcoal that still parts from menu navy, with
    # sage patches; the DESIGNER's cap is dyed in it too, so cap and sweater are one colour.
    'knit': ('#141518', '#2b2d31', '#3a3c41', '#5c6158', '#86907b', '#adb6a0'),
    'trousers-brown': ('#1e110a', '#3d2617', '#573823', '#765034'),
    'sneakers-light': ('#3a3530', '#9c9588', '#cfc8bb', '#ebe6dc', '#8a8273'),
    # Cool whites below pure white, as Terraria's cloth whites are, outlined dark enough to keep the shirt's
    # edge on a mid-value stage; the highlight only catches a sleeve turned to the light.
    'shirt': ('#3f4658', '#9ea8bb', '#d4dae5', '#eef1f6', '#fbfcfe'),
    'trousers-dark': ('#0c0e15', '#1f2433', '#2e3446', '#454d66'),
    'leather': ('#22120a', '#3a2010', '#6b3f22', '#9a6136', '#2b170c'),
    'belt': ('#22120a', '#3a2010', '#6b3f22', '#9a6136', '#d3a957'),
    # ── Props, drawn the way Terraria draws its items: each outlined in its own darkest tone ──
    # A chunky mechanical keyboard: a dark case, light keycaps and the ENGINEER's terminal-green underglow,
    # which also lights the key he strikes.
    'keyboard': ('#101014', '#2a2c35', '#3d404c', '#8a8f9e', '#d3d6df', '#1d8a52', '#3ddc84', '#b4ffd2'),
    # The Olympic White Stratocaster from the room: a cream body, a mint pickguard with white pickups, a
    # rosewood fingerboard on a maple neck and headstock, and a chrome bridge.
    'strat': ('#4a4236', '#cbbf9f', '#e9e1c8', '#fbf6e6'),
    'pickguard': ('#b9d3c4', '#e3f2e8'),
    'rosewood': ('#1f120c', '#3b2418'),
    'maple': ('#5a3a17', '#b98a4c', '#e0bb7c'),
    'chrome': ('#4a4d57', '#aeb3bf', '#f2f4f8'),
    # A yellow sticky note, its lower edge in shade where it curls off the pad.
    'note': ('#6b4e0a', '#d9a514', '#ffd23f', '#fff08a'),
    # Light the props give off: the strum's flash and the North Star's glint.
    'flash': ('#ffffff', '#fff6c2', '#ffd75e'),
    # ── Shots, outline first, their brightest tone the glowing core ──
    'code': ('#04261a', '#1d8a52', '#3ddc84', '#b4ffd2', '#ffffff'),
    'paint-pink': ('#4f0b2c', '#c22a6e', '#ff4fa3', '#ff9ad8', '#ffffff'),
    'paint-cyan': ('#06323f', '#1690b0', '#3fd6f2', '#a6f2ff', '#ffffff'),
    'paint-yellow': ('#523a03', '#c99512', '#ffd23f', '#fff08a', '#ffffff'),
    'paper': ('#6b4e0a', '#d9a514', '#ffd23f', '#fff08a', '#ffffff'),
}
