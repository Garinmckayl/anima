import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIO_CSS, blobOf, blobSvg, membraneOf, membraneSvg } from "../../kit/blob.mjs";
import { fitProjection, figureSvg, iso, pageHtml, plateHtml } from "../../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");
const WIDTH = 1000;
const HEIGHT = 730;
const HEAD = 190;

function model(drug) {
  const table = {
    none: {
      datMode: "uptake", extracellular: "baseline", vesicleStore: "stocked", cytosolicDA: "normal",
      sim: { releaseEvery: 2.0, perRelease: 3, leakEvery: 0, drugEvery: 0, drugCap: 0 },
      status: "DAT: reuptake in  ·  VMAT2: refills vesicles  ·  vesicular release",
      summary: "No drug. Dopamine released from a vesicle diffuses across the cleft, reaches receptors, and is cleared mainly by DAT carrying it back into the terminal, where VMAT2 can repackage it into vesicles.",
    },
    cocaine: {
      datMode: "blocked", extracellular: "raised", vesicleStore: "stocked", cytosolicDA: "normal",
      sim: { releaseEvery: 2.0, perRelease: 3, leakEvery: 0, drugEvery: 0.9, drugCap: 4 },
      status: "DAT: blocked by cocaine  ·  release unchanged  ·  dopamine lingers",
      summary: "Cocaine binds DAT and blocks reuptake. Vesicular release carries on as before, but released dopamine is no longer cleared by DAT, so it lingers in the cleft and spreads.",
    },
    amphetamine: {
      datMode: "efflux", extracellular: "raised (release-driven)", vesicleStore: "depleted", cytosolicDA: "raised",
      sim: { releaseEvery: 5.5, perRelease: 3, leakEvery: 0.45, drugEvery: 2.4, drugCap: 3 },
      status: "DAT: carries amphetamine in, runs in reverse  ·  VMAT2: vesicles leak",
      summary: "Amphetamine is a DAT substrate: it is carried into the terminal and disrupts vesicular storage through VMAT2, so dopamine builds up in the cytosol. DAT then runs in reverse and moves that dopamine out into the cleft (efflux) without a vesicle fusing. TAAR1 signalling also contributes (not drawn).",
    },
  };
  const m = table[drug] || table.none;
  return { drug, ...m, readout: "extracellular dopamine: " + m.extracellular };
}

const ZPRE = 33;
const ZPOST = 0;
const MEM = 2.6;
const TERM = { a: 92, top: 118, p: 0.65 };
const termRing = (inset, n = 72) => {
  const zb = ZPRE + inset;
  const zt = TERM.top - inset;
  const a = TERM.a - inset;
  const zc = zb + 6;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const sg = (v) => Math.sign(v) * Math.abs(v) ** TERM.p;
    return [a * sg(c), 0, s >= 0 ? zc + (zt - zc) * sg(s) : zc - 6 * Math.abs(s) ** TERM.p];
  });
};
const postRing = (inset, n = 72) => {
  const a = 112 - inset;
  const zc = -15;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const sg = (v, p) => Math.sign(v) * Math.abs(v) ** p;
    return [a * sg(c, 0.3), 0, zc + (15 - inset) * sg(s, 0.3)];
  });
};
const circle = (cx, cz, r, n = 22) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, 0, cz + Math.sin((i / n) * Math.PI * 2) * r]);

const VR = 9;
const VES = [
  { x: 0, z: 45.5, vm: [160, 20], dock: true },
  { x: -62, z: 62, vm: [100, 300] },
  { x: -30, z: 90, vm: [120, 300] },
  { x: 28, z: 84, vm: [60, 240] },
  { x: 58, z: 58, vm: [0, 100] },
  { x: -16, z: 66, vm: [90, 230] },
  { x: 4, z: 104, vm: [200, 340] },
  { x: -68, z: 92, vm: [150, 330] },
  { x: 70, z: 92, vm: [40, 220] },
];
const DATX = [-74, -38, 38, 74];
const RECX = [-62, -36, -12, 12, 36, 62];

const bounds = [[-160, 0, -40], [160, 0, 124], [0, 0, -50]];
const P = fitProjection(bounds, WIDTH, HEIGHT, { pad: 12, headroom: HEAD, azimuth: 90, elevation: 12 });
const S = (x, z) => iso([x, 0, z], P).map((v) => +v.toFixed(1));
const KX = S(1, 0)[0] - S(0, 0)[0];
const KZ = S(0, 1)[1] - S(0, 0)[1];

const post = blobOf(postRing(0), P, { tone: "mid", id: "post-body", highlight: 0.9, shade: 0.94 });
const postMem = membraneOf(postRing(-0.2), postRing(MEM), P, { tone: "mid" });
const term = blobOf(termRing(MEM), P, { tone: "hi", id: "term-body", highlight: 0.86, shade: 0.93 });
const termMem = membraneOf(termRing(0), termRing(MEM), P, { tone: "hi" });
const vesicles = VES.map((v, i) => blobOf(circle(v.x, v.z, VR), P, { tone: "lit", id: `ves-${i}`, highlight: 0.78, shade: 0.9 }));

const f1 = (v) => +v.toFixed(1);
const rectAt = (x0, z0, x1, z1) => {
  const [a, b] = [S(x0, z0), S(x1, z1)];
  return `M${a[0]} ${a[1]}H${b[0]}V${b[1]}H${a[0]}Z`;
};
const arrow = (x0, z0, x1, z1, cls) => {
  const [a, b] = [S(x0, z0), S(x1, z1)];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L;
  const uy = (b[1] - a[1]) / L;
  const h = 5.5;
  const w = 3.4;
  const hx = b[0] - ux * h;
  const hy = b[1] - uy * h;
  return `<path class="${cls}" d="M${a[0]} ${a[1]}L${f1(hx)} ${f1(hy)}M${b[0]} ${b[1]}L${f1(hx - uy * w)} ${f1(hy + ux * w)}M${b[0]} ${b[1]}L${f1(hx + uy * w)} ${f1(hy - ux * w)}"/>`;
};
const polar = (v, deg, r) => [v.x + Math.cos((deg * Math.PI) / 180) * r, v.z + Math.sin((deg * Math.PI) / 180) * r];

const vmat = (v, deg) => {
  const [x, z] = polar(v, deg, VR);
  const [sx, sy] = S(x, z);
  const phi = (Math.atan2(-Math.sin((deg * Math.PI) / 180) * Math.abs(KZ), Math.cos((deg * Math.PI) / 180) * KX) * 180) / Math.PI;
  return `<rect class="sd-vmat" x="-4.6" y="-8" width="9.2" height="16" rx="3.6" transform="translate(${sx} ${sy}) rotate(${f1(phi - 90)})"/>`;
};
const vesDots = (v, i) => {
  const offs = [[-3.6, 1.2], [3.2, 2.4], [0, -3.8], [-1.6, 4.6], [4.6, -2.2]];
  return offs.map((o, k) => {
    const [x, y] = S(v.x + o[0], v.z + o[1] * 0.9);
    return `<circle class="sd-vdot${k >= 2 && k <= 4 ? " d-lose" : ""}${v.dock ? " d-dock" : ""}" cx="${x}" cy="${y}" r="2.5"/>`;
  }).join("");
};

