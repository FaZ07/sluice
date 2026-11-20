// Flood series Part 2: the two endings of Part 1's choice (spec.ending = "boat" | "heli").
// Same world as Part 1, picked up at the choice: water just under the roof, crack open.
// Pure function of t like Part 1: no Math.random, no clock.
import * as THREE from "./vendor/three.module.min.js";
import { buildWorld as baseWorld, buildArms as baseArms, mulberry32, keyed, clamp, lerp, ease, V, toon, OUTLINE, box, placeArm }
  from "./flood.js";

export const WATER2 = [[0, 3.85], [12, 3.95], [40, 4.0]];
export const waterLevel2 = t => keyed(WATER2, t);
const UP = V(0, 1, 0);

// ---------- small builders ----------
function person(parent, vest, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  box(0.36, 0.8, 0.24, 0x23262e, 0, 0.4, 0, g);
  box(0.46, 0.62, 0.3, vest, 0, 1.11, 0, g, true);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), toon(0x8a5c3c)); head.position.set(0, 1.58, 0); g.add(head);
  box(0.34, 0.1, 0.34, 0xf2f2f2, 0, 1.7, 0, g);
  const arm = side => {
    const a = new THREE.Group(); a.position.set(0.28 * side, 1.36, 0); g.add(a);
    box(0.11, 0.62, 0.11, vest, 0, -0.28, 0, a); return a;
  };
  g.userData.armR = arm(1); g.userData.armL = arm(-1);
  return g;
}

function car(parent, color, x, z, ry) {
  const c = new THREE.Group();
  box(1.9, 0.6, 4.0, color, 0, 0.5, 0, c, true); box(1.6, 0.55, 2.0, color, 0, 1.05, -0.2, c, true);
  box(1.62, 0.4, 1.0, new THREE.MeshBasicMaterial({ color: 0x223040 }), 0, 1.05, 0.55, c);
  for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), toon(0x151515));
    wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.33, wz); c.add(wh);
  }
  c.position.set(x, 0, z); c.rotation.y = ry; parent.add(c);
  return c;
}

function rod(parent, a, b, r, color) {          // static cylinder from a to b
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), typeof color === "number" ? toon(color) : color);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); parent.add(m);
  return m;
}

function stretch(m, a, b) {                     // unit-height cylinder m spans a..b
  const d = b.clone().sub(a), len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
}

// ---------- boat ending: paths ----------
const curve = pts => new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, 0, z)), false, "centripetal");
export const BOAT_A = curve([[-7, -7.2], [-6.4, -4.2], [-5.2, -1.2], [-4.6, 0.9]]);       // to the roof's west edge
export const BOAT_B = curve([[-4.6, 0.9], [-5.3, 3.0], [-7.6, 4.0], [-12, 3.2], [-19, 2.2], [-24, 3.6], [-28, 4.3],
  [-32, 2.6], [-38, 0.6], [-44, 0.0], [-52, 0.2], [-62, 1.0], [-72, 1.8], [-79, 2.0]]);    // west to the highway
export const BT = { a0: 0.2, a1: 3.4, go: 9.4, full: 12.4, slow: 24.6, stop: 28.4 };
const LEN_B = BOAT_B.getLength();
const VMAX = LEN_B / ((BT.full - BT.go) / 2 + (BT.slow - BT.full) + (BT.stop - BT.slow) / 2);

export function boatDist(t) {                    // metres along BOAT_B (trapezoid speed profile)
  const { go: a, full: b, slow: c, stop: d } = BT;
  if (t <= a) return 0;
  if (t < b) return VMAX * (t - a) ** 2 / (2 * (b - a));
  const db = VMAX * (b - a) / 2;
  if (t < c) return db + VMAX * (t - b);
  const dc = db + VMAX * (c - b);
  if (t < d) return dc + VMAX * (t - c) - VMAX * (t - c) ** 2 / (2 * (d - c));
  return LEN_B;
}
export const boatSpeed = t => t <= BT.go || t >= BT.stop ? 0 : t < BT.full ? VMAX * (t - BT.go) / (BT.full - BT.go)
  : t < BT.slow ? VMAX : VMAX * (1 - (t - BT.slow) / (BT.stop - BT.slow));

export function boatPose(t) {                    // {p (y=0), yaw, v}
  let p, tan, v = 0;
  if (t < BT.a1) {
    const u = ease((t - BT.a0) / (BT.a1 - BT.a0));
    p = BOAT_A.getPointAt(u); tan = BOAT_A.getTangentAt(Math.min(u, 0.999)); v = u > 0 && u < 1 ? 2.5 : 0;
  } else if (t <= BT.go) {
    p = BOAT_A.getPointAt(1); tan = BOAT_A.getTangentAt(0.999);
  } else {
    const u = Math.min(1, boatDist(t) / LEN_B);
    p = BOAT_B.getPointAt(u); tan = BOAT_B.getTangentAt(clamp(u, 0.001, 0.999)); v = boatSpeed(t);
  }
  return { p, yaw: Math.atan2(-tan.x, -tan.z), v };
}

