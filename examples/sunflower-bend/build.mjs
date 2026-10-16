import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIO_CSS, blobOf, blobSvg } from "../../kit/blob.mjs";
import { fitProjection, figureSvg, iso, pageHtml, plateHtml } from "../../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");
const WIDTH = 760;
const HEIGHT = 300;
const SEGMENTS = 26;
const STEM = 62;
const LAMP = 70;

const bounds = [[-62, -22, 0], [62, 22, 0], [-62, 0, 72], [62, 0, 72], [0, 0, -3]];
const P = fitProjection(bounds, WIDTH, HEIGHT, { pad: 18, azimuth: 45, elevation: 30 });
const origin = iso([0, 0, 0], P);
const base = iso([0, 0, 2], P);
const ex = [iso([1, 0, 0], P)[0] - origin[0], iso([1, 0, 0], P)[1] - origin[1]];
const ez = [iso([0, 0, 1], P)[0] - origin[0], iso([0, 0, 1], P)[1] - origin[1]];
const r1 = (n) => Number(n.toFixed(2));

const organicRing = (centre, rx, ry, z, phase = 0) =>
  Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    const wobble = 1 + 0.07 * Math.sin(angle * 3 + phase) + 0.03 * Math.cos(angle * 5 - phase);
    return [centre[0] + Math.cos(angle) * rx * wobble, centre[1] + Math.sin(angle) * ry * wobble, z];
  });
const soil = blobOf(organicRing([0, 0, 0], 24, 16, 0, 0.7), P, { tone: "mid", id: "soil" });
const [sx, sy] = base;

const layer = (cls) => Array.from({ length: SEGMENTS }, () => `<line class="${cls}"/>`).join("");
const svgBody = [
  `<polygon id="beam" class="beam"/>`,
  blobSvg(soil),
  `<g id="stem">${layer("stem-edge")}${layer("stem-body")}${layer("stem-shine")}</g>`,
  `<path id="lead-leaves" class="bio-label-line"/><path id="lead-stem" class="bio-label-line"/><path id="lead-light" class="bio-label-line"/><path id="lead-soil" class="bio-label-line"/>`,
  `<circle id="dot-leaves" class="lead-dot" r="1.2"/><circle id="dot-stem" class="lead-dot" r="1.2"/><circle id="dot-light" class="lead-dot" r="1.2"/><circle class="lead-dot" r="1.2" cx="${r1(sx + 10)}" cy="${r1(sy + 8)}"/>`,
  `<text id="t-leaves" class="bio-label">leaves (schematic)</text><text id="t-stem" class="bio-label">stem</text><text id="t-light" class="bio-label">light</text><text id="t-soil" class="bio-label" x="${r1(sx + 38)}" y="${r1(sy + 40)}">soil</text>`,
  `<path class="bio-label-line" d="M${r1(sx + 10)},${r1(sy + 8)} L${r1(sx + 36)},${r1(sy + 34)}"/>`,
  `<g id="leaves"><ellipse class="leaf" rx="12" ry="4.6"/><ellipse class="leaf" rx="12" ry="4.6"/><circle class="bud" r="2.6"/></g>`,
  `<g id="lamp"><circle class="lamp-halo" r="20"/><circle class="lamp" r="8.5"/></g>`,
].join("");

const figure = figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "A sunflower seedling bends toward a light. Its stem angle is computed live from a two-state model with sensing lag and a saturating bend rate.",
  body: svgBody,
  className: "bend-figure",
});

