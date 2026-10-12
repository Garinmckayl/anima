import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = new URL("../../kit/", import.meta.url).href;
const { BIO_CSS, blobOf, blobSvg, membraneOf, membraneSvg } = await import(KIT + "blob.mjs");
const { branchPieces, branchSvg } = await import(KIT + "branch.mjs");
const { helixOf, helixSvg } = await import(KIT + "chem.mjs");
const { fitProjection, figureSvg, iso, pageHtml, pathOf, plateHtml } = await import(KIT + "iso-kit.mjs");

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");
const WIDTH = 960;
const HEIGHT = 610;

const ring = (c, rx, ry, z, phase = 0, n = 36) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + 0.045 * Math.sin(a * 3 + phase) + 0.02 * Math.cos(a * 5 - phase);
    return [c[0] + Math.cos(a) * rx * w, c[1] + Math.sin(a) * ry * w, z];
  });

const SOMA = { c: [0, 0, 2], rx: 40, ry: 31 };
const NUC = { c: [17, -3, 4], rx: 17, ry: 14 };
const ERC = [-17, 9, 4];
const REC = [[17, -9, 9], [17, 4, 9]];
const CAP = [[-62, -34, 3], [-62, -12, 3], [-62, 12, 3], [-62, 34, 3]];
const AXON = [[34, 0, 3], [52, 3, 3], [70, 8, 3], [86, 8, 3], [96, 6, 3]];
const TARGET = { c: [114, 10, 2], rx: 17, ry: 14 };

const bounds = [
  ...CAP,
  ...ring(SOMA.c, SOMA.rx, SOMA.ry, 2),
  ...ring(TARGET.c, TARGET.rx + 8, TARGET.ry + 8, 2),
  [-70, 0, 10],
  [140, 10, 12],
];
const P = fitProjection(bounds, WIDTH, HEIGHT, { pad: 40, headroom: 190, azimuth: 62, elevation: 38 });
const at = (p) => iso(p, P);

const cytoplasm = blobOf(ring(SOMA.c, SOMA.rx, SOMA.ry, 2, 0.4), P, { tone: "hi", id: "soma", highlight: 0.8, shade: 0.9 });
const membrane = membraneOf(ring(SOMA.c, SOMA.rx + 1.6, SOMA.ry + 1.6, 2.2, 0.4), ring(SOMA.c, SOMA.rx - 0.2, SOMA.ry - 0.2, 2.2, 0.4), P, { tone: "mid" });
const nucleus = blobOf(ring(NUC.c, NUC.rx, NUC.ry, NUC.c[2], 1.1), P, { tone: "mid", id: "nucleus", highlight: 0.8, shade: 0.9 });
const envelope = membraneOf(ring(NUC.c, NUC.rx + 0.9, NUC.ry + 0.9, NUC.c[2] + 0.1, 1.1), ring(NUC.c, NUC.rx - 0.1, NUC.ry - 0.1, NUC.c[2] + 0.1, 1.1), P, { tone: "lo" });

const er = [0, 1, 2].map((i) =>
  blobOf(ring([ERC[0] + i * 0.8, ERC[1] - i * 0.4, ERC[2] + i * 1.5], 14 - i * 1.5, 7 - i * 0.6, ERC[2] + i * 1.5, i), P, { tone: i === 2 ? "hi" : "mid", id: `er-${i}`, highlight: 0.78, shade: 0.9 }));
const aroSites = [[-24, 8, 8.4], [-19, 11, 8.4], [-14, 8.5, 8.4], [-10, 11.5, 8.4]];
const AROMATASE = [-17, 9.8, 8.4];

const helix = helixOf({ center: [NUC.c[0], NUC.c[1], 7], axis: [0, 1, 0], radius: 2.6, turns: 3.4, rise: 5.2, strands: 2 }, P);

const receptors = REC.map((c, i) => blobOf(ring(c, 3.5, 3, c[2], i, 18), P, { tone: "hi", id: `era-${i}` }));

const cap = branchPieces(CAP, 6, P, { maxLength: 22, spacing: 1.7 });

