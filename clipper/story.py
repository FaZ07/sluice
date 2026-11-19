"""Story Shorts: narrator lines (TTS) + streamer clips, Atlas-style.

    python clipper/story.py spec.json

spec.json:
{
  "campaign": "kai", "name": "kai-story-01",
  "title": "Kai Cenat Needed Money In GTA 6... So He Found This 💰 #KaiCenat #GTA6",
  "voice": "en-US-AndrewNeural",               # optional
  "header": "...",                             # optional always-on top line
  "beats": [
    {"narr": "Kai Cenat needed money in GTA 6.",          # narrator over clip start
     "file": "C:/.../w.mp4", "start": 6, "end": 25,
     "layout": "stack", "cam": "0:430:390:222", "focus": 0.65, "label": "HOOK TEXT"},
    {"narr": "So he went to work.", "file": "...", "start": 8, "end": 27, ...}
  ]
}

Why: YouTube's Oct-2026 Shorts change cuts reach for re-uploaded footage that
adds nothing of the uploader's own. A narrated story arc (our words, our
structure) is the clearest "original" signal. Narrator captions are cyan,
the streamer's words yellow, so viewers can tell who's talking.

Narration: edge-tts (Microsoft neural voices, online) with word timings.
If edge-tts is missing the build stops with a clear message - narration is
the point of this mode, so there is no silent fallback.
"""

import asyncio
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import clip     # noqa: E402
import compile  # noqa: E402

VOICE = "en-US-AndrewNeural"
DUCK = 0.18          # streamer audio level under the narrator
LEAD = 0.15          # narrator starts this many seconds into the beat


def even_words(text, dur):
    """Fallback word timings: spread words evenly over the narration."""
    ws = text.split()
    if not ws:
        return []
    step = dur / len(ws)
    return [(i * step, (i + 1) * step, w) for i, w in enumerate(ws)]


# What the voice should SAY for names it mispronounces; captions keep the
# real spelling. ("Kai Cenat" came out as "Kai Sinit".)
PRONOUNCE = {"Cenat": "Senat", "Dasgasd3m": "Dasgas Dom"}


def spoken(text):
    for k, v in PRONOUNCE.items():
        text = text.replace(k, v)
    return text


def tts(text, voice, out_mp3):
    """Synthesize `text` -> mp3; return [(start, end, word)] in seconds.

    The service (2026-11) rejects the rate= and WordBoundary options, so word
    timings come from Whisper on the narration itself (falls back to even
    spacing if Whisper is unavailable).
    """
    try:
        import edge_tts
    except ImportError:
        raise RuntimeError("story mode needs edge-tts: pip install edge-tts")

    async def go():
        com = edge_tts.Communicate(spoken(text), voice)
        with open(out_mp3, "wb") as f:
            async for ch in com.stream():
                if ch["type"] == "audio":
                    f.write(ch["data"])

    import time
    for attempt in range(5):   # the free service intermittently returns no audio
        try:
            asyncio.run(go())
            if os.path.getsize(out_mp3) > 1000:
                break
        except Exception as e:  # NoAudioReceived, transient network errors
            if attempt == 4:
                raise RuntimeError("TTS failed after 5 tries: %s" % e)
        time.sleep(2 + 3 * attempt)
    return align_script(text, clip.transcribe(out_mp3) or [], clip.probe(out_mp3)["dur"])


def align_script(text, heard, dur):
    """Our exact script words with the narrator's real timings.

    Whisper mishears names ("Kai Cenat" -> "Kaizenit"), but we know the words
    we wrote. Same word count: take Whisper's times one-to-one. Otherwise
    spread the script evenly across the span Whisper heard speech in.
    """
    script = text.split()
    if heard and len(heard) == len(script):
        return [(s, e, w) for (s, e, _), w in zip(heard, script)]
    if heard:
        t0, t1 = heard[0][0], heard[-1][1]
        return [(t0 + s, t0 + e, w) for s, e, w in even_words(text, t1 - t0)]
    return even_words(text, dur)


def narr_events(words, offset):
    """Narrator words -> one-word caption events in the 'Narr' style."""
    ev = clip.chunk_words([(s + offset, e + offset, w) for s, e, w in words], max_words=1)
    return [(s, e, t, "Narr") for s, e, t in ev]


