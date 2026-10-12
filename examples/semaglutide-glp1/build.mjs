import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIO_CSS, blobOf, blobSvg, membraneOf, membraneSvg } from "../../kit/blob.mjs";
import { branchPieces, branchSvg } from "../../kit/branch.mjs";
import { fitProjection, figureSvg, iso, pageHtml, pathOf, plateHtml } from "../../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");
const f1 = (v) => +v.toFixed(1);

const MODEL_SRC = `
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const exposure = (ligand, t) =>
  ligand === "native" ? (1 - Math.exp(-t / 450)) * Math.exp(-t / 5200)
  : ligand === "sema" ? (1 - Math.exp(-t / 800))
  : 0;
const occupancy = (c) => clamp(c * 1.2 / (c + 0.2));
const trigger = (g) => smooth(0.35, 0.7, g);
const rates = (T, s) => ({ glu: 0.4 * T, pot: 0.6 * T * s });
const lvl = (v) => (v < 0.06 ? 0 : v < 0.34 ? 1 : v < 0.67 ? 2 : 3);
const CAMP = ["baseline", "low", "moderate", "high"];
const INS = ["negligible", "low", "moderate", "high"];
const LIG = { none: "no ligand", native: "native GLP-1", sema: "semaglutide" };
function readout(ligand, g, s) {
  const T = trigger(g), r = rates(T, s), tot = r.glu + r.pot;
  const ins = T < 0.08 ? "negligible (glucose low)" : INS[lvl(tot)] + (s > 0.15 ? " · glucose-dependent" : " · glucose-driven");
  return LIG[ligand] + " · cAMP " + CAMP[lvl(s)] + " · insulin " + ins;
}
`;
const M = new Function(`${MODEL_SRC}; return { exposure, occupancy, trigger, rates, readout, lvl };`)();

const WA = 1000, HA = 540;
const ring = (c, rx, ry, z, phase = 0, n = 40, wob = 0.035) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + wob * Math.sin(a * 3 + phase) + wob * 0.5 * Math.cos(a * 5 - phase);
    return [c[0] + Math.cos(a) * rx * w, c[1] + Math.sin(a) * ry * w, z];
  });
const CELL = { c: [0, 0, 2], rx: 80, ry: 52 };
const CAP = [[-105, 72, 3], [-52, 72, 3], [0, 72, 3], [52, 72, 3], [105, 72, 3]];
const PA = fitProjection([...ring(CELL.c, CELL.rx, CELL.ry, 2), ...CAP, [-130, -50, 12], [130, -50, 12]], WA, HA, { pad: 60, headroom: 0, azimuth: 90, elevation: 52 });
const at = (p) => iso(p, PA);
const S = (p) => at(p).map(f1);
const edge = (a, k = 1, z = 2.4) => [CELL.c[0] + Math.cos(a) * CELL.rx * k, CELL.c[1] + Math.sin(a) * CELL.ry * k, z];
const outward = (a) => {
  const nx = Math.cos(a) / CELL.rx, ny = Math.sin(a) / CELL.ry, l = Math.hypot(nx, ny);
  const p = edge(a), q = [p[0] + (nx / l) * 6, p[1] + (ny / l) * 6, p[2]];
  const [x0, y0] = at(p), [x1, y1] = at(q), d = Math.hypot(x1 - x0, y1 - y0) || 1;
  return [(x1 - x0) / d, (y1 - y0) / d];
};

const cellBlob = blobOf(ring(CELL.c, CELL.rx, CELL.ry, 2, 0.4), PA, { tone: "hi", highlight: 0.8, shade: 0.9 });
const cellMem = membraneOf(ring(CELL.c, CELL.rx + 1.8, CELL.ry + 1.8, 2.2, 0.4), ring(CELL.c, CELL.rx - 0.2, CELL.ry - 0.2, 2.2, 0.4), PA, { tone: "mid" });
const NUC = { c: [30, -24, 4], rx: 19, ry: 13 };
const nucleus = blobOf(ring(NUC.c, NUC.rx, NUC.ry, 4, 1.1, 30), PA, { tone: "mid", highlight: 0.8, shade: 0.9 });
const nucEnv = membraneOf(ring(NUC.c, NUC.rx + 0.9, NUC.ry + 0.9, 4.1, 1.1, 30), ring(NUC.c, NUC.rx - 0.1, NUC.ry - 0.1, 4.1, 1.1, 30), PA, { tone: "lo" });
const MITO = { c: [-4, 6, 4.5], rx: 13, ry: 7 };
const mito = blobOf(ring(MITO.c, MITO.rx, MITO.ry, 4.5, 0.2, 20, 0.02), PA, { tone: "mid", highlight: 0.75, shade: 0.88 });
const capPieces = branchPieces(CAP, 10, PA, { maxLength: 24, spacing: 1.7 });

const A_REC = [2.22, 2.5, 2.78];
const A_SITE = [0.4, 0.74, 1.08];
const A_CAV = [0.57, 0.91];
const A_KATP = 1.42, A_GLUT = 1.78;

const receptors = A_REC.map((a) => ({ a, o: S(edge(a)), u: outward(a) }));
const granules = [];
A_SITE.forEach((a, si) => [0, 1].forEach((lv) => {
  const aa = a + (lv ? 0.17 : -0.02);
  granules.push({ a: aa, from: S(edge(aa, lv ? 0.5 : 0.42, 5)), to: S(edge(aa, 0.88, 5)), mem: S(edge(aa, 1.0, 3)) });
}));
const GR_R = 4.8;

const DATA = {
  rec: receptors,
  gran: granules,
  cap: CAP.map((p) => S([p[0], p[1] - 3, 5])),
  capTop: S([0, 72, 3]),
  ac: S(edge(1.98, 0.93, 4)),
  gas: S(edge(2.5, 0.84, 5)),
  pka: S([-40, 10, 6]),
  epac: S([-26, 24, 6]),
  mito: S(MITO.c),
  cav: A_CAV.map((a) => ({ o: S(edge(a)), u: outward(a), i: S(edge(a, 0.8, 5)) })),
  katp: { o: S(edge(A_KATP)), u: outward(A_KATP) },
  glut: { o: S(edge(A_GLUT)), u: outward(A_GLUT), i: S(edge(A_GLUT, 0.8, 5)) },
  site: A_SITE.map((a) => S(edge(a, 1.0, 3))),
  prime: S([24, 14, 6]),
};

const glyphFrame = (o, u) => ({ ox: o[0], oy: o[1], ux: u[0], uy: u[1], vx: -u[1], vy: u[0] });
const pt = (fr, a, b) => [f1(fr.ox + fr.ux * a + fr.vx * b), f1(fr.oy + fr.uy * a + fr.vy * b)];
const caps = (fr, bs, a0, a1, w, cls) =>
  bs.map((b) => { const p0 = pt(fr, a0, b), p1 = pt(fr, a1, b); return `<path class="${cls}" d="M${p0[0]} ${p0[1]}L${p1[0]} ${p1[1]}" stroke-width="${w}"/>`; }).join("");

function receptorGlyph(r, i) {
  const fr = glyphFrame(r.o, r.u);
  const tm = caps(fr, [-8.4, -2.8, 2.8, 8.4], -9, 9, 4.6, "sg-tm");
  const ecd = pt(fr, 24, 0);
  const stalk = `<path class="sg-stalk" d="M${pt(fr, 9, -3)[0]} ${pt(fr, 9, -3)[1]}L${pt(fr, 17, -3)[0]} ${pt(fr, 17, -3)[1]}M${pt(fr, 9, 3)[0]} ${pt(fr, 9, 3)[1]}L${pt(fr, 17, 3)[0]} ${pt(fr, 17, 3)[1]}"/>`;
  const rot = (Math.atan2(r.u[1], r.u[0]) * 180 / Math.PI).toFixed(1);
  return `<g class="sg-rec" data-slot="${i}">${stalk}${tm}<ellipse class="sg-ecd" cx="${ecd[0]}" cy="${ecd[1]}" rx="9.5" ry="8.5" transform="rotate(${rot} ${ecd[0]} ${ecd[1]})"/></g>`;
}
function channelGlyph(o, u, cls, w = 15) {
  const fr = glyphFrame(o, u);
  const left = caps(fr, [-w / 2 - 1.5], -7, 7, 4.2, "sg-ch");
  const right = caps(fr, [w / 2 + 1.5], -7, 7, 4.2, "sg-ch");
  const gate = `<path class="sg-gate" d="M${pt(fr, -1, -w / 2 + 1)[0]} ${pt(fr, -1, -w / 2 + 1)[1]}L${pt(fr, -1, w / 2 - 1)[0]} ${pt(fr, -1, w / 2 - 1)[1]}"/>`;
  return `<g class="${cls}">${left}${right}${gate}</g>`;
}