// hazards on the way out
export const HAZ = { car: [-24.5, 0.0, 1.25], wire: { x: -44, low: 6.0 }, sparks: [-45.5, -4.2] };
export const DECK = { x0: -91, x1: -81, top: 7.2 };

// ---------- heli ending: paths ----------
export const heliPos2 = t => V(keyed([[0, -2], [2.8, -1.0], [8.0, -1.0], [30, -9]], t),
  keyed([[0, 14.5], [2.8, 12.2], [7.8, 12.2], [11, 15.2], [30, 22]], t),
  keyed([[0, -12], [2.8, -0.4], [8.0, -0.4], [30, -12]], t));
export const cableLen = t => keyed([[2.2, 0.3], [4.4, 4.78], [8.0, 4.78], [24, 1.0]], t);
export const GUST = [11.8, 12.6, 15.0, 17.2];   // rise, hold, decay, calm
export const gust = t => t < GUST[0] || t > GUST[3] ? 0 : t < GUST[1] ? ease((t - GUST[0]) / (GUST[1] - GUST[0]))
  : t < GUST[2] ? 1 : 1 - ease((t - GUST[2]) / (GUST[3] - GUST[2]));
export const swing = t => {                      // [phiX, phiZ, yaw] of the basket
  const g = gust(t), k = t - GUST[0];
  return [-0.32 * g * Math.sin(1.7 * k + 1), 0.62 * g * Math.sin(2.1 * k), 3.4 * ease(k / 4.6) + 0.15 * g * Math.sin(3.3 * k)];
};

