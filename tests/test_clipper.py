import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "clipper"))

import clip  # noqa: E402


class TestCompileSpec(unittest.TestCase):
    def test_validate_catches_bad_specs(self):
        import compile as comp
        good = {"campaign": "kai", "segments": [
            {"file": "a", "start": 0, "end": 9, "cam": "0:0:10:10", "label": "#2"},
            {"file": "b", "start": 0, "end": 9, "cam": "0:0:10:10", "label": "#1"}]}
        self.assertEqual(comp.validate(good), [])
        self.assertTrue(comp.validate({"campaign": "nope", "segments": []}))
        long = dict(good, segments=good["segments"] * 4)
        self.assertTrue(any("total" in p for p in comp.validate(long)))
        short = dict(good, segments=[dict(good["segments"][0], end=1), good["segments"][1]])
        self.assertTrue(any("min 3s" in p for p in comp.validate(short)))


class TestTimestamps(unittest.TestCase):
    def test_parse_forms(self):
        self.assertEqual(clip.parse_ts("75"), 75.0)
        self.assertEqual(clip.parse_ts("1:15"), 75.0)
        self.assertEqual(clip.parse_ts("1:02:03.5"), 3723.5)

    def test_parse_rejects_garbage(self):
        for bad in ("", "1::2", "1:2:3:4", "abc"):
            with self.assertRaises(ValueError):
                clip.parse_ts(bad)

    def test_fmt_roundtrip(self):
        self.assertEqual(clip.fmt_hms(3723.5), "1:02:03.500")
        self.assertEqual(clip.parse_ts(clip.fmt_hms(3723.5)), 3723.5)
        self.assertEqual(clip.fmt_ass_time(61.257), "0:01:01.26")

    def test_duration_checks(self):
        self.assertEqual(clip.check_duration(10, 40, 60), [])
        self.assertIn("after", clip.check_duration(40, 10, 60)[0])
        self.assertIn("under 7s", clip.check_duration(0, 5, 60)[0])
        self.assertIn("at or under 60s", clip.check_duration(0, 75, 60)[0])
        self.assertIn("18-45s", clip.check_duration(0, 10, 60)[0])
        self.assertIn("18-45s", clip.check_duration(0, 55, 60)[0])

    def test_captions_stay_above_bottom_third(self):
        for lay in ("fit", "center", "stack"):
            self.assertLess(clip.caption_y(lay), clip.H * 2 // 3)


class TestCaptions(unittest.TestCase):
    WORDS = [(0.0, 0.3, " No"), (0.3, 0.6, " way"), (0.6, 0.9, " he"),
             (0.9, 1.2, " actually"), (1.2, 1.5, " did"), (1.5, 1.8, " it."),
             (3.0, 3.3, " Bro"), (3.3, 3.6, " what")]

    def test_chunks_are_short_and_ordered(self):
        ev = clip.chunk_words(self.WORDS)
        self.assertTrue(all(len(t.split()) <= 3 for _, _, t in ev))
        self.assertTrue(all(len(t) <= 18 for _, _, t in ev))
        for (s1, e1, _), (s2, _, _) in zip(ev, ev[1:]):
            self.assertLessEqual(e1, s2)

    def test_sentence_end_and_gap_split(self):
        ev = clip.chunk_words(self.WORDS)
        texts = [t for _, _, t in ev]
        self.assertTrue(any(t.endswith("it.") for t in texts))
        self.assertEqual(texts[-1], "Bro what")   # 1.2s gap forced a new chunk

    def test_hold_through_short_pause(self):
        ev = clip.chunk_words([(0.0, 0.3, "No"), (0.3, 0.56, "way."),
                               (1.2, 1.5, "He"), (5.0, 5.2, "later")])
        self.assertEqual(ev[0][1], 1.2)            # held across the 0.64s pause
        self.assertLess(ev[1][1], 5.0)             # not across the 3.5s pause
        self.assertGreaterEqual(ev[1][1] - ev[1][0], 0.4)   # minimum show time

    def test_censor_mutes_and_stars_slurs_only(self):
        words = [(0.0, 0.3, " what"), (0.3, 0.6, " nigga"), (0.6, 0.9, " niggas,"),
                 (0.9, 1.2, " bitch"), (1.2, 1.5, " retarded"), (1.5, 1.8, " night")]
        out, mutes = clip.censor_words(words)
        self.assertEqual([w for _, _, w in out],
                         [" what", " n****", " n*****,", " bitch", " r*******", " night"])
        self.assertEqual(mutes, [])                    # default: voice untouched
        _, mutes = clip.censor_words(words, beep=True)
        self.assertEqual(len(mutes), 3)
        self.assertIn("between(t,0.25,0.65)", clip.mute_filter(mutes))
        self.assertIsNone(clip.mute_filter([]))

    def test_audio_graph_beep_and_sfx(self):
        g = clip.build_audio(30.0, [(1.0, 1.4)], sfx=True, endcard=True)
        self.assertIn("between(t,1.00,1.40)", g)
        self.assertIn("sine=frequency=1000", g)        # bleep
        self.assertIn("anoisesrc", g)                  # whoosh
        self.assertIn("adelay=27000|27000", g)         # ding at the end card
        self.assertTrue(g.endswith("amix=inputs=4:normalize=0:duration=first[aout]"))
        self.assertIsNone(clip.build_audio(30.0, [], sfx=False))

    def test_word_mode_pops_single_words(self):
        a = clip.build_ass([(0.0, 0.4, "no")], "stack", word_mode=True)
        self.assertIn(",Word,", a)
        self.assertIn("\\fscx130", a)
        self.assertIn("}NO", a)

    def test_credit_and_endcard_lines(self):
        a = clip.build_ass([], "stack", clip_secs=30.0, credit="dasgasd3m on Kick",
                           endcard="WATCH DOM LIVE: kick.com/dasgasd3m")
        self.assertIn("0:00:00.00,0:00:30.00,Credit", a)
        self.assertIn("0:00:27.00,0:00:30.00,Hook", a)
        self.assertIn("kick.com/dasgasd3m", clip.post_caption("dom", "t"))

    def test_empty_words(self):
        self.assertEqual(clip.chunk_words([]), [])
        self.assertEqual(clip.chunk_words([(0, 1, "  ")]), [])

    def test_ass_is_deterministic_and_escaped(self):
        ev = [(0.0, 1.0, "hi {there}")]
        a = clip.build_ass(ev, "fit", hook="NO WAY", hook_secs=3.0)
        b = clip.build_ass(ev, "fit", hook="NO WAY", hook_secs=3.0)
        self.assertEqual(a, b)
        self.assertIn("HI (THERE)", a)
        self.assertIn(",Hook,", a)
        self.assertIn("PlayResX: 1080", a)
        a.encode("ascii")   # ASCII-safe output for ASCII input

    def test_hook_whole_clip(self):
        a = clip.build_ass([], "fit", hook="X", hook_secs=None, clip_secs=42.0)
        self.assertIn("0:00:42.00,Hook", a)


class TestFilterAndCampaigns(unittest.TestCase):
    def test_layouts_build(self):
        for lay in ("fit", "center"):
            g = clip.build_filter(lay)
            self.assertIn("[vout]", g)
            self.assertIn("subtitles=subs.ass", g)
        g = clip.build_filter("stack", cam=(10, 20, 300, 200))
        self.assertIn("vstack", g)

    def test_focus_moves_crop_and_is_bounded(self):
        self.assertIn("(iw-1080)*0.350", clip.build_filter("center", focus=0.35))
        self.assertIn("(iw-1080)*0.500", clip.build_filter("stack", cam=(0, 0, 10, 10)))
        with self.assertRaises(ValueError):
            clip.build_filter("center", focus=1.5)

    def test_stack_keeps_phone_safe_band(self):
        g = clip.build_filter("stack", cam=(0, 0, 10, 10))
        self.assertIn("pad=1080:1920:0:%d" % clip.SAFE_TOP, g)
        self.assertGreaterEqual(clip.SAFE_TOP, 150)
        a = clip.build_ass([], "stack", hook="X", hook_secs=3.0)
        self.assertIn("\\pos(540,%d)}X" % (clip.SAFE_TOP + clip.CAM_H), a)

    def test_stack_needs_cam(self):
        with self.assertRaises(ValueError):
            clip.build_filter("stack")

    def test_parse_cam(self):
        self.assertEqual(clip.parse_cam("1500:20:400:300"), (1500, 20, 400, 300))
        for bad in ("1:2:3", "1:2:0:4", "-1:2:3:4"):
            with self.assertRaises(ValueError):
                clip.parse_cam(bad)

    def test_required_tags_present(self):
        self.assertIn("#DylanPage", clip.post_caption("dylan", "t"))
        dom = clip.post_caption("dom", "t")
        self.assertIn("#dasgasdom3", dom)
        self.assertIn("kick.com/dasgasd3m", dom)
        kr = clip.post_caption("kreek", "t")
        self.assertIn("Watch KreekCraft on YouTube and Twitch", kr)
        for tag in ("#GTA6", "#KreekCraft", "#GrandTheftAutoVI"):
            self.assertIn(tag, kr)

    def test_kreek_overlay_required(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(FileNotFoundError):
                clip.find_overlay("kreek", td)
            Path(td, "kreekcraft_overlay.png").write_bytes(b"x")
            self.assertTrue(clip.find_overlay("kreek", td).endswith(".png"))
        self.assertIsNone(clip.find_overlay("dylan"))

    def test_next_name_increments(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertEqual(clip.next_name("dom", td), "dom-001")
            Path(td, "dom-001.mp4").write_bytes(b"")
            self.assertEqual(clip.next_name("dom", td), "dom-002")


@unittest.skipUnless(clip.tool("ffmpeg") and clip.tool("ffprobe"), "ffmpeg missing")
class TestRenderReal(unittest.TestCase):
    """Real ffmpeg renders of a synthetic 16:9 stream clip."""

    @classmethod
    def setUpClass(cls):
        cls.td = tempfile.mkdtemp()
        cls.src_full = os.path.join(cls.td, "stream.mp4")
        subprocess.run([clip.tool("ffmpeg"), "-y", "-v", "error",
                        "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=10",
                        "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
                        "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
                        "-shortest", cls.src_full], check=True)
        cls.logo = os.path.join(cls.td, "logo.png")
        subprocess.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-f", "lavfi",
                        "-i", "color=c=red:size=400x150", "-frames:v", "1", cls.logo],
                       check=True)

    def _cut(self, name):
        d = os.path.join(self.td, name)
        os.makedirs(d)
        return clip.cut_local(self.src_full, 1.0, 9.0, d)

    def test_fit_with_captions_and_hook(self):
        src = self._cut("fit")
        out = os.path.join(self.td, "fit.mp4")
        info = clip.render(src, out, "fit", [(0.5, 1.5, "no way"), (2.0, 3.0, "bro")],
                           hook="HE DID IT", hook_secs=3.0)
        self.assertEqual((info["w"], info["h"]), (1080, 1920))
        self.assertAlmostEqual(info["dur"], 8.0, delta=0.3)
        self.assertTrue(info["audio"])

    def test_stack_with_logo_overlay(self):
        src = self._cut("stack")
        out = os.path.join(self.td, "stack.mp4")
        info = clip.render(src, out, "stack", [], cam=(1400, 0, 520, 300),
                           overlay=self.logo)
        self.assertEqual((info["w"], info["h"]), (1080, 1920))
        self.assertAlmostEqual(info["dur"], 8.0, delta=0.3)

    def test_beep_sfx_word_mode_render(self):
        src = self._cut("beep")
        out = os.path.join(self.td, "beep.mp4")
        info = clip.render(src, out, "stack", [(0.5, 0.9, "bro"), (1.0, 1.3, "****")],
                           cam=(1400, 0, 520, 300), focus=0.35, credit="x on Kick",
                           endcard="WATCH LIVE", mutes=[(1.0, 1.3)],
                           word_mode=True, sfx=True)
        self.assertEqual((info["w"], info["h"]), (1080, 1920))
        self.assertAlmostEqual(info["dur"], 8.0, delta=0.3)
        self.assertTrue(info["audio"])

    def test_silent_source_detected(self):
        loud = clip.max_volume_db(self.src_full)
        self.assertGreater(loud, clip.SILENT_DB)
        quiet = os.path.join(self.td, "muted.mp4")
        subprocess.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-i", self.src_full,
                        "-af", "volume=0", "-c:v", "copy", quiet], check=True)
        self.assertLess(clip.max_volume_db(quiet), clip.SILENT_DB)

    def test_compilation_two_segments(self):
        import compile as comp
        spec = {"campaign": "kai", "name": "t-comp", "title": "t", "header": "Top 2 test",
                "segments": [
                    {"file": self.src_full, "start": 0, "end": 4, "cam": "1400:0:520:300",
                     "focus": 0.35, "label": "#2 FIRST"},
                    {"file": self.src_full, "start": 5, "end": 9, "cam": "1400:0:520:300",
                     "label": "#1 SECOND"}]}
        out, info = comp.build(spec, out_dir=self.td, transcribe=lambda p: [])
        self.assertEqual((info["w"], info["h"]), (1080, 1920))
        self.assertAlmostEqual(info["dur"], 8.0, delta=0.4)
        self.assertTrue(info["audio"])
        self.assertTrue(os.path.exists(os.path.join(self.td, "t-comp.txt")))

    def test_thumbnail_stack_and_center(self):
        import thumb
        out = os.path.join(self.td, "th.jpg")
        _, t = thumb.make(self.src_full, out, "HE GOT BUSTED", layout="stack",
                          cam=(1400, 0, 520, 300), focus=0.35)
        from PIL import Image
        im = Image.open(out)
        self.assertEqual(im.size, (1080, 1920))
        self.assertLess(os.path.getsize(out), 2_000_000)
        self.assertGreaterEqual(t, 0.0)
        out2 = os.path.join(self.td, "th2.jpg")
        thumb.make(self.src_full, out2, "A VERY LONG HOOK THAT MUST WRAP", t=2.0,
                   layout="center", focus=0.4)
        self.assertEqual(Image.open(out2).size, (1080, 1920))

    def test_center_no_subs(self):
        src = self._cut("center")
        out = os.path.join(self.td, "center.mp4")
        info = clip.render(src, out, "center", [])
        self.assertEqual((info["w"], info["h"]), (1080, 1920))


if __name__ == "__main__":
    unittest.main()