const controls = `
<div class="bend-controls" role="group" aria-label="Model parameters">
  <label>gain k <output data-for="k"></output><input id="k" type="range" min="2" max="50" step="0.1" value="20"></label>
  <label>sensing lag τ <output data-for="tau"></output><input id="tau" type="range" min="0.2" max="6" step="0.01" value="1"></label>
  <label>max rate <output data-for="max"></output><input id="max" type="range" min="2" max="40" step="0.1" value="15"></label>
  <label>light angle φ₀ <output data-for="phi"></output><input id="phi" type="range" min="10" max="85" step="0.1" value="60"></label>
  <div class="presets" role="group" aria-label="Presets">
    <button type="button" data-preset="20,1,15,60">Illustrative</button>
    <button type="button" data-preset="18.5,3.63,20.7,49.1">Fit: typical plant</button>
    <button type="button" data-preset="22.9,4.17,6.2,31.7">Fit: cap not reached</button>
    <button type="button" data-preset="40.8,4.37,7.4,45.3">Fit: cap binds</button>
  </div>
  <label class="check"><input id="flip" type="checkbox"> flip the light to the other side at 6 h</label>
  <button class="motion-toggle" type="button" aria-pressed="false">Pause motion</button>
</div>
<svg class="bend-chart" viewBox="0 0 700 132" role="img" aria-label="Stem angle over twelve hours, with and without the rate limit">
  <g class="axis"><path d="M34,10 L34,106 L690,106"/><path class="mid" d="M34,58 L690,58"/></g>
  <g id="ticks"></g>
  <path id="plot-phi" class="plot-phi"/><path id="plot-free" class="plot-free"/><path id="plot-theta" class="plot-theta"/>
  <circle id="cursor" class="cursor" r="3.2"/>
  <text class="bio-label" x="38" y="9">angle (°)</text><text class="bio-label" x="690" y="100" text-anchor="end">time (h)</text>
  <text class="bio-label key phi" x="400" y="9">light φ</text><text class="bio-label key free" x="490" y="9">no rate limit</text><text class="bio-label key theta" x="610" y="9">stem θ</text>
</svg>
<p class="bend-status" id="status" aria-live="polite"></p>`;

const framed = plateHtml({
  fig: "Fig 1",
  title: "Bending toward light",
  hint: "Drag a slider · Space: pause",
  readout: "θ 0.0°",
  caption: "Schematic. The stem angle θ follows the BendLab model (two states: angle θ and bend rate r). The stem is drawn as a smooth curve whose tip angle equals θ. Parameter defaults are illustrative, not fitted values.",
  body: `<div class="bend-svg">${figure}</div>${controls}`,
});

const sources = `<footer class="bio-sources">
<p><strong>Model.</strong> BendLab (MIT licence), <a href="https://github.com/Yash-Tripath1/Bendlab">github.com/Yash-Tripath1/Bendlab</a>, <code>sim.py</code>: <code>τ·dr/dt = k·sin(φ − θ) − r</code>, <code>r</code> clipped to ±max rate, <code>dθ/dt = r</code>, forward Euler with a one-minute step, <code>θ</code> and <code>r</code> starting at zero. In the code <code>r</code> is in degrees per hour, so <code>k</code> is also in degrees per hour as written. BendLab describes the form as related to the Cholodny–Went hypothesis and the Blaauw sine law. The model is phenomenological: it has no auxin state and does not simulate hormone transport.</p>
<p><strong>Data BendLab fits.</strong> Stem-angle trajectories from S13 Data of <em>Multiple light signaling pathways control solar tracking in sunflowers</em>, PLOS Biology (2023), <a href="https://doi.org/10.1371/journal.pbio.3002344">doi 10.1371/journal.pbio.3002344</a>, as reported in the BendLab README. This figure does not display those data.</p>
<p><strong>Fitted presets.</strong> The three “fit” buttons load parameter values supplied by BendLab’s author for seedlings from the published data (Brooks et al. 2023, Fig 1C, as reported by the author): a typical plant (k = 18.5 °/h, τ = 3.63 h, max rate = 20.7 °/h, φ₀ = 49.1°); a plant whose fitted cap is not reached (k = 22.9 °/h, τ = 4.17 h, max rate = 6.2 °/h, φ₀ = 31.7°); and plant ZT3-8, where the cap binds (k = 40.8 °/h, τ = 4.37 h, max rate = 7.4 °/h, φ₀ = 45.3°). Every plant runs from rest (θ = 0, r = 0) in static light for twelve hours, the protocol of the original fits. Under it, the second plant peaks at 5.9 °/h, under its 6.2 °/h cap, and ZT3-8 would peak near 12 °/h without a cap, so its 7.4 °/h cap bites. The author reports (personal communication, 2026-10-16) that across all 48 fitted seedlings the fitted cap binds for exactly one plant. The figure runs the model with these values; it does not plot the measured trajectories.</p>
<p><strong>What the rate-limit note shows.</strong> BendLab reports that <code>max rate</code> cannot be identified from a trajectory that never reaches the limit (its README gives an example fit with identical error with and without the limit). The blue curve and the status line reproduce that idea for the sliders you choose; they are not BendLab's fitted results. BendLab's results are the author's own and not peer reviewed.</p>
<p><strong>Simplified.</strong> One angle for the whole stem; leaves, soil and lamp are schematic; the light is a point direction with no intensity; time runs at 0.75 s per model hour. For education only.</p>
<p><strong>Credits.</strong> Model and findings: <a href="https://github.com/Yash-Tripath1/Bendlab">BendLab</a>, reviewed for accuracy by its author. Figure: built with <a href="https://github.com/Garinmckayl/anima">Anima</a> by Natnael Getenew.</p>
</footer>`;

