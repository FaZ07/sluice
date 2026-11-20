// Node-side checks for the flood scene: timeline sanity + determinism.
//   node clipper/pov/check.mjs      -> prints "N/N checks passed", exit 1 on failure
import * as THREE from "./vendor/three.module.min.js";
import { SHOTS, WATER, waterLevel, buildWorld, buildArms, update, mulberry32 } from "./flood.js";

let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; else console.log("FAIL", name); };

// shots tile 0..45 with no gaps; cuts are 1.2-2.2 s except the held finale
check("shots start at 0", SHOTS[0].t0 === 0);
check("shots end at 45", SHOTS[SHOTS.length - 1].t1 === 45);
let tiled = true, paced = true;
for (let i = 0; i < SHOTS.length; i++) {
  if (i && SHOTS[i].t0 !== SHOTS[i - 1].t1) tiled = false;
  const len = SHOTS[i].t1 - SHOTS[i].t0;
  if (i < SHOTS.length - 1 && (len < 1.2 || len > 2.2)) paced = false;
}
check("shots tile the timeline", tiled);
check("cuts every 1.2-2.2 s", paced);

// water never drops; underwater only while it is above the room ceiling
let mono = true;
for (let t = 0; t < 45; t += 0.05) if (waterLevel(t + 0.05) + 1e-9 < waterLevel(t)) mono = false;
check("water level never falls", mono);
check("water keys sorted", WATER.every((k, i) => !i || k[0] > WATER[i - 1][0]));

// PRNG reproducible
const a = mulberry32(5), b = mulberry32(5);
check("prng reproducible", [0, 1, 2, 3].every(() => a() === b()));

// update() is a pure function of t: same t -> same camera, regardless of order
const spec = { sfx: { lightning: [0.6, 23.6] } };
const W1 = buildWorld(spec), W2 = buildWorld(spec);
const c1 = new THREE.PerspectiveCamera(60, 9 / 16, 0.05, 400), c2 = c1.clone();
W1.scene.add(c1); W2.scene.add(c2);
const a1 = buildArms(c1), a2 = buildArms(c2);
for (const t of [3, 17, 30]) update(W1, c1, a1, t, spec);           // different history
const i1 = update(W1, c1, a1, 16.0, spec), i2 = update(W2, c2, a2, 16.0, spec);
c1.updateMatrixWorld(); c2.updateMatrixWorld();
check("camera deterministic", c1.matrixWorld.elements.every((v, k) => Math.abs(v - c2.matrixWorld.elements[k]) < 1e-9));
check("same underwater state", i1.under === i2.under && i1.under === true);
check("roof shot above water", update(W2, c2, a2, 24.0, spec).under === false);
check("boat visible on the roof", W2.boat.visible === true);

// Part 2 + Part 3 endings: shots tile, camera is a pure function of t, nothing goes NaN
import * as F2 from "./flood2.js";
import * as F3 from "./flood3.js";
import * as F4 from "./flood4.js";
import * as F5 from "./flood5.js";
for (const [mod, shots, tag] of [[F2, F2.shotsFor, "p2"], [F3, F3.shotsFor3, "p3"], [F4, F4.shotsFor4, "p4"], [F5, F5.shotsFor5, "p5"]]) {
  for (const end of ["boat", "heli"]) {
    const sp = { ending: end, sfx: { lightning: [1, 20] } };
    const S = shots(end);
    check(`${tag} ${end} shots tile`, S[0].t0 === 0 && S.every((s, i) => !i || s.t0 === S[i - 1].t1));
    const mk = () => { const w = mod.buildWorld(sp), c = new THREE.PerspectiveCamera(60, 9 / 16, 0.05, 400); w.scene.add(c); return [w, c, mod.buildArms(c, sp)]; };
    const [wa, ca, aa] = mk(), [wb, cb, ab] = mk();
    let finite = true;
    for (let t = 0; t < 40; t += 0.5) { mod.update(wa, ca, aa, t, sp); if (!Number.isFinite(ca.position.x + ca.position.y)) finite = false; }
    mod.update(wa, ca, aa, 13.0, sp); mod.update(wb, cb, ab, 13.0, sp);
    ca.updateMatrixWorld(); cb.updateMatrixWorld();
    check(`${tag} ${end} finite`, finite);
    check(`${tag} ${end} deterministic`, ca.matrixWorld.elements.every((v, k) => Math.abs(v - cb.matrixWorld.elements[k]) < 1e-9));
  }
}
check("p2 ducked head clears the power line", F2.HAZ.wire.low - (F2.waterLevel2(19.2) + 0.15 + 1.0) > 0.5);
let rising = true;
for (let t = 0; t < 44; t += 0.1) if (F3.waterLevel3(t + 0.1) + 1e-9 < F3.waterLevel3(t)) rising = false;
check("p3 water never falls", rising);
check("p3 gym floods only after the eyewall", F3.waterLevel3(F3.EYE[3]) < F3.FLOOR && F3.waterLevel3(30) > F3.FLOOR);

let rising4 = true;
for (let t = 0; t < 44; t += 0.1) if (F4.waterLevel4(t + 0.1) + 1e-9 < F4.waterLevel4(t)) rising4 = false;
check("p4 water never falls", rising4);
check("p4 stay: your rows stay dry while you stand on them", F4.waterLevel4(22.4) < F3.FLOOR + 0.5 * 6 && F4.waterLevel4(27.0) < F3.FLOOR + 0.5 * 7);
check("p5 boat reaches the garage before you jump", F5.boatPose5(14.8).p.distanceTo(new THREE.Vector3(-102.6, 0, 30.5)) < 0.01);

console.log(`${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
