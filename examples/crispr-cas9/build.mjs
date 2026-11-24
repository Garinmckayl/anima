import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIO_CSS } from "../../kit/blob.mjs";
import { figureSvg, pageHtml, plateHtml } from "../../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");
const WIDTH = 1000;
const HEIGHT = 660;

const SEQ_TS = "CAGTAACTGACGTAGGCTAC";
const SEQ_RNA = "GUCAUUGACUGCAUCCGAUG";
const SEQ_MM = "GUCAUUGACUGCAUCCCAUG";
const PAM_NTS = "TGG";
const PAM_TS = "ACC";

const COMP = { A: "U", T: "A", C: "G", G: "C" };
for (let i = 0; i < 20; i++) {
  if (COMP[SEQ_TS[i]] !== SEQ_RNA[i]) throw new Error(`Base pair mismatch at ${i}: ${SEQ_TS[i]} vs ${SEQ_RNA[i]}`);
}
if (COMP[SEQ_TS[16]] === SEQ_MM[16]) throw new Error("Seed mismatch position 4 must be non-complementary");

const f1 = (n) => +n.toFixed(1);

const RUNG_COUNT = 20;
const RUNG_X0 = 330;
const RUNG_X1 = 634;
const tsY = (x) => {
  const u = (x - RUNG_X0) / (RUNG_X1 - RUNG_X0);
  return 348 - 44 * u - 14 * Math.sin(u * Math.PI);
};
const rnaY = (x) => tsY(x) - 18;
const ntsY = (x) => {
  const u = (x - RUNG_X0) / (RUNG_X1 - RUNG_X0);
  return 396 - 68 * u + 66 * Math.sin(u * Math.PI);
};

const rungPoints = Array.from({ length: RUNG_COUNT }, (_, i) => {
  const u = i / (RUNG_COUNT - 1);
  const x = RUNG_X0 + u * (RUNG_X1 - RUNG_X0);
  return { i, x: f1(x), yTs: f1(tsY(x)), yRna: f1(rnaY(x)), yNts: f1(ntsY(x)) };
});

const curvePath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join("");

const leftDuplex = (() => {
  const top = [];
  const bot = [];
  const rungs = [];
  for (let i = 0; i <= 14; i++) {
    const x = 148 + i * 11.5;
    const w = Math.sin(i * 0.55) * 3.2;
    top.push([f1(x), f1(372 + w)]);
    bot.push([f1(x), f1(392 - w)]);
    if (i > 0 && i < 14 && i % 2 === 0) {
      rungs.push(`<line class="cr-dna-rung" x1="${f1(x)}" y1="${f1(372 + w)}" x2="${f1(x)}" y2="${f1(392 - w)}"/>`);
    }
  }
  return `${rungs.join("")}<path class="cr-dna-ts" d="${curvePath(top)}"/><path class="cr-dna-nts" d="${curvePath(bot)}"/>`;
})();

const rightDuplex = (() => {
  const top = [];
  const bot = [];
  const rungs = [];
  for (let i = 0; i <= 16; i++) {
    const x = 668 + i * 11.5;
    const w = Math.sin(i * 0.55 + 0.6) * 3.2;
    top.push([f1(x), f1(310 + w)]);
    bot.push([f1(x), f1(330 - w)]);
    if (i > 0 && i < 16 && i % 2 === 0) {
      rungs.push(`<line class="cr-dna-rung" x1="${f1(x)}" y1="${f1(310 + w)}" x2="${f1(x)}" y2="${f1(330 - w)}"/>`);
    }
  }
  return `${rungs.join("")}<path class="cr-dna-ts" d="${curvePath(top)}"/><path class="cr-dna-nts" d="${curvePath(bot)}"/>`;
})();

const leftTopEnd = [f1(148 + 14 * 11.5), f1(372 + Math.sin(14 * 0.55) * 3.2)];
const leftBotEnd = [f1(148 + 14 * 11.5), f1(392 - Math.sin(14 * 0.55) * 3.2)];
const rightTopStart = [668, f1(310 + Math.sin(0.6) * 3.2)];
const rightBotStart = [668, f1(330 - Math.sin(0.6) * 3.2)];

const tsPrePath = `M${leftTopEnd[0]} ${leftTopEnd[1]} C316 364, 322 354, ${rungPoints[0].x} ${rungPoints[0].yTs} ` +
  rungPoints.slice(0, 3).map((p) => `L${p.x} ${p.yTs}`).join(" ");
const tsPostPath = `M${rungPoints[3].x} ${rungPoints[3].yTs} ` +
  rungPoints.slice(4).map((p) => `L${p.x} ${p.yTs}`).join(" ") +
  ` C648 ${f1(rungPoints[19].yTs + 2)}, 658 ${rightTopStart[1]}, ${rightTopStart[0]} ${rightTopStart[1]}`;

const ntsPrePath = `M${leftBotEnd[0]} ${leftBotEnd[1]} C318 394, 324 396, ${rungPoints[0].x} ${rungPoints[0].yNts} ` +
  rungPoints.slice(0, 3).map((p) => `L${p.x} ${p.yNts}`).join(" ");
const ntsPostPath = `M${rungPoints[3].x} ${rungPoints[3].yNts} ` +
  rungPoints.slice(4).map((p) => `L${p.x} ${p.yNts}`).join(" ") +
  ` C650 ${f1(rungPoints[19].yNts - 4)}, 658 ${rightBotStart[1]}, ${rightBotStart[0]} ${rightBotStart[1]}`;

const rnaSpacerPath = `M${rungPoints[0].x} ${rungPoints[0].yRna} ` +
  rungPoints.slice(1).map((p) => `L${p.x} ${p.yRna}`).join(" ");