const DAT_Z0 = ZPRE - 3.4;
const DAT_Z1 = ZPRE + MEM + 3.4;
const dat = (xd) => {
  const half = (xa, xb) => {
    const [a, b] = [S(xa, DAT_Z1), S(xb, DAT_Z0)];
    return `<rect class="sd-dat-half" x="${a[0]}" y="${a[1]}" width="${f1(b[0] - a[0])}" height="${f1(b[1] - a[1])}" rx="3.4"/>`;
  };
  return `<g class="sd-dat">${half(xd - 5, xd - 1.4)}${half(xd + 1.4, xd + 5)}</g>`;
};
const gapPath = (xd) => rectAt(xd - 1.4, DAT_Z1 - 0.4, xd + 1.4, DAT_Z0 + 0.4);

const receptor = (xr, i) => {
  const [a, b] = [S(xr, ZPOST + 0.4), S(xr, ZPOST + 8)];
  const [h] = [S(xr, ZPOST + 9.2)];
  return `<g class="sd-rec" data-slot="${i}"><path class="sd-rec-stalk" d="M${a[0]} ${a[1]}V${b[1]}"/><ellipse class="sd-rec-head" cx="${h[0]}" cy="${h[1]}" rx="6.4" ry="5"/></g>`;
};

const MOLS = {
  dopamine: { name: "dopamine", cid: 681, A: [["O", 4.269, 2.405, 1], ["O", 2.537, 1.405, 1], ["N", 6.867, -2.095, 2], ["C", 6.001, -0.595, 2], ["C", 5.135, -0.095, 0], ["C", 6.001, -1.595, 2], ["C", 5.135, 0.905, 1], ["C", 4.269, -0.595, 1], ["C", 4.269, 1.405, 0], ["C", 3.403, -0.095, 1], ["C", 3.403, 0.905, 0]], B: [[0, 8, 1, 0], [1, 10, 1, 0], [2, 5, 1, 0], [3, 4, 1, 0], [3, 5, 1, 0], [4, 6, 2, 0], [4, 7, 1, 0], [6, 8, 1, 0], [7, 9, 2, 0], [8, 10, 2, 0], [9, 10, 1, 0]], formula: "C8H11NO2" },
  cocaine: { name: "cocaine", cid: 446220, A: [["O", 5.585, -0.359, 0], ["O", 6.541, -2.105, 0], ["O", 8.272, -2.045, 0], ["O", 4.993, 1.269, 0], ["N", 8.097, 2.238, 0], ["C", 8.575, 0.29, 0], ["C", 8.834, 1.256, 0], ["C", 7.354, -0.576, 1], ["C", 9.974, -0.219, 2], ["C", 10.233, 0.747, 2], ["C", 6.801, 0.945, 2], ["C", 6.525, -0.017, 1], ["C", 7.597, 3.104, 3], ["C", 7.389, -1.575, 0], ["C", 4.819, 0.284, 0], ["C", 6.576, -3.104, 3], ["C", 3.879, -0.058, 0], ["C", 3.706, -1.043, 1], ["C", 3.113, 0.585, 1], ["C", 2.766, -1.385, 1], ["C", 2.174, 0.243, 1], ["C", 2, -0.742, 1], ["H", 8.355, -0.531, 0], ["H", 9.054, 2.077, 0]], B: [[11, 0, 1, 1], [0, 14, 1, 0], [1, 13, 1, 0], [1, 15, 1, 0], [2, 13, 2, 0], [3, 14, 2, 0], [4, 5, 1, 0], [4, 6, 1, 0], [4, 12, 1, 0], [5, 7, 1, 0], [5, 8, 1, 0], [5, 22, 1, 1], [6, 9, 1, 0], [6, 10, 1, 0], [6, 23, 1, 6], [7, 11, 1, 0], [7, 13, 1, 1], [8, 9, 1, 0], [10, 11, 1, 0], [14, 16, 1, 0], [16, 17, 2, 0], [16, 18, 1, 0], [17, 19, 1, 0], [18, 20, 2, 0], [19, 21, 2, 0], [20, 21, 1, 0]], formula: "C17H21NO4" },
  amphetamine: { name: "amphetamine", cid: 3007, A: [["N", 3.732, 2.095, 2], ["C", 3.732, 1.095, 1], ["C", 2.866, 0.595, 2], ["C", 2.866, -0.405, 0], ["C", 4.598, 0.595, 3], ["C", 2, -0.905, 1], ["C", 3.732, -0.905, 1], ["C", 2, -1.905, 1], ["C", 3.732, -1.905, 1], ["C", 2.866, -2.405, 1]], B: [[0, 1, 1, 0], [1, 2, 1, 0], [1, 4, 1, 0], [2, 3, 1, 0], [3, 5, 2, 0], [3, 6, 1, 0], [5, 7, 1, 0], [6, 8, 2, 0], [7, 9, 2, 0], [8, 9, 1, 0]], formula: "C9H13N" },
};
for (const m of Object.values(MOLS)) {
  const cnt = { C: 0, N: 0, O: 0, H: 0 };
  for (const [e, , , h] of m.A) { cnt[e] += 1; if (e !== "H") cnt.H += h; }
  const want = { C: 0, N: 0, O: 0, H: 0 };
  for (const x of m.formula.matchAll(/([A-Z])(\d*)/g)) want[x[1]] = +(x[2] || 1);
  if (Object.keys(cnt).some((k) => cnt[k] !== want[k])) throw new Error(`formula check failed for ${m.name}: ${JSON.stringify(cnt)} vs ${m.formula}`);
}

