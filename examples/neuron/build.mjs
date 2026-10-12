import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIO_CSS, blobOf, blobSvg } from "../../kit/blob.mjs";
import { branchPieces, branchSvg } from "../../kit/branch.mjs";
import { fitProjection, figureSvg, iso, pageHtml, pathOf, plateHtml } from "../../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");
const WIDTH = 760;
const HEIGHT = 420;
const nodeXs = [8, 30, 52, 74, 96, 118];
const axonPoint = (x) => [x, 1.2 * Math.sin(x / 18), 3];
const axon = Array.from({ length: 36 }, (_, index) => axonPoint(-5 + index * 4.3));
const dendrites = [
  [[-27, 5, 2], [-45, 30, 2], [-56, 50, 1], [-72, 59, 0]],
  [[-22, 7, 2], [-14, 35, 1], [-8, 53, 0], [2, 65, 0]],
  [[-28, -4, 2], [-47, -24, 1], [-61, -43, 0], [-75, -48, 0]],
  [[-19, -7, 2], [-29, -32, 1], [-31, -51, 0], [-25, -62, 0]],
  [[-29, 0, 2], [-52, 7, 1], [-67, 10, 0], [-79, 4, 0]],
  [[-16, 5, 2], [-2, 24, 1], [11, 36, 0], [21, 49, 0]],
];
const secondaryDendrites = dendrites.flatMap((path) =>
  [1, 2].map((index) => {
    const before = path[index - 1];
    const branch = path[index];
    const after = path[index + 1];
    const length = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
    const outward = [(after[0] - before[0]) / length, (after[1] - before[1]) / length];
    const side = (index % 2 ? 1 : -1) * 5;
    return [
      branch,
      [branch[0] + outward[0] * 9 - outward[1] * side, branch[1] + outward[1] * 9 + outward[0] * side, branch[2] - 0.4],
      [branch[0] + outward[0] * 16 - outward[1] * side * 1.6, branch[1] + outward[1] * 16 + outward[0] * side * 1.6, branch[2] - 0.8],
    ];
  }),
);
const sheathRanges = [[-4, 5], ...nodeXs.slice(0, -1).map((x, index) => [x + 2, nodeXs[index + 1] - 2]), [nodeXs.at(-1) + 2, 136]];
const bounds = [
  ...dendrites.flat(),
  ...secondaryDendrites.flat(),
  ...axon,
  [-16, 0, 8],
  [-32, -16, 0],
  [148, 0, 8],
];
const P = fitProjection(bounds, WIDTH, HEIGHT, { pad: 46, azimuth: 45, elevation: 30 });
const at = (point) => iso(point, P);
const label = (text, point, dx = 0, dy = 0, anchor = "start") => {
  const [x, y] = at(point);
  const tx = x + dx;
  const ty = y + dy;
  const connector = dx || dy ? `<path class="bio-label-line" d="${pathOf([[x, y], [tx - (anchor === "end" ? -3 : 3), ty + 2]])}"/>` : "";
  return `${connector}<text class="bio-label" x="${tx}" y="${ty}" text-anchor="${anchor}">${text}</text>`;
};
const organicRing = (centre, rx, ry, z, phase = 0) =>
  Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    const wobble = 1 + 0.055 * Math.sin(angle * 3 + phase) + 0.025 * Math.cos(angle * 5 - phase);
    return [centre[0] + Math.cos(angle) * rx * wobble, centre[1] + Math.sin(angle) * ry * wobble, z];
  });
const branches = (paths, radius) =>
  paths.flatMap((points) => branchPieces(points, (t) => radius * (1 - 0.76 * t), P, { maxLength: 18, spacing: 1.7 }))
    .sort((a, b) => a.depth - b.depth)
    .map((piece) => branchSvg(piece, { tone: "mid" }))
    .join("");