const dotAt = (x, y) => `<circle class="sg-dot" cx="${f1(x)}" cy="${f1(y)}" r="1.7"/>`;
const label = (text, [x, y], tx, ty, anchor = "start", extra = "") => {
  const w = text.length * 7.4;
  let ex, ey;
  if (anchor === "middle") { ex = tx; ey = ty > y ? ty - 13 : ty + 5; }
  else if (anchor === "end") { ex = tx + 4; ey = ty - 4; }
  else if (x > tx + w) { ex = tx + w + 5; ey = ty - 4; }
  else if (x < tx) { ex = tx - 5; ey = ty - 4; }
  else { ex = x; ey = ty > y ? ty - 13 : ty + 5; }
  return `<path class="sg-leader" d="M${f1(x)} ${f1(y)}L${f1(ex)} ${f1(ey)}"/>${dotAt(x, y)}<text class="sg-label ${extra}" x="${f1(tx)}" y="${f1(ty)}" text-anchor="${anchor}">${text}</text>`;
};

const pieces = (arr, tone) => arr.map((p) => branchSvg(p, { tone })).join("");
const hot = (info, inner, attrs = "") => `<g class="hot" tabindex="0" ${attrs} data-info="${info.replace(/"/g, "&quot;")}">${inner}</g>`;

const [hx, hy] = at([0, 20, 0]);

const bodyA = [
  `<ellipse class="sg-halo" cx="${f1(hx)}" cy="${f1(hy + 120)}" rx="380" ry="46"/>`,
  hot("Islet capillary (schematic). Hormones and glucose arrive in the blood; insulin leaves into it. Native GLP-1 is rapidly cleaved from its N-terminus (Deacon et al. 1995); semaglutide is stabilised against DPP-4 and is more than 99% albumin-bound in plasma (FDA label).", pieces(capPieces, "lo")),
  `<g id="flow"></g>`,
  blobSvg(cellBlob),
  hot("Pancreatic beta cell: the insulin-secreting cell of the islet (schematic outline, not to scale).", membraneSvg(cellMem)),
  blobSvg(nucleus), membraneSvg(nucEnv),
  hot("Mitochondrion: glucose metabolism raises ATP. In the beta cell, higher ATP closes KATP channels, which depolarises the cell and opens voltage-gated Ca2+ channels: this is the glucose trigger for insulin granule exocytosis (Rorsman and Ashcroft 2018).", blobSvg(mito), 'id="mito"'),
  `<g id="granules"></g>`,
  `<g id="signal"></g>`,
  hot("GLUT: glucose transporter (schematic). Glucose entering the beta cell is what makes the secretion response glucose-dependent.", channelGlyph(DATA.glut.o, DATA.glut.u, "sg-glut")),
  hot("KATP channel (schematic). Open at low glucose, it holds the cell hyperpolarised. Rising ATP closes it; with the cell depolarised, Ca2+ channels open. GLP-1R signalling does not replace this glucose trigger.", channelGlyph(DATA.katp.o, DATA.katp.u, "sg-katp")),
  DATA.cav.map((c, i) => hot("Voltage-gated Ca2+ channel (schematic). Ca2+ entry triggers insulin granule exocytosis; it opens only after the glucose-driven depolarisation. cAMP (PKA / Epac2) amplifies the response to this Ca2+, it does not start it.", channelGlyph(c.o, c.u, "sg-cav", 12))).join(""),
  hot("GLP-1 receptor (GLP-1R): a class B G-protein-coupled receptor with a large extracellular domain and 7 transmembrane helices. Native GLP-1 or semaglutide is clasped between the extracellular domain and the helix bundle; the receptor couples mainly to Gαs (Zhang et al. 2017).", receptors.map(receptorGlyph).join(""), 'id="recs"'),
  `<g id="docked"></g>`,
  hot("Gαs → adenylyl cyclase → cAMP. Receptor activation makes Gαs stimulate adenylyl cyclase, raising cAMP. cAMP acts through both PKA and Epac2 (an exchange factor) to potentiate Ca2+-dependent exocytosis (Holz 2004).", `<ellipse id="gas" class="sg-gas" cx="${DATA.gas[0]}" cy="${DATA.gas[1]}" rx="11" ry="7.5"/><ellipse id="ac" class="sg-ac" cx="${DATA.ac[0]}" cy="${DATA.ac[1]}" rx="10" ry="7"/>`),
  hot("PKA and Epac2: the two cAMP effectors in the beta cell. They sensitise the granule release machinery and Ca2+ handling, so a given glucose-driven Ca2+ signal releases more insulin (Holz 2004). Simplified: other effects (e.g. Ca2+ release from stores, gene expression) are omitted.", `<circle id="pka" class="sg-node" cx="${DATA.pka[0]}" cy="${DATA.pka[1]}" r="8"/><circle id="epac" class="sg-node" cx="${DATA.epac[0]}" cy="${DATA.epac[1]}" r="8"/>`),
  `<g id="cmap"></g><g id="ins"></g>`,
  label("GLP-1 receptor (class B GPCR)", S(edge(A_REC[2], 1, 3)), 20, 232, "start", "sg-name"),
  label("Gαs → adenylyl cyclase → cAMP", DATA.gas, 20, 182, "start"),
  label("PKA / Epac2", [DATA.pka[0], DATA.pka[1] - 8], 364, 132, "middle"),
  label("mitochondrion (ATP)", [DATA.mito[0], DATA.mito[1] - 5], 500, 100, "middle"),
  label("nucleus", S([NUC.c[0] + 4, NUC.c[1] - NUC.ry, 5]), 700, 112, "middle"),
  label("beta cell", S(edge(5.55, 1, 2)), 850, 170, "start", "sg-name"),
  `<path id="gl-line" class="sg-leader" d="M${DATA.gran[0].from[0]} ${DATA.gran[0].from[1]}L795 232"/><circle id="gl-dot" class="sg-dot" cx="${DATA.gran[0].from[0]}" cy="${DATA.gran[0].from[1]}" r="1.7"/><text class="sg-label sg-name" x="800" y="236">insulin granules</text>`,
  label("Ca²⁺ channel", DATA.cav[0].o, 830, 316, "start"),
  label("glucose transporter", DATA.glut.o, 330, 506, "middle"),
  label("KATP channel", DATA.katp.o, 590, 506, "middle"),
  label("islet capillary (blood)", S([95, 72, 3]), 850, 506, "middle"),
].join("");

const svgA = figureSvg({
  width: WA, height: HA, className: "sg-fig sg-a",
  label: "Schematic of a pancreatic beta cell beside an islet capillary. GLP-1 receptors, class B G-protein-coupled receptors, sit in the cell membrane. When native GLP-1 or semaglutide binds, Gαs activates adenylyl cyclase, cAMP rises and activates PKA and Epac2, which potentiate insulin granule exocytosis, but only when glucose has driven the KATP and calcium channel trigger.",
  body: bodyA,
});