const hybridRungsSvg = rungPoints.map((p) => {
  const isMismatchSite = p.i === 3;
  return `<g class="cr-rung-wrap" data-rung="${p.i}">
    <line class="cr-hybrid-rung${isMismatchSite ? " is-mm-site" : ""}" x1="${p.x}" y1="${f1(p.yRna + 2)}" x2="${p.x}" y2="${f1(p.yTs - 2)}"/>
    <circle class="cr-rung-dot" cx="${p.x}" cy="${p.yRna}" r="1.7"/>
    <circle class="cr-rung-dot" cx="${p.x}" cy="${p.yTs}" r="1.7"/>
  </g>`;
}).join("");

const seqTilesSvg = (() => {
  const x0 = 250;
  const step = 21;
  const y = 76;
  const tiles = [];
  tiles.push(`<rect class="cr-seq-pam-box" x="${x0 - 80}" y="${y - 16}" width="72" height="34" rx="3"/>`);
  tiles.push(`<text class="cr-seq-pam-txt" x="${x0 - 44}" y="${y - 3}" text-anchor="middle">5'-${PAM_NTS}-3'</text>`);
  tiles.push(`<text class="cr-seq-sub" x="${x0 - 44}" y="${y + 11}" text-anchor="middle">PAM (${PAM_TS})</text>`);
  for (let i = 0; i < RUNG_COUNT; i++) {
    const cx = x0 + i * step;
    const baseDna = SEQ_TS[RUNG_COUNT - 1 - i];
    const baseRna = SEQ_RNA[RUNG_COUNT - 1 - i];
    const isSeed = i < 8;
    const isCut = i === 2;
    const isMm = i === 3;
    tiles.push(`<g class="cr-tile${isSeed ? " is-seed" : ""}${isMm ? " is-mm-tile" : ""}" data-tile="${i}">
      <rect class="cr-tile-bg" x="${cx - 8.5}" y="${y - 16}" width="17" height="34" rx="2"/>
      <text class="cr-tile-rna" x="${cx}" y="${y - 3}" text-anchor="middle" data-match="${baseRna}" data-mismatch="${SEQ_MM[RUNG_COUNT - 1 - i]}">${baseRna}</text>
      <text class="cr-tile-dna" x="${cx}" y="${y + 11}" text-anchor="middle">${baseDna}</text>
      ${isCut ? `<path class="cr-cut-caret" d="M${cx + 10.5} ${y - 23} L${cx + 7.5} ${y - 18} L${cx + 13.5} ${y - 18} Z"/><text class="cr-cut-lbl" x="${cx + 10.5}" y="${y - 26}" text-anchor="middle">cut (−3)</text>` : ""}
    </g>`);
  }
  const seedX0 = x0 - 8;
  const seedX1 = x0 + 7 * step + 8;
  tiles.push(`<path class="cr-bracket" d="M${seedX0} ${y + 22} V${y + 26} H${seedX1} V${y + 22}"/>`);
  tiles.push(`<text class="cr-seq-sub" x="${f1((seedX0 + seedX1) / 2)}" y="${y + 38}" text-anchor="middle">seed region (nt 1–8)</text>`);
  const distX0 = x0 + 8 * step - 8;
  const distX1 = x0 + 19 * step + 8;
  tiles.push(`<path class="cr-bracket cr-bracket-faint" d="M${distX0} ${y + 22} V${y + 26} H${distX1} V${y + 22}"/>`);
  tiles.push(`<text class="cr-seq-sub" x="${f1((distX0 + distX1) / 2)}" y="${y + 38}" text-anchor="middle">PAM-distal protospacer (nt 9–20)</text>`);
  return `<g class="cr-seq-rail">${tiles.join("")}</g>`;
})();

const leader = (x1, y1, x2, y2, lines, anchor = "start", cls = "") => {
  const dx = anchor === "end" ? -6 : 6;
  const text = lines.map((line, i) => `<tspan x="${f1(x2 + dx)}" dy="${i === 0 ? 0 : 14}">${line}</tspan>`).join("");
  return `<g class="cr-callout ${cls}"><path class="cr-leader" d="M${x1} ${y1}L${x2} ${y2}"/><circle class="cr-dot" cx="${x1}" cy="${y1}" r="2.2"/><text class="cr-label" x="${f1(x2 + dx)}" y="${f1(y2 + 4)}" text-anchor="${anchor}">${text}</text></g>`;
};

const hnhOrigin = { x: 525, y: 360 };
const hnhDocked = { x: 372, y: 334 };
const cutTs = { x: f1((rungPoints[2].x + rungPoints[3].x) / 2), y: f1((rungPoints[2].yTs + rungPoints[3].yTs) / 2) };
const cutNts = { x: f1((rungPoints[2].x + rungPoints[3].x) / 2), y: f1((rungPoints[2].yNts + rungPoints[3].yNts) / 2) };
const mmPoint = rungPoints[3];

