"""Stream-clip builder for Content Rewards clipping campaigns.

    python clipper/clip.py dylan --url <vod-url> --start 1:02:10 --end 1:02:45 --title "Dylan finds..."
    python clipper/clip.py dom   --file my_recording.mp4 --start 10:05 --end 10:40 --title "..." --layout stack --cam 1500:20:400:300
    python clipper/clip.py --list

YOU pick the moment (watch the stream, note start/end). The tool does the
mechanical part every campaign demands:

  1. downloads only that section (yt-dlp --download-sections), or takes a local file
  2. makes it vertical 1080x1920 (layouts: fit / center / stack)
  3. burns in English captions from a local Whisper model (optional, degrades
     to "no captions" with a warning if faster-whisper is missing)
  4. adds the campaign's required overlay (KreekCraft) and an optional hook title
  5. writes the paste-ready post caption with the campaign's required tags
  6. copies the .mp4 + .txt flat into Downloads

No AI voices, no fake reactions: the audio is the streamer's own. Every
campaign joined bans the alternative.

Stdlib only. External programs: ffmpeg/ffprobe (required), yt-dlp (only for
--url). Console output is ASCII-only (cp1252-safe).
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "out")
ASSET_DIR = os.path.join(HERE, "assets")
DOWNLOADS = os.path.join(os.path.expanduser("~"), "Downloads")

W, H = 1080, 1920
FPS = 30
WHISPER_MODEL = "small"   # cached locally; "base" is faster, worse

_FFMPEG_FALLBACK = (r"C:\Users\moham\AppData\Local\Microsoft\WinGet\Packages"
                    r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
                    r"\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe")


def tool(name):
    """Resolve ffmpeg/ffprobe/yt-dlp; None if absent."""
    found = shutil.which(name)
    if found:
        return found
    if name in ("ffmpeg", "ffprobe"):
        cand = _FFMPEG_FALLBACK.replace("ffmpeg.exe", name + ".exe")
        if os.path.exists(cand):
            return cand
    return None


# ---------------------------------------------------------------- campaigns
# Rules copied from each campaign brief on 2026-11-19. Re-read the brief if a
# clip gets rejected -- brands edit rules mid-campaign.
CAMPAIGNS = {
    "dylan": {
        "name": "$5,000 Dylan Page GTA VI Marathon",
        "rate": "$1 / 1K views, paid from 10K views (min $10), max $250/clip",
        "source": "Dylan Page's GTA 6 marathon on YouTube (from 2026-11-19): streams, VODs, clips",
        "tag_block": ["#DylanPage #GTA6 #GTA6Marathon"],
        "overlay": None,
        "max_secs": 60,
        "rules": [
            "Dylan must be the MAIN focus for the whole clip (not just the intro)",
            "Captions/subtitles in ENGLISH (auto subtitles allowed)",
            "No added watermarks or third-party branding",
            "Unique thumbnail per clip; caption must match the clip",
            "No collab posts, no AI footage/voices, no fake reactions",
        ],
    },
    "dom": {
        "name": "Dasgasd3m x RUCKUS | GTA 6",
        "rate": "$2 / 1K views, min $10 (5K views), max $150/clip; deadline 2026-12-19",
        "source": "Dom's Kick GTA 6 streams from 2026-11-18 on (kick.com/dasgasd3m)",
        "tag_block": ["Watch Dom live: kick.com/dasgasd3m",
                      "#dasgasdom3 #GTA6 #dasgasd3m"],
        "overlay": None,
        "max_secs": 60,
        "rules": [
            "Post ONLY on the GTA-6-specific channel",
            "Keep Dom's face or voice; keep setup + reaction + payoff",
            "SUBMIT THE POST LINK WITHIN 30 MINUTES OF POSTING",
            "Warn about spoilers, never reveal them in the cover",
            "Skip explicit jokes that break platform rules",
        ],
    },
    "kreek": {
        "name": "KreekCraft GTA 6 Clipping",
        "rate": "$1 / 1K views, min $3 (3K views), max $300/clip",
        "source": "KreekCraft's GTA 6 streams/replays (twitch.tv/kreekcraft, youtube.com/@Kreek)",
        "tag_block": ["Watch KreekCraft on YouTube and Twitch",
                      "#GTA6 #KreekCraft #GrandTheftAutoVI"],
        "overlay": "kreekcraft_overlay",   # any image ext in clipper/assets/
        "max_secs": 60,
        "rules": [
            "Official KreekCraft overlay visible for the WHOLE clip",
            "40%+ viewers from US/UK/CA/AU; 0.8%+ engagement; likes visible",
            "Never post near-identical clip more than 5 times",
            "Keep public 30+ days",
        ],
    },
}


# ---------------------------------------------------------------- pure helpers
def parse_ts(text):
    """'75' / '1:15' / '0:01:15.5' -> seconds (float)."""
    parts = str(text).strip().split(":")
    if not 1 <= len(parts) <= 3 or any(p == "" for p in parts):
        raise ValueError("bad timestamp: %r" % text)
    total = 0.0
    for p in parts:
        total = total * 60 + float(p)
    if total < 0:
        raise ValueError("negative timestamp: %r" % text)
    return total


def fmt_hms(sec):
    """Seconds -> 'H:MM:SS.mmm' for yt-dlp sections."""
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return "%d:%02d:%02d.%03d" % (h, m, s, ms)


def fmt_ass_time(sec):
    """Seconds -> ASS 'H:MM:SS.cc'."""
    cs = int(round(max(sec, 0) * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return "%d:%02d:%02d.%02d" % (h, m, s, cs)


def check_duration(start, end, max_secs, sweet=(18, 45)):
    """Return a list of problems (empty == fine).

    sweet: the 18-45 s band repeated across clipping guides for streamer
    moments (VIRAL_NOTES.md section 2). Outside it is a warning, not an error.
    """
    probs = []
    dur = end - start
    if dur <= 0:
        probs.append("end must be after start")
    elif dur < 7:
        probs.append("clip is %.1fs; most campaigns reject under 7s" % dur)
    elif dur > max_secs:
        probs.append("clip is %.1fs; keep it at or under %ds" % (dur, max_secs))
    elif not sweet[0] <= dur <= sweet[1]:
        probs.append("clip is %.1fs; streamer clips do best at %d-%ds"
                     % (dur, sweet[0], sweet[1]))
    return probs


def chunk_words(words, max_words=3, max_chars=18, max_gap=0.6,
                hold_gap=0.8, min_show=0.4):
    """Group (start, end, word) into short caption events.

    Short chunks (1-3 words) are the streamer-clip house style: readable at a
    glance on a phone, and they land on the spoken beat.
    """
    events, cur = [], []

    def flush():
        if cur:
            events.append((cur[0][0], cur[-1][1], " ".join(w for _, _, w in cur)))
            del cur[:]

    for s, e, w in words:
        w = w.strip()
        if not w:
            continue
        if cur:
            text_len = len(" ".join(x[2] for x in cur)) + 1 + len(w)
            if (len(cur) >= max_words or text_len > max_chars
                    or s - cur[-1][1] > max_gap):
                flush()
        cur.append((s, e, w))
        if w[-1] in ".?!":
            flush()
    flush()
    # Hold each caption through short pauses (no blank flicker between
    # chunks), give it a readable minimum, and never overlap the next one.
    fixed = []
    for i, (s, e, t) in enumerate(events):
        e = max(e, s + min_show)
        if i + 1 < len(events):
            nxt = events[i + 1][0]
            if nxt - e <= hold_gap:
                e = nxt
            e = min(e, nxt)
        fixed.append((s, max(e, s + 0.05), t))
    return fixed


def ass_escape(text):
    return (text.replace("\\", "/").replace("{", "(").replace("}", ")")
            .replace("\n", " ").strip())


def caption_y(layout):
    """Vertical position (px from top) for the spoken captions.

    Kept ABOVE the bottom third (y < 1280): the Shorts title, channel name and
    buttons cover that band on a phone (VIRAL_NOTES.md section 2).
    """
    return {"fit": 1180, "center": 1150, "stack": 1150}[layout]


def build_ass(events, layout="fit", hook=None, hook_secs=3.0, clip_secs=None):
    """Full ASS subtitle file text. Deterministic for identical input."""
    y = caption_y(layout)
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: %d" % W,
        "PlayResY: %d" % H,
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # white text, thick black outline, centred
        "Style: Cap,Arial,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,"
        "-1,0,0,0,100,100,0,0,1,7,2,5,60,60,0,1",
        # hook: black text on white box, top
        "Style: Hook,Arial,64,&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,"
        "-1,0,0,0,100,100,0,0,3,18,0,5,80,80,0,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    if hook:
        end = clip_secs if (hook_secs is None and clip_secs) else (hook_secs or 3.0)
        lines.append("Dialogue: 1,%s,%s,Hook,,0,0,0,,{\\pos(%d,%d)}%s" % (
            fmt_ass_time(0), fmt_ass_time(end), W // 2, 330, ass_escape(hook)))
    for s, e, t in events:
        lines.append("Dialogue: 0,%s,%s,Cap,,0,0,0,,{\\pos(%d,%d)}%s" % (
            fmt_ass_time(s), fmt_ass_time(e), W // 2, y, ass_escape(t).upper()))
    return "\n".join(lines) + "\n"


def parse_cam(text):
    """'x:y:w:h' (source pixels) -> tuple of ints."""
    parts = [int(p) for p in str(text).split(":")]
    if len(parts) != 4 or parts[2] <= 0 or parts[3] <= 0 or min(parts) < 0:
        raise ValueError("--cam must be x:y:w:h with positive w,h")
    return tuple(parts)


def build_filter(layout, cam=None, overlay_kind=None, subs=True):
    """ffmpeg -filter_complex graph. Input 0 = clip, input 1 = overlay image.

    overlay_kind: None, 'full' (9:16 frame-sized overlay) or 'logo' (corner).
    """
    if layout == "fit":
        g = ("[0:v]split[a][b];"
             "[a]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,"
             "boxblur=20:2,eq=brightness=-0.08[bg];"
             "[b]scale=%d:-2[fg];"
             "[bg][fg]overlay=(W-w)/2:(H-h)/2[v0]" % (W, H, W, H, W))
    elif layout == "center":
        g = "[0:v]scale=-2:%d,crop=%d:%d[v0]" % (H, W, H)
    elif layout == "stack":
        if not cam:
            raise ValueError("stack layout needs --cam x:y:w:h (facecam box)")
        x, y, cw, ch = cam
        top_h = 640
        g = ("[0:v]split[a][b];"
             "[a]crop=%d:%d:%d:%d,scale=%d:%d:force_original_aspect_ratio=increase,"
             "crop=%d:%d[cam];"
             "[b]scale=-2:%d,crop=%d:%d[game];"
             "[cam][game]vstack[v0]" % (cw, ch, x, y, W, top_h, W, top_h,
                                         H - top_h, W, H - top_h))
    else:
        raise ValueError("layout must be fit, center or stack")
    last = "v0"
    if overlay_kind == "full":
        g += ";[1:v]scale=%d:%d[ov];[%s][ov]overlay=0:0[v1]" % (W, H, last)
        last = "v1"
    elif overlay_kind == "logo":
        g += ";[1:v]scale=300:-1[ov];[%s][ov]overlay=W-w-40:40[v1]" % last
        last = "v1"
    elif overlay_kind is not None:
        raise ValueError("overlay_kind must be None, 'full' or 'logo'")
    tail = "subtitles=subs.ass," if subs else ""
    g += ";[%s]%sfps=%d,format=yuv420p[vout]" % (last, tail, FPS)
    return g


# Apply to every campaign (VIRAL_NOTES.md, top rules).
COMMON_RULES = [
    "Opens on the payoff/reaction, not the setup; hook text asks a question",
    "No GTA radio music in the clip (Content ID claims)",
    "No story spoilers or cutscenes (Rockstar takedowns)",
    "English title with streamer name + topic, e.g. 'Dylan Page GTA 6 police chase'",
    "Post in US evening hours (early morning IST)",
    "Submit the post link within 30 minutes, to ONE campaign only",
]


def post_caption(campaign, title):
    c = CAMPAIGNS[campaign]
    return "\n".join([title.strip(), ""] + c["tag_block"]) + "\n"


def next_name(campaign, out_dir=OUT_DIR):
    """<campaign>-NNN, first free index (no wall-clock in names)."""
    n = 1
    while os.path.exists(os.path.join(out_dir, "%s-%03d.mp4" % (campaign, n))):
        n += 1
    return "%s-%03d" % (campaign, n)


def find_overlay(campaign, asset_dir=ASSET_DIR):
    stem = CAMPAIGNS[campaign]["overlay"]
    if not stem:
        return None
    for ext in (".png", ".webp", ".jpg", ".jpeg"):
        p = os.path.join(asset_dir, stem + ext)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(
        "campaign %r needs its overlay image at clipper/assets/%s.png (or .webp). "
        "Download it from the campaign's Reference materials." % (campaign, stem))


# ---------------------------------------------------------------- side effects
def run(cmd, cwd=None):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        tail = "\n".join(proc.stderr.strip().splitlines()[-15:])
        raise RuntimeError("command failed: %s\n%s" % (os.path.basename(cmd[0]), tail))
    return proc.stdout


def probe(path):
    out = run([tool("ffprobe"), "-v", "error", "-show_entries",
               "stream=codec_type,width,height:format=duration", "-of", "json", path])
    data = json.loads(out)
    v = next((s for s in data["streams"] if s.get("codec_type") == "video"), {})
    return {"w": v.get("width"), "h": v.get("height"),
            "dur": float(data["format"].get("duration", 0) or 0),
            "audio": any(s.get("codec_type") == "audio" for s in data["streams"])}


def download_section(url, start, end, dest_dir):
    ytdlp = tool("yt-dlp")
    if not ytdlp:
        raise RuntimeError("yt-dlp not found; install it or use --file")
    out_tpl = os.path.join(dest_dir, "src.%(ext)s")
    run([ytdlp, "--no-playlist", "--quiet", "--no-warnings",
         "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
         "--download-sections", "*%s-%s" % (fmt_hms(start), fmt_hms(end)),
         "--force-keyframes-at-cuts", "--merge-output-format", "mp4",
         "--ffmpeg-location", os.path.dirname(tool("ffmpeg")),
         "-o", out_tpl, url])
    for f in sorted(os.listdir(dest_dir)):
        if f.startswith("src."):
            return os.path.join(dest_dir, f)
    raise RuntimeError("yt-dlp produced no file")


def cut_local(path, start, end, dest_dir):
    dst = os.path.join(dest_dir, "src.mp4")
    run([tool("ffmpeg"), "-y", "-v", "error", "-ss", "%.3f" % start, "-i", path,
         "-t", "%.3f" % (end - start), "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "18", "-c:a", "aac", "-b:a", "192k", dst])
    return dst


def transcribe(path):
    """[(start, end, word)] or None if faster-whisper is unavailable."""
    try:
        from faster_whisper import WhisperModel
    except Exception:
        return None
    model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(path, language="en", word_timestamps=True,
                                   vad_filter=True, beam_size=5, temperature=0.0)
    words = []
    for seg in segments:
        for w in (seg.words or []):
            words.append((float(w.start), float(w.end), w.word))
    return words


def render(src, out_path, layout, events, hook=None, hook_secs=3.0,
           cam=None, overlay=None):
    info = probe(src)
    work = os.path.dirname(os.path.abspath(src))
    with open(os.path.join(work, "subs.ass"), "w", encoding="utf-8", newline="\n") as f:
        f.write(build_ass(events, layout, hook, hook_secs, info["dur"]))
    kind = None
    cmd = [tool("ffmpeg"), "-y", "-v", "error", "-i", src]
    if overlay:
        o = probe(overlay)
        kind = "full" if o["w"] and o["h"] and o["h"] > o["w"] * 1.5 else "logo"
        cmd += ["-loop", "1", "-i", overlay]
    has_subs = bool(events or hook)
    cmd += ["-filter_complex", build_filter(layout, cam, kind, subs=has_subs),
            "-map", "[vout]"]
    if info["audio"]:
        cmd += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "160k"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-movflags", "+faststart", "-shortest", "-t", "%.3f" % info["dur"],
            os.path.abspath(out_path)]
    run(cmd, cwd=work)   # cwd=work so 'subtitles=subs.ass' needs no path escaping
    return probe(out_path)


# ---------------------------------------------------------------- CLI
def list_campaigns():
    for key in sorted(CAMPAIGNS):
        c = CAMPAIGNS[key]
        print("%-6s %s" % (key, c["name"]))
        print("       pay:    %s" % c["rate"])
        print("       source: %s" % c["source"])
        for r in c["rules"]:
            print("       - %s" % r)
        print()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build a vertical campaign clip.")
    ap.add_argument("campaign", nargs="?", choices=sorted(CAMPAIGNS))
    ap.add_argument("--list", action="store_true", help="show campaigns + rules")
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--url", help="stream/VOD URL (YouTube, Twitch, Kick)")
    src.add_argument("--file", help="local video file")
    ap.add_argument("--start", help="start time, e.g. 1:02:10")
    ap.add_argument("--end", help="end time, e.g. 1:02:45")
    ap.add_argument("--title", default="", help="post title (first caption line)")
    ap.add_argument("--hook", help="on-screen hook text at the top")
    ap.add_argument("--hook-secs", type=float, default=3.0,
                    help="how long the hook shows; 0 = whole clip")
    ap.add_argument("--layout", default="fit", choices=["fit", "center", "stack"])
    ap.add_argument("--cam", help="facecam box x:y:w:h in source pixels (stack layout)")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--no-downloads-copy", action="store_true")
    a = ap.parse_args(argv)

    if a.list:
        list_campaigns()
        return 0
    if not a.campaign or not (a.url or a.file) or not a.start or not a.end:
        ap.error("need: campaign, --url or --file, --start, --end")
    if not tool("ffmpeg") or not tool("ffprobe"):
        print("ERROR: ffmpeg/ffprobe not found")
        return 2

    c = CAMPAIGNS[a.campaign]
    start, end = parse_ts(a.start), parse_ts(a.end)
    probs = check_duration(start, end, c["max_secs"])
    if probs and (end <= start):
        print("ERROR: " + probs[0])
        return 2
    for p in probs:
        print("WARN: " + p)
    cam = parse_cam(a.cam) if a.cam else None
    overlay = find_overlay(a.campaign)

    os.makedirs(OUT_DIR, exist_ok=True)
    name = next_name(a.campaign)
    out_mp4 = os.path.join(OUT_DIR, name + ".mp4")
    work = tempfile.mkdtemp(prefix="clip-")
    try:
        print("[1/4] getting %s -> %s (%.1fs)" % (fmt_hms(start), fmt_hms(end), end - start))
        if a.url:
            clip = download_section(a.url, start, end, work)
        else:
            clip = cut_local(a.file, start, end, work)
        events = []
        if not a.no_captions:
            print("[2/4] transcribing (whisper %s, cpu)..." % WHISPER_MODEL)
            words = transcribe(clip)
            if words is None:
                print("WARN: faster-whisper not installed -> no captions")
            else:
                events = chunk_words(words)
                print("      %d words -> %d caption events" % (len(words), len(events)))
        else:
            print("[2/4] captions skipped")
        print("[3/4] rendering %dx%d (%s layout)..." % (W, H, a.layout))
        hook_secs = None if a.hook_secs == 0 else a.hook_secs
        info = render(clip, out_mp4, a.layout, events, a.hook, hook_secs, cam, overlay)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    title = a.title or "(write a title that matches the clip)"
    out_txt = os.path.join(OUT_DIR, name + ".txt")
    with open(out_txt, "w", encoding="utf-8", newline="\n") as f:
        f.write(post_caption(a.campaign, title))
    print("[4/4] done: %s (%dx%d, %.1fs)" % (out_mp4, info["w"], info["h"], info["dur"]))
    if not a.no_downloads_copy and os.path.isdir(DOWNLOADS):
        shutil.copy2(out_mp4, os.path.join(DOWNLOADS, name + ".mp4"))
        shutil.copy2(out_txt, os.path.join(DOWNLOADS, name + ".txt"))
        print("      copied to Downloads\\%s.mp4 + .txt" % name)
    print("CHECKLIST (%s):" % c["name"])
    for r in c["rules"] + COMMON_RULES:
        print("  [ ] " + r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
