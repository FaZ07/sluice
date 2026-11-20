// Frame-exact renderer: headless Chrome draws the page one frame at a time,
// each screenshot is piped straight into ffmpeg (no frames on disk).
//
//   node render.mjs --root DIR --page scene.html --query "ep=ep01" \
//        --frames 1350 --fps 30 --out video.mp4
//   node render.mjs ... --still 1200 --out thumb.jpg      (one frame)
//
// Zero npm dependencies: Node >= 22 ships fetch + WebSocket, Chrome speaks CDP.
// The page must expose  window.__ready (true once loaded) and
// async window.renderFrame(n)  which draws frame n deterministically.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, normalize, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "1"]);
    return acc;
  }, [])
);
const ROOT = resolve(args.root || ".");
const PAGE = args.page || "scene.html";
const QUERY = args.query || "";
const FPS = Number(args.fps || 30);
const FRAMES = Number(args.frames || 30);
const START = Number(args.start || 0);
const OUT = args.out || "out.mp4";
const STILL = args.still !== undefined ? Number(args.still) : null;
const W = Number(args.w || 1080), H = Number(args.h || 1920);
const FFMPEG = args.ffmpeg || "ffmpeg";
const CHROME = args.chrome || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find(p => existsSync(p));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };

function serve() {
  const srv = createServer(async (req, res) => {
    const p = normalize(join(ROOT, decodeURIComponent(req.url.split("?")[0])));
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try {
      const body = await readFile(p);
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv)));
}

async function waitFor(fn, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timeout waiting");
    await new Promise(r => setTimeout(r, 100));
  }
}

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  open() {
    return new Promise((res, rej) => {
      this.ws.onopen = res; this.ws.onerror = rej;
      this.ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id && this.pending.has(m.id)) {
          const { ok, bad } = this.pending.get(m.id); this.pending.delete(m.id);
          m.error ? bad(new Error(m.error.message)) : ok(m.result);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, bad) => this.pending.set(id, { ok, bad }));
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

async function main() {
  if (!CHROME) throw new Error("Chrome not found (pass --chrome PATH)");
  const srv = await serve();
  const port = srv.address().port;
  const prof = await mkdtemp(join(tmpdir(), "povchrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${prof}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    "--mute-audio", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=d3d11",
    `--window-size=${W},${H}`, "about:blank",
  ], { stdio: "ignore" });
  let ff = null;
  try {
    const dtp = join(prof, "DevToolsActivePort");
    await waitFor(async () => existsSync(dtp) && readFileSync(dtp, "utf8").split("\n")[0].trim());
    const cport = readFileSync(dtp, "utf8").split("\n")[0].trim();
    const targets = await waitFor(async () => {
      const t = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
      return t.find(x => x.type === "page") ? t : null;
    });
    const cdp = new CDP(targets.find(x => x.type === "page").webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/${PAGE}?${QUERY}` });
    await waitFor(() => cdp.eval("window.__ready === true"), 60000);
    const info = await cdp.eval("JSON.stringify(window.__info || {})");
    console.log("page ready", info);

    // --still N  (one frame -> OUT)   or   --stills 0,90,450 --out dir/f%d.jpg
    const stills = STILL !== null ? [STILL] : (args.stills ? args.stills.split(",").map(Number) : null);
    if (stills) {
      const fs = await import("node:fs/promises");
      for (const n of stills) {
        await cdp.eval(`window.renderFrame(${n})`);
        const out = OUT.replace("%d", String(n));
        const fmt = out.endsWith(".png") ? "png" : "jpeg";
        const shot = await cdp.send("Page.captureScreenshot", { format: fmt, quality: fmt === "jpeg" ? 95 : undefined,
          clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
        await fs.writeFile(out, Buffer.from(shot.data, "base64"));
        console.log("still", n, "->", out);
      }
      return;
    }

    ff = spawn(FFMPEG, ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg",
      "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
      "-r", String(FPS), "-movflags", "+faststart", OUT], { stdio: ["pipe", "inherit", "inherit"] });
    const t0 = Date.now();
    for (let n = START; n < START + FRAMES; n++) {
      await cdp.eval(`window.renderFrame(${n})`);
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92,
        clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
      const buf = Buffer.from(shot.data, "base64");
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
      if ((n - START) % 60 === 0) {
        const done = n - START + 1, el = (Date.now() - t0) / 1000;
        console.log(`frame ${done}/${FRAMES}  ${(el / done).toFixed(2)} s/frame  eta ${((FRAMES - done) * el / done / 60).toFixed(1)} min`);
      }
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on("close", c => c === 0 ? r() : j(new Error("ffmpeg exit " + c))));
    console.log("done", OUT, ((Date.now() - t0) / 1000).toFixed(0) + " s");
  } finally {
    chrome.kill();
    srv.close();
    await new Promise(r => setTimeout(r, 500));
    await rm(prof, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(e => { console.error("render failed:", e.message); process.exit(1); });