const WB = 520, HB = 545;
const SEQ_N = "HAEGTFTSDVSSYLEGQAAKEFIAWLVKGRG";
const SEQ_S = "H-EGTFTSDVSSYLEGQAAK*EFIAWLVRGRG".replace("-", "B");
const BX = (i) => 26 + i * 15.6;
const BY = (i, y) => y + 7 * Math.sin(i * 0.72);
const beadsRow = (y, cls, seq) => seq.split("").map((ch, i) => {
  const res = 7 + i;
  const special = (cls === "n" && (res === 8 || res === 26 || res === 34)) || (cls === "s" && (res === 8 || res === 26 || res === 34));
  const kind = cls === "s" ? (res === 8 || res === 34 ? "mod" : res === 26 ? "acyl" : "") : (res === 8 ? "cut" : res === 26 || res === 34 ? "key" : "");
  return `<circle class="sg-bead ${kind}" data-res="${res}" cx="${f1(BX(i))}" cy="${f1(BY(i, y))}" r="${special ? 6.2 : 5.2}"/>`;
}).join("");
const link = (y) => `<path class="sg-chain" d="M${Array.from({ length: 31 }, (_, i) => `${f1(BX(i))} ${f1(BY(i, y))}`).join("L")}"/>`;
const NY = 96, SY = 214;
const k26x = BX(19), k26y = BY(19, SY);
const zig = (x, y0, n, step, amp) => `M${x} ${y0}` + Array.from({ length: n }, (_, i) => `L${f1(x + (i % 2 ? amp : -amp))} ${f1(y0 + (i + 1) * step)}`).join("");
const cleave = `<path class="sg-cut" d="M${f1((BX(1) + BX(2)) / 2)} ${f1(NY - 22)}L${f1((BX(1) + BX(2)) / 2)} ${f1(NY + 22)}"/>`;
const plotX0 = 62, plotY0 = 428, plotW = 420, plotH = 70;
const curve = (lig) => Array.from({ length: 61 }, (_, i) => { const t = (i / 60) * 24000; return `${f1(plotX0 + (i / 60) * plotW)} ${f1(plotY0 + plotH - M.exposure(lig, t) * plotH)}`; }).join("L");
const bodyB = [
  `<text class="sg-label sg-name" x="26" y="34">native GLP-1(7–37)</text>`,
  link(NY), beadsRow(NY, "n", SEQ_N),
  `<text class="sg-label" x="${f1(BX(0))}" y="${NY + 28}" text-anchor="middle">His7</text>`,
  `<text class="sg-label" x="${f1(BX(30))}" y="${NY + 28}" text-anchor="middle">Gly37</text>`,
  `<path class="sg-leader" d="M${f1(BX(19))} ${f1(BY(19, NY) + 6)}L${f1(BX(19))} ${NY + 18}"/><text class="sg-label" x="${f1(BX(19))}" y="${NY + 32}" text-anchor="middle">Lys26</text>`,
  `<path class="sg-leader" d="M${f1(BX(27))} ${f1(BY(27, NY) + 6)}L${f1(BX(27))} ${NY + 18}"/><text class="sg-label" x="${f1(BX(27))}" y="${NY + 32}" text-anchor="middle">Lys34</text>`,
  hot("Native GLP-1 (7–37): a 31-residue peptide hormone, numbered from His7. DPP-4 removes the N-terminal dipeptide after Ala8, giving the N-terminally truncated peptide, e.g. GLP-1(9–36)amide. Intact GLP-1 is rapidly lost in people after injection (Deacon et al. 1995); semaglutide is stabilised against DPP-4 (FDA label).", `<g class="sg-cleave">${cleave}</g>`),
  `<text class="sg-label sg-red" x="${f1(BX(1) + 4)}" y="${NY - 30}">DPP-4 cuts after Ala8</text>`,
  `<text class="sg-label sg-name" x="26" y="152">semaglutide</text>`,
  link(SY), beadsRow(SY, "s", SEQ_S),
  `<text class="sg-label sg-lit" x="${f1(BX(1)) + 2}" y="${SY - 34}" text-anchor="start">Aib8 (Ala8 replaced): DPP-4 resistant</text>`,
  `<path class="sg-leader" d="M${f1(BX(1))} ${f1(BY(1, SY) - 6)}L${f1(BX(1))} ${SY - 31}"/>`,
  `<path class="sg-leader" d="M${f1(BX(27))} ${f1(BY(27, SY) + 6)}L${f1(BX(27))} ${SY + 20}"/><text class="sg-label sg-lit" x="${f1(BX(27))}" y="${SY + 34}" text-anchor="middle">Arg34</text><text class="sg-label sg-muted" x="${f1(BX(27))}" y="${SY + 48}" text-anchor="middle">(native Lys34)</text>`,
  hot("Semaglutide: a GLP-1 analogue with two amino-acid substitutions (Aib at position 8, Arg at 34) and Lys26 acylated with a C18 fatty diacid through a linker. Aib8 stabilises it against DPP-4; the fatty diacid binds albumin, the main reason for its roughly 1-week half-life (FDA label; Lau et al. 2015). Bead chain is a schematic of the sequence, not a 3D structure.",
    `<path class="sg-sidechain" d="M${f1(k26x)} ${f1(k26y + 6)}L${f1(k26x)} ${SY + 22}"/>` +
    [0, 1, 2].map((j) => `<rect class="sg-link" x="${f1(k26x - 9)}" y="${SY + 22 + j * 15}" width="18" height="11" rx="5"/>`).join("") +
    `<path class="sg-diacid" d="${zig(f1(k26x), SY + 70, 9, 8, 4)}"/>` +
    `<path class="sg-diacid" d="M${f1(k26x - 3)} ${SY + 142}l-3 6M${f1(k26x + 3)} ${SY + 142}l3 6"/>` +
    `<ellipse class="sg-alb" cx="${f1(k26x + 8)}" cy="${SY + 158}" rx="92" ry="25"/>`),
  `<text class="sg-label" x="${f1(k26x - 16)}" y="${SY + 50}" text-anchor="end">γGlu + 2×OEG linker</text>`,
  `<text class="sg-label" x="${f1(k26x - 12)}" y="${SY + 100}" text-anchor="end">C18 fatty diacid</text>`,
  `<text class="sg-label sg-name" x="${f1(k26x + 8)}" y="${SY + 162}" text-anchor="middle">albumin</text>`,
  `<text class="sg-label sg-name" x="26" y="${plotY0 - 14}">at the receptor over time (schematic)</text>`,
  `<path class="sg-axis" d="M${plotX0} ${plotY0}V${plotY0 + plotH}H${plotX0 + plotW}"/>`,
  `<text class="sg-label sg-muted" x="${plotX0 - 6}" y="${plotY0 + 10}" text-anchor="end">more</text><text class="sg-label sg-muted" x="${plotX0 - 6}" y="${plotY0 + plotH}" text-anchor="end">none</text>`,
  `<path class="sg-curve sg-curve-n" d="M${curve("native")}"/><path class="sg-curve sg-curve-s" d="M${curve("sema")}"/>`,
  `<text class="sg-label" x="${plotX0 + 175}" y="${plotY0 + 46}" ><tspan class="sg-curve-label-n">native: DPP-4 cleaves it, fades</tspan></text>`,
  `<text class="sg-label" x="${plotX0 + 150}" y="${plotY0 + 24}"><tspan class="sg-curve-label-s">semaglutide: persists</tspan></text>`,
  `<line id="now" class="sg-now" x1="${plotX0}" x2="${plotX0}" y1="${plotY0 - 4}" y2="${plotY0 + plotH}"/><circle id="nowdot" class="sg-nowdot" cx="${plotX0}" cy="${plotY0 + plotH}" r="4"/>`,
  `<text class="sg-label sg-muted" x="${plotX0 + plotW}" y="${plotY0 + plotH + 18}" text-anchor="end">time, compressed (no units)</text>`,
].join("");
const svgB = figureSvg({
  width: WB, height: HB, className: "sg-fig sg-b",
  label: "Schematic bead chain of native GLP-1 7 to 37 above semaglutide. In native GLP-1 DPP-4 cuts after Ala8. In semaglutide, Ala8 is replaced by Aib, Lys34 by Arg, and Lys26 carries a linker and a C18 fatty diacid that binds albumin. Below, a schematic plot: native GLP-1 fades quickly at the receptor while semaglutide persists.",
  body: bodyB,
});

