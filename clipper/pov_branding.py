"""Minute Stories channel art: profile picture (800x800), watermark (150x150),
banner (2560x1440, text inside YouTube's 1546x423 safe area).

    python clipper/pov_branding.py <out_dir> [banner_background.jpg]

The banner background is a still of the flood world rendered by
clipper/pov/art.html (render.mjs --page art.html --w 2560 --h 1440 ...).
Deterministic: pure drawing, no randomness. Colours match the show:
navy night, choice-blue, choice-orange, caption-yellow.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = r"C:\Windows\Fonts"
NAVY, BLUE, ORANGE, YELLOW, INK = (16, 22, 44), (30, 136, 229), (255, 109, 0), (255, 213, 74), (10, 12, 20)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def stopwatch(size=800):
    """Stopwatch whose face is split into the two choice colours."""
    S = size * 2                                    # draw 2x, downsample = clean edges
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # background disc: navy with a soft lighter centre
    for i in range(S // 2, 0, -4):
        k = i / (S / 2)
        c = tuple(int(NAVY[j] + (60 - NAVY[j]) * (1 - k) * 0.6) for j in range(3))
        d.ellipse([S / 2 - i, S / 2 - i, S / 2 + i, S / 2 + i], fill=c + (255,))
    cx, cy, r = S / 2, S * 0.56, S * 0.33
    o = S * 0.018                                    # outline width
    # crown button + side button
    d.rounded_rectangle([cx - S * 0.07, cy - r - S * 0.15, cx + S * 0.07, cy - r - S * 0.06], radius=S * 0.02,
                        fill=YELLOW, outline=INK, width=int(o))
    d.rectangle([cx - S * 0.03, cy - r - S * 0.07, cx + S * 0.03, cy - r + S * 0.01], fill=YELLOW, outline=INK, width=int(o))
    ang = math.radians(-45)
    bx, by = cx + (r + S * 0.03) * math.sin(-ang), cy - (r + S * 0.03) * math.cos(ang)
    d.rounded_rectangle([bx - S * 0.045, by - S * 0.045, bx + S * 0.045, by + S * 0.045], radius=S * 0.015,
                        fill=YELLOW, outline=INK, width=int(o))
    # body ring
    d.ellipse([cx - r - S * 0.05, cy - r - S * 0.05, cx + r + S * 0.05, cy + r + S * 0.05], fill=INK)
    d.ellipse([cx - r - S * 0.035, cy - r - S * 0.035, cx + r + S * 0.035, cy + r + S * 0.035], fill=YELLOW)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK)
    # split face: left = blue (choice A), right = orange (choice B)
    rf = r - o
    d.pieslice([cx - rf, cy - rf, cx + rf, cy + rf], 90, 270, fill=BLUE)
    d.pieslice([cx - rf, cy - rf, cx + rf, cy + rf], -90, 90, fill=ORANGE)
    d.line([cx, cy - rf, cx, cy + rf], fill=INK, width=int(o * 0.8))
    # tick marks
    for k in range(12):
        a = math.radians(k * 30)
        r0, r1 = rf * (0.80 if k % 3 == 0 else 0.86), rf * 0.95
        d.line([cx + r0 * math.sin(a), cy - r0 * math.cos(a), cx + r1 * math.sin(a), cy - r1 * math.cos(a)],
               fill=(255, 255, 255), width=int(S * (0.014 if k % 3 == 0 else 0.008)))
    # hand pointing just before the top: "almost out of time"
    a = math.radians(-35)
    hx, hy = cx + rf * 0.72 * math.sin(a), cy - rf * 0.72 * math.cos(a)
    d.line([cx, cy, hx, hy], fill=INK, width=int(S * 0.034))
    d.line([cx, cy, hx, hy], fill=(255, 255, 255), width=int(S * 0.02))
    d.ellipse([cx - S * 0.035, cy - S * 0.035, cx + S * 0.035, cy + S * 0.035], fill=(255, 255, 255), outline=INK, width=int(o * 0.8))
    return img.resize((size, size), Image.LANCZOS)


def profile(path):
    stopwatch(800).convert("RGB").save(path, quality=95)


def watermark(path):
    stopwatch(150).save(path)


def text_center(d, cx, y, text, f, fill, stroke, sw):
    w = d.textlength(text, font=f)
    d.text((cx - w / 2, y), text, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke)


def banner(path, background):
    W, H = 2560, 1440
    bg = Image.open(background).convert("RGB").resize((W, H))
    # darken a soft band behind the text so it reads on any screen
    shade = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shade)
    for y in range(H):
        k = max(0.0, 1 - abs(y - H / 2) / 330)
        sd.line([(0, y), (W, y)], fill=int(170 * k))
    shade = shade.filter(ImageFilter.GaussianBlur(30))
    bg = Image.composite(Image.new("RGB", (W, H), (6, 9, 20)), bg, shade)
    d = ImageDraw.Draw(bg)
    cx = W / 2
    icon = stopwatch(215)
    title = font("impact.ttf", 160)
    tw = d.textlength("MINUTE STORIES", font=title)
    x0 = cx - (tw + 215 + 30) / 2                       # icon + gap + title, centred together
    bg.paste(icon, (int(x0), 515), icon)
    d.text((x0 + 245, 535), "MINUTE STORIES", font=title, fill=YELLOW, stroke_width=9, stroke_fill=INK)
    sub = font("ariblk.ttf", 52)
    text_center(d, cx, 752, "40 SECONDS.  ONE CHOICE.  DO YOU SURVIVE?", sub, (255, 255, 255), INK, 7)
    # the two choice pills, small, under the tagline
    pf = font("ariblk.ttf", 40)
    for label, col, x in (("A", BLUE, cx - 120), ("B", ORANGE, cx + 40)):
        d.rounded_rectangle([x, 840, x + 80, 898], radius=22, fill=col, outline=(255, 255, 255), width=5)
        text_center(d, x + 40, 841, label, pf, (255, 255, 255), INK, 4)
    bg.save(path, quality=92)


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print("usage: python clipper/pov_branding.py <out_dir> [banner_background.jpg]")
        return 2
    out = argv[0]
    os.makedirs(out, exist_ok=True)
    profile(os.path.join(out, "minutestories_profile.jpg"))
    watermark(os.path.join(out, "minutestories_watermark.png"))
    if len(argv) > 1:
        banner(os.path.join(out, "minutestories_banner.jpg"), argv[1])
    print("art written to", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
