import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIO_CSS, blobOf, blobSvg } from "../../kit/blob.mjs";
import { cameraOf, fadeLineSvg, fitProjection, figureSvg, iso, pageHtml, pathOf, plateHtml } from "../../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");
const WIDTH = 960;
const HEIGHT = 640;

const MODEL_STATES = {
  first: { d2: 1.0, reward: 0.85, wanting: 0.3, control: 0.9 },
  after: { d2: 0.6, reward: 0.45, wanting: 0.95, control: 0.5 },
};
const MODEL_SRC = `
const MODEL_STATES = ${JSON.stringify(MODEL_STATES)};
const D2_MARKERS = 8;
function model(state) {
  const m = MODEL_STATES[state], b = MODEL_STATES.first;
  const rel = (v, base) => (v < base - 0.1 ? "lower" : v > base + 0.1 ? "higher" : "baseline");
  return {
    level: m,
    d2Markers: Math.round(m.d2 * D2_MARKERS),
    words: { d2: rel(m.d2, b.d2), reward: rel(m.reward, b.reward), wanting: rel(m.wanting, b.wanting), control: rel(m.control, b.control) },
  };
}
`;

const smoothRing = (pts, n = 8) => {
  const out = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i + N - 1) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  return out;
};
const area = (r) => r.reduce((s, [x, z], i) => { const [x2, z2] = r[(i + 1) % r.length]; return s + (x * z2 - x2 * z); }, 0) / 2;
const insetRing = (r, by, passes = 6) => {
  const N = r.length, ccw = area(r) > 0;
  let o = r.map(([x, z], i) => {
    const [ax, az] = r[(i + N - 1) % N], [bx, bz] = r[(i + 1) % N];
    let tx = bx - ax, tz = bz - az; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    const [nx, nz] = ccw ? [-tz, tx] : [tz, -tx];
    return [x + nx * by, z + nz * by];
  });
  for (let k = 0; k < passes; k++) o = o.map((p, i) => [(o[(i + N - 1) % N][0] + 2 * p[0] + o[(i + 1) % N][0]) / 4, (o[(i + N - 1) % N][1] + 2 * p[1] + o[(i + 1) % N][1]) / 4]);
  return o;
};

const CEREBRUM = smoothRing([
  [-104, 2], [-101, 22], [-90, 44], [-68, 62], [-38, 72], [-4, 76], [30, 73], [62, 64], [86, 46], [99, 22], [102, -2], [95, -22],
  [80, -34], [62, -38], [44, -36], [28, -40], [12, -38], [-2, -41], [-14, -47], [-30, -50], [-46, -46], [-56, -36], [-64, -24],
  [-80, -20], [-96, -14], [-103, -6],
], 8);
const CEREBELLUM = smoothRing([[34, -40], [50, -44], [70, -52], [86, -60], [89, -72], [78, -83], [60, -87], [44, -81], [34, -68], [28, -54]], 8);
const BRAINSTEM = smoothRing([[-4, -36], [26, -36], [28, -52], [30, -72], [32, -86], [20, -90], [9, -86], [6, -70], [2, -56], [-5, -46]], 8);

const ell = (cx, cz, rx, rz, phase = 0, tilt = 0, n = 28) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + 0.05 * Math.sin(a * 3 + phase) + 0.025 * Math.cos(a * 5 - phase);
    const x = Math.cos(a) * rx * w, z = Math.sin(a) * rz * w;
    return [cx + x * Math.cos(tilt) - z * Math.sin(tilt), 0, cz + x * Math.sin(tilt) + z * Math.cos(tilt)];
  });
const REGION = {
  pfc: { c: [-76, 20], rx: 17, rz: 27, tilt: 0.1 },
  nac: { c: [-46, -8], rx: 10.5, rz: 8.5, tilt: 0 },
  vta: { c: [12, -52], rx: 7.5, rz: 6, tilt: 0 },
  amy: { c: [-22, -32], rx: 8.5, rz: 8, tilt: 0 },
  hip: { c: [30, -24], rx: 19, rz: 6.5, tilt: -0.28 },
};
const CUE = [-124, -44], CTX = [124, -20];

const T = { cerebrum: 30, cerebellum: 22, brainstem: 16 };
const bounds = [];
for (const [r, t] of [[CEREBRUM, T.cerebrum], [CEREBELLUM, T.cerebellum], [BRAINSTEM, T.brainstem]]) for (const [x, z] of r) { bounds.push([x, 0, z], [x, -t, z]); }
bounds.push([CUE[0] - 6, 0, CUE[1]], [CTX[0] + 6, 0, CTX[1]]);
const P = fitProjection(bounds, WIDTH, HEIGHT, { pad: 46, azimuth: 80, elevation: 24, headroom: 6 });
const at = (x, z, y = 0) => iso([x, y, z], P);
const f1 = (v) => +v.toFixed(1);
const S = (x, z) => at(x, z).map(f1);