const U = 21;
function molSvg(m, cx, cy) {
  const xs = m.A.map((a) => a[1]);
  const ys = m.A.map((a) => a[2]);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const pos = m.A.map((a) => [cx + (a[1] - mx) * U, cy - (a[2] - my) * U]);
  const label = m.A.map((a) => {
    if (a[0] === "C") return null;
    if (a[0] === "H") return "H";
    const h = a[3];
    return a[0] + (h === 1 ? "H" : h === 2 ? "H₂" : h === 3 ? "H₃" : "");
  });
  const gap = label.map((t) => (t ? (t.length > 2 ? 14 : t.length > 1 ? 11 : 8) : 0));
  const nbrs = m.A.map(() => []);
  for (const [a, b] of m.B) { nbrs[a].push(b); nbrs[b].push(a); }
  const ringCentroid = (a, b) => {
    const prev = new Map([[a, -1]]);
    const q = [a];
    while (q.length) {
      const u = q.shift();
      for (const v of nbrs[u]) {
        if (u === a && v === b) continue;
        if (!prev.has(v)) { prev.set(v, u); q.push(v); }
      }
    }
    if (!prev.has(b)) return null;
    const path = [];
    for (let u = b; u !== -1; u = prev.get(u)) path.push(u);
    if (path.length > 6) return null;
    return path.reduce((s, i) => [s[0] + pos[i][0] / path.length, s[1] + pos[i][1] / path.length], [0, 0]);
  };
  let out = "";
  const seg = (p, q, ga, gb) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const ux = (q[0] - p[0]) / L;
    const uy = (q[1] - p[1]) / L;
    return [[p[0] + ux * ga, p[1] + uy * ga], [q[0] - ux * gb, q[1] - uy * gb]];
  };
  for (const [a, b, order, stereo] of m.B) {
    const [p, q] = [pos[a], pos[b]];
    const [s, e] = seg(p, q, gap[a], gap[b]);
    const L = Math.hypot(e[0] - s[0], e[1] - s[1]);
    const ux = (e[0] - s[0]) / L;
    const uy = (e[1] - s[1]) / L;
    const nx = -uy;
    const ny = ux;
    if (stereo === 1) {
      out += `<path class="sd-wedge" d="M${f1(s[0])} ${f1(s[1])}L${f1(e[0] + nx * 3.2)} ${f1(e[1] + ny * 3.2)}L${f1(e[0] - nx * 3.2)} ${f1(e[1] - ny * 3.2)}Z"/>`;
    } else if (stereo === 6) {
      let d = "";
      for (let k = 1; k <= 6; k++) {
        const t = k / 6.5;
        const w = 3.4 * t;
        const c = [s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t];
        d += `M${f1(c[0] + nx * w)} ${f1(c[1] + ny * w)}L${f1(c[0] - nx * w)} ${f1(c[1] - ny * w)}`;
      }
      out += `<path class="sd-bond" d="${d}"/>`;
    } else if (order === 1) {
      out += `<path class="sd-bond" d="M${f1(s[0])} ${f1(s[1])}L${f1(e[0])} ${f1(e[1])}"/>`;
    } else {
      const rc = ringCentroid(a, b);
      if (rc) {
        out += `<path class="sd-bond" d="M${f1(s[0])} ${f1(s[1])}L${f1(e[0])} ${f1(e[1])}"/>`;
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const side = Math.sign((rc[0] - mid[0]) * nx + (rc[1] - mid[1]) * ny) || 1;
        const off = 4.6;
        const sh = Math.min(5.5, L * 0.16);
        const ia = [s[0] + ux * sh + nx * off * side, s[1] + uy * sh + ny * off * side];
        const ib = [e[0] - ux * sh + nx * off * side, e[1] - uy * sh + ny * off * side];
        out += `<path class="sd-bond" d="M${f1(ia[0])} ${f1(ia[1])}L${f1(ib[0])} ${f1(ib[1])}"/>`;
      } else {
        const o = 2.3;
        out += `<path class="sd-bond" d="M${f1(s[0] + nx * o)} ${f1(s[1] + ny * o)}L${f1(e[0] + nx * o)} ${f1(e[1] + ny * o)}M${f1(s[0] - nx * o)} ${f1(s[1] - ny * o)}L${f1(e[0] - nx * o)} ${f1(e[1] - ny * o)}"/>`;
      }
    }
  }
  m.A.forEach((a, i) => {
    if (label[i]) out += `<text class="sd-atom" x="${f1(pos[i][0])}" y="${f1(pos[i][1] + 4.6)}" text-anchor="middle">${label[i]}</text>`;
  });
  const bx = Math.min(...pos.map((p) => p[0]));
  const bx2 = Math.max(...pos.map((p) => p[0]));
  const by2 = Math.max(...pos.map((p) => p[1]));
  return { svg: out, mid: (bx + bx2) / 2, bottom: by2 };
}
const MOLY = 78;
const molCol = { dopamine: 165, cocaine: 500, amphetamine: 840 };
const molInfo = {
  dopamine: "Dopamine (PubChem CID 681, C8H11NO2): the catecholamine neurotransmitter stored in the vesicles and carried by DAT. Skeletal formula flat, from the PubChem 2D depiction.",
  cocaine: "Cocaine (PubChem CID 446220, C17H21NO4): in crystal structures of a Drosophila dopamine transporter, cocaine and its analogues sit in DAT's central binding site, and cocaine blocks reuptake (Wang et al. 2015; Sulzer 2011). Wedges and hashes are as drawn by PubChem.",
  amphetamine: "Amphetamine (PubChem CID 3007, C9H13N; the record has no stereochemistry, so both enantiomers are covered). A DAT substrate: it is transported into the terminal, disrupts vesicular storage and drives DAT efflux (Sulzer 2005; Khoshbouei 2003).",
};
const markers = {
  dopamine: (x, y) => `<circle class="sd-k-da" cx="${x}" cy="${y}" r="5"/>`,
  cocaine: (x, y) => `<rect class="sd-k-coc" x="${x - 4.6}" y="${y - 4.6}" width="9.2" height="9.2"/>`,
  amphetamine: (x, y) => `<path class="sd-k-amp" d="M${x} ${y - 5.8}L${x + 5.6} ${y + 4}H${x - 5.6}Z"/>`,
};
const chem = Object.keys(MOLS).map((k) => {
  const r = molSvg(MOLS[k], molCol[k], MOLY + 8);
  const nameY = 178;
  const nameW = (MOLS[k].name.length + 5) * 7;
  return `<g class="sd-mol hot" id="mol-${k}" data-mol="${k}" tabindex="0" role="img" aria-label="Skeletal formula of ${MOLS[k].name}" data-info="${molInfo[k].replace(/"/g, "&quot;")}">${r.svg}<g class="sd-molname">${markers[k](molCol[k] - nameW / 2 + 6, nameY - 4)}<text class="sd-label sd-name" x="${molCol[k] - nameW / 2 + 18}" y="${nameY}">${MOLS[k].name}</text></g></g>`;
}).join("");

const dotAt = (x, z) => { const p = S(x, z); return `<circle class="sd-dot" cx="${p[0]}" cy="${p[1]}" r="2.1"/>`; };
function label(lines, px, pz, tx, tz, anchor) {
  const p = S(px, pz);
  const t = S(tx, tz);
  const arr = Array.isArray(lines) ? lines : [lines];
  const ex = t[0] + (anchor === "end" ? 4 : -4);
  const ey = t[1] - 4;
  const text = arr.map((s, i) => `<tspan x="${t[0]}" dy="${i ? 14 : 0}">${s}</tspan>`).join("");
  return `<path class="sd-leader" d="M${p[0]} ${p[1]}L${ex} ${f1(ey)}"/>${dotAt(px, pz)}<text class="sd-label" x="${t[0]}" y="${t[1]}" text-anchor="${anchor}">${text}</text>`;
}

