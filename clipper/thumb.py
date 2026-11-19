"""Shorts thumbnails: big reaction face + game moment + 2-4 word hook.

    python clipper/thumb.py SRC OUT.jpg --text "HE GOT BUSTED" [--t 12.5]
        [--layout stack --cam x:y:w:h --focus 0.65 | --layout center --focus 0.4]

Frame choice: --t if given, else the loudest 0.25 s of the clip (the biggest
reaction is usually the loudest moment). Output 1080x1920 JPEG < 2 MB
(YouTube's thumbnail limit). Pillow + ffmpeg. Deterministic for same input.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import clip  # noqa: E402

W, H = 1080, 1920
FONT = r"C:\Windows\Fonts\impact.ttf"
YELLOW, BLACK = (255, 230, 0), (0, 0, 0)


def loudest_time(path, step=0.25):
    """Start time (s) of the loudest `step`-second window."""
    proc = subprocess.run(
        [clip.tool("ffmpeg"), "-v", "error", "-i", path, "-vn", "-af",
         "aresample=8000,asetnsamples=%d,astats=metadata=1:reset=1,"
         "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-" % int(8000 * step),
         "-f", "null", "-"], capture_output=True, text=True, errors="replace")
    best, t, best_t = -1e9, None, 0.0
    for line in proc.stdout.splitlines():
        m = re.search(r"pts_time:([0-9.]+)", line)
        if m:
            t = float(m.group(1))
            continue
        m = re.search(r"RMS_level=(-?[0-9.]+)", line)
        if m and t is not None:
            v = float(m.group(1))
            if v > best:
                best, best_t = v, t
    return best_t


def grab(path, t, out_png):
    clip.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-ss", "%.3f" % t, "-i", path,
              "-frames:v", "1", out_png])
    return Image.open(out_png).convert("RGB")


def cover(img, w, h, fx=0.5, fy=0.5):
    """Scale to cover w x h, then crop at relative position (fx, fy)."""
    s = max(w / img.width, h / img.height)
    img = img.resize((max(w, round(img.width * s)), max(h, round(img.height * s))),
                     Image.LANCZOS)
    x = int((img.width - w) * fx)
    y = int((img.height - h) * fy)
    return img.crop((x, y, x + w, y + h))


def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def draw_hook(img, text, cy):
    d = ImageDraw.Draw(img)
    size = 150
    while size > 70:
        font = ImageFont.truetype(FONT, size)
        lines = wrap(d, text.upper(), font, W - 90)
        if len(lines) <= 3:
            break
        size -= 10
    lh = int(size * 1.08)
    top = cy - lh * len(lines) // 2
    for i, ln in enumerate(lines):
        fill = YELLOW if i % 2 == 0 else (255, 255, 255)
        d.text((W // 2, top + i * lh), ln, font=font, fill=fill, anchor="mt",
               stroke_width=max(8, size // 14), stroke_fill=BLACK)
    return img


def sunset_bg():
    """Vice-City-style sunset (our own art, same as the ClippersFc banner).

    Deliberately no Rockstar/GTA logo: Kai's campaign bans logos of any kind
    and Dom's bans Rockstar art.
    """
    import branding
    base = branding.gradient(W, H)
    img = base.copy()
    d = ImageDraw.Draw(img)
    cx, cy, r = W // 2, 760, 330
    branding.sun(d, cx, cy, r)
    branding.stripe_cut(img, cx, cy, r, base)
    d = ImageDraw.Draw(img)
    for i in range(-14, 15):
        d.line([(cx + i * 30, 1120), (cx + i * 220, H)], fill=(255, 90, 200), width=3)
    for k in range(9):
        y = 1120 + int((k / 8) ** 1.8 * (H - 1120))
        d.line([(0, y), (W, y)], fill=(255, 90, 200), width=3)
    return img


def neon_text(img, text, cy, size, fill, glow):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(layer)
    font = ImageFont.truetype(FONT, size)
    gd.text((W // 2, cy), text, font=font, fill=glow + (255,), anchor="mm",
            stroke_width=size // 10, stroke_fill=glow + (255,))
    blur = layer.filter(ImageFilter.GaussianBlur(size // 8))
    img.paste(blur, (0, 0), blur)
    d = ImageDraw.Draw(img)
    d.text((W // 2, cy), text, font=font, fill=fill, anchor="mm",
           stroke_width=max(6, size // 18), stroke_fill=(20, 0, 40))
    return img


def face_box(img):
    """Largest frontal face (x, y, w, h) via OpenCV Haar cascade, or None.

    OpenCV is an optional accelerator: if it's missing or finds nothing, the
    caller falls back to a fixed upper-centre zoom.
    """
    try:
        import cv2
        import numpy as np
    except Exception:
        return None
    gray = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2GRAY)
    minside = max(24, min(gray.shape) // 12)
    faces = []
    for name, flip in (("haarcascade_frontalface_default.xml", False),
                       ("haarcascade_frontalface_alt2.xml", False),
                       ("haarcascade_profileface.xml", False),
                       ("haarcascade_profileface.xml", True)):
        casc = cv2.CascadeClassifier(cv2.data.haarcascades + name)
        g = cv2.flip(gray, 1) if flip else gray
        found = casc.detectMultiScale(g, scaleFactor=1.1, minNeighbors=5,
                                      minSize=(minside, minside))
        for (x, y, w, h) in found:
            if flip:
                x = gray.shape[1] - x - w
            faces.append((x, y, w, h))
        if faces:
            break
    if not faces:
        return None
    return tuple(int(v) for v in max(faces, key=lambda f: f[2] * f[3]))


def crop_on_face(img, aspect, scale=2.6):
    """Head-and-shoulders crop with the given w/h aspect, centred on the face."""
    fb = face_box(img)
    if fb is None:
        return None
    x, y, w, h = fb
    ch = min(img.height, int(h * scale))
    cw = min(img.width, int(ch * aspect))
    ch = int(cw / aspect)
    cx, cy = x + w / 2, y + h * 0.75          # face slightly above centre
    left = int(min(max(cx - cw / 2, 0), img.width - cw))
    top = int(min(max(cy - ch / 2, 0), img.height - ch))
    return img.crop((left, top, left + cw, top + ch))


def make_sunset(src, out, text, t=None, layout="stack", cam=None, focus=0.5):
    """Sunset background + framed reaction face + neon 'GTA 6' + hook."""
    if t is None:
        t = loudest_time(src)
    with tempfile.TemporaryDirectory() as td:
        frame = grab(src, t, os.path.join(td, "f.png"))
    if layout == "stack":
        x, y, cw, ch = cam
        face_src = frame.crop((x, y, x + cw, y + ch))
    else:
        face_src = cover(frame, int(frame.height * 0.75), frame.height, focus, 0.5)
    # Zoom into the face: keep the central part of the facecam, biased upward
    # (heads sit in the upper half of streamer cams). Owner: "make the face bigger".
    fw, fh = 1010, 1060
    framed = crop_on_face(face_src if layout == "stack" else frame, fw / fh)
    if framed is not None:
        face_src = framed
    else:
        zoom = 1.45
        zw, zh = face_src.width / zoom, face_src.height / zoom
        zx = (face_src.width - zw) / 2
        zy = (face_src.height - zh) * 0.3
        face_src = face_src.crop((int(zx), int(zy), int(zx + zw), int(zy + zh)))
    canvas = sunset_bg().convert("RGB")
    canvas = neon_text(canvas, "GTA 6", 250, 230, (255, 255, 255), (0, 240, 255))
    face = cover(face_src, fw, fh, 0.5, 0.35)
    fx, fy = (W - fw) // 2, 400
    d = ImageDraw.Draw(canvas)
    for k, col in ((22, (255, 60, 200)), (10, (0, 240, 255))):
        d.rounded_rectangle([fx - k, fy - k, fx + fw + k, fy + fh + k], radius=40, fill=col)
    mask = Image.new("L", (fw, fh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, fw, fh], radius=34, fill=255)
    canvas.paste(face, (fx, fy), mask)
    canvas = draw_hook(canvas, text, 1640)
    q = 92
    while True:
        canvas.save(out, "JPEG", quality=q, optimize=True)
        if os.path.getsize(out) < 1_900_000 or q <= 60:
            break
        q -= 8
    return out, t


def make(src, out, text, t=None, layout="stack", cam=None, focus=0.5):
    if t is None:
        t = loudest_time(src)
    with tempfile.TemporaryDirectory() as td:
        frame = grab(src, t, os.path.join(td, "f.png"))
    if layout == "stack":
        x, y, cw, ch = cam
        face = frame.crop((x, y, x + cw, y + ch))
        top = cover(face, W, 940, 0.5, 0.4)
        game = cover(frame, W, H - 940, focus, 0.5)
        canvas = Image.new("RGB", (W, H))
        canvas.paste(top, (0, 0))
        canvas.paste(game, (0, 940))
        hook_y = 940
    else:
        canvas = cover(frame, W, H, focus, 0.5)
        hook_y = int(H * 0.62)
    # subtle punch: slight sharpen + contrast via unsharp mask
    canvas = canvas.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    canvas = draw_hook(canvas, text, hook_y)
    q = 92
    while True:
        canvas.save(out, "JPEG", quality=q, optimize=True)
        if os.path.getsize(out) < 1_900_000 or q <= 60:
            break
        q -= 8
    return out, t


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--text", required=True)
    ap.add_argument("--t", type=float)
    ap.add_argument("--layout", default="stack", choices=["stack", "center"])
    ap.add_argument("--cam")
    ap.add_argument("--focus", type=float, default=0.5)
    ap.add_argument("--style", default="sunset", choices=["sunset", "split"])
    a = ap.parse_args(argv)
    cam = clip.parse_cam(a.cam) if a.cam else None
    if a.layout == "stack" and not cam:
        ap.error("stack needs --cam")
    fn = make_sunset if a.style == "sunset" else make
    out, t = fn(a.src, a.out, a.text, a.t, a.layout, cam, a.focus)
    print("thumb: %s (frame @ %.2fs, %d KB)" % (out, t, os.path.getsize(out) // 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