function slab(ring, thickness, { id = "", rim = 0, tone = "hi" } = {}) {
  const { cosA, cosE, sinE } = cameraOf(P);
  const N = ring.length, ccw = area(ring) > 0;
  const front = ring.map(([x, z]) => at(x, z, 0));
  const back = ring.map(([x, z]) => at(x, z, -thickness));
  const facing = [], shade = [];
  for (let i = 0; i < N; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % N];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const [nx, nz] = ccw ? [dz / L, -dx / L] : [-dz / L, dx / L];
    facing.push(nx * cosA * cosE + nz * sinE > 1e-9);
    shade.push(Math.min(3, Math.max(0, Math.floor(((-nx * 0.45 + nz * 0.89 + 1) / 2) * 4))));
  }
  const buckets = [[], [], [], []];
  for (let i = 0; i < N; i++) if (facing[i]) { const j = (i + 1) % N; buckets[shade[i]].push(pathOf([front[i], front[j], back[j], back[i]], true)); }
  const runs = []; let cur = null; const start = facing.findIndex((f, i) => f && !facing[(i + N - 1) % N]);
  if (start >= 0) for (let k = 0; k < N; k++) { const i = (start + k) % N; if (facing[i]) { (cur ||= [i]).push((i + 1) % N); } else if (cur) { runs.push(cur); cur = null; } }
  if (cur) runs.push(cur);
  const backEdge = runs.map((run) => pathOf(run.map((i) => back[i]))).join("");
  const links = runs.flatMap((run) => [run[0], run[run.length - 1]]).map((i) => pathOf([front[i], back[i]])).join("");
  const rimRing = rim ? insetRing(ring, rim) : null;
  const rimPath = rimRing ? pathOf(rimRing.map(([x, z]) => at(x, z, 0)), true) : "";
  return {
    ring, rimRing,
    svg: `<g class="br-slab" ${id ? `id="${id}"` : ""}><path class="br-back" d="${pathOf(back, true)}"/>${buckets.map((d, s) => (d.length ? `<path class="br-wall" data-s="${s}" d="${d.join("")}"/>` : "")).join("")}<path class="br-cut" d="${pathOf(front, true)}"/>${rimPath ? `<path class="br-white" d="${rimPath}"/><path class="iso-line" data-tone="faint" d="${rimPath}"/>` : ""}<path class="iso-line" data-tone="mid" d="${backEdge}${links}"/><path class="iso-line" data-tone="${tone}" d="${pathOf(front, true)}"/></g>`,
  };
}
const cerebellum = slab(CEREBELLUM, T.cerebellum, { tone: "hi" });
const brainstem = slab(BRAINSTEM, T.brainstem, { tone: "hi" });
const cerebrum = slab(CEREBRUM, T.cerebrum, { rim: 5.5, tone: "hi" });

const dense = CEREBRUM;
const centroid = [0, 14];

const folia = [6, 11, 16].map((by) => {
  const inner = insetRing(CEREBELLUM, by, 4);
  const seg = inner.slice(Math.floor(inner.length * 0.08), Math.floor(inner.length * 0.7));
  return fadeLineSvg(seg.map(([x, z]) => at(x, z, 0)), { fade: [14, 14], tone: "lo" });
}).join("");

const reg = (key, tone, id) => blobOf(ell(...[...REGION[key].c, REGION[key].rx, REGION[key].rz, key.length, REGION[key].tilt]), P, { tone, id, highlight: 0.78, shade: 0.9 });
const regions = {
  pfc: reg("pfc", "mid", "pfc"), nac: reg("nac", "hi", "nac"), vta: reg("vta", "hi", "vta"), amy: reg("amy", "mid", "amy"), hip: reg("hip", "mid", "hip"),
};

const route = (pts, n = 6) => {
  const out = []; const N = pts.length;
  for (let i = 0; i < N - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(N - 1, i + 2)];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[N - 1]);
  return out.map(([x, z]) => at(x, z, 0.4));
};
const ROUTES = {
  da: route([[8, -46], [2, -30], [-12, -14], [-30, -8], [-35, -8]]),
  meso: route([[16, -46], [14, -12], [-4, 20], [-30, 36], [-54, 34], [-58, 30]]),
  pfc: route([[-61, 10], [-56, 2], [-54, -3]]),
  cueA: route([[-120, -44], [-95, -49], [-64, -45], [-42, -39], [-31, -34]]),
  ctxH: route([[120, -20], [96, -24], [70, -26], [50, -28]]),
  amV: route([[-17, -38], [-6, -45], [5, -49]]),
  hiV: route([[30, -31], [24, -42], [19, -48]]),
};
const sulci = [
  [18, 0.55], [38, 0.5], [60, 0.55], [80, 0.45], [100, 0.5], [122, 0.5], [145, 0.55], [168, 0.5],
].map(([idx, len]) => {
  const p = dense[idx % dense.length];
  const dx = centroid[0] - p[0], dz = centroid[1] - p[1], L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, wob = (idx % 2 ? 1 : -1) * 4;
  const pts = [0, 0.3, 0.6, 1].map((t, k) => [p[0] + ux * len * 40 * t - uz * wob * Math.sin(t * 3), p[1] + uz * len * 40 * t + ux * wob * Math.sin(t * 3)]);
  return fadeLineSvg(route(pts, 5), { fade: [0, 12], tone: "mid" });
}).join("");
const arrowHead = (pts, size = 9.5) => {
  const [bx, by] = pts[pts.length - 2 - 2], [x, y] = pts[pts.length - 1];
  const a = Math.atan2(y - by, x - bx);
  const p = (da, r) => [x - Math.cos(a + da) * r, y - Math.sin(a + da) * r];
  return pathOf([[x, y], p(0.42, size), p(-0.42, size)], true);
};
const routeSvg = (key, cls, info, name) => `<g class="ra-route hot ${cls}" id="r-${key}" tabindex="0" aria-label="${name}" data-info="${info}"><path class="ra-hit" d="${pathOf(ROUTES[key])}"/><path class="ra-line" d="${pathOf(ROUTES[key])}"/><path class="ra-head" d="${arrowHead(ROUTES[key])}"/></g>`;

const label = (text, x, z, dx, dy, anchor = "start", y = 0) => {
  const [px, py] = at(x, z, y);
  const tx = px + dx, ty = py + dy;
  const ex = tx + (anchor === "end" ? 3 : anchor === "middle" ? 0 : -3), ey = ty + (dy < 0 ? 3 : -4);
  return `<path class="ra-leader" d="${pathOf([[px, py], [ex, ey]])}"/><circle class="ra-dot" cx="${f1(px)}" cy="${f1(py)}" r="1.8"/><text class="ra-label" x="${f1(tx)}" y="${f1(ty)}" text-anchor="${anchor}">${text}</text>`;
};