const svg = figureSvg({
  width: WIDTH,
  height: HEIGHT,
  className: "cr-fig",
  label: "SpCas9 CRISPR endonuclease R-loop formation, HNH conformational checkpoint, and DNA cleavage",
  body: `
    <ellipse class="cr-halo" cx="485" cy="522" rx="340" ry="38"/>

    ${seqTilesSvg}

    <g id="cr-rec" class="hot cr-domain" tabindex="0" data-info="REC lobe (REC1–REC3): alpha-helical cradle that wraps the 20-nt sgRNA:DNA heteroduplex. REC3 senses complete PAM-distal pairing to license HNH activation.">
      <path class="cr-lobe-base" d="M272 288 C236 232, 294 166, 466 164 C612 162, 728 206, 708 278 C694 316, 636 336, 558 336 C452 336, 316 330, 272 288 Z"/>
      <path class="cr-lobe-sub" d="M276 238 C246 226, 240 264, 266 286 C294 298, 306 258, 276 238 Z"/>
      <path id="cr-rec3" class="cr-lobe-sub cr-rec3" d="M604 206 C672 198, 722 232, 702 278 C674 294, 626 254, 604 206 Z"/>
      <path class="cr-contour" d="M332 204 C412 184, 514 188, 602 212"/>
      <path class="cr-contour" d="M318 228 C414 208, 524 214, 616 242"/>
      <path class="cr-contour" d="M338 256 C428 242, 526 248, 612 272"/>
    </g>

    <g id="cr-bh" class="hot cr-domain" tabindex="0" data-info="Bridge helix (Arg63–Lys94): conserved arginine-rich alpha-helix linking REC and NUC lobes and contacting the sgRNA seed.">
      <path class="cr-bh-body" d="M402 316 C446 300, 502 302, 552 320"/>
      <path class="cr-bh-core" d="M402 316 C446 300, 502 302, 552 320"/>
      <path class="cr-bh-ticks" d="M420 307 L425 316 M444 301 L448 310 M470 299 L473 309 M496 301 L498 311 M522 307 L522 317"/>
    </g>

    <g id="cr-pi" class="hot cr-domain" tabindex="0" data-info="PAM-interacting (PI) domain: reads the 5'-NGG-3' protospacer adjacent motif in the major groove via Arg1333 and Arg1335 before unwinding begins.">
      <path class="cr-lobe-nuc" d="M244 342 C214 366, 214 434, 258 468 C298 492, 344 472, 354 434 C362 400, 342 356, 308 338 C286 326, 260 330, 244 342 Z"/>
      <line class="cr-pam-finger" x1="274" y1="406" x2="294" y2="392"/>
      <line class="cr-pam-finger" x1="286" y1="414" x2="306" y2="394"/>
      <circle class="cr-pam-tip" cx="294" cy="392" r="2.2"/>
      <circle class="cr-pam-tip" cx="306" cy="394" r="2.2"/>
    </g>

    <g id="cr-ruvc" class="hot cr-domain" tabindex="0" data-info="RuvC catalytic core (Asp10, Glu762, His983, Asp986): cleaves the displaced non-target DNA strand 3 nt upstream of PAM using catalytic Mg²⁺.">
      <path class="cr-lobe-nuc" d="M352 396 C332 454, 382 518, 466 516 C532 514, 578 478, 562 426 C546 382, 480 374, 424 382 C386 386, 362 386, 352 396 Z"/>
      <ellipse id="cr-ruvc-pocket" class="cr-pocket" cx="${cutNts.x}" cy="${f1(cutNts.y + 8)}" rx="26" ry="16"/>
      <circle class="cr-mg" cx="${cutNts.x}" cy="${f1(cutNts.y + 10)}" r="4"/>
      <text class="cr-micro" x="${cutNts.x}" y="${f1(cutNts.y + 42)}" text-anchor="middle">Mg²⁺ · D10</text>
    </g>

    <g id="cr-dna-left" class="hot" tabindex="0" data-info="PAM-proximal duplex and 5'-NGG-3' PAM site: PAM recognition by the PI domain licenses local DNA melting and R-loop nucleation.">
      ${leftDuplex}
      <rect class="cr-pam-frame" x="278" y="362" width="38" height="38" rx="3"/>
    </g>

    <g id="cr-dna-right" class="hot" tabindex="0" data-info="PAM-distal B-form target DNA extending beyond the 20-bp protospacer.">
      ${rightDuplex}
    </g>

    <g id="cr-nts" class="hot" tabindex="0" data-info="Non-target strand (NTS): displaced during R-loop invasion and threaded across the RuvC active site, cleaved at −3 nt upstream of PAM.">
      <path id="cr-nts-pre" class="cr-dna-nts" d="${ntsPrePath}"/>
      <path id="cr-nts-post" class="cr-dna-nts" d="${ntsPostPath}"/>
      <line id="cr-nts-bridge" class="cr-dna-nts" x1="${rungPoints[2].x}" y1="${rungPoints[2].yNts}" x2="${rungPoints[3].x}" y2="${rungPoints[3].yNts}"/>
      <circle id="cr-nts-scissile" class="cr-scissile" cx="${cutNts.x}" cy="${cutNts.y}" r="3.6"/>
    </g>

    <g id="cr-rloop" class="hot" tabindex="0" data-info="RNA:DNA heteroduplex (R-loop): 20-nt guide RNA spacer base-pairs sequentially with the target strand from PAM (+1) to distal (+20).">
      <path id="cr-ts-pre" class="cr-dna-ts" d="${tsPrePath}"/>
      <path id="cr-ts-post" class="cr-dna-ts" d="${tsPostPath}"/>
      <line id="cr-ts-bridge" class="cr-dna-ts" x1="${rungPoints[2].x}" y1="${rungPoints[2].yTs}" x2="${rungPoints[3].x}" y2="${rungPoints[3].yTs}"/>
      <g id="cr-rungs">${hybridRungsSvg}</g>
      <path id="cr-rna-spacer" class="cr-rna-spacer" d="${rnaSpacerPath}"/>
      <circle id="cr-ts-scissile" class="cr-scissile" cx="${cutTs.x}" cy="${cutTs.y}" r="3.6"/>
      <g id="cr-mm-mark" class="cr-mm-mark" transform="translate(${mmPoint.x} ${f1((mmPoint.yRna + mmPoint.yTs) / 2)})">
        <circle class="cr-mm-halo" r="11"/>
        <path class="cr-mm-x" d="M-4 -4 L4 4 M4 -4 L-4 4"/>
      </g>
    </g>

    <g id="cr-sgrna" class="hot" tabindex="0" data-info="Single-guide RNA (sgRNA) scaffold: crRNA:tracrRNA repeat:anti-repeat tetraloop and stem loops 1–3 anchored across the REC and NUC surfaces.">
      <path class="cr-rna-scaffold" d="M472 288 C462 248, 412 184, 424 148 C436 124, 474 132, 480 162 C486 202, 502 254, 528 278"/>
      <path class="cr-rna-scaffold" d="M528 278 C562 296, 588 386, 616 404 C644 418, 666 382, 644 342 C622 308, 582 286, 550 280"/>
      <line class="cr-stem-bar" x1="436" y1="158" x2="468" y2="164"/>
      <line class="cr-stem-bar" x1="440" y1="180" x2="472" y2="188"/>
      <line class="cr-stem-bar" x1="446" y1="204" x2="476" y2="212"/>
      <line class="cr-stem-bar" x1="600" y1="348" x2="626" y2="338"/>
      <line class="cr-stem-bar" x1="612" y1="370" x2="638" y2="358"/>
    </g>

    <path id="cr-hnh-arc" class="cr-hnh-arc" d="M${hnhOrigin.x} ${hnhOrigin.y} Q454 316 ${hnhDocked.x} ${hnhDocked.y}"/>

    <g id="cr-hnh-move" transform="translate(0 0)">
      <g id="cr-hnh" class="hot cr-domain" tabindex="0" data-info="HNH mobile nuclease domain (Asp839, His840, Asn863): held in an inactive checkpoint until full 20-nt R-loop pairing triggers a ~30 Å (~180°) conformational dock onto the target strand −3 phosphate.">
        <ellipse id="cr-hnh-body" class="cr-hnh-body" cx="${hnhOrigin.x}" cy="${hnhOrigin.y}" rx="56" ry="42"/>
        <path class="cr-contour" d="M${hnhOrigin.x - 34} ${hnhOrigin.y - 12} C${hnhOrigin.x - 10} ${hnhOrigin.y - 26}, ${hnhOrigin.x + 18} ${hnhOrigin.y - 22}, ${hnhOrigin.x + 36} ${hnhOrigin.y - 4}"/>
        <path class="cr-contour" d="M${hnhOrigin.x - 30} ${hnhOrigin.y + 12} C${hnhOrigin.x - 6} ${hnhOrigin.y + 24}, ${hnhOrigin.x + 20} ${hnhOrigin.y + 20}, ${hnhOrigin.x + 34} ${hnhOrigin.y + 6}"/>
        <circle class="cr-mg" cx="${hnhOrigin.x - 24}" cy="${hnhOrigin.y}" r="3.8"/>
        <text class="cr-hnh-tag" x="${hnhOrigin.x + 10}" y="${hnhOrigin.y - 2}" text-anchor="middle">HNH</text>
        <text class="cr-micro" x="${hnhOrigin.x + 10}" y="${hnhOrigin.y + 12}" text-anchor="middle">H840 · Mg²⁺</text>
      </g>
    </g>

    <g id="cr-cleave-fx" class="cr-cleave-fx">
      <circle class="cr-cut-ring" cx="${cutTs.x}" cy="${cutTs.y}" r="11"/>
      <circle class="cr-cut-ring" cx="${cutNts.x}" cy="${cutNts.y}" r="11"/>
      <text class="cr-cut-end" x="${f1(cutTs.x - 16)}" y="${f1(cutTs.y - 48)}" text-anchor="end">3'-OH</text>
      <text class="cr-cut-end" x="${f1(cutTs.x + 16)}" y="${f1(cutTs.y - 48)}" text-anchor="start">5'-P</text>
      <text class="cr-cut-end" x="${f1(cutNts.x - 28)}" y="${f1(cutNts.y + 24)}" text-anchor="end">3'-OH</text>
      <text class="cr-cut-end" x="${f1(cutNts.x + 28)}" y="${f1(cutNts.y + 24)}" text-anchor="start">5'-P</text>
    </g>

    ${leader(424, 152, 224, 152, ["sgRNA scaffold", "(tetraloop · stem loops)"], "end")}
    ${leader(cutTs.x, cutTs.y, 206, 272, ["target strand (TS)", "−3 scissile phosphate"], "end")}
    ${leader(286, 398, 206, 424, ["PAM (5'-NGG-3')"], "end")}
    ${leader(254, 458, 206, 476, ["PI domain", "(Arg1333 / Arg1335)"], "end")}
    ${leader(624, 182, 746, 172, ["REC lobe (REC1–REC3)", "helical cradle"], "start")}
    ${leader(rungPoints[16].x, rungPoints[16].yRna, 746, 256, ["RNA:DNA heteroduplex", "(20-nt R-loop)"], "start")}
    ${leader(748, 320, 748, 360, ["PAM-distal dsDNA"], "start")}
    ${leader(rungPoints[13].x, rungPoints[13].yNts, 746, 438, ["non-target strand (NTS)"], "start")}
    ${leader(472, 502, 588, 532, ["RuvC catalytic core", "(cleaves NTS at −3)"], "start")}

    <text id="cr-status" class="cr-status" x="500" y="592" text-anchor="middle"></text>
  `,
});