// ---------- world ----------
export function buildWorld(spec) {
  const W = baseWorld(spec);
  const S = W.scene;
  W.ending = spec.ending;
  for (const b of W.breakable) b.visible = false;                  // punched out in Part 1
  W.crack.children.forEach(c => { c.visible = true; });
  W.lamp.intensity = 0; W.attic.intensity = 0; W.lampBulb.material.color.setHex(0x333333);
  W.boat.rotation.order = "YXZ";

  // splash ring for the house going under
  W.splash = new THREE.Group(); S.add(W.splash);
  { const r = mulberry32(808);
    for (let i = 0; i < 56; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18 + r() * 0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.85 }));
      m.userData.s = [r() * Math.PI * 2, 2.2 + r() * 1.8, 0.8 + r() * 2.2, 4 + r() * 5]; W.splash.add(m);
    } }

  if (spec.ending === "boat") {
    // keep the escape lane clear of Part 1's random palms
    W.town.children.forEach(o => {
      if (o.userData.palm !== undefined && o.position.x < -3.5 && o.position.x > -60 && Math.abs(o.position.z - 2) < 5)
        o.position.z = o.position.z < 2 ? -5 : 9;
    });
    W.driver = person(W.boat, 0xffd400, 0.45, 0.5, 1.6);
    W.hazCar = car(S, 0xd94141, HAZ.car[0], HAZ.car[1], HAZ.car[2]);
    // power line: one pole leaning, a sagging wire across the lane, a broken end sparking in the water
    const L = 3.96;
    const p1b = V(-44, 0, -9), p1t = V(-44.4, 8.2, -6.4), p2b = V(-44, 0, 9), p2t = V(-44, 9.2, 9);
    rod(S, p1b, p1t, 0.16, 0x6b5a48); rod(S, p2b, p2t, 0.16, 0x6b5a48);
    box(0.1, 0.1, 1.6, 0x4a3d30, -44.4, 7.9, -6.4, S); box(0.1, 0.1, 1.6, 0x4a3d30, -44, 8.9, 9, S);
    const wire = new THREE.CatmullRomCurve3([p2t.clone().add(V(0, -0.3, 0)), V(-44, 7.0, 4.5), V(-44, HAZ.wire.low, 0.6),
      V(-44.2, 6.6, -3.5), p1t.clone().add(V(0, -0.3, 0))]);
    S.add(new THREE.Mesh(new THREE.TubeGeometry(wire, 40, 0.035, 5), new THREE.MeshBasicMaterial({ color: 0x0c0c0c })));
    const brk = new THREE.CatmullRomCurve3([p1t.clone().add(V(0, -0.3, 0)), V(-45.0, 5.5, -5.2), V(-45.5, L + 0.05, HAZ.sparks[1])]);
    S.add(new THREE.Mesh(new THREE.TubeGeometry(brk, 24, 0.035, 5), new THREE.MeshBasicMaterial({ color: 0x0c0c0c })));
    W.sparks = new THREE.Group(); W.sparks.position.set(HAZ.sparks[0], L, HAZ.sparks[1]); S.add(W.sparks);
    for (let i = 0; i < 26; i++) W.sparks.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe8fbff })));
    W.sparkLight = new THREE.PointLight(0x9fe8ff, 0, 18, 1.2); W.sparkLight.position.set(HAZ.sparks[0], L + 0.6, HAZ.sparks[1]); S.add(W.sparkLight);
    // the highway: elevated deck, pillars, rails, rescue vehicles with light bars
    const { x0, x1, top } = DECK, cx = (x0 + x1) / 2;
    box(x1 - x0, 1.0, 170, 0x8d8f96, cx, top - 0.5, 0, S, true);
    box(x1 - x0, 0.04, 170, 0x4a4c52, cx, top + 0.02, 0, S);
    for (let k = -7; k <= 6; k++) {
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, top - 1, 10), toon(0x7d7f86)); pl.position.set(cx, (top - 1) / 2, 12 * k + 6); S.add(pl);
    }
    box(0.25, 0.8, 170, 0xb8bac0, x1 - 0.2, top + 0.4, 0, S); box(0.25, 0.8, 170, 0xb8bac0, x0 + 0.2, top + 0.4, 0, S);
    for (const z of [-30, -10, 10, 30]) {
      box(0.15, 5, 0.15, 0x333333, x1 - 0.6, top + 2.5, z, S);
      box(0.6, 0.15, 0.4, new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), x1 - 0.6, top + 5, z, S);
    }
    const amb = new THREE.Group(); amb.position.set(-84.6, top, -3.5); S.add(amb);
    box(2.2, 2.3, 5.4, 0xf4f4f4, 0, 1.45, 0, amb, true); box(2.22, 0.3, 5.42, 0xd92b2b, 0, 1.2, 0, amb);
    const fire = new THREE.Group(); fire.position.set(-87.5, top, 9); S.add(fire);
    box(2.4, 2.6, 7.0, 0xc8201e, 0, 1.6, 0, fire, true);
    W.flashers = [];
    for (const [g, y, zs] of [[amb, 2.75, [-0.6, 0.6]], [fire, 3.0, [-0.8, 0.8]]]) {
      zs.forEach((z, i) => {
        const m = box(0.5, 0.22, 0.45, new THREE.MeshBasicMaterial({ color: i ? 0x2a6bff : 0xff2a2a }), 0, y, z, g);
        W.flashers.push({ m, on: i ? 0x6f9bff : 0xff5050, off: i ? 0x10204a : 0x4a1010, ph: i });
      });
    }
    W.flashLights = [new THREE.PointLight(0xff3030, 0, 20, 1.2), new THREE.PointLight(0x3060ff, 0, 20, 1.2)];
    W.flashLights.forEach((l, i) => { l.position.set(-82.5, top + 3, i ? -2 : 3); S.add(l); });
    W.medic = person(S, 0x2a6bff, x1 + 0.55, top, 2.6); W.medic.rotation.y = -Math.PI / 2;
    W.medic2 = person(S, 0xffd400, x1 + 1.6, top, 5.6); W.medic2.rotation.y = -Math.PI / 2;
  }

  if (spec.ending === "heli") {
    // the basket: floor, posts, rails, see-through mesh sides, bridle up to the hook
    W.basket = new THREE.Group(); S.add(W.basket); W.basket.rotation.order = "YXZ";
    const OR = 0xff8a00;
    box(1.1, 0.06, 1.1, OR, 0, 0.03, 0, W.basket, true);
    for (const [x, z] of [[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]]) {
      box(0.06, 0.9, 0.06, OR, x, 0.45, z, W.basket);
      rod(W.basket, V(x, 0.9, z), V(0, 1.8, 0), 0.012, 0x222222);
    }
    for (const [w, d, x, z] of [[1.1, 0.06, 0, -0.52], [1.1, 0.06, 0, 0.52], [0.06, 1.1, -0.52, 0], [0.06, 1.1, 0.52, 0]]) {
      box(w, 0.06, d, OR, x, 0.9, z, W.basket); box(w, 0.04, d, OR, x, 0.45, z, W.basket);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.84),
        new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      pane.position.set(x, 0.45, z); if (w < d) pane.rotation.y = Math.PI / 2; W.basket.add(pane);
    }
    box(0.14, 0.14, 0.14, 0x333333, 0, 1.8, 0, W.basket);
    W.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), toon(0x1a1a1a)); S.add(W.cable);
    // the palm the gust swings you past
    const hp = heliPos2(13.6);
    const palm = new THREE.Group(); palm.position.set(hp.x + 5.4, 0, hp.z + 0.6); S.add(palm);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 11.5, 7), toon(0x7a5b3a)); trunk.position.y = 5.75; palm.add(trunk);
    W.palmLeaves = [];
    for (let k = 0; k < 8; k++) {
      const leaf = box(3.4, 0.08, 0.65, 0x2f8f4e, 0, 11.4, 0, palm); leaf.geometry.translate(1.7, 0, 0);
      leaf.rotation.set(0, (k / 8) * Math.PI * 2, -0.35); W.palmLeaves.push(leaf);
    }
    W.palm = palm;
  }
  return W;
}