const axonPieces = branchPieces(AXON, (t) => 1.9 - 0.5 * t, P, { maxLength: 14, spacing: 1.7 });
const terminal = blobOf(ring([97, 6, 3], 4.2, 3.4, 3, 0.3, 20), P, { tone: "lit", id: "terminal" });
const target = blobOf(ring(TARGET.c, TARGET.rx, TARGET.ry, TARGET.c[2], 2.0), P, { tone: "hi", id: "target" });
const targetNucleus = blobOf(ring([116, 12, 4], 6, 5, 4, 0.8, 24), P, { tone: "mid", id: "target-nucleus" });
const dend = [
  [[126, 4, 2], [136, -3, 1.5], [142, -12, 1]],
  [[122, 20, 2], [128, 30, 1.5], [136, 38, 1]],
  [[128, 14, 2], [138, 18, 1.5], [146, 26, 1]],
].flatMap((p) => branchPieces(p, (t) => 1.7 - 0.9 * t, P, { maxLength: 12, spacing: 1.7 }));

const S = (p) => at(p).map((v) => +v.toFixed(1));
const lanes = [-34, -12, 12, 34].map((y, i) => [
  S([-62, y, 5]),
  S([-52, y * 0.6, 5]),
  S([SOMA.c[0] - SOMA.rx - 1, y * 0.55 + 4, 5]),
  S([-26, 9 + (i - 1.5) * 1.2, 7]),
  S([AROMATASE[0] + (i - 1.5) * 1.6, AROMATASE[1], 9.4]),
]);
const DATA = {
  lanes,
  er: S(AROMATASE),
  rec: REC.map((r) => S([r[0], r[1], r[2] + 1])),
  sites: aroSites.map((s) => S(s)),
};

const dot = (p, cls = "") => {
  const [x, y] = at(p);
  return `<circle class="es-dot ${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5"/>`;
};
const label = (text, p, dx, dy, anchor = "start") => {
  const [x, y] = at(p);
  const tx = x + dx;
  const ty = y + dy;
  const ex = tx + (anchor === "end" ? 3 : anchor === "middle" ? 0 : -3);
  const ey = ty + (dy < 0 ? 3 : -4);
  return `<path class="es-leader" d="${pathOf([[x, y], [ex, ey]])}"/>${dot(p)}<text class="es-label" x="${tx}" y="${ty}" text-anchor="${anchor}">${text}</text>`;
};

