#!/usr/bin/env python3
"""Compose Steam store / library images (required sizes) and the app icon from the generated art."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets_src"
OUT = ROOT / "store"

def src(name):
    p = SRC / f"{name}.png"
    return Image.open(p if p.exists() else SRC / f"{name}.webp").convert("RGBA")

def cover(im, w, h, fx=0.5, fy=0.5):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x = round((im.width - w) * fx); y = round((im.height - h) * fy)
    return im.crop((x, y, x + w, y + h))

def trimmed(im):
    return im.crop(im.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox())

def shade_left(im, strength=0.75, reach=0.55):
    w, h = im.size
    g = Image.new("L", (w, 1))
    for x in range(w):
        g.putpixel((x, 0), int(255 * strength * max(0.0, 1 - x / (w * reach))))
    g = g.resize((w, h))
    dark = Image.new("RGBA", im.size, (0, 10, 20, 255))
    return Image.composite(dark, im, g)

def place_logo(canvas, logo, box_w, box_h, cx, cy):
    s = min(box_w / logo.width, box_h / logo.height)
    lg = logo.resize((round(logo.width * s), round(logo.height * s)), Image.LANCZOS)
    glow = lg.split()[-1].filter(ImageFilter.GaussianBlur(max(2, lg.height // 25)))
    halo = Image.new("RGBA", lg.size, (60, 190, 255, 0)); halo.putalpha(glow.point(lambda v: v * 0.55))
    pos = (round(cx - lg.width / 2), round(cy - lg.height / 2))
    canvas.alpha_composite(halo, pos)
    canvas.alpha_composite(lg, pos)
    return canvas

def main():
    OUT.mkdir(exist_ok=True)
    key, tall, hero, logo = src("keyart"), src("capsule_tall"), src("hero"), trimmed(src("logo"))
    wide = [("header_capsule", 920, 430, 0.62), ("small_capsule", 462, 174, 0.66), ("main_capsule", 1232, 706, 0.6)]
    for name, w, h, lw in wide:
        c = shade_left(cover(key, w, h, 0.6, 0.45))
        place_logo(c, logo, w * 0.46, h * lw, w * 0.27, h * 0.5)
        c.convert("RGB").save(OUT / f"{name}.png")
    for name, w, h in [("vertical_capsule", 748, 896), ("library_capsule", 600, 900)]:
        c = cover(tall, w, h, 0.5, 0.55)
        top = Image.new("RGBA", (w, h), (0, 10, 20, 0))
        d = ImageDraw.Draw(top)
        for y in range(int(h * 0.45)):
            d.line([(0, y), (w, y)], fill=(0, 10, 20, int(170 * (1 - y / (h * 0.45)))))
        c.alpha_composite(top)
        place_logo(c, logo, w * 0.82, h * 0.3, w / 2, h * 0.19)
        c.convert("RGB").save(OUT / f"{name}.png")
    cover(hero, 3840, 1240).convert("RGB").save(OUT / "library_hero.jpg", quality=90)
    lib_logo = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    place_logo(lib_logo, logo, 1200, 680, 640, 360)
    lib_logo.save(OUT / "library_logo.png")
    bg = cover(key, 1438, 810)
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(6))).enhance(0.45)
    bg.convert("RGB").save(OUT / "page_background.png")
    # Icon: Mio on a deep-blue disc.
    mio = trimmed(src("mio"))
    for size, path in [(512, ROOT / "build/icon.png"), (256, OUT / "client_icon_256.png"), (184, OUT / "community_icon.png")]:
        ic = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        disc = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        dd = ImageDraw.Draw(disc)
        for r in range(size // 2, 0, -1):
            t = r / (size / 2)
            dd.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r],
                       fill=(int(10 + 40 * (1 - t)), int(70 + 120 * (1 - t)), int(110 + 120 * (1 - t)), 255))
        ic.alpha_composite(disc)
        m = mio.rotate(18, expand=True, resample=Image.BICUBIC)
        s = size * 0.92 / m.width
        m = m.resize((round(m.width * s), round(m.height * s)), Image.LANCZOS)
        ic.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
        ic.putalpha(Image.composite(ic.split()[-1], Image.new("L", (size, size), 0), mask))
        ic.save(path)
    for p in sorted([*OUT.glob("*.png"), *OUT.glob("*.jpg")]):
        print(p.name, Image.open(p).size)

if __name__ == "__main__":
    main()
