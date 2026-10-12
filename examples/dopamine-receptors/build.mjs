import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIO_CSS, blobOf, blobSvg, membraneOf, membraneSvg } from "../../kit/blob.mjs";
import { figureSvg, pageHtml, pathOf, plateHtml } from "../../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");
const WIDTH = 960;
const HEIGHT = 640;

function model(level, antagonist) {
  const occ1 = [0.08, 0.35, 0.8][level];
  const occ2raw = [0.5, 0.85, 0.97][level];
  const occ2 = antagonist ? [0.03, 0.06, 0.15][level] : occ2raw;
  const stim = occ1;
  const inh = 0.8 * occ2;
  const camp = Math.max(0, Math.min(1, 0.5 + 0.5 * (stim - inh)));
  const d1 = occ1 < 0.15 ? "D1 ~baseline" : "D1 cAMP up";
  const d2 = antagonist && occ2 < 0.2 ? "D2 blocked" : occ2 < 0.15 ? "D2 ~baseline" : "D2 cAMP down";
  return { occ1, occ2, stim, inh, camp, pka: camp > 0.62, readout: `${d1} · ${d2}` };
}
for (const [lv, an, want] of [[0, false, "D1 ~baseline · D2 cAMP down"], [2, false, "D1 cAMP up · D2 cAMP down"], [2, true, "D1 cAMP up · D2 blocked"], [1, true, "D1 cAMP up · D2 blocked"]]) {
  const r = model(lv, an).readout;
  if (r !== want) throw new Error(`model readout ${r} != ${want}`);
}
if (!(model(2, true).camp > model(2, false).camp)) throw new Error("blocking D2 must not lower cAMP");

const FP = { origin: [0, 0], scale: 1 / Math.sqrt(1.6), azimuth: 90, elevation: 0 };
const W = (x, y) => [x, 0, -y];
const ringE = (cx, cy, rx, ry, n = 30, phase = 0, wob = 0.035) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + wob * Math.sin(a * 3 + phase) + (wob / 2) * Math.cos(a * 5 - phase);
    return W(cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w);
  });
const ringS = (cx, cy, rx, ry, pw = 3, n = 56) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    return W(cx + Math.sign(c) * Math.abs(c) ** (2 / pw) * rx, cy + Math.sign(s) * Math.abs(s) ** (2 / pw) * ry);
  });
const f1 = (v) => +v.toFixed(1);

const MEM = { y0: 300, y1: 326 };
const D1X = 165, D2X = 795, ACX = 480;
const SITES = [420, 560];
const TERM = { cx: 480, cy: 114, rx: 236, ry: 96 };
const VES = [[298, 106], [420, 188], [440, 108], [560, 188], [612, 112], [662, 160], [350, 150], [510, 128]];
const AC_BLOB = { cx: ACX, cy: 362, rx: 62, ry: 32 };
const REC = {
  d1: { cx: D1X, home: [D1X + 24, 354], bg: [D1X - 26, 358], dock: [410, 366], dir: 1, name: "D1", alpha: "Gαs/olf", accent: "green" },
  d2: { cx: D2X, home: [D2X - 24, 354], bg: [D2X + 26, 358], dock: [550, 366], dir: -1, name: "D2", alpha: "Gαi/o", accent: "red" },
};
const PKA = { cx: ACX, cy: 536 };

const terminalBlob = blobOf(ringS(TERM.cx, TERM.cy, TERM.rx - 4, TERM.ry - 4, 3), FP, { tone: "hi", id: "terminal", highlight: 0.85, shade: 0.93 });
const terminalMembrane = membraneOf(ringS(TERM.cx, TERM.cy, TERM.rx + 2, TERM.ry + 2, 3), ringS(TERM.cx, TERM.cy, TERM.rx - 4, TERM.ry - 4, 3), FP, { tone: "mid" });
const vesicles = VES.map(([x, y], i) => ({ x, y, blob: blobOf(ringE(0, 0, 16, 16, 22, i, 0.02), FP, { tone: "lit", highlight: 0.62, shade: 0.9 }) }));
const alphaBlob = (i) => blobOf(ringE(0, 0, 31, 20, 26, i, 0.03), FP, { tone: "hi", highlight: 0.7, shade: 0.9 });
const bgBlob = (i) => blobOf(ringE(0, 0, 19, 15, 22, i, 0.03), FP, { tone: "mid", highlight: 0.7, shade: 0.9 });
const acBlob = blobOf(ringE(AC_BLOB.cx, AC_BLOB.cy, AC_BLOB.rx, AC_BLOB.ry, 36, 0.7, 0.02), FP, { tone: "hi", id: "ac", highlight: 0.8, shade: 0.92 });
const pkaR = blobOf(ringE(0, 0, 23, 14, 24, 0.4, 0.02), FP, { tone: "mid", highlight: 0.7, shade: 0.9 });
const pkaC = (i) => blobOf(ringE(0, 0, 20, 17, 24, i + 1, 0.03), FP, { tone: "hi", highlight: 0.7, shade: 0.9 });

const HX = [-39, -26, -13, 0, 13, 26, 39];
const HTOP = [300, 296, 292, 304, 292, 296, 300];
const HBOT = [330, 334, 337, 333, 337, 334, 330];
const capsule = (x, y0, y1, w) =>
  `<rect class="dr-hx" x="${f1(x - w / 2)}" y="${y0}" width="${w}" height="${y1 - y0}" rx="${w / 2}"/><path class="dr-hx-hi" d="M${f1(x - w / 4)} ${y0 + 7}V${y1 - 7}"/>`;
const receptor = (cx) => {
  const order = [0, 6, 1, 5, 2, 4, 3];
  return order.map((i) => capsule(cx + HX[i], HTOP[i], HBOT[i], 11)).join("");
};
const acHelices = () => {
  const out = [];
  for (const [x0, n] of [[410, 6], [495, 6]]) for (let i = 0; i < n; i++) out.push(capsule(x0 + i * 10, 296 + (i % 2) * 3, 336 - (i % 2) * 2, 9));
  return out.join("");
};