const C = {
  1: [0, 1], 2: [-0.866, 0.5], 3: [-0.866, -0.5], 4: [0, -1], 5: [0.866, -0.5], 10: [0.866, 0.5],
  6: [1.732, -1], 7: [2.598, -0.5], 8: [2.598, 0.5], 9: [1.732, 1], 11: [1.732, 2], 12: [2.598, 2.5],
  13: [3.464, 2], 14: [3.464, 1], 15: [4.415, 0.691], 16: [5.003, 1.5], 17: [4.415, 2.309],
  18: [3.464, 3], 19: [0.866, 1.5], O3: [-1.732, -1], O17: [4.87, 3.2],
};
const single = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 10], [10, 1], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [8, 14], [14, 13], [13, 12], [12, 11], [11, 9], [13, 17], [17, 16], [16, 15], [15, 14], [13, 18], [17, "O17"]];
function formula(ox, oy, kind) {
  const K = 27;
  const px = (k) => [ox + C[k][0] * K, oy - C[k][1] * K];
  const line = (a, b, cls = "") => `<path class="es-bond ${cls}" d="${pathOf([px(a), px(b)])}"/>`;
  const inner = (a, b, toward) => {
    const A = px(a), B = px(b), M = [ox + toward[0] * K, oy - toward[1] * K];
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const vx = M[0] - mx, vy = M[1] - my, L = Math.hypot(vx, vy) || 1;
    const o = 4.2, s = 0.16;
    const p = (Q, R) => [Q[0] + (R[0] - Q[0]) * s + (vx / L) * o, Q[1] + (R[1] - Q[1]) * s + (vy / L) * o];
    return `<path class="es-bond" d="${pathOf([p(A, B), p(B, A)])}"/>`;
  };
  const ringA = [0, 0];
  let out = "";
  for (const [a, b] of single) out += line(a, b);
  if (kind === "T") {
    out += line(10, 19);
    out += inner(4, 5, ringA);
    const [x3, y3] = px(3), [xo, yo] = px("O3");
    const nx = (y3 - yo) / Math.hypot(xo - x3, yo - y3) * 2.2, ny = (xo - x3) / Math.hypot(xo - x3, yo - y3) * 2.2;
    out += `<path class="es-bond" d="${pathOf([[x3 + nx, y3 + ny], [xo + nx, yo + ny]])}"/><path class="es-bond" d="${pathOf([[x3 - nx, y3 - ny], [xo - nx, yo - ny]])}"/>`;
  } else {
    out += line(3, "O3");
    out += inner(1, 2, ringA) + inner(3, 4, ringA) + inner(5, 10, ringA);
  }
  const atomText = (k, t, dx = 0, dy = 0) => {
    const [x, y] = px(k);
    return `<circle class="es-atom-bg" cx="${x}" cy="${y}" r="7.5"/><text class="es-atom" x="${x + dx}" y="${y + 4 + dy}" text-anchor="middle">${t}</text>`;
  };
  out += atomText("O17", "OH", 0.5) + atomText("O3", kind === "T" ? "O" : "OH");
  return out;
}
const T0 = [120, 142], E0 = [500, 142];
const chem = [
  `<g class="es-chem" aria-label="Testosterone structural formula">${formula(...T0, "T")}</g>`,
  `<g class="es-chem es-chem-e2" aria-label="Estradiol structural formula">${formula(...E0, "E")}</g>`,
  (() => {
    const [x, y] = [T0[0] + C[19][0] * 27, T0[1] - C[19][1] * 27];
    return `<circle class="es-methyl" cx="${x}" cy="${y}" r="4.2"/><path class="es-leader" d="${pathOf([[x, y - 4.2], [x - 14, y - 22]])}"/><text class="es-label" x="${x - 16}" y="${y - 25}" text-anchor="end">C19 methyl</text>`;
  })(),
  `<text class="es-label es-name" x="${T0[0] + 55}" y="${T0[1] + 60}" text-anchor="middle">testosterone (T)</text>`,
  `<text class="es-label es-name" x="${E0[0] + 55}" y="${E0[1] + 60}" text-anchor="middle">17β-estradiol (E2)</text>`,
  `<path class="es-arrow" d="M300 124H408"/><path class="es-arrow-head" d="M408 124l-9 -4.5v9z"/>`,
  `<text class="es-label" x="354" y="112" text-anchor="middle">aromatase (CYP19A1)</text>`,
  `<text class="es-label es-muted" x="354" y="146" text-anchor="middle">loses C19, A ring aromatised</text>`,
].join("");

const pieces = (arr, tone) => arr.map((p) => branchSvg(p, { tone })).join("");
const helixMarkup = `<g id="dna" class="es-dna hot" tabindex="0" data-info="DNA with an estrogen response element (ERE). Ligand-bound ERα binds EREs as a dimer and regulates transcription of target genes; ERα can also act indirectly by tethering to other transcription factors.">${helixSvg(helix, P, { tone: "hi", rungTone: "mid", width: 1.3 })}</g>`;