const dendriteMarkup = branches([...dendrites, ...secondaryDendrites], 1.9);
const axonMarkup = branches([axon], 0.9);
const myelinMarkup = sheathRanges.map(([from, to]) => {
  const points = Array.from({ length: 9 }, (_, index) => axonPoint(from + ((to - from) * index) / 8));
  return branchPieces(points, 2.25, P, { maxLength: 40, spacing: 1.8 }).map((piece) => branchSvg(piece, { tone: "hi" })).join("");
}).join("");
const soma = blobOf(organicRing([-16, 0, 2], 15, 12, 2, 0.5), P, { tone: "hi", id: "soma" });
const nucleus = blobOf(organicRing([-18, 0, 4], 5.5, 4.5, 4, 1.1), P, { tone: "mid", id: "nucleus" });
const terminal = blobOf(organicRing([141, 0, 3], 5, 4, 3, 0.2), P, { tone: "lit", id: "synaptic-terminal" });
const nodeMarkup = nodeXs.map((x) => {
  const [cx, cy] = at(axonPoint(x));
  return `<g class="axon-node" aria-label="Node of Ranvier"><ellipse cx="${cx}" cy="${cy}" rx="2.5" ry="5.5"/><circle cx="${cx}" cy="${cy}" r="1.2"/></g>`;
}).join("");
const nodePoints = nodeXs.map((x) => at(axonPoint(x)));
const firstNode = nodePoints[0];
const svgBody = [
  dendriteMarkup,
  axonMarkup,
  blobSvg(soma),
  blobSvg(nucleus),
  myelinMarkup,
  nodeMarkup,
  blobSvg(terminal),
  `<path id="axon-track" class="axon-track" d="${pathOf(nodePoints)}"/>`,
  `<circle class="action-potential-halo" r="7"/><circle id="action-potential" class="action-potential" cx="${firstNode[0]}" cy="${firstNode[1]}" r="3"/>`,
  `<g id="synapse" tabindex="0" role="group" aria-label="Focus to reveal vesicle release at the synapse"><title>Synapse: focus or hover to reveal vesicle release</title><circle class="synapse-focus" cx="${at([141, 0, 3])[0]}" cy="${at([141, 0, 3])[1]}" r="11"/><g class="synapse-detail"><circle class="vesicle" cx="${at([139, 1, 4])[0]}" cy="${at([139, 1, 4])[1]}" r="1.4"/><circle class="vesicle" cx="${at([142, 1, 4])[0]}" cy="${at([142, 1, 4])[1]}" r="1.4"/><circle class="vesicle" cx="${at([140, -1, 4])[0]}" cy="${at([140, -1, 4])[1]}" r="1.4"/><circle class="transmitter" cx="${at([147, 2, 2])[0]}" cy="${at([147, 2, 2])[1]}" r="1.1"/><circle class="transmitter" cx="${at([148, -1, 2])[0]}" cy="${at([148, -1, 2])[1]}" r="1.1"/><circle class="transmitter" cx="${at([146, -3, 2])[0]}" cy="${at([146, -3, 2])[1]}" r="1.1"/></g></g>`,
  label("dendrites", [-63, 42, 0], -4, -7, "end"),
  label("soma", [-15, -3, 8], -1, -24, "middle"),
  label("axon hillock", [-3, 0, 3], -10, 21, "end"),
  label("myelin sheath", [63, 0, 6], 0, -17, "middle"),
  label("node of Ranvier", [96, 0, 3], 16, 19, "start"),
  label("synapse", [141, 0, 3], 9, -12, "start"),
].join("");
const figure = figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "Schematic neuron with dendrites, soma, myelinated axon, nodes of Ranvier, traveling action potential, and synaptic terminal",
  body: svgBody,
  className: "neuron-figure",
});
const framed = plateHtml({
  fig: "Fig 1",
  title: "Saltatory conduction",
  hint: "Space: pause or resume · focus terminal for synapse",
  readout: "−70 mV",
  caption: "Schematic saltatory-conduction model. The waveform and propagation timing are illustrative, not a recording.",
  body: `<div class="neuron-svg">${figure}</div><button class="motion-toggle" type="button" aria-pressed="false">Pause motion</button>`,
});
const sources = `<footer class="bio-sources"><p>Representative educational values: resting potential ≈ −70 mV ( <a href="https://openstax.org/books/biology-2e/pages/35-2-how-neurons-communicate">OpenStax Biology 2e, “How Neurons Communicate”</a> ); action-potential peak ≈ +40 mV ( <a href="https://nba.uth.tmc.edu/neuroscience/m/s1/chapter02.html">Neuroscience Online, “Resting Potentials and Action Potentials”</a> ). These are representative endpoints cited from separate teaching references, not a single recorded cell trace; values vary with neuron and conditions.</p><p>For education only; this figure is not medical advice.</p></footer>`;
const script = `
const figure = document.querySelector(".neuron-figure");
const marker = figure.querySelector("#action-potential");
const halo = figure.querySelector(".action-potential-halo");
const track = figure.querySelector("#axon-track");
const readout = document.querySelector("[data-readout]");
const toggle = document.querySelector(".motion-toggle");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const rest = -70;
const peak = 40;
const duration = 4600;
const nodes = [...figure.querySelectorAll(".axon-node")].map((node) => {
  const point = node.querySelector("ellipse");
  return [Number(point.getAttribute("cx")), Number(point.getAttribute("cy"))];
});
let playing = !reduceMotion.matches;
let started = performance.now();
let visible = true;
let frame = 0;
const setReadout = (value) => { readout.textContent = \`\${value < 0 ? "−" : "+"}\${Math.round(Math.abs(value))} mV\`; };
const pointAt = (progress) => {
  const point = track.getPointAtLength(track.getTotalLength() * progress);
  marker.setAttribute("cx", point.x);
  marker.setAttribute("cy", point.y);
  halo.setAttribute("cx", point.x);
  halo.setAttribute("cy", point.y);
};
const render = (now) => {
  frame = 0;
  if (!playing || !visible || reduceMotion.matches) return;
  const progress = ((now - started) % duration) / duration;
  const traveling = progress >= 0.12 && progress <= 0.88;
  const nodeProgress = traveling ? ((progress - 0.12) / 0.76) * (nodes.length - 1) : 0;
  const activeNode = Math.round(nodeProgress);
  const activation = traveling ? Math.max(0, 1 - Math.abs(nodeProgress - activeNode) * 2.5) : 0;
  const point = nodes[activeNode];
  marker.setAttribute("cx", point[0]);
  marker.setAttribute("cy", point[1]);
  halo.setAttribute("cx", point[0]);
  halo.setAttribute("cy", point[1]);
  setReadout(rest + (peak - rest) * activation);
  frame = requestAnimationFrame(render);
};
const start = () => {
  if (playing && visible && !reduceMotion.matches && !frame) frame = requestAnimationFrame(render);
};
const stop = () => {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
};
toggle.addEventListener("click", () => {
  playing = !playing;
  toggle.textContent = playing ? "Pause motion" : "Play motion";
  if (playing) start(); else stop();
});
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.target.closest("button, a, input, textarea, select")) return;
  event.preventDefault();
  toggle.click();
});
reduceMotion.addEventListener("change", () => {
  if (reduceMotion.matches) {
    stop();
    playing = false;
    pointAt(0);
    setReadout(rest);
    toggle.textContent = "Play motion";
    toggle.disabled = true;
  } else {
    toggle.disabled = false;
    started = performance.now();
    playing = true;
    toggle.textContent = "Pause motion";
    start();
  }
});
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (visible) start(); else stop();
}).observe(figure);
if (reduceMotion.matches) {
  pointAt(0);
  setReadout(rest);
  toggle.textContent = "Play motion";
  toggle.disabled = true;
} else {
  start();
}
`;
const style = `
.neuron-figure .bio-blob-base{fill:var(--anatomy-shade-2)}
.neuron-figure .bio-blob-shade{fill:var(--anatomy-shade-0);opacity:.62}
.neuron-figure .bio-blob-highlight{fill:var(--anatomy-top);opacity:.64}
.neuron-figure .bio-blob-edge{fill:none}
.neuron-figure .axon-track{fill:none;stroke:transparent;stroke-width:1}
.neuron-figure .axon-node ellipse{fill:var(--anatomy-paper);stroke:var(--anatomy-lit);stroke-width:.75}
.neuron-figure .axon-node circle{fill:var(--anatomy-lit)}
.neuron-figure .bio-label{fill:var(--anatomy-text);font:9px var(--anatomy-mono);letter-spacing:.015em}
.neuron-figure .bio-label-line{fill:none;stroke:var(--anatomy-faint);stroke-width:.65}
.neuron-figure .action-potential{fill:var(--anatomy-lit);stroke:var(--anatomy-paper);stroke-width:1}
.neuron-figure .action-potential-halo{fill:var(--anatomy-lit);opacity:.18;filter:blur(3px)}
.neuron-figure .synapse-focus{fill:transparent;stroke:transparent;stroke-width:1}
.neuron-figure #synapse:focus{outline:none}
.neuron-figure #synapse:focus .synapse-focus{stroke:var(--anatomy-lit)}
.neuron-figure .synapse-detail{opacity:0;transition:opacity 180ms ease}
.neuron-figure #synapse:hover .synapse-detail,.neuron-figure #synapse:focus .synapse-detail{opacity:1}
.neuron-figure .vesicle{fill:var(--anatomy-blue);stroke:var(--anatomy-paper);stroke-width:.35}
.neuron-figure .transmitter{fill:var(--anatomy-lit)}
.motion-toggle{display:block;margin:8px 0 0 auto;border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:12px var(--anatomy-mono);padding:6px 10px;cursor:pointer}
.motion-toggle:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.bio-sources{max-width:760px;margin:14px auto;color:var(--anatomy-muted);font-size:12px;line-height:1.65}
.bio-sources a{color:var(--anatomy-text);text-underline-offset:2px}
@media(prefers-reduced-motion:reduce){.neuron-figure .synapse-detail{transition:none}}
`;
const html = pageHtml({
  title: "A myelinated neuron | Anima",
  theme: light ? "light" : "dark",
  width: WIDTH + 40,
  body: `<style>${BIO_CSS}${style}</style>${framed}${sources}`,
  script,
});
const filename = light ? "neuron-light.html" : "neuron.html";
writeFileSync(join(HERE, filename), html);
console.log(`wrote examples/neuron/${filename}`);