// ---------- POV arms (+ a rescuer's arm reaching in, + the heli door frame) ----------
export function buildArms(camera, spec = {}) {
  const arms = baseArms(camera);
  const sleeve = toon(spec.ending === "heli" ? 0xff6d00 : 0x2a6bff), glove = toon(0x1c1c1c);
  const g = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1, 10), sleeve);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), toon(0xf2f2f2));
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), glove); palm.scale.set(1.0, 0.65, 1.35); hand.add(palm);
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.05, 4, 6), glove);
    f.rotation.x = Math.PI / 2; f.position.set(-0.03 + k * 0.02, 0, -0.095); hand.add(f);
  }
  g.add(arm); g.add(cuff); g.add(hand); camera.add(g);
  arms.X = { g, arm, cuff, hand };
  // helicopter door frame (camera space, only in the cabin shots)
  const fr = new THREE.Group(); camera.add(fr);
  const dark = new THREE.MeshBasicMaterial({ color: 0x15171c }), trim = new THREE.MeshBasicMaterial({ color: 0x3a1214 });
  box(0.14, 0.9, 0.02, dark, -0.25, 0, -0.5, fr); box(0.6, 0.18, 0.02, dark, 0, 0.33, -0.5, fr);
  box(0.6, 0.16, 0.02, dark, 0, -0.33, -0.5, fr); box(0.05, 0.9, 0.02, dark, 0.2, 0, -0.5, fr);
  box(0.012, 0.5, 0.012, trim, -0.17, 0.0, -0.49, fr); box(0.4, 0.012, 0.012, trim, 0.0, -0.245, -0.49, fr);
  box(0.06, 0.012, 0.012, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), -0.07, 0.235, -0.49, fr);
  fr.visible = false; arms.frame = fr;
  return arms;
}

// ---------- shots ----------
// cam(u, T, C) -> [position, look, fov, shake]; arms(u, T) -> {L, R, X} in camera space (null = hidden).
const ROOF_EYE = V(-1.0, 5.7, 1.2);
const lv = (a, b, u) => a.clone().lerp(b, ease(u));
const none = () => ({ L: null, R: null });
const grip = () => ({ L: [-0.3, -0.36, -0.5], R: [0.3, -0.36, -0.5] });

