"""Countdown compilation Shorts ("TOP 5 ... MOMENTS") from several source clips.

    python clipper/compile.py spec.json

spec.json:
{
  "campaign": "kai",
  "name": "kai-top5-a",                       # output basename in clipper/out
  "title": "Kai Cenat's TOP 5 GTA 6 moments (Day 1) #KaiCenat #GTA6",
  "segments": [                               # played in this order (#5 first)
    {"file": "C:/.../clip.mp4", "start": 3.0, "end": 12.0,
     "cam": "0:715:430:255", "focus": 0.5, "label": "#5 HE MET LUCIA"},
    ...
  ]
}

Each segment goes through clip.render (stack layout, one-word captions, slur
bleep, whoosh on the cut, label shown for the whole segment), then segments are
joined with a uniform re-encode. Every source must have real audio (muted
Twitch clips are refused). Stdlib + ffmpeg only.
"""

import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import clip  # noqa: E402

MAX_TOTAL = 60.0


def validate(spec):
    """Return a list of problems with a compilation spec (empty == ok)."""
    probs = []
    if spec.get("campaign") not in clip.CAMPAIGNS:
        probs.append("unknown campaign %r" % spec.get("campaign"))
    segs = spec.get("segments") or []
    if not 2 <= len(segs) <= 8:
        probs.append("need 2-8 segments, got %d" % len(segs))
    total = 0.0
    for i, s in enumerate(segs):
        lay = s.get("layout", "stack")
        if lay not in ("stack", "center", "fit"):
            probs.append("segment %d: bad layout %r" % (i + 1, lay))
        need = ("file", "start", "end", "label") + (("cam",) if lay == "stack" else ())
        for k in need:
            if k not in s:
                probs.append("segment %d missing %r" % (i + 1, k))
        try:
            d = float(s["end"]) - float(s["start"])
        except (KeyError, TypeError, ValueError):
            continue
        if d < 3:
            probs.append("segment %d is %.1fs (min 3s)" % (i + 1, d))
        total += d
        if lay == "stack":
            try:
                clip.parse_cam(s.get("cam", ""))
            except ValueError as e:
                probs.append("segment %d: %s" % (i + 1, e))
    if total > MAX_TOTAL:
        probs.append("total %.1fs > %ds Shorts sweet spot" % (total, MAX_TOTAL))
    return probs


def header_ass(text, secs):
    """ASS with one always-on header line at the very top of the frame."""
    base = clip.build_ass([], "stack", clip_secs=secs)
    line = "Dialogue: 4,%s,%s,Credit,,0,0,0,,{\\pos(%d,%d)}%s" % (
        clip.fmt_ass_time(0), clip.fmt_ass_time(secs), clip.W // 2, 44,
        clip.ass_escape(text).upper())
    return base + line + "\n"


def concat(parts, out_path, work, header=None):
    lst = os.path.join(work, "parts.txt")
    with open(lst, "w", encoding="utf-8", newline="\n") as f:
        for p in parts:
            f.write("file '%s'\n" % p.replace("\\", "/").replace("'", "'\\''"))
    vf = []
    if header:
        total = sum(clip.probe(p)["dur"] for p in parts)
        with open(os.path.join(work, "header.ass"), "w", encoding="utf-8", newline="\n") as f:
            f.write(header_ass(header, total))
        vf = ["-vf", "subtitles=header.ass"]
    clip.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-f", "concat", "-safe", "0",
              "-i", lst] + vf + ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
              "-r", str(clip.FPS), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
              "-ar", "48000", "-ac", "2", "-map_metadata", "-1", "-fflags", "+bitexact",
              "-movflags", "+faststart", os.path.abspath(out_path)], cwd=work)
    return clip.probe(out_path)


def build(spec, out_dir=clip.OUT_DIR, transcribe=clip.transcribe):
    probs = validate(spec)
    if probs:
        raise ValueError("; ".join(probs))
    os.makedirs(out_dir, exist_ok=True)
    work = tempfile.mkdtemp(prefix="comp-")
    parts = []
    try:
        for i, s in enumerate(spec["segments"]):
            seg_dir = os.path.join(work, "s%02d" % i)
            os.makedirs(seg_dir)
            src = clip.cut_local(s["file"], float(s["start"]), float(s["end"]), seg_dir)
            peak = clip.max_volume_db(src)
            if peak is None or peak < clip.SILENT_DB:
                raise ValueError("segment %d source is muted (%s)" % (i + 1, s["file"]))
            words = transcribe(src) or []
            words, mutes = clip.censor_words(words)
            events = clip.chunk_words(words, max_words=1)
            part = os.path.join(work, "p%02d.mp4" % i)
            lay = s.get("layout", "stack")
            cam = clip.parse_cam(s["cam"]) if lay == "stack" else None
            clip.render(src, part, lay, events, hook=s["label"], hook_secs=None,
                        cam=cam, focus=float(s.get("focus", 0.5)),
                        mutes=mutes, word_mode=True, sfx=True)
            parts.append(part)
            print("  segment %d/%d ok (%s)" % (i + 1, len(spec["segments"]), s["label"]))
        out_mp4 = os.path.join(out_dir, spec["name"] + ".mp4")
        info = concat(parts, out_mp4, work, header=spec.get("header"))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    with open(os.path.join(out_dir, spec["name"] + ".txt"), "w", encoding="utf-8",
              newline="\n") as f:
        f.write(clip.post_caption(spec["campaign"], spec.get("title", spec["name"])))
    return out_mp4, info


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 1:
        print("usage: python clipper/compile.py spec.json")
        return 2
    with open(argv[0], encoding="utf-8") as f:
        spec = json.load(f)
    out, info = build(spec)
    print("done: %s (%dx%d, %.1fs)" % (out, info["w"], info["h"], info["dur"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