const NAC = REGION.nac;
const d2Slots = Array.from({ length: 8 }, (_, i) => {
  const a = Math.PI * 0.6 + (i / 8) * Math.PI * 2;
  const [x, y] = at(NAC.c[0] + Math.cos(a) * (NAC.rx + 1.8), NAC.c[1] + Math.sin(a) * (NAC.rz + 1.8), 0.6);
  return `<circle class="ra-d2" data-i="${i}" cx="${f1(x)}" cy="${f1(y)}" r="3.4"/>`;
}).join("");

const token = (c, kind) => {
  const [x, y] = at(c[0], c[1], 0);
  const rays = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `M${f1(x + Math.cos(a) * 8.5)} ${f1(y + Math.sin(a) * 8.5)}L${f1(x + Math.cos(a) * 15)} ${f1(y + Math.sin(a) * 15)}`; }).join("");
  return `<g class="ra-token" id="tok-${kind}"><path class="iso-line" data-tone="mid" d="${rays}"/><circle class="ra-tok-ring" cx="${f1(x)}" cy="${f1(y)}" r="15"/><circle class="ra-tok-glow" cx="${f1(x)}" cy="${f1(y)}" r="22"/><circle class="ra-tok-body" cx="${f1(x)}" cy="${f1(y)}" r="8.5"/></g>`;
};

const glow = (key, k = 1.45) => {
  const r = REGION[key]; const [x, y] = at(r.c[0], r.c[1], 0.2);
  const s = cameraOf(P).k;
  return `<ellipse class="ra-glow" id="g-${key}" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r.rx * s * 0.8 * k)}" ry="${f1(r.rz * s * 0.8 * k)}"/>`;
};

const hot = (id, name, info, inner) => `<g class="hot" id="${id}" tabindex="0" aria-label="${name}" data-info="${info}">${inner}</g>`;

const INFO = {
  cerebrum: "Cerebrum, cerebellum and brainstem in a simplified mid-sagittal silhouette (cut plane facing you; front of the brain at left). This is a schematic: region positions are approximate, and several structures shown (amygdala, hippocampus) actually sit to the side of the midline and are projected onto this plane for simplicity.",
  pfc: "Prefrontal cortex: executive control and decision-making. In the Koob and Volkow addiction-cycle model, reduced prefrontal function weakens inhibitory control and contributes to the loss of control over use. Imaging links reduced D2 receptor availability to lower frontal activity (Volkow 1993, 2007; Goldstein and Volkow 2011). A model-level statement.",
  nac: "Nucleus accumbens (ventral striatum): receives dopamine from the VTA. Drugs and natural rewards both increase dopamine here in animal studies (Di Chiara and Imperato 1988; Hernandez and Hoebel 1988). The ring of small markers is an illustrative stand-in for D2 receptor availability: filled = available. In PET studies, D2 availability is lower on average in people with addiction (Volkow 1993, 2001), measured mainly in dorsal striatum.",
  vta: "Ventral tegmental area (VTA), in the midbrain: dopamine-producing neurons that project to the nucleus accumbens and to prefrontal cortex. Its neurons fire to salient, rewarding and reward-predicting events (Schultz, Dayan and Montague 1997).",
  amy: "Amygdala: emotional and cue-linked memory. In the Koob and Volkow model, the basolateral amygdala and hippocampus take part in the preoccupation / craving stage, when drug-linked cues reactivate the system. The route to the VTA is simplified; real pathways are indirect.",
  hip: "Hippocampus: context memory (where and when). Together with the amygdala it helps link places and cues to reward. Its route to the VTA is simplified; real pathways are indirect.",
  da: "Mesolimbic dopamine pathway (VTA to nucleus accumbens). Pulse size and brightness are a qualitative stand-in for the size of the reward-related dopamine response; they are not measured values. In the model, the response to non-drug rewards is blunted after repeated exposure (Volkow and Morales 2015; Martin-Soelch 2009), while PET shows reduced striatal dopamine release to a drug challenge in addicted people (Volkow 1997).",
  meso: "Mesocortical pathway: dopamine neurons of the VTA also project to prefrontal cortex (Hyman, Malenka and Nestler 2006). Drawn thin and constant: this figure does not model its changes.",
  pfc2: "Prefrontal top-down control of the accumbens (glutamatergic). Pulse size is a qualitative stand-in for how strongly control can restrain cue-driven drive; in the model it is weaker after repeated exposure (Koob and Volkow 2010; Goldstein and Volkow 2011).",
  cueA: "A cue (for example a sight or sound that has been linked to a reward) reaches the amygdala by sensory routes that are not drawn. Dashed line = non-dopamine (largely glutamatergic) signalling, simplified.",
  ctxH: "Context (a place or situation) reaches the hippocampus by sensory and cortical routes that are not drawn. Dashed line = non-dopamine signalling, simplified.",
  amV: "Amygdala to VTA: simplified relay of cue-linked information toward the dopamine neurons. Real connections are indirect and run through other regions.",
  hiV: "Hippocampus to VTA: simplified relay of context information toward the dopamine neurons. Real connections are indirect.",
  cue: "Cue: any sight, sound or place that has become linked to a reward. Incentive-sensitization theory (Robinson and Berridge 1993, 2008) proposes that repeated exposure sensitises the system so that such cues trigger stronger, more 'wanting'. Press 'Show cue' to fire the sequence.",
  ctx: "Context: the setting in which a reward was experienced. Press 'Show cue' to fire the cue and context sequence.",
};
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const I = Object.fromEntries(Object.entries(INFO).map(([k, v]) => [k, attr(v)]));