export const BOAT_SHOTS = [
  { t0: 0.0, t1: 1.8, cam: (u, T, C) => [lv(ROOF_EYE, V(-1.15, 5.7, 1.1), u), C.boatAt(1.0), 58, 0.012], arms: none },
  { t0: 1.8, t1: 3.6, cam: (u, T, C) => [V(-1.0, 5.7, 1.3), C.boatAt(1.1), 68, 0.016],
    arms: (u, T) => ({ L: null, R: [0.24, -0.08 + 0.04 * Math.sin(T * 9), -0.62] }) },
  { t0: 3.6, t1: 5.4, cam: (u, T, C) => [lv(V(-1.0, 5.6, 1.1), V(-1.0, 5.45, 1.05), u), V(-0.2, 4.1, -0.7), 66,
    0.02 + 0.035 * Math.max(0, Math.sin(T * 6))], arms: () => ({ L: [-0.32, -0.4, -0.45], R: [0.32, -0.4, -0.45] }) },
  { t0: 5.4, t1: 7.2, cam: (u, T, C) => [lv(V(-1.1, 5.7, 1.0), V(-3.0, 5.65, 0.85), u).add(V(0, 0.06 * Math.abs(Math.sin(T * 9)), 0)),
    C.bw(0, 0.6, 0), 68, 0.03],
    arms: (u, T) => ({ L: [-0.3, -0.35 + 0.12 * Math.sin(T * 9), -0.5], R: [0.3, -0.35 - 0.12 * Math.sin(T * 9), -0.5] }) },
  { t0: 7.2, t1: 8.6, cam: (u, T, C) => { const p = V(-3.0, 5.65, 0.85).lerp(C.bw(0.0, 1.55, -0.5), u); p.y += 1.0 * Math.sin(Math.PI * u);
    return [p, C.bw(0, 0.4, -1.2 * u), 76, 0.01]; },
    arms: u => ({ L: [-0.25, 0.05 - 0.3 * u, -0.6], R: [0.25, 0.08 - 0.3 * u, -0.6] }) },
  { t0: 8.6, t1: 10.4, cam: (u, T, C) => [C.bw(-0.2, 1.5, -1.6), V(0.4, 3.4, 0), 64, T < 9.0 ? 0.08 : 0.02],
    arms: () => ({ L: [-0.3, -0.42, -0.45], R: null }) },
  { t0: 10.4, t1: 12.4, cam: (u, T, C) => [C.bw(0.3, 1.75, -1.0), C.bw(0, 1.0, -12), 66, 0.02], arms: grip },
  { t0: 12.4, t1: 14.2, cam: (u, T, C) => [C.bw(-1.25, 0.95, -1.6), C.bw(-1.0, 0.6, -14), 72, 0.025], arms: none },
  { t0: 14.2, t1: 16.0, cam: (u, T, C) => [C.bw(0.3, 1.75, -1.0), C.bw(0.6, 0.8, -12), 66, 0.025], arms: grip },
  { t0: 16.0, t1: 17.6, cam: (u, T, C) => [C.bw(0.3, 1.75, -0.8), C.bw(-9, 0.6, 2), 64, 0.02], arms: none },
  { t0: 17.6, t1: 19.6, cam: (u, T, C) => { const d = clamp((T - 18.6) / 0.35, 0, 1) * (1 - clamp((T - 19.45) / 0.15, 0, 1));
    return [C.bw(0.3, 1.75 - 0.75 * d, -1.0), C.bw(0, 2.6 - 1.2 * d, -12), 68, 0.02 + 0.03 * d]; },
    arms: (u, T) => T > 18.55 && T < 19.5 ? { L: [-0.16, 0.16, -0.34], R: [0.16, 0.18, -0.34] } : grip() },
  { t0: 19.6, t1: 21.4, cam: (u, T, C) => [C.bw(0.9, 1.5, -1.2), V(HAZ.sparks[0], C.L + 0.5, HAZ.sparks[1]), 62, 0.02], arms: none },
  { t0: 21.4, t1: 23.4, cam: (u, T, C) => [C.bw(0.3, 1.75, -1.0), C.bw(0, 1.0, -14), 60, 0.015], arms: grip },
  { t0: 23.4, t1: 25.6, cam: (u, T, C) => [C.bw(0.3, 1.75, -1.0), V(-84, 8.6, 1.5), 52, 0.015], arms: none },
  { t0: 25.6, t1: 27.6, cam: (u, T, C) => [C.bw(0.3, 1.75, -1.0), V(-81.6, 8.4, 2.4), 60, 0.012], arms: none },
  { t0: 27.6, t1: 29.6, cam: (u, T, C) => [C.bw(0.2, 1.7, -1.3), V(-81.2, 8.3, 2.5), 66, 0.01],
    arms: (u, T) => ({ L: null, R: [0.1, 0.12 + 0.12 * ease(u * 1.5), -0.6], X: [0.08, 0.28 - 0.14 * ease(u * 1.5), -0.62] }) },
  { t0: 29.6, t1: 31.0, cam: (u, T, C) => [lv(C.bw(0.2, 1.7, -1.3), V(-82.2, 8.95, 2.0), u), lv(V(-81.2, 8.3, 2.5), V(-20, 5, 2), u), 66, 0.015],
    arms: u => u < 0.5 ? { L: null, R: [0.1, 0.25, -0.6], X: [0.08, 0.14, -0.62] } : none() },
  { t0: 31.0, t1: 40.0, cam: (u, T, C) => [V(-82.2, 8.95, 2.0), V(-20, 5.3 + 0.4 * u, 2 - 3 * u), 70, 0.004], arms: none },
];