const WC = 520, HC = 545;
const TR = (p) => [f1(20 + 0.88 * p[0]), f1(58 + 0.88 * p[1])];
const smoothPath = (raw) => {
  const pts = raw.map(TR);
  const n = pts.length; let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${p2[1]}`;
  }
  return d + "Z";
};
const cerebrum = [[52, 190], [64, 130], [108, 84], [176, 58], [258, 52], [340, 66], [400, 104], [424, 160], [414, 214], [378, 250], [334, 262], [300, 256], [262, 262], [226, 258], [186, 254], [138, 246], [86, 228]];
const cerebellum = [[318, 238], [364, 240], [408, 258], [420, 290], [392, 316], [346, 322], [312, 300], [304, 268]];
const stem = [[250, 252], [302, 252], [318, 296], [322, 350], [296, 372], [270, 340], [256, 296]];
const REG = {
  nac: [158, 232], hyp: [214, 240], vta: [268, 262], nts: [298, 342],
};
for (const k of Object.keys(REG)) REG[k] = TR(REG[k]);
const _unused = {
};
const marker = (id, [x, y], strong) => `<g id="${id}" class="sg-mk ${strong ? "strong" : "weak"}"><circle class="sg-mk-halo" cx="${x}" cy="${y}" r="15"/>${strong ? `<circle class="sg-mk-dot" cx="${x}" cy="${y}" r="6"/>` : `<circle class="sg-mk-ring" cx="${x}" cy="${y}" r="6.5"/>`}</g>`;
const bodyC = [
  `<text class="sg-label sg-name" x="26" y="34">GLP-1 receptors in the brain (rodent focus)</text>`,
  `<text class="sg-label sg-muted" x="26" y="262">front</text>`,
  hot("Brain, schematic sagittal section (front is left). Region positions are approximate. GLP-1 receptors are widely distributed; this panel marks only the regions named in the cited work.", `<path class="sg-brain" d="${smoothPath(cerebrum)}"/><path class="sg-brain" d="${smoothPath(cerebellum)}"/><path class="sg-brain" d="${smoothPath(stem)}"/>`),
  hot("Hypothalamus (arcuate nucleus): in rodents, fluorescent liraglutide bound arcuate POMC/CART neurons and GLP-1R was needed for this uptake; semaglutide reached hypothalamus and brainstem through circumventricular organs rather than crossing the blood-brain barrier (Secher 2014; Gabery 2020). Appetite effects are linked to these circuits in animals.", marker("m-hyp", REG.hyp, true)),
  hot("Brainstem (area postrema, a circumventricular organ, and nucleus of the solitary tract): receives semaglutide directly in rat tissue studies and is activated by it (Gabery 2020). GLP-1 itself is made by neurons of the nucleus of the solitary tract (Alhadeff 2012).", marker("m-nts", REG.nts, true)),
  hot("Ventral tegmental area (VTA): reward circuit. GLP-1R is expressed here and, in rats, GLP-1R activation in VTA reduced food intake (Alhadeff 2012). Whether systemic semaglutide reaches or acts here is not established by these studies. Preclinical.", marker("m-vta", REG.vta, false)),
  hot("Nucleus accumbens (NAc): reward circuit. GLP-1R is expressed here and, in rats, local GLP-1R activation reduced intake of palatable food (Alhadeff 2012). Preclinical; human relevance of NAc action is not established.", marker("m-nac", REG.nac, false)),
  label("hypothalamus (arcuate)", REG.hyp, 215, 410, "middle"),
  label("VTA", REG.vta, 412, 318, "start"),
  label("nucleus accumbens", REG.nac, 92, 330, "middle"),
  label("area postrema / NTS", REG.nts, 336, 392, "start"),
  `<circle class="sg-mk-dot" cx="38" cy="446" r="5.5"/><text class="sg-label" x="52" y="450">engaged by GLP-1RA in rodent studies</text>`,
  `<circle class="sg-mk-ring" cx="38" cy="470" r="5.5"/><text class="sg-label" x="52" y="474">GLP-1R present; rodent local-activation data only</text>`,
  `<text class="sg-label sg-name" x="26" y="508">Addiction-related effects in people: still emerging.</text>`,
  `<text class="sg-label sg-muted" x="26" y="526">Only small phase 2 trials (n = 48, 50); mixed.</text>`,
].join("");
const svgC = figureSvg({
  width: WC, height: HC, className: "sg-fig sg-c",
  label: "Schematic sagittal brain with markers for the hypothalamus and brainstem, where GLP-1 receptor agonists are engaged in rodent studies, and the ventral tegmental area and nucleus accumbens, where GLP-1 receptors are present and rodent local activation changes food intake. A note says clinical addiction-related evidence is still emerging.",
  body: bodyC,
});

const framed = plateHtml({
  fig: "Fig 1",
  title: "semaglutide · GLP-1R mechanism",
  hint: "hover or focus a part · space: pause",
  readout: M.readout("sema", 0.9, M.occupancy(1)),
  caption: "Schematic, not to scale. Mechanism only: no doses, no outcomes, no comparisons between people or drugs. Educational, not medical advice.",
  body: `<div class="sg-a-wrap"><div class="sg-scroll">${svgA}</div></div>`,
});

const controls = `
<div class="sg-controls">
  <div class="sg-group" role="group" aria-label="Ligand"><span class="sg-gl">ligand</span>
    <button type="button" class="sg-lig" data-lig="none" aria-pressed="false">NONE</button>
    <button type="button" class="sg-lig" data-lig="native" aria-pressed="false">NATIVE GLP-1</button>
    <button type="button" class="sg-lig" data-lig="sema" aria-pressed="true">SEMAGLUTIDE</button>
  </div>
  <label class="sg-range"><span class="sg-gl">blood glucose (qualitative)</span><input id="glu" type="range" min="0" max="100" step="1" value="90" aria-valuetext="high"><span class="sg-ticks"><i>low</i><i>high</i></span></label>
  <button id="pause" type="button" aria-pressed="false">Pause motion</button>
</div>
<p class="sg-legend">
  <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true"><circle cx="8" cy="7" r="4" class="sg-p-lig"/></svg> GLP-1 or semaglutide
  <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true"><circle cx="6" cy="7" r="3.4" class="sg-p-lig"/><ellipse cx="15" cy="7" rx="5.5" ry="4" class="sg-p-alb"/></svg> semaglutide on albumin
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" class="sg-p-glu" transform="rotate(45 7 7)"/></svg> glucose
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="3" class="sg-p-camp"/></svg> cAMP
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="2.6" class="sg-p-ins"/></svg> insulin
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="3.2" class="sg-p-ca"/></svg> Ca²⁺
</p>
<p id="info" class="sg-info" aria-live="polite">Hover or focus a labelled part for a one-line explanation. Try low glucose with semaglutide: the receptor signal is high but insulin release is not triggered.</p>`;

const panels = `
<div class="sg-pair">
  <figure class="iso-figure sg-card"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1b</span><span class="iso-plate-corner" data-corner="title">the molecule</span></div>${svgB}</div></figure>
  <figure class="iso-figure sg-card"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1c</span><span class="iso-plate-corner" data-corner="title">appetite and reward</span></div>${svgC}</div></figure>
</div>`;

const sources = `<footer class="bio-sources">
<h2>Sources, and what is established</h2>
<p><strong>Educational only, not medical advice.</strong> This figure explains a mechanism. It gives no dosing, no schedule, no expected outcomes and no advice about who should or should not use any medicine. Talk to a clinician about medicines.</p>
<ul>
<li><strong>Numbers shown, and where they come from.</strong> <em>94% sequence homology to human GLP-1</em> (the label’s wording; consistent with 2 substitutions in the 31 residues 7–37, <a href="https://doi.org/10.1021/acs.jmedchem.5b00726">Lau et al., J Med Chem 2015</a>); <em>elimination half-life of approximately 1 week</em> and <em>more than 99% bound to plasma albumin</em>, both in patients with type 2 diabetes (<a href="https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79">FDA label for semaglutide injection, DailyMed set id adec4fd2-…, sections 11, 12.1, 12.3</a>, read version 20, June 2026). The positions 8, 26, 34 are residue numbers in the GLP-1(7–37) convention. n = 48 and n = 50 are trial sizes (below). No other number is shown.</li>
<li><strong>The molecule.</strong> The label states Ala8 is modified for DPP-4 stability, Lys26 carries a hydrophilic spacer and a C18 fatty diacid for albumin binding (the main protraction mechanism), and a minor change at 34 ensures only one fatty diacid attaches. Lau et al. report the two substitutions as Aib8 and Arg34 with acylation at Lys26. PubChem’s name for semaglutide (<a href="https://pubchem.ncbi.nlm.nih.gov/compound/56843331">CID 56843331</a>, molecular formula C187H291N45O59) lists a 2-amino-2-methylpropanoyl (Aib) residue second in the chain, an Arg at the Arg34 position, and the γGlu plus two 2-[2-(2-aminoethoxy)ethoxy]acetyl (OEG) linker leading to octadecanedioic acid on the Lys26 side chain, which is how the linker is drawn here. Native GLP-1 is cleaved at the N-terminus by DPP-4 (<a href="https://pubmed.ncbi.nlm.nih.gov/7657039/">Deacon et al., Diabetes 1995</a>: intact GLP-1 was extensively degraded to the N-terminally truncated (9–36)amide after subcutaneous or intravenous administration in people). The bead chain is a schematic of the sequence and is not a structure-based model.</li>
<li><strong>Receptor and signalling.</strong> GLP-1R is a class B GPCR that signals mainly through Gs; the peptide is clasped between the extracellular domain and the transmembrane bundle (<a href="https://pubmed.ncbi.nlm.nih.gov/28538729/">Zhang et al., Nature 2017, cryo-EM of GLP-1R–Gs</a>). GLP-1 raises cAMP in beta cells, which acts through PKA and through Epac2, and Epac couples cAMP to fast Ca²⁺-dependent exocytosis (<a href="https://pubmed.ncbi.nlm.nih.gov/14693691/">Holz, Diabetes 2004</a>). Glucose triggers secretion via metabolism, KATP channel closure, depolarisation and Ca²⁺ entry (<a href="https://pubmed.ncbi.nlm.nih.gov/29212789/">Rorsman and Ashcroft, Physiol Rev 2018</a>, which also notes mouse versus human beta-cell differences). The label states that semaglutide stimulates insulin and lowers glucagon secretion in a glucose-dependent manner: when glucose is high insulin secretion is stimulated. Reviewed for GLP-1 physiology in <a href="https://pubmed.ncbi.nlm.nih.gov/29617641/">Drucker, Cell Metab 2018</a>.</li>
<li><strong>Brain: appetite circuits (preclinical).</strong> In rodents, labelled liraglutide bound arcuate-nucleus neurons and needed GLP-1R (<a href="https://pubmed.ncbi.nlm.nih.gov/25202980/">Secher et al., J Clin Invest 2014</a>); semaglutide accessed brainstem, septal nucleus and hypothalamus through circumventricular organs without crossing the blood-brain barrier and activated several areas (<a href="https://pubmed.ncbi.nlm.nih.gov/32213703/">Gabery et al., JCI Insight 2020</a>).</li>
<li><strong>Brain: reward circuits (preclinical).</strong> In rats, GLP-1-producing neurons of the nucleus of the solitary tract project to the VTA and nucleus accumbens, and GLP-1R activation there reduced food intake, especially highly palatable food (<a href="https://pubmed.ncbi.nlm.nih.gov/22128031/">Alhadeff et al., Endocrinology 2012</a>). Those experiments did not test systemic semaglutide at these sites.</li>
<li><strong>Brain: people (early, mixed).</strong> One phase 2 randomised trial of once-weekly semaglutide in 48 non-treatment-seeking adults with alcohol use disorder reported lower alcohol intake in a laboratory task, with no change in average drinks per calendar day (<a href="https://pubmed.ncbi.nlm.nih.gov/39937469/">Hendershot et al., JAMA Psychiatry 2025</a>). A phase 2 randomised trial of oral semaglutide in 50 treatment-seeking adults reported no significant change in laboratory craving or drinks per day but fewer heavy drinking days (<a href="https://pubmed.ncbi.nlm.nih.gov/42522065/">Schacht et al., Am J Psychiatry 2026</a>). A systematic review describes the evidence for substance use disorders as promising but early, with preclinical and early clinical studies (<a href="https://pubmed.ncbi.nlm.nih.gov/41552827/">Völker et al., Front Pharmacol 2025</a>). Treat addiction-related effects as an open research question.</li>
</ul>
<p><strong>What was simplified.</strong> One beta cell and one capillary stand for the islet; mouse and human beta cells differ in channels and transporters (Rorsman and Ashcroft). Receptor numbers, sizes, positions and speeds are illustrative, and time is compressed. The glucose slider and the cAMP/insulin levels come from a qualitative model, not measurements: they show only that GLP-1R signalling potentiates a glucose-triggered response rather than starting it. Omitted: glucagon suppression, slowed gastric emptying, receptor internalisation and biased signalling, other incretin pathways, the vagus nerve, endothelial transport of the drug, all clinical risks and effects.</p>
<p>Preclinical means animal or cell work; clinical means studies in people. Do not read the brain panel as evidence about any effect in a person.</p>
</footer>`;

const script = `
${MODEL_SRC}
const DATA = ${JSON.stringify(DATA)};
const NS = "http://www.w3.org/2000/svg";
const A = document.querySelector(".sg-a"), B = document.querySelector(".sg-b"), C = document.querySelector(".sg-c");
const $ = (s, r = document) => r.querySelector(s);
const readoutEl = document.querySelector("[data-readout]");
const infoEl = document.getElementById("info");
const gluEl = document.getElementById("glu");
const pauseBtn = document.getElementById("pause");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const mk = (name, attrs, parent) => { const el = document.createElementNS(NS, name); for (const k in attrs) el.setAttribute(k, attrs[k]); parent.appendChild(el); return el; };
const ease = (u) => u * u * (3 - 2 * u);

let ligand = "sema", g = 0.9, tLig = 8000, sim = 0, playing = !reduce.matches, visible = true, last = 0, frame = 0, tour = !reduce.matches;
let s = 0;
const state = () => ({ ligand, g, s, t: tLig });
window.__sg = { setLigand: (l) => pick(l), setGlucose: (v) => { tour = false; g = v; gluEl.value = Math.round(v * 100); still(); }, state, model: { exposure, occupancy, trigger, rates, readout } };

const gFlow = $("#flow", A), gDock = $("#docked", A), gGran = $("#granules", A), gSig = $("#signal", A), gCmap = $("#cmap", A), gIns = $("#ins", A);
const capPath = DATA.cap;
const alongPts = (pts, u) => {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let want = Math.max(0, Math.min(1, u)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) { const f = seg[i] ? want / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
    want -= seg[i];
  }
  return pts[0];
};
const NLIG = 5, NGLU = 12;
const lig = Array.from({ length: NLIG }, (_, i) => {
  const gr = mk("g", { class: "sg-particle" }, gFlow);
  const alb = mk("ellipse", { class: "sg-p-alb", rx: 7, ry: 5, cx: 8, cy: 1 }, gr);
  const tail = mk("path", { class: "sg-p-tail", d: "M0 0 Q4 4 8 1" }, gr);
  const dot = mk("circle", { class: "sg-p-lig", r: 3.6 }, gr);
  return { gr, alb, tail, dot, off: i / NLIG, lane: (i % 3 - 1) * 4.2 };
});
const glu = Array.from({ length: NGLU }, (_, i) => {
  const gr = mk("g", { class: "sg-particle" }, gFlow);
  mk("rect", { class: "sg-p-glu", x: -3, y: -3, width: 6, height: 6, transform: "rotate(45)" }, gr);
  return { gr, off: (i * 0.618) % 1, lane: ((i * 7) % 5 - 2) * 3.2 };
});
const dock = DATA.rec.map((r, i) => {
  const gr = mk("g", { class: "sg-docked" }, gDock);
  const ux = r.u[0], uy = r.u[1], vx = -uy, vy = ux;
  const P = (a, b) => [(r.o[0] + ux * a + vx * b).toFixed(1), (r.o[1] + uy * a + vy * b).toFixed(1)];
  const p0 = P(15, -11), p1 = P(13, 0), p2 = P(15, 11);
  mk("path", { class: "sg-p-chain", d: "M" + p0.join(" ") + " Q" + p1.join(" ") + " " + p2.join(" ") }, gr);
  const d = P(11, 0);
  const dot = mk("circle", { class: "sg-p-lig", cx: d[0], cy: d[1], r: 3.8 }, gr);
  const a = P(34, 15), e = P(15, 11);
  const tail = mk("path", { class: "sg-p-tail", d: "M" + e.join(" ") + " Q" + P(26, 16).join(" ") + " " + a.join(" ") }, gr);
  const alb = mk("ellipse", { class: "sg-p-alb", cx: a[0], cy: a[1], rx: 8, ry: 5.5 }, gr);
  return { gr, alb, tail, dot };
});
const gr0 = DATA.gran.map((gd, i) => {
  const gr = mk("g", { class: "sg-gran" }, gGran);
  mk("circle", { class: "sg-gran-body", r: 10.5 }, gr);
  mk("circle", { class: "sg-gran-core", r: 5.2 }, gr);
  const flash = mk("circle", { class: "sg-gran-flash", r: 12 }, gr);
  return { gr, flash, u: (i / DATA.gran.length) * 0.62, rest: 0 };
});
const cAMP = Array.from({ length: 8 }, (_, i) => ({ el: mk("circle", { class: "sg-p-camp", r: 2.8 }, gCmap), off: i / 8, tgt: i % 2 }));
const prime = Array.from({ length: 6 }, (_, i) => ({ el: mk("circle", { class: "sg-p-prime", r: 3.2 }, gCmap), off: i / 6 }));
const ca = Array.from({ length: 6 }, (_, i) => ({ el: mk("circle", { class: "sg-p-ca", r: 3.2 }, gSig), off: i / 6, ch: i % 2 }));
const insp = Array.from({ length: 12 }, () => ({ el: mk("circle", { class: "sg-p-ins", r: 2.6 }, gIns), age: -1, x: 0, y: 0, dx: 0 }));
const mapCamp = { ac: $("#ac", A), gas: $("#gas", A), pka: $("#pka", A), epac: $("#epac", A), recs: $("#recs", A), mito: $("#mito", A) };
const katp = A.querySelector(".sg-katp"), cavs = [...A.querySelectorAll(".sg-cav")], glut = A.querySelector(".sg-glut");
const nowLine = $("#now", B), nowDot = $("#nowdot", B);
const mNodes = ["#m-hyp", "#m-nts", "#m-vta", "#m-nac"].map((q) => $(q, C));
const PLOT = { x0: ${plotX0}, y0: ${plotY0}, w: ${plotW}, h: ${plotH}, T: 24000 };
let nextIns = 0, shown = "";
const buttons = [...document.querySelectorAll(".sg-lig")];
const levelName = (v) => (v < 0.1 ? "none" : v < 0.5 ? "partial" : "full");

function draw(dt) {
  const c = exposure(ligand, tLig);
  const occ = occupancy(c);
  s += (occ - s) * (dt >= 1000 ? 1 : 1 - Math.exp(-dt / 900));
  const T = trigger(g), r = rates(T, s), tot = r.glu + r.pot;
  const nGlu = Math.round(2 + g * 10);
  glu.forEach((p, i) => {
    if (i >= nGlu) { p.gr.style.opacity = 0; return; }
    const u = ((sim / 11000) + p.off) % 1;
    const q = alongPts(capPath, u);
    p.gr.setAttribute("transform", "translate(" + q[0].toFixed(1) + " " + (q[1] + p.lane).toFixed(1) + ")");
    p.gr.style.opacity = (u < 0.04 ? u / 0.04 : u > 0.96 ? (1 - u) / 0.04 : 1).toFixed(2);
  });
  const isNative = ligand === "native", isSema = ligand === "sema";
  lig.forEach((p, i) => {
    const vis = ligand !== "none" && c > 0.03;
    if (!vis) { p.gr.style.opacity = 0; return; }
    const u = ((sim / 9000) + p.off) % 1;
    const q = alongPts(capPath, u);
    p.gr.setAttribute("transform", "translate(" + (q[0] - 4).toFixed(1) + " " + (q[1] + p.lane - 2).toFixed(1) + ")");
    const edgeFade = u < 0.04 ? u / 0.04 : u > 0.96 ? (1 - u) / 0.04 : 1;
    p.gr.style.opacity = (Math.min(1, c * 1.4) * edgeFade).toFixed(2);
    p.alb.style.display = p.tail.style.display = isSema ? "" : "none";
  });
  DATA.rec.forEach((rc, i) => {
    const on = Math.max(0, Math.min(1, occ * 3 - i * 0.9));
    dock[i].gr.style.opacity = ligand === "none" ? 0 : on.toFixed(2);
    dock[i].alb.style.display = dock[i].tail.style.display = isSema ? "" : "none";
  });
  mapCamp.recs.style.setProperty("--on", occ.toFixed(2));
  mapCamp.gas.style.setProperty("--on", s.toFixed(2));
  mapCamp.ac.style.setProperty("--on", s.toFixed(2));
  mapCamp.pka.style.setProperty("--on", s.toFixed(2));
  mapCamp.epac.style.setProperty("--on", s.toFixed(2));
  mapCamp.mito.style.setProperty("--on", T.toFixed(2));
  katp.style.setProperty("--on", T.toFixed(2));
  cavs.forEach((e) => e.style.setProperty("--on", T.toFixed(2)));
  glut.style.setProperty("--on", Math.min(1, g * 1.1).toFixed(2));
  cAMP.forEach((p, i) => {
    const n = Math.round(s * 8);
    if (i >= n) { p.el.style.opacity = 0; return; }
    const u = ((sim / 2400) + p.off) % 1;
    const tgt = p.tgt ? DATA.epac : DATA.pka;
    const q = [DATA.ac[0] + (tgt[0] - DATA.ac[0]) * ease(u), DATA.ac[1] + (tgt[1] - DATA.ac[1]) * ease(u) + Math.sin(u * 6.28 + i) * 3];
    p.el.setAttribute("cx", q[0].toFixed(1)); p.el.setAttribute("cy", q[1].toFixed(1));
    p.el.style.opacity = (u < 0.1 ? u / 0.1 : u > 0.88 ? (1 - u) / 0.12 : 1).toFixed(2);
  });
  prime.forEach((p, i) => {
    const n = Math.round(s * 6);
    if (i >= n) { p.el.style.opacity = 0; return; }
    const u = ((sim / 2600) + p.off) % 1;
    const from = i % 2 ? DATA.epac : DATA.pka, to = DATA.prime;
    const q = [from[0] + (to[0] - from[0]) * ease(u), from[1] + (to[1] - from[1]) * ease(u)];
    p.el.setAttribute("cx", q[0].toFixed(1)); p.el.setAttribute("cy", q[1].toFixed(1));
    p.el.style.opacity = (u < 0.12 ? u / 0.12 : u > 0.85 ? (1 - u) / 0.15 : 1).toFixed(2);
  });
  ca.forEach((p, i) => {
    const n = Math.round(T * 6);
    if (i >= n) { p.el.style.opacity = 0; return; }
    const ch = DATA.cav[p.ch];
    const u = ((sim / 1700) + p.off) % 1;
    const x = ch.o[0] + ch.u[0] * 22 * (1 - u * 2), y = ch.o[1] + ch.u[1] * 22 * (1 - u * 2);
    p.el.setAttribute("cx", x.toFixed(1)); p.el.setAttribute("cy", y.toFixed(1));
    p.el.style.opacity = (u < 0.1 ? u / 0.1 : u > 0.8 ? (1 - u) / 0.2 : 1).toFixed(2);
  });
  gr0.forEach((p, i) => {
    const gd = DATA.gran[i];
    const sp = Math.max(tot, p.u > 0.72 ? 0.5 : 0);
    if (dt < 1000) p.u += dt * sp / 9500;
    if (p.u >= 1) {
      p.u -= 1;
      const free = insp.filter((q) => q.age < 0).slice(0, 3);
      free.forEach((q, k) => { q.age = 0; q.x = gd.mem[0] + (k - 1) * 4; q.y = gd.mem[1]; q.dx = (k - 1) * 4; });
    }
    const u = p.u;
    const move = Math.min(1, u / 0.72);
    const x = gd.from[0] + (gd.to[0] - gd.from[0]) * ease(move), y = gd.from[1] + (gd.to[1] - gd.from[1]) * ease(move);
    const fuse = u > 0.72 ? Math.min(1, (u - 0.72) / 0.18) : 0;
    p.gr.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") scale(" + (1 - fuse * 0.45).toFixed(2) + ")");
    p.gr.style.opacity = (u > 0.9 ? 1 - (u - 0.9) / 0.1 : u < 0.06 ? u / 0.06 : 1).toFixed(2);
    if (i === 0) { const gl = $("#gl-line", A), gd2 = $("#gl-dot", A); gl.setAttribute("d", "M" + x.toFixed(1) + " " + y.toFixed(1) + "L795 232"); gd2.setAttribute("cx", x.toFixed(1)); gd2.setAttribute("cy", y.toFixed(1)); }
    p.flash.style.opacity = (u > 0.72 && u < 0.92 ? Math.sin(((u - 0.72) / 0.2) * Math.PI) * 0.8 : 0).toFixed(2);
  });
  insp.forEach((q) => {
    if (q.age < 0) { q.el.style.opacity = 0; return; }
    q.age += dt < 1000 ? dt : 0;
    const u = q.age / 1800;
    if (u >= 1) { q.age = -1; q.el.style.opacity = 0; return; }
    q.el.setAttribute("cx", (q.x + q.dx * u * 2 + u * 22).toFixed(1));
    q.el.setAttribute("cy", (q.y + 14 * ease(Math.min(1, u * 1.6))).toFixed(1));
    q.el.style.opacity = (u > 0.7 ? (1 - u) / 0.3 : 1).toFixed(2);
  });
  const tx = Math.min(1, tLig / PLOT.T);
  nowLine.setAttribute("x1", (PLOT.x0 + tx * PLOT.w).toFixed(1)); nowLine.setAttribute("x2", (PLOT.x0 + tx * PLOT.w).toFixed(1));
  nowDot.setAttribute("cx", (PLOT.x0 + tx * PLOT.w).toFixed(1));
  nowDot.setAttribute("cy", (PLOT.y0 + PLOT.h - c * PLOT.h).toFixed(1));
  B.dataset.ligand = ligand; A.dataset.ligand = ligand; document.body.dataset.ligand = ligand;
  nowLine.style.opacity = nowDot.style.opacity = ligand === "none" ? 0 : 1;
  mNodes.forEach((m, i) => m.style.setProperty("--on", (i < 2 ? c : c * 0.0 + (ligand === "none" ? 0 : 0.0)).toFixed(2)));
  const text = readout(ligand, g, s);
  if (text !== shown) { shown = text; readoutEl.textContent = text; }
}