const dotAt = (x, y) => `<circle class="dr-dot" cx="${x}" cy="${y}" r="1.7"/>`;
const label = (text, [tx, ty], [px, py], anchor = "start", cls = "") => {
  const sx = anchor === "end" ? tx + 4 : anchor === "start" ? tx - 4 : tx;
  const sy = anchor === "middle" ? (py < ty ? ty - 13 : ty + 4) : ty - 4;
  return `<path class="dr-leader" d="${pathOf([[sx, sy], [px, py]])}"/>${dotAt(px, py)}<text class="dr-label ${cls}" x="${tx}" y="${ty}" text-anchor="${anchor}">${text}</text>`;
};

function dopamine() {
  const L = 26, c = [70, 100];
  const v = (k) => [c[0] + Math.cos(((-90 + 60 * k) * Math.PI) / 180) * L, c[1] + Math.sin(((-90 + 60 * k) * Math.PI) / 180) * L];
  const dir = (deg) => [Math.cos((deg * Math.PI) / 180) * L, Math.sin((deg * Math.PI) / 180) * L];
  const add = (p, d) => [p[0] + d[0], p[1] + d[1]];
  const V = [0, 1, 2, 3, 4, 5].map(v);
  const Ca = add(V[1], dir(-30)), Cb = add(Ca, dir(30)), N = add(Cb, dir(-30));
  const O3 = add(V[3], dir(90)), O4 = add(V[4], dir(150));
  const bond = (a, b) => `<path class="dr-bond" d="${pathOf([a, b])}"/>`;
  const inner = (a, b) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, vx = c[0] - mx, vy = c[1] - my, d = Math.hypot(vx, vy);
    const o = 4.4, s = 0.16;
    const p = (Q, R) => [Q[0] + (R[0] - Q[0]) * s + (vx / d) * o, Q[1] + (R[1] - Q[1]) * s + (vy / d) * o];
    return `<path class="dr-bond" d="${pathOf([p(a, b), p(b, a)])}"/>`;
  };
  let out = "";
  for (let k = 0; k < 6; k++) out += bond(V[k], V[(k + 1) % 6]);
  out += inner(V[0], V[1]) + inner(V[2], V[3]) + inner(V[4], V[5]);
  out += bond(V[1], Ca) + bond(Ca, Cb) + bond(Cb, N) + bond(V[3], O3) + bond(V[4], O4);
  const atom = (p, t, sub) => `<circle class="dr-atom-bg" cx="${f1(p[0])}" cy="${f1(p[1])}" r="9"/><text class="dr-atom" x="${f1(p[0])}" y="${f1(p[1] + 4)}" text-anchor="middle">${t}${sub ? `<tspan class="dr-sub" dy="3">${sub}</tspan>` : ""}</text>`;
  out += atom(O3, "OH") + atom(O4, "OH") + atom(N, "NH", "2");
  return `<g class="hot" tabindex="0" data-info="Dopamine, 4-(2-aminoethyl)benzene-1,2-diol, C8H11NO2 (PubChem CID 681): a catechol ring (two adjacent OH groups) with an ethylamine side chain. Flat skeletal formula; bond angles and lengths are drawn schematically. In the synapse below a dopamine molecule is drawn as a small bright dot." aria-label="Dopamine structural formula">${out}</g>`
    + `<text class="dr-label dr-name" x="${f1(c[0] + 45)}" y="188" text-anchor="middle">dopamine</text><text class="dr-label dr-muted" x="${f1(c[0] + 45)}" y="204" text-anchor="middle">C<tspan class="dr-sub" dy="3">8</tspan><tspan dy="-3">H</tspan><tspan class="dr-sub" dy="3">11</tspan><tspan dy="-3">NO</tspan><tspan class="dr-sub" dy="3">2</tspan></text>`;
}

const chip = (id, text, cls) => `<g id="${id}" class="dr-chip ${cls}"><rect x="-17" y="-8" width="34" height="16" rx="8"/><text x="0" y="4" text-anchor="middle">${text}</text></g>`;
const alphaGroup = (key, i) => {
  const r = REC[key];
  return `<g id="${key}-alpha" class="dr-alpha" transform="translate(${r.home[0]} ${r.home[1]})">${blobSvg(alphaBlob(i))}<text class="dr-prot" x="0" y="4" text-anchor="middle">${r.alpha}</text><g transform="translate(0 26)">${chip(`${key}-gdp`, "GDP", "dr-gdp")}${chip(`${key}-gtp`, "GTP", "dr-gtp")}</g></g>`;
};
const bgGroup = (key, i) => {
  const r = REC[key];
  return `<g class="dr-bg" transform="translate(${r.bg[0]} ${r.bg[1]})">${blobSvg(bgBlob(i))}<text class="dr-prot" x="0" y="4" text-anchor="middle">βγ</text></g>`;
};
const rail = (key) => {
  const r = REC[key];
  const x1 = r.home[0], x2 = r.dir > 0 ? AC_BLOB.cx - AC_BLOB.rx : AC_BLOB.cx + AC_BLOB.rx;
  const y2 = 366;
  const head = r.dir > 0 ? `M${x2} ${y2}l-9 -4.5v9z` : `M${x2} ${y2}l9 -4.5v9z`;
  return `<path class="dr-rail dr-rail-${r.accent}" d="${pathOf([[x1, r.home[1]], [x2, y2]])}"/><path class="dr-rail-head dr-rail-${r.accent}" d="${head}"/>`;
};

const lipid = `<pattern id="lipid" x="0" y="${MEM.y0}" width="9" height="${MEM.y1 - MEM.y0}" patternUnits="userSpaceOnUse">
<circle class="dr-head" cx="4.5" cy="4" r="3"/><circle class="dr-head" cx="4.5" cy="22" r="3"/>
<path class="dr-tail" d="M3.6 7V13M5.4 7V13M3.6 19V13M5.4 19V13"/></pattern>`;