const style = `
.bend-figure .bio-blob-base{fill:var(--anatomy-shade-2)}
.bend-figure .bio-blob-shade{fill:var(--anatomy-shade-0);opacity:.62}
.bend-figure .bio-blob-highlight{fill:var(--anatomy-top);opacity:.5}
.bend-figure .bio-blob-edge{fill:none}
.bend-figure .stem-edge{stroke:var(--anatomy-paper);stroke-linecap:round}
.bend-figure .stem-body{stroke:var(--anatomy-green);stroke-linecap:round;opacity:.92}
.bend-figure .stem-shine{stroke:var(--anatomy-lit);stroke-linecap:round;opacity:.28}
.bend-figure .leaf{fill:var(--anatomy-green);stroke:var(--anatomy-paper);stroke-width:1;opacity:.95}
.bend-figure .bud{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1}
.bend-figure .beam{fill:var(--anatomy-lit);opacity:.07}
.bend-figure .lamp{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1.2}
.bend-figure .lamp-halo{fill:var(--anatomy-lit);opacity:.22;filter:blur(5px)}
.bend-figure .bio-label{fill:var(--anatomy-text);font:9px var(--anatomy-mono);letter-spacing:.015em}
.bend-figure .bio-label-line{fill:none;stroke:var(--anatomy-faint);stroke-width:.65}
.bend-figure .lead-dot{fill:var(--anatomy-text)}
.bend-controls{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 22px;margin:12px 0 4px;font:12px var(--anatomy-mono);color:var(--anatomy-text)}
.bend-controls label{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center}
.bend-controls label input[type=range]{grid-column:1/-1;width:100%;accent-color:var(--anatomy-green)}
.bend-controls output{color:var(--anatomy-strong)}
.bend-controls .presets{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px}
.bend-controls .presets button{border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:12px var(--anatomy-mono);padding:6px 10px;cursor:pointer}
.bend-controls .presets button:hover{border-color:var(--anatomy-text)}
.bend-controls .presets button:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.bend-controls .check{grid-template-columns:auto 1fr;justify-content:start}
.bend-controls input:focus-visible,.motion-toggle:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.motion-toggle{justify-self:end;border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:12px var(--anatomy-mono);padding:6px 10px;cursor:pointer}
.bend-chart{display:block;width:100%;height:auto;margin-top:8px}
.bend-chart .axis path{fill:none;stroke:var(--anatomy-faint);stroke-width:1}
.bend-chart .axis .mid{stroke-dasharray:none;opacity:.5}
.bend-chart .tick{fill:var(--anatomy-muted);font:9px var(--anatomy-mono)}
.bend-chart .plot-phi{fill:none;stroke:var(--anatomy-muted);stroke-width:1.2}
.bend-chart .plot-free{fill:none;stroke:var(--anatomy-blue);stroke-width:1.4;opacity:.85}
.bend-chart .plot-theta{fill:none;stroke:var(--anatomy-green);stroke-width:2}
.bend-chart .cursor{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1}
.bend-chart .bio-label{fill:var(--anatomy-text);font:9px var(--anatomy-mono)}
.bend-chart .key.phi{fill:var(--anatomy-muted)}
.bend-chart .key.free{fill:var(--anatomy-blue)}
.bend-chart .key.theta{fill:var(--anatomy-green)}
.bend-status{margin:6px 0 0;font:12px var(--anatomy-mono);color:var(--anatomy-text);min-height:2.6em}
.bio-sources{max-width:760px;margin:14px auto;color:var(--anatomy-muted);font-size:12px;line-height:1.65}
.bio-sources a{color:var(--anatomy-text);text-underline-offset:2px}
.bio-sources code{font:11px var(--anatomy-mono);color:var(--anatomy-text)}
@media(max-width:560px){.bend-controls{grid-template-columns:1fr}}
`;