function tick(now) {
  frame = 0;
  if (!playing || !visible) return;
  const dt = Math.min(64, now - (last || now));
  last = now;
  sim += dt; tLig += dt;
  if (tour) { g = 0.5 + 0.5 * Math.sin(sim / 4200 - 1.2); gluEl.value = Math.round(g * 100); gluEl.setAttribute("aria-valuetext", g > 0.55 ? "high" : g < 0.4 ? "low" : "mid"); }
  draw(dt);
  frame = requestAnimationFrame(tick);
}
function still() { draw(1000); }
function start() { if (playing && visible && !frame) { last = 0; frame = requestAnimationFrame(tick); } }
function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; }
function pick(l) {
  ligand = l; tLig = l === "none" ? 0 : 0; tour = false;
  buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lig === l)));
  if (!playing || reduce.matches) { tLig = l === "native" ? 700 : 8000; s = occupancy(exposure(l, tLig)); }
  still();
}
buttons.forEach((b) => b.addEventListener("click", () => pick(b.dataset.lig)));
gluEl.addEventListener("input", () => { tour = false; g = gluEl.value / 100; gluEl.setAttribute("aria-valuetext", g > 0.55 ? "high" : g < 0.4 ? "low" : "mid"); if (!playing) still(); });
function setPlaying(v) {
  playing = v; pauseBtn.textContent = v ? "Pause motion" : "Play motion"; pauseBtn.setAttribute("aria-pressed", String(!v));
  if (v) start(); else { stop(); still(); }
}
pauseBtn.addEventListener("click", () => setPlaying(!playing));
document.addEventListener("keydown", (e) => {
  if (e.target.closest("button, a, input, textarea, select")) return;
  if (e.code === "Space") { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === "1") pick("none"); else if (e.key === "2") pick("native"); else if (e.key === "3") pick("sema");
});
reduce.addEventListener("change", () => setPlaying(!reduce.matches));
const idle = infoEl.textContent;
document.querySelectorAll(".hot").forEach((el) => {
  const on = () => { infoEl.textContent = el.dataset.info; el.classList.add("is-hot"); };
  const off = () => { infoEl.textContent = idle; el.classList.remove("is-hot"); };
  el.addEventListener("pointerenter", on); el.addEventListener("pointerleave", off);
  el.addEventListener("focus", on); el.addEventListener("blur", off);
});
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }).observe(A);
if (reduce.matches) { pauseBtn.textContent = "Play motion"; pauseBtn.setAttribute("aria-pressed", "true"); g = 0.9; gluEl.value = 90; s = occupancy(exposure(ligand, tLig)); sim = 3000; }
{ const sc = document.querySelector(".sg-scroll"); sc.scrollLeft = Math.max(0, (sc.scrollWidth - sc.clientWidth) / 2); }
still();
start();
`;

const style = `
.sg-a-wrap{padding:0}
.sg-scroll{overflow-x:auto}
.sg-fig{display:block;width:100%;height:auto}
.sg-a{min-width:760px}
.sg-fig .bio-blob-base{fill:var(--anatomy-shade-2)}
.sg-halo{fill:var(--anatomy-halo);opacity:var(--anatomy-halo-opacity);filter:blur(14px)}
.sg-label{fill:var(--anatomy-text);font:12px var(--anatomy-mono);letter-spacing:.01em}
.sg-label.sg-name{fill:var(--anatomy-strong);font-size:12.5px;font-weight:600}
.sg-label.sg-muted,.sg-muted{fill:var(--anatomy-muted)}
.sg-label.sg-red{fill:var(--anatomy-red)}
.sg-label.sg-lit{fill:var(--anatomy-strong)}
.sg-leader{fill:none;stroke:var(--anatomy-mid);stroke-width:.8}
.sg-dot{fill:var(--anatomy-dot)}
.sg-tm{stroke:var(--anatomy-hi);stroke-linecap:round;fill:none;opacity:.9}
.sg-stalk{stroke:var(--anatomy-mid);stroke-width:1.2;fill:none}
.sg-ecd{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.2}
.sg-rec{opacity:calc(.6 + var(--on,0) * .4)}
#recs{--on:0}
#recs .sg-tm{stroke:color-mix(in srgb,var(--anatomy-hi),var(--anatomy-lit) calc(var(--on,0) * 100%))}
.sg-ch{stroke:var(--anatomy-mid);stroke-linecap:round;fill:none}
.sg-gate{stroke:var(--anatomy-red);stroke-width:2.6;stroke-linecap:round;opacity:calc(1 - var(--on,0));transition:opacity .2s}
.sg-glut .sg-gate{stroke:var(--anatomy-mid);opacity:.6}
.sg-katp .sg-gate{opacity:calc(var(--on,0))}
.sg-katp .sg-ch,.sg-cav .sg-ch{stroke:var(--anatomy-hi)}
.sg-cav .sg-gate{opacity:calc(1 - var(--on,0));stroke:var(--anatomy-hi)}
.sg-gas,.sg-ac{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.2}
.sg-gas{fill:color-mix(in srgb,var(--anatomy-paper),var(--anatomy-lit) calc(var(--on,0) * 45%))}
.sg-ac{fill:color-mix(in srgb,var(--anatomy-paper),var(--anatomy-lit) calc(var(--on,0) * 45%))}
.sg-node{fill:color-mix(in srgb,var(--anatomy-paper),var(--anatomy-lit) calc(var(--on,0) * 55%));stroke:var(--anatomy-hi);stroke-width:1.2}
#mito .bio-blob-base{fill:color-mix(in srgb,var(--anatomy-shade-2),var(--anatomy-lit) calc(var(--on,0) * 25%))}
.sg-gran-body{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.2}
.sg-gran-core{fill:var(--anatomy-hi);opacity:.85}
.sg-gran-flash{fill:var(--anatomy-lit);opacity:0;pointer-events:none}
.sg-gran{pointer-events:none}
.sg-particle,.sg-docked{pointer-events:none}
.sg-p-lig{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1}
.sg-p-chain{fill:none;stroke:var(--anatomy-hi);stroke-width:1.4;stroke-linecap:round}
.sg-p-alb{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:1.1}
.sg-p-tail{fill:none;stroke:var(--anatomy-hi);stroke-width:1.2}
.sg-p-glu{fill:var(--anatomy-mid);stroke:var(--anatomy-hi);stroke-width:.9}
.sg-p-camp{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:.8}
.sg-p-prime{fill:none;stroke:var(--anatomy-lit);stroke-width:1.4}
.sg-p-ins{fill:var(--anatomy-green);stroke:var(--anatomy-paper);stroke-width:.8}
.sg-p-ca{fill:var(--anatomy-blue);stroke:var(--anatomy-paper);stroke-width:.8}
.sg-bead{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:1.1}
.sg-chain{fill:none;stroke:var(--anatomy-faint);stroke-width:1.4;position:relative}
.sg-bead.cut,.sg-bead.key{stroke:var(--anatomy-hi)}
.sg-bead.mod{fill:var(--anatomy-lit);stroke:var(--anatomy-paper)}
.sg-bead.acyl{fill:var(--anatomy-hi);stroke:var(--anatomy-lit)}
.sg-cut{stroke:var(--anatomy-red);stroke-width:2.2;stroke-linecap:round}
.sg-sidechain{stroke:var(--anatomy-hi);stroke-width:1.3;fill:none}
.sg-link{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.1}
.sg-diacid{fill:none;stroke:var(--anatomy-hi);stroke-width:1.4;stroke-linejoin:round;stroke-linecap:round}
.sg-alb{fill:var(--anatomy-shade-3);stroke:var(--anatomy-mid);stroke-width:1.1}
.sg-axis{fill:none;stroke:var(--anatomy-mid);stroke-width:1}
.sg-curve{fill:none;stroke-width:2;stroke-linecap:round}
.sg-curve-n{stroke:var(--anatomy-mid)}
.sg-curve-s{stroke:var(--anatomy-lit)}
.sg-curve-label-n{fill:var(--anatomy-text)}
.sg-curve-label-s{fill:var(--anatomy-strong)}
.sg-now{stroke:var(--anatomy-mid);stroke-width:1;stroke-dasharray:3 3}
.sg-nowdot{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1.2}
.sg-brain{fill:var(--anatomy-shade-2);stroke:var(--anatomy-mid);stroke-width:1.3;stroke-linejoin:round}
.sg-mk{--on:0}
.sg-mk-halo{fill:var(--anatomy-lit);opacity:calc(.08 + var(--on,0) * .34)}
.sg-mk-dot{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1.2}
.sg-mk-ring{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:1.5}
.sg-mk.weak .sg-mk-halo{opacity:.06}
svg.sg-c circle.sg-mk-dot,svg.sg-c circle.sg-mk-ring{pointer-events:none}
.hot{cursor:help;outline:none}
.hot.is-hot{filter:drop-shadow(0 0 3px var(--anatomy-lit))}
.hot:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.sg-controls{display:flex;flex-wrap:wrap;gap:14px 28px;align-items:center;margin:14px 2px 6px;font:12.5px var(--anatomy-mono);color:var(--anatomy-text)}
.sg-group{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sg-gl{color:var(--anatomy-muted);font-size:11.5px;margin-right:4px}
.sg-controls button{border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:inherit;padding:6px 10px;cursor:pointer}
.sg-controls button[aria-pressed="true"]{border-color:var(--anatomy-lit);color:var(--anatomy-strong)}
#pause{margin-left:auto}
.sg-range{display:flex;flex-direction:column;gap:2px}
.sg-range input{accent-color:var(--anatomy-lit);width:220px}
.sg-ticks{display:flex;justify-content:space-between;color:var(--anatomy-muted);font-size:11px}
.sg-ticks i{font-style:normal}
.sg-controls :focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.sg-legend{font:12px var(--anatomy-mono);color:var(--anatomy-text);margin:6px 2px;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center}
.sg-legend svg{vertical-align:-3px;margin-right:4px}
.sg-info{min-height:4.4em;font:12.5px/1.55 var(--anatomy-mono);color:var(--anatomy-strong);margin:8px 2px;border-left:2px solid var(--anatomy-faint);padding-left:10px}
.sg-pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}
.sg-card{margin:0}
.sg-card .iso-plate{padding:44px 14px 20px}
@media(max-width:820px){.sg-pair{grid-template-columns:1fr}}
@media(max-width:560px){.iso-plate-corner[data-corner="readout"]{white-space:normal;text-align:right;max-width:58%;line-height:1.3}.iso-plate-corner[data-corner="hint"]{max-width:36%;white-space:normal;line-height:1.3}.sg-b .sg-label,.sg-c .sg-label{font-size:14px}.sg-pair .iso-plate{padding:40px 8px 16px}}
.bio-sources{margin:20px 2px;color:var(--anatomy-muted);font-size:12.5px;line-height:1.65}
.bio-sources h2{font:600 13px var(--anatomy-mono);color:var(--anatomy-text);margin:0 0 8px}
.bio-sources ul{padding-left:18px}.bio-sources li{margin:6px 0}
.bio-sources a{color:var(--anatomy-text);text-underline-offset:2px;overflow-wrap:anywhere}
@media(prefers-reduced-motion:reduce){.sg-gate{transition:none}}
`;

const html = pageHtml({
  title: "Semaglutide and the GLP-1 receptor",
  theme: light ? "light" : "dark",
  width: 1100,
  body: `<style>${BIO_CSS}${style}</style>${framed}${controls}${panels}${sources}`,
  script,
});
const filename = light ? "semaglutide-glp1-light.html" : "semaglutide-glp1.html";
writeFileSync(join(HERE, filename), html);
console.log(`wrote ${filename}`);