const cellPath = `M30 ${MEM.y0}H930V600Q930 630 900 630H60Q30 630 30 600Z`;
const body = [
  `<defs>${lipid}</defs>`,
  `<ellipse class="dr-halo" cx="480" cy="626" rx="430" ry="16"/>`,
  `<g class="hot" tabindex="0" data-info="Dopamine-releasing terminal, e.g. from nigrostriatal neurons (substantia nigra to striatum). Dopamine is packed into vesicles by VMAT2 and released by exocytosis; the dopamine transporter (DAT) takes it back up into the terminal. Reuptake and breakdown are not animated.">${blobSvg(terminalBlob)}${membraneSvg(terminalMembrane)}</g>`,
  `<text class="dr-label dr-name" x="480" y="50" text-anchor="middle">dopamine-releasing terminal</text>`,
  ...vesicles.map((v, i) => {
    const dots = [[-6, -4], [5, -6], [-1, 3], [7, 4], [-8, 6]].map(([a, b]) => `<circle class="dr-vdot" cx="${a}" cy="${b}" r="2.1"/>`).join("");
    const dock = i === 1 || i === 3;
    return `<g class="hot dr-ves" ${dock ? `id="ves-${i === 1 ? 0 : 1}"` : ""} tabindex="0" data-info="Synaptic vesicle holding dopamine (dots). Docked at the membrane, it fuses and releases dopamine into the cleft. Drawn larger than life and with an arbitrary number of dots." transform="translate(${v.x} ${v.y})">${blobSvg(v.blob)}${dots}</g>`;
  }).join(""),
  `<g class="hot" tabindex="0" data-info="Medium spiny neuron (MSN), the main output cell of the striatum. This is a small patch of its membrane in flat cross-section, schematic and not to scale. In the dorsal striatum D1 and D2 receptors sit mostly on different MSN populations; they are drawn on one membrane here only so the two pathways can be compared.">
<path class="dr-cell" d="${cellPath}"/></g>`,
  `<g class="hot" tabindex="0" data-info="Plasma membrane: a lipid bilayer (heads outside, tails inside; schematic) that the receptors and adenylyl cyclase span. Only the postsynaptic patch is drawn as a bilayer."><path class="dr-memband" d="M30 ${MEM.y0}H930V${MEM.y1}H30Z"/><path class="dr-memfill" d="M30 ${MEM.y0}H930V${MEM.y1}H30Z" fill="url(#lipid)"/><path class="dr-memedge" d="M30 ${MEM.y0}H930M30 ${MEM.y1}H930"/></g>`,

  `<g class="hot dr-ac" id="ac" tabindex="0" data-info="Adenylyl cyclase (AC): a membrane enzyme with two transmembrane bundles and a cytoplasmic catalytic part that makes cAMP from ATP. Gαs/olf·GTP stimulates it (+); Gαi/o·GTP inhibits it (−). Several AC isoforms exist; they are not distinguished here.">${acHelices()}${blobSvg(acBlob)}<text class="dr-prot dr-ac-name" x="${ACX}" y="${AC_BLOB.cy - 2}" text-anchor="middle">AC</text><text id="ac-plus" class="dr-sign dr-plus" x="${ACX - 24}" y="${AC_BLOB.cy + 17}" text-anchor="middle">+</text><text id="ac-minus" class="dr-sign dr-minus" x="${ACX + 24}" y="${AC_BLOB.cy + 17}" text-anchor="middle">−</text></g>`,
  rail("d1"), rail("d2"),
  `<g class="hot dr-rec dr-d1" id="d1-rec" tabindex="0" data-info="D1-like receptor (D1 drawn; D5 is the other family member): a seven-transmembrane G protein-coupled receptor. Dopamine binds from outside (the cup at the top). Inside the cell it couples to Gαs/olf, which stimulates adenylyl cyclase and raises cAMP. In striatal MSNs the partner is Gαolf. Low-affinity compared with D2.">${receptor(D1X)}</g>`,
  `<g class="hot dr-rec dr-d2" id="d2-rec" tabindex="0" data-info="D2-like receptor (D2 drawn; D3 and D4 are the other members): also a seven-transmembrane receptor, but it couples to Gαi/o, which inhibits adenylyl cyclase and lowers cAMP. Modelled as the higher-affinity receptor, so it is engaged even at low dopamine.">${receptor(D2X)}</g>`,
  `<g class="hot" tabindex="0" id="d1-g" data-info="Heterotrimeric G protein under D1: Gαs/olf plus the βγ pair. Resting state: α carries GDP and sits with βγ. When dopamine binds, the receptor makes α swap GDP for GTP; α·GTP and βγ separate; α·GTP stimulates adenylyl cyclase until its own GTPase turns GTP back to GDP and α rejoins βγ. βγ also has effectors of its own, not drawn.">${bgGroup("d1", 1)}${alphaGroup("d1", 2)}</g>`,
  `<g class="hot" tabindex="0" id="d2-g" data-info="Heterotrimeric G protein under D2: Gαi/o plus βγ, running the same cycle (GDP to GTP, α·GTP leaves βγ, GTP hydrolysis, rejoin). The difference is the target: Gαi/o·GTP inhibits adenylyl cyclase. For Gi proteins there is evidence the subunits may rearrange rather than fully dissociate; the classic separate-and-rejoin picture is drawn.">${bgGroup("d2", 3)}${alphaGroup("d2", 4)}</g>`,
  `<path id="camp-track" class="dr-track" d="M${ACX} ${AC_BLOB.cy + AC_BLOB.ry} V${PKA.cy - 24}"/><path class="dr-rail-head dr-track-head" d="M${ACX} ${PKA.cy - 22}l-4.5 -9h9z"/>`,
  `<g id="cAMPs"></g>`,
  `<g class="hot" id="pka" tabindex="0" data-info="Protein kinase A (PKA): two regulatory (R) and two catalytic (C) subunits. cAMP binds R, which frees the C subunits to phosphorylate their targets (drawn: C swings outward). In some anchored complexes the C subunits stay tethered near R, so this is a simplification.">
<g id="pka-c1" class="dr-pkac" transform="translate(${PKA.cx - 46} ${PKA.cy})">${blobSvg(pkaC(0))}<text class="dr-prot" x="0" y="4" text-anchor="middle">C</text></g>
<g id="pka-c2" class="dr-pkac" transform="translate(${PKA.cx + 46} ${PKA.cy})">${blobSvg(pkaC(1))}<text class="dr-prot" x="0" y="4" text-anchor="middle">C</text></g>
<g transform="translate(${PKA.cx} ${PKA.cy})">${blobSvg(pkaR)}<text class="dr-prot" x="0" y="4" text-anchor="middle">R</text></g></g>`,
  `<g id="bound"><circle id="d1-da" class="dr-da" r="5"/><circle id="d2-da" class="dr-da" r="5"/></g>`,
  `<g id="cleft"></g>`,
  `<g id="puffs"></g>`,
  `<g class="hot dr-block" id="d2-block" tabindex="0" data-info="Generic D2 antagonist (a teaching toggle, not a named drug or dose): a molecule that occupies the receptor's binding pocket without activating it, so dopamine cannot bind and the Gαi/o brake on adenylyl cyclase is lost. Real antagonists bind reversibly, so a lot of dopamine can partly outcompete them.">
<path class="dr-block-hex" d="${pathOf(Array.from({ length: 6 }, (_, k) => [D2X + Math.cos((k * Math.PI) / 3) * 8.5, 298 + Math.sin((k * Math.PI) / 3) * 8.5]), true)}"/><path class="dr-block-x" d="M${D2X - 3.5} 294.5L${D2X + 3.5} 301.5M${D2X + 3.5} 294.5L${D2X - 3.5} 301.5"/></g>`,
  dopamine(),
  label("vesicle", [758, 114], [VES[5][0] + 14, VES[5][1] - 8], "start"),
  label("D1 receptor", [96, 256], [D1X - 26, 296], "end"),
  label("D2 receptor", [864, 256], [D2X + 26, 296], "start"),
  label("membrane", [38, 352], [58, MEM.y1], "start"),
  label("adenylyl cyclase", [388, 436], [446, 386], "end"),
  `<text class="dr-label dr-muted" x="${ACX + 14}" y="424" text-anchor="start">ATP → cAMP</text>`,
  label("cAMP", [ACX + 22, 468], [ACX, 462], "start"),
  label("PKA", [ACX + 78, 592], [ACX + 14, 548], "start"),
  `<text id="d1-step" class="dr-step" x="${D1X}" y="424" text-anchor="middle"></text>`,
  `<text id="d2-step" class="dr-step" x="${D2X}" y="424" text-anchor="middle"></text>`,
  `<text class="dr-title dr-green" x="${D1X}" y="462" text-anchor="middle">D1-like receptor</text><text class="dr-label" x="${D1X}" y="481" text-anchor="middle">Gαs/olf · stimulates AC · cAMP ↑</text>`,
  `<text class="dr-title dr-red" x="${D2X}" y="462" text-anchor="middle">D2-like receptor</text><text class="dr-label" x="${D2X}" y="481" text-anchor="middle">Gαi/o · inhibits AC · cAMP ↓</text>`,
  `<g class="dr-key"><circle class="dr-da" cx="52" cy="530" r="5"/><text class="dr-label" x="68" y="534">dopamine (not to scale)</text>
<g transform="translate(52 556)">${chip("k-gdp", "GDP", "dr-gdp dr-on")}</g><text class="dr-label" x="76" y="560">on α: GDP (resting)</text>
<g transform="translate(52 582)">${chip("k-gtp", "GTP", "dr-gtp dr-on")}</g><text class="dr-label" x="76" y="586">on α: GTP (active)</text>
<path class="dr-block-hex" d="${pathOf(Array.from({ length: 6 }, (_, k) => [52 + Math.cos((k * Math.PI) / 3) * 7, 608 + Math.sin((k * Math.PI) / 3) * 7]), true)}" style="opacity:1"/><text class="dr-label" x="68" y="612">generic D2 antagonist</text></g>`,
  `<g class="dr-key"><text class="dr-label dr-green" x="906" y="534" text-anchor="end">+ stimulates AC (D1 path)</text><text class="dr-label dr-red" x="906" y="556" text-anchor="end">− inhibits AC (D2 path)</text><text class="dr-label dr-muted" x="906" y="582" text-anchor="end">arrow = where α·GTP travels</text><text class="dr-label dr-muted" x="906" y="604" text-anchor="end">brightness = how strong (qualitative)</text></g>`,
  `<text class="dr-label dr-muted" x="480" y="620" text-anchor="middle">medium spiny neuron (postsynaptic) · schematic patch</text>`,
].join("");