const body = [
  `<ellipse class="es-halo" cx="${at([40, 0, 0])[0].toFixed(1)}" cy="${(at([40, 0, 0])[1] + 62).toFixed(1)}" rx="330" ry="46"/>`,
  chem.slice(0, 0),
  `<g class="hot" tabindex="0" data-info="Blood vessel (schematic). Testosterone is lipophilic, so it can leave the vessel and cross cell membranes; it is also made locally. Note the estradiol available to a male brain may be largely synthesised on site rather than circulating.">${pieces(cap, "lo")}</g>`,
  `<g class="hot" tabindex="0" data-info="Axon: the neuron's output line to downstream circuitry. Here a schematic projection toward a hypothalamic target (e.g. the ventromedial hypothalamus). The travelling pulse size is illustrative, not a measured firing rate.">${pieces(axonPieces, "mid")}</g>`,
  pieces(dend, "lo"),
  blobSvg(target),
  blobSvg(targetNucleus),
  `<ellipse id="target-glow" class="es-target-glow" cx="${at(TARGET.c)[0].toFixed(1)}" cy="${at(TARGET.c)[1].toFixed(1)}" rx="${(TARGET.rx * 1.5).toFixed(1)}" ry="${(TARGET.ry * 1.3).toFixed(1)}"/>`,
  blobSvg(terminal),
  blobSvg(cytoplasm),
  `<g class="hot" tabindex="0" data-info="Cell membrane (lipid bilayer, schematic). Steroid hormones such as testosterone and estradiol are lipid-soluble and cross it by diffusion.">${membraneSvg(membrane)}</g>`,
  `<g id="er" class="hot" tabindex="0" data-info="Endoplasmic reticulum. Aromatase (CYP19A1) is a cytochrome P450 enzyme embedded in the ER membrane; it converts testosterone to estradiol.">${er.map(blobSvg).join("")}</g>`,
  `<g id="aromatase" class="es-aro hot" tabindex="0" data-info="Aromatase (CYP19A1): three successive oxidations of the C19 androgen, ending in cleavage of the C10–C19 bond and a phenolic A ring. Toggle ‘Block aromatase’ to see testosterone fail to convert.">${aroSites.map((s) => { const [x, y] = at(s); const [bx, by] = at([s[0], s[1], 5.2]); return `<path class="es-stalk" d="M${bx.toFixed(1)} ${by.toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}"/><circle class="es-head" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4"/>`; }).join("")}<g class="es-block"><path d="M${(at(AROMATASE)[0] - 8).toFixed(1)} ${(at(AROMATASE)[1] - 12).toFixed(1)}l16 -14M${(at(AROMATASE)[0] - 8).toFixed(1)} ${(at(AROMATASE)[1] - 26).toFixed(1)}l16 14"/></g></g>`,
  blobSvg(nucleus),
  membraneSvg(envelope),
  helixMarkup,
  `<g id="rec" class="hot" tabindex="0" data-info="Estrogen receptor α (ERα): a ligand-activated nuclear receptor. Estradiol binds each monomer; the pair then binds DNA as a homodimer.">${receptors.map((r, i) => `<g class="es-rec" data-slot="${i}">${blobSvg(r)}</g>`).join("")}</g>`,
  `<path id="axon-track" class="es-track" d="${pathOf(AXON.map(at))}"/>`,
  `<g id="pulses"></g>`,
  `<g id="particles"></g>`,
  label("blood vessel", CAP[3], -24, 6, "end"),
  label("cell membrane", [SOMA.c[0] - SOMA.rx + 5, -18, 2.5], -52, -30, "end"),
  label("endoplasmic reticulum", [ERC[0] - 8, ERC[1] + 1, 5.5], -30, 46, "end"),
  label("aromatase", [aroSites[0][0], aroSites[0][1], 8.4], -34, -20, "end"),
  label("nucleus", [NUC.c[0] + NUC.rx - 1, NUC.c[1] - 5, 4], 14, -34, "start"),
  label("ERα dimer on ERE", [REC[0][0], REC[0][1], REC[0][2] + 1.5], 78, -52, "start"),
  label("axon → circuit", AXON[2], -8, 26, "middle"),
  label("downstream neuron", [TARGET.c[0] + 10, TARGET.c[1] + 12, 2.5], 18, 36, "middle"),
  chem,
].join("");

const svg = figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "Schematic of a neuron in which testosterone is converted by aromatase in the endoplasmic reticulum to estradiol, which binds estrogen receptor alpha dimers on DNA in the nucleus and modulates output along the axon to a downstream neuron. Skeletal formulas of testosterone and estradiol are shown above.",
  body,
  className: "es-fig",
});

const framed = plateHtml({
  fig: "Fig 1",
  title: "T → E2 → ERα in a neuron",
  hint: "hover or focus a part · space: pause",
  readout: "aromatase active · E2 low",
  caption: "Schematic of the mechanism proposed for aromatase-expressing neurons in rodent aggression circuits. Not to scale; the human picture is far weaker (see sources).",
  body: `<div class="es-svg">${svg}</div>`,
});