const body = [
  `<ellipse class="ra-halo" cx="${f1(at(0, -30)[0])}" cy="${f1(at(0, -100)[1] + 34)}" rx="330" ry="30"/>`,
  hot("cerebellum", "Cerebellum", I.cerebrum, cerebellum.svg + folia),
  hot("brainstem", "Brainstem", I.cerebrum, brainstem.svg),
  hot("cerebrum", "Cerebrum, cut plane", I.cerebrum, cerebrum.svg + sulci),
  glow("pfc", 1.2), glow("nac", 1.9), glow("vta", 1.9), glow("amy", 1.7), glow("hip", 1.3),
  routeSvg("meso", "ra-dopa ra-thin", I.meso, "Mesocortical pathway, VTA to prefrontal cortex"),
  routeSvg("da", "ra-dopa", I.da, "Mesolimbic dopamine pathway, VTA to nucleus accumbens"),
  routeSvg("pfc", "ra-glu", I.pfc2, "Prefrontal control of accumbens"),
  routeSvg("cueA", "ra-glu", I.cueA, "Cue input to amygdala"),
  routeSvg("ctxH", "ra-glu", I.ctxH, "Context input to hippocampus"),
  routeSvg("amV", "ra-glu", I.amV, "Amygdala to VTA"),
  routeSvg("hiV", "ra-glu", I.hiV, "Hippocampus to VTA"),
  hot("pfc", "Prefrontal cortex", I.pfc, blobSvg(regions.pfc)),
  hot("amy", "Amygdala", I.amy, blobSvg(regions.amy)),
  hot("hip", "Hippocampus", I.hip, blobSvg(regions.hip)),
  hot("nac", "Nucleus accumbens", I.nac, blobSvg(regions.nac) + `<g id="d2">${d2Slots}</g>`),
  hot("vta", "Ventral tegmental area", I.vta, blobSvg(regions.vta)),
  hot("cue", "Cue", I.cue, token(CUE, "cue")),
  hot("ctx", "Context", I.ctx, token(CTX, "ctx")),
  `<g id="pulses"></g>`,
  label("prefrontal cortex", -86, 44, -34, -20, "end"),
  label("(control, decision)", -86, 44, -34, -6, "end").replace(/<path[^>]*\/><circle[^>]*\/>/, ""),
  label("nucleus accumbens", -52, -10, -62, 22, "end"),
  label("(ventral striatum)", -52, -10, -62, 36, "end").replace(/<path[^>]*\/><circle[^>]*\/>/, ""),
  label("amygdala", -26, -37, -30, 46, "end"),
  label("VTA (dopamine neurons)", 14, -57, 70, 38, "start"),
  label("hippocampus", 46, -29, 36, 44, "start"),
  label("cue", CUE[0], CUE[1], 0, 44, "middle"),
  label("context", CTX[0], CTX[1], 0, 44, "middle"),
  label("cerebellum", 70, -78, 48, 28, "start"),
  label("brainstem", 18, -78, 70, 26, "start"),
  label("cerebrum", 88, 30, 52, -6, "start"),
  `<text class="ra-orient" x="${f1(at(-104, 2)[0] - 8)}" y="${f1(at(-104, 78)[1] + 28)}" text-anchor="end">front</text>`,
  `<text class="ra-orient" x="${f1(at(102, 2)[0] + 8)}" y="${f1(at(-104, 78)[1] + 28)}">back</text>`,
].join("");

const svg = figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "Schematic mid-sagittal brain silhouette showing dopamine neurons in the ventral tegmental area projecting to the nucleus accumbens, the prefrontal cortex, the amygdala and the hippocampus, with directional connections and travelling pulses, in two model states: first exposure and after repeated exposure.",
  body,
  className: "ra-fig",
});

const framed = plateHtml({
  fig: "Fig 1",
  title: "Reward pathway: one model",
  hint: "hover or focus a region · space: pause",
  readout: "first exposure · wanting low · control high",
  caption: "Schematic, not to scale: a simplified mid-sagittal silhouette with approximate region positions. Pulse size and brightness are qualitative, not measurements. Shows one leading model of addiction, not settled fact.",
  body: `<div class="ra-svg">${svg}</div>`,
});

const controls = `
<div class="ra-controls">
  <div class="ra-seg" role="group" aria-label="Model state">
    <button id="s-first" type="button" aria-pressed="true">FIRST EXPOSURE</button>
    <button id="s-after" type="button" aria-pressed="false">AFTER REPEATED EXPOSURE (model)</button>
  </div>
  <button id="cue-btn" type="button" class="ra-act">Show cue</button>
  <button id="pause" type="button" aria-pressed="false">Pause motion</button>
</div>
<div class="ra-meters" aria-label="Qualitative model levels">
  <div class="ra-m" data-k="d2"><span class="ra-mk">D2 receptor availability (striatum)</span><span class="ra-bar" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="ra-mv"></span></div>
  <div class="ra-m" data-k="reward"><span class="ra-mk">Response to non-drug rewards</span><span class="ra-bar" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="ra-mv"></span></div>
  <div class="ra-m" data-k="wanting"><span class="ra-mk">Cue-triggered 'wanting'</span><span class="ra-bar" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="ra-mv"></span></div>
  <div class="ra-m" data-k="control"><span class="ra-mk">Prefrontal top-down control</span><span class="ra-bar" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="ra-mv"></span></div>
</div>
<p class="ra-legend"><svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true"><path d="M1 5H30" class="ra-sw-da"/><path d="M33 5l-6 -3.2v6.4z" class="ra-sw-head"/></svg> dopamine pathway &nbsp; <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="3.4" class="ra-sw-d2"/></svg> small circles on the accumbens: D2 receptor availability (illustrative markers)
 &nbsp; <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true"><path d="M1 5H30" class="ra-sw-glu"/><path d="M33 5l-6 -3.2v6.4z" class="ra-sw-head2"/></svg> other signalling (simplified)
 &nbsp; <span class="ra-muted">Pulse size and brightness, glow, and the five-step bars are qualitative illustrations of direction of change, not measured values.</span></p>
<p id="info" class="ra-info" aria-live="polite">Hover or focus any region or pathway for a short explanation. Press 'Show cue' to fire a cue, then watch the signal reach the accumbens.</p>`;