const svg = figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "Schematic cross-section of a dopamine synapse onto a striatal medium spiny neuron. Dopamine released from a presynaptic terminal binds a D1-like receptor, whose Gs/olf protein stimulates adenylyl cyclase and raises cAMP and PKA activity, and a D2-like receptor, whose Gi/o protein inhibits adenylyl cyclase and lowers cAMP. The skeletal formula of dopamine is shown at top left.",
  body,
  className: "dr-fig",
});

const framed = plateHtml({
  fig: "Fig 1",
  title: "D1-like vs D2-like signalling",
  hint: "hover or focus a part · space: pause",
  readout: model(1, false).readout,
  caption: "Schematic, not to scale. Flat cross-section of a dopamine synapse onto a striatal medium spiny neuron, simplified to D1 and D2 only. D1 and D2 are drawn on one membrane to compare them; in striatum they sit mostly on different neurons. Qualitative levels only.",
  body: `<div class="dr-svg">${svg}</div>`,
});

const controls = `
<div class="dr-controls">
  <label class="dr-range"><span>Dopamine level</span><input id="level" type="range" min="0" max="2" step="1" value="1" aria-valuetext="medium"><span class="dr-ticks"><i>low</i><i>medium</i><i>high</i></span></label>
  <label class="dr-switch"><input id="anta" type="checkbox"> <span>D2 antagonist (generic)</span></label>
  <button id="pause" type="button" aria-pressed="false">Pause motion</button>
</div>
<p id="status" class="dr-status" aria-live="polite"></p>
<p id="info" class="dr-info" aria-live="polite">Hover or focus a labelled part for a one-line explanation.</p>`;

