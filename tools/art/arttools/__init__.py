"""Pixel-art asset pipeline for the arcade levels.

Every function takes and returns Pillow ``RGBA`` images so steps compose freely.
Alpha is kept strictly binary (0 or 255) after downsampling, because the game
draws with ``imageSmoothingEnabled = false`` and a half-transparent edge pixel
would read as a halo against every background it scrolls over.
"""