const controls = `
<div class="es-controls">
  <label class="es-switch"><input id="block" type="checkbox"> <span>Block aromatase</span></label>
  <label class="es-range"><span>Testosterone supply</span><input id="supply" type="range" min="0" max="2" step="1" value="1" aria-valuetext="medium"><span class="es-ticks"><i>low</i><i>medium</i><i>high</i></span></label>
  <button id="pause" type="button" aria-pressed="false">Pause motion</button>
</div>
<p class="es-legend"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.2" class="es-p-t"/></svg> testosterone (T)
 &nbsp; <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.4" class="es-p-e"/></svg> estradiol (E2)
 &nbsp; <span class="es-muted">Pulse size on the axon is a schematic of E2–ERα effect, not a measured firing rate.</span></p>
<p id="info" class="es-info" aria-live="polite">Hover or focus a labelled part for a one-line explanation.</p>`;

const sources = `<footer class="bio-sources">
<h2>What the figure shows, and how sure we are</h2>
<ul>
<li><strong>Chemistry and enzymology (well established).</strong> Aromatase (CYP19A1) converts testosterone to estradiol by three oxidations that cleave the C10–C19 bond and aromatise ring A; it sits in the endoplasmic reticulum membrane and the brain is one tissue where it acts (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4752924/">Structural and functional characterization of aromatase, estrogen receptor, and their genes</a>; <a href="https://pubmed.ncbi.nlm.nih.gov/12428207/">The essential role of the aromatase/p450arom</a>).</li>
<li><strong>Receptor action (well established).</strong> Estradiol-occupied ERα forms a homodimer that binds estrogen response elements and regulates transcription; ERα can also act by tethering to other transcription factors (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC55815/">Estrogen receptor interaction with estrogen response elements</a>; <a href="https://pubmed.ncbi.nlm.nih.gov/23649536/">Estrogen receptor alpha: molecular mechanisms and emerging insights</a>).</li>
<li><strong>Male mice (good evidence, species-specific).</strong> Aromatase-expressing neurons in the posterodorsal medial amygdala regulate aggression (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4349580/">Unger et al. 2015</a>); ERα knock-down in the medial amygdala before puberty reduces adult male social behaviour including aggression (<a href="https://www.pnas.org/doi/10.1073/pnas.1524907113">PNAS 2016</a>); ERα and AR both contribute (<a href="https://onlinelibrary.wiley.com/doi/full/10.1111/j.1601-183X.2004.00036.x">Scordalakes &amp; Rissman 2004</a>). Individual differences in ERα in select nuclei track individual differences in aggression (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC1950320/">Trainor, Greiwe &amp; Nelson 2006</a>). Direction and receptor subtype matter: ERα and ERβ can differ, and estradiol effects depend on day length (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2071923/">Trainor, Rowland &amp; Nelson 2007</a>; <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2190085/">Trainor, Finy &amp; Nelson 2008</a>). A systematic review of animal work finds estrogen signalling usually contributes to aggression, varying by species, sex and paradigm (<a href="https://jpbs.hapres.com/htmls/JPBS_1931_Detail.html">Hapres JPBS review</a>).</li>
<li><strong>Men (weak and mixed).</strong> A 2023 meta-analysis of 14 studies (1,820 participants) found a weak positive correlation between estradiol and human aggression, pooled Fisher z = 0.16 (95% CI 0.05–0.26; I² = 73%), with sex, age and the aggression measure contributing to heterogeneity (<a href="https://doi.org/10.1097/psy.0000000000001247">Wang et al., Psychosomatic Medicine 2023</a>; <a href="https://pubmed.ncbi.nlm.nih.gov/37678333">PubMed</a>). Fisher z is a transformed correlation, not a percentage of variance, and it does not show causation.</li>
</ul>
<p><strong>What was simplified.</strong> One neuron stands for a circuit; membrane and other non-genomic ER signalling, co-regulators, other brain regions, and local versus circulating hormone sources are omitted. Positions, sizes and particle speeds are illustrative. The circuit and receptor details come from rodents; they have not been shown to explain aggression in people. “Aromatase-blocked” is a teaching toggle, not a statement about any drug or dose.</p>
<p>For education only; this figure is not medical advice and says nothing about any individual’s hormones or behaviour.</p>
</footer>`;