const script = `
const BASE = [${r1(base[0])}, ${r1(base[1])}], EX = [${r1(ex[0] * 1000) / 1000}, ${r1(ey(ex) * 1000) / 1000}], EZ = [${r1(ez[0] * 1000) / 1000}, ${r1(ez[1] * 1000) / 1000}];
const STEM = ${STEM}, LAMP = ${LAMP}, SEG = ${SEGMENTS}, HOURS = 12, DT = 1 / 60, FLIP_AT = 6, SEC_PER_H = 0.75, HOLD = 2.5;
const svg = document.querySelector(".bend-figure");
const $ = (id) => document.getElementById(id);
const readout = document.querySelector("[data-readout]");
const toggle = document.querySelector(".motion-toggle");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const rad = Math.PI / 180;

// The model: BendLab sim.py, forward Euler, one-minute step.
const simulate = (p, flip, free) => {
  const n = Math.round(HOURS / DT);
  const theta = new Float32Array(n + 1), rate = new Float32Array(n + 1);
  let th = 0, r = 0, clamped = false;
  const lim = free ? 1e9 : p.max;
  for (let i = 0; i < n; i++) {
    const phi = flip && i * DT >= FLIP_AT ? -p.phi : p.phi;
    r += (p.k * Math.sin((phi - th) * rad) - r) * (DT / p.tau);
    if (r > lim) { r = lim; clamped = true; } else if (r < -lim) { r = -lim; clamped = true; }
    th += r * DT;
    theta[i + 1] = th; rate[i + 1] = r;
  }
  return { theta, rate, clamped, n };
};

const params = () => ({ k: +$("k").value, tau: +$("tau").value, max: +$("max").value, phi: +$("phi").value });
let run, free, p, flip;
const shown = { k: (v) => v.toFixed(1) + " °/h", tau: (v) => v.toFixed(2) + " h", max: (v) => v.toFixed(1) + " °/h", phi: (v) => v.toFixed(1) + "°" };

const pt = (u, z) => [BASE[0] + u * EX[0] + z * EZ[0], BASE[1] + u * EX[1] + z * EZ[1]];
const stemPoints = (theta) => {
  const out = [[0, 0]];
  let u = 0, z = 0;
  for (let i = 1; i <= SEG; i++) {
    const a = theta * Math.pow(i / SEG, 1.5) * rad;
    u += Math.sin(a) * STEM / SEG; z += Math.cos(a) * STEM / SEG;
    out.push([u, z]);
  }
  return out;
};

const edges = [...svg.querySelectorAll(".stem-edge")], bodies = [...svg.querySelectorAll(".stem-body")], shines = [...svg.querySelectorAll(".stem-shine")];
const leaves = [...svg.querySelectorAll(".leaf")], bud = svg.querySelector(".bud");
const set = (el, o) => { for (const k in o) el.setAttribute(k, o[k]); };
const f = (n) => n.toFixed(1);

const draw = (thetaDeg, phiDeg) => {
  const pts = stemPoints(thetaDeg).map(([u, z]) => pt(u, z));
  for (let i = 0; i < SEG; i++) {
    const w = 8.5 - 4.6 * (i / SEG);
    const [a, b] = [pts[i], pts[i + 1]];
    const c = { x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]) };
    set(edges[i], { ...c, "stroke-width": f(w + 1.8) });
    set(bodies[i], { ...c, "stroke-width": f(w) });
    set(shines[i], { x1: f(a[0] - w * 0.18), y1: f(a[1]), x2: f(b[0] - w * 0.18), y2: f(b[1]), "stroke-width": f(w * 0.28) });
  }
  const tip = pts[SEG], before = pts[SEG - 2];
  const dir = Math.atan2(tip[1] - before[1], tip[0] - before[0]) / rad;
  leaves.forEach((leaf, i) => {
    const side = i ? 1 : -1;
    const ang = dir + side * 52;
    const c = [tip[0] + Math.cos(ang * rad) * 11, tip[1] + Math.sin(ang * rad) * 11];
    set(leaf, { cx: f(c[0]), cy: f(c[1]), transform: "rotate(" + f(ang) + " " + f(c[0]) + " " + f(c[1]) + ")" });
  });
  set(bud, { cx: f(tip[0]), cy: f(tip[1]) });
  const lamp = pt(Math.sin(phiDeg * rad) * LAMP, 2 + Math.cos(phiDeg * rad) * LAMP);
  set($("lamp").children[0], { cx: f(lamp[0]), cy: f(lamp[1]) });
  set($("lamp").children[1], { cx: f(lamp[0]), cy: f(lamp[1]) });
  const dx = tip[0] - lamp[0], dy = tip[1] - lamp[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  $("beam").setAttribute("points", [[lamp[0] + nx * 7, lamp[1] + ny * 7], [tip[0] + nx * 26, tip[1] + ny * 26], [tip[0] - nx * 26, tip[1] - ny * 26], [lamp[0] - nx * 7, lamp[1] - ny * 7]].map((q) => f(q[0]) + "," + f(q[1])).join(" "));
  const mid = pts[Math.round(SEG * 0.45)];
  const place = (name, target, to, anchor) => {
    $("t-" + name).setAttribute("x", f(to[0])); $("t-" + name).setAttribute("y", f(to[1]));
    $("t-" + name).setAttribute("text-anchor", anchor);
    $("lead-" + name).setAttribute("d", "M" + f(target[0]) + "," + f(target[1]) + " L" + f(to[0] + (anchor === "end" ? 3 : -3)) + "," + f(to[1] - 3));
    set($("dot-" + name), { cx: f(target[0]), cy: f(target[1]) });
  };
  const side = mid[0] > BASE[0] ? -1 : 1;
  place("leaves", tip, [tip[0] - 64, tip[1] - 26], "end");
  place("stem", mid, [mid[0] + side * 46, mid[1] + 8], side > 0 ? "start" : "end");
  place("light", lamp, [lamp[0] + (lamp[0] > BASE[0] ? 24 : -24), lamp[1] - 22], lamp[0] > BASE[0] ? "start" : "end");
};

const X = (t) => 34 + (t / HOURS) * 656, Y = (a) => 10 + ((90 - a) / 180) * 96;
const line = (arr, step) => { let d = ""; for (let i = 0; i < arr.length; i += step) d += (i ? "L" : "M") + f(X(i * DT)) + "," + f(Y(arr[i])); return d; };
const buildChart = () => {
  const phiArr = Float32Array.from({ length: run.n + 1 }, (_, i) => (flip && i * DT >= FLIP_AT ? -p.phi : p.phi));
  $("plot-theta").setAttribute("d", line(run.theta, 6));
  $("plot-free").setAttribute("d", line(free.theta, 6));
  $("plot-phi").setAttribute("d", line(phiArr, 6));
  $("ticks").innerHTML = [0, 3, 6, 9, 12].map((h) => '<text class="tick" x="' + X(h) + '" y="118" text-anchor="middle">' + h + '</text>').join("") + [-60, 0, 60].map((a) => '<text class="tick" x="30" y="' + (Y(a) + 3) + '" text-anchor="end">' + a + '</text>').join("");
  const peak = Math.max(...run.rate.map(Math.abs));
  $("status").textContent = run.clamped
    ? "The bend rate reaches the limit (" + p.max.toFixed(1) + " °/h), so the stem is slower than the blue curve. The limit shapes this trajectory."
    : "The bend rate peaks at " + peak.toFixed(1) + " °/h and never reaches the limit (" + p.max.toFixed(1) + " °/h), so the two curves overlap. Max rate has no effect on this trajectory, which is why it cannot be read off from it.";
};

const recompute = () => {
  p = params(); flip = $("flip").checked;
  for (const key of ["k", "tau", "max", "phi"]) document.querySelector('[data-for="' + key + '"]').textContent = shown[key](p[key]);
  run = simulate(p, flip, false); free = simulate(p, flip, true);
  buildChart();
  started = performance.now();
  if (!playing) frameAt(HOURS);
};

const frameAt = (t) => {
  const i = Math.min(run.n, Math.round(t / DT));
  const phi = flip && t >= FLIP_AT ? -p.phi : p.phi;
  draw(run.theta[i], phi);
  readout.textContent = "θ " + run.theta[i].toFixed(1) + "° · r " + run.rate[i].toFixed(1) + "°/h · " + t.toFixed(1) + " h";
  set($("cursor"), { cx: f(X(t)), cy: f(Y(run.theta[i])) });
};

let started = performance.now(), playing = !reduce.matches, visible = true, raf = 0;
let allowMotion = !reduce.matches;
const loop = (now) => {
  raf = 0;
  if (!playing || !visible || !allowMotion) return;
  const total = HOURS * SEC_PER_H + HOLD;
  const s = Math.max(0, (now - started) / 1000) % total;
  frameAt(Math.min(HOURS, s / SEC_PER_H));
  raf = requestAnimationFrame(loop);
};
const go = () => { if (playing && visible && allowMotion && !raf) raf = requestAnimationFrame(loop); };
const halt = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
  const [k, tau, max, phi] = b.dataset.preset.split(",");
  $("k").value = k; $("tau").value = tau; $("max").value = max; $("phi").value = phi;
  recompute(); if (!playing) frameAt(HOURS);
}));
for (const id of ["k", "tau", "max", "phi", "flip"]) $(id).addEventListener("input", () => { recompute(); if (!playing) frameAt(HOURS); });
toggle.addEventListener("click", () => {
  playing = !playing;
  if (playing) allowMotion = true;
  toggle.textContent = playing ? "Pause motion" : "Play motion";
  toggle.setAttribute("aria-pressed", String(!playing));
  if (playing) { started = performance.now(); go(); } else halt();
});
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.closest("button, a, input, textarea, select")) return;
  e.preventDefault(); toggle.click();
});
reduce.addEventListener("change", () => location.reload());
new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) go(); else halt(); }).observe(svg);

recompute();
if (reduce.matches) { toggle.textContent = "Play motion"; toggle.setAttribute("aria-pressed", "true"); frameAt(HOURS); } else { frameAt(0); go(); }
`;

const html = pageHtml({
  title: "Sunflower seedling bending toward light | Anima",
  theme: light ? "light" : "dark",
  width: WIDTH + 40,
  body: `<style>${BIO_CSS}${style}</style>${framed}${sources}`,
  script,
});
const filename = light ? "sunflower-bend-light.html" : "sunflower-bend.html";
writeFileSync(join(HERE, filename), html);
console.log(`wrote examples/sunflower-bend/${filename}`);

function ey(v) { return v[1]; }