const cleftTop = S(-118, ZPRE);
const cleftBot = S(118, ZPOST);
const gradId = "sd-cleft-grad";
const defs = `<defs><linearGradient id="${gradId}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--anatomy-shade-1);stop-opacity:0"/><stop offset=".14" style="stop-color:var(--anatomy-shade-1);stop-opacity:.9"/><stop offset=".86" style="stop-color:var(--anatomy-shade-1);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--anatomy-shade-1);stop-opacity:0"/></linearGradient></defs>`;
const sv = (s) => s.replace(/"/g, "&quot;");

const info = {
  cleft: "Synaptic cleft (schematic; the real gap is much narrower relative to a vesicle). Released dopamine crosses it by diffusion. Many dopamine receptors are extrasynaptic, and DAT mainly shapes how far dopamine spreads and how long it lasts (Cragg & Rice 2004).",
  vesicle: "Synaptic vesicle: stores dopamine inside the terminal. Dopamine reaches the cleft when a vesicle fuses with the membrane (exocytosis). The vesicle at the release site pulses when it releases.",
  vmat: "VMAT2 (vesicular monoamine transporter 2) in the vesicle membrane: loads cytosolic dopamine into vesicles. Amphetamine redistributes dopamine from vesicles to the cytosol (Sulzer 2005); VMAT2 is one of its principal targets (Fleckenstein 2007).",
  dat: "DAT (dopamine transporter) in the plasma membrane: clears dopamine from the cleft back into the terminal. Mice lacking DAT keep dopamine in the extracellular space at least 100 times longer (Giros 1996). Cocaine blocks DAT; amphetamine is carried by it and drives efflux through it.",
  term: "Presynaptic terminal of a dopamine neuron (axon bouton), cut open. Membrane drawn as a lipid bilayer, schematic. Contains vesicles with VMAT2 and, in the plasma membrane, DAT.",
  postsyn: "Postsynaptic cell membrane, with receptors that dopamine binds. Schematic: the receptor glyphs only mark where dopamine acts, not receptor subtype or number.",
  rec: "Dopamine receptors on the postsynaptic membrane (schematic glyphs). A receptor lights up when dopamine is close. Many are extrasynaptic (Cragg & Rice 2004).",
};

const body = [
  defs,
  `<ellipse class="sd-halo" cx="${S(0, -32)[0]}" cy="${S(0, -46)[1]}" rx="360" ry="22"/>`,
  `<g id="post" class="hot" tabindex="0" data-info="${sv(info.postsyn)}">${blobSvg(post)}${membraneSvg(postMem)}</g>`,
  `<g id="cleft" class="hot" tabindex="0" data-info="${sv(info.cleft)}"><path class="sd-cleft" d="${rectAt(-118, ZPRE, 118, ZPOST)}" fill="url(#${gradId})"/></g>`,
  `<g id="rec" class="hot" tabindex="0" data-info="${sv(info.rec)}">${RECX.map(receptor).join("")}</g>`,
  `<g id="term" class="hot" tabindex="0" data-info="${sv(info.term)}">${blobSvg(term)}${membraneSvg(termMem)}</g>`,
  `<g id="vesicles" class="hot" tabindex="0" data-info="${sv(info.vesicle)}">${VES.map((v, i) => `<g class="sd-ves${v.dock ? " sd-dock" : ""}">${blobSvg(vesicles[i])}${vesDots(v, i)}</g>`).join("")}</g>`,
  `<circle id="pore" class="sd-pore" cx="${S(0, ZPRE + MEM)[0]}" cy="${S(0, ZPRE + MEM)[1]}" r="5"/>`,
  `<g id="vmat" class="hot" tabindex="0" data-info="${sv(info.vmat)}">${VES.map((v) => v.vm.map((d) => vmat(v, d)).join("")).join("")}</g>`,
  `<g id="dat" class="hot" tabindex="0" data-info="${sv(info.dat)}">${DATX.map(dat).join("")}</g>`,
  DATX.map((x) => `<g class="sd-state">${arrow(x, ZPRE + 5.5, x, ZPRE + 17.5, "sd-a sd-a-up")}${arrow(x, ZPRE + 17.5, x, ZPRE + 5.5, "sd-a sd-a-down")}<path class="sd-a sd-a-x" d="M${S(x - 3.6, ZPRE + 8.2)[0]} ${S(x - 3.6, ZPRE + 8.2)[1]}L${S(x + 3.6, ZPRE + 15.2)[0]} ${S(x + 3.6, ZPRE + 15.2)[1]}M${S(x + 3.6, ZPRE + 8.2)[0]} ${S(x + 3.6, ZPRE + 8.2)[1]}L${S(x - 3.6, ZPRE + 15.2)[0]} ${S(x - 3.6, ZPRE + 15.2)[1]}"/></g>`).join(""),
  VES.map((v) => {
    const d = v.vm[0];
    const a = polar(v, d, VR + 8.6);
    const b = polar(v, d, VR + 2.4);
    return `${arrow(a[0], a[1], b[0], b[1], "sd-a sd-vm-in")}${arrow(b[0], b[1], a[0], a[1], "sd-a sd-vm-out")}`;
  }).join(""),
  `<g id="particles"></g>`,
  label(["presynaptic", "terminal"], -91.4, 100, -118, 108, "end"),
  label(["synaptic vesicle", "(holds dopamine)"], -71, 62, -118, 70, "end"),
  label("VMAT2", ...polar(VES[1], 100, VR + 1), -118, 92 - 4, "end"),
  label(["synaptic cleft", "(schematic gap)"], -104, 17, -118, 17, "end"),
  label(["postsynaptic", "cell"], -108, -12, -124, -10, "end"),
  label("plasma membrane", 91.4, 66, 108, 100, "start"),
  label(["dopamine", "transporter (DAT)"], 78.6, ZPRE + 0.6, 108, 33, "start"),
  label(["dopamine", "receptors"], 62 + 6, ZPOST + 9.2, 108, 3, "start"),
  `<text id="status" class="sd-status" x="${S(0, -44)[0]}" y="${S(0, -44)[1]}" text-anchor="middle"></text>`,
  chem,
].join("");

const svg = figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "Schematic cutaway of a presynaptic dopamine terminal, synaptic cleft and postsynaptic membrane, with synaptic vesicles carrying VMAT2, the dopamine transporter DAT in the plasma membrane and dopamine receptors on the postsynaptic cell. Skeletal formulas of dopamine, cocaine and amphetamine are shown above. A selector switches between no drug, cocaine blocking DAT reuptake, and amphetamine entering the terminal, disrupting vesicle storage and driving reverse transport.",
  body,
  className: "sd-fig",
});

const framed = plateHtml({
  fig: "Fig 1",
  title: "DAT: cocaine vs amphetamine",
  hint: "hover or focus a part · space: pause",
  readout: model("none").readout,
  caption: "Mechanism of action only. Schematic cutaway of one dopamine terminal, not to scale; particle numbers and speeds are illustrative, not measured. Shapes in the legend mark dopamine, cocaine and amphetamine.",
  body: `<div class="sd-svg">${svg}</div>`,
});

const controls = `
<div class="sd-controls">
  <fieldset class="sd-drug" role="radiogroup" aria-label="Drug state">
    <legend>Drug state</legend>
    <label><input type="radio" name="drug" value="none" checked> <span>NONE</span></label>
    <label><input type="radio" name="drug" value="cocaine"> <span>COCAINE</span></label>
    <label><input type="radio" name="drug" value="amphetamine"> <span>AMPHETAMINE</span></label>
  </fieldset>
  <button id="pause" type="button" aria-pressed="false">Pause motion</button>
</div>
<p class="sd-legend">
 <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" class="sd-k-da"/></svg> dopamine
 &nbsp; <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.4" y="2.4" width="9.2" height="9.2" class="sd-k-coc"/></svg> cocaine
 &nbsp; <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.2L12.6 11H1.4Z" class="sd-k-amp"/></svg> amphetamine
 &nbsp; <span class="sd-muted">arrows at DAT: in = reuptake, cross = blocked, out = efflux</span></p>
<p id="summary" class="sd-summary" aria-live="polite"></p>
<p id="info" class="sd-info" aria-live="polite">Hover or focus a labelled part for a one-line explanation.</p>`;