const sources = `<footer class="bio-sources">
<h2>What the figure shows, and how sure we are</h2>
<p><strong>This is one model, not settled fact.</strong> Addiction is multi-factorial: genes, development, environment, stress, mental health and social context all contribute (<a href="https://pubmed.ncbi.nlm.nih.gov/26276628/">Volkow &amp; Morales, Cell 2015</a>). The figure shows a leading neurobiological account, and says nothing about any individual person.</p>
<ul>
<li><strong>Drugs and natural rewards raise dopamine in the nucleus accumbens (animal data).</strong> In freely moving rats, drugs abused by humans increased extracellular dopamine, especially in the accumbens (<a href="https://pubmed.ncbi.nlm.nih.gov/2899326/">Di Chiara &amp; Imperato, PNAS 1988</a>); a food reward raised accumbens dopamine in rats too (<a href="https://pubmed.ncbi.nlm.nih.gov/3362036/">Hernandez &amp; Hoebel, Life Sci 1988</a>; see also <a href="https://pubmed.ncbi.nlm.nih.gov/16874930/">Wise, Phil Trans R Soc B 2006</a>). Midbrain dopamine neurons fire to salient, reward-related events (<a href="https://pubmed.ncbi.nlm.nih.gov/9054347/">Schultz, Dayan &amp; Montague, Science 1997</a>).</li>
<li><strong>Circuit layout (textbook-level).</strong> Midbrain dopamine neurons feed forebrain circuits including ventral and dorsal striatum and prefrontal cortex (<a href="https://pubmed.ncbi.nlm.nih.gov/16776597/">Hyman, Malenka &amp; Nestler, Annu Rev Neurosci 2006</a>). The addiction-cycle model gives the VTA and ventral striatum a focal role in binge/intoxication, and a network including orbitofrontal and prefrontal cortex, basolateral amygdala and hippocampus a role in preoccupation/craving, with disrupted prefrontal inhibitory control (<a href="https://pubmed.ncbi.nlm.nih.gov/19710631/">Koob &amp; Volkow, Neuropsychopharmacology 2010</a>).</li>
<li><strong>Lower D2 receptor availability (human PET, group comparisons).</strong> Cocaine abusers showed lower D2 availability than controls, still present 3-4 months after detoxification, with lower frontal metabolism (<a href="https://pubmed.ncbi.nlm.nih.gov/8101394/">Volkow et al., Synapse 1993</a>); methamphetamine abusers likewise (<a href="https://pubmed.ncbi.nlm.nih.gov/11729018/">Volkow et al., Am J Psychiatry 2001</a>). Reviewed in <a href="https://pubmed.ncbi.nlm.nih.gov/17998440/">Volkow et al., Arch Neurol 2007</a>. Cocaine-dependent subjects also released less striatal dopamine to a stimulant challenge and reported a smaller &lsquo;high&rsquo; (<a href="https://pubmed.ncbi.nlm.nih.gov/9126741/">Volkow et al., Nature 1997</a>). These are cross-sectional comparisons: they do not by themselves show whether the difference preceded or followed use, and the D2 signal was measured mainly in dorsal striatum, not the accumbens specifically.</li>
<li><strong>Blunted response to non-drug rewards.</strong> Repeated drug exposure is proposed to reduce sensitivity to non-drug rewards, weaken self-regulation and enhance reactivity to drug cues (<a href="https://pubmed.ncbi.nlm.nih.gov/26276628/">Volkow &amp; Morales, Cell 2015</a>). Supporting human data are modest: in one small study, mood did not track monetary reward in cannabis users and smokers as it did in non-smokers (<a href="https://pubmed.ncbi.nlm.nih.gov/19776653/">Martin-Soelch et al., Neuropsychobiology 2009</a>).</li>
<li><strong>Incentive-sensitization (a theory).</strong> Repeated use may make the dopamine system hypersensitive to drugs and drug-associated cues, sensitising &lsquo;wanting&rsquo; (incentive salience) separately from &lsquo;liking&rsquo; (<a href="https://pubmed.ncbi.nlm.nih.gov/8401595/">Robinson &amp; Berridge, Brain Res Rev 1993</a>; open questions in <a href="https://pubmed.ncbi.nlm.nih.gov/18640920/">Robinson &amp; Berridge, Phil Trans R Soc B 2008</a>). Note that this sits alongside the finding of a <em>blunted</em> dopamine response to a drug challenge in PET; how to reconcile a sensitised cue response with blunted reward and drug-evoked release is a model-level interpretation and remains debated.</li>
<li><strong>Prefrontal control.</strong> Imaging implicates prefrontal cortex in regulating limbic reward regions and in self-control, with disruption underlying compulsive taking (<a href="https://pubmed.ncbi.nlm.nih.gov/22011681/">Goldstein &amp; Volkow, Nat Rev Neurosci 2011</a>; Koob &amp; Volkow 2010 above).</li>
</ul>
<p><strong>What was simplified.</strong> Brain silhouette, region positions, sizes, route paths and all pulse speeds are illustrative. The amygdala and hippocampus lie lateral to the midline and are projected onto the cut plane; their routes to the VTA are shown as direct links but are indirect in reality. Two model states are hand-set qualitative levels (direction of change only); no number in the figure is a measurement. Many other systems (serotonin, opioid, glutamate, stress circuits, the extended amygdala and habenula) and the dorsal striatum are omitted. Cue and context inputs arrive by sensory routes not drawn.</p>
<p>For education only; this is not medical advice and does not describe any individual. Nothing here concerns doses, routes or how to use any substance. If you or someone you know is struggling with substance use, a local health service or helpline can help.</p>
</footer>`;