const sources = `<footer class="bio-sources">
<h2>What the figure shows, and how sure we are</h2>
<ul>
<li><strong>Receptor families and coupling (well established).</strong> D1-like receptors (D1, D5) couple to Gs and activate adenylyl cyclase; D2-like receptors (D2, D3, D4) inhibit adenylyl cyclase (<a href="https://pubmed.ncbi.nlm.nih.gov/9457173/">Missale et al. 1998, Physiol Rev</a>; <a href="https://pubmed.ncbi.nlm.nih.gov/21303898/">Beaulieu &amp; Gainetdinov 2011, Pharmacol Rev</a>, which also covers signalling beyond cAMP). In striatal medium spiny neurons the D1 receptor works through Gαolf (with Gβ2γ7 and adenylyl cyclase type 5), and D1-type signalling raises cAMP and PKA activity (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3155884/">Hervé 2011, Front Neuroanat</a>, open access).</li>
<li><strong>G-protein cycle (well established).</strong> The activated receptor catalyses GDP release and GTP binding on Gα; Gα·GTP and Gβγ separate and act on effectors including adenylyl cyclases; signalling ends when Gα's own GTPase turns GTP into GDP and the heterotrimer re-forms, a step sped up by RGS proteins (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2794341/">McCudden et al. 2005, Cell Mol Life Sci</a>, open access; <a href="https://pubmed.ncbi.nlm.nih.gov/18043707/">Oldham &amp; Hamm 2008, Nat Rev Mol Cell Biol</a>). For Gi proteins, subunit rearrangement without full dissociation has been reported (Bünemann et al. 2003, cited in Hervé 2011), so the separate-and-rejoin drawing is the classic textbook model, not the last word.</li>
<li><strong>PKA.</strong> cAMP-dependent protein kinase is a tetramer of two regulatory and two catalytic subunits; cAMP binding to R is believed to liberate active kinase, though in anchored (AKAP) complexes the catalytic subunit may stay close (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3814001/">“Intrinsic disorder within an AKAP-protein kinase A complex guides local substrate phosphorylation”, eLife 2013</a>, open access).</li>
<li><strong>Striatal cell types.</strong> D1 receptors are mainly on striatonigral (direct pathway) MSNs and D2 receptors on striatopallidal (indirect pathway) MSNs (<a href="https://pubmed.ncbi.nlm.nih.gov/2147780/">Gerfen et al. 1990, Science</a>; <a href="https://pubmed.ncbi.nlm.nih.gov/17408758/">Surmeier et al. 2007, Trends Neurosci</a>). Co-expression is low in dorsal striatum; the reference above (Hervé 2011) discusses estimates. The one-membrane drawing is a teaching device.</li>
<li><strong>Affinity and the three levels.</strong> The model treats D2 as high-affinity and D1 as low-affinity, so low dopamine already engages D2 while D1 needs high dopamine; bursts mainly raise D1 occupancy (<a href="https://doi.org/10.1523/JNEUROSCI.1894-10.2010">Dreyer et al. 2010, J Neurosci</a>, which cites Rice &amp; Cragg 2008 for the affinities). The occupancy values behind the slider are illustrative and are not shown; no concentration is claimed.</li>
<li><strong>Terminal.</strong> VMAT2 loads dopamine into vesicles and DAT clears it from the cleft (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3504049/">Dopamine D1, D2, D3 receptors, VMAT2 and DAT densities in aged human brain, PLoS ONE 2012</a>, introduction); nigrostriatal input to the striatum is described in the Gerfen 1990 abstract.</li>
<li><strong>Molecule.</strong> Dopamine, 4-(2-aminoethyl)benzene-1,2-diol, C8H11NO2 (<a href="https://pubchem.ncbi.nlm.nih.gov/compound/681">PubChem CID 681</a>).</li>
</ul>
<p><strong>What was simplified.</strong> Only D1 and D2 are drawn; D3, D4 and D5, receptor dimers and heteromers (such as D1&ndash;D2), β-arrestin signalling, Gαq/phospholipase C coupling, βγ effectors, DARPP-32, phosphodiesterases (which break cAMP down), presynaptic D2 autoreceptors, dopamine reuptake and breakdown, and extrasynaptic volume transmission are left out. D1 and D2 are drawn on one membrane sharing one adenylyl cyclase; in the striatum they are mostly in different cells, so the shared cAMP stream is only a way to show that the two pathways push in opposite directions. Sizes, positions and timing are illustrative; protein shapes are cartoons, not structures. “Generic D2 antagonist” is a teaching toggle: it is not a named drug and says nothing about any dose.</p>
<p>For education only; this figure is not medical advice and says nothing about any person’s treatment or any medicine.</p>
</footer>`;