const sources = `<footer class="bio-sources">
<h2>What the figure shows, and how sure we are</h2>
<p><strong>Educational mechanism-of-action explainer only.</strong> It is not medical advice, and it says nothing about risk, use, dose, route or effects of any substance, or about any person. It shows no numbers beyond the one cited below.</p>
<ul>
<li><strong>DAT is the main route that clears released dopamine, and the target of both drugs.</strong> In mice lacking DAT, dopamine persists at least 100 times longer in the extracellular space, and cocaine and amphetamine have no effect on locomotor activity or dopamine release and uptake (<a href="https://pubmed.ncbi.nlm.nih.gov/8628395/">Giros et al., Nature 1996</a>, mouse). DAT competes with diffusion: it mostly sets the reach and lifetime of dopamine beyond a release site, and many receptors are extrasynaptic (<a href="https://pubmed.ncbi.nlm.nih.gov/15111009/">Cragg &amp; Rice, Trends Neurosci 2004</a>, review and model).</li>
<li><strong>Cocaine blocks reuptake.</strong> Blockade of dopamine reuptake is one way addictive drugs raise synaptic dopamine (<a href="https://pubmed.ncbi.nlm.nih.gov/21338876/">Sulzer, Neuron 2011</a>, review). Crystal structures of Drosophila DAT show cocaine and analogues bound at the central site, while substrates (dopamine, amphetamines) bind the same site in a different conformation (<a href="https://pubmed.ncbi.nlm.nih.gov/25970245/">Wang, Penmatsa &amp; Gouaux, Nature 2015</a>; Drosophila protein, not human).</li>
<li><strong>Amphetamine: substrate, vesicle disruption, efflux.</strong> Two primary mechanisms: redistribution of catecholamines from vesicles to the cytosol, and reverse transport through plasma-membrane carriers; uptake inhibition and other effects are additional (<a href="https://pubmed.ncbi.nlm.nih.gov/15955613/">Sulzer et al., Prog Neurobiol 2005</a>, review). Amphetamine binds DAT and is transported in, which raises intracellular Na+ availability and enhances reverse transport of dopamine; cocaine blocked the amphetamine-induced DAT currents in these cells (<a href="https://pubmed.ncbi.nlm.nih.gov/12556446/">Khoshbouei et al., J Biol Chem 2003</a>, HEK-293 cells expressing human DAT). DAT is needed for amphetamine&rsquo;s releasing action but not for its vesicle-depleting action, and stimulated vesicular release disappears after amphetamine (<a href="https://pubmed.ncbi.nlm.nih.gov/9482784/">Jones et al., J Neurosci 1998</a>, mouse striatal slices). DAT and VMAT2 are two principal targets of amphetamine (<a href="https://pubmed.ncbi.nlm.nih.gov/17209801/">Fleckenstein et al., Annu Rev Pharmacol Toxicol 2007</a>, review). TAAR1, a receptor activated by amphetamine-related drugs, modulates DAT uptake and efflux in cell assays (<a href="https://pubmed.ncbi.nlm.nih.gov/17234899/">Xie &amp; Miller, J Pharmacol Exp Ther 2007</a>, HEK-293 cells, rhesus TAAR1); it is named here but not drawn.</li>
<li><strong>Structures.</strong> Skeletal formulas are flat redrawings of the PubChem 2D depictions, with the heavy-atom and hydrogen counts checked against the PubChem molecular formulas: <a href="https://pubchem.ncbi.nlm.nih.gov/compound/681">dopamine CID 681</a> (C8H11NO2), <a href="https://pubchem.ncbi.nlm.nih.gov/compound/446220">cocaine CID 446220</a> (C17H21NO4), <a href="https://pubchem.ncbi.nlm.nih.gov/compound/3007">amphetamine CID 3007</a> (C9H13N, no stereochemistry given).</li>
</ul>
<p><strong>What was simplified.</strong> One terminal and one cleft stand for a dopamine synapse; sizes, the cleft width, numbers of vesicles, DAT and receptors, and every particle speed and rate are illustrative. Many dopamine neurons release dopamine from non-synaptic sites, which the cut ignores. Amphetamine&rsquo;s weak-base and other actions, synthesis and metabolism, autoreceptors and downstream signalling are omitted. Vesicles are drawn with fewer dopamine dots and reduced exocytosis after amphetamine to stand for depleted storage; the figure gives no amounts. Cocaine is shown at DAT only. DAT work above mixes mouse, fly and cultured-cell systems; the schematic is not a claim about any one species. The Giros and Jones records were checked at abstract level (Europe PMC); full texts were not read.</p>
</footer>`;

const DATA = {
  map: { ox: S(0, 0)[0], oy: S(0, 0)[1], kx: KX, kz: KZ },
  term: { a: TERM.a, zb: ZPRE + MEM, zc: ZPRE + MEM + 6, bt: TERM.top - MEM - (ZPRE + MEM + 6), q: 2 / TERM.p },
  ves: VES.map((v) => ({ x: v.x, z: v.z, dock: !!v.dock, vm: v.vm.map((d) => polar(v, d, VR + 2.4)) })),
  datx: DATX,
  recx: RECX,
  vr: VR,
  zpre: ZPRE,
  zpost: ZPOST,
  zmem: MEM,
};

