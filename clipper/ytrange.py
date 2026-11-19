"""Fetch a time range from a finished YouTube DASH (mp4) stream by byte range.

Why: ffmpeg/yt-dlp --download-sections stalls on 10+ GB single-file DASH
streams (12 h livestream VODs). Those files carry a 'sidx' index box mapping
time -> byte offsets, so we read the index, then HTTP-Range only the segments
covering [start, end]. Stdlib only.

    python ytrange.py <video_url> <audio_url> <start_s> <end_s> <out.mp4>

(urls from: yt-dlp -g -f "299+140" <watch-url>). Output is a short mp4 that
starts at the segment boundary at/before `start`; the caller trims exactly.
"""

import os
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def get_range(url, a, b):
    req = urllib.request.Request(url, headers={"Range": "bytes=%d-%d" % (a, b),
                                               "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def boxes(buf, off=0):
    """Yield (type, start, size) for top-level boxes in buf."""
    while off + 8 <= len(buf):
        size, typ = struct.unpack(">I4s", buf[off:off + 8])
        if size == 1:
            size = struct.unpack(">Q", buf[off + 8:off + 16])[0]
        if size < 8:
            break
        yield typ.decode("latin-1"), off, size
        off += size


def parse_sidx(buf, sidx_off):
    """Return (timescale, first_offset_abs, [(size, duration)])."""
    p = sidx_off + 8
    version = buf[p]
    p += 4 + 4                       # version/flags + reference_ID
    timescale = struct.unpack(">I", buf[p:p + 4])[0]
    p += 4
    if version == 0:
        _ept, first = struct.unpack(">II", buf[p:p + 8])
        p += 8
    else:
        _ept, first = struct.unpack(">QQ", buf[p:p + 16])
        p += 16
    p += 2
    count = struct.unpack(">H", buf[p:p + 2])[0]
    p += 2
    refs = []
    for _ in range(count):
        a, dur, _sap = struct.unpack(">III", buf[p:p + 12])
        refs.append((a & 0x7FFFFFFF, dur))
        p += 12
    sidx_size = struct.unpack(">I", buf[sidx_off:sidx_off + 4])[0]
    return timescale, sidx_off + sidx_size + first, refs


def plan(refs, timescale, first_abs, start, end):
    """Byte range [a, b] covering [start, end] and the time at byte a."""
    t, off = 0.0, first_abs
    a = b = None
    t_a = 0.0
    for size, dur in refs:
        seg_t0, seg_t1 = t, t + dur / timescale
        if a is None and seg_t1 > start:
            a, t_a = off, seg_t0
        if a is not None:
            b = off + size - 1
            if seg_t1 >= end:
                break
        t, off = seg_t1, off + size
    if a is None:
        raise ValueError("start beyond stream end")
    return a, b, t_a


def fetch_track(url, start, end, dst):
    head = get_range(url, 0, 256 * 1024 - 1)
    sidx = moov_end = None
    for typ, off, size in boxes(head):
        if typ == "sidx":
            sidx = off
        if typ in ("ftyp", "moov"):
            moov_end = off + size
    if sidx is None:
        raise RuntimeError("no sidx index in first 256 KB")
    if sidx + 32 > len(head) or struct.unpack(">I", head[sidx:sidx + 4])[0] + sidx > len(head):
        need = struct.unpack(">I", head[sidx:sidx + 4])[0] + sidx
        head = get_range(url, 0, need + 1024)
    ts, first_abs, refs = parse_sidx(head, sidx)
    a, b, t_a = plan(refs, ts, first_abs, start, end)
    body = get_range(url, a, b)
    with open(dst, "wb") as f:
        f.write(head[:moov_end])
        f.write(body)
    return t_a


def main(vurl, aurl, start, end, out):
    start, end = float(start), float(end)
    work = tempfile.mkdtemp(prefix="ytr-")
    try:
        tv = fetch_track(vurl, start, end, os.path.join(work, "v.mp4"))
        ta = fetch_track(aurl, start, end, os.path.join(work, "a.mp4"))
        # trim both to the exact window and mux
        subprocess.run(["ffmpeg", "-y", "-v", "error",
                        "-ss", "%.3f" % (start - tv), "-i", os.path.join(work, "v.mp4"),
                        "-ss", "%.3f" % (start - ta), "-i", os.path.join(work, "a.mp4"),
                        "-t", "%.3f" % (end - start), "-map", "0:v:0", "-map", "1:a:0",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "17",
                        "-c:a", "aac", "-b:a", "192k", out], check=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print("ok %s (%.1fs from %.1f)" % (out, end - start, start))


if __name__ == "__main__":
    main(*sys.argv[1:6])