const script = `
const DATA = ${JSON.stringify(DATA)};
const NS = "http://www.w3.org/2000/svg";
const svg = document.querySelector(".es-fig");
const gP = svg.querySelector("#particles");
const gPulse = svg.querySelector("#pulses");
const track = svg.querySelector("#axon-track");
const glow = svg.querySelector("#target-glow");
const dna = svg.querySelector("#dna");
const aro = svg.querySelector("#aromatase");
const recs = [...svg.querySelectorAll(".es-rec")];
const readout = document.querySelector("[data-readout]");
const blockBox = document.getElementById("block");
const supplyBox = document.getElementById("supply");
const pauseBtn = document.getElementById("pause");
const info = document.getElementById("info");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const SLOTS = 8, CYCLE = 9000;
const COUNT = [3, 5, 8];
const NAMES = ["low", "medium", "high"];
let blocked = false, supply = 1, playing = !reduce.matches, visible = true, sim = reduce.matches ? 6200 : 0, last = 0, frame = 0, out = 0;
let nextPulse = 0, pulseAge = [];
const ease = (u) => u * u * (3 - 2 * u);
const clamp = (v) => Math.max(0, Math.min(1, v));
const mk = (name, attrs, parent) => { const el = document.createElementNS(NS, name); for (const k in attrs) el.setAttribute(k, attrs[k]); parent.appendChild(el); return el; };
const along = (pts, u) => {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let want = clamp(u) * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) { const f = seg[i] ? want / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
    want -= seg[i];
  }
  return pts[0];
};
const parts = Array.from({ length: SLOTS }, (_, i) => {
  const g = mk("g", { class: "es-particle" }, gP);
  const halo = mk("circle", { class: "es-p-halo", r: 7 }, g);
  const body = mk("circle", { class: "es-p-t", r: 3.4 }, g);
  return { g, halo, body };
});
const pulses = Array.from({ length: 3 }, () => {
  const g = mk("g", { class: "es-pulse" }, gPulse);
  return { g, halo: mk("circle", { class: "es-pulse-halo", r: 6 }, g), dot: mk("circle", { class: "es-pulse-dot", r: 2.6 }, g), age: -1 };
});
const level = (v) => (v < 0.06 ? "none" : v < 0.34 ? "low" : v < 0.67 ? "moderate" : "high");
let shown = "";

function draw(dt) {
  const n = COUNT[supply];
  const act = [0, 0];
  let engaged = 0;
  parts.forEach((p, i) => {
    if (i >= n) { p.g.style.opacity = 0; return; }
    const tt = ((sim / CYCLE) + i / SLOTS) % 1;
    const lane = DATA.lanes[i % DATA.lanes.length];
    const slot = i % 2;
    let pos, isE2 = false, alpha = 1, flash = 0;
    if (tt < 0.36) pos = along(lane, ease(tt / 0.36));
    else if (tt < 0.5) { pos = DATA.er; engaged++; }
    else if (blocked) { const u = clamp((tt - 0.5) / 0.34); pos = along(lane, 1 - ease(u)); alpha = tt > 0.86 ? 1 - (tt - 0.86) / 0.14 : 1; }
    else {
      isE2 = true;
      flash = clamp(1 - (tt - 0.5) / 0.05);
      if (tt < 0.76) pos = [DATA.er[0] + (DATA.rec[slot][0] - DATA.er[0]) * ease((tt - 0.5) / 0.26), DATA.er[1] + (DATA.rec[slot][1] - DATA.er[1]) * ease((tt - 0.5) / 0.26)];
      else { pos = DATA.rec[slot]; if (tt < 0.93) act[slot] = Math.max(act[slot], clamp((tt - 0.76) / 0.04)); alpha = tt > 0.93 ? 1 - (tt - 0.93) / 0.07 : 1; }
    }
    if (tt < 0.04) alpha = tt / 0.04;
    const x = pos[0] + (isE2 ? 0 : Math.sin(sim / 400 + i * 2) * 0.8), y = pos[1] + (isE2 ? 0 : Math.cos(sim / 470 + i) * 0.8);
    p.g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")");
    p.g.style.opacity = alpha.toFixed(2);
    p.body.setAttribute("class", isE2 ? "es-p-e" : "es-p-t");
    p.body.setAttribute("r", isE2 ? 3.7 : 3.4);
    p.halo.style.opacity = isE2 ? (0.25 + flash * 0.55).toFixed(2) : 0;
    p.halo.setAttribute("r", (6 + flash * 7).toFixed(1));
  });
  const target = (act[0] + act[1]) / 2;
  out += (target - out) * (dt >= 1000 ? 1 : 1 - Math.exp(-dt / 700));
  recs.forEach((r, i) => r.style.setProperty("--on", act[i].toFixed(2)));
  dna.style.setProperty("--on", out.toFixed(2));
  aro.dataset.state = blocked ? "blocked" : engaged ? "engaged" : "idle";
  glow.style.opacity = (0.08 + out * 0.5).toFixed(2);
  const text = "aromatase " + (blocked ? "blocked" : "active") + " · E2 " + level(out);
  if (text !== shown) { shown = text; readout.textContent = text; }
}

function drawPulses(dt) {
  const len = track.getTotalLength();
  if (playing) {
    nextPulse -= dt;
    if (nextPulse <= 0) { const free = pulses.find((p) => p.age < 0); if (free) free.age = 0; nextPulse = 1700; }
  }
  pulses.forEach((p, i) => {
    if (!playing && p.age < 0) { if (i === 0) p.age = 600; }
    if (p.age < 0) { p.g.style.opacity = 0; return; }
    if (playing) p.age += dt;
    const u = p.age / 1500;
    if (u > 1) { p.age = -1; p.g.style.opacity = 0; return; }
    const pt = track.getPointAtLength(len * u);
    p.g.setAttribute("transform", "translate(" + pt.x.toFixed(1) + " " + pt.y.toFixed(1) + ")");
    p.g.style.opacity = (u < 0.06 ? u / 0.06 : u > 0.94 ? (1 - u) / 0.06 : 1).toFixed(2);
    const s = 0.8 + out * 0.9;
    p.dot.setAttribute("r", (2.2 * s).toFixed(2));
    p.halo.setAttribute("r", (5 + out * 7).toFixed(1));
    p.halo.style.opacity = (0.15 + out * 0.45).toFixed(2);
  });
}

function tick(now) {
  frame = 0;
  if (!playing || !visible) return;
  const dt = Math.min(64, now - (last || now));
  last = now;
  sim += dt;
  draw(dt); drawPulses(dt);
  frame = requestAnimationFrame(tick);
}
function still() { draw(1000); drawPulses(0); }
function start() { if (playing && visible && !frame) { last = 0; frame = requestAnimationFrame(tick); } }
function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; }

blockBox.addEventListener("change", () => { blocked = blockBox.checked; if (!playing) still(); });
supplyBox.addEventListener("input", () => { supply = +supplyBox.value; supplyBox.setAttribute("aria-valuetext", NAMES[supply]); if (!playing) still(); });
function setPlaying(v) {
  playing = v;
  pauseBtn.textContent = v ? "Pause motion" : "Play motion";
  pauseBtn.setAttribute("aria-pressed", String(!v));
  if (v) start(); else { stop(); still(); }
}
pauseBtn.addEventListener("click", () => setPlaying(!playing));
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.closest("button, a, input, textarea, select")) return;
  e.preventDefault(); setPlaying(!playing);
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
still();
start();
`;