def mix_narration(src, narr_mp3, narr_dur, out):
    """Duck the clip's audio while the narrator speaks, then mix the voice in."""
    end = LEAD + narr_dur + 0.25
    ms = int(LEAD * 1000)
    g = ("[0:a]aformat=sample_rates=48000:channel_layouts=stereo,"
         "volume=enable='between(t,0,%.2f)':volume=%.2f[a0];"
         "[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.6,"
         "adelay=%d|%d[n];"
         "[a0][n]amix=inputs=2:normalize=0:duration=first[a]" % (end, DUCK, ms, ms))
    clip.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-i", src, "-i", narr_mp3,
              "-filter_complex", g, "-map", "0:v", "-map", "[a]", "-c:v", "copy",
              "-c:a", "aac", "-b:a", "192k", out])
    return out


def validate(spec):
    probs = []
    if spec.get("campaign") not in clip.CAMPAIGNS:
        probs.append("unknown campaign %r" % spec.get("campaign"))
    beats = spec.get("beats") or []
    if not 1 <= len(beats) <= 5:
        probs.append("need 1-5 beats")
    total = 0.0
    for i, b in enumerate(beats):
        for k in ("file", "start", "end"):
            if k not in b:
                probs.append("beat %d missing %r" % (i + 1, k))
        if b.get("layout", "stack") == "stack" and "cam" not in b:
            probs.append("beat %d: stack layout needs cam" % (i + 1))
        try:
            total += float(b["end"]) - float(b["start"])
        except (KeyError, TypeError, ValueError):
            pass
    if total > 58:
        probs.append("total %.1fs > 58s" % total)
    return probs


def build(spec, out_dir=clip.OUT_DIR, transcribe=clip.transcribe, synth=tts):
    probs = validate(spec)
    if probs:
        raise ValueError("; ".join(probs))
    voice = spec.get("voice", VOICE)
    os.makedirs(out_dir, exist_ok=True)
    work = tempfile.mkdtemp(prefix="story-")
    parts = []
    try:
        for i, b in enumerate(spec["beats"]):
            d = os.path.join(work, "b%02d" % i)
            os.makedirs(d)
            src = clip.cut_local(b["file"], float(b["start"]), float(b["end"]), d)
            peak = clip.max_volume_db(src)
            if peak is None or peak < clip.SILENT_DB:
                raise ValueError("beat %d source is muted" % (i + 1))
            words = transcribe(src) or []
            words, _ = clip.censor_words(words)
            events = []
            narr_end = 0.0
            if b.get("narr"):
                mp3 = os.path.join(d, "narr.mp3")
                nw = synth(b["narr"], voice, mp3)
                ndur = clip.probe(mp3)["dur"]
                narr_end = LEAD + ndur + 0.25
                src = mix_narration(src, mp3, ndur, os.path.join(d, "mixed.mp4"))
                events += narr_events(nw, LEAD)
            # streamer captions only after the narrator finishes
            words = [w for w in words if w[0] >= narr_end]
            events += [(s, e, t, "Word") for s, e, t in clip.chunk_words(words, max_words=1)]
            events.sort(key=lambda ev: ev[0])
            part = os.path.join(work, "p%02d.mp4" % i)
            lay = b.get("layout", "stack")
            clip.render(src, part, lay, events, hook=b.get("label"),
                        hook_secs=None if b.get("label") else 3.0,
                        cam=clip.parse_cam(b["cam"]) if lay == "stack" else None,
                        focus=float(b.get("focus", 0.5)), word_mode=True, sfx=(i == 0))
            parts.append(part)
            print("  beat %d/%d ok" % (i + 1, len(spec["beats"])))
        out_mp4 = os.path.join(out_dir, spec["name"] + ".mp4")
        if len(parts) == 1:
            shutil.copy2(parts[0], out_mp4)
            info = clip.probe(out_mp4)
        else:
            info = compile.concat(parts, out_mp4, work, header=spec.get("header"))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    with open(os.path.join(out_dir, spec["name"] + ".txt"), "w", encoding="utf-8",
              newline="\n") as f:
        f.write(clip.post_caption(spec["campaign"], spec.get("title", spec["name"])))
    return out_mp4, info


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 1:
        print("usage: python clipper/story.py spec.json")
        return 2
    with open(argv[0], encoding="utf-8") as f:
        spec = json.load(f)
    out, info = build(spec)
    print("done: %s (%dx%d, %.1fs)" % (out, info["w"], info["h"], info["dur"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