export const HELI_SHOTS = [
  { t0: 0.0, t1: 1.8, cam: (u, T, C) => [ROOF_EYE.clone(), C.heli.clone().add(V(0, -0.5, 0)), 62, 0.015], arms: none },
  { t0: 1.8, t1: 3.6, cam: (u, T, C) => [V(-1.0, 5.65, 1.25), lv(C.heli, C.kw(0, 0.4, 0), u), 70, 0.03],
    arms: (u, T) => ({ L: null, R: [0.22, 0.1 + 0.05 * Math.sin(T * 8), -0.6] }) },
  { t0: 3.6, t1: 5.4, cam: (u, T, C) => [V(-1.0, 5.6, 1.3), V(4 - 3 * u, 3.9, 3 + 2 * u), 68, 0.045 + 0.02 * Math.sin(T * 13)],
    arms: () => ({ L: [-0.12, 0.05, -0.32], R: [0.15, 0.08, -0.34] }) },
  { t0: 5.4, t1: 6.8, cam: (u, T, C) => [V(-1.0, 5.6, 1.15), lv(C.kw(0, 0.4, 0), V(0.2, 4.1, -0.5), u), 64,
    0.03 + 0.04 * Math.max(0, Math.sin(T * 6))], arms: () => ({ L: [-0.32, -0.4, -0.45], R: [0.32, -0.4, -0.45] }) },
  { t0: 6.8, t1: 8.2, cam: (u, T, C) => [V(-1.0, 5.6, 1.15).lerp(C.kw(0, 1.25, 0.3), ease(u)), C.kw(0, 0.5, -0.8 - u), 74, 0.04],
    arms: u => ({ L: [-0.24, -0.1 - 0.15 * u, -0.6], R: [0.24, -0.1 - 0.15 * u, -0.6] }) },
  { t0: 8.2, t1: 10.0, cam: (u, T, C) => [C.kw(0, 1.25, 0.3), V(0.6, 3.2, 0.2), 68, T < 8.6 ? 0.06 : 0.025], arms: grip },
  { t0: 10.0, t1: 11.6, cam: (u, T, C) => [C.kw(0, 1.15, 0.25), C.heli.clone().add(V(0, -0.8, 0)), 70, 0.02],
    arms: () => ({ L: [-0.14, 0.12, -0.45], R: [0.14, 0.14, -0.45] }) },
  { t0: 11.6, t1: 13.2, cam: (u, T, C) => [C.kw(0, 1.25, 0.3), C.kw(0.4, 1.0, -6), 72, 0.03 + 0.04 * gust(T)], arms: grip },
  { t0: 13.2, t1: 14.8, cam: (u, T, C) => [C.kw(0, 1.25, 0.3), C.palmTop.clone().add(V(0, -0.8, 0)), 70, 0.05 * gust(T) + 0.02], arms: grip },
  { t0: 14.8, t1: 16.6, cam: (u, T, C) => [C.kw(0, 1.25, 0.3), C.kw(0.3, -2.5, -6), 70, 0.02 + 0.03 * gust(T)],
    arms: () => ({ L: [-0.3, -0.3, -0.5], R: [0.3, -0.3, -0.5] }) },
  { t0: 16.6, t1: 19.0, cam: (u, T, C) => [C.kw(0, 1.3, 0.3), V(25 - 15 * u, 2, -38), 68, 0.01], arms: none },
  { t0: 19.0, t1: 21.0, cam: (u, T, C) => [C.kw(0, 1.3, 0.3), V(-30, 26, -90), 64, 0.012], arms: none },
  { t0: 21.0, t1: 22.8, cam: (u, T, C) => [C.kw(0, 1.2, 0.3), C.heli.clone().add(V(0.6, -1.2, 0)), 70, 0.015],
    arms: u => ({ L: null, R: [0.1, 0.12 + 0.12 * ease(u * 1.4), -0.6], X: [0.08, 0.3 - 0.15 * ease(u * 1.4), -0.62] }) },
  { t0: 22.8, t1: 25.0, cabin: true, cam: (u, T, C) => [C.cabin, V(16, 2 + 4 * u, -44), 66, 0.012],
    arms: () => ({ L: [-0.12, -0.24, -0.4], R: null }) },
  { t0: 25.0, t1: 27.0, cabin: true, cam: (u, T, C) => [C.cabin, V(10 + 8 * u, 1, -30), 66, 0.01], arms: none },
  { t0: 27.0, t1: 40.0, cabin: true, cam: (u, T, C) => [C.cabin, V(4 + 10 * u, 5, -60), 70, 0.006], arms: none },
];

export const shotsFor = ending => ending === "heli" ? HELI_SHOTS : BOAT_SHOTS;
export function shotAt2(ending, t) {
  const S = shotsFor(ending);
  for (const s of S) if (t >= s.t0 && t < s.t1) return s;
  return S[S.length - 1];
}
export const COLLAPSE = { boat: [3.8, 7.6, 8.9], heli: [5.4, 7.4, 8.4] };   // tilt from, tilt to, sink