const framed = plateHtml({
  fig: "Fig 1",
  title: "SPCAS9: R-LOOP & DNA CLEAVAGE",
  hint: "HOVER OR FOCUS A PART · SPACE: PAUSE · 1/2: TARGET",
  readout: "R-loop: 20/20 bp · HNH: cleaved",
  body: svg,
  className: "cr-svg",
});

const controls = `
<div class="cr-controls">
  <fieldset class="cr-mode">
    <legend>Target fidelity</legend>
    <label><input type="radio" name="fidelity" value="match" checked> On-target (20/20 match)</label>
    <label><input type="radio" name="fidelity" value="mismatch"> Seed mismatch (pos 4)</label>
  </fieldset>
  <label class="cr-scrub-wrap">
    <span>Cycle</span>
    <input id="cr-scrub" type="range" min="0" max="1000" value="0" aria-label="Reaction cycle progress">
    <span id="cr-pct">0%</span>
  </label>
  <div class="cr-btns">
    <button id="cr-replay" type="button">Replay</button>
    <button id="cr-pause" type="button" aria-pressed="false">Pause motion</button>
  </div>
</div>
<p class="cr-summary" id="cr-summary"></p>
<p class="cr-info" id="cr-info">Hover or focus any domain, strand, or catalytic pocket for its biochemical role.</p>
`;