const script = `
const model = ${model.toString()};
const DATA = ${JSON.stringify({
  rec: { d1: { cx: D1X, home: REC.d1.home, dock: REC.d1.dock, alpha: REC.d1.alpha }, d2: { cx: D2X, home: REC.d2.home, dock: REC.d2.dock, alpha: REC.d2.alpha } },
  sites: SITES, ac: [ACX, AC_BLOB.cy + AC_BLOB.ry], pka: [PKA.cx, PKA.cy],
  ves: [VES[1], VES[3]],
})};
const NS = "http://www.w3.org/2000/svg";
const svg = document.querySelector(".dr-fig");
const $ = (id) => svg.querySelector("#" + id);
const readout = document.querySelector("[data-readout]");
const levelBox = document.getElementById("level");
const antaBox = document.getElementById("anta");
const pauseBtn = document.getElementById("pause");
const info = document.getElementById("info");
const statusEl = document.getElementById("status");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const NAMES = ["low", "medium", "high"];
const T = 9000;
const lvl = (v) => (v < 0.06 ? "none" : v < 0.34 ? "low" : v < 0.67 ? "moderate" : "high");
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const seg = (p, a, b) => clamp((p - a) / (b - a));
const frac = (v) => v - Math.floor(v);
const mk = (name, attrs, parent) => { const el = document.createElementNS(NS, name); for (const k in attrs) el.setAttribute(k, attrs[k]); parent.appendChild(el); return el; };
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const tr = (el, p) => el.setAttribute("transform", "translate(" + p[0].toFixed(1) + " " + p[1].toFixed(1) + ")");

let level = 1, anta = false, playing = !reduce.matches, visible = true, sim = reduce.matches ? 0.45 * T : 0, last = 0, frame = 0;
let M = model(level, anta);
const sm = { s1: 0, s2: 0, camp: 0.5, pka: 0, a1: 0, a2: 0 };

const R = {};
for (const k of ["d1", "d2"]) {
  R[k] = { d: DATA.rec[k], alpha: $(k + "-alpha"), gdp: $(k + "-gdp"), gtp: $(k + "-gtp"), da: $(k + "-da"), rec: $(k + "-rec"), step: $(k + "-step"), off: k === "d1" ? 0 : 0.2, seed: k === "d1" ? 0 : 0.0, on: 0, text: "" };
}
const pools = { cleft: $("cleft"), camp: $("cAMPs"), puffs: $("puffs") };
const NC = 10, NP = 14;
const cleft = Array.from({ length: NC }, (_, i) => { const g = mk("g", { class: "dr-particle" }, pools.cleft); mk("circle", { class: "dr-p-halo", r: 8 }, g); mk("circle", { class: "dr-da", r: 4.6 }, g); return { g, a: 0 }; });
const camps = Array.from({ length: NP }, (_, i) => { const g = mk("g", { class: "dr-particle" }, pools.camp); mk("circle", { class: "dr-camp", r: 4.4 }, g); mk("circle", { class: "dr-camp-dot", r: 1.5 }, g); return { g, a: 0 }; });
const puffs = DATA.sites.map(() => Array.from({ length: 5 }, () => mk("circle", { class: "dr-da", r: 2.6 }, pools.puffs)));
const vesEl = [$("ves-0"), $("ves-1")];
const pka1 = $("pka-c1"), pka2 = $("pka-c2"), plus = $("ac-plus"), minus = $("ac-minus"), block = $("d2-block"), acEl = $("ac");
const STEPS = ["1 · dopamine binds the receptor", "2 · α swaps GDP for GTP", "3 · α·GTP leaves βγ, goes to AC", "4 · α·GTP ", "5 · GTP → GDP, α heads back", "6 · α·GDP rejoins βγ"];

function cycle(k, r) {
  const x = sim / T + r.off;
  const n = Math.floor(x), p = x - n;
  const active = frac(n * 0.618034 + r.seed) < (k === "d1" ? M.occ1 : M.occ2) - 0.0001 || (!playing && sim === 0.45 * T && (k === "d1" ? M.occ1 : M.occ2) > 0.02);
  return { p, active, n };
}
function drawRec(k, r) {
  const { p, active } = cycle(k, r);
  const d = r.d, pocket = [d.cx, 296], entry = [d.cx, 268];
  let step = -1, alphaPos = d.home, gdp = 1, gtp = 0, da = 0, daPos = pocket, on = 0, rest = 1;
  if (active) {
    if (p < 0.15) { step = 0; daPos = lerp([d.cx + (k === "d1" ? -16 : 16), 246], pocket, ease(p / 0.15)); da = seg(p, 0, 0.04); on = ease(p / 0.15); }
    else if (p < 0.3) { step = 1; daPos = pocket; da = 1; on = 1; gdp = 1 - ease(seg(p, 0.15, 0.22)); gtp = ease(seg(p, 0.22, 0.3)); }
    else if (p < 0.55) { step = 2; daPos = pocket; da = 1; on = 1; gdp = 0; gtp = 1; alphaPos = lerp(d.home, d.dock, ease(seg(p, 0.3, 0.55))); }
    else if (p < 0.72) { step = 3; da = 1 - ease(seg(p, 0.58, 0.7)); daPos = lerp(pocket, [d.cx + (k === "d1" ? -16 : 16), 246], ease(seg(p, 0.58, 0.7))); on = 1 - ease(seg(p, 0.6, 0.72)); gdp = 0; gtp = 1; alphaPos = d.dock; }
    else if (p < 0.92) { step = 4; gdp = ease(seg(p, 0.72, 0.76)); gtp = 1 - gdp; alphaPos = lerp(d.dock, d.home, ease(seg(p, 0.74, 0.92))); }
    else { step = 5; gdp = 1; }
  } else if (k === "d2" && anta && p > 0.05 && p < 0.4) {
    const u = seg(p, 0.05, 0.4), tri = Math.sin(u * Math.PI);
    daPos = [d.cx + 14 * u - 6, 246 + 34 * tri]; da = tri > 0.04 ? 0.9 : 0;
  }
  tr(r.alpha, alphaPos);
  r.gdp.style.opacity = gdp.toFixed(2); r.gtp.style.opacity = gtp.toFixed(2);
  r.gdp.setAttribute("transform", "translate(0 " + ((1 - gdp) * 9).toFixed(1) + ")");
  r.gtp.setAttribute("transform", "translate(0 " + ((1 - gtp) * 9).toFixed(1) + ")");
  tr(r.da, daPos); r.da.style.opacity = da.toFixed(2);
  r.rec.style.setProperty("--on", on.toFixed(2));
  let text = active ? STEPS[step] : (k === "d2" && anta ? "pocket occupied: antagonist" : M["occ" + (k === "d1" ? 1 : 2)] < 0.15 ? "waiting for dopamine" : "waiting for the next binding");
  if (active && step === 3) text += (k === "d1" ? "stimulates AC" : "inhibits AC");
  if (text !== r.text) { r.text = text; r.step.textContent = text; }
  return alphaPos;
}

function draw(dt) {
  const k = dt >= 1000 ? 1 : 1 - Math.exp(-dt / 700);
  sm.s1 += (M.stim - sm.s1) * k; sm.s2 += (M.inh / 0.8 - sm.s2) * k; sm.camp += (M.camp - sm.camp) * k;
  sm.pka += ((M.pka ? 1 : 0) - sm.pka) * k;
  drawRec("d1", R.d1); drawRec("d2", R.d2);
  plus.style.opacity = (0.22 + 0.78 * sm.s1).toFixed(2);
  minus.style.opacity = (0.22 + 0.78 * sm.s2).toFixed(2);
  const nc = [3, 6, 10][level];
  cleft.forEach((c, i) => {
    const want = i < nc ? 1 : 0;
    c.a += (want - c.a) * (dt >= 1000 ? 1 : 1 - Math.exp(-dt / 400));
    if (c.a < 0.02) { c.g.style.opacity = 0; return; }
    const site = DATA.sites[i % 2], tgt = (Math.floor(i / 2) % 2 === 0) ? DATA.rec.d1.cx : DATA.rec.d2.cx;
    const u = frac(sim / 5200 + i * 0.173);
    const wob = Math.sin(sim / 520 + i * 2.1) * 6;
    const tx = tgt + (tgt < 480 ? 26 : -26) * Math.sin(i + 1) * 0.5;
    const pos = [site + (tx - site) * ease(u) + wob * (1 - u), 218 + 56 * u + Math.sin(u * 6 + i) * 5];
    tr(c.g, pos);
    c.g.style.opacity = (c.a * (u < 0.08 ? u / 0.08 : u > 0.88 ? (1 - u) / 0.12 : 1)).toFixed(2);
  });
  const period = [9000, 4600, 2400][level];
  vesEl.forEach((v, s) => {
    const x = (sim + s * period * 0.5) % period, dur = 1300, u = x < dur ? x / dur : -1;
    const sq = u < 0 ? 0 : Math.sin(Math.PI * Math.min(1, u * 1.2));
    v.setAttribute("transform", "translate(" + DATA.ves[s][0] + " " + (DATA.ves[s][1] + sq * 6).toFixed(1) + ") scale(" + (1 + 0.22 * sq).toFixed(3) + " " + (1 - 0.35 * sq).toFixed(3) + ")");
    puffs[s].forEach((c, j) => {
      if (u < 0.25 || u < 0) { c.style.opacity = 0; return; }
      const w = (u - 0.25) / 0.75, a = (j - 2) * 0.55;
      c.setAttribute("cx", (DATA.sites[s] + Math.sin(a) * 26 * w).toFixed(1)); c.setAttribute("cy", (214 + Math.cos(a) * 34 * w).toFixed(1));
      c.style.opacity = (1 - w).toFixed(2);
    });
  });
  const nCamp = Math.round(sm.camp * NP);
  camps.forEach((c, i) => {
    c.a += ((i < nCamp ? 1 : 0) - c.a) * (dt >= 1000 ? 1 : 1 - Math.exp(-dt / 500));
    if (c.a < 0.02) { c.g.style.opacity = 0; return; }
    const u = frac(sim / 4200 + i / NP);
    tr(c.g, [DATA.ac[0] + Math.sin(i * 2.3 + sim / 700) * 8 * (0.4 + u), DATA.ac[1] + 6 + (DATA.pka[1] - 26 - DATA.ac[1] - 6) * u]);
    c.g.style.opacity = (c.a * (u < 0.1 ? u / 0.1 : u > 0.9 ? (1 - u) / 0.1 : 1)).toFixed(2);
  });
  tr(pka1, [DATA.pka[0] - 46 - 24 * sm.pka, DATA.pka[1] + 4 * sm.pka]);
  tr(pka2, [DATA.pka[0] + 46 + 24 * sm.pka, DATA.pka[1] + 4 * sm.pka]);
  pka1.style.setProperty("--on", sm.pka.toFixed(2)); pka2.style.setProperty("--on", sm.pka.toFixed(2));
  acEl.style.setProperty("--s1", sm.s1.toFixed(2)); acEl.style.setProperty("--s2", sm.s2.toFixed(2));
  block.style.opacity = anta ? 1 : 0;
}

function publish() {
  M = model(level, anta);
  if (M.readout !== readout.textContent) readout.textContent = M.readout;
  statusEl.textContent = "Dopamine " + NAMES[level] + " · D1 occupancy " + lvl(M.occ1) + " · D2 occupancy " + lvl(M.occ2) + (anta ? " (antagonist on)" : "") + " · cAMP " + (M.camp > 0.58 ? "above" : M.camp < 0.42 ? "below" : "near") + " resting · PKA " + (M.pka ? "active" : "mostly inactive") + ". Qualitative, illustrative.";
}

function tick(now) {
  frame = 0;
  if (!playing || !visible) return;
  const dt = Math.min(64, now - (last || now));
  last = now; sim += dt;
  draw(dt);
  frame = requestAnimationFrame(tick);
}
function still() { draw(1000); }
function start() { if (playing && visible && !frame) { last = 0; frame = requestAnimationFrame(tick); } }
function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; }

levelBox.addEventListener("input", () => { level = +levelBox.value; levelBox.setAttribute("aria-valuetext", NAMES[level]); publish(); if (!playing) still(); });
antaBox.addEventListener("change", () => { anta = antaBox.checked; publish(); if (!playing) still(); });
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
publish();
still();
start();
`;

