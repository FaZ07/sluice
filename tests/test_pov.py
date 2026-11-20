import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "clipper"))

import clip  # noqa: E402
import pov   # noqa: E402

EP01 = Path(__file__).parent.parent / "clipper" / "pov" / "episodes" / "ep01.json"


def small_spec(name):
    return {
        "name": name, "duration": 16.0, "fps": 30, "title": "t", "description": "d", "tags": "a, b",
        "voices": {"narr": "v1", "shout": "v2"},
        "hud": {"place": "X", "clock": [[0, "3:12 AM"]], "alert": "A", "countdown": 12},
        "hooks": [], "choice": {"t0": 12.0, "q": "Q?", "a": "A", "b": "B", "foot": "F"},
        "lines": [{"t": 0.5, "who": "narr", "text": "one two three"},
                  {"t": 5.0, "who": "shout", "text": "GO NOW"}],
        "sfx": {"lightning": [1.0, 9.0], "surge": 2.0, "bangs": [3.0], "underwater": [6.0, 8.0],
                "punches": [8.5], "roof_break": 8.8, "rain_out": 9.0, "boat": [9.5, 12.0],
                "heli": [9.0, 12.0], "crack": 10.0},
    }


class TestPovSpec(unittest.TestCase):
    def test_episode_one_is_valid(self):
        spec = json.loads(EP01.read_text(encoding="utf-8"))
        self.assertEqual(pov.validate(spec), [])
        self.assertLessEqual(spec["duration"], 60)

    def test_validate_catches_problems(self):
        s = small_spec("x")
        s["lines"] = list(reversed(s["lines"]))
        self.assertTrue(any("order" in p for p in pov.validate(s)))
        s = small_spec("x")
        s["lines"][0]["who"] = "ghost"
        self.assertTrue(any("unknown voice" in p for p in pov.validate(s)))
        s = small_spec("x")
        s["duration"] = 90
        self.assertTrue(any("not a Short" in p for p in pov.validate(s)))
        self.assertTrue(pov.validate({}))

    def test_place_words_offsets_and_holds(self):
        s = small_spec("x")
        timed = [(s["lines"][0], [(0.0, 0.3, "one"), (0.5, 0.8, "two"), (1.0, 1.2, "three")], 1.3),
                 (s["lines"][1], [(0.0, 0.4, "GO"), (0.5, 0.9, "NOW")], 1.0)]
        w = pov.place_words(s, timed)
        self.assertEqual([x["w"] for x in w], ["one", "two", "three", "GO", "NOW"])
        self.assertAlmostEqual(w[0]["s"], 0.5)
        self.assertAlmostEqual(w[0]["e"], 1.0)          # held until "two"
        self.assertEqual(w[3]["who"], "shout")
        self.assertTrue(all(x["e"] > x["s"] for x in w))

    def test_say_makes_tts_safe_text(self):
        self.assertEqual(pov.say("3 AM in Miami."), "Three AM in Miami.")
        self.assertEqual(pov.say("GET OUT! THE SEAWALL BROKE!"), "Get out! The seawall broke!")
        self.assertEqual(pov.say("You open the door."), "You open the door.")

    def test_place_words_rejects_overlap(self):
        s = small_spec("x")
        timed = [(s["lines"][0], [(0.0, 4.6, "long")], 4.6), (s["lines"][1], [(0, 0.4, "GO")], 0.4)]
        with self.assertRaises(ValueError):
            pov.place_words(s, timed)

    def test_sfx_graph_mentions_every_event(self):
        g = pov.sfx_graph(small_spec("x"), 2)
        for lab in ("[rain]", "[th0]", "[th1]", "[surge]", "[uw]", "[hb]", "[heli]", "[boat]", "[crk]", "[sting]", "[a]"):
            self.assertIn(lab, g)
        self.assertIn("sidechaincompress", g)
        self.assertEqual(g, pov.sfx_graph(small_spec("x"), 2))      # deterministic text


@unittest.skipUnless(clip.tool("ffmpeg"), "ffmpeg not installed")
class TestPovBuildReal(unittest.TestCase):
    """Full build with a fake voice and a fake picture: real ffmpeg sound design + mux."""

    def test_build_end_to_end(self):
        name = "pov-unittest"
        out_dir = tempfile.mkdtemp(prefix="povtest-")

        def synth(text, voice, mp3):
            clip.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-f", "lavfi",
                      "-i", "sine=f=300:d=0.9", "-c:a", "libmp3lame", mp3])
            ws = text.split()
            return [(i * 0.9 / len(ws), (i + 1) * 0.9 / len(ws), w) for i, w in enumerate(ws)]

        def render(page, frames, fps, out, stills=None, query_extra=""):
            clip.run([clip.tool("ffmpeg"), "-y", "-v", "error", "-f", "lavfi",
                      "-i", "color=c=navy:s=270x480:r=%d:d=%g" % (fps, frames / fps),
                      "-c:v", "libx264", "-pix_fmt", "yuv420p", out])
            return out

        try:
            out, info = pov.build(small_spec(name), out_dir=out_dir, synth=synth, render=render,
                                  thumb=False, small=False)
            self.assertTrue(info["audio"])
            self.assertAlmostEqual(info["dur"], 16.0, delta=0.15)
            self.assertGreater(clip.max_volume_db(out), -30)
            page = json.loads((Path(pov.POV_DIR) / "build" / name / "page.json").read_text(encoding="utf-8"))
            self.assertEqual(len(page["words"]), 5)
            txt = (Path(out_dir) / (name + ".txt")).read_text(encoding="utf-8")
            self.assertIn("TAGS", txt)
        finally:
            shutil.rmtree(out_dir, ignore_errors=True)
            shutil.rmtree(Path(pov.POV_DIR) / "build" / name, ignore_errors=True)


@unittest.skipUnless(shutil.which("node"), "node not installed")
class TestPovSceneNode(unittest.TestCase):
    def test_scene_timeline_and_determinism(self):
        r = subprocess.run(["node", str(Path(pov.POV_DIR) / "check.mjs")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("checks passed", r.stdout)


if __name__ == "__main__":
    unittest.main()