const sources = `
<section class="bio-sources">
  <h2>Sources and limits</h2>
  <ul>
    <li><strong>Crystal structures:</strong> <em>Streptococcus pyogenes</em> Cas9–sgRNA–PAM DNA complex (<a href="https://www.rcsb.org/structure/4UN3" target="_blank" rel="noopener">PDB 4UN3</a>, 2.59 Å, Anders et al., <em>Nature</em> 2014) and Cas9 R-loop complex primed for cleavage (<a href="https://www.rcsb.org/structure/5F9R" target="_blank" rel="noopener">PDB 5F9R</a>, Jiang et al., <em>Science</em> 2016).</li>
    <li><strong>Dual-strand cleavage:</strong> HNH (Asp839, His840, Asn863) cleaves the target strand and RuvC (Asp10, Glu762, His983, Asp986) cleaves the non-target strand, each 3 nt upstream of the 5'-NGG-3' PAM, generating a predominantly blunt double-strand break (Jinek et al., <em>Science</em> 2012, <a href="https://doi.org/10.1126/science.1225829" target="_blank" rel="noopener">doi:10.1126/science.1225829</a>).</li>
    <li><strong>HNH conformational checkpoint:</strong> Complete 20-nt R-loop propagation drives an allosteric transition moving HNH (~180° rotation, ~30 Å displacement) from an inactive checkpoint into the catalytic conformation (Sternberg et al., <em>Nature</em> 2015, <a href="https://pubmed.ncbi.nlm.nih.gov/26524520/" target="_blank" rel="noopener">PMID 26524520</a>; Dagdas et al., <em>Science Advances</em> 2017, <a href="https://doi.org/10.1126/sciadv.aao0027" target="_blank" rel="noopener">doi:10.1126/sciadv.aao0027</a>).</li>
    <li><strong>Seed-mismatch stalling:</strong> PAM-proximal seed mismatches (positions 1–8) stall directional R-loop zippering and trap HNH in the inactive checkpoint, preventing cleavage (Szczelkun et al., <em>PNAS</em> 2014).</li>
    <li><strong>What is simplified (illustrative):</strong> Schematic cross-section; domain outlines, the 9 s cycle duration, and the exact stall at 6/20 bp in the mismatch state are teaching simplifications rather than measured kinetics or atomic coordinates.</li>
    <li><strong>Educational use only:</strong> Explains molecular mechanism only. Not clinical guidance, gene-editing protocol, or therapeutic advice.</li>
  </ul>
</section>
`;

const DATA = {
  duration: 9,
  hnhDx: f1(hnhDocked.x - hnhOrigin.x),
  hnhDy: f1(hnhDocked.y - hnhOrigin.y),
  hnhOrigin,
};