const style = `
.dr-svg{padding:0}
.dr-fig{display:block;width:100%;height:auto}
.dr-fig .bio-blob-base{fill:var(--anatomy-shade-2)}
.dr-halo{fill:var(--anatomy-halo);opacity:var(--anatomy-halo-opacity);filter:blur(12px)}
.dr-cell{fill:var(--anatomy-shade-3);stroke:var(--anatomy-mid);stroke-width:.8;vector-effect:non-scaling-stroke}
.dr-memband{fill:var(--anatomy-shade-1)}
.dr-memedge{fill:none;stroke:var(--anatomy-mid);stroke-width:.7}
.dr-head{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.7}
.dr-tail{fill:none;stroke:var(--anatomy-lo);stroke-width:.7;stroke-linecap:round}
.dr-label{fill:var(--anatomy-text);font:11.5px var(--anatomy-mono);letter-spacing:.01em}
.dr-label.dr-name{fill:var(--anatomy-strong);font-size:12px}
.dr-muted{fill:var(--anatomy-muted)}
.dr-title{fill:var(--anatomy-strong);font:600 13.5px var(--anatomy-mono)}
.dr-green{fill:var(--anatomy-green)}.dr-red{fill:var(--anatomy-red)}
.dr-step{fill:var(--anatomy-strong);font:11.5px var(--anatomy-mono)}
.dr-prot{fill:var(--anatomy-strong);font:600 11.5px var(--anatomy-mono);pointer-events:none}
.dr-sub{font-size:8.5px}
.dr-leader{fill:none;stroke:var(--anatomy-mid);stroke-width:.7}
.dr-dot{fill:var(--anatomy-dot)}
.dr-bond{fill:none;stroke:var(--anatomy-hi);stroke-width:1.5;stroke-linecap:round}
.dr-atom-bg{fill:var(--anatomy-card)}
.dr-atom{fill:var(--anatomy-strong);font:600 12px var(--anatomy-mono)}
.dr-hx{fill:var(--anatomy-shade-2);stroke:var(--anatomy-hi);stroke-width:.9;vector-effect:non-scaling-stroke;transition:fill .25s}
.dr-hx-hi{fill:none;stroke:var(--anatomy-top);stroke-width:1.2;stroke-linecap:round;opacity:.6}
.dr-d1{--c:var(--anatomy-green)}.dr-d2{--c:var(--anatomy-red)}
.dr-rec .dr-hx{stroke:color-mix(in srgb,var(--c) calc(var(--on,0) * 100%),var(--anatomy-hi))}
.dr-rec{filter:drop-shadow(0 0 calc(var(--on,0) * 5px) var(--c))}
.dr-ac .dr-hx{stroke:var(--anatomy-hi)}
.dr-ac .bio-blob-edge{stroke:var(--anatomy-hi)}
.dr-sign{font:700 22px var(--anatomy-mono);pointer-events:none}
.dr-plus{fill:var(--anatomy-green)}.dr-minus{fill:var(--anatomy-red)}
.dr-rail{fill:none;stroke-width:1.4}
.dr-rail-green{stroke:var(--anatomy-green)}.dr-rail-red{stroke:var(--anatomy-red)}
.dr-rail-head{stroke:none}
.dr-rail-head.dr-rail-green{fill:var(--anatomy-green)}.dr-rail-head.dr-rail-red{fill:var(--anatomy-red)}
.dr-track{fill:none;stroke:var(--anatomy-mid);stroke-width:1.2}
.dr-track-head{fill:var(--anatomy-mid)}
.dr-chip rect{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.9}
.dr-chip text{fill:var(--anatomy-strong);font:600 11px var(--anatomy-mono)}
.dr-gtp rect{fill:var(--anatomy-lit);stroke:var(--anatomy-lit)}
.dr-gtp text{fill:var(--anatomy-paper)}
.dr-chip.dr-on{opacity:1}
.dr-gtp:not(.dr-on){opacity:0}
.dr-da{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1}
.dr-p-halo{fill:var(--anatomy-lit);opacity:.22}
.dr-camp{fill:var(--anatomy-paper);stroke:var(--anatomy-lit);stroke-width:1.3}
.dr-camp-dot{fill:var(--anatomy-lit)}
.dr-vdot{fill:var(--anatomy-lit)}
.dr-ves .bio-blob-base{fill:var(--anatomy-shade-3)}
.dr-pkac{--on:0}
.dr-pkac .bio-blob-edge{stroke:color-mix(in srgb,var(--anatomy-lit) calc(var(--on,0) * 100%),var(--anatomy-hi))}
.dr-pkac{filter:drop-shadow(0 0 calc(var(--on,0) * 5px) var(--anatomy-lit))}
.dr-block{opacity:0;transition:opacity .3s}
.dr-block-hex{fill:var(--anatomy-paper);stroke:var(--anatomy-blue);stroke-width:1.6}
.dr-block-x{fill:none;stroke:var(--anatomy-blue);stroke-width:1.6;stroke-linecap:round}
.dr-particle,.dr-key{pointer-events:none}
.dr-key .dr-block-hex{opacity:1}
.hot{cursor:help;outline:none}
.hot.is-hot{filter:drop-shadow(0 0 3px var(--anatomy-lit))}
.hot:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.dr-controls{display:flex;flex-wrap:wrap;gap:14px 28px;align-items:center;margin:14px 2px 6px;font:12.5px var(--anatomy-mono);color:var(--anatomy-text)}
.dr-controls button{border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:inherit;padding:6px 10px;cursor:pointer;margin-left:auto}
.dr-controls input[type=checkbox]{accent-color:var(--anatomy-lit);margin-right:6px}
.dr-range{display:flex;flex-direction:column;gap:2px}
.dr-range input{accent-color:var(--anatomy-lit);width:190px}
.dr-ticks{display:flex;justify-content:space-between;color:var(--anatomy-muted);font-size:11px}
.dr-ticks i{font-style:normal}
.dr-controls :focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.dr-status{font:12px/1.5 var(--anatomy-mono);color:var(--anatomy-text);margin:6px 2px}
.dr-info{min-height:4.6em;font:12.5px/1.55 var(--anatomy-mono);color:var(--anatomy-strong);margin:8px 2px;border-left:2px solid var(--anatomy-faint);padding-left:10px}
.bio-sources{margin:20px 2px;color:var(--anatomy-muted);font-size:12.5px;line-height:1.65}
.bio-sources h2{font:600 13px var(--anatomy-mono);color:var(--anatomy-text);margin:0 0 8px}
.bio-sources ul{padding-left:18px}.bio-sources li{margin:6px 0}
.bio-sources a{color:var(--anatomy-text);text-underline-offset:2px}
@media(prefers-reduced-motion:reduce){.dr-hx,.dr-block{transition:none}}
`;

const html = pageHtml({
  title: "Dopamine D1 and D2 Receptors",
  theme: light ? "light" : "dark",
  width: WIDTH + 40,
  body: `<style>${BIO_CSS}${style}</style>${framed}${controls}${sources}`,
  script,
});
const filename = light ? "dopamine-receptors-light.html" : "dopamine-receptors.html";
writeFileSync(join(HERE, filename), html);
console.log(`wrote ${filename}`);
