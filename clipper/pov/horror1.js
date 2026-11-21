// Horror series, episode 1: "Don't Turn Around".
// 3:33 AM, your bedroom, a text from your own number. The thing behind you is never shown directly:
// only its reflection in the dead phone screen and its shadow thrown on the wall by lightning.
// Pure function of t (no Math.random, no clock), like the flood series.
import * as THREE from "./vendor/three.module.min.js";
import { buildArms as baseArms, mulberry32, clamp, lerp, ease, V, toon, box, placeArm } from "./flood.js";

export const MSGS = [[1.2, "are you awake?"], [5.4, "don't turn around."], [20.2, "i can see you."], [21.6, "i'm closer now."],
  [27.2, "turn around and say hi :)"], [32.4, "3"], [33.4, "2"], [34.4, "1"]];
export const TYPING = [26.0, 27.2];
export const SCREEN_OFF = [11.2, 13.9], EYES_AT = 12.2;
export const LAMP = { click: 14.6, dies: 15.7 }, CLOSET_OPEN = 17.3, DOOR_CLOSE = [29.4, 33.0];
export const SHADOW = [[36.0, 1.0], [38.4, 1.35]];          // lightning flash time, shadow size
const EYE = V(0.25, 1.12, 0.6);                              // sitting on the edge of the bed

// ---------- canvas helpers (browser only; Node checks get plain materials) ----------
const hasDoc = () => typeof document !== "undefined";
function canvasTex(w, h) {
  if (!hasDoc()) return { cv: null, g: null, tex: null };
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, g: cv.getContext("2d"), tex };
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function figurePath(g, cx, top, s) {             // tall thin silhouette, long arms; each part filled on its own
  const poly = pts => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(cx + x * s, top + y * s) : g.moveTo(cx + x * s, top + y * s)); g.closePath(); g.fill(); };
  g.beginPath(); g.ellipse(cx, top + 60 * s, 34 * s, 62 * s, 0, 0, Math.PI * 2); g.fill();
  poly([[-14, 110], [14, 110], [16, 140], [-16, 140]]);                                  // neck
  poly([[-62, 150], [62, 150], [48, 420], [-48, 420]]);                                  // torso
  poly([[-48, 410], [-8, 410], [-12, 640], [-44, 640]]);                                 // legs
  poly([[8, 410], [48, 410], [44, 640], [12, 640]]);
  poly([[-58, 152], [-74, 168], [-122, 470], [-102, 482], [-50, 200]]);                  // arms, too long
  poly([[58, 152], [74, 168], [122, 470], [102, 482], [50, 200]]);
}
function drawFigure(g, cx, top, s) { figurePath(g, cx, top, s); }