const script = `
const DATA = ${JSON.stringify(DATA)};
const model = ${model.toString()};
const NS = "http://www.w3.org/2000/svg";
const svg = document.querySelector(".sd-fig");
const gP = svg.querySelector("#particles");
const statusEl = svg.querySelector("#status");
const pore = svg.querySelector("#pore");
const dockDots = [...svg.querySelectorAll(".d-dock")];
const recs = [...svg.querySelectorAll(".sd-rec")];
const readout = document.querySelector("[data-readout]");
const summary = document.getElementById("summary");
const pauseBtn = document.getElementById("pause");
const info = document.getElementById("info");
const radios = [...document.querySelectorAll('input[name="drug"]')];
const mols = [...svg.querySelectorAll(".sd-mol")];
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const MAXP = 70;
const M0 = DATA.map;
const sx = (x) => M0.ox + x * M0.kx;
const sz = (z) => M0.oy + z * M0.kz;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (u) => u * u * (3 - 2 * u);
let seed = 20240611;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randn = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

let drug = "none", M = model(drug), playing = !reduce.matches, visible = true, last = 0, frame = 0;
let relT = 0.4, leakT = 0.3, drugT = 0.5, fuse = 0;
const parts = [];
const free = [];
const recOn = DATA.recx.map(() => 0);
const T = DATA.term;
const inTerm = (x, z, m) => z >= T.zb + m && (Math.abs(x) / (T.a - m)) ** T.q + (Math.max(0, z - T.zc) / (T.bt - m)) ** T.q <= 1;
const zMouthOut = DATA.zpre - 0.5, zMouthIn = DATA.zpre + DATA.zmem + 2.6;

function slot() {
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "sd-particle");
  const da = document.createElementNS(NS, "circle"); da.setAttribute("class", "sd-k-da"); da.setAttribute("r", 4.4);
  const coc = document.createElementNS(NS, "rect"); coc.setAttribute("class", "sd-k-coc"); coc.setAttribute("x", -5); coc.setAttribute("y", -5); coc.setAttribute("width", 10); coc.setAttribute("height", 10);
  const amp = document.createElementNS(NS, "path"); amp.setAttribute("class", "sd-k-amp"); amp.setAttribute("d", "M0 -6.6L6.4 4.6H-6.4Z");
  g.append(da, coc, amp);
  gP.appendChild(g);
  return { g, da, coc, amp };
}
function spawn(kind, st, x, z, extra) {
  if (parts.length >= MAXP) return null;
  const s = free.pop() || slot();
  const p = Object.assign({ s, kind, st, x, z, vx: 0, vz: 0, t: 0, a: 1 }, extra || {});
  s.da.style.display = kind === "da" ? "" : "none";
  s.coc.style.display = kind === "coc" ? "" : "none";
  s.amp.style.display = kind === "amp" ? "" : "none";
  parts.push(p);
  return p;
}
function kill(i) { const p = parts[i]; p.s.g.style.opacity = 0; free.push(p.s); parts.splice(i, 1); }

function wander(p, dt, sigma, tau, bx, bz) {
  const k = Math.sqrt(2 / tau) * sigma * Math.sqrt(dt);
  p.vx += (-p.vx / tau) * dt + k * randn() + (bx || 0) * dt;
  p.vz += (-p.vz / tau) * dt + k * randn() + (bz || 0) * dt;
  p.x += p.vx * dt; p.z += p.vz * dt;
}
function nearest(list, x, z) { let b = null, bd = 1e9; for (const q of list) { const d = Math.hypot(q[0] - x, q[1] - z); if (d < bd) { bd = d; b = q; } } return b; }
const allVm = DATA.ves.flatMap((v) => v.vm);
const inner = DATA.datx.map((x) => [x, zMouthIn]);

function step(dt) {
  const S0 = M.sim;
  relT -= dt;
  if (relT <= 0) {
    relT = S0.releaseEvery * (0.85 + 0.3 * rnd());
    fuse = 1;
    for (let i = 0; i < S0.perRelease; i++) spawn("da", "free", (rnd() - 0.5) * 8, DATA.zpre - 2, { vx: (rnd() - 0.5) * 12, vz: -10 - rnd() * 6 });
  }
  fuse = Math.max(0, fuse - dt / 0.7);
  if (S0.leakEvery) {
    leakT -= dt;
    if (leakT <= 0) {
      leakT = S0.leakEvery * (0.7 + 0.6 * rnd());
      const ncyto = parts.filter((p) => p.kind === "da" && p.st === "cyto").length;
      if (ncyto < 16) { const v = DATA.ves[(rnd() * DATA.ves.length) | 0]; const q = v.vm[(rnd() * 2) | 0]; spawn("da", "cyto", q[0], q[1], { born: 1 }); }
    }
  }
  if (S0.drugEvery) {
    drugT -= dt;
    const kind = drug === "cocaine" ? "coc" : "amp";
    const have = parts.filter((p) => p.kind === kind && p.st !== "fade").length;
    if (drugT <= 0 && have < S0.drugCap) {
      drugT = S0.drugEvery * (0.8 + 0.4 * rnd());
      let tgt;
      if (kind === "coc") { const used = new Set(parts.filter((p) => p.kind === "coc").map((p) => p.tgt)); tgt = DATA.datx.findIndex((_, i) => !used.has(i)); if (tgt < 0) tgt = null; }
      else tgt = (rnd() * DATA.datx.length) | 0;
      if (tgt !== null) { const side = rnd() < 0.5 ? -1 : 1; spawn(kind, "seek", side * 100, 18 + rnd() * 6, { tgt, vx: -side * 14 }); }
    }
  }
  const ntot = DATA.datx.length;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.st === "fade") { p.a -= dt / 0.5; if (p.a <= 0) { kill(i); continue; } continue; }
    if (p.kind === "da") {
      if (p.st === "free") {
        { let bx = 0, bz = 0; if (M.datMode === "uptake") { const j = nearest(DATA.datx.map((x) => [x, DATA.zpre]), p.x, p.z); bx = (j[0] - p.x) * 0.9; bz = (j[1] - p.z) * 0.9; } wander(p, dt, 25, 0.4, bx, bz); }
        if (p.z > DATA.zpre - 1.6) { p.z = DATA.zpre - 1.6; p.vz = -Math.abs(p.vz); }
        if (p.z < 2) { p.z = 2; p.vz = Math.abs(p.vz); }
        if (Math.abs(p.x) > 104) { p.st = "fade"; continue; }
        if (M.datMode === "uptake" && p.z > DATA.zpre - 8) {
          const j = DATA.datx.findIndex((x) => Math.abs(p.x - x) < 7);
          if (j >= 0) { p.st = "enter"; p.t = 0; p.fx = p.x; p.fz = p.z; p.tx = DATA.datx[j]; p.j = j; }
        }
      } else if (p.st === "enter") {
        const u = clamp(p.t / 0.9); const e = ease(u);
        const mx = p.tx, mz = zMouthOut;
        if (u < 0.4) { const w = ease(u / 0.4); p.x = p.fx + (mx - p.fx) * w; p.z = p.fz + (mz - p.fz) * w; }
        else { const w = ease((u - 0.4) / 0.6); p.x = mx; p.z = mz + (zMouthIn + 3 - mz) * w; }
        if (u >= 1) { p.st = "cyto"; p.vx = 0; p.vz = 6; }
      } else if (p.st === "exit") {
        const u = clamp(p.t / 0.8); const w = ease(u);
        p.x = p.tx; p.z = zMouthIn + 2 + (zMouthOut - 2 - (zMouthIn + 2)) * w;
        if (u >= 1) { p.st = "free"; p.vx = (rnd() - 0.5) * 16; p.vz = -14; }
      } else if (p.st === "cyto") {
        let bx = 0, bz = 0;
        if (M.datMode === "uptake") { const q = nearest(allVm, p.x, p.z); bx = (q[0] - p.x) * 1.6; bz = (q[1] - p.z) * 1.6; if (Math.hypot(q[0] - p.x, q[1] - p.z) < 3.2) { p.st = "load"; p.t = 0; continue; } }
        else if (M.datMode === "efflux") { if (p.t > 0.8) { const q = nearest(inner, p.x, p.z); bx = (q[0] - p.x) * 2.2; bz = (q[1] - p.z) * 2.2; if (Math.hypot(q[0] - p.x, q[1] - p.z) < 3.6) { p.st = "exit"; p.t = 0; p.tx = q[0]; continue; } } }
        else if (p.t > 4) { p.st = "fade"; continue; }
        const ox = p.x, oz = p.z;
        wander(p, dt, 15, 0.35, bx, bz);
        if (!inTerm(p.x, p.z, 4)) { p.x = ox; p.z = oz; p.vx *= -0.6; p.vz *= -0.6; }
        for (const v of DATA.ves) {
          const d = Math.hypot(p.x - v.x, p.z - v.z);
          if (d < DATA.vr + 3 && !(p.born && p.t < 0.5)) { const nx = (p.x - v.x) / (d || 1), nz = (p.z - v.z) / (d || 1); p.x = v.x + nx * (DATA.vr + 3); p.z = v.z + nz * (DATA.vr + 3); p.vx = nx * 8; p.vz = nz * 8; }
        }
      } else if (p.st === "load") { p.a = 1 - p.t / 0.45; if (p.a <= 0) { kill(i); continue; } }
    } else if (p.kind === "coc") {
      if (p.st === "seek") {
        const tx = DATA.datx[p.tgt], tz = DATA.zpre - 2.2;
        const dx = tx - p.x, dz = tz - p.z, L = Math.hypot(dx, dz);
        if (M.datMode !== "blocked") { p.st = "fade"; continue; }
        wander(p, dt, 10, 0.4, (dx / L) * 45, (dz / L) * 45);
        if (p.z > DATA.zpre - 2) { p.z = DATA.zpre - 2; p.vz = -Math.abs(p.vz); }
        if (p.z < 6) { p.z = 6; p.vz = Math.abs(p.vz); }
        if (L < 2.4) { p.st = "bound"; p.t = 0; }
      } else if (p.st === "bound") {
        if (M.datMode !== "blocked") { p.st = "fade"; continue; }
        p.x = DATA.datx[p.tgt] + Math.sin(p.t * 3 + p.tgt) * 0.5; p.z = DATA.zpre - 2.8 + Math.cos(p.t * 2.3 + p.tgt) * 0.4;
      }
    } else if (p.kind === "amp") {
      if (p.st === "seek") {
        if (M.datMode !== "efflux") { p.st = "fade"; continue; }
        const tx = DATA.datx[p.tgt], tz = DATA.zpre - 2.2;
        const dx = tx - p.x, dz = tz - p.z, L = Math.hypot(dx, dz);
        wander(p, dt, 10, 0.4, (dx / L) * 45, (dz / L) * 45);
        if (p.z > DATA.zpre - 2) { p.z = DATA.zpre - 2; p.vz = -Math.abs(p.vz); }
        if (p.z < 6) { p.z = 6; p.vz = Math.abs(p.vz); }
        if (L < 3) { p.st = "enter"; p.t = 0; p.fx = p.x; p.fz = p.z; p.tx = tx; }
      } else if (p.st === "enter") {
        const u = clamp(p.t / 0.9);
        if (u < 0.4) { const w = ease(u / 0.4); p.x = p.fx + (p.tx - p.fx) * w; p.z = p.fz + (zMouthOut - p.fz) * w; }
        else { const w = ease((u - 0.4) / 0.6); p.x = p.tx; p.z = zMouthOut + (zMouthIn + 3 - zMouthOut) * w; }
        if (u >= 1) { p.st = "cyto"; p.vx = 0; p.vz = 6; }
      } else if (p.st === "cyto") {
        if (M.datMode !== "efflux") { p.st = "fade"; continue; }
        const q = nearest(allVm, p.x, p.z);
        const ox = p.x, oz = p.z;
        wander(p, dt, 12, 0.35, (q[0] - p.x) * 1.3, (q[1] - p.z) * 1.3);
        if (!inTerm(p.x, p.z, 4)) { p.x = ox; p.z = oz; p.vx *= -0.6; p.vz *= -0.6; }
        for (const v of DATA.ves) { const d = Math.hypot(p.x - v.x, p.z - v.z); if (d < DATA.vr + 2.6) { const nx = (p.x - v.x) / (d || 1), nz = (p.z - v.z) / (d || 1); p.x = v.x + nx * (DATA.vr + 2.6); p.z = v.z + nz * (DATA.vr + 2.6); } }
        if (Math.hypot(q[0] - p.x, q[1] - p.z) < 3.4) { p.st = "load"; p.t = 0; }
      } else if (p.st === "load") { p.a = 1 - p.t / 0.6; if (p.a <= 0) { kill(i); continue; } }
    }
  }
  DATA.recx.forEach((rx, k) => {
    let on = 0;
    for (const p of parts) if (p.kind === "da" && p.st === "free" && p.z < 16 && Math.abs(p.x - rx) < 7) on = 1;
    recOn[k] += (on - recOn[k]) * (1 - Math.exp(-dt / 0.25));
  });
}

function draw() {
  for (const p of parts) {
    p.s.g.setAttribute("transform", "translate(" + sx(p.x).toFixed(1) + " " + sz(p.z).toFixed(1) + ")");
    p.s.g.style.opacity = (p.st === "fade" ? p.a : p.a * clamp(p.t / 0.25 + (p.born ? 0 : 0.4))).toFixed(2);
  }
  recs.forEach((r, i) => r.style.setProperty("--on", recOn[i].toFixed(2)));
  dockDots.forEach((d) => (d.style.opacity = (1 - 0.8 * fuse).toFixed(2)));
  pore.style.opacity = (fuse > 0.35 ? (fuse - 0.35) / 0.65 : 0).toFixed(2);
}

function warm(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) step(1 / 30); draw(); }
function reset() { while (parts.length) kill(parts.length - 1); seed = 20240611; relT = 0.4; leakT = 0.3; drugT = 0.5; fuse = 0; recOn.fill(0); }

function apply() {
  M = model(drug);
  svg.dataset.drug = drug;
  readout.textContent = M.readout;
  summary.textContent = M.summary;
  statusEl.textContent = M.status;
  mols.forEach((m) => { const k = m.dataset.mol; m.dataset.active = String(k === "dopamine" || k === drug); });
  svg.classList.toggle("is-depleted", M.vesicleStore === "depleted");
}
function setDrug(d) {
  drug = d; apply();
  if (!playing) { reset(); warm(16); }
}

function tick(now) {
  frame = 0;
  if (!playing || !visible) return;
  const dt = Math.min(0.064, (now - (last || now)) / 1000);
  last = now;
  step(dt); draw();
  frame = requestAnimationFrame(tick);
}
function start() { if (playing && visible && !frame) { last = 0; frame = requestAnimationFrame(tick); } }
function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; }
function setPlaying(v) {
  playing = v;
  pauseBtn.textContent = v ? "Pause motion" : "Play motion";
  pauseBtn.setAttribute("aria-pressed", String(!v));
  if (v) start(); else stop();
}
radios.forEach((r) => r.addEventListener("change", () => { if (r.checked) setDrug(r.value); }));
pauseBtn.addEventListener("click", () => setPlaying(!playing));
document.addEventListener("keydown", (e) => {
  if (e.target.closest("textarea, select")) return;
  if (e.code === "Space" && !e.target.closest("button, a, input")) { e.preventDefault(); setPlaying(!playing); return; }
  const idx = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
  if (idx !== undefined && !e.target.closest("textarea")) { radios[idx].checked = true; setDrug(radios[idx].value); }
});
reduce.addEventListener("change", () => setPlaying(!reduce.matches));
const idle = info.textContent;
svg.querySelectorAll(".hot").forEach((el) => {
  const on = () => { info.textContent = el.dataset.info; el.classList.add("is-hot"); };
  const off = () => { info.textContent = idle; el.classList.remove("is-hot"); };
  el.addEventListener("pointerenter", on); el.addEventListener("pointerleave", off);
  el.addEventListener("focus", on); el.addEventListener("blur", off);
});
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }).observe(svg);
if (reduce.matches) { pauseBtn.textContent = "Play motion"; pauseBtn.setAttribute("aria-pressed", "true"); }
const q = new URLSearchParams(location.search).get("drug");
if (q && ["none", "cocaine", "amphetamine"].includes(q)) { drug = q; radios.forEach((r) => (r.checked = r.value === q)); }
apply();
warm(16);
start();
window.__sd = { setDrug: (d) => { radios.forEach((r) => (r.checked = r.value === d)); setDrug(d); }, count: () => parts.length };
`;