// ---------- per-frame update ----------
export function update(W, cam, arms, t, spec) {
  const T = t, end = W.ending || spec.ending;
  const L = waterLevel2(T);
  const [c0, c1, cs] = COLLAPSE[end];

  // the house: leans, then goes under (away from the rescue side)
  const tilt = ease((T - c0) / (c1 - c0)), sink = ease((T - cs) / 2.2);
  W.house.position.y = -0.12 * tilt - 7.5 * sink;
  W.house.rotation.set(0.1 * sink, 0, -0.035 * tilt - 0.3 * sink);
  W.house.visible = sink < 1;
  const ks = T - cs - 0.25;                       // splash
  W.splash.visible = ks > 0 && ks < 1.6;
  if (W.splash.visible) W.splash.children.forEach(m => {
    const [a, r0, sp, vy] = m.userData.s;
    const y = L + vy * ks - 4.9 * ks * ks;
    m.position.set(Math.cos(a) * (r0 + sp * ks), Math.max(L - 0.5, y), Math.sin(a) * (r0 + sp * ks));
    m.scale.setScalar(Math.max(0.05, 1 - ks / 1.6));
  });

  const C = { L };
  // boat
  if (end === "boat") {
    const bp = boatPose(T), bob = 0.15 * Math.sin(T * 2.1) * (bp.v > 1 ? 0.5 : 1);
    const land = T > 8.55 && T < 9.3 ? -0.18 * Math.sin((T - 8.55) / 0.75 * Math.PI) : 0;
    W.boat.position.set(bp.p.x, L + bob + land, bp.p.z);
    W.boat.rotation.set(0.05 * Math.sin(T * 1.7) + 0.012 * bp.v, bp.yaw, 0.06 * Math.sin(T * 2.3) + (T > 8.55 && T < 9.3 ? 0.06 * Math.sin((T - 8.55) * 14) : 0));
    W.boat.updateMatrixWorld(true);
    C.bw = (x, y, z) => W.boat.localToWorld(V(x, y, z));
    C.boatAt = h => W.boat.position.clone().add(V(0, h, 0));
    const d = W.driver.userData;
    const wave = T > 1.0 && T < 7.6;
    d.armR.rotation.z = wave ? 2.6 + 0.45 * Math.sin(T * 8) : 0.25;
    d.armL.rotation.z = wave ? -0.4 : -0.25;
    // helicopter leaves for another roof
    const hp = V(lerp(-2, 40, ease(T / 12)), lerp(14.5, 22, ease(T / 12)) + 0.4 * Math.sin(T * 1.3), lerp(-12, -34, ease(T / 12)));
    W.heli.position.copy(hp); W.heli.lookAt(V(60, hp.y, -44)); W.heli.rotateY(Math.PI); W.heli.rotateX(-0.12);
    W.heli.visible = T < 12; W.rotor.rotation.y = T * 31.0;
    // hazards
    W.hazCar.position.y = L - 0.62 + 0.1 * Math.sin(T * 1.5);
    W.hazCar.position.x = HAZ.car[0] + 0.03 * T;
    W.hazCar.rotation.set(0.08 * Math.sin(T * 1.2), HAZ.car[2] + 0.05 * Math.sin(T * 0.4), 0.1 * Math.sin(T * 1.7));
    const zap = T > 13 && T < 27, burst = Math.floor(T * 3), ph = T * 3 - burst;
    W.sparks.visible = zap;
    W.sparks.position.y = L;
    if (zap) W.sparks.children.forEach((m, i) => {
      const r = mulberry32(burst * 131 + i);
      const a = r() * Math.PI * 2, s = 1 + r() * 2.5, vy = 2 + r() * 3;
      m.position.set(Math.cos(a) * s * ph, vy * ph - 4.9 * ph * ph, Math.sin(a) * s * ph);
      m.visible = m.position.y > -0.05;
    });
    W.sparkLight.intensity = zap && Math.sin(T * 53) + Math.sin(T * 31) > 0.4 ? 40 : 0;
    const blink = Math.floor(T * 4) % 2;
    W.flashers.forEach(f => f.m.material.color.setHex(blink === f.ph ? f.on : f.off));
    W.flashLights[0].intensity = blink === 0 ? 12 : 0; W.flashLights[1].intensity = blink === 1 ? 12 : 0;
    W.medic.userData.armR.rotation.z = T > 25 ? (T < 27.6 ? 2.6 + 0.45 * Math.sin(T * 7) : 1.2) : 0.2;
    W.medic2.userData.armR.rotation.z = T > 24 ? 2.5 + 0.4 * Math.sin(T * 6 + 1) : 0.2;
  }

  // heli + basket
  if (end === "heli") {
    const hp = heliPos2(T); hp.y += 0.3 * Math.sin(T * 1.3);
    W.heli.position.copy(hp);
    const ty = ease((T - 10) / 12);
    const dir = V(lerp(1, -0.6, ty), 0, lerp(13, -1, ty));
    W.heli.lookAt(hp.clone().add(dir)); W.heli.rotateY(Math.PI); W.heli.rotateX(-0.06);
    W.rotor.rotation.y = T * 31.0;
    W.heli.userData.cone.rotation.z = 0.15 * Math.sin(T * 0.9);
    W.heli.userData.cone.visible = T < 7.0;
    W.heli.updateMatrixWorld(true);
    const belly = W.heli.localToWorld(V(0, -1.35, 0));
    const len = cableLen(T) + 0.0;
    const [px, pz, yaw] = swing(T);
    const off = V(len * Math.sin(pz), -len * Math.cos(pz) * Math.cos(px), -len * Math.sin(px));
    const hook = belly.clone().add(off);
    W.basket.rotation.set(px * 0.9, yaw, pz * 0.9);
    W.basket.updateMatrix();
    const q = new THREE.Quaternion().setFromEuler(W.basket.rotation);
    const origin = hook.clone().sub(V(0, 1.8, 0).applyQuaternion(q));
    if (T < cs) origin.y = Math.max(origin.y, 4.12 - 0.12 * tilt);
    W.basket.position.copy(origin);
    W.basket.visible = T > 2.0;
    W.basket.updateMatrixWorld(true);
    stretch(W.cable, belly, W.basket.localToWorld(V(0, 1.8, 0)));
    W.cable.visible = T > 2.0;
    C.heli = hp; C.kw = (x, y, z) => W.basket.localToWorld(V(x, y, z));
    C.palmTop = W.palm.position.clone().add(V(0, 11.2, 0));
    C.cabin = W.heli.localToWorld(V(0.9, -0.35, 0.2));
    const g = gust(T);
    W.palmLeaves.forEach((lf, k) => { lf.rotation.z = -0.35 + 0.18 * g * Math.sin(T * 7 + k); });
    // boat heads off to another house
    const bu = ease(T / 14);
    W.boat.position.set(lerp(-7, -40, bu), L + 0.15 * Math.sin(T * 2.1), lerp(-7.2, 1, bu));
    W.boat.rotation.set(0.05 * Math.sin(T * 1.7), Math.atan2(33, -8.2), 0.06 * Math.sin(T * 2.3));
  }

  // camera
  const shot = shotAt2(end, T);
  const u = clamp((T - shot.t0) / (shot.t1 - shot.t0), 0, 1);
  const [p, look, fov, sh] = shot.cam(u, T, C);
  const n1 = Math.sin(T * 37.1) + 0.6 * Math.sin(T * 23.7 + 1.3), n2 = Math.sin(T * 31.3 + 2.1) + 0.6 * Math.sin(T * 19.9);
  cam.position.set(p.x + sh * n1, p.y + sh * n2 + 0.01 * Math.sin(T * 7.0), p.z);
  cam.fov = fov; cam.updateProjectionMatrix();
  cam.lookAt(look);
  let roll = sh * 0.8 * Math.sin(T * 17.3);
  if (end === "heli" && T > 8 && !shot.cabin) roll += 0.7 * swing(T)[1];
  cam.rotateZ(roll);
  if (end === "heli") {
    W.heli.visible = !shot.cabin;
    W.basket.visible = W.basket.visible && !shot.cabin;
    W.cable.visible = W.cable.visible && !shot.cabin;
    arms.frame.visible = !!shot.cabin;
  }

  // arms
  const pose = shot.arms(u, T);
  for (const [k, s] of [["L", -1], ["R", 1]]) {
    const a = arms[k], h = pose[k];
    a.g.visible = !!h;
    if (h) placeArm(a, V(0.34 * s, -0.5, 0.2), V(...h), s);
  }
  arms.X.g.visible = !!pose.X;
  if (pose.X) placeArm(arms.X, V(0.2, 0.75, -0.9), V(...pose.X), -1);

  // water: storm chop + rotor downwash rings under a low helicopter
  const pos = W.water.geometry.attributes.position, b = W.wbase;
  let wx = 0, wz = 0, w = 0;
  if (end === "heli") { const hp = W.heli.position; wx = hp.x; wz = hp.z; w = clamp((14 - (hp.y - L)) / 6, 0, 1); }
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3], z = b[i * 3 + 2];
    const rh = Math.hypot(x, z), shel = clamp((rh - 4) / 8, 0.22, 1);
    let y = 0.28 * shel * (Math.sin(x * 0.35 + T * 1.9) + 0.6 * Math.sin(z * 0.5 - T * 2.6) + 0.3 * Math.sin((x + z) * 1.3 + T * 4.1));
    if (w > 0) { const r = Math.hypot(x - wx, z - wz); y += w * 0.35 * Math.sin(r * 1.2 - T * 7) * Math.exp(-r / 9); }
    pos.array[i * 3 + 1] = y;
  }
  pos.needsUpdate = true; W.water.geometry.computeVertexNormals();
  W.water.position.y = L;
  W.water.material.opacity = 0.86;
  for (const c of W.cars) {
    c.o.position.y = Math.max(0, L - 0.6) + 0.1 * Math.sin(T * 1.5 + c.ph);
    c.o.rotation.set(0.08 * Math.sin(T * 1.2 + c.ph), c.ry + 0.1 * Math.sin(T * 0.4 + c.ph), 0.1 * Math.sin(T * 1.7 + c.ph));
  }

  // lightning
  let flash = 0;
  for (const lt of (spec.sfx?.lightning || [])) {
    const d = T - lt;
    if (d >= 0 && d < 0.35) flash = Math.max(flash, d < 0.08 ? 1 : d < 0.16 ? 0.3 : d < 0.24 ? 0.8 : 0.2);
  }
  W.bolt.visible = flash > 0.5;
  W.hemi.intensity = 1.2 + 3.0 * flash;
  W.scene.background.copy(W.SKY).lerp(new THREE.Color(0x9fb3d8), flash * 0.6);
  W.scene.fog.color.copy(W.scene.background); W.scene.fog.near = 20; W.scene.fog.far = 140 + 8 * Math.max(0, cam.position.y - 10);
  W.bubbles.visible = false;

  // rain around the camera
  const ra = W.rpos;
  for (let i = 0; i < W.rseed.length; i++) {
    const [sx, sy, sz] = W.rseed[i];
    let y = (sy - T * 18) % 24; if (y < 0) y += 24;
    const x = cam.position.x + sx, z = cam.position.z + sz, yy = cam.position.y - 8 + y;
    ra[i * 6] = x; ra[i * 6 + 1] = yy; ra[i * 6 + 2] = z;
    ra[i * 6 + 3] = x + 0.12; ra[i * 6 + 4] = yy + 0.7; ra[i * 6 + 5] = z;
  }
  W.rain.geometry.attributes.position.needsUpdate = true;

  return { L, under: false, flash, shot: shotsFor(end).indexOf(shot) };
}