const style = `
.es-svg{padding:0}
.es-fig{display:block;width:100%;height:auto}
.es-fig .bio-blob-base{fill:var(--anatomy-shade-2)}
.es-halo{fill:var(--anatomy-halo);opacity:var(--anatomy-halo-opacity);filter:blur(14px)}
.es-label{fill:var(--anatomy-text);font:11.5px var(--anatomy-mono);letter-spacing:.01em}
.es-label.es-name{fill:var(--anatomy-strong);font-size:12px}
.es-muted{fill:var(--anatomy-muted);color:var(--anatomy-muted)}
.es-leader{fill:none;stroke:var(--anatomy-mid);stroke-width:.7}
.es-dot{fill:var(--anatomy-dot)}
.es-bond{fill:none;stroke:var(--anatomy-hi);stroke-width:1.5;stroke-linecap:round}
.es-atom-bg{fill:var(--anatomy-card)}
.es-atom{fill:var(--anatomy-strong);font:600 12px var(--anatomy-mono)}
.es-methyl{fill:none;stroke:var(--anatomy-lit);stroke-width:1}
.es-chem-e2 .es-bond{stroke:var(--anatomy-lit)}
.es-arrow{fill:none;stroke:var(--anatomy-hi);stroke-width:1.4}
.es-arrow-head{fill:var(--anatomy-hi)}
.es-stalk{stroke:var(--anatomy-hi);stroke-width:1;fill:none}
.es-head{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.1;transition:fill .25s,stroke .25s}
.es-aro[data-state="engaged"] .es-head{fill:var(--anatomy-lit)}
.es-block{opacity:0;stroke:var(--anatomy-red);stroke-width:2;fill:none;stroke-linecap:round;transition:opacity .25s}
.es-aro[data-state="blocked"] .es-block{opacity:1}
.es-aro[data-state="blocked"] .es-head{stroke:var(--anatomy-red)}
.es-rec{opacity:calc(.45 + var(--on,0) * .55)}
.es-rec .bio-blob-edge{stroke:var(--anatomy-hi)}
.es-rec[style*="--on:1"] .bio-blob-base,.es-rec .bio-blob-highlight{fill:var(--anatomy-top)}
.es-dna{opacity:calc(.5 + var(--on,0) * .5)}
.es-particle{pointer-events:none}
.es-p-t{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.3}
.es-p-e{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1}
.es-p-halo{fill:var(--anatomy-lit)}
.es-track{fill:none;stroke:transparent}
.es-pulse{pointer-events:none}
.es-pulse-dot{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:.8}
.es-pulse-halo{fill:var(--anatomy-lit)}
.es-target-glow{fill:var(--anatomy-lit);filter:blur(8px);transition:opacity .3s;pointer-events:none}
.hot{cursor:help;outline:none}
.hot.is-hot{filter:drop-shadow(0 0 3px var(--anatomy-lit))}
.hot:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.es-controls{display:flex;flex-wrap:wrap;gap:14px 28px;align-items:center;margin:14px 2px 6px;font:12.5px var(--anatomy-mono);color:var(--anatomy-text)}
.es-controls button{border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:inherit;padding:6px 10px;cursor:pointer;margin-left:auto}
.es-controls input[type=checkbox]{accent-color:var(--anatomy-lit);margin-right:6px}
.es-range{display:flex;flex-direction:column;gap:2px}
.es-range input{accent-color:var(--anatomy-lit);width:190px}
.es-ticks{display:flex;justify-content:space-between;color:var(--anatomy-muted);font-style:normal;font-size:11px}
.es-ticks i{font-style:normal}
.es-controls :focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.es-legend{font:12px var(--anatomy-mono);color:var(--anatomy-text);margin:6px 2px}
.es-legend svg{vertical-align:-3px}
.es-info{min-height:3.4em;font:12.5px/1.55 var(--anatomy-mono);color:var(--anatomy-strong);margin:8px 2px;border-left:2px solid var(--anatomy-faint);padding-left:10px}
.bio-sources{margin:20px 2px;color:var(--anatomy-muted);font-size:12.5px;line-height:1.65}
.bio-sources h2{font:600 13px var(--anatomy-mono);color:var(--anatomy-text);margin:0 0 8px}
.bio-sources ul{padding-left:18px}.bio-sources li{margin:6px 0}
.bio-sources a{color:var(--anatomy-text);text-underline-offset:2px}
@media(prefers-reduced-motion:reduce){.es-head,.es-block,.es-target-glow{transition:none}}
`;

const html = pageHtml({
  title: "Testosterone, Estradiol and Aggression",
  theme: light ? "light" : "dark",
  width: WIDTH + 40,
  body: `<style>${BIO_CSS}${style}</style>${framed}${controls}${sources}`,
  script,
});
const filename = light ? "estrogen-aggression-light.html" : "estrogen-aggression.html";
writeFileSync(join(HERE, filename), html);
console.log(`wrote ${filename}`);
