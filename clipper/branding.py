"""ClippersFc channel art: profile picture (800x800) + banner (2560x1440).

    python clipper/branding.py <out_dir>

Deterministic (no randomness): Vice-City-style sunset gradient, sun stripes,
bold Impact lettering. Deliberately NO Rockstar/GTA logo or artwork.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = r"C:\Windows\Fonts"
TOP, MID, BOT = (32, 10, 74), (214, 36, 140), (255, 150, 40)


def gradient(w, h):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        if t < 0.6:
            k = t / 0.6
            c = tuple(int(TOP[i] + (MID[i] - TOP[i]) * k) for i in range(3))
        else:
            k = (t - 0.6) / 0.4
            c = tuple(int(MID[i] + (BOT[i] - MID[i]) * k) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def sun(draw, cx, cy, r, bands=6):
    for i in range(r, 0, -2):
        t = i / r
        col = (255, int(90 + 140 * (1 - t)), int(60 + 40 * (1 - t)))
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=col)
    # retro stripes cut through the lower half
    for b in range(bands):
        y = cy + int(r * 0.15) + b * int(r * 0.14)
        hgt = 3 + b * 3
        draw.rectangle([cx - r, y, cx + r, y + hgt], fill=None)


def stripe_cut(img, cx, cy, r, base, bands=6):
    d = ImageDraw.Draw(img)
    for b in range(bands):
        y = cy + int(r * 0.12) + b * int(r * 0.15)
        hgt = 4 + b * 4
        for yy in range(y, min(y + hgt, cy + r)):
            row = base.crop((0, yy, img.width, yy + 1))
            img.paste(row.crop((cx - r, 0, cx + r, 1)), (cx - r, yy))
    return d


def text_center(draw, cx, cy, text, font, fill, stroke, stroke_fill):
    l, t, r, b = draw.textbbox((0, 0), text, font=font, stroke_width=stroke)
    draw.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), text, font=font,
              fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)


def profile(path):
    s = 800
    base = gradient(s, s)
    img = base.copy()
    d = ImageDraw.Draw(img)
    cx, cy, r = s // 2, 330, 230
    sun(d, cx, cy, r)
    stripe_cut(img, cx, cy, r, base)
    d = ImageDraw.Draw(img)
    big = ImageFont.truetype(os.path.join(FONTS, "impact.ttf"), 300)
    small = ImageFont.truetype(os.path.join(FONTS, "ariblk.ttf"), 70)
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    text_center(gd, cx, 420, "CFC", big, (0, 255, 240, 255), 18, (0, 255, 240, 255))
    img.paste(glow.filter(ImageFilter.GaussianBlur(14)), (0, 0), glow.filter(ImageFilter.GaussianBlur(14)))
    text_center(d, cx, 420, "CFC", big, (255, 255, 255), 10, (20, 0, 40))
    text_center(d, cx, 640, "CLIPS", small, (255, 255, 255), 6, (20, 0, 40))
    img.save(path, "PNG")


def banner(path):
    w, h = 2560, 1440
    base = gradient(w, h)
    img = base.copy()
    d = ImageDraw.Draw(img)
    cx, cy, r = w // 2, 640, 300
    sun(d, cx, cy, r)
    stripe_cut(img, cx, cy, r, base)
    d = ImageDraw.Draw(img)
    # ground grid (synthwave) below the safe area
    for i in range(-20, 21):
        d.line([(cx + i * 40, 900), (cx + i * 260, h)], fill=(255, 90, 200), width=3)
    for k in range(10):
        y = 900 + int((k / 9) ** 1.8 * (h - 900))
        d.line([(0, y), (w, y)], fill=(255, 90, 200), width=3)
    title = ImageFont.truetype(os.path.join(FONTS, "impact.ttf"), 210)
    sub = ImageFont.truetype(os.path.join(FONTS, "ariblk.ttf"), 64)
    # all text inside YouTube's 1546x423 safe area centred at (1280, 720)
    text_center(d, cx, 665, "CLIPPERS FC", title, (255, 255, 255), 12, (20, 0, 40))
    text_center(d, cx, 820, "GTA 6 STREAMER CLIPS  -  NEW EVERY DAY", sub,
                (255, 255, 255), 6, (20, 0, 40))
    img.save(path, "PNG")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    profile(os.path.join(out, "clippersfc_profile.png"))
    banner(os.path.join(out, "clippersfc_banner.png"))
    print("ok")