const style = `
.sd-svg{padding:0}
.sd-fig{display:block;width:100%;height:auto}
.sd-fig .bio-blob-base{fill:var(--anatomy-shade-2)}
.sd-halo{fill:var(--anatomy-halo);opacity:var(--anatomy-halo-opacity);filter:blur(14px)}
.sd-cleft{stroke:none}
.sd-label{fill:var(--anatomy-text);font:12px var(--anatomy-mono);letter-spacing:.01em}
.sd-name{fill:var(--anatomy-strong);font-size:13px}
.sd-muted{color:var(--anatomy-muted)}
.sd-status{fill:var(--anatomy-strong);font:600 13px var(--anatomy-mono)}
.sd-leader{fill:none;stroke:var(--anatomy-mid);stroke-width:.7}
.sd-dot{fill:var(--anatomy-dot)}
.sd-bond{fill:none;stroke:var(--anatomy-hi);stroke-width:1.5;stroke-linecap:round}
.sd-wedge{fill:var(--anatomy-hi);stroke:var(--anatomy-hi);stroke-width:.6;stroke-linejoin:round}
.sd-atom{fill:var(--anatomy-strong);font:600 13px var(--anatomy-mono)}
.sd-mol{opacity:.5;transition:opacity .3s}
.sd-mol[data-active="true"]{opacity:1}
.sd-mol[data-mol="cocaine"][data-active="true"] .sd-bond,.sd-mol[data-mol="cocaine"][data-active="true"] .sd-wedge{stroke:var(--anatomy-red);}
.sd-mol[data-mol="cocaine"][data-active="true"] .sd-wedge{fill:var(--anatomy-red)}
.sd-mol[data-mol="amphetamine"][data-active="true"] .sd-bond,.sd-mol[data-mol="amphetamine"][data-active="true"] .sd-wedge{stroke:var(--anatomy-blue)}
.sd-vdot{fill:var(--anatomy-hi);opacity:.9}
.sd-fig.is-depleted .d-lose{opacity:0}
.sd-vdot{transition:opacity .6s}
.sd-fig .sd-ves .bio-blob-base{fill:var(--anatomy-face)}
.sd-vmat{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.3}
.sd-dat-half{fill:var(--anatomy-face);stroke:var(--anatomy-hi);stroke-width:1.4}
.sd-rec-stalk{fill:none;stroke:var(--anatomy-hi);stroke-width:2.6;stroke-linecap:round}
.sd-rec-head{fill:var(--anatomy-face);stroke:var(--anatomy-hi);stroke-width:1.3}
.sd-rec{--on:0}
.sd-rec .sd-rec-head{fill:color-mix(in srgb,var(--anatomy-lit) calc(var(--on) * 85%),var(--anatomy-face))}
.sd-pore{fill:var(--anatomy-lit);opacity:0;pointer-events:none}
.sd-a{fill:none;stroke:var(--anatomy-strong);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:0;transition:opacity .35s}
.sd-a-x{stroke:var(--anatomy-red);stroke-width:2}
.sd-fig[data-drug="none"] .sd-a-up,.sd-fig[data-drug="none"] .sd-vm-in,.sd-fig[data-drug="cocaine"] .sd-vm-in{opacity:.85}
.sd-fig[data-drug="cocaine"] .sd-a-x{opacity:1}
.sd-fig[data-drug="amphetamine"] .sd-a-down,.sd-fig[data-drug="amphetamine"] .sd-vm-out{opacity:.95}
.sd-fig[data-drug="amphetamine"] .sd-vm-out{stroke:var(--anatomy-blue)}
.sd-particle{pointer-events:none}
.sd-k-da{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1.1}
.sd-k-coc{fill:var(--anatomy-red);stroke:var(--anatomy-paper);stroke-width:1.1}
.sd-k-amp{fill:var(--anatomy-blue);stroke:var(--anatomy-paper);stroke-width:1.1}
.sd-molname .sd-k-da,.sd-molname .sd-k-coc,.sd-molname .sd-k-amp{stroke:none}
.hot{cursor:help;outline:none}
.hot.is-hot{filter:drop-shadow(0 0 3px var(--anatomy-lit))}
.hot:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.sd-controls{display:flex;flex-wrap:wrap;gap:14px 28px;align-items:center;margin:14px 2px 6px;font:12.5px var(--anatomy-mono);color:var(--anatomy-text)}
.sd-drug{display:flex;flex-wrap:wrap;gap:6px 18px;border:1px solid var(--anatomy-faint);padding:6px 12px 8px;margin:0}
.sd-drug legend{font:11.5px var(--anatomy-mono);color:var(--anatomy-muted);padding:0 6px}
.sd-drug label{cursor:pointer;color:var(--anatomy-strong)}
.sd-drug input{accent-color:var(--anatomy-lit);margin-right:5px}
.sd-controls button{border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:inherit;padding:6px 10px;cursor:pointer;margin-left:auto}
.sd-controls :focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.sd-legend{font:12px var(--anatomy-mono);color:var(--anatomy-text);margin:6px 2px}
.sd-legend svg{vertical-align:-3px}
.sd-summary{font:12.5px/1.55 var(--anatomy-mono);color:var(--anatomy-strong);margin:8px 2px;min-height:5.2em}
.sd-info{min-height:4.6em;font:12.5px/1.55 var(--anatomy-mono);color:var(--anatomy-text);margin:8px 2px;border-left:2px solid var(--anatomy-faint);padding-left:10px}
.bio-sources{margin:20px 2px;color:var(--anatomy-muted);font-size:12.5px;line-height:1.65}
.bio-sources h2{font:600 13px var(--anatomy-mono);color:var(--anatomy-text);margin:0 0 8px}
.bio-sources ul{padding-left:18px}.bio-sources li{margin:6px 0}
.bio-sources a{color:var(--anatomy-text);text-underline-offset:2px}
@media(prefers-reduced-motion:reduce){.sd-a,.sd-mol,.sd-vdot{transition:none}}
`;

const html = pageHtml({
  title: "Cocaine and Amphetamine at DAT",
  theme: light ? "light" : "dark",
  width: WIDTH + 40,
  body: `<style>${BIO_CSS}${style}</style>${framed}${controls}${sources}`,
  script,
});
const filename = light ? "stimulants-dat-light.html" : "stimulants-dat.html";
writeFileSync(join(HERE, filename), html);
console.log(`wrote ${filename}`);