const script = `
const DATA = ${JSON.stringify({ routes: ROUTES })};
${MODEL_SRC}
const NS = "http://www.w3.org/2000/svg";
const svg = document.querySelector(".ra-fig");
const gPulse = svg.querySelector("#pulses");
const readout = document.querySelector("[data-readout]");
const pauseBtn = document.getElementById("pause");
const cueBtn = document.getElementById("cue-btn");
const btns = { first: document.getElementById("s-first"), after: document.getElementById("s-after") };
const info = document.getElementById("info");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (u) => u * u * (3 - 2 * u);
const mk = (name, attrs, parent) => { const el = document.createElementNS(NS, name); for (const k in attrs) el.setAttribute(k, attrs[k]); parent.appendChild(el); return el; };
const lens = {};
for (const k in DATA.routes) { const p = DATA.routes[k]; const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); lens[k] = c; }
function along(k, u) {
  const p = DATA.routes[k], c = lens[k], want = clamp(u) * c[c.length - 1];
  let i = 1; while (i < c.length - 1 && c[i] < want) i++;
  const f = (want - c[i - 1]) / ((c[i] - c[i - 1]) || 1);
  return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f];
}
const PULSE_KEYS = ["da", "meso", "pfc", "cueA", "ctxH", "amV", "hiV", "pfcBrake", "daCue"];
const ROUTE_OF = { pfcBrake: "pfc", daCue: "da" };
const pulses = {};
for (const k of PULSE_KEYS) {
  const g = mk("g", { class: "ra-pulse" }, gPulse);
  pulses[k] = { g, trail2: mk("circle", { class: "ra-pulse-trail" }, g), trail1: mk("circle", { class: "ra-pulse-trail" }, g), halo: mk("circle", { class: "ra-pulse-halo" }, g), dot: mk("circle", { class: "ra-pulse-dot" }, g) };
}
const el = (id) => svg.querySelector("#" + id);
const glows = { pfc: el("g-pfc"), nac: el("g-nac"), vta: el("g-vta"), amy: el("g-amy"), hip: el("g-hip") };
const d2 = [...svg.querySelectorAll(".ra-d2")];
const toks = { cue: el("tok-cue"), ctx: el("tok-ctx") };
const meters = {}; document.querySelectorAll(".ra-m").forEach((m) => { meters[m.dataset.k] = m; });
const NAMES = { d2: { lower: "lower", baseline: "baseline", higher: "higher" }, reward: { lower: "blunted", baseline: "baseline", higher: "higher" }, wanting: { lower: "lower", baseline: "baseline", higher: "sensitised (higher)" }, control: { lower: "weaker", baseline: "baseline", higher: "stronger" } };

let state = "first", target = model(state).level, cur = { ...target };
let playing = !reduce.matches, visible = true, frame = 0, last = 0, sim = 0, cueT = -1;
const CYCLE = 2800, TRAVEL = 1600;
const SEQ = [["cueA", 0, 900, "cue"], ["ctxH", 0, 900, "ctx"], ["amV", 900, 800, "amy"], ["hiV", 900, 800, "hip"], ["daCue", 1700, 1000, "wanting"], ["pfcBrake", 2700, 800, "control"]];
const CUE_END = 3700;
let shown = "";

function place(key, u, size, bright) {
  const p = pulses[key];
  if (u < 0 || u > 1) { p.g.style.opacity = 0; return; }
  const k = ROUTE_OF[key] || key;
  const [x, y] = along(k, u), [bx, by] = along(k, u - 0.035), [cx, cy] = along(k, u - 0.07);
  p.g.style.opacity = (u < 0.06 ? u / 0.06 : u > 0.94 ? (1 - u) / 0.06 : 1).toFixed(2);
  const r = 2 + size * 3.6;
  p.dot.setAttribute("cx", x.toFixed(1)); p.dot.setAttribute("cy", y.toFixed(1)); p.dot.setAttribute("r", r.toFixed(2));
  p.halo.setAttribute("cx", x.toFixed(1)); p.halo.setAttribute("cy", y.toFixed(1)); p.halo.setAttribute("r", (r + 2 + size * 6).toFixed(1));
  p.halo.style.opacity = (0.1 + bright * 0.5).toFixed(2);
  p.dot.style.opacity = (0.5 + bright * 0.5).toFixed(2);
  p.trail1.setAttribute("cx", bx.toFixed(1)); p.trail1.setAttribute("cy", by.toFixed(1)); p.trail1.setAttribute("r", (r * 0.68).toFixed(2));
  p.trail2.setAttribute("cx", cx.toFixed(1)); p.trail2.setAttribute("cy", cy.toFixed(1)); p.trail2.setAttribute("r", (r * 0.42).toFixed(2));
}
const arrive = (t, at, rise = 250, fall = 900) => (t < at - rise ? 0 : t < at ? (t - (at - rise)) / rise : Math.max(0, 1 - (t - at) / fall));

function draw(dt, still) {
  const f = dt >= 1000 ? 1 : 1 - Math.exp(-dt / 350);
  for (const k in cur) cur[k] += (target[k] - cur[k]) * f;
  const act = { pfc: 0, nac: 0, vta: 0, amy: 0, hip: 0 };
  let cueGlow = 0, ctxGlow = 0, daAmb = 0;
  const phase = (off) => (((sim + off) % CYCLE) / TRAVEL);
  const ua = still ? 0.52 : phase(0), up = still ? 0.55 : phase(CYCLE / 2), um = still ? 0.5 : phase(900);
  place("da", ua, cur.reward, cur.reward);
  place("pfc", up, cur.control, cur.control);
  place("meso", um, 0.45, 0.45);
  daAmb = ua > 0.92 && ua <= 1 ? cur.reward : 0;
  act.nac = 0.18 + 0.5 * arrive(((sim) % CYCLE), TRAVEL, 200, 800) * cur.reward;
  act.vta = 0.2;
  let cuing = cueT >= 0 && cueT < CUE_END;
  for (const [key] of SEQ) if (!cuing) place(key, -1, 0, 0);
  if (cuing) {
    for (const [key, t0, d, who] of SEQ) {
      const u = (cueT - t0) / d;
      const size = key === "daCue" ? cur.wanting : key === "pfcBrake" ? cur.control : 0.6;
      place(key, u, size, key === "daCue" ? cur.wanting : size);
    }
    cueGlow = arrive(cueT, 0, 1, 900) ; ctxGlow = cueGlow;
    act.amy = Math.max(act.amy, 0.9 * arrive(cueT, 900));
    act.hip = Math.max(act.hip, 0.9 * arrive(cueT, 900));
    act.vta = Math.max(act.vta, 0.9 * arrive(cueT, 1700));
    act.nac = Math.max(act.nac, 1.0 * cur.wanting * arrive(cueT, 2700, 250, 1100));
    act.pfc = Math.max(act.pfc, 0.9 * cur.control * arrive(cueT, 3500, 250, 700));
  }
  for (const k in glows) glows[k].style.opacity = clamp(act[k]).toFixed(2);
  toks.cue.style.setProperty("--on", (cuing ? 1 - clamp(cueT / 900) * 0.0 : 0).toFixed(2));
  toks.cue.classList.toggle("is-cue", cuing && cueT < 1800); toks.ctx.classList.toggle("is-cue", cuing && cueT < 1800);
  const m = model(state);
  d2.forEach((c, i) => c.classList.toggle("is-off", i >= Math.round(cur.d2 * D2_MARKERS)));
  for (const k in meters) {
    const segs = meters[k].querySelectorAll("i"), n = Math.round(cur[k] * 5);
    segs.forEach((s, i) => s.classList.toggle("on", i < n));
    const w = NAMES[k][model(state).words[k]];
    const t = meters[k].querySelector(".ra-mv"); if (t.textContent !== w) t.textContent = w;
  }
  const text = (state === "first" ? "first exposure" : "repeated exposure") + " · wanting " + (m.level.wanting > 0.6 ? "high" : "low") + " · control " + (m.level.control > 0.7 ? "high" : "lower") + (cuing ? " · cue" : "");
  if (text !== shown) { shown = text; readout.textContent = text; }
}

function tick(now) {
  frame = 0;
  if (!playing || !visible) return;
  const dt = Math.min(64, now - (last || now));
  last = now; sim += dt;
  if (cueT >= 0) { cueT += dt; if (cueT >= CUE_END) cueT = -1; }
  draw(dt, false);
  frame = requestAnimationFrame(tick);
}
function still() { draw(1000, !cueStill); }
let cueStill = false;
function start() { if (playing && visible && !frame) { last = 0; frame = requestAnimationFrame(tick); } }
function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; }
function setState(s) {
  state = s; target = model(s).level;
  for (const k in btns) btns[k].setAttribute("aria-pressed", String(k === s));
  if (!playing) { cur = { ...target }; still(); }
}
btns.first.addEventListener("click", () => setState("first"));
btns.after.addEventListener("click", () => setState("after"));
cueBtn.addEventListener("click", () => {
  if (reduce.matches && !playing) {
    cueStill = !cueStill;
    cueBtn.textContent = cueStill ? "Hide cue" : "Show cue";
    if (cueStill) { cueT = 3000; draw(1000, true); for (const k in glows) glows[k].style.opacity = k === "nac" ? cur.wanting.toFixed(2) : "0.8"; for (const [key] of SEQ) place(key, 0.5, key === "daCue" ? cur.wanting : 0.6, 0.8); toks.cue.classList.add("is-cue"); toks.ctx.classList.add("is-cue"); }
    else { cueT = -1; draw(1000, true); }
    return;
  }
  if (!playing) setPlaying(true);
  cueT = 0;
});
function setPlaying(v) {
  playing = v;
  pauseBtn.textContent = v ? "Pause motion" : "Play motion";
  pauseBtn.setAttribute("aria-pressed", String(!v));
  if (v) start(); else { stop(); still(); }
}
pauseBtn.addEventListener("click", () => setPlaying(!playing));
document.addEventListener("keydown", (e) => {
  if (e.target.closest("button, a, input, textarea, select")) return;
  if (e.code === "Space") { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === "1") setState("first"); else if (e.key === "2") setState("after");
});
reduce.addEventListener("change", () => setPlaying(!reduce.matches));
const idle = info.textContent;
svg.querySelectorAll(".hot").forEach((n) => {
  const on = () => { info.textContent = n.dataset.info; n.classList.add("is-hot"); };
  const off = () => { info.textContent = idle; n.classList.remove("is-hot"); };
  n.addEventListener("pointerenter", on); n.addEventListener("pointerleave", off);
  n.addEventListener("focus", on); n.addEventListener("blur", off);
});
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }).observe(svg);
if (reduce.matches) { pauseBtn.textContent = "Play motion"; pauseBtn.setAttribute("aria-pressed", "true"); }
window.__ra = { setState, fire: () => { if (!playing) setPlaying(true); cueT = 0; }, get cueT() { return cueT; }, setSim: (t) => { sim = t; } };
still();
start();
`;