// the phone screen: a messages thread with "Me", or (screen off) a dark reflection with something behind you
export function drawPhone(g, t) {
  const W = 540, H = 1110;
  if (t >= SCREEN_OFF[0] && t < SCREEN_OFF[1]) {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, "#0d1016"); gr.addColorStop(1, "#040506");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = "#020203"; drawFigure(g, 372, 70, 0.95);           // it, over your right shoulder
    g.fillStyle = "#16191f"; g.beginPath(); g.ellipse(230, 640, 120, 145, 0, 0, Math.PI * 2); g.fill();   // your head
    g.beginPath(); g.moveTo(0, H); g.bezierCurveTo(40, 830, 420, 830, 470, H); g.fill();                   // your shoulders
    if (t >= EYES_AT) {
      const a = clamp((t - EYES_AT) / 0.25, 0, 1);
      g.save(); g.shadowColor = "rgba(255,255,255,0.9)"; g.shadowBlur = 18; g.fillStyle = `rgba(250,250,255,${a})`;
      g.beginPath(); g.ellipse(357, 122, 9, 5, -0.2, 0, Math.PI * 2); g.ellipse(390, 120, 9, 5, 0.2, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(0, 0, W, 300);              // glass sheen
    return;
  }
  g.fillStyle = "#0b0b10"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#f2f2f2"; g.font = "600 30px Arial"; g.textAlign = "left"; g.fillText("3:33", 40, 52);
  g.fillRect(450, 32, 52, 24); g.fillStyle = "#0b0b10"; g.fillRect(454, 36, 20, 16);
  g.fillStyle = "#17171e"; g.fillRect(0, 70, W, 120);
  g.fillStyle = "#3a7bff"; g.font = "500 56px Arial"; g.fillText("‹", 24, 150);
  g.fillStyle = "#5b5e6a"; g.beginPath(); g.arc(W / 2, 118, 32, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffffff"; g.font = "700 26px Arial"; g.textAlign = "center"; g.fillText("ME", W / 2, 127);
  g.font = "600 30px Arial"; g.fillText("Me", W / 2, 180);
  g.textAlign = "left";
  let y = 225;
  const shown = MSGS.filter(m => t >= m[0]);
  const keep = shown.slice(-5);
  for (const [ts, text] of keep) {
    const big = text.length <= 2;
    g.font = big ? "800 150px Arial" : "500 50px Arial";
    for (let fs = 50; !big && fs > 30 && g.measureText(text).width > 440; fs -= 2) g.font = `500 ${fs}px Arial`;
    const w = Math.min(500, g.measureText(text).width + 56), h = big ? 170 : 96;
    const pop = clamp((t - ts) / 0.15, 0, 1);
    g.globalAlpha = pop; g.fillStyle = "#26262f"; rrect(g, 30, y, w, h, 34); g.fill();
    g.fillStyle = big ? "#ff4040" : "#f2f2f2"; g.fillText(text, 58, y + (big ? 140 : 64)); g.globalAlpha = 1;
    y += h + 20;
  }
  if (t >= TYPING[0] && t < TYPING[1]) {
    g.fillStyle = "#26262f"; rrect(g, 30, y, 150, 86, 40); g.fill();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(200,200,210,${0.35 + 0.65 * Math.max(0, Math.sin(t * 7 - i * 0.9))})`;
      g.beginPath(); g.arc(70 + i * 36, y + 43, 12, 0, Math.PI * 2); g.fill();
    }
  }
  g.fillStyle = "#17171e"; g.fillRect(0, H - 110, W, 110);
  g.fillStyle = "#24242c"; rrect(g, 30, H - 88, 400, 60, 30); g.fill();
  g.fillStyle = "#6b6e7a"; g.font = "400 26px Arial"; g.fillText("Text Message", 55, H - 49);
}

// ---------- world ----------
export function buildWorld(spec) {
  const S = new THREE.Scene(), r = mulberry32(333);
  S.background = new THREE.Color(0x020306);
  S.fog = new THREE.Fog(0x020306, 3, 10);
  const hemi = new THREE.HemisphereLight(0x4a5c8c, 0x0a0c12, 0.75); S.add(hemi);
  const moon = new THREE.DirectionalLight(0x86a2dc, 1.3); moon.position.set(0.6, 2.2, 6); S.add(moon);
  const WALL = toon(0x3a3f52), CEIL = toon(0x2c2f3a), FLOOR = toon(0x3b2b21);
  // room: x [-2, 2], z [-2, 2.2], height 2.6; door in the front wall (z=-2), window in the back wall (z=2.2)
  box(4.2, 0.06, 4.4, FLOOR, 0, -0.03, 0.1, S); box(4.2, 0.06, 4.4, CEIL, 0, 2.63, 0.1, S);
  box(0.1, 2.6, 4.4, WALL, -2.05, 1.3, 0.1, S); box(0.1, 2.6, 4.4, WALL, 2.05, 1.3, 0.1, S);
  box(2.95, 2.6, 0.1, WALL, -0.575, 1.3, -2.05, S); box(0.3, 2.6, 0.1, WALL, 1.9, 1.3, -2.05, S);
  box(0.9, 0.55, 0.1, WALL, 1.3, 2.325, -2.05, S);
  for (const [w, h, x, y] of [[0.08, 2.1, 0.84, 1.05], [0.08, 2.1, 1.76, 1.05], [1.0, 0.08, 1.3, 2.09]]) box(w, h, 0.14, toon(0xb0a690), x, y, -2.0, S);
  box(1.35, 2.6, 0.1, WALL, -1.375, 1.3, 2.25, S); box(1.35, 2.6, 0.1, WALL, 1.375, 1.3, 2.25, S);
  box(1.4, 1.0, 0.1, WALL, 0, 0.5, 2.25, S); box(1.4, 0.4, 0.1, WALL, 0, 2.4, 2.25, S);
  box(0.06, 0.08, 4.4, toon(0x22252f), -1.99, 0.06, 0.1, S); box(0.06, 0.08, 4.4, toon(0x22252f), 1.99, 0.06, 0.1, S);
  // window (behind you): glass that flashes with lightning, rain running down it, curtains
  W_window: {
    box(1.4, 0.06, 0.16, toon(0x1d1f26), 0, 1.0, 2.2, S); box(1.4, 0.06, 0.16, toon(0x1d1f26), 0, 2.2, 2.2, S);
    box(0.06, 1.2, 0.16, toon(0x1d1f26), 0, 1.6, 2.2, S);
  }
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x16243a });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), glassMat); glass.position.set(0, 1.6, 2.28); glass.rotation.y = Math.PI; S.add(glass);
  for (const x of [-0.95, 0.95]) box(0.5, 1.9, 0.05, toon(0x3d2430), x, 1.55, 2.15, S);
  // bed you're sitting on, nightstand + lamp on your right
  box(1.7, 0.35, 2.0, toon(0x2b2420), 0.15, 0.2, 1.25, S, true);
  box(1.6, 0.18, 1.9, toon(0xb8b4ac), 0.15, 0.46, 1.25, S);
  box(1.66, 0.12, 1.3, toon(0x5a1f2a), 0.15, 0.6, 0.95, S);
  box(0.9, 0.14, 0.4, toon(0xc8c4bc), 0.15, 0.62, 1.95, S);
  box(1.7, 0.9, 0.08, toon(0x2b2420), 0.15, 0.75, 2.2, S, true);
  box(0.5, 0.6, 0.45, toon(0x2e2622), 1.4, 0.3, 0.45, S, true);
  const lamp = new THREE.Group(); lamp.position.set(1.4, 0.6, 0.45); S.add(lamp);
  box(0.06, 0.32, 0.06, toon(0x1c1c1c), 0, 0.16, 0, lamp);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.2, 18, 1, true), toon(0xd9c9a0, { side: THREE.DoubleSide })); shade.position.y = 0.38; lamp.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2a2620 })); bulb.position.y = 0.34; lamp.add(bulb);
  const lampLight = new THREE.PointLight(0xffc887, 0, 6, 1.5); lampLight.position.set(1.4, 1.0, 0.45); S.add(lampLight);
  // wardrobe on the left wall: doors swing open while you're not looking
  const ward = new THREE.Group(); ward.position.set(-1.72, 0, -0.7); S.add(ward);
  box(0.55, 2.1, 1.3, toon(0x2a2220), 0, 1.05, 0, ward, true);
  box(0.02, 2.0, 1.22, new THREE.MeshBasicMaterial({ color: 0x000000 }), 0.28, 1.05, 0, ward);
  const doors = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Group(); d.position.set(0.29, 0, s * 0.62); ward.add(d);
    box(0.04, 2.0, 0.6, toon(0x3a2e28), 0.02, 1.05, -s * 0.3, d, true);
    box(0.03, 0.12, 0.03, toon(0xb8a67a), 0.05, 1.05, -s * 0.55, d);
    doors.push({ d, s });
  }
  box(0.4, 0.9, 0.5, new THREE.MeshBasicMaterial({ color: 0x0c0c0e }), 0.05, 1.3, 0.1, ward);   // coats inside
  // bedroom door (ajar) and the black hallway behind it
  const door = new THREE.Group(); door.position.set(0.86, 0, -2.04); S.add(door);
  box(0.86, 2.05, 0.05, toon(0x7a6052), 0.43, 1.025, 0, door, true);
  box(0.04, 0.04, 0.1, toon(0xb8a67a), 0.78, 1.0, 0.05, door);
  box(1.0, 2.1, 2.0, new THREE.MeshBasicMaterial({ color: 0x000000 }), 1.3, 1.05, -3.1, S);
  // desk, chair with a pile of clothes (the shape every kid has stared at), posters, a rug
  box(1.1, 0.06, 0.55, toon(0x2e2622), -1.1, 0.75, -1.65, S, true);
  for (const [x, z] of [[-1.6, -1.88], [-0.6, -1.88], [-1.6, -1.42], [-0.6, -1.42]]) box(0.05, 0.75, 0.05, toon(0x1c1814), x, 0.375, z, S);
  box(0.45, 0.06, 0.45, toon(0x26201c), -0.9, 0.46, -1.1, S);
  box(0.45, 0.5, 0.06, toon(0x26201c), -0.9, 0.72, -0.9, S);
  box(0.5, 0.35, 0.4, toon(0x2a2d36), -0.92, 0.66, -1.08, S);
  box(0.3, 0.25, 0.3, toon(0x30333c), -0.95, 0.95, -0.98, S);
  box(0.4, 0.28, 0.25, toon(0x1a1d26), -1.25, 0.93, -1.72, S);                              // laptop, closed
  for (const [x, y, w, h, c] of [[-1.2, 1.7, 0.6, 0.8, 0x4a2a3a], [-0.3, 1.8, 0.45, 0.6, 0x2a3a4a]]) {
    box(w, h, 0.01, toon(c), x, y, -1.995, S);
  }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), toon(0x2a2f44)); rug.rotation.x = -Math.PI / 2; rug.position.set(0.2, 0.005, -0.6); S.add(rug);
  // its shadow, thrown on the wall in front of you by the lightning behind you
  const sh = canvasTex(512, 1024);
  if (sh.g) { sh.g.clearRect(0, 0, 512, 1024); sh.g.fillStyle = "#000"; drawFigure(sh.g, 256, 40, 1.45); sh.tex.needsUpdate = true; }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.6),
    new THREE.MeshBasicMaterial({ color: 0x000000, map: sh.tex || null, alphaMap: null, transparent: true, opacity: 0, depthWrite: false }));
  shadow.position.set(-0.35, 1.5, -1.99); S.add(shadow);
  // moonlight from the window throws two shadows on the floor in front of you: yours, and a taller one
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: sh.tex || null, transparent: true, opacity: 0.75, depthWrite: false });
  const mine = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
  mine.rotation.x = -Math.PI / 2; mine.position.set(0.3, 0.012, -0.55); mine.scale.set(0.55, 1.0, 1); S.add(mine);
  const floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), floorMat);
  floorShadow.rotation.x = -Math.PI / 2; S.add(floorShadow);
  // rain on the window
  const RN = 40, rpos = new Float32Array(RN * 6), rseed = [];
  for (let i = 0; i < RN; i++) rseed.push([r() * 1.3 - 0.65, r(), 0.15 + r() * 0.35]);
  const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
  const rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: 0x8ea6c8, transparent: true, opacity: 0.6 }));
  rain.frustumCulled = false; S.add(rain);
  return { scene: S, hemi, moon, glassMat, lampLight, bulb, doors, door, shadow, floorShadow, rain, rpos, rseed, bubbles: new THREE.Group() };
}

// ---------- POV: hands + phone ----------
export function buildArms(camera, spec = {}) {
  const arms = baseArms(camera);
  const phone = new THREE.Group(); camera.add(phone);
  box(0.074, 0.152, 0.009, new THREE.MeshToonMaterial({ color: 0x15161a }), 0, 0, 0, phone, true);
  const scr = canvasTex(540, 1110);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.14), new THREE.MeshBasicMaterial({ map: scr.tex || null, color: scr.tex ? 0xffffff : 0x223344 }));
  screen.position.z = 0.0052; phone.add(screen);
  const glow = new THREE.PointLight(0xbcd2ff, 0, 2.2, 1.6); glow.position.set(0, 0, 0.08); phone.add(glow);
  arms.phone = { g: phone, scr, glow };
  return arms;
}

// ---------- shots ----------
// phone pose: "up" (held, readable), "close" (fills the frame), "low" (lowered, glowing at the bottom), null (pocketed)
const LOOK = {
  phone: V(0.25, 0.55, -0.6), door: V(1.25, 1.05, -2.0), lamp: V(1.4, 0.8, 0.45), closet: V(-1.6, 1.1, -0.7),
  left: V(-0.1, 0.0, -1.2), wall: V(-0.3, 1.45, -2.0),
};
export const SHOTS = [
  { t0: 0.0, t1: 2.4, look: LOOK.phone, fov: 62, phone: "up", shake: 0.002 },
  { t0: 2.4, t1: 5.0, look: LOOK.phone, fov: 52, phone: "close", shake: 0.002 },
  { t0: 5.0, t1: 8.0, look: LOOK.phone, fov: 50, phone: "close", shake: 0.003 },
  { t0: 8.0, t1: 11.0, look: LOOK.door, fov: 56, phone: "low", shake: 0.004, push: 0.12 },
  { t0: 11.0, t1: 14.0, look: LOOK.phone, fov: 48, phone: "close", shake: 0.004 },
  { t0: 14.0, t1: 17.0, look: LOOK.lamp, fov: 62, phone: null, shake: 0.004, reach: true },
  { t0: 17.0, t1: 20.0, look: LOOK.closet, fov: 60, phone: "low", shake: 0.006 },
  { t0: 20.0, t1: 23.0, look: LOOK.phone, fov: 50, phone: "close", shake: 0.005 },
  { t0: 23.0, t1: 26.0, look: LOOK.left, fov: 64, phone: null, shake: 0.008 },
  { t0: 26.0, t1: 29.0, look: LOOK.phone, fov: 50, phone: "close", shake: 0.006 },
  { t0: 29.0, t1: 32.0, look: LOOK.door, fov: 54, phone: "low", shake: 0.008, push: 0.1 },
  { t0: 32.0, t1: 35.0, look: LOOK.phone, fov: 48, phone: "close", shake: 0.01 },
  { t0: 35.0, t1: 38.0, look: LOOK.wall, fov: 66, phone: "low", shake: 0.012 },
  { t0: 38.0, t1: 40.0, look: LOOK.wall, fov: 70, phone: "low", shake: 0.03 },
  { t0: 40.0, t1: 60.0, look: LOOK.wall, fov: 66, phone: "low", shake: 0.01 },
];
export const shotAt = t => SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
const PHONE_POSE = { up: [0.03, -0.11, -0.3, -0.35], close: [0.0, 0.004, -0.205, -0.04], low: [0.09, -0.27, -0.33, -1.0] };

export function flashAt(spec, t) {
  let f = 0;
  for (const lt of (spec.sfx?.lightning || [])) {
    const d = t - lt;
    if (d >= 0 && d < 0.45) f = Math.max(f, d < 0.08 ? 1 : d < 0.16 ? 0.25 : d < 0.26 ? 0.85 : 0.3 * (1 - (d - 0.26) / 0.19));
  }
  return f;
}

// ---------- per-frame ----------
export function update(W, cam, arms, t, spec) {
  const shot = shotAt(t), u = clamp((t - shot.t0) / (shot.t1 - shot.t0), 0, 1);
  const flash = flashAt(spec, t);

  // camera: sitting still, breathing, getting shakier
  const sh = shot.shake;
  const n1 = Math.sin(t * 37.1) + 0.6 * Math.sin(t * 23.7 + 1.3), n2 = Math.sin(t * 31.3 + 2.1) + 0.6 * Math.sin(t * 19.9);
  const breath = 0.006 * Math.sin(t * (t > 30 ? 3.2 : 1.7));
  const lean = (shot.push || 0) * ease(u);
  cam.position.set(EYE.x + sh * n1, EYE.y + breath + sh * n2, EYE.z - lean);
  cam.fov = shot.fov; cam.updateProjectionMatrix();
  cam.lookAt(shot.look);
  cam.rotateZ(sh * 0.6 * Math.sin(t * 13.3));

  // phone in your right hand
  const P = arms.phone, pose = PHONE_POSE[shot.phone];
  P.g.visible = !!pose;
  const screenOn = !(t >= SCREEN_OFF[0] && t < SCREEN_OFF[1]);
  if (pose) {
    P.g.position.set(pose[0], pose[1] + 0.003 * Math.sin(t * 9.1), pose[2]); P.g.rotation.set(pose[3], 0, 0.03 * Math.sin(t * 2.3));
    placeArm(arms.R, V(0.3, -0.5, 0.2), V(pose[0] + 0.02, pose[1] - 0.07, pose[2] + 0.03), 1);
  }
  arms.R.g.visible = !!pose && shot.phone !== "close";
  P.glow.intensity = pose ? (screenOn ? 1.6 : 0.1) : 0;
  if (P.scr.g) { drawPhone(P.scr.g, t); P.scr.tex.needsUpdate = true; }
  // reaching for the lamp with the other hand
  arms.L.g.visible = !!shot.reach;
  if (shot.reach) placeArm(arms.L, V(-0.25, -0.5, 0.2), V(lerp(-0.05, 0.12, ease(u * 2)), lerp(-0.35, -0.12, ease(u * 2)), -0.5), -1);

  // lamp: click on, flicker, die
  const on = t >= LAMP.click && t < LAMP.dies && (t < LAMP.click + 0.35 || Math.sin(t * 47) + Math.sin(t * 29) > 0.2);
  W.lampLight.intensity = on ? 3.2 : 0;
  W.bulb.material.color.setHex(on ? 0xffe2a8 : 0x2a2620);

  // things that move while you look away
  W.doors.forEach(({ d, s }) => { d.rotation.y = t >= CLOSET_OPEN ? s * 1.35 : 0; });
  W.door.rotation.y = -0.7 * (1 - ease((t - DOOR_CLOSE[0]) / (DOOR_CLOSE[1] - DOOR_CLOSE[0])));

  // lightning: window, room, and its shadow on the wall
  W.glassMat.color.setHex(0x16243a).lerp(new THREE.Color(0xdfe8ff), flash);
  W.hemi.intensity = 0.75 + 3.0 * flash;
  W.moon.intensity = 1.3 + 4 * flash;
  let sop = 0, ssc = 1;
  for (const [lt, s] of SHADOW) { const d = t - lt; if (d >= 0 && d < 0.45) { sop = Math.max(sop, flash); ssc = s; } }
  W.shadow.material.opacity = 0.92 * sop; W.shadow.visible = sop > 0.01;
  W.shadow.scale.set(ssc, ssc, 1); W.shadow.position.y = 1.5 + (ssc - 1) * 0.6;

  // the second shadow on the floor creeps up beside yours (only after you've seen it in the screen)
  const cu = ease((t - 23.0) / 3.2);
  W.floorShadow.visible = t > 22.9;
  W.floorShadow.position.set(lerp(-0.55, -0.15, cu), 0.014, lerp(-1.7, -1.05, cu));
  // rain on the glass
  const ra = W.rpos;
  W.rseed.forEach(([x, ph, sp], i) => {
    let y = 1.0 + ((1.2 - ((t * sp + ph) % 1) * 1.2) + 1.2) % 1.2;
    ra[i * 6] = x; ra[i * 6 + 1] = y; ra[i * 6 + 2] = 2.27; ra[i * 6 + 3] = x + 0.004; ra[i * 6 + 4] = y + 0.06; ra[i * 6 + 5] = 2.27;
  });
  W.rain.geometry.attributes.position.needsUpdate = true;

  return { L: 0, under: false, flash: flash * 0.8, shot: SHOTS.indexOf(shot) };
}
