"""POV "choose your adventure" story Shorts: code-animated 3D (three.js).

    python clipper/pov.py clipper/pov/episodes/ep01.json

Pipeline (all local, no AI video/image generation):
  1. each script line -> neural TTS voice (edge-tts) + word timings (Whisper)
  2. words -> caption track the page draws (big pop-in words)
  3. headless Chrome renders clipper/pov/scene.html frame by frame -> ffmpeg
  4. sound design is synthesized in ffmpeg (rain, thunder, surge, underwater
     heartbeat, rotor, boat motor, roof crack) and ducked under the voices
  5. outputs: <name>.mp4 (HQ), <name>_up.mp4 (<10 MB upload copy),
     <name>_thumb.jpg, <name>.txt (title/description/tags)

Deterministic by construction: the scene is a pure function of the frame
number, the sound design is pure arithmetic. (Chrome's GPU rasterizer and the
TTS service are not checked for byte-identical output.)
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import clip  # noqa: E402

POV_DIR = os.path.join(HERE, "pov")
GAP = 0.05            # a line must finish this long before the next one starts


def validate(spec):
    probs = []
    for k in ("name", "duration", "fps", "title", "lines", "voices", "hud", "choice", "sfx"):
        if k not in spec:
            probs.append("missing %r" % k)
    if probs:
        return probs
    ts = [ln["t"] for ln in spec["lines"]]
    if ts != sorted(ts):
        probs.append("lines not in time order")
    for ln in spec["lines"]:
        if ln.get("who") not in spec["voices"]:
            probs.append("line at %.2fs: unknown voice %r" % (ln["t"], ln.get("who")))
        if not 0 <= ln["t"] < spec["duration"]:
            probs.append("line at %.2fs outside the episode" % ln["t"])
    if not 15 <= spec["duration"] <= 60:
        probs.append("duration %.1fs not a Short" % spec["duration"])
    if spec["choice"].get("t0", 99) >= spec["duration"]:
        probs.append("choice card starts after the end")
    return probs


NUMBERS = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
           "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve"}


def say(text):
    """What the voice reads. The free TTS service returns no audio for some
    inputs (a leading digit like "3 AM", ALL-CAPS shouts - seen 2026-11-20), so
    digits become words and shouts become sentence case. Captions keep `text`."""
    ws = [NUMBERS.get(w, w) for w in text.split()]
    out = " ".join(ws)
    if out.upper() == out:
        out = ". ".join(p.strip().capitalize() for p in out.split(". "))
        out = "! ".join(p[:1].upper() + p[1:] for p in out.lower().split("! "))
    return out[:1].upper() + out[1:]


def cached_tts(synth, text, voice, cache):
    """TTS once per (voice, text): re-timing the script must not re-synthesize."""
    import hashlib
    key = hashlib.sha256(("%s|%s" % (voice, text)).encode("utf-8")).hexdigest()[:16]
    mp3, js = os.path.join(cache, key + ".mp3"), os.path.join(cache, key + ".json")
    if os.path.exists(mp3) and os.path.exists(js):
        with open(js, encoding="utf-8") as f:
            return [tuple(w) for w in json.load(f)], mp3
    ws = synth(text, voice, mp3)
    with open(js, "w", encoding="utf-8", newline="\n") as f:
        json.dump([list(w) for w in ws], f)
    return ws, mp3


def place_words(spec, timed):
    """timed: [(line, [(s, e, w), ...], dur)] -> caption words in episode time.

    Raises if a line runs into the next one: the script must fit the cut.
    """
    words = []
    for i, (ln, ws, dur) in enumerate(timed):
        end = ln["t"] + (ws[-1][1] if ws else dur)      # where the speech ends, not the mp3 tail
        nxt = timed[i + 1][0]["t"] if i + 1 < len(timed) else spec["duration"]
        if end > nxt - GAP:
            raise ValueError("line %d (%r) ends at %.2fs, next starts %.2fs - shorten it"
                             % (i + 1, ln["text"][:30], end, nxt))
        for j, (s, e, w) in enumerate(ws):
            s2, e2 = ln["t"] + s, ln["t"] + e
            if j + 1 < len(ws):                       # hold until the next word
                e2 = max(e2, ln["t"] + ws[j + 1][0])
            else:
                e2 = min(max(e2 + 0.25, s2 + 0.35), nxt - GAP)
            words.append({"s": round(s2, 3), "e": round(e2, 3), "w": w, "who": ln["who"]})
    return words


def level(keys):
    """[[t, v], ...] -> ffmpeg volume expression: linear ramps between keys, held at the ends."""
    keys = sorted(keys)
    expr = "%g" % keys[-1][1]
    for (t0, v0), (t1, v1) in reversed(list(zip(keys, keys[1:]))):
        expr = "if(lt(t,%g),%g+(%g)*(t-%g)/%g,%s)" % (t1, v0, v1 - v0, t0, max(1e-6, t1 - t0), expr)
    return "if(lt(t,%g),%g,%s)" % (keys[0][0], keys[0][1], expr)


def sfx_graph(spec, n_lines):
    """ffmpeg filter graph: narration inputs [1..n] + synthesized sound design.

    Input 0 is the video; inputs 1..n are the voice lines. Output label [a].
    """
    D = spec["duration"]
    sx = spec["sfx"]
    parts, mix = [], []

    def add(label, chain):
        parts.append(chain + "[%s]" % label)
        mix.append("[%s]" % label)

    def ms(t):
        return int(round(t * 1000))

    out_t = sx.get("rain_out", D)
    u0, u1 = sx.get("underwater", [D, D])
    # storm bed: rain (quiet indoors, loud on the roof, gone underwater) + low rumble
    rain_v = level(sx["rain_keys"]) if "rain_keys" in sx else         "if(between(t,%g,%g),0.02,if(lt(t,%g),0.10,0.42))" % (u0, u1, out_t)
    rum_v = level(sx["rum_keys"]) if "rum_keys" in sx else "if(between(t,%g,%g),0.15,0.45)" % (u0, u1)
    add("rain", "anoisesrc=d=%g:c=pink:r=48000:a=0.6:seed=11,highpass=f=1200,lowpass=f=6000,"
        "volume='%s':eval=frame" % (D, rain_v))
    add("rum", "anoisesrc=d=%g:c=brown:r=48000:a=0.7:seed=12,lowpass=f=260,"
        "volume='%s':eval=frame" % (D, rum_v))
    if "roar_keys" in sx:                          # hurricane wind: a roaring band that follows inside/outside
        add("roar", "anoisesrc=d=%g:c=pink:r=48000:a=1:seed=14,bandpass=f=420:w=600,tremolo=f=0.7:d=0.4,"
            "volume='%s':eval=frame" % (D, level(sx["roar_keys"])))
    if "crowd_keys" in sx:                         # murmur of a full shelter
        add("crowd", "anoisesrc=d=%g:c=pink:r=48000:a=0.8:seed=15,bandpass=f=650:w=500,tremolo=f=3.1:d=0.5,tremolo=f=0.9:d=0.4,"
            "volume='%s':eval=frame" % (D, level(sx["crowd_keys"])))
    if "eerie" in sx:                              # the eye: a low hanging tone in the silence
        a, b = sx["eerie"]
        d = ms(a)
        add("eer", "aevalsrc='0.3*sin(2*PI*110*t)+0.18*sin(2*PI*164.8*t)+0.1*sin(2*PI*220.5*t)':d=%g:s=48000,"
            "tremolo=f=0.4:d=0.5,afade=t=in:d=2,afade=t=out:st=%g:d=1.5,volume=0.35,adelay=%d|%d" % (b - a, max(0, b - a - 1.5), d, d))
    for i, gt in enumerate(sx.get("glass", [])):  # windows bursting
        d = ms(gt)
        add("gl%d" % i, "anoisesrc=d=1.6:c=white:r=48000:a=1:seed=%d,highpass=f=2800,afade=t=in:d=0.01,"
            "afade=t=out:st=0.05:d=1.5,volume=1.3,adelay=%d|%d" % (110 + i, d, d))
        add("gt%d" % i, "aevalsrc='0.25*sin(2*PI*3150*t)*exp(-6*t)+0.2*sin(2*PI*4720*t)*exp(-5*(t-0.21))*gte(t,0.21)"
            "+0.18*sin(2*PI*3900*t)*exp(-6*(t-0.47))*gte(t,0.47)':d=1.4:s=48000,adelay=%d|%d" % (d, d))
    for i, bt in enumerate(sx.get("buzz", [])):    # phone vibrating on a hand: two short pulses
        d = ms(bt)
        add("bz%d" % i, "aevalsrc='0.55*sin(2*PI*165*t)*gt(sin(2*PI*48*t),-0.2)*(lt(t,0.22)+between(t,0.34,0.56))':d=0.6:s=48000,"
            "lowpass=f=900,volume=0.9,adelay=%d|%d" % (d, d))
    for i, ct in enumerate(sx.get("creak", [])):   # floorboard / door hinge creak
        d = ms(ct)
        add("cr%d" % i, "aevalsrc='0.35*sin(2*PI*(210+90*sin(2*PI*1.3*t))*t)':d=1.4:s=48000,tremolo=f=31:d=0.85,"
            "bandpass=f=600:w=900,afade=t=in:d=0.1,afade=t=out:st=0.7:d=0.7,volume=1.1,adelay=%d|%d" % (d, d))
    for i, st in enumerate(sx.get("scare", [])):   # jump-scare hit: noise slam + sub boom
        d = ms(st)
        add("sc%d" % i, "anoisesrc=d=0.9:c=white:r=48000:a=1:seed=%d,highpass=f=1800,afade=t=in:d=0.005,"
            "afade=t=out:st=0.05:d=0.8,volume=0.9,adelay=%d|%d" % (130 + i, d, d))
        add("sb%d" % i, "aevalsrc='0.95*sin(2*PI*(48-10*t)*t)*exp(-2.2*t)':d=1.8:s=48000,volume=1.4,adelay=%d|%d" % (d, d))
    for i, ft in enumerate(sx.get("steps", [])):   # slow footsteps on a wooden floor
        d = ms(ft)
        add("fs%d" % i, "aevalsrc='0.8*sin(2*PI*62*t)*exp(-26*t)+0.3*sin(2*PI*180*t)*exp(-40*t)':d=0.3:s=48000,"
            "volume=0.55,adelay=%d|%d" % (d, d))
    for i, rt in enumerate(sx.get("radio", [])):  # radio static bursts
        d = ms(rt)
        add("rd%d" % i, "anoisesrc=d=0.45:c=white:r=48000:a=0.8:seed=%d,bandpass=f=2200:w=2400,tremolo=f=45:d=0.7,"
            "afade=t=out:st=0.2:d=0.25,volume=0.45,adelay=%d|%d" % (120 + i, d, d))
    # door surge: a rushing wall of water
    if "surge" in sx:
        add("surge", "anoisesrc=d=3:c=white:r=48000:a=0.9:seed=13,bandpass=f=700:w=900,"
            "afade=t=in:d=0.08,afade=t=out:st=0.6:d=2.3,volume=0.9,adelay=%d|%d" % (ms(sx["surge"]), ms(sx["surge"])))
    # thunder after each lightning flash
    for i, lt in enumerate(sx.get("lightning", [])):
        d = ms(lt + 0.45)
        add("th%d" % i, "anoisesrc=d=3.2:c=brown:r=48000:a=1:seed=%d,lowpass=f=180,"
            "afade=t=in:d=0.04,afade=t=out:st=0.25:d=2.9,volume=%g,adelay=%d|%d"
            % (20 + i, 1.6 if lt > out_t else 0.8, d, d))
    # thuds: banging the window, punching the roof
    for i, bt in enumerate(sx.get("bangs", []) + sx.get("punches", [])):
        d = ms(bt)
        add("bg%d" % i, "aevalsrc='0.9*sin(2*PI*70*t)*exp(-22*t)+0.25*sin(2*PI*140*t)*exp(-30*t)':d=0.35:s=48000,"
            "adelay=%d|%d" % (d, d))
    if "roof_break" in sx:
        d = ms(sx["roof_break"])
        add("rb", "anoisesrc=d=0.9:c=white:r=48000:a=0.9:seed=31,bandpass=f=1800:w=2500,"
            "afade=t=out:st=0.05:d=0.8,volume=1.0,adelay=%d|%d" % (d, d))
    # underwater: deep drone + heartbeat
    if u1 > u0:
        d, L = ms(u0), u1 - u0
        add("uw", "anoisesrc=d=%g:c=brown:r=48000:a=0.8:seed=41,lowpass=f=140,afade=t=in:d=0.2,"
            "afade=t=out:st=%g:d=0.3,volume=0.6,adelay=%d|%d" % (L, max(0, L - 0.3), d, d))
        add("hb", "aevalsrc='0.9*sin(2*PI*52*t)*exp(-16*mod(t,0.8))+0.55*sin(2*PI*48*t)*exp(-16*mod(t-0.22,0.8))*gte(mod(t,0.8),0.22)'"
            ":d=%g:s=48000,volume=0.9,adelay=%d|%d" % (L, d, d))
    # helicopter rotor chop and boat motor, fading in as they approach
    if "heli" in sx:
        a, b = sx["heli"]
        d = ms(a)
        out = ""
        if "heli_out" in sx:                       # flies away: fade out from heli_out to b
            out = ",afade=t=out:st=%g:d=%g" % (sx["heli_out"] - a, max(0.1, b - sx["heli_out"]))
        add("heli", "anoisesrc=d=%g:c=brown:r=48000:a=0.9:seed=51,lowpass=f=650,tremolo=f=11:d=0.95,"
            "afade=t=in:d=%g%s,volume=%g,adelay=%d|%d" % (b - a, sx.get("heli_fade", 4), out, sx.get("heli_vol", 0.8), d, d))
    if "boat" in sx:
        a, b = sx["boat"]
        d = ms(a)
        add("boat", "aevalsrc='0.35*sin(2*PI*92*t)+0.2*sin(2*PI*184*t)+0.1*sin(2*PI*276*t)':d=%g:s=48000,"
            "tremolo=f=24:d=0.6,lowpass=f=900,afade=t=in:d=%g,volume=%g,adelay=%d|%d"
            % (b - a, sx.get("boat_fade", 5), sx.get("boat_vol", 0.22), d, d))
    if "rev" in sx:                                # throttle open: a higher, harder motor layer
        d, L = ms(sx["rev"]), D - sx["rev"]
        add("rev", "aevalsrc='0.3*sin(2*PI*138*t)+0.22*sin(2*PI*276*t)+0.12*sin(2*PI*414*t)':d=%g:s=48000,"
            "tremolo=f=36:d=0.5,lowpass=f=1400,afade=t=in:d=1.6,afade=t=out:st=%g:d=4,volume=0.3,adelay=%d|%d"
            % (L, max(0, L - 13), d, d))
    if "collapse" in sx:                           # the house goes under: deep crunch + long rumble
        d = ms(sx["collapse"])
        add("col", "anoisesrc=d=3.5:c=brown:r=48000:a=1:seed=71,lowpass=f=220,afade=t=in:d=0.05,"
            "afade=t=out:st=0.6:d=2.9,volume=1.8,adelay=%d|%d" % (d, d))
        add("colk", "anoisesrc=d=1.2:c=white:r=48000:a=0.9:seed=72,bandpass=f=900:w=1400,tremolo=f=18:d=0.9,"
            "afade=t=out:st=0.1:d=1.1,volume=0.9,adelay=%d|%d" % (d, d))
    for i, st in enumerate(sx.get("splash", [])):
        d = ms(st)
        add("spl%d" % i, "anoisesrc=d=1.4:c=pink:r=48000:a=0.9:seed=%d,bandpass=f=1100:w=1800,afade=t=in:d=0.03,"
            "afade=t=out:st=0.15:d=1.2,volume=1.1,adelay=%d|%d" % (80 + i, d, d))
    if "zap" in sx:                                # live power line in the water: crackle + mains hum
        a, b = sx["zap"]
        d = ms(a)
        add("zap", "anoisesrc=d=%g:c=white:r=48000:a=0.8:seed=91,highpass=f=2500,tremolo=f=37:d=1,tremolo=f=6.3:d=0.8,"
            "afade=t=in:d=1.2,afade=t=out:st=%g:d=1.5,volume=0.55,adelay=%d|%d" % (b - a, max(0, b - a - 1.5), d, d))
        add("hum", "aevalsrc='0.3*sin(2*PI*60*t)+0.2*sin(2*PI*120*t)':d=%g:s=48000,afade=t=in:d=1.2,"
            "afade=t=out:st=%g:d=1.5,volume=0.5,adelay=%d|%d" % (b - a, max(0, b - a - 1.5), d, d))
    if "gust" in sx:                               # wind gust: band-limited noise swelling and fading
        a, b = sx["gust"]
        d, L = ms(a), b - a
        add("gust", "anoisesrc=d=%g:c=pink:r=48000:a=1:seed=95,bandpass=f=500:w=700,tremolo=f=1.3:d=0.5,"
            "afade=t=in:d=1.0,afade=t=out:st=%g:d=%g,volume=1.4,adelay=%d|%d" % (L, L * 0.55, L * 0.45, d, d))
    if "sirens" in sx:                             # distant two-tone siren
        a, b = sx["sirens"]
        d = ms(a)
        add("sir", "aevalsrc='0.25*sin(2*PI*(740+180*gte(mod(t,1.4),0.7))*t)':d=%g:s=48000,lowpass=f=1800,"
            "afade=t=in:d=3,volume=0.35,adelay=%d|%d" % (b - a, d, d))
    if "crack" in sx:
        d = ms(sx["crack"])
        add("crk", "anoisesrc=d=1.6:c=white:r=48000:a=0.8:seed=61,highpass=f=1400,tremolo=f=28:d=1,"
            "afade=t=out:st=0.2:d=1.3,volume=0.7,adelay=%d|%d" % (d, d))
    # choice card: two-note sting
    c0 = spec["choice"]["t0"]
    d = ms(c0)
    if spec["choice"].get("win"):                  # survived: rising three-note major chime
        add("sting", "aevalsrc='0.45*sin(2*PI*523*t)*exp(-4*t)+0.45*sin(2*PI*659*t)*exp(-4*(t-0.13))*gte(t,0.13)"
            "+0.5*sin(2*PI*784*t)*exp(-3*(t-0.26))*gte(t,0.26)':d=1.6:s=48000,adelay=%d|%d" % (d, d))
    else:
        add("sting", "aevalsrc='0.5*sin(2*PI*660*t)*exp(-5*t)+0.5*sin(2*PI*990*t)*exp(-5*(t-0.14))*gte(t,0.14)':d=1.2:s=48000,"
            "adelay=%d|%d" % (d, d))

    voices = []
    for i in range(n_lines):
        voices.append("[v%d]" % i)
    g = ";".join(parts)
    g += ";" + "".join(mix) + "amix=inputs=%d:normalize=0:duration=longest,apad=whole_dur=%g,atrim=0:%g[sfx]" % (len(mix), D, D)
    if n_lines:
        g += ";" + "".join(voices) + "amix=inputs=%d:normalize=0:duration=longest,apad=whole_dur=%g,atrim=0:%g,asplit=2[nk][nm]" % (n_lines, D, D)
        g += ";[sfx][nk]sidechaincompress=threshold=0.04:ratio=5:attack=15:release=350[sd]"
        g += ";[sd][nm]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"
    else:
        g += ";[sfx]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"
    return g


def voice_inputs(timed):
    """-i args + per-line delay chains for the narration inputs (inputs 1..n)."""
    args, chains = [], []
    for i, (ln, mp3, _dur) in enumerate(timed):
        args += ["-i", mp3]
        d = int(round(ln["t"] * 1000))
        vol = 1.15 if ln["who"] != "narr" else 1.0
        chains.append("[%d:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=%g,adelay=%d|%d[v%d]"
                      % (i + 1, vol, d, d, i))
    return args, chains


def node_render(page_name, frames, fps, out, stills=None, query_extra=""):
    cmd = ["node", os.path.join(POV_DIR, "render.mjs"), "--root", POV_DIR, "--page", "scene.html",
           "--query", "ep=%s%s" % (page_name, query_extra), "--fps", str(fps), "--out", out]
    cmd += ["--stills", ",".join(map(str, stills))] if stills else ["--frames", str(frames)]
    subprocess.run(cmd, check=True)
    return out


def upload_copy(src, dst, target_mb=9.4):
    """2-pass x264 so the browser upload tool (<10 MB) can take it."""
    dur = clip.probe(src)["dur"]
    vb = int(target_mb * 8 * 1024 * 1024 / dur - 160000)
    work = tempfile.mkdtemp(prefix="povup-")
    try:
        log = os.path.join(work, "p")
        clip.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-i", src, "-c:v", "libx264", "-preset", "slow",
                  "-b:v", str(vb), "-pass", "1", "-passlogfile", log, "-an", "-f", "null", os.devnull])
        clip.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-i", src, "-c:v", "libx264", "-preset", "slow",
                  "-b:v", str(vb), "-pass", "2", "-passlogfile", log, "-c:a", "aac", "-b:a", "128k",
                  "-map_metadata", "-1", "-movflags", "+faststart", dst])
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return dst


def build(spec, out_dir=clip.OUT_DIR, synth=None, render=node_render, thumb=True, small=True, dry=False):
    probs = validate(spec)
    if probs:
        raise ValueError("; ".join(probs))
    if synth is None:
        import story
        synth = story.tts
    name, D, fps = spec["name"], float(spec["duration"]), int(spec["fps"])
    os.makedirs(out_dir, exist_ok=True)
    page_dir = os.path.join(POV_DIR, "build", name)
    os.makedirs(page_dir, exist_ok=True)
    work = tempfile.mkdtemp(prefix="pov-")
    try:
        # 1. voices
        timed_words, timed_mp3 = [], []
        cache = os.path.join(page_dir, "tts")
        os.makedirs(cache, exist_ok=True)
        for i, ln in enumerate(spec["lines"]):
            ws, mp3 = cached_tts(synth, say(ln["text"]), spec["voices"][ln["who"]], cache)
            orig = ln["text"].split()
            if len(ws) == len(orig):                  # captions show the script as written
                ws = [(s0, e0, w) for (s0, e0, _), w in zip(ws, orig)]
            dur = clip.probe(mp3)["dur"]
            timed_words.append((ln, ws, dur))
            timed_mp3.append((ln, mp3, dur))
            nxt = spec["lines"][i + 1]["t"] if i + 1 < len(spec["lines"]) else spec["duration"]
            print("  line %2d  %5.2fs  speech %.2fs  ends %5.2f  next %5.2f  %s" % (
                i + 1, ln["t"], ws[-1][1] if ws else dur, ln["t"] + (ws[-1][1] if ws else dur), nxt, ln["text"]))
        words = place_words(spec, timed_words)
        if dry:
            return None, None
        # 2. page data
        page = dict(spec, words=words)
        with open(os.path.join(page_dir, "page.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(page, f, ensure_ascii=False, indent=1, sort_keys=True)
        # 3. picture
        vid = os.path.join(work, "video.mp4")
        render(name, int(round(D * fps)), fps, vid)
        # 4. sound + mux
        args, chains = voice_inputs(timed_mp3)
        g = ";".join(chains + [sfx_graph(spec, len(timed_mp3))]) if chains else sfx_graph(spec, 0)
        out = os.path.join(out_dir, name + ".mp4")
        clip.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-i", vid] + args +
                 ["-filter_complex", g, "-map", "0:v", "-map", "[a]", "-c:v", "copy",
                  "-c:a", "aac", "-b:a", "192k", "-t", "%g" % D, "-map_metadata", "-1",
                  "-fflags", "+bitexact", "-movflags", "+faststart", out])
        info = clip.probe(out)
        if small:
            upload_copy(out, os.path.join(out_dir, name + "_up.mp4"))
        if thumb:
            t = spec.get("thumb", {})
            q = "&thumb=" + t.get("text", "WOULD YOU<br>SURVIVE?").replace(" ", "%20").replace("<br>", "%3Cbr%3E")
            render(name, 1, fps, os.path.join(out_dir, name + "_thumb.jpg"),
                   stills=[int(t.get("frame", round((D - 6.5) * fps)))], query_extra=q)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    with open(os.path.join(out_dir, name + ".txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("TITLE\n%s\n\nDESCRIPTION\n%s\n\nTAGS\n%s\n" % (spec["title"], spec.get("description", ""),
                                                          spec.get("tags", "")))
    return out, info


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    dry = "--dry" in argv
    argv = [a for a in argv if a != "--dry"]
    if len(argv) != 1:
        print("usage: python clipper/pov.py episode.json [--dry]   (--dry: voices + timing only)")
        return 2
    with open(argv[0], encoding="utf-8") as f:
        spec = json.load(f)
    out, info = build(spec, dry=dry)
    if dry:
        print("dry run: script fits")
        return 0
    print("done: %s (%dx%d, %.1fs)" % (out, info["w"], info["h"], info["dur"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