const script = `
const DATA = ${JSON.stringify(DATA)};
const svg = document.querySelector(".cr-fig");
const readout = document.querySelector('[data-corner="readout"]');
const statusEl = document.getElementById("cr-status");
const summaryEl = document.getElementById("cr-summary");
const infoEl = document.getElementById("cr-info");
const scrub = document.getElementById("cr-scrub");
const pctEl = document.getElementById("cr-pct");
const pauseBtn = document.getElementById("cr-pause");
const replayBtn = document.getElementById("cr-replay");
const radios = [...document.querySelectorAll('input[name="fidelity"]')];
const hnhMove = document.getElementById("cr-hnh-move");
const hnhBody = document.getElementById("cr-hnh-body");
const ruvcPocket = document.getElementById("cr-ruvc-pocket");
const rec3 = document.getElementById("cr-rec3");
const rnaSpacer = document.getElementById("cr-rna-spacer");
const tsBridge = document.getElementById("cr-ts-bridge");
const ntsBridge = document.getElementById("cr-nts-bridge");
const cleaveFx = document.getElementById("cr-cleave-fx");
const mmMark = document.getElementById("cr-mm-mark");
const rungs = [...document.querySelectorAll("[data-rung]")];
const tiles = [...document.querySelectorAll("[data-tile]")];

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
let fidelity = "match";
let time = reduce.matches ? 7.6 : 0;
let playing = !reduce.matches;
let visible = true;
let frame = 0;
let last = 0;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };

function render() {
  const p = time / DATA.duration;
  const isMatch = fidelity === "match";
  const rawPair = clamp((p - 0.06) / 0.44);
  const pairing = isMatch ? rawPair : Math.min(0.3, rawPair);
  const pairs = Math.round(pairing * 20);
  const dock = isMatch ? ease((p - 0.50) / 0.24) : 0;
  const cut = isMatch && p > 0.78;
  const cutPulse = cut ? 0.55 + 0.45 * Math.sin((p - 0.78) * 34) ** 2 : 0;
  const mmHit = !isMatch && p >= 0.14;
  const lockShake = !isMatch && p > 0.34 ? Math.sin((p - 0.34) * 28) * 3.5 * clamp(1 - (p - 0.34) / 0.35) : 0;

  svg.dataset.fidelity = fidelity;
  svg.dataset.state = cut ? "cleaved" : !isMatch && mmHit ? "blocked" : dock > 0.9 ? "docked" : dock > 0.05 ? "docking" : "zippering";

  const tx = DATA.hnhDx * dock + lockShake;
  const ty = DATA.hnhDy * dock;
  const rot = -22 * dock;
  hnhMove.setAttribute("transform", "translate(" + tx.toFixed(1) + " " + ty.toFixed(1) + ") rotate(" + rot.toFixed(1) + " " + DATA.hnhOrigin.x + " " + DATA.hnhOrigin.y + ")");

  rungs.forEach((g, i) => {
    const lit = pairs > i;
    g.classList.toggle("is-lit", lit);
    g.classList.toggle("is-mm", !isMatch && i === 3 && mmHit);
  });
  tiles.forEach((g, i) => {
    const lit = pairs > i;
    g.classList.toggle("is-lit", lit);
    g.classList.toggle("is-mm", !isMatch && i === 3 && mmHit);
    const rnaTxt = g.querySelector(".cr-tile-rna");
    if (rnaTxt) rnaTxt.textContent = isMatch ? rnaTxt.dataset.match : rnaTxt.dataset.mismatch;
  });

  rnaSpacer.style.opacity = (0.38 + 0.62 * pairing).toFixed(2);
  rec3.classList.toggle("is-active", isMatch && pairing >= 0.95);
  hnhBody.classList.toggle("is-active", dock > 0.85);
  hnhBody.classList.toggle("is-locked", !isMatch && mmHit);
  ruvcPocket.classList.toggle("is-active", cut);
  tsBridge.style.opacity = cut ? "0" : "1";
  ntsBridge.style.opacity = cut ? "0" : "1";
  cleaveFx.style.opacity = cut ? cutPulse.toFixed(2) : "0";
  mmMark.style.opacity = mmHit ? "1" : "0";

  const phase = !isMatch ? "checkpoint" : cut ? "cleaved" : dock > 0.95 ? "docked" : dock > 0.05 ? "docking" : "zippering";
  readout.textContent = "R-loop: " + pairs + "/20 bp · HNH: " + phase;

  if (!isMatch) {
    statusEl.textContent = mmHit
      ? "Seed mismatch at pos 4 (C·C)  ·  R-loop stalled (6/20 bp)  ·  HNH locked at checkpoint"
      : "PAM bound (5'-NGG-3')  ·  interrogating seed sequence (positions 1–8)";
    summaryEl.textContent = "A single mismatch in the PAM-proximal seed region (positions 1–8) stalls directional R-loop zippering. Without full 20-nt duplex formation, REC3 cannot license HNH docking—so HNH stays locked at the conformational checkpoint and DNA remains uncut.";
  } else if (cut) {
    statusEl.textContent = "HNH + RuvC active  ·  blunt double-strand break at −3 nt upstream of PAM";
    summaryEl.textContent = "With the 20-nt R-loop complete and HNH docked on the target strand, HNH (His840) and RuvC (Asp10) cleave both strands 3 nucleotides upstream of the PAM, creating a blunt double-strand break while Cas9 stays bound to the DNA ends.";
  } else if (dock > 0.05) {
    statusEl.textContent = "R-loop complete (20/20 bp)  ·  REC3 licenses HNH docking onto TS (−3)";
    summaryEl.textContent = "Complete 20-bp guide RNA:target DNA pairing acts as an allosteric switch through REC3, releasing the HNH catalytic domain to swing across the cleft onto the target-strand scissile phosphate.";
  } else {
    statusEl.textContent = "PAM bound (5'-NGG-3')  ·  directional R-loop zippering (" + pairs + "/20 bp)  ·  HNH undocked";
    summaryEl.textContent = "After the PI domain recognizes the 5'-NGG-3' PAM, Cas9 melts the adjacent duplex and zippers the guide RNA onto the target strand from PAM-proximal (+1) toward PAM-distal (+20), displacing the non-target strand across RuvC.";
  }

  scrub.value = String(Math.round(p * 1000));
  pctEl.textContent = Math.round(p * 100) + "%";
}

function setFidelity(next) {
  fidelity = next;
  radios.forEach((r) => (r.checked = r.value === next));
  time = next === "mismatch" ? 3.2 : 0;
  if (!reduce.matches) setPlaying(true);
  render();
}

function tick(now) {
  frame = 0;
  if (!playing || !visible) return;
  const dt = Math.min(0.064, (now - (last || now)) / 1000);
  last = now;
  time = (time + dt) % DATA.duration;
  render();
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

radios.forEach((r) => r.addEventListener("change", () => { if (r.checked) setFidelity(r.value); }));
scrub.addEventListener("input", () => { time = (Number(scrub.value) / 1000) * DATA.duration; setPlaying(false); render(); });
pauseBtn.addEventListener("click", () => setPlaying(!playing));
replayBtn.addEventListener("click", () => { time = 0; setPlaying(!reduce.matches); render(); });
document.addEventListener("keydown", (e) => {
  if (e.target.closest("textarea, select")) return;
  if (e.code === "Space" && !e.target.closest("button, a, input")) { e.preventDefault(); setPlaying(!playing); return; }
  if (e.key === "1" && !e.target.closest("input")) setFidelity("match");
  if (e.key === "2" && !e.target.closest("input")) setFidelity("mismatch");
  if (e.key && e.key.toLowerCase() === "r" && !e.target.closest("input")) { time = 0; setPlaying(!reduce.matches); render(); }
});
reduce.addEventListener("change", () => setPlaying(!reduce.matches));
const idleInfo = infoEl.textContent;
svg.querySelectorAll(".hot").forEach((el) => {
  const on = () => { infoEl.textContent = el.dataset.info; el.classList.add("is-hot"); };
  const off = () => { infoEl.textContent = idleInfo; el.classList.remove("is-hot"); };
  el.addEventListener("pointerenter", on); el.addEventListener("pointerleave", off);
  el.addEventListener("focus", on); el.addEventListener("blur", off);
});
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }).observe(svg);
if (reduce.matches) { pauseBtn.textContent = "Play motion"; pauseBtn.setAttribute("aria-pressed", "true"); }
render();
start();
window.__cr = { setFidelity, setTime: (t) => { time = clamp(t, 0, DATA.duration); render(); }, setPlaying };
`;