const style = `
.ra-svg{padding:0}
.ra-fig{display:block;width:100%;height:auto}
.ra-fig .bio-blob-base{fill:var(--anatomy-shade-2)}
.ra-halo{fill:var(--anatomy-halo);opacity:var(--anatomy-halo-opacity);filter:blur(14px)}
.br-back{fill:var(--anatomy-shade-0);stroke:none}
.br-wall{stroke-width:.5;stroke-linejoin:round}
.br-wall[data-s="0"]{fill:var(--anatomy-shade-0);stroke:var(--anatomy-shade-0)}
.br-wall[data-s="1"]{fill:var(--anatomy-shade-1);stroke:var(--anatomy-shade-1)}
.br-wall[data-s="2"]{fill:var(--anatomy-shade-2);stroke:var(--anatomy-shade-2)}
.br-wall[data-s="3"]{fill:var(--anatomy-shade-3);stroke:var(--anatomy-shade-3)}
.br-cut{fill:var(--anatomy-shade-3);stroke:none}
.br-white{fill:var(--anatomy-top);stroke:none}
.ra-label{fill:var(--anatomy-text);font:11.5px var(--anatomy-mono);letter-spacing:.01em}
.ra-orient{fill:var(--anatomy-muted);font:11px var(--anatomy-mono);letter-spacing:.12em;text-transform:uppercase}
.ra-leader{fill:none;stroke:var(--anatomy-mid);stroke-width:.7}
.ra-dot{fill:var(--anatomy-dot)}
.ra-route{cursor:help;outline:none}
.ra-hit{fill:none;stroke:transparent;stroke-width:14}
.ra-line{fill:none;stroke-linecap:round}
.ra-dopa .ra-line{stroke:var(--anatomy-lit);stroke-width:2.2}
.ra-dopa.ra-thin .ra-line{stroke:var(--anatomy-hi);stroke-width:1.3}
.ra-dopa .ra-head{fill:var(--anatomy-lit)}
.ra-dopa.ra-thin .ra-head{fill:var(--anatomy-hi)}
.ra-glu .ra-line{stroke:var(--anatomy-hi);stroke-width:1.4;stroke-dasharray:5 4}
.ra-glu .ra-head{fill:var(--anatomy-hi)}
.ra-glow{fill:var(--anatomy-lit);filter:blur(7px);opacity:0;pointer-events:none}
.ra-d2{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1;transition:fill .3s,opacity .3s}
.ra-d2.is-off{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-dasharray:2 2}
.ra-tok-ring{fill:none;stroke:var(--anatomy-mid);stroke-width:.6}
.ra-token .ra-tok-body{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.3;transition:fill .25s}
.ra-token .ra-tok-glow{fill:var(--anatomy-lit);opacity:0;filter:blur(6px);transition:opacity .3s}
.ra-token.is-cue .ra-tok-body{fill:var(--anatomy-lit)}
.ra-token.is-cue .ra-tok-glow{opacity:.5}
.ra-pulse{pointer-events:none}
.ra-pulse-dot{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:.8}
.ra-pulse-halo{fill:var(--anatomy-lit)}
.ra-pulse-trail{fill:var(--anatomy-lit);opacity:.35}
.hot{cursor:help;outline:none}
.hot.is-hot{filter:drop-shadow(0 0 3px var(--anatomy-lit))}
.hot:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.ra-controls{display:flex;flex-wrap:wrap;gap:12px 14px;align-items:center;margin:14px 2px 6px;font:12.5px var(--anatomy-mono);color:var(--anatomy-text)}
.ra-controls button{border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:inherit;padding:7px 11px;cursor:pointer}
.ra-seg{display:inline-flex;flex-wrap:wrap}
.ra-seg button+button{border-left:0}
.ra-seg button[aria-pressed="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper);border-color:var(--anatomy-lit)}
.ra-act{border-color:var(--anatomy-mid)!important;color:var(--anatomy-strong)!important}
#pause{margin-left:auto}
.ra-controls :focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.ra-meters{display:grid;gap:5px;margin:12px 2px 6px;font:12px var(--anatomy-mono);color:var(--anatomy-text)}
.ra-m{display:grid;grid-template-columns:minmax(150px,260px) 90px 1fr;gap:10px;align-items:center}
.ra-bar{display:inline-flex;gap:3px}
.ra-bar i{width:15px;height:7px;border:1px solid var(--anatomy-mid);background:transparent;transition:background .3s}
.ra-bar i.on{background:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ra-mv{color:var(--anatomy-strong)}
.ra-legend{font:12px/1.6 var(--anatomy-mono);color:var(--anatomy-text);margin:8px 2px}
.ra-legend svg{vertical-align:-1px}
.ra-sw-d2{fill:var(--anatomy-lit);stroke:var(--anatomy-paper)}
.ra-muted{color:var(--anatomy-muted)}
.ra-sw-da{stroke:var(--anatomy-lit);stroke-width:2.2;fill:none}.ra-sw-head{fill:var(--anatomy-lit)}
.ra-sw-glu{stroke:var(--anatomy-hi);stroke-width:1.4;stroke-dasharray:5 4;fill:none}.ra-sw-head2{fill:var(--anatomy-hi)}
.ra-info{min-height:5.2em;font:12.5px/1.55 var(--anatomy-mono);color:var(--anatomy-strong);margin:8px 2px;border-left:2px solid var(--anatomy-faint);padding-left:10px}
.bio-sources{margin:20px 2px;color:var(--anatomy-muted);font-size:12.5px;line-height:1.65}
.bio-sources h2{font:600 13px var(--anatomy-mono);color:var(--anatomy-text);margin:0 0 8px}
.bio-sources ul{padding-left:18px}.bio-sources li{margin:6px 0}
.bio-sources a{color:var(--anatomy-text);text-underline-offset:2px}
@media (max-width:640px){.ra-m{grid-template-columns:1fr 90px;}.ra-mv{grid-column:1/-1}}
@media(prefers-reduced-motion:reduce){.ra-d2,.ra-token .ra-tok-body,.ra-token .ra-tok-glow,.ra-bar i{transition:none}}
`;

const html = pageHtml({
  title: "Reward Pathway and Addiction",
  theme: light ? "light" : "dark",
  width: WIDTH + 40,
  body: `<style>${BIO_CSS}${style}</style>${framed}${controls}${sources}`,
  script,
});
const filename = light ? "reward-addiction-light.html" : "reward-addiction.html";
writeFileSync(join(HERE, filename), html);
console.log(`wrote ${filename}`);
