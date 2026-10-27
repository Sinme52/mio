#!/usr/bin/env python3
"""Turn the raw generated images in assets_src/ into game textures in web/assets/img/.

Sprites are trimmed to their alpha bounds and scaled; layers and backgrounds are re-encoded
as WebP. Also writes lossless-quality WebP copies of the sources (assets_src/*.webp) which are
what we keep in git (the PNGs are large and ignored)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "assets_src", ROOT / "web/assets/img"

SPRITES = {"mio": 1024, "shark": 1024, "leviathan": 2048, "whale": 1536, "fish_a": 192,
           "fish_b": 160, "turtle": 640, "manta": 768, "crystal": 384, "logo": 1400}
LAYERS = ["b1_far", "b1_mid", "b2_far", "b2_mid", "b3_far", "b3_mid", "b4_far", "b4_mid"]
OPAQUE = {"sky": 1536, "keyart": 1920}

def trim(im, thr=10, pad=6):
    a = im.split()[-1].point(lambda v: 255 if v > thr else 0)
    l, t, r, b = a.getbbox()
    return im.crop((max(l - pad, 0), max(t - pad, 0), min(r + pad, im.width), min(b + pad, im.height)))

def fit(im, maxw):
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    return im

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for png in sorted(SRC.glob("*.png")):
        Image.open(png).save(png.with_suffix(".webp"), quality=95, method=6)
    for name, w in SPRITES.items():
        im = fit(trim(Image.open(SRC / f"{name}.png").convert("RGBA")), w)
        im.save(OUT / f"{name}.webp", quality=90, method=6)
        print(name, im.size)
    for name in LAYERS:
        Image.open(SRC / f"{name}.png").convert("RGBA").save(OUT / f"{name}.webp", quality=88, method=6)
    for name, w in OPAQUE.items():
        fit(Image.open(SRC / f"{name}.png").convert("RGB"), w).save(OUT / f"{name}.webp", quality=88, method=6)

if __name__ == "__main__":
    main()