const style = `
.cr-svg{padding:0}
.cr-fig{display:block;width:100%;height:auto}
.cr-halo{fill:var(--anatomy-halo);opacity:var(--anatomy-halo-opacity);filter:blur(16px)}
.cr-lobe-base{fill:var(--anatomy-shade-2);stroke:var(--anatomy-hi);stroke-width:1.15}
.cr-lobe-sub{fill:var(--anatomy-shade-3);stroke:var(--anatomy-mid);stroke-width:.9;transition:stroke .35s,filter .35s}
.cr-lobe-nuc{fill:var(--anatomy-shade-1);stroke:var(--anatomy-hi);stroke-width:1.15}
.cr-rec3.is-active{stroke:var(--anatomy-green);filter:drop-shadow(0 0 6px color-mix(in srgb,var(--anatomy-green) 45%,transparent))}
.cr-contour{fill:none;stroke:var(--anatomy-lo);stroke-width:.75;stroke-dasharray:4 4;opacity:.7}
.cr-bh-body{fill:none;stroke:var(--anatomy-face);stroke-width:11;stroke-linecap:round}
.cr-bh-core{fill:none;stroke:var(--anatomy-hi);stroke-width:1.2;stroke-linecap:round}
.cr-bh-ticks{fill:none;stroke:var(--anatomy-mid);stroke-width:.85;stroke-linecap:round}
.cr-pam-finger{stroke:var(--anatomy-red);stroke-width:1.5;stroke-linecap:round;opacity:.85}
.cr-pam-tip{fill:var(--anatomy-red)}
.cr-pam-frame{fill:color-mix(in srgb,var(--anatomy-red) 9%,transparent);stroke:var(--anatomy-red);stroke-width:1.15;stroke-dasharray:3 2}
.cr-pocket{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:1;transition:stroke .3s,filter .3s}
.cr-pocket.is-active{stroke:var(--anatomy-green);filter:drop-shadow(0 0 7px color-mix(in srgb,var(--anatomy-green) 55%,transparent))}
.cr-mg{fill:var(--anatomy-blue);stroke:var(--anatomy-lit);stroke-width:.75}
.cr-dna-ts{fill:none;stroke:var(--anatomy-hi);stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round;transition:opacity .25s}
.cr-dna-nts{fill:none;stroke:var(--anatomy-mid);stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;transition:opacity .25s}
.cr-dna-rung{stroke:var(--anatomy-lo);stroke-width:1.15;stroke-linecap:round}
.cr-rna-spacer{fill:none;stroke:var(--anatomy-blue);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.cr-rna-scaffold{fill:none;stroke:var(--anatomy-blue);stroke-width:1.8;stroke-linecap:round;opacity:.78}
.cr-stem-bar{stroke:var(--anatomy-blue);stroke-width:1.1;stroke-linecap:round;opacity:.55}
.cr-hybrid-rung{stroke:var(--anatomy-lo);stroke-width:1.1;stroke-linecap:round;opacity:.22;transition:opacity .15s,stroke .15s}
.cr-rung-dot{fill:var(--anatomy-lo);opacity:.22;transition:opacity .15s,fill .15s}
.cr-rung-wrap.is-lit .cr-hybrid-rung{stroke:var(--anatomy-blue);opacity:.95;stroke-width:1.45}
.cr-rung-wrap.is-lit .cr-rung-dot{fill:var(--anatomy-lit);opacity:.95}
.cr-rung-wrap.is-mm .cr-hybrid-rung{stroke:var(--anatomy-red);opacity:1;stroke-width:1.8;stroke-dasharray:2 2}
.cr-rung-wrap.is-mm .cr-rung-dot{fill:var(--anatomy-red);opacity:1}
.cr-scissile{fill:var(--anatomy-paper);stroke:var(--anatomy-red);stroke-width:1.4}
.cr-hnh-arc{fill:none;stroke:var(--anatomy-lo);stroke-width:1;stroke-dasharray:3 4}
.cr-hnh-body{fill:var(--anatomy-face);stroke:var(--anatomy-lit);stroke-width:1.4;transition:stroke .3s,filter .3s}
.cr-hnh-body.is-active{stroke:var(--anatomy-green);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--anatomy-green) 55%,transparent))}
.cr-hnh-body.is-locked{stroke:var(--anatomy-red);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--anatomy-red) 55%,transparent))}
.cr-hnh-tag{fill:var(--anatomy-strong);font:600 12px var(--anatomy-mono);pointer-events:none}
.cr-micro{fill:var(--anatomy-muted);font:10px var(--anatomy-mono);pointer-events:none}
.cr-mm-mark{opacity:0;transition:opacity .2s;pointer-events:none}
.cr-mm-halo{fill:color-mix(in srgb,var(--anatomy-red) 18%,var(--anatomy-paper));stroke:var(--anatomy-red);stroke-width:1.3}
.cr-mm-x{stroke:var(--anatomy-red);stroke-width:1.8;stroke-linecap:round}
.cr-cleave-fx{opacity:0;pointer-events:none}
.cr-cut-ring{fill:none;stroke:var(--anatomy-green);stroke-width:1.6}
.cr-cut-end{fill:var(--anatomy-green);font:600 10.5px var(--anatomy-mono)}
.cr-seq-pam-box{fill:color-mix(in srgb,var(--anatomy-red) 10%,var(--anatomy-face));stroke:var(--anatomy-red);stroke-width:1}
.cr-seq-pam-txt{fill:var(--anatomy-red);font:600 10.5px var(--anatomy-mono)}
.cr-seq-sub{fill:var(--anatomy-muted);font:9.5px var(--anatomy-mono)}
.cr-tile-bg{fill:var(--anatomy-face);stroke:var(--anatomy-faint);stroke-width:.85;transition:fill .15s,stroke .15s}
.cr-tile.is-seed .cr-tile-bg{stroke:var(--anatomy-lo)}
.cr-tile-rna{fill:var(--anatomy-muted);font:600 10.5px var(--anatomy-mono)}
.cr-tile-dna{fill:var(--anatomy-text);font:10.5px var(--anatomy-mono)}
.cr-tile.is-lit .cr-tile-bg{fill:color-mix(in srgb,var(--anatomy-blue) 16%,var(--anatomy-face));stroke:var(--anatomy-blue)}
.cr-tile.is-lit .cr-tile-rna{fill:var(--anatomy-blue)}
.cr-tile.is-lit .cr-tile-dna{fill:var(--anatomy-strong)}
.cr-tile.is-mm .cr-tile-bg{fill:color-mix(in srgb,var(--anatomy-red) 20%,var(--anatomy-face));stroke:var(--anatomy-red)}
.cr-tile.is-mm .cr-tile-rna,.cr-tile.is-mm .cr-tile-dna{fill:var(--anatomy-red)}
.cr-cut-caret{fill:var(--anatomy-green)}
.cr-cut-lbl{fill:var(--anatomy-green);font:600 9.5px var(--anatomy-mono)}
.cr-bracket{fill:none;stroke:var(--anatomy-mid);stroke-width:.85}
.cr-bracket-faint{stroke:var(--anatomy-faint)}
.cr-leader{fill:none;stroke:var(--anatomy-mid);stroke-width:.75}
.cr-dot{fill:var(--anatomy-dot)}
.cr-label{fill:var(--anatomy-text);font:11.5px var(--anatomy-mono);letter-spacing:.01em}
.cr-status{fill:var(--anatomy-strong);font:600 12.5px var(--anatomy-mono)}
.hot{cursor:help;outline:none}
.hot.is-hot{filter:drop-shadow(0 0 3px var(--anatomy-lit))}
.hot:focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.cr-controls{display:flex;flex-wrap:wrap;gap:12px 22px;align-items:center;margin:14px 2px 6px;font:12px var(--anatomy-mono);color:var(--anatomy-text)}
.cr-mode{display:flex;flex-wrap:wrap;gap:6px 16px;border:1px solid var(--anatomy-faint);padding:6px 12px 8px;margin:0}
.cr-mode legend{font:11px var(--anatomy-mono);color:var(--anatomy-muted);padding:0 6px}
.cr-mode label{cursor:pointer;color:var(--anatomy-strong)}
.cr-mode input{accent-color:var(--anatomy-lit);margin-right:5px}
.cr-scrub-wrap{display:inline-flex;align-items:center;gap:8px;flex:1;min-width:180px;max-width:300px}
.cr-scrub-wrap input{flex:1;accent-color:var(--anatomy-lit);cursor:pointer}
.cr-btns{display:flex;gap:8px;margin-left:auto}
.cr-controls button{border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);font:inherit;padding:6px 10px;cursor:pointer}
.cr-controls :focus-visible{outline:2px solid var(--anatomy-lit);outline-offset:3px}
.cr-summary{font:12.5px/1.55 var(--anatomy-mono);color:var(--anatomy-strong);margin:8px 2px;min-height:4.6em}
.cr-info{min-height:3.8em;font:12.5px/1.55 var(--anatomy-mono);color:var(--anatomy-text);margin:8px 2px;border-left:2px solid var(--anatomy-faint);padding-left:10px}
.bio-sources{margin:20px 2px;color:var(--anatomy-muted);font-size:12.5px;line-height:1.65}
.bio-sources h2{font:600 13px var(--anatomy-mono);color:var(--anatomy-text);margin:0 0 8px}
.bio-sources ul{padding-left:18px}.bio-sources li{margin:6px 0}
.bio-sources a{color:var(--anatomy-text);text-underline-offset:2px}
@media(prefers-reduced-motion:reduce){.cr-lobe-sub,.cr-pocket,.cr-hnh-body,.cr-hybrid-rung,.cr-tile-bg{transition:none}}
`;

const html = pageHtml({
  title: "CRISPR-Cas9 Target Recognition & Cleavage | Anima",
  theme: light ? "light" : "dark",
  width: WIDTH + 40,
  body: `<style>${BIO_CSS}${style}</style>${framed}${controls}${sources}`,
  script,
});

const filename = light ? "crispr-cas9-light.html" : "crispr-cas9.html";
writeFileSync(join(HERE, filename), html);
console.log(`wrote examples/crispr-cas9/${filename}`);
