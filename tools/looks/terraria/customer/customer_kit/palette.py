"""Every colour the Unhappy Customers and their props are painted in, as ramps from the outline up to the light.

Small ramps in the Terraria heroes' construction (outline, shade, base, light, highlight), chosen so each
customer reads on the Berlin night, the San Francisco golden hour and the menu's blueprint blue alike, and
never in a hero's colours: no ash-blonde hair, no black hoodie, no white shirt, no tie-dye knit.
"""
from __future__ import annotations

from typing import Dict, Tuple

RAMPS: Dict[str, Tuple[str, ...]] = {
    # ── Shared by every customer ──
    # Red in the face: the skin flushed to the ears, outlined in a deep red-brown, while they are unhappy. Their
    # hands only warm a step from calm (each customer's `hands-*-warm`), outlined in the same red-brown.
    'skin-fuming': ('#4a1210', '#b83a30', '#e2624f', '#f78a70'),
    'eye': ('#f6f2ea', '#26262e'),
    'mouth': ('#3a0c12', '#f6f2ea', '#c4485a'),
    # Steam puffing from the ears, and the cross-popping vein of Terraria's anger emote, in the emote's own tones.
    'steam': ('#7a7486', '#c9c3d2', '#ece8f2', '#ffffff'),
    'anger': ('#61001c', '#c52f03', '#ff6a07'),

    # ── ON THE PHONE: a middle manager ──
    'skin-office': ('#3b1d14', '#c98a6a', '#eab08e', '#f8cdb0'),
    'hands-office-warm': ('#4a1210', '#cc7a5c', '#eca082', '#f9c0a2'),
    # What is left of his hair: a horseshoe of short brown clumps round the back of his head.
    'hair-office': ('#1a100a', '#46301f', '#6a4a30', '#8e6a46', '#b48c62'),
    # A pale blue office shirt, outlined in navy so it holds its edge on the blueprint's blue.
    'shirt-blue': ('#1c2a4a', '#5a7fb4', '#8db0dc', '#b9d3f0', '#e2eefa'),
    # A loud gold tie, off the flush's reds so it never runs into his chin.
    'tie-gold': ('#3a2404', '#a8700c', '#e0a41c', '#f8d458'),
    # Grey office slacks, and black oxfords that the belt is cut from, its buckle catching the light.
    'slacks-grey': ('#1b1d24', '#4a4f5b', '#6b717e', '#8f96a3'),
    'oxfords': ('#08080c', '#1d1e26', '#33343f', '#7a7d8c'),
    # A 1996 brick phone in light grey plastic, its display lit green.
    'phone': ('#17181d', '#5a5e68', '#9196a1', '#c8ccd4', '#5cb856', '#c4f2b4'),

    # ── THE RECEIPT: a shopper ──
    'skin-shopper': ('#3d1d16', '#d0927a', '#f0bca0', '#fcd8c2'),
    'hands-shopper-warm': ('#4a1210', '#d2826a', '#f2a88e', '#fcc8b2'),
    # Big auburn curls.
    'hair-curls': ('#2a0c08', '#5c1e12', '#8c361e', '#b8582c', '#dc8246'),
    # A mustard raincoat, warm against both stages' cool walls and the blueprint's blue.
    'raincoat': ('#3a2604', '#a2740e', '#d6a11c', '#f0c443', '#fbe28a'),
    # Its horn toggles, and the wellies under it.
    'toggle': ('#2a1608', '#5e3a1a', '#8a5a2c', '#b98648'),
    'wellies': ('#0f1d18', '#1e3a30', '#2d5446', '#467363'),
    'tights': ('#1a1420', '#2e2438', '#41354e', '#584a68'),
    # A paper shopping bag with a leek in it.
    'kraft': ('#3a2410', '#87592a', '#b5844a', '#d8ab70'),
    'leek': ('#183410', '#3f7a26', '#7cbf4c', '#e6efd2'),
    # The receipt: thermal paper, its print in grey rows.
    'receipt': ('#4a4652', '#9a96a4', '#e4e0d8', '#fbf9f3'),

    # ── ONE STAR: an app user ──
    'skin-app': ('#3a1c13', '#c88866', '#e8ac86', '#f7c9a8'),
    'hands-app-warm': ('#4a1210', '#cc7a5a', '#ec9e7e', '#f9bc9c'),
    'hair-app': ('#160d0a', '#33221a', '#4f362a', '#6c4c3a', '#8a6650'),
    # A hot pink track jacket, and the white of its stripes, which the chunky sneakers are too.
    'track': ('#3e0a26', '#a81c5c', '#de3a82', '#f56fa6', '#ffb0cf'),
    'stripe': ('#3c3a42', '#b4b0bf', '#e6e4ec', '#ffffff'),
    'beanie': ('#0a2a2e', '#156066', '#1f8a8c', '#3cb5ac', '#7fded0'),
    'joggers': ('#0e0f14', '#22242d', '#343743', '#4b4f5e'),
    # The gadgets: the tablet's dark case, which the headphones round the neck share, its lit screen with the
    # crack across it, and the gold stars it shows.
    'gadget': ('#0b0c10', '#23252d', '#3a3d48', '#9a9eac'),
    'screen': ('#1b3a66', '#3f6fae', '#8fb6e8', '#e8f3ff'),
    'star': ('#6a3c04', '#d08a0c', '#ffc928', '#fff2a0'),
}
